# Web Clone MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local MCP server + Chrome extension bridge so Cursor can inspect a live tab and return a recreate bundle (HTML, DevTools-grade styles, screenshots, tokens) without going through Figma.

**Architecture:** MCP (Node/TS, stdio) hosts a localhost WebSocket; Send2Figma MV3 extension connects with a shared token and executes inspect/screenshot/token commands via existing `chrome.scripting` / `chrome.debugger` APIs. New page helpers collect matched CSS and sections; Figma `figh2d` path stays untouched.

**Tech Stack:** Chrome MV3 extension (existing), Node 20+, TypeScript, `@modelcontextprotocol/sdk`, `ws`, CDP via `chrome.debugger`.

**Spec:** `docs/superpowers/specs/2026-07-11-web-clone-mcp-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `mcp/package.json` | MCP package deps & scripts |
| `mcp/src/index.ts` | MCP stdio entry, tool registration |
| `mcp/src/bridge.ts` | WebSocket server + request/response to extension |
| `mcp/src/cache.ts` | Write PNG/assets under cache dir |
| `mcp/src/tools/*.ts` | One module per MCP tool |
| `mcp/cursor-mcp.example.json` | Example Cursor config |
| `mcp/README.md` | Setup for humans |
| `background.js` | Handle `mcp_*` messages; WS client to MCP |
| `ui/mcp-options.html` + `ui/mcp-options.js` | Token/port/status + copy Cursor config |
| `manifest.json` | options_ui, maybe `alarms` for keepalive |
| `sectionDetect.js` | Page-world section candidates |
| `mcpInspect.js` | HTML sanitize + style collection orchestration in page |
| `src/mcpCdpStyles.js` | Background helpers: CDP matched/computed/box model |
| `tests/mcp-*-regression.mjs` | Unit/regression without live Chrome when possible |

---

### Task 1: Scaffold MCP package

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/src/index.ts` (hello tool only)
- Create: `mcp/README.md` (stub)
- Create: `mcp/cursor-mcp.example.json`

- [ ] **Step 1: Create `mcp/package.json`**

```json
{
  "name": "send2figma-web-clone-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "send2figma-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "ws": "^8.18.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create `mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Minimal `mcp/src/index.ts` with `ping` tool**

Register MCP server over stdio with one tool `ping` returning `{ ok: true, version: "0.1.0" }`.

- [ ] **Step 4: Install & build**

Run:

```bash
cd mcp && npm install && npm run build
```

Expected: `mcp/dist/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add mcp/
git commit -m "chore(mcp): scaffold web-clone MCP package"
```

---

### Task 2: WebSocket bridge (MCP hosts, extension connects)

**Files:**
- Create: `mcp/src/bridge.ts`
- Modify: `mcp/src/index.ts`
- Test: `tests/mcp-bridge-regression.mjs` (protocol shape only if no live WS)

**Protocol message:**

```json
{
  "id": "uuid",
  "type": "req",
  "method": "ping",
  "params": {}
}
```

```json
{
  "id": "uuid",
  "type": "res",
  "ok": true,
  "result": {}
}
```

- [ ] **Step 1: Implement `BridgeServer` in `mcp/src/bridge.ts`**

- Listen `127.0.0.1:${PORT}` (env `S2F_MCP_PORT`, default `17321`)
- On connection, require first message `{ type: "auth", token }` matching `S2F_MCP_TOKEN`
- `request(method, params, timeoutMs)` → Promise result
- Reject if no extension connected

- [ ] **Step 2: Wire bridge start in `index.ts` before MCP serve**

- [ ] **Step 3: Unit-test auth reject / request timeout with a mock `ws` client in Node**

Create `tests/mcp-bridge-regression.mjs` that spawns bridge logic or tests pure helpers.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp): localhost WebSocket bridge with token auth"
```

---

### Task 3: Extension options + WS client

**Files:**
- Create: `ui/mcp-options.html`
- Create: `ui/mcp-options.js`
- Modify: `manifest.json` (add `options_ui`, permission `alarms` if used)
- Modify: `background.js` (WS client + `mcp_ping` handler)

- [ ] **Step 1: Options UI**

Fields: port, token (generate button), status (connected/disconnected), “Copy Cursor MCP JSON”.

Store in `chrome.storage.local`: `mcpPort`, `mcpToken`.

- [ ] **Step 2: Background WS client**

On startup + alarm every 25s: connect to `ws://127.0.0.1:${port}` and auth.

On `req` messages, dispatch:

```js
if (method === "ping") return { pong: true, extensionVersion: manifest.version };
```

- [ ] **Step 3: Manual check**

1. `node mcp/dist/index.js` with env token  
2. Open extension options → same token → status Connected  
3. MCP `ping` tool returns extension pong  

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(extension): MCP options page and WebSocket client"
```

---

### Task 4: `list_tabs` + `capture_screenshot` tools

**Files:**
- Create: `mcp/src/tools/listTabs.ts`
- Create: `mcp/src/tools/captureScreenshot.ts`
- Create: `mcp/src/cache.ts`
- Modify: `background.js` — `mcp_list_tabs`, `mcp_screenshot`
- Reuse: existing screenshot helpers in `background.js`

- [ ] **Step 1: `mcp_list_tabs` in background**

`chrome.tabs.query({})` filter http(s), return `{ id, title, url, active }`.

- [ ] **Step 2: `mcp_screenshot`**

Params: `{ mode, tabId?, selector? }`.  
Reuse `captureFullPagePng` / `captureVisibleTab` / node clip via CDP when selector present.  
Return `{ mimeType: "image/png", base64 }` or write via MCP cache and return path.

- [ ] **Step 3: MCP tools call bridge `list_tabs` / `screenshot`**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp): list_tabs and capture_screenshot tools"
```

---

### Task 5: `extract_tokens` tool

**Files:**
- Create: `mcp/src/tools/extractTokens.ts`
- Modify: `background.js` — reuse `htfy_EXTRACT_DESIGN_SYSTEM` logic as `mcp_extract_tokens`

- [ ] **Step 1: Background handler returns design tokens JSON (same as panel extract)**

- [ ] **Step 2: MCP tool `extract_tokens`**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mcp): extract_tokens tool"
```

---

### Task 6: Section detection

**Files:**
- Create: `sectionDetect.js`
- Create: `tests/section-detect-regression.mjs`
- Modify: `background.js` — inject + `mcp_list_sections`
- Create: `mcp/src/tools/listSections.ts`

- [ ] **Step 1: Write failing tests for landmark + large section naming**

Fixture HTML with `header`, `main`, three cards → expect names `Header`, `Main`, and a repeated group.

- [ ] **Step 2: Implement `sectionDetect.js` exposing `window.__htfyDetectSections()`**

Return array per spec §5.2.

- [ ] **Step 3: Wire MCP `list_sections`**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp): list_sections detection"
```

---

### Task 7: CDP matched styles + inspect

**Files:**
- Create: `src/mcpCdpStyles.js` (imported from background — note: SW may need inline or bundled copy; if ES modules in SW already work via import in `background.js`, follow that)
- Create: `mcpInspect.js` (HTML sanitize in page)
- Create: `mcp/src/tools/inspectSection.ts`
- Create: `tests/mcp-inspect-regression.mjs` (sanitize + allowlist pure functions)

- [ ] **Step 1: Implement HTML sanitizer**

Strip `<script>`, `on*` attributes, extension chrome nodes.

- [ ] **Step 2: Implement CDP helpers**

Given `tabId` + backend node id (from `DOM.getDocument` + `DOM.querySelector`):

- `CSS.getMatchedStylesForNode`
- `CSS.getComputedStyleForNode`
- `DOM.getBoxModel`

Filter computed to allowlist from spec §6.

- [ ] **Step 3: `mcp_inspect` background orchestration**

Fallback if debugger busy: page `getComputedStyle` only + `fidelityNotes: ["cdp_unavailable"]`.

- [ ] **Step 4: MCP tool `inspect_section`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mcp): inspect_section with DevTools-grade CSS"
```

---

### Task 8: Interaction CSS + hover shot

**Files:**
- Create: page helper or extend `mcpInspect.js` for `:hover`/`:focus` rule harvest from `document.styleSheets`
- Modify: `src/mcpCdpStyles.js` — `CSS.forcePseudoState`
- Create: `mcp/src/tools/getInteractionCss.ts`

- [ ] **Step 1: Collect pseudo-class rules affecting subtree**

- [ ] **Step 2: Optional force `:hover` + computed diff + screenshot**

- [ ] **Step 3: MCP tool `get_interaction_css`**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp): interaction CSS and forced hover capture"
```

---

### Task 9: `export_images`

**Files:**
- Create: page collector for img/background URLs
- Modify: background fetch → data URL (reuse `refillMissingAssets` patterns from `src/fidelityPost.js`)
- Create: `mcp/src/tools/exportImages.ts`
- Use `mcp/src/cache.ts` for files

- [ ] **Step 1: Collect URLs from section**

- [ ] **Step 2: Fetch embed; record CORS errors**

- [ ] **Step 3: MCP tool**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp): export_images with cache and CORS reporting"
```

---

### Task 10: `bundle_for_recreate`

**Files:**
- Create: `mcp/src/tools/bundleForRecreate.ts`
- Create: `mcp/src/agentPrompt.ts`
- Modify: background optional `mcp_bundle` that runs steps server-side via multiple internal calls **or** compose entirely in MCP from other bridge methods (prefer compose in MCP)

- [ ] **Step 1: Implement prompt template**

Include framework hint, fidelity contract one-liner, paths to screenshots.

- [ ] **Step 2: Compose bundle schema version 1**

Call bridge methods sequentially; write large binaries to cache; return paths.

- [ ] **Step 3: Manual eval on one marketing site hero**

Checklist: HTML present, rules non-empty, screenshot opens, tokens optional.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mcp): bundle_for_recreate primary agent tool"
```

---

### Task 11: Docs + Cursor example + regression gate

**Files:**
- Modify: `mcp/README.md` (full setup)
- Modify: `README.md` (link to MCP docs; fidelity contract)
- Modify: `mcp/cursor-mcp.example.json`
- Modify: `tests/phase-b-regression.mjs` only if manifest/options strings need asserts
- Create: `docs/superpowers/specs` already done — add “Approved” note when user confirms

- [ ] **Step 1: Write setup steps (load extension → options token → npm start → Cursor config)**

- [ ] **Step 2: Document fidelity contract in `mcp/README.md`

- [ ] **Step 3: Run full existing regression suite + new mcp tests

```bash
node tests/phase-b-regression.mjs
node tests/fidelity-regression.mjs
node tests/section-detect-regression.mjs
# etc.
```

- [ ] **Step 4: Commit**

```bash
git commit -m "docs(mcp): setup guide and fidelity contract"
```

---

## Spec coverage check

| Spec section | Tasks |
|--------------|-------|
| WS bridge + token | 2, 3 |
| list_tabs / screenshot | 4 |
| tokens | 5 |
| list_sections | 6 |
| inspect CDP | 7 |
| interaction | 8 |
| images | 9 |
| bundle | 10 |
| docs / phases A–D | 1–11 |
| Figma untouched | All tasks avoid `figh2d` changes |
| Phase E Figma sections | **Not in this plan** |

## Placeholder scan

No TBD steps; CDP fallback and SW keepalive called out in Tasks 3 and 7.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-web-clone-mcp.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
