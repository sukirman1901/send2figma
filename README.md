# Send2Figma

Chrome extension that captures a live webpage (or a selected element) and pastes it into **Figma as editable layers** — not a flat screenshot.

## Quick start

```bash
git clone https://github.com/sukirman1901/send2figma.git
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the **`extension/`** folder
4. Pin Send2Figma from the extensions menu

> Load **`extension/`**, not the whole repo root.

## Use without MCP (extension only)

1. Open any `http(s)` page
2. Click the extension icon or press `Ctrl+Shift+H`
3. Choose **Presets** / **Custom** / **Select**
4. Pick fidelity: **Editable** (more layers) or **Exact** (closer visual match)
5. Click **Send to Figma**
6. In Figma Desktop: `Cmd/Ctrl+V`

### Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle panel | `Ctrl+Shift+H` |
| Capture desktop preset | `Shift+Alt+D` |
| Capture mobile preset | `Shift+Alt+M` |

## MCP setup (Cursor / Claude Code / Windsurf)

MCP lets AI coding tools inspect a live Chrome tab and rebuild UI without going through Figma.

### Architecture

```
Cursor (MCP client)
  │ stdio
  ▼
mcp/dist/index.js  (Node.js MCP server)
  │ WebSocket :17321
  ▼
Extension (mcpBridge.js) ← connects to Chrome tab
```

### Step 1: Install the extension

Follow "Quick start" above. Make sure the extension shows "connected" in the Options page.

### Step 2: Build the MCP server

```bash
cd mcp
npm install
npm run build
```

### Step 3: Generate token

1. Right-click the Send2Figma extension icon → **Options**
2. Click **Generate token** (or paste your own)
3. Click **Save & reconnect**
4. Copy the generated token — you'll need it in Step 4

### Step 4: Configure your MCP client

#### Cursor

Add to Cursor MCP settings (`Cursor Settings → MCP`):

```json
{
  "mcpServers": {
    "send2figma": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/send2figma/mcp/dist/index.js"],
      "env": {
        "S2F_MCP_TOKEN": "<token-from-step-3>",
        "S2F_MCP_PORT": "17321"
      }
    }
  }
}
```

#### Claude Code

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "send2figma": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/send2figma/mcp/dist/index.js"],
      "env": {
        "S2F_MCP_TOKEN": "<token-from-step-3>",
        "S2F_MCP_PORT": "17321"
      }
    }
  }
}
```

#### Windsurf

Same JSON format as Cursor — add via `Windsurf → Settings → MCP`.

### Step 5: Verify

1. Restart your MCP client
2. The extension options page should show status: **connected** (green pill)
3. In Cursor, call `ping` — `extensionConnected` should be `true`

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Status shows "disconnected" | Check token matches between extension Options and MCP config |
| `S2F_MCP_TOKEN is required` | Token not set in env — add it to the MCP config JSON |
| MCP server won't start | Make sure you ran `npm install && npm run build` in `mcp/` |
| Extension can't connect | Check port matches (default `17321`) and no firewall blocking `127.0.0.1` |

## MCP tools

Available when Cursor (or any MCP client) connects to the server:

| Tool | What it does |
|------|-------------|
| `ping` | Health check — checks MCP server + extension bridge |
| `list_tabs` | List open Chrome tabs the extension can see |
| `list_sections` | Detect section candidates (header, nav, hero, cards) |
| `inspect_section` | DevTools-grade inspect: HTML, CSS, computed styles, specs |
| `get_interaction_css` | `:hover` / `:focus` / `:active` rules (+ optional hover screenshot) |
| `capture_screenshot` | PNG: visible / fullPage / node |
| `export_images` | Extract `<img>` and CSS background images from a section |
| `extract_tokens` | Design system: typography, colors, buttons, hover rules |
| `bundle_for_recreate` | Full bundle: designSystem + specs + screenshot + agentPrompt |

### Primary workflow in Cursor

```
1. list_tabs          → find the tab you want to rebuild
2. list_sections      → discover what sections exist
3. bundle_for_recreate → get everything: design system, specs, screenshot, code prompt
4. Cursor generates code following the designSystem + specs
```

## Features

- **Presets** — capture at common device widths (375, 360, 768, 1440)
- **Custom width** — any viewport width
- **Select element** — pick a single node; auto-copies for Figma paste
- **Fidelity modes** — Editable vs Exact (+ raster highlight report)
- **Design system** — extract tokens from page; export `.md` (AI) / `.json` (Figma plugin)
- **Screenshot** — visible, full page, or custom region PNG
- **Multi-size capture** — capture at multiple widths in sequence

## Design system + Figma plugin

### In the extension

1. Open the **Design system** tool
2. **Extract from page**
3. Export **`.md`** (AI context) and/or **`.json`** (Figma plugin)

### Figma plugin

See [`figma-plugin/README.md`](figma-plugin/README.md).

Short version:

1. Figma Desktop → **Plugins → Development → Import plugin from manifest…**
2. Select `figma-plugin/manifest.json`
3. Paste **designsystem.json** → **Apply to file**

## Project layout

```
send2figma/
├── extension/              ← Load unpacked in Chrome
│   ├── manifest.json       MV3 manifest
│   ├── background.js       Service worker
│   ├── contentscript.js    Content script
│   ├── ui/                 Options page + in-page panel
│   │   ├── mcp-options.html
│   │   ├── mcp-options.js
│   │   ├── panel.js
│   │   └── panel-boot.js
│   ├── src/
│   │   ├── mcpBridge.js    WebSocket client to MCP server
│   │   ├── mcpInspect.js   DOM inspection for MCP
│   │   ├── mcpCdpStyles.js CDP style extraction
│   │   └── ...
│   └── mcp/                MCP server (Node.js stdio)
├── figma-plugin/           Figma design-token plugin
└── tests/                  Regression tests
```

## Development

No build step for the extension — load `extension/` unpacked.

After code changes: reload the extension on `chrome://extensions`, then refresh the target page.

```bash
# Extension tests
node tests/phase-a-regression.mjs
node tests/phase-b-regression.mjs
node tests/phase-c-regression.mjs
node tests/fidelity-regression.mjs

# MCP tests
cd mcp && npm install && npm run build
node tests/mcp-regression.mjs
```

## Privacy / permissions

The extension needs broad page access to read layout/styles for capture. Capture data is written to the clipboard for pasting into Figma. No data is sent to external servers — everything runs locally.

## License

Proprietary — all rights reserved unless otherwise noted.
