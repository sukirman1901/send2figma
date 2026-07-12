# Send2Figma Web Clone MCP

Local MCP server so **Cursor** can inspect a live Chrome tab and rebuild UI in Next/React/HTML — **without** going through Figma.

## Fidelity contract

| Layer | Promise |
|-------|---------|
| Screenshot | Pixel-accurate capture of what Chrome painted |
| **designSystem** | Agent-ready brand: typography, colors, buttons, hover |
| **specs v2** (`layoutSpec` / `typeSpec` / `colorSpec` / `aliases`) | Section measures — win over page tokens on conflict |
| Styles / rules / box model | Best-effort DevTools-equivalent snapshot |
| Generated code | Follow designSystem + specs; screenshot for QA |

`bundle_for_recreate` returns `version: 3` with `designSystem`, `specs`, and a strict `agentPrompt`. Skill: `.cursor/skills/web-clone-from-mcp/` (Spec→Plan→Build→Verify→Review→Ship).


## Setup

1. Build this package:

```bash
cd mcp
npm install
npm run build
```

2. Load the **Send2Figma** extension (`chrome://extensions` → Load unpacked → select the **`extension/`** folder).

3. Open **extension Options** → generate MCP token → note port (`17321` default).

4. Add to Cursor MCP config (see `cursor-mcp.example.json`):

```json
{
  "mcpServers": {
    "send2figma-web-clone": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/htmltofigma/mcp/dist/index.js"],
      "env": {
        "S2F_MCP_TOKEN": "<token-from-options>",
        "S2F_MCP_PORT": "17321"
      }
    }
  }
}
```

5. Restart MCP / Cursor. Call `ping` — `extensionConnected` should become `true` after the extension connects.

## Tools

- `ping` — health + extension bridge
- `list_tabs` — http(s) tabs
- `list_sections` — header/nav/main/card candidates
- `inspect_section` — HTML + CSS + **specs** (layout/type/color aliases)
- `get_interaction_css` — `:hover`/`:focus` rules (+ optional hover shot)
- `capture_screenshot` — visible / fullPage / node
- `export_images` — img + background assets
- `extract_tokens` — **designSystem** (type/color/buttons/hover) + raw tokens
- `bundle_for_recreate` — **primary** pack: designSystem + specs + screenshot + strict agentPrompt

Screenshots/assets are written under `~/.send2figma-mcp/cache/` (override with `S2F_MCP_CACHE`).

## Spec

See `docs/superpowers/specs/` locally if present (not published in the repo).
