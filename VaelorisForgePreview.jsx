import { useState, useCallback, useRef } from 'react';

// Vaeloris Color Palette
const COLORS = {
  deepSea: '#2C5F7C',
  stormGray: '#5A6978',
  copper: '#B87333',
  rustRed: '#A63D40',
  olive: '#6B8E23',
  darkGray: '#2D3748',
  lightBorder: '#C9D1D9',
  warmSand: '#F7F3EB',
  cream: '#FFFEF9',
};

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

// Sample content to demonstrate styling
const SAMPLE_CONTENT = `# BOOK ONE
The Geography of Vaeloris

## Chapter 1: The Redreed Delta

The Redreed Delta stretches across the eastern lowlands, where the Silvervein River fragments into countless channels before meeting the Twilight Sea. This region is home to the Reedfolk, who have lived in harmony with pinnagryphs for generations.

**SIDEBAR [F]: Local Observation** (Reliability: High)

Source: Delta Warden's Field Notes

_"The best time to observe wild pinnagryphs is at dawn, when they emerge from the shallows to sun themselves on the sandbars."_

### Climate and Terrain

**Climate:** Warm and humid
**Terrain:** Marshland with scattered islands
**Notable Feature:** Bioluminescent reeds that glow at twilight

| Region | Climate | Pinnagryph Family |
|--------|---------|-------------------|
| Northern Marshes | Cool, Misty | Pinnatigris |
| Central Delta | Warm, Humid | Pinnapard |
| Coastal Flats | Hot, Salty | Pinnacheetah |

**SIDEBAR [V]: Healer's Guidance** (Reliability: High)

Source: Healer's Guild Compendium

_"Always carry freshwater when traversing the delta. The brackish water can cause severe dehydration in both rider and mount."_

## Chapter 2: The Skyspine Range

Rising dramatically from the western plains, the Skyspine Mountains form the backbone of the continent.`;

