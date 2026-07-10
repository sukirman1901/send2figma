# Web Clone MCP — Design Spec

> Status: approved for implementation  
> Date: 2026-07-11  
> Product relationship: **parallel path** to Send2Figma (Figma clipboard). Does not replace Figma export; optional later bridge.

## 1. Problem

Frontend / vibe-coding workflows need to **rebuild a live webpage (or a section) in Next.js / React / HTML+CSS** inside Cursor.

Today Send2Figma extracts rich page data but:

- Output is `figh2d` for **Figma paste**, not an AI-oriented bundle
- Interaction CSS (`:hover`, `:focus`) is not exported as rules
- DevTools-grade matched styles / box model are not exposed
- There is **no MCP** for Cursor to call

Users do **not** need a Figma file in the middle for this workflow.

## 2. Goal

Ship an **MCP server** that Cursor can call to inspect a live Chrome tab and return a **recreate bundle**:

- Structural HTML (section-scoped)
- Matched CSS rules + computed styles + box model (DevTools-grade)
- Interaction rules (`:hover` / `:focus` / `:active`) and optional forced-state screenshots
- Raster proof (node / visible / full-page PNG) — **pixel-accurate reference**
- Extracted images + design tokens
- A single `bundle_for_recreate` payload optimized for coding agents

### Success criteria

| Criterion | Measure |
|-----------|---------|
| Cursor can inspect the active tab without opening Figma | MCP tools work end-to-end |
| Section inspect returns HTML + styles + box model | Schema stable; regression tests |
| Screenshot of a node matches on-screen pixels | CDP / capture path |
| Agent can recreate a simple hero/nav from one bundle | Manual eval checklist |
| Honest fidelity | Docs never claim “100% code pixel-perfect” |

### Non-goals

- Pixel-perfect **generated code** guaranteed
- Full Chrome DevTools feature parity
- Replacing Send2Figma → Figma clipboard
- Cross-origin iframe interiors
- Perfect WebGL / canvas / DRM video reconstruction as vectors
- Unattended scraping of arbitrary sites without a user-owned Chrome session

## 3. Fidelity contract (explicit)

| Layer | Promise |
|-------|---------|
| **Screenshot** | Pixel-accurate capture of what Chrome painted (for that viewport/state) |
| **Styles / rules / box model** | Best-effort DevTools-equivalent snapshot for the selected node tree |
| **Interaction CSS** | Rules extracted from stylesheets + optional forced-state capture |
| **Code output (Next/React)** | Agent responsibility; MCP supplies evidence + spec, not a compiler |

**Product copy rule:** say “high-fidelity recreate context”, never “100% clone to production code”.

## 4. Architecture

```
┌─────────────┐     stdio/SSE      ┌──────────────────┐
│   Cursor    │ ←────────────────→ │  MCP server      │
│   Agent     │                    │  (Node, local)   │
└─────────────┘                    └────────┬─────────┘
                                            │ localhost WebSocket
                                            │ (auth token)
                                   ┌────────▼─────────┐
                                   │ Send2Figma       │
                                   │ MV3 extension    │
                                   │ background.js    │
                                   └────────┬─────────┘
                                            │ chrome.scripting
                                            │ chrome.debugger (CDP)
                                   ┌────────▼─────────┐
                                   │ Active tab page  │
                                   │ + page scripts   │
                                   └──────────────────┘
```

### Why extension bridge (not Playwright-only)

- Reuses existing prepare/capture/token/screenshot code
- User already has the site logged-in / cookies / extensions context
- `debugger` permission already granted for CDP screenshots

### Transport

1. **MCP ↔ extension:** WebSocket on `127.0.0.1` (default port `17321`), shared secret in both MCP config and extension storage.
2. **Cursor ↔ MCP:** standard MCP stdio (primary). Optional SSE later.
3. Extension **service worker** maintains the socket (reconnect with backoff). If SW sleeps, first MCP call wakes via `chrome.runtime` alarm / port from a tiny keepalive offscreen doc if needed.

### Security

- Bind to **localhost only**
- Require **bearer token** (generated on first MCP setup; shown in extension Options)
- Refuse navigation / capture on `chrome://`, Web Store, and other blocked URLs (same list as today)
- No remote relay; all data stays on the machine unless the user pastes it into Cursor chat/cloud

## 5. Tool surface

All tools operate on the **active tab** unless `tabId` is passed (optional advanced).

### 5.1 `list_tabs`

Return open http(s) tabs (id, title, url, active).

### 5.2 `list_sections`

Detect section candidates on the page.

**Detection (ordered, de-duplicated):**

