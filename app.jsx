const { useState, useCallback, useRef, useEffect } = React;
const { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
  BorderStyle, WidthType, AlignmentType, VerticalAlign, ShadingType,
  PageBreak, HeadingLevel, convertInchesToTwip
} = docx;

// ============================================================
// VAELORIS COLOR PALETTE
// ============================================================
const COLORS = {
  deepSea: '2C5F7C',
  stormGray: '5A6978',
  copper: 'B87333',
  rustRed: 'A63D40',
  olive: '6B8E23',
  darkGray: '2D3748',
  lightBorder: 'C9D1D9',
  warmSand: 'F7F3EB',
  cream: 'FFFEF9',
  white: 'FFFFFF',
};

// ============================================================
// SIDEBAR STYLE MAPPING
// ============================================================
const SIDEBAR_STYLES = {
  'A': { label: "SCHOLAR'S NOTE", color: COLORS.deepSea },
  'B': { label: "FIELD NOTE", color: COLORS.copper },
  'D': { label: "WARDEN'S WARNING", color: COLORS.rustRed },
  'E': { label: "SCHOLAR'S NOTE", color: COLORS.deepSea },
  'F': { label: "FIELD NOTE", color: COLORS.copper },
  'L': { label: "SCHOLAR'S NOTE", color: COLORS.deepSea },
  'Q': { label: "SCHOLAR'S NOTE", color: COLORS.deepSea },
  'R': { label: "REGIONAL VARIATION", color: COLORS.stormGray },
  'S': { label: "WARDEN'S WARNING", color: COLORS.rustRed },
  'V': { label: "HEALER'S NOTE", color: COLORS.olive },
  'W': { label: "WARDEN'S WARNING", color: COLORS.rustRed },
};

