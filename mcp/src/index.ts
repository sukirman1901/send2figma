#!/usr/bin/env node
/**
 * Send2Figma Web Clone MCP — stdio server for Cursor.
 * Spec: docs/superpowers/specs/2026-07-11-web-clone-mcp-design.md
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeServer } from "./bridge.js";
import { ensureCacheDir, writeBase64File } from "./cache.js";

const VERSION = "0.1.0";
const PORT = Number(process.env.S2F_MCP_PORT || 17321);
const TOKEN = process.env.S2F_MCP_TOKEN || "";

if (!TOKEN) {
  console.error(
    "[send2figma-mcp] S2F_MCP_TOKEN is required. Generate one in the extension Options page."
  );
  process.exit(1);
}

const bridge = new BridgeServer(PORT, TOKEN);

const server = new McpServer({
  name: "send2figma-web-clone",
  version: VERSION,
});

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

server.tool(
  "ping",
  "Health check. Pings the MCP server and, if connected, the Chrome extension bridge.",
  {},
  async () => {
    const out: Record<string, unknown> = {
      ok: true,
      version: VERSION,
      port: PORT,
      extensionConnected: bridge.connected,
    };
    if (bridge.connected) {
      try {
        out.extension = await bridge.request("ping", {}, 5000);
      } catch (err) {
        out.extensionError = err instanceof Error ? err.message : String(err);
      }
    }
    return textResult(out);
  }
);

server.tool(
  "list_tabs",
  "List open http(s) Chrome tabs the extension can see.",
  {},
  async () => {
    const result = await bridge.request("list_tabs");
    return textResult(result);
  }
);

server.tool(
  "capture_screenshot",
  "Capture a PNG screenshot of the active tab (or tabId). Modes: visible | fullPage | node (requires selector).",
  {
    mode: z.enum(["visible", "fullPage", "node"]).default("visible"),
    tabId: z.number().optional(),
    selector: z.string().optional(),
    saveToCache: z.boolean().default(true),
  },
  async ({ mode, tabId, selector, saveToCache }) => {
    if (mode === "node" && !selector) {
      throw new Error("selector is required when mode is node");
    }
    const result = (await bridge.request("screenshot", {
      mode,
      tabId,
      selector,
    })) as { mimeType?: string; base64?: string; width?: number; height?: number; error?: string };

    if (!result?.base64) {
      throw new Error(result?.error || "Screenshot returned empty");
    }

    let path: string | undefined;
    if (saveToCache) {
      const dir = await ensureCacheDir();
      path = await writeBase64File(dir, `shot-${mode}.png`, result.base64);
    }

    return textResult({
      mimeType: result.mimeType || "image/png",
      width: result.width,
      height: result.height,
      path,
      base64Length: result.base64.length,
      // Omit full base64 from tool text when cached — agent can read the file.
      base64: path ? undefined : result.base64,
    });
  }
);

server.tool(
  "extract_tokens",
  "Extract design-system tokens (colors, fonts, radii, spaces, components) from the active page.",
  {
    tabId: z.number().optional(),
  },
  async ({ tabId }) => {
    const result = await bridge.request("extract_tokens", { tabId });
    return textResult(result);
  }
);

server.tool(
  "list_sections",
  "Detect section candidates (header, nav, hero-like blocks, cards) on the active page.",
  {
    tabId: z.number().optional(),
  },
  async ({ tabId }) => {
    const result = await bridge.request("list_sections", { tabId });
    return textResult(result);
  }
);

server.tool(
  "inspect_section",
  "DevTools-grade inspect: sanitized HTML, matched CSS rules, computed styles, box model.",
  {
    selector: z.string(),
    tabId: z.number().optional(),
    maxChildren: z.number().default(40),
  },
  async ({ selector, tabId, maxChildren }) => {
    const result = await bridge.request("inspect", {
      selector,
      tabId,
      maxChildren,
    });
    return textResult(result);
  }
);

server.tool(
  "get_interaction_css",
  "Collect :hover/:focus/:active rules for a selector. Optionally force :hover and capture a screenshot.",
  {
    selector: z.string(),
    tabId: z.number().optional(),
    forceHover: z.boolean().default(false),
    hoverScreenshot: z.boolean().default(false),
  },
  async ({ selector, tabId, forceHover, hoverScreenshot }) => {
    const result = (await bridge.request("interaction_css", {
      selector,
      tabId,
      forceHover,
      hoverScreenshot,
    })) as {
      rules?: unknown;
      hoverScreenshotBase64?: string;
      fidelityNotes?: string[];
    };

    let hoverScreenshotPath: string | undefined;
    if (result.hoverScreenshotBase64) {
      const dir = await ensureCacheDir();
      hoverScreenshotPath = await writeBase64File(
        dir,
        "hover.png",
        result.hoverScreenshotBase64
      );
      delete result.hoverScreenshotBase64;
    }

    return textResult({ ...result, hoverScreenshotPath });
  }
);

server.tool(
  "export_images",
  "Export <img> and CSS background images from a section (data URLs or cache paths; reports CORS failures).",
  {
    selector: z.string(),
    tabId: z.number().optional(),
    saveToCache: z.boolean().default(true),
  },
  async ({ selector, tabId, saveToCache }) => {
    const result = (await bridge.request("export_images", {
      selector,
      tabId,
    })) as {
      images?: Array<{ url: string; base64?: string; mimeType?: string; error?: string }>;
    };

    const dir = saveToCache ? await ensureCacheDir() : null;
    const images = [];
    let i = 0;
    for (const img of result.images || []) {
      if (img.base64 && dir) {
        const ext = (img.mimeType || "").includes("jpeg") ? "jpg" : "png";
        const path = await writeBase64File(dir, `img-${i++}.${ext}`, img.base64);
        images.push({ url: img.url, path, mimeType: img.mimeType, error: img.error });
      } else {
        images.push({
          url: img.url,
          mimeType: img.mimeType,
          error: img.error,
          base64Length: img.base64?.length,
        });
      }
    }
    return textResult({ images });
  }
);

server.tool(
  "bundle_for_recreate",
  "Primary agent tool: one-shot recreate bundle (HTML, styles, screenshots, tokens, prompt). Prefer this for cloning a section into Next/React/HTML.",
  {
    selector: z.string(),
    tabId: z.number().optional(),
    framework: z.enum(["next", "react", "html"]).default("next"),
    includeHoverShot: z.boolean().default(false),
    sectionName: z.string().optional(),
  },
  async ({ selector, tabId, framework, includeHoverShot, sectionName }) => {
    const result = (await bridge.request(
      "bundle",
      {
        selector,
        tabId,
        framework,
        includeHoverShot,
        sectionName,
      },
      120000
    )) as {
      meta?: unknown;
      section?: { name?: string; selector?: string; html?: string };
      inspect?: unknown;
      interaction?: { rules?: unknown; hoverScreenshotBase64?: string };
      screenshotBase64?: string;
      images?: Array<{ url: string; base64?: string; mimeType?: string; error?: string }>;
      tokens?: unknown;
      fidelityNotes?: string[];
      agentPrompt?: string;
    };

    const dir = await ensureCacheDir();
    let defaultPath: string | undefined;
    if (result.screenshotBase64) {
      defaultPath = await writeBase64File(dir, "default.png", result.screenshotBase64);
      delete result.screenshotBase64;
    }

    let hoverScreenshotPath: string | undefined;
    if (result.interaction?.hoverScreenshotBase64) {
      hoverScreenshotPath = await writeBase64File(
        dir,
        "hover.png",
        result.interaction.hoverScreenshotBase64
      );
      delete result.interaction.hoverScreenshotBase64;
    }

    const images = [];
    let i = 0;
    for (const img of result.images || []) {
      if (img.base64) {
        const path = await writeBase64File(dir, `asset-${i++}.bin`, img.base64);
        images.push({ url: img.url, path, mimeType: img.mimeType, error: img.error });
      } else {
        images.push({ url: img.url, error: img.error });
      }
    }

    const agentPrompt =
      result.agentPrompt ||
      [
        `Recreate this UI section as ${framework}.`,
        `Selector: ${selector}.`,
        `Use the HTML structure, matched CSS rules, computed styles, and screenshot as source of truth.`,
        `Screenshot path: ${defaultPath || "(inline missing)"}.`,
        `Do not claim pixel-perfect parity; match layout, typography, and color closely, then refine.`,
        `Fidelity notes: ${(result.fidelityNotes || []).join("; ") || "none"}.`,
      ].join("\n");

    return textResult({
      version: 1,
      meta: result.meta,
      section: result.section || { name: sectionName || selector, selector },
      inspect: result.inspect,
      interaction: {
        rules: result.interaction?.rules || [],
        hoverScreenshotPath,
      },
      screenshots: { defaultPath, mode: "node" },
      images,
      tokens: result.tokens,
      agentPrompt,
      fidelityNotes: result.fidelityNotes || [],
      cacheDir: dir,
    });
  }
);

await bridge.start();
console.error(`[send2figma-mcp] listening ws://127.0.0.1:${PORT} (extension must connect)`);

const transport = new StdioServerTransport();
await server.connect(transport);
