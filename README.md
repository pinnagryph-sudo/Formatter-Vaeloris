# Vaeloris Document Forge v2

A client-side React PWA that transforms your manuscripts into beautifully styled Word documents using the Vaeloris/Bonded Path aesthetic.

## ·  ◊  · What's New in v2

- **Direct Word document parsing** — Reads paragraph styles (`Heading1`, `Heading2`, `Heading3`, `FirstParagraph`, `BodyText`) from .docx files
- **No more markdown markers required** — Works with plain Word documents
- **Parse log** — Shows exactly what elements were detected
- **Improved sidebar detection** — Finds `SIDEBAR [X]:` patterns in body text

## Supported Input Formats

### Word Documents (.docx)
The parser reads Word paragraph styles:
- `Heading1` → Book title with ornaments
- `Heading2` containing "Chapter" → Chapter header with page break
- `Heading2` (other) → Subtitle
- `Heading3` → Section header
- `FirstParagraph` → Drop cap paragraph
- `BodyText` → Regular paragraph

It also detects text patterns:
- `SIDEBAR [X]: Title (Reliability: High)` → Styled sidebar box
- `Source:`, `Compiled from:`, `Applies to:` → Sidebar fields
- Lines starting with `"` → Sidebar quotes
- `| col | col |` → Tables with styled headers

### Markdown/Text (.md, .txt)
Use these markers:
- `# BOOK ONE` → Book title
- `## Chapter 1: Title` → Chapter header
- `### Section` → Section header
- `**SIDEBAR [V]: Title** (Reliability: High)` → Sidebar

## Sidebar Codes

| Code | Style | Color |
|------|-------|-------|
| A, E, L, Q | SCHOLAR'S NOTE | Teal #2C5F7C |
| B, F | FIELD NOTE | Copper #B87333 |
| D, S, W | WARDEN'S WARNING | Red #A63D40 |
| V | HEALER'S NOTE | Olive #6B8E23 |
| R | REGIONAL VARIATION | Gray #5A6978 |

## Running Locally

```bash
# Option 1: npx serve
npx serve .

# Option 2: Python
python -m http.server 8000
```

Then open http://localhost:8000

## Dependencies (CDN)

- React 18
- JSZip (docx parsing)
- docx (Word document generation)
- FileSaver.js

## ─────────  ◊  ─────────

*For The Bonded Path worldbuilding project*