// ============================================================
// DOCUMENT PARSER
// ============================================================
function parseMarkdownContent(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let isFirstParagraphAfterChapter = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Book title (# BOOK X or # Title)
    if (/^#\s+BOOK\s+/i.test(trimmed)) {
      const match = trimmed.match(/^#\s+BOOK\s+(\w+)[:\s]*(.*)$/i);
      if (match) {
        elements.push({ type: 'bookTitle', number: match[1], title: match[2] || '' });
      }
      i++;
      continue;
    }

    // Chapter header (## Chapter X: Title)
    if (/^##\s+Chapter\s+/i.test(trimmed)) {
      const match = trimmed.match(/^##\s+Chapter\s+(\d+)[:\s]*(.*)$/i);
      if (match) {
        elements.push({ type: 'chapter', number: match[1], title: match[2] || '' });
        isFirstParagraphAfterChapter = true;
      }
      i++;
      continue;
    }

    // Section headers
    if (trimmed.startsWith('####')) {
      elements.push({ type: 'header', level: 4, text: trimmed.replace(/^####\s*/, '') });
      i++;
      continue;
    }
    if (trimmed.startsWith('###')) {
      elements.push({ type: 'header', level: 3, text: trimmed.replace(/^###\s*/, '') });
      i++;
      continue;
    }
    if (trimmed.startsWith('##')) {
      elements.push({ type: 'header', level: 2, text: trimmed.replace(/^##\s*/, '') });
      i++;
      continue;
    }

    // Sidebar detection (**SIDEBAR [X]: ...)
    if (/^\*\*SIDEBAR\s*\[([A-Z])\]/i.test(trimmed)) {
      const sidebar = parseSidebar(lines, i);
      if (sidebar) {
        elements.push(sidebar.element);
        i = sidebar.endIndex;
        continue;
      }
    }

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const table = parseTable(lines, i);
      if (table) {
        elements.push(table.element);
        i = table.endIndex;
        continue;
      }
    }

    // Bullet points
    if (/^[-*]\s+/.test(trimmed)) {
      elements.push({ type: 'bullet', text: trimmed.replace(/^[-*]\s+/, '') });
      i++;
      continue;
    }

    // Definition lines (Term: value or **Term:** value)
    if (/^\*\*[^*]+\*\*:\s*/.test(trimmed) || /^[A-Z][^:]+:\s+/.test(trimmed)) {
      const defMatch = trimmed.match(/^\*\*([^*]+)\*\*:\s*(.*)$/) || trimmed.match(/^([^:]+):\s+(.*)$/);
      if (defMatch) {
        elements.push({ type: 'definition', term: defMatch[1], value: defMatch[2] });
        i++;
        continue;
      }
    }

    // Regular paragraph (with potential drop cap)
    if (isFirstParagraphAfterChapter && trimmed.length > 0 && /^[A-Z]/.test(trimmed)) {
      elements.push({ type: 'dropCapParagraph', text: trimmed });
      isFirstParagraphAfterChapter = false;
    } else {
      elements.push({ type: 'paragraph', text: trimmed });
    }
    i++;
  }

  return elements;
}

function parseSidebar(lines, startIndex) {
  const firstLine = lines[startIndex].trim();
  const headerMatch = firstLine.match(/^\*\*SIDEBAR\s*\[([A-Z])\]:\s*([^*]*)\*\*(?:\s*\(Reliability:\s*([^)]+)\))?/i);
  
  if (!headerMatch) return null;

  const code = headerMatch[1].toUpperCase();
  const title = headerMatch[2].trim();
  const reliability = headerMatch[3] || '';
  
  let source = '', compiledFrom = '', appliesTo = '', quote = '';
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (!line || line.startsWith('##') || line.startsWith('**SIDEBAR')) {
      break;
    }

    if (line.startsWith('Source:')) {
      source = line.replace('Source:', '').trim();
    } else if (line.startsWith('Compiled from:')) {
      compiledFrom = line.replace('Compiled from:', '').trim();
    } else if (line.startsWith('Applies to:')) {
      appliesTo = line.replace('Applies to:', '').trim();
    } else if (line.startsWith('_"') || line.startsWith('*"') || line.startsWith('"')) {
      quote = line.replace(/^[_*"]+|[_*"]+$/g, '');
    }
    
    i++;
  }

  return {
    element: {
      type: 'sidebar',
      code,
      title,
      reliability,
      source,
      compiledFrom,
      appliesTo,
      quote
    },
    endIndex: i
  };
}

function parseTable(lines, startIndex) {
  const rows = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i].trim();
    
    if (!line.startsWith('|')) break;
    
    // Skip separator row (|---|---|)
    if (/^\|[\s-:]+\|$/.test(line.replace(/\|/g, '|'))) {
      i++;
      continue;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    
    if (cells.length > 0) {
      rows.push(cells);
    }
    i++;
  }

  if (rows.length < 2) return null;

  return {
    element: {
      type: 'table',
      headers: rows[0],
      data: rows.slice(1)
    },
    endIndex: i
  };
}

// ============================================================
// DOCX GENERATOR
// ============================================================
function cleanMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\\_/g, '_')
    .replace(/---/g, '—')
    .replace(/--/g, '–');
}

function createTextRuns(text, defaultStyle = {}) {
  const runs = [];
  let remaining = text;

  // Process bold
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;
  let lastIndex = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({
        text: cleanMarkdown(text.slice(lastIndex, match.index)),
        ...defaultStyle
      }));
    }
    runs.push(new TextRun({
      text: cleanMarkdown(match[1]),
      bold: true,
      ...defaultStyle
    }));
    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({
      text: cleanMarkdown(text.slice(lastIndex)),
      ...defaultStyle
    }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({
      text: cleanMarkdown(text),
      ...defaultStyle
    }));
  }

  return runs;
}

function generateDocument(elements) {
  const children = [];

  for (const el of elements) {
    switch (el.type) {
      case 'bookTitle':
        // Ornament
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2500, after: 200 },
          children: [new TextRun({ text: '·  ◊  ·', color: COLORS.copper, size: 32 })]
        }));
        // Book number
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: `BOOK ${el.number}`, bold: true, color: COLORS.deepSea, size: 72 })]
        }));
        // Title
        if (el.title) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: el.title, italics: true, color: COLORS.stormGray, size: 44 })]
          }));
        }
        // Divider
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 },
          children: [new TextRun({ text: '─────────  ◊  ─────────', color: COLORS.copper })]
        }));
        break;

      case 'chapter':
        // Page break + ornament
        children.push(new Paragraph({
          children: [new PageBreak()]
        }));
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: '·  ◊  ·', color: COLORS.copper, size: 32 })]
        }));
        // Chapter number
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: `CHAPTER ${el.number}`, smallCaps: true, color: COLORS.stormGray, size: 24 })]
        }));
        // Chapter title
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new TextRun({ text: el.title, bold: true, color: COLORS.deepSea, size: 40 })]
        }));
        // Divider
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 300 },
          children: [new TextRun({ text: '─────────  ◊  ─────────', color: COLORS.copper })]
        }));
        break;

      case 'header':
        const headerColors = { 2: COLORS.deepSea, 3: COLORS.deepSea, 4: COLORS.stormGray };
        const headerSizes = { 2: 30, 3: 24, 4: 22 };
        children.push(new Paragraph({
          spacing: { before: el.level === 2 ? 360 : 280, after: el.level === 2 ? 180 : 140 },
          children: [new TextRun({
            text: cleanMarkdown(el.text),
            bold: true,
            color: headerColors[el.level],
            size: headerSizes[el.level]
          })]
        }));
        break;

      case 'dropCapParagraph':
        const firstLetter = el.text[0];
        const restOfText = el.text.slice(1);
        children.push(new Paragraph({
          spacing: { after: 240 },
          children: [
            new TextRun({ text: firstLetter, bold: true, color: COLORS.deepSea, size: 72 }),
            ...createTextRuns(restOfText, { color: COLORS.darkGray, size: 24 })
          ]
        }));
        break;

      case 'paragraph':
        children.push(new Paragraph({
          spacing: { after: 240 },
          children: createTextRuns(el.text, { color: COLORS.darkGray, size: 24 })
        }));
        break;

      case 'bullet':
        children.push(new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '• ', color: COLORS.copper, size: 24 }),
            ...createTextRuns(el.text, { color: COLORS.darkGray, size: 24 })
          ]
        }));
        break;

      case 'definition':
        children.push(new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: el.term + ': ', bold: true, color: COLORS.deepSea, size: 24 }),
            new TextRun({ text: cleanMarkdown(el.value), color: COLORS.darkGray, size: 24 })
          ]
        }));
        break;

      case 'sidebar':
        const style = SIDEBAR_STYLES[el.code] || { label: 'NOTE', color: COLORS.deepSea };
        const sidebarRows = [];

        // Header row with label
        const headerCells = [new Paragraph({
          children: [
            new TextRun({ text: '◊ ', color: style.color, size: 24 }),
            new TextRun({ text: style.label, bold: true, smallCaps: true, color: style.color, size: 22 })
          ]
        })];

        if (el.title && el.title.toUpperCase() !== style.label) {
          headerCells.push(new Paragraph({
            spacing: { before: 40 },
            children: [new TextRun({ text: el.title, bold: true, color: COLORS.darkGray, size: 20 })]
          }));
        }

        if (el.source) {
          headerCells.push(new Paragraph({
            spacing: { before: 40 },
            children: [
              new TextRun({ text: 'Source: ', bold: true, color: COLORS.darkGray, size: 20 }),
              new TextRun({ text: el.source, color: COLORS.darkGray, size: 20 })
            ]
          }));
        }

        if (el.reliability) {
          headerCells.push(new Paragraph({
            spacing: { before: 40 },
            children: [
              new TextRun({ text: 'Reliability: ', bold: true, color: COLORS.darkGray, size: 20 }),
              new TextRun({ text: el.reliability, color: COLORS.darkGray, size: 20 })
            ]
          }));
        }

        if (el.quote) {
          headerCells.push(new Paragraph({
            spacing: { before: 60 },
            children: [new TextRun({ text: `"${cleanMarkdown(el.quote)}"`, italics: true, color: COLORS.darkGray, size: 22 })]
          }));
        }

        children.push(new Paragraph({ spacing: { after: 120 } }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: COLORS.warmSand, type: ShadingType.CLEAR },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 24, color: style.color },
                    left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.lightBorder },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.lightBorder },
                    right: { style: BorderStyle.SINGLE, size: 6, color: COLORS.lightBorder },
                  },
                  margins: { top: 120, left: 200, bottom: 120, right: 200 },
                  children: headerCells
                })
              ]
            })
          ]
        }));
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;

      case 'table':
        const tableRows = [];
        
        // Header row
        tableRows.push(new TableRow({
          tableHeader: true,
          children: el.headers.map(h => new TableCell({
            shading: { fill: COLORS.deepSea, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: cleanMarkdown(h), bold: true, color: COLORS.white, size: 20 })]
            })]
          }))
        }));

        // Data rows
        el.data.forEach((row, idx) => {
          const bgColor = idx % 2 === 0 ? COLORS.cream : COLORS.warmSand;
          tableRows.push(new TableRow({
            children: row.map(cell => new TableCell({
              shading: { fill: bgColor, type: ShadingType.CLEAR },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: cleanMarkdown(cell), color: COLORS.darkGray, size: 20 })]
              })]
            }))
          }));
        });

        children.push(new Paragraph({ spacing: { after: 120 } }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows
        }));
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
    }
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          }
        }
      },
      children
    }]
  });
}

