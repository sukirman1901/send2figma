# Send2Figma

Chrome extension that captures a live webpage (or a selected element) and pastes it into **Figma as editable layers** — not a flat screenshot.

## Repo folders

After you download/clone, you’ll see these folders:

| Folder | What it is | Do you need it? |
|--------|------------|-----------------|
| **`extension/`** | The Chrome extension (Load unpacked here) | **Yes — start here** |
| **`figma-plugin/`** | Optional Figma plugin for design tokens | Only if you export `.json` tokens |
| **`mcp/`** | Optional Cursor MCP (inspect tab / clone UI) | Only if you use Cursor MCP |

## Install the Chrome extension (beginner path)

1. Download or clone this repo:

```bash
git clone https://github.com/sukirman1901/send2figma.git
cd send2figma
```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the **`extension`** folder (the one that contains `manifest.json`)
6. Pin **Send2Figma** from the extensions menu

> Important: load **`extension/`**, not the whole repo root.

### Open the UI

- Click the extension icon, or
- Shortcut: `Ctrl+Shift+H` (same on Mac)

Works on normal `http(s)` pages. Not on `chrome://`, the Web Store, etc.

## Capture → Figma

1. Open a webpage
2. Open Send2Figma (dock + panel)
3. Choose **Presets**, **Custom**, or **Select**
4. Pick fidelity (**Editable** / **Exact**)
5. Click **Send to Figma** (Select copies automatically)
6. In **Figma Desktop**, paste with `Cmd/Ctrl+V`

### Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle panel | `Ctrl+Shift+H` |
| Capture desktop preset | `Shift+Alt+D` |
| Capture mobile preset | `Shift+Alt+M` |

## Features

- **Presets** — capture at common device widths
- **Custom width** — any viewport width
- **Select element** — pick a node; auto-copies for Figma paste
- **Fidelity modes** — Editable vs Exact (+ raster report)
- **Design system** — extract from page; export `.md` / `.json`
- **Screenshot** — visible, full page, or custom region PNG
- **Web Clone MCP** (optional) — see [`mcp/README.md`](mcp/README.md)

## Design system + Figma plugin

### In the extension

1. Open the **Design system** tool
2. **Extract from page**
3. Export **`.md`** (AI) and/or **`.json`** (Figma plugin)

### Figma plugin

See [`figma-plugin/README.md`](figma-plugin/README.md).

Short version:

1. Figma Desktop → **Plugins → Development → Import plugin from manifest…**
2. Select `figma-plugin/manifest.json`
3. Paste **designsystem.json** → **Apply to file**

## Project layout

```
send2figma/
├── extension/          ← Load unpacked this folder in Chrome
│   ├── manifest.json
│   ├── background.js
│   ├── contentscript.js
│   ├── ui/
│   └── src/
├── figma-plugin/       ← Optional Figma design-token plugin
├── mcp/                ← Optional Cursor MCP server
└── tests/              ← Node regression checks
```

## Development

No build step for the extension — load `extension/` unpacked.

```bash
node tests/phase-a-regression.mjs
node tests/phase-b-regression.mjs
node tests/phase-c-regression.mjs
node tests/fidelity-regression.mjs
node tests/mcp-regression.mjs   # needs mcp build: cd mcp && npm i && npm run build
```

After code changes: reload the extension on `chrome://extensions`, then refresh the target page.

## Privacy / permissions

The extension needs broad page access to read layout/styles for capture. Capture data is written to the clipboard for pasting into Figma. Optional Google sign-in syncs export usage for free/Pro limits when logged in; guests can capture without signing in.

## License

Proprietary — all rights reserved unless otherwise noted.
