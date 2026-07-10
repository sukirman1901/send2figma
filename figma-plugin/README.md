# Send2Figma Design System (Figma plugin)

Companion plugin: turns **designsystem.json** from the Chrome extension into Figma variables.

## Install (once)
1. Open **Figma Desktop** (not browser-only if possible)
2. Menu → **Plugins → Development → Import plugin from manifest…**
3. Select this file: `figma-plugin/manifest.json`
4. Plugin name: **Send2Figma Design Tokens**

## Use
1. On a webpage, open Send2Figma → **Design system**
2. Click **Extract from page** (wait until summary shows colors/fonts/components)
3. Click **Export .json** — open the file; it must list `tokens.colors` etc. (not empty arrays)
4. In Figma: **Plugins → Development → Send2Figma Design Tokens**
5. Paste the JSON into the panel → **Apply to file**

## What “Apply to file” does
- Creates collection `Send2Figma / Design System`
- COLOR variables from `tokens.colors`
- FLOAT variables from radii / spaces / fontSizes
- Renames matching layers to `Component/*`
- Binds solid fills that match token RGB

## If it “does nothing”
- Empty JSON (`colors: []`) → re-extract in the extension; do not use a failed capture export
- Pasted `.md` → invalid; use `.json` only
- Plugin not imported → Development → Import plugin from manifest again after code changes
- Need a file open in Figma with edit access

## Not this plugin
- Pasting a page capture into Figma uses the clipboard (`figh2d`), not this UI
- `.md` export is for AI / Cursor rulebooks only