// ============================================================
// REACT COMPONENTS
// ============================================================

function App() {
  const [file, setFile] = useState(null);
  const [content, setContent] = useState('');
  const [elements, setElements] = useState([]);
  const [status, setStatus] = useState('idle');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = useCallback(async (selectedFile) => {
    setFile(selectedFile);
    setStatus('parsing');

    try {
      if (selectedFile.name.endsWith('.docx')) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setContent(result.value);
        const parsed = parseMarkdownContent(result.value);
        setElements(parsed);
      } else if (selectedFile.name.endsWith('.md') || selectedFile.name.endsWith('.txt')) {
        const text = await selectedFile.text();
        setContent(text);
        const parsed = parseMarkdownContent(text);
        setElements(parsed);
      }
      setStatus('ready');
    } catch (error) {
      console.error('Error processing file:', error);
      setStatus('error');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleFileChange = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  }, [processFile]);

  const handleGenerate = useCallback(async () => {
    setStatus('generating');
    
    try {
      const doc = generateDocument(elements);
      const blob = await Packer.toBlob(doc);
      const fileName = file.name.replace(/\.[^/.]+$/, '') + '_VAELORIS.docx';
      saveAs(blob, fileName);
      setStatus('complete');
    } catch (error) {
      console.error('Error generating document:', error);
      setStatus('error');
    }
  }, [elements, file]);

  const handleReset = useCallback(() => {
    setFile(null);
    setContent('');
    setElements([]);
    setStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.ornament}>·  ◊  ·</div>
        <h1 style={styles.title}>Vaeloris Document Forge</h1>
        <p style={styles.subtitle}>Transform your manuscripts with the aesthetic of The Bonded Path</p>
        <div style={styles.divider}>─────────  ◊  ─────────</div>
      </header>

      <main style={styles.main}>
        {status === 'idle' && (
          <div
            style={{
              ...styles.dropzone,
              ...(dragActive ? styles.dropzoneActive : {})
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.md,.txt"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <div style={styles.dropzoneIcon}>◊</div>
            <h3 style={styles.dropzoneTitle}>Drop your manuscript here</h3>
            <p style={styles.dropzoneText}>
              Accepts .docx, .md, or .txt files
            </p>
            <div style={styles.dropzoneHint}>or click to browse</div>
          </div>
        )}

        {(status === 'parsing' || status === 'generating') && (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}>◊</div>
            <p style={styles.loadingText}>
              {status === 'parsing' ? 'Parsing your manuscript...' : 'Forging your document...'}
            </p>
          </div>
        )}

        {status === 'ready' && (
          <div style={styles.previewContainer}>
            <div style={styles.fileInfo}>
              <div style={styles.fileIcon}>📜</div>
              <div>
                <div style={styles.fileName}>{file?.name}</div>
                <div style={styles.fileStats}>
                  {elements.length} elements detected
                </div>
              </div>
            </div>

            <div style={styles.preview}>
              <h4 style={styles.previewTitle}>Preview</h4>
              <div style={styles.previewContent}>
                {elements.slice(0, 10).map((el, i) => (
                  <div key={i} style={styles.previewItem}>
                    <span style={styles.previewType}>{el.type}</span>
                    <span style={styles.previewText}>
                      {el.title || el.text || el.term || `${el.headers?.length || 0} columns`}
                    </span>
                  </div>
                ))}
                {elements.length > 10 && (
                  <div style={styles.previewMore}>
                    ...and {elements.length - 10} more elements
                  </div>
                )}
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button style={styles.secondaryButton} onClick={handleReset}>
                ← Choose Different File
              </button>
              <button style={styles.primaryButton} onClick={handleGenerate}>
                ◊ Forge Document
              </button>
            </div>
          </div>
        )}

        {status === 'complete' && (
          <div style={styles.successContainer}>
            <div style={styles.successIcon}>✓</div>
            <h3 style={styles.successTitle}>Document Forged!</h3>
            <p style={styles.successText}>
              Your styled document has been downloaded.
            </p>
            <button style={styles.primaryButton} onClick={handleReset}>
              ◊ Forge Another
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.errorContainer}>
            <div style={styles.errorIcon}>✕</div>
            <h3 style={styles.errorTitle}>Something went wrong</h3>
            <p style={styles.errorText}>
              There was an error processing your file.
            </p>
            <button style={styles.primaryButton} onClick={handleReset}>
              Try Again
            </button>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerOrnament}>◊</div>
        <p style={styles.footerText}>
          Styles: Deep Sea Teal · Copper Accents · Storm Gray · Warm Sand
        </p>
      </footer>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    zIndex: 1,
  },
  header: {
    textAlign: 'center',
    padding: '60px 20px 40px',
  },
  ornament: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '24px',
    color: '#B87333',
    marginBottom: '16px',
    animation: 'float 3s ease-in-out infinite',
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '48px',
    fontWeight: 700,
    color: '#2C5F7C',
    marginBottom: '12px',
    letterSpacing: '2px',
  },
  subtitle: {
    fontFamily: "'Raleway', sans-serif",
    fontSize: '16px',
    color: '#5A6978',
    fontWeight: 400,
    marginBottom: '24px',
  },
  divider: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '14px',
    color: '#B87333',
    letterSpacing: '4px',
  },
  main: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '20px',
  },
  dropzone: {
    width: '100%',
    maxWidth: '500px',
    padding: '60px 40px',
    borderRadius: '16px',
    border: '2px dashed #C9D1D9',
    backgroundColor: 'rgba(255, 254, 249, 0.8)',
    backdropFilter: 'blur(10px)',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    animation: 'fadeInUp 0.6s ease-out',
  },
  dropzoneActive: {
    borderColor: '#2C5F7C',
    backgroundColor: 'rgba(44, 95, 124, 0.05)',
    transform: 'scale(1.02)',
  },
  dropzoneIcon: {
    fontSize: '48px',
    color: '#B87333',
    marginBottom: '20px',
    animation: 'float 2s ease-in-out infinite',
  },
  dropzoneTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '24px',
    fontWeight: 600,
    color: '#2C5F7C',
    marginBottom: '8px',
  },
  dropzoneText: {
    fontSize: '14px',
    color: '#5A6978',
    marginBottom: '16px',
  },
  dropzoneHint: {
    fontSize: '12px',
    color: '#B87333',
    fontStyle: 'italic',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '60px',
    animation: 'fadeInUp 0.4s ease-out',
  },
  loadingSpinner: {
    fontSize: '48px',
    color: '#B87333',
    animation: 'pulse 1.5s ease-in-out infinite',
    marginBottom: '24px',
  },
  loadingText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '20px',
    color: '#5A6978',
  },
  previewContainer: {
    width: '100%',
    maxWidth: '600px',
    animation: 'fadeInUp 0.6s ease-out',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    backgroundColor: 'rgba(255, 254, 249, 0.9)',
    borderRadius: '12px',
    marginBottom: '20px',
    boxShadow: '0 4px 20px rgba(44, 95, 124, 0.08)',
  },
  fileIcon: {
    fontSize: '32px',
  },
  fileName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '18px',
    fontWeight: 600,
    color: '#2C5F7C',
  },
  fileStats: {
    fontSize: '13px',
    color: '#5A6978',
  },
  preview: {
    backgroundColor: 'rgba(255, 254, 249, 0.9)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
    boxShadow: '0 4px 20px rgba(44, 95, 124, 0.08)',
  },
  previewTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '16px',
    fontWeight: 600,
    color: '#2C5F7C',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #C9D1D9',
  },
  previewContent: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  previewItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid rgba(201, 209, 217, 0.3)',
  },
  previewType: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#FFFFFF',
    backgroundColor: '#2C5F7C',
    padding: '2px 8px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  previewText: {
    fontSize: '13px',
    color: '#5A6978',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  previewMore: {
    fontSize: '12px',
    color: '#B87333',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingTop: '12px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  primaryButton: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '16px',
    fontWeight: 600,
    color: '#FFFFFF',
    backgroundColor: '#2C5F7C',
    border: 'none',
    padding: '14px 32px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(44, 95, 124, 0.3)',
  },
  secondaryButton: {
    fontFamily: "'Raleway', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#5A6978',
    backgroundColor: 'transparent',
    border: '1px solid #C9D1D9',
    padding: '12px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  successContainer: {
    textAlign: 'center',
    padding: '60px',
    animation: 'fadeInUp 0.6s ease-out',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#6B8E23',
    color: '#FFFFFF',
    fontSize: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  successTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '28px',
    fontWeight: 600,
    color: '#2C5F7C',
    marginBottom: '8px',
  },
  successText: {
    fontSize: '14px',
    color: '#5A6978',
    marginBottom: '24px',
  },
  errorContainer: {
    textAlign: 'center',
    padding: '60px',
    animation: 'fadeInUp 0.6s ease-out',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#A63D40',
    color: '#FFFFFF',
    fontSize: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
  },
  errorTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '28px',
    fontWeight: 600,
    color: '#A63D40',
    marginBottom: '8px',
  },
  errorText: {
    fontSize: '14px',
    color: '#5A6978',
    marginBottom: '24px',
  },
  footer: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  footerOrnament: {
    fontSize: '16px',
    color: '#B87333',
    marginBottom: '12px',
  },
  footerText: {
    fontSize: '12px',
    color: '#5A6978',
    letterSpacing: '1px',
  },
};

ReactDOM.render(<App />, document.getElementById('root'));
