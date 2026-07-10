/**
 * Extension-side WebSocket client that connects out to the MCP bridge server.
 */

const DEFAULT_PORT = 17321;
const RECONNECT_MS = 2500;

let socket = null;
let reconnectTimer = null;
let handlers = null;

export function setMcpHandlers(map) {
  handlers = map;
}

export async function getMcpSettings() {
  const data = await chrome.storage.local.get(["mcpPort", "mcpToken", "mcpEnabled"]);
  return {
    port: Number(data.mcpPort) || DEFAULT_PORT,
    token: data.mcpToken || "",
    enabled: data.mcpEnabled !== false,
  };
}

export async function saveMcpSettings(partial) {
  await chrome.storage.local.set(partial);
}

export function mcpConnectionState() {
  if (!socket) return "disconnected";
  if (socket.readyState === WebSocket.OPEN) return "connected";
  if (socket.readyState === WebSocket.CONNECTING) return "connecting";
  return "disconnected";
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectMcpBridge().catch(() => {});
  }, RECONNECT_MS);
}

export async function connectMcpBridge() {
  const { port, token, enabled } = await getMcpSettings();
  if (!enabled || !token) return;

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
  } catch (err) {
    console.warn("[Send2Figma MCP] WS create failed:", err);
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "auth", token }));
  });

  socket.addEventListener("message", async (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    if (msg.type === "auth_ok") {
      console.info("[Send2Figma MCP] connected");
      return;
    }
    if (msg.type === "auth_fail") {
      console.warn("[Send2Figma MCP] auth failed");
      try {
        socket.close();
      } catch (_) {}
      return;
    }
    if (msg.type !== "req" || !msg.id || !msg.method) return;

    const respond = (ok, result, error) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          id: msg.id,
          type: "res",
          ok,
          result: ok ? result : undefined,
          error: ok ? undefined : error,
        })
      );
    };

    try {
      const fn = handlers?.[msg.method];
      if (!fn) throw new Error(`Unknown MCP method: ${msg.method}`);
      const result = await fn(msg.params || {});
      respond(true, result);
    } catch (err) {
      respond(false, null, err?.message || String(err));
    }
  });

  socket.addEventListener("close", () => {
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    try {
      socket?.close();
    } catch (_) {}
  });
}

export function disconnectMcpBridge() {
  clearTimeout(reconnectTimer);
  try {
    socket?.close();
  } catch (_) {}
  socket = null;
}
