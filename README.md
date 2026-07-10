# Send2Figma

Chrome extension that captures a live webpage (or a selected element) and pastes it into **Figma as editable layers** — not a flat screenshot.

Also includes a small **Figma plugin** to apply extracted design-system tokens (colors, sizes, components) into the open file.

## Features

- **Presets** — capture at common device widths (iPhone, Android, iPad, Desktop)
- **Custom width** — capture at any viewport width
- **Select element** — pick a node on the page; auto-copies for Figma paste
- **Fidelity modes**
  - **Editable** — more layers you can edit in Figma
  - **Exact** — more rasterization for closer visual match (filters/shadows)
  - After capture: **% editable** badge, raster breakdown, and **Highlight rasters on page**
  - **Why Exact?** explainer in the panel
- **Design system**
  - **Extract from page** (no capture required)
  - **Export `.md`** — AI / Cursor rulebook
  - **Export `.json`** — for the Figma design-token plugin
- **Screenshot** — visible area, full page, or custom region (PNG download)
- In-page dock UI (no popup) — progress stays visible while capturing
- **Web Clone MCP** (optional) — Cursor can inspect the live tab (HTML, CSS rules, screenshots, tokens) without Figma; see [`mcp/README.md`](mcp/README.md)

## Requirements

- Google Chrome (Manifest V3)
- [Figma Desktop](https://www.figma.com/downloads/) for paste (`Cmd/Ctrl+V`)
- Optional: Figma Desktop for the design-token plugin

## Install the Chrome extension

1. Clone this repo:

```bash
git clone https://github.com/sukirman1901/send2figma.git
cd send2figma
```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select this repository folder
5. Pin **Send2Figma** from the extensions menu

### Open the UI

- Click the extension icon, or
- Shortcut: `Ctrl+Shift+H` (Mac: `Ctrl+Shift+H`)

Works on normal `http(s)` pages. Not on `chrome://`, the Web Store, etc.

## Capture → Figma

1. Open a webpage
2. Open Send2Figma (dock + panel)
3. Choose **Presets**, **Custom**, or **Select**
4. Pick fidelity (**Editable** / **Exact**)
5. Click **Send to Figma** (Select copies automatically)
6. In **Figma Desktop**, paste with `Cmd/Ctrl+V`

Clipboard payload uses the `figh2d` format Figma understands as layered content.

### Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle panel | `Ctrl+Shift+H` |
| Capture desktop preset | `Shift+Alt+D` |
| Capture mobile preset | `Shift+Alt+M` |

## Screenshot

Open the **Screenshot** tool (camera icon on the dock):

- **Visible area** — current viewport PNG
- **Full page** — entire scrollable page (CDP; falls back to visible if unavailable)
- **Custom region** — drag a rectangle, then download the crop

The dock hides while capturing. Files download as `send2figma-*.png`.

## Design system

### In the extension

1. Open the **Design system** tool
2. **Extract from page**
3. Wait until the summary shows colors / fonts / components
4. Export:
   - **Export .md** → for AI assistants
   - **Export .json** → for the Figma plugin

> Tip: Prefer **Extract from page** for a rich JSON. A capture that times out during prep can produce an empty token file.

### Figma plugin (apply tokens)

See [figma-plugin/README.md](figma-plugin/README.md) for full steps.

Short version:

1. Figma Desktop → **Plugins → Development → Import plugin from manifest…**
2. Select `figma-plugin/manifest.json`
3. Paste **designsystem.json** → **Apply to file**

Creates variable collection `Send2Figma / Design System`, renames matching `Component/*` layers, and binds matching solid fills.

## Project layout

```
send2figma/
├── manifest.json          # Chrome MV3 manifest
├── background.js          # Service worker
├── contentscript.js       # Page capture / serialize
├── fidelity.js            # Capture prep (pseudos, tokens, etc.)
├── designSystemCapture.js # Live design-token extract
├── picker.js              # Element picker
├── ui/                    # In-page dock + panel
├── figma-plugin/          # Design-token Figma plugin
├── src/                   # Auth, post-process, MD export
└── tests/                 # Node regression checks
```

## Development

No build step required for the extension — load the folder unpacked.

Run regressions:

```bash
node tests/phase-a-regression.mjs
node tests/phase-b-regression.mjs
node tests/phase-c-regression.mjs
node tests/fidelity-regression.mjs
```

After code changes: reload the extension on `chrome://extensions`, then refresh the target page.

## Privacy / permissions

The extension needs broad page access to read layout/styles for capture. Capture data is written to the clipboard for pasting into Figma. Optional Google sign-in syncs export usage for free/Pro limits when logged in; guests can capture without signing in.

## License

Proprietary — all rights reserved unless otherwise noted.