function parseMarkdownContent(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let isFirstParagraphAfterChapter = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    if (/^#\s+BOOK\s+/i.test(trimmed)) {
      const match = trimmed.match(/^#\s+BOOK\s+(\w+)[:\s]*(.*)$/i);
      if (match) elements.push({ type: 'bookTitle', number: match[1], title: match[2] || '' });
      i++; continue;
    }

    if (/^##\s+Chapter\s+/i.test(trimmed)) {
      const match = trimmed.match(/^##\s+Chapter\s+(\d+)[:\s]*(.*)$/i);
      if (match) {
        elements.push({ type: 'chapter', number: match[1], title: match[2] || '' });
        isFirstParagraphAfterChapter = true;
      }
      i++; continue;
    }

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

    if (/^\*\*SIDEBAR\s*\[([A-Z])\]/i.test(trimmed)) {
      const headerMatch = trimmed.match(/^\*\*SIDEBAR\s*\[([A-Z])\]:\s*([^*]*)\*\*(?:\s*\(Reliability:\s*([^)]+)\))?/i);
      if (headerMatch) {
        const code = headerMatch[1].toUpperCase();
        const title = headerMatch[2].trim();
        const reliability = headerMatch[3] || '';
        let source = '', quote = '';
        i++;
        while (i < lines.length) {
          const sLine = lines[i].trim();
          if (!sLine || sLine.startsWith('##') || sLine.startsWith('**SIDEBAR')) break;
          if (sLine.startsWith('Source:')) source = sLine.replace('Source:', '').trim();
          else if (sLine.startsWith('_"') || sLine.startsWith('*"')) quote = sLine.replace(/^[_*"]+|[_*"]+$/g, '');
          i++;
        }
        elements.push({ type: 'sidebar', code, title, reliability, source, quote });
        continue;
      }
    }

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

    if (/^\*\*[^*]+\*\*:\s*/.test(trimmed)) {
      const defMatch = trimmed.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
      if (defMatch) {
        elements.push({ type: 'definition', term: defMatch[1], value: defMatch[2] });
        i++; continue;
      }
    }

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

function StyledPreview({ elements }) {
  return (
    <div className="preview-document">
      {elements.map((el, i) => {
        switch (el.type) {
          case 'bookTitle':
            return (
              <div key={i} className="book-title-section">
                <div className="ornament">·  ◊  ·</div>
                <h1 className="book-number">BOOK {el.number}</h1>
                {el.title && <p className="book-title-text">{el.title}</p>}
                <div className="divider">─────────  ◊  ─────────</div>
              </div>
            );
          case 'chapter':
            return (
              <div key={i} className="chapter-header">
                <div className="ornament small">·  ◊  ·</div>
                <p className="chapter-number">CHAPTER {el.number}</p>
                <h2 className="chapter-title">{el.title}</h2>
                <div className="divider">─────────  ◊  ─────────</div>
              </div>
            );
          case 'header':
            const HeaderTag = `h${el.level + 1}`;
            return <HeaderTag key={i} className={`section-header level-${el.level}`}>{el.text}</HeaderTag>;
          case 'dropCapParagraph':
            return (
              <p key={i} className="drop-cap-paragraph">
                <span className="drop-cap">{el.text[0]}</span>
                {el.text.slice(1)}
              </p>
            );
          case 'paragraph':
            return <p key={i} className="body-paragraph">{el.text}</p>;
          case 'definition':
            return (
              <p key={i} className="definition">
                <strong>{el.term}:</strong> {el.value}
              </p>
            );
          case 'sidebar':
            const style = SIDEBAR_STYLES[el.code] || { label: 'NOTE', color: COLORS.deepSea };
            return (
              <div key={i} className="sidebar" style={{ borderTopColor: style.color }}>
                <div className="sidebar-header" style={{ color: style.color }}>
                  ◊ <span className="sidebar-label">{style.label}</span>
                </div>
                {el.title && <div className="sidebar-title">{el.title}</div>}
                {el.source && <div className="sidebar-meta"><strong>Source:</strong> {el.source}</div>}
                {el.reliability && <div className="sidebar-meta"><strong>Reliability:</strong> {el.reliability}</div>}
                {el.quote && <div className="sidebar-quote">"{el.quote}"</div>}
              </div>
            );
          case 'table':
            return (
              <table key={i} className="styled-table">
                <thead>
                  <tr>{el.headers.map((h, j) => <th key={j}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {el.data.map((row, j) => (
                    <tr key={j} className={j % 2 === 0 ? 'even' : 'odd'}>
                      {row.map((cell, k) => <td key={k}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export default function VaelorisForge() {
  const [content, setContent] = useState(SAMPLE_CONTENT);
  const [view, setView] = useState('split');

  const elements = parseMarkdownContent(content);

  return (
    <div className="forge-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Raleway:wght@400;500;600&display=swap');
        
        .forge-container {
          min-height: 100vh;
          background: linear-gradient(145deg, ${COLORS.warmSand} 0%, ${COLORS.cream} 50%, #f5f0e8 100%);
          font-family: 'Raleway', sans-serif;
          color: ${COLORS.darkGray};
        }
        
        .header {
          text-align: center;
          padding: 40px 20px 30px;
          border-bottom: 1px solid ${COLORS.lightBorder};
        }
        
        .header-ornament {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          color: ${COLORS.copper};
          margin-bottom: 12px;
        }
        
        .header-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 32px;
          font-weight: 700;
          color: ${COLORS.deepSea};
          margin: 0 0 8px;
        }
        
        .header-subtitle {
          font-size: 13px;
          color: ${COLORS.stormGray};
        }
        
        .view-toggle {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 16px;
          background: rgba(255,254,249,0.8);
          border-bottom: 1px solid ${COLORS.lightBorder};
        }
        
        .toggle-btn {
          font-family: 'Raleway', sans-serif;
          font-size: 12px;
          padding: 8px 16px;
          border: 1px solid ${COLORS.lightBorder};
          background: white;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .toggle-btn.active {
          background: ${COLORS.deepSea};
          color: white;
          border-color: ${COLORS.deepSea};
        }
        
        .main-content {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 180px);
        }
        
        .main-content.split {
          flex-direction: row;
        }
        
        .editor-panel, .preview-panel {
          flex: 1;
          overflow: auto;
          padding: 20px;
        }
        
        .editor-panel {
          background: white;
          border-right: 1px solid ${COLORS.lightBorder};
        }
        
        .editor-textarea {
          width: 100%;
          height: 100%;
          min-height: 400px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.6;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
        }
        
        .preview-document {
          max-width: 700px;
          margin: 0 auto;
          padding: 40px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(44,95,124,0.08);
        }
        
        .ornament {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          color: ${COLORS.copper};
          text-align: center;
          margin-bottom: 12px;
        }
        
        .ornament.small { font-size: 16px; }
        
        .book-title-section {
          text-align: center;
          padding: 40px 0;
        }
        
        .book-number {
          font-family: 'Cormorant Garamond', serif;
          font-size: 36px;
          font-weight: 700;
          color: ${COLORS.deepSea};
          margin: 0 0 8px;
        }
        
        .book-title-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-style: italic;
          color: ${COLORS.stormGray};
          margin: 0 0 16px;
        }
        
        .divider {
          font-family: 'Cormorant Garamond', serif;
          font-size: 14px;
          color: ${COLORS.copper};
          text-align: center;
          letter-spacing: 2px;
        }
        
        .chapter-header {
          text-align: center;
          padding: 30px 0;
          margin-top: 30px;
          border-top: 1px solid ${COLORS.lightBorder};
        }
        
        .chapter-number {
          font-family: 'Cormorant Garamond', serif;
          font-size: 12px;
          font-variant: small-caps;
          color: ${COLORS.stormGray};
          letter-spacing: 2px;
          margin: 0 0 4px;
        }
        
        .chapter-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 24px;
          font-weight: 700;
          color: ${COLORS.deepSea};
          margin: 0 0 12px;
        }
        
        .section-header {
          font-family: 'Cormorant Garamond', serif;
          font-weight: 600;
          margin: 24px 0 12px;
        }
        
        .section-header.level-2 { font-size: 18px; color: ${COLORS.deepSea}; }
        .section-header.level-3 { font-size: 15px; color: ${COLORS.deepSea}; }
        .section-header.level-4 { font-size: 13px; color: ${COLORS.stormGray}; }
        
        .body-paragraph {
          font-size: 14px;
          line-height: 1.7;
          margin: 0 0 14px;
          text-align: justify;
        }
        
        .drop-cap-paragraph {
          font-size: 14px;
          line-height: 1.7;
          margin: 0 0 14px;
          text-align: justify;
        }
        
        .drop-cap {
          font-family: 'Cormorant Garamond', serif;
          font-size: 48px;
          font-weight: 700;
          color: ${COLORS.deepSea};
          float: left;
          line-height: 0.8;
          margin: 4px 8px 0 0;
        }
        
        .definition {
          font-size: 14px;
          margin: 0 0 10px;
        }
        
        .definition strong {
          color: ${COLORS.deepSea};
        }
        
        .sidebar {
          background: ${COLORS.warmSand};
          border-top: 4px solid;
          border-left: 1px solid ${COLORS.lightBorder};
          border-right: 1px solid ${COLORS.lightBorder};
          border-bottom: 1px solid ${COLORS.lightBorder};
          border-radius: 0 0 6px 6px;
          padding: 16px;
          margin: 20px 0;
        }
        
        .sidebar-header {
          font-size: 13px;
          margin-bottom: 8px;
        }
        
        .sidebar-label {
          font-family: 'Cormorant Garamond', serif;
          font-weight: 600;
          font-variant: small-caps;
          letter-spacing: 1px;
        }
        
        .sidebar-title {
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 6px;
        }
        
        .sidebar-meta {
          font-size: 12px;
          margin-bottom: 4px;
        }
        
        .sidebar-quote {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 14px;
          margin-top: 10px;
          color: ${COLORS.darkGray};
        }
        
        .styled-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 13px;
        }
        
        .styled-table th {
          background: ${COLORS.deepSea};
          color: white;
          padding: 10px;
          text-align: center;
          font-weight: 600;
        }
        
        .styled-table td {
          padding: 10px;
          text-align: center;
          border: 1px solid ${COLORS.lightBorder};
        }
        
        .styled-table tr.even td { background: ${COLORS.cream}; }
        .styled-table tr.odd td { background: ${COLORS.warmSand}; }
      `}</style>
      
      <header className="header">
        <div className="header-ornament">·  ◊  ·</div>
        <h1 className="header-title">Vaeloris Document Forge</h1>
        <p className="header-subtitle">Live preview of The Bonded Path styling</p>
      </header>
      
      <div className="view-toggle">
        <button className={`toggle-btn ${view === 'split' ? 'active' : ''}`} onClick={() => setView('split')}>
          Split View
        </button>
        <button className={`toggle-btn ${view === 'editor' ? 'active' : ''}`} onClick={() => setView('editor')}>
          Editor Only
        </button>
        <button className={`toggle-btn ${view === 'preview' ? 'active' : ''}`} onClick={() => setView('preview')}>
          Preview Only
        </button>
      </div>
      
      <div className={`main-content ${view}`}>
        {(view === 'split' || view === 'editor') && (
          <div className="editor-panel">
            <textarea
              className="editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your markdown content here..."
            />
          </div>
        )}
        
        {(view === 'split' || view === 'preview') && (
          <div className="preview-panel">
            <StyledPreview elements={elements} />
          </div>
        )}
      </div>
    </div>
  );
}