1. Landmarks: `header`, `nav`, `main`, `footer`, `aside`, `[role=banner|navigation|main|contentinfo|complementary]`
2. Large `section` / `article` (min area threshold)
3. Visual blocks: card-like (radius/shadow/border + min size)
4. Repeated sibling groups (logo row, feature cards) — reuse heuristics from `designSystemCapture.js`

**Return (per section):**

```json
{
  "id": "sec_header_0",
  "name": "Header",
  "role": "banner",
  "selector": "header",
  "rect": { "x": 0, "y": 0, "width": 1440, "height": 72 },
  "score": 0.92
}
```

### 5.3 `inspect_section`

DevTools-grade inspect for a selector or section id.

**Pipeline:**

1. Resolve element
2. Serialize **outer HTML** (sanitized: strip scripts, on* handlers, extension chrome)
3. Via CDP (preferred) or DOM fallback:
   - `CSS.getMatchedStylesForNode` (author + inline + pseudo)
   - `CSS.getComputedStyleForNode`
   - `DOM.getBoxModel`
4. Walk meaningful descendants (cap N nodes, e.g. 200) collecting the same for “important” children
5. Include stylesheet URLs / inline summary when available

**Return:** `InspectResult` (see §6).

### 5.4 `get_interaction_css`

For a selector:

- Collect rules whose selectors include `:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled` affecting the node or descendants
- Optionally `force_state`: use CDP `CSS.forcePseudoState` then re-read computed + screenshot

### 5.5 `capture_screenshot`

Modes: `node` | `visible` | `fullPage` | `region`

- Reuse / align with existing `htfy_SCREENSHOT` + full-page CDP path (`getLayoutMetrics` + metrics override + clip)
- Return base64 PNG + width/height + mode + dpr

### 5.6 `export_images`

From section root:

- `<img>` / `<picture>` / `srcset` chosen URL
- CSS `background-image` urls (resolved)
- Attempt fetch → data URL or saved file path under MCP workspace cache
- Report CORS failures explicitly

### 5.7 `extract_tokens`

Wrap existing `extractDesignSystem` / live token path. Return JSON compatible with current design-system export (without requiring Figma plugin).

### 5.8 `bundle_for_recreate` (primary agent tool)

One-shot pack for Cursor:

**Inputs:** `selector` or `sectionId`, `framework` hint (`next` | `react` | `html`), `includeHoverShot` bool

**Contents:**

1. Page meta (url, title, viewport)
2. Section HTML
3. Matched + computed + box model (section root + key children)
4. Interaction CSS (+ optional hover screenshot)
5. Default-state screenshot
6. Images list (paths or data URLs, size-capped)
7. Tokens (subset relevant to section when possible)
8. `agent_prompt`: short instruction template for recreate
9. `fidelity_notes`: what was approximated / missing

**Size budget:** soft limit ~2–5 MB JSON; large PNGs written to `~/.send2figma-mcp/cache/<id>/` and referenced by path so Cursor can `read` files.

## 6. Core schemas

```ts
type BoxModel = {
  content: number[]; // quad
  padding: number[];
  border: number[];
  margin: number[];
  width: number;
  height: number;
};

type MatchedRule = {
  selector: string;
  source: string; // stylesheet href or "inline"
  cssText: string;
  origin: "author" | "user-agent" | "inline" | "unknown";
};

type NodeInspect = {
  selector: string;
  tag: string;
  html?: string; // root only or includeSubtree flag
  computed: Record<string, string>; // filtered allowlist + important props
  matchedRules: MatchedRule[];
  boxModel: BoxModel | null;
};

type InspectResult = {
  url: string;
  title: string;
  root: NodeInspect;
  children: NodeInspect[]; // capped
  capturedAt: string;
};

type RecreateBundle = {
  version: 1;
  meta: { url: string; title: string; viewport: { width: number; height: number }; dpr: number };
  section: { name: string; selector: string; html: string };
  inspect: InspectResult;
  interaction: { rules: MatchedRule[]; hoverScreenshotPath?: string };
  screenshots: { defaultPath: string; mode: string };
  images: { url: string; path?: string; error?: string }[];
  tokens: object;
  agentPrompt: string;
  fidelityNotes: string[];
};
```

### Computed style allowlist (initial)

Include layout/visual props agents need; drop UA noise:

`display, position, top, right, bottom, left, width, height, min/max-*, margin-*, padding-*, border-*, border-radius, background, background-*, color, font-*, line-height, letter-spacing, text-*, flex-*, grid-*, gap, align-*, justify-*, overflow, opacity, box-shadow, transform, filter, z-index, object-fit, gap, column-gap, row-gap`

