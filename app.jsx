const { useState, useCallback, useRef } = React;
const { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
  BorderStyle, WidthType, AlignmentType, VerticalAlign, ShadingType,
  PageBreak, convertInchesToTwip
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
// DOCX PARSER - Extracts structure from Word XML
// ============================================================
async function parseDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(documentXml, 'text/xml');
  
  const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  
  const elements = [];
  
  // Get the document body
  const body = xmlDoc.getElementsByTagNameNS(NS, 'body')[0];
  if (!body) return elements;
  
  // Helper to extract text from an element
  const extractText = (el) => {
    const textNodes = el.getElementsByTagNameNS(NS, 't');
    let text = '';
    for (let t of textNodes) text += t.textContent || '';
    return text.trim();
  };
  
  // Helper to parse a Word table
  const parseWordTable = (tbl) => {
    const rows = tbl.getElementsByTagNameNS(NS, 'tr');
    const tableData = [];
    
    for (let row of rows) {
      const cells = row.getElementsByTagNameNS(NS, 'tc');
      const rowData = [];
      for (let cell of cells) {
        rowData.push(extractText(cell));
      }
      if (rowData.some(c => c)) tableData.push(rowData);
    }
    
    if (tableData.length >= 2) {
      return {
        type: 'table',
        headers: tableData[0],
        data: tableData.slice(1)
      };
    }
    return null;
  };
  
  // Iterate through body children (paragraphs AND tables)
  const bodyChildren = body.childNodes;
  
  let isFirstParagraphAfterChapter = false;
  let currentSidebar = null;
  
  for (let i = 0; i < bodyChildren.length; i++) {
    const node = bodyChildren[i];
    
    // Handle Word tables
    if (node.localName === 'tbl') {
      // Finish any pending sidebar
      if (currentSidebar) {
        elements.push(currentSidebar);
        currentSidebar = null;
      }
      
      const tableEl = parseWordTable(node);
      if (tableEl) elements.push(tableEl);
      continue;
    }
    
    // Only process paragraph elements
    if (node.localName !== 'p') continue;
    
    const para = node;
    
    // Get paragraph style
    const pStyleEl = para.getElementsByTagNameNS(NS, 'pStyle')[0];
    const style = pStyleEl ? pStyleEl.getAttribute('w:val') : 'BodyText';
    
    // Get all text content
    const text = extractText(para);
    
    if (!text) continue;
    
    // Check for sidebar start pattern in any paragraph
    const sidebarMatch = text.match(/^SIDEBAR\s*\[([A-Z])\]:\s*(.+?)(?:\s*\(Reliability:\s*([^)]+)\))?$/i);
    if (sidebarMatch) {
      // Save any previous sidebar
      if (currentSidebar) {
        elements.push(currentSidebar);
      }
      currentSidebar = {
        type: 'sidebar',
        code: sidebarMatch[1].toUpperCase(),
        title: sidebarMatch[2].trim(),
        reliability: sidebarMatch[3] || '',
        source: '',
        compiledFrom: '',
        appliesTo: '',
        quote: ''
      };
      continue;
    }
    
    // If we're in a sidebar, collect its content
    if (currentSidebar) {
      if (text.startsWith('Source:')) {
        currentSidebar.source = text.replace('Source:', '').trim();
        continue;
      } else if (text.startsWith('Compiled from:')) {
        currentSidebar.compiledFrom = text.replace('Compiled from:', '').trim();
        continue;
      } else if (text.startsWith('Applies to:')) {
        currentSidebar.appliesTo = text.replace('Applies to:', '').trim();
        continue;
      } else if (text.startsWith('"') || text.startsWith('"') || text.startsWith("'")) {
        currentSidebar.quote = text.replace(/^["'"]+|["'"]+$/g, '');
        // End sidebar after quote
        elements.push(currentSidebar);
        currentSidebar = null;
        continue;
      } else if (style === 'Heading2' || style === 'Heading3' || text.match(/^Chapter\s+\d+:/i)) {
        // New section started, end sidebar
        elements.push(currentSidebar);
        currentSidebar = null;
        // Fall through to process this element
      } else {
        // Might be continuation or quote without quotes
        if (!currentSidebar.quote && !text.startsWith('Principle')) {
          currentSidebar.quote = text;
          elements.push(currentSidebar);
          currentSidebar = null;
          continue;
        }
      }
    }
    
    // Process by Word style
    if (style === 'Heading1' || text.match(/^BOOK\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)/i)) {
      const bookMatch = text.match(/^BOOK\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)[:\s]*(.*)$/i);
      if (bookMatch) {
        elements.push({ 
          type: 'bookTitle', 
          number: bookMatch[1], 
          title: bookMatch[2] || '' 
        });
      } else {
        elements.push({ type: 'bookTitle', number: '', title: text });
      }
      continue;
    }
    
    // Chapter detection
    const chapterMatch = text.match(/^Chapter\s+(\d+)[:\s]*(.*)$/i);
    if (chapterMatch || (style === 'Heading2' && text.toLowerCase().includes('chapter'))) {
      if (chapterMatch) {
        elements.push({ 
          type: 'chapter', 
          number: chapterMatch[1], 
          title: chapterMatch[2] || '' 
        });
      } else {
        elements.push({ type: 'chapter', number: '', title: text });
      }
      isFirstParagraphAfterChapter = true;
      continue;
    }
    
    // Subtitle (Heading2 that's not a chapter)
    if (style === 'Heading2' && !text.toLowerCase().includes('chapter')) {
      elements.push({ type: 'subtitle', text: text });
      continue;
    }
    
    // Section headers (Heading3, Heading4)
    if (style === 'Heading3') {
      elements.push({ type: 'header', level: 3, text: text });
      continue;
    }
    if (style === 'Heading4') {
      elements.push({ type: 'header', level: 4, text: text });
      continue;
    }
    
    // Check for table rows (markdown-style pipes) - only for .md/.txt files
    // Word tables are handled above as <w:tbl> elements
    
    // Bullet points
    if (text.match(/^[\d]+\.\s+/) || text.match(/^[-•]\s+/)) {
      elements.push({ 
        type: 'bullet', 
        text: text.replace(/^[\d]+\.\s+/, '').replace(/^[-•]\s+/, '') 
      });
      continue;
    }
    
    // Definition pattern (Term: value)
    const defMatch = text.match(/^([A-Z][^:]{2,30}):\s+(.+)$/);
    if (defMatch && !text.includes('SIDEBAR')) {
      elements.push({ type: 'definition', term: defMatch[1], value: defMatch[2] });
      continue;
    }
    
    // First paragraph after chapter gets drop cap
    if ((style === 'FirstParagraph' || isFirstParagraphAfterChapter) && /^[A-Z]/.test(text)) {
      elements.push({ type: 'dropCapParagraph', text: text });
      isFirstParagraphAfterChapter = false;
      continue;
    }
    
    // Regular paragraph
    elements.push({ type: 'paragraph', text: text });
  }
  
  // Don't forget any trailing sidebar
  if (currentSidebar) {
    elements.push(currentSidebar);
  }
  
  return elements;
}

