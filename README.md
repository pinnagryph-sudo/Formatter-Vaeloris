# Vaeloris Document Forge

A client-side React PWA that transforms your manuscripts into beautifully styled Word documents using the Vaeloris/Bonded Path aesthetic.

## ·  ◊  · Features

- **Drag & drop interface** — Upload .docx, .md, or .txt files
- **Full Vaeloris styling** — Colors, typography, sidebars, tables, and ornaments
- **Client-side processing** — Everything runs in your browser, no server needed
- **PWA-ready** — Install as a desktop/mobile app

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Deep Sea | `#2C5F7C` | Headers, drop caps, SCHOLAR'S NOTE |
| Storm Gray | `#5A6978` | Subtitles, chapter numbers, REGIONAL VARIATION |
| Copper | `#B87333` | Ornaments, bullets, FIELD NOTE |
| Rust Red | `#A63D40` | WARDEN'S WARNING |
| Olive | `#6B8E23` | HEALER'S NOTE |
| Warm Sand | `#F7F3EB` | Backgrounds |

## Supported Markdown Patterns

### Headers
```markdown
# BOOK ONE
## Chapter 1: The Beginning
### Section Title
#### Subsection
```

### Sidebars
```markdown
**SIDEBAR [V]: Medical Warning** (Reliability: High)

Source: Healer's Guild

_"Always consult a professional before..."_
```

Sidebar codes:
- **A, E, L, Q** → SCHOLAR'S NOTE (Teal)
- **B, F** → FIELD NOTE (Copper)
- **D, S, W** → WARDEN'S WARNING (Red)
- **V** → HEALER'S NOTE (Olive)
- **R** → REGIONAL VARIATION (Gray)

### Tables
```markdown
| Region | Climate |
|--------|---------|
| Redreed Delta | Humid |
| Skyspine Range | Cold |
```

### Definitions
```markdown
**Climate:** Hot and arid
```

## Running Locally

1. Serve the files with any static server:
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```

2. Open in browser (e.g., http://localhost:8000)

3. Drop in your files and forge!

## Dependencies (loaded via CDN)

- React 18
- mammoth.js (docx text extraction)
- docx (Word document generation)
- FileSaver.js (download handling)

## ─────────  ◊  ─────────

*For The Bonded Path worldbuilding project*