## 7. Mapping to existing codebase

| Capability | Existing | MCP work |
|------------|----------|----------|
| Tab scripting / capture | `background.js`, `fidelity.js`, `contentscript.js` | Bridge commands `mcp_*` |
| Tokens | `designSystemCapture.js`, `src/designSystem.js` | `extract_tokens` |
| Screenshot | `htfy_SCREENSHOT`, full-page CDP | `capture_screenshot` |
| Select element | `picker.js` | Optional; MCP prefers selector/section id |
| Matched CSS rules | **Missing** | New CDP helper `src/mcp/cdpStyles.js` (extension side) |
| Interaction CSS | **Missing** | New collector + `CSS.forcePseudoState` |
| Section detect | Partial (components in DS) | New `sectionDetect.js` |
| AI HTML bundle | **Missing** | New serializer (not figh2d) |
| Figma clipboard | `figh2d` path | **Out of scope** for MCP v1 |

## 8. Extension changes (v1)

1. **Options page** (minimal): MCP port, token, connection status, “Copy Cursor MCP config”
2. **Background bridge:** WebSocket client/server role — prefer **extension connects out** to MCP-owned WS server (easier with MV3 SW)
3. **Message API** (internal):

   - `mcp_list_sections`
   - `mcp_inspect`
   - `mcp_interaction_css`
   - `mcp_screenshot`
   - `mcp_export_images`
   - `mcp_extract_tokens`
   - `mcp_bundle`

4. Keep Send2Figma dock UI unchanged for v1 (MCP is headless from Cursor’s POV)

## 9. MCP server package

New folder: `mcp/`

```
mcp/
  package.json
  README.md
  src/
    index.ts          # MCP stdio entry
    tools/*.ts        # one file per tool
    bridge.ts         # WS to extension
    cache.ts          # screenshot/image files
  cursor-mcp.example.json
```

**Cursor config example:**

```json
{
  "mcpServers": {
    "send2figma-web-clone": {
      "command": "node",
      "args": ["/absolute/path/to/htmltofigma/mcp/dist/index.js"],
      "env": {
        "S2F_MCP_TOKEN": "<token>",
        "S2F_MCP_PORT": "17321"
      }
    }
  }
}
```

## 10. Agent UX (intended usage)

1. User opens target page in Chrome (extension installed, MCP connected)
2. In Cursor: “Clone the hero from the active tab into a Next.js component”
3. Agent calls `bundle_for_recreate` with section `Hero` or selector
4. Agent reads screenshot + HTML/CSS + tokens
5. Agent writes code; optionally asks for hover shot / another section

## 11. Phased delivery

### Phase A — Skeleton (usable)

- WS bridge + token
- `list_tabs`, `capture_screenshot` (visible + node), `extract_tokens`
- Docs: connect Cursor

### Phase B — Inspect (core value)

- `inspect_section` with CDP matched/computed/box model
- `list_sections`
- HTML sanitize serializer

### Phase C — Interaction + images

- `get_interaction_css` + force pseudo + hover screenshot
- `export_images` with cache files

### Phase D — Bundle

- `bundle_for_recreate` + agent prompt template + size/cache policy
- Eval checklist (3 public sites: marketing hero, nav, card grid)

### Phase E — (Optional later)

- Promote sections inside Figma full-page capture (old “option A”) — **separate project**
- Round-trip visual diff helper

## 12. Testing

- Unit: section detect fixtures (HTML strings), CSS rule filter, HTML sanitize
- Integration: bridge ping with mock WS
- Manual: Cursor tool list visible; bundle on example.com / a known landing page
- Regression: existing `tests/*-regression.mjs` must stay green (Figma path untouched)

## 13. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| MV3 service worker sleep drops WS | MCP pings; extension keepalive; clear error “reconnect: open extension popup” |
| CDP attach conflicts with another debugger | Detect attach errors; fall back to DOM computed-only + warn in `fidelityNotes` |
| Huge pages blow context | Caps on nodes, CSS text, image bytes; file cache references |
| CORS on images | Report failures; screenshot still provides pixels |
| User expects 100% code | Fidelity contract in README + `fidelityNotes` every bundle |

## 14. Open decisions (defaults chosen)

| Decision | Default |
|----------|---------|
| Bridge direction | MCP hosts WS; extension connects out |
| Primary tool for agents | `bundle_for_recreate` |
| Figma path | Unchanged; out of MCP v1 scope |
| Language | MCP in TypeScript; extension bridge in JS matching repo style |

---

## Approval

Please review this spec. After approval, implementation follows `docs/superpowers/plans/2026-07-11-web-clone-mcp.md`.