// ============================================================
// MARKDOWN PARSER (for .md and .txt files)
// ============================================================
function parseMarkdownContent(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let isFirstParagraphAfterChapter = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Book title
    if (/^#\s+BOOK\s+/i.test(trimmed)) {
      const match = trimmed.match(/^#\s+BOOK\s+(\w+)[:\s]*(.*)$/i);
      if (match) elements.push({ type: 'bookTitle', number: match[1], title: match[2] || '' });
      i++; continue;
    }

    // Chapter header
    if (/^##\s+Chapter\s+/i.test(trimmed)) {
      const match = trimmed.match(/^##\s+Chapter\s+(\d+)[:\s]*(.*)$/i);
      if (match) {
        elements.push({ type: 'chapter', number: match[1], title: match[2] || '' });
        isFirstParagraphAfterChapter = true;
      }
      i++; continue;
    }

    // Headers
    if (trimmed.startsWith('####')) {
      elements.push({ type: 'header', level: 4, text: trimmed.replace(/^####\s*/, '') });
      i++; continue;
    }
    if (trimmed.startsWith('###')) {
      elements.push({ type: 'header', level: 3, text: trimmed.replace(/^###\s*/, '') });
      i++; continue;
    }
    if (trimmed.startsWith('##')) {
      elements.push({ type: 'header', level: 2, text: trimmed.replace(/^##\s*/, '') });
      i++; continue;
    }

    // Sidebar with markdown markers
    if (/^\*\*SIDEBAR\s*\[([A-Z])\]/i.test(trimmed)) {
      const headerMatch = trimmed.match(/^\*\*SIDEBAR\s*\[([A-Z])\]:\s*([^*]*)\*\*(?:\s*\(Reliability:\s*([^)]+)\))?/i);
      if (headerMatch) {
        const sidebar = {
          type: 'sidebar',
          code: headerMatch[1].toUpperCase(),
          title: headerMatch[2].trim(),
          reliability: headerMatch[3] || '',
          source: '', compiledFrom: '', appliesTo: '', quote: ''
        };
        i++;
        while (i < lines.length) {
          const sLine = lines[i].trim();
          if (!sLine || sLine.startsWith('##') || sLine.startsWith('**SIDEBAR')) break;
          if (sLine.startsWith('Source:')) sidebar.source = sLine.replace('Source:', '').trim();
          else if (sLine.startsWith('Compiled from:')) sidebar.compiledFrom = sLine.replace('Compiled from:', '').trim();
          else if (sLine.startsWith('Applies to:')) sidebar.appliesTo = sLine.replace('Applies to:', '').trim();
          else if (sLine.startsWith('_"') || sLine.startsWith('*"') || sLine.startsWith('"')) {
            sidebar.quote = sLine.replace(/^[_*"]+|[_*"]+$/g, '');
          }
          i++;
        }
        elements.push(sidebar);
        continue;
      }
    }

    // Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rows = [];
      while (i < lines.length) {
        const tLine = lines[i].trim();
        if (!tLine.startsWith('|')) break;
        if (!/^\|[\s-:]+\|$/.test(tLine.replace(/\|/g, '|'))) {
          const cells = tLine.split('|').slice(1, -1).map(c => c.trim());
          if (cells.length > 0) rows.push(cells);
        }
        i++;
      }
      if (rows.length >= 2) elements.push({ type: 'table', headers: rows[0], data: rows.slice(1) });
      continue;
    }

    // Bullet
    if (/^[-*]\s+/.test(trimmed)) {
      elements.push({ type: 'bullet', text: trimmed.replace(/^[-*]\s+/, '') });
      i++; continue;
    }

    // Definition
    if (/^\*\*[^*]+\*\*:\s*/.test(trimmed)) {
      const defMatch = trimmed.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
      if (defMatch) {
        elements.push({ type: 'definition', term: defMatch[1], value: defMatch[2] });
        i++; continue;
      }
    }

    // Drop cap paragraph
    if (isFirstParagraphAfterChapter && /^[A-Z]/.test(trimmed)) {
      elements.push({ type: 'dropCapParagraph', text: trimmed });
      isFirstParagraphAfterChapter = false;
    } else {
      elements.push({ type: 'paragraph', text: trimmed });
    }
    i++;
  }
  return elements;
}

// ============================================================
// DOCX GENERATOR
// ============================================================
function cleanText(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/---/g, '—')
    .replace(/--/g, '–');
}

function generateDocument(elements) {
  const children = [];

  for (const el of elements) {
    switch (el.type) {
      case 'bookTitle':
        // Ornament
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1500, after: 200 },
          children: [new TextRun({ text: '·  ◊  ·', color: COLORS.copper, size: 32 })]
        }));
        // Book number
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ 
            text: el.number ? `BOOK ${el.number.toUpperCase()}` : el.title, 
            bold: true, 
            color: COLORS.deepSea, 
            size: 72 
          })]
        }));
        // Title if separate
        if (el.number && el.title) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: cleanText(el.title), italics: true, color: COLORS.stormGray, size: 44 })]
          }));
        }
        // Divider
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 },
          children: [new TextRun({ text: '─────────  ◊  ─────────', color: COLORS.copper, size: 20 })]
        }));
        break;

      case 'subtitle':
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: cleanText(el.text), color: COLORS.stormGray, size: 28 })]
        }));
        break;

      case 'chapter':
        // Page break
        children.push(new Paragraph({ children: [new PageBreak()] }));
        // Ornament
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: '·  ◊  ·', color: COLORS.copper, size: 32 })]
        }));
        // Chapter number
        if (el.number) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: `CHAPTER ${el.number}`, smallCaps: true, color: COLORS.stormGray, size: 24 })]
          }));
        }
        // Chapter title
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new TextRun({ text: cleanText(el.title), bold: true, color: COLORS.deepSea, size: 40 })]
        }));
        // Divider
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 300 },
          children: [new TextRun({ text: '─────────  ◊  ─────────', color: COLORS.copper, size: 20 })]
        }));
        break;

      case 'header':
        const headerSizes = { 2: 30, 3: 30, 4: 22 };
        const headerColors = { 2: COLORS.deepSea, 3: COLORS.deepSea, 4: COLORS.stormGray };
        children.push(new Paragraph({
          spacing: { before: 360, after: 180 },
          children: [new TextRun({
            text: cleanText(el.text),
            bold: true,
            color: headerColors[el.level] || COLORS.deepSea,
            size: headerSizes[el.level] || 24
          })]
        }));
        break;

      case 'dropCapParagraph':
        const firstLetter = el.text[0];
        const restOfText = el.text.slice(1);
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 240 },
          children: [
            new TextRun({ text: firstLetter, bold: true, color: COLORS.deepSea, size: 72 }),
            new TextRun({ text: cleanText(restOfText), color: COLORS.darkGray, size: 24 })
          ]
        }));
        break;

      case 'paragraph':
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 240 },
          children: [new TextRun({ text: cleanText(el.text), color: COLORS.darkGray, size: 24 })]
        }));
        break;

      case 'bullet':
        children.push(new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: '• ', color: COLORS.copper, size: 24 }),
            new TextRun({ text: cleanText(el.text), color: COLORS.darkGray, size: 24 })
          ]
        }));
        break;

      case 'definition':
        children.push(new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: el.term + ': ', bold: true, color: COLORS.deepSea, size: 24 }),
            new TextRun({ text: cleanText(el.value), color: COLORS.darkGray, size: 24 })
          ]
        }));
        break;

      case 'sidebar':
        const style = SIDEBAR_STYLES[el.code] || { label: 'NOTE', color: COLORS.deepSea };
        const sidebarContent = [];

        // Header with diamond and label
        sidebarContent.push(new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: '◊ ', color: style.color, size: 24 }),
            new TextRun({ text: style.label, bold: true, smallCaps: true, color: style.color, size: 22 })
          ]
        }));

        // Title if different
        if (el.title && el.title.toUpperCase() !== style.label) {
          sidebarContent.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: cleanText(el.title), bold: true, color: COLORS.darkGray, size: 20 })]
          }));
        }

        // Source
        if (el.source) {
          sidebarContent.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Source: ', bold: true, color: COLORS.darkGray, size: 20 }),
              new TextRun({ text: cleanText(el.source), color: COLORS.darkGray, size: 20 })
            ]
          }));
        }

        // Reliability
        if (el.reliability) {
          sidebarContent.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Reliability: ', bold: true, color: COLORS.darkGray, size: 20 }),
              new TextRun({ text: cleanText(el.reliability), color: COLORS.darkGray, size: 20 })
            ]
          }));
        }

        // Compiled from
        if (el.compiledFrom) {
          sidebarContent.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Compiled from: ', bold: true, color: COLORS.darkGray, size: 20 }),
              new TextRun({ text: cleanText(el.compiledFrom), color: COLORS.darkGray, size: 20 })
            ]
          }));
        }

        // Applies to
        if (el.appliesTo) {
          sidebarContent.push(new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: 'Applies to: ', bold: true, color: COLORS.darkGray, size: 20 }),
              new TextRun({ text: cleanText(el.appliesTo), color: COLORS.darkGray, size: 20 })
            ]
          }));
        }

        // Quote
        if (el.quote) {
          sidebarContent.push(new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ 
              text: `"${cleanText(el.quote)}"`, 
              italics: true, 
              color: COLORS.darkGray, 
              size: 22 
            })]
          }));
        }

        // Add spacing before sidebar
        children.push(new Paragraph({ spacing: { after: 120 } }));
        
        // Create sidebar table
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
                  margins: { 
                    top: convertInchesToTwip(0.08), 
                    left: convertInchesToTwip(0.14), 
                    bottom: convertInchesToTwip(0.08), 
                    right: convertInchesToTwip(0.14) 
                  },
                  children: sidebarContent
                })
              ]
            })
          ]
        }));
        
        // Spacing after sidebar
        children.push(new Paragraph({ spacing: { after: 200 } }));
        break;

      case 'table':
        const tableRows = [];
        
        // Header row
        tableRows.push(new TableRow({
          tableHeader: true,
          children: el.headers.map(h => new TableCell({
            shading: { fill: COLORS.deepSea, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 8, color: COLORS.deepSea },
              left: { style: BorderStyle.SINGLE, size: 8, color: COLORS.deepSea },
              bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.deepSea },
              right: { style: BorderStyle.SINGLE, size: 8, color: COLORS.deepSea },
            },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: cleanText(h), bold: true, color: COLORS.white, size: 20 })]
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
                children: [new TextRun({ text: cleanText(cell), color: COLORS.darkGray, size: 20 })]
              })]
            }))
          }));
        });

        children.push(new Paragraph({ spacing: { after: 120 } }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows
        }));
        children.push(new Paragraph({ spacing: { after: 200 } }));
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
// REACT APP
// ============================================================
function App() {
  const [file, setFile] = useState(null);
  const [elements, setElements] = useState([]);
  const [status, setStatus] = useState('idle');
  const [dragActive, setDragActive] = useState(false);
  const [parseLog, setParseLog] = useState([]);
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
    setParseLog([]);

    try {
      let parsed;
      const log = [];
      
      if (selectedFile.name.endsWith('.docx')) {
        log.push('Detected .docx file - parsing Word structure...');
        parsed = await parseDocxFile(selectedFile);
        log.push(`Found ${parsed.length} elements`);
      } else if (selectedFile.name.endsWith('.md') || selectedFile.name.endsWith('.txt')) {
        log.push('Detected text file - parsing markdown...');
        const text = await selectedFile.text();
        parsed = parseMarkdownContent(text);
        log.push(`Found ${parsed.length} elements`);
      } else {
        throw new Error('Unsupported file type');
      }

      // Count element types
      const typeCounts = {};
      parsed.forEach(el => {
        typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
      });
      Object.entries(typeCounts).forEach(([type, count]) => {
        log.push(`  • ${count} ${type}${count > 1 ? 's' : ''}`);
      });

      setParseLog(log);
      setElements(parsed);
      setStatus('ready');
    } catch (error) {
      console.error('Error processing file:', error);
      setParseLog([`Error: ${error.message}`]);
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
    setElements([]);
    setStatus('idle');
    setParseLog([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            style={{ ...styles.dropzone, ...(dragActive ? styles.dropzoneActive : {}) }}
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
            <p style={styles.dropzoneText}>Accepts .docx, .md, or .txt files</p>
            <div style={styles.dropzoneHint}>or click to browse</div>
          </div>
        )}

        {status === 'parsing' && (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}>◊</div>
            <p style={styles.loadingText}>Parsing your manuscript...</p>
          </div>
        )}

        {status === 'generating' && (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}>◊</div>
            <p style={styles.loadingText}>Forging your document...</p>
          </div>
        )}

        {status === 'ready' && (
          <div style={styles.previewContainer}>
            <div style={styles.fileInfo}>
              <div style={styles.fileIcon}>📜</div>
              <div>
                <div style={styles.fileName}>{file?.name}</div>
                <div style={styles.fileStats}>{elements.length} elements detected</div>
              </div>
            </div>

            <div style={styles.logBox}>
              <h4 style={styles.logTitle}>Parse Log</h4>
              {parseLog.map((line, i) => (
                <div key={i} style={styles.logLine}>{line}</div>
              ))}
            </div>

            <div style={styles.preview}>
              <h4 style={styles.previewTitle}>Structure Preview</h4>
              <div style={styles.previewContent}>
                {elements.slice(0, 15).map((el, i) => (
                  <div key={i} style={styles.previewItem}>
                    <span style={{
                      ...styles.previewType,
                      backgroundColor: el.type === 'sidebar' ? COLORS.copper :
                                       el.type === 'chapter' ? COLORS.deepSea :
                                       el.type === 'bookTitle' ? COLORS.deepSea :
                                       el.type === 'table' ? COLORS.stormGray :
                                       '#888'
                    }}>{el.type}</span>
                    <span style={styles.previewText}>
                      {el.title || el.text || el.term || 
                       (el.type === 'sidebar' ? `[${el.code}] ${el.title}` : '') ||
                       (el.type === 'table' ? `${el.headers?.length} cols × ${el.data?.length} rows` : '')}
                    </span>
                  </div>
                ))}
                {elements.length > 15 && (
                  <div style={styles.previewMore}>...and {elements.length - 15} more elements</div>
                )}
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button style={styles.secondaryButton} onClick={handleReset}>← Choose Different File</button>
              <button style={styles.primaryButton} onClick={handleGenerate}>◊ Forge Document</button>
            </div>
          </div>
        )}

        {status === 'complete' && (
          <div style={styles.successContainer}>
            <div style={styles.successIcon}>✓</div>
            <h3 style={styles.successTitle}>Document Forged!</h3>
            <p style={styles.successText}>Your styled document has been downloaded.</p>
            <button style={styles.primaryButton} onClick={handleReset}>◊ Forge Another</button>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.errorContainer}>
            <div style={styles.errorIcon}>✕</div>
            <h3 style={styles.errorTitle}>Something went wrong</h3>
            <div style={styles.errorLog}>
              {parseLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
            <button style={styles.primaryButton} onClick={handleReset}>Try Again</button>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerOrnament}>◊</div>
        <p style={styles.footerText}>Deep Sea Teal · Copper Accents · Storm Gray · Warm Sand</p>
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
  header: { textAlign: 'center', padding: '60px 20px 40px' },
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
    marginBottom: '24px',
  },
  divider: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '14px',
    color: '#B87333',
    letterSpacing: '4px',
  },
  main: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px' },
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
  },
  dropzoneActive: { borderColor: '#2C5F7C', backgroundColor: 'rgba(44, 95, 124, 0.05)', transform: 'scale(1.02)' },
  dropzoneIcon: { fontSize: '48px', color: '#B87333', marginBottom: '20px' },
  dropzoneTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: '24px', fontWeight: 600, color: '#2C5F7C', marginBottom: '8px' },
  dropzoneText: { fontSize: '14px', color: '#5A6978', marginBottom: '16px' },
  dropzoneHint: { fontSize: '12px', color: '#B87333', fontStyle: 'italic' },
  loadingContainer: { textAlign: 'center', padding: '60px' },
  loadingSpinner: { fontSize: '48px', color: '#B87333', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: '24px' },
  loadingText: { fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', color: '#5A6978' },
  previewContainer: { width: '100%', maxWidth: '600px' },
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
  fileIcon: { fontSize: '32px' },
  fileName: { fontFamily: "'Cormorant Garamond', serif", fontSize: '18px', fontWeight: 600, color: '#2C5F7C' },
  fileStats: { fontSize: '13px', color: '#5A6978' },
  logBox: {
    backgroundColor: 'rgba(255, 254, 249, 0.9)',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '20px',
    boxShadow: '0 4px 20px rgba(44, 95, 124, 0.08)',
  },
  logTitle: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '14px',
    fontWeight: 600,
    color: '#2C5F7C',
    marginBottom: '12px',
  },
  logLine: { fontSize: '12px', color: '#5A6978', fontFamily: 'monospace', lineHeight: 1.6 },
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
  previewContent: { maxHeight: '300px', overflowY: 'auto' },
  previewItem: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(201, 209, 217, 0.3)' },
  previewType: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#FFFFFF',
    padding: '2px 8px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  previewText: { fontSize: '13px', color: '#5A6978', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  previewMore: { fontSize: '12px', color: '#B87333', fontStyle: 'italic', textAlign: 'center', paddingTop: '12px' },
  buttonGroup: { display: 'flex', gap: '12px', justifyContent: 'center' },
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
  },
  successContainer: { textAlign: 'center', padding: '60px' },
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
  successTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: '28px', fontWeight: 600, color: '#2C5F7C', marginBottom: '8px' },
  successText: { fontSize: '14px', color: '#5A6978', marginBottom: '24px' },
  errorContainer: { textAlign: 'center', padding: '60px' },
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
  errorTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: '28px', fontWeight: 600, color: '#A63D40', marginBottom: '8px' },
  errorLog: { fontSize: '12px', color: '#5A6978', fontFamily: 'monospace', marginBottom: '24px', textAlign: 'left', maxWidth: '400px', margin: '0 auto 24px' },
  footer: { textAlign: 'center', padding: '40px 20px' },
  footerOrnament: { fontSize: '16px', color: '#B87333', marginBottom: '12px' },
  footerText: { fontSize: '12px', color: '#5A6978', letterSpacing: '1px' },
};

ReactDOM.render(<App />, document.getElementById('root'));
