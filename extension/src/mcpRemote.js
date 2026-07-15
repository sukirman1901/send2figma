/**
 * Remote MCP Client - Polls Vercel server for commands
 */

const POLL_INTERVAL = 5000;

let pollTimer = null;
let handlers = {};
let extensionSecret = null;
let serverUrl = "https://mcp-vercel-three.vercel.app";
let isInitialized = false;

export async function init() {
  const settings = await chrome.storage.local.get([
    "mcpRemoteEnabled",
    "mcpRemoteSecret",
    "mcpServerUrl",
  ]);

  if (!settings.mcpRemoteEnabled || !settings.mcpRemoteSecret) {
    stopPolling();
    return;
  }

  extensionSecret = settings.mcpRemoteSecret;
  if (settings.mcpServerUrl) {
    serverUrl = settings.mcpServerUrl;
  }

  isInitialized = true;
  startPolling();
}

export function startPolling() {
  if (pollTimer) return;
  console.log("[Remote MCP] Starting poll to", serverUrl);
  pollTimer = setInterval(pollForCommands, POLL_INTERVAL);
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[Remote MCP] Stopped polling");
  }
}

async function pollForCommands() {
  if (!extensionSecret) return;

  try {
    const res = await fetch(`${serverUrl}/api/extension/poll`, {
      headers: {
        Authorization: `Bearer ${extensionSecret}`,
      },
    });

    if (!res.ok) {
      console.error("[Remote MCP] Poll failed:", res.status);
      return;
    }

    const { commands } = await res.json();

    for (const cmd of commands) {
      executeCommand(cmd);
    }
  } catch (err) {
    console.error("[Remote MCP] Poll error:", err);
  }
}

async function executeCommand(cmd) {
  try {
    let result;

    if (handlers[cmd.tool]) {
      result = await handlers[cmd.tool](cmd.params);
    } else {
      throw new Error(`Unknown tool: ${cmd.tool}`);
    }

    await fetch(`${serverUrl}/api/extension/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${extensionSecret}`,
      },
      body: JSON.stringify({ commandId: cmd.id, result }),
    });
  } catch (err) {
    console.error("[Remote MCP] Execute error:", err);
    await fetch(`${serverUrl}/api/extension/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${extensionSecret}`,
      },
      body: JSON.stringify({
        commandId: cmd.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    });
  }
}

export function setHandlers(newHandlers) {
  handlers = { ...handlers, ...newHandlers };
}

export function getState() {
  if (!isInitialized) return "disabled";
  if (!extensionSecret) return "no-secret";
  return pollTimer ? "connected" : "disconnected";
}
