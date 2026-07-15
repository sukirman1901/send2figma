function buildLocalConfig(port, token) {
  try {
    const root = chrome.runtime.getURL("mcp/dist/index.js");
    return JSON.stringify({
      mcpServers: {
        send2figma: {
          command: "node",
          args: [root],
          env: { S2F_MCP_PORT: String(port || 17321), S2F_MCP_TOKEN: token || "" }
        }
      }
    }, null, 2);
  } catch {
    return `{"mcpServers":{"send2figma":{"command":"node","args":["mcp/dist/index.js"],"env":{"S2F_MCP_PORT":"${port || 17321}","S2F_MCP_TOKEN":"${token || ""}"}}}}`;
  }
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg || "";
  if (!msg) return;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.textContent = ""; }, 2200);
}

// Local settings save
document.getElementById("saveLocal")?.addEventListener("click", async () => {
  try {
    const port = Number(document.getElementById("port").value) || 17321;
    const token = document.getElementById("token").value.trim();
    const enabled = document.getElementById("enabled").checked;
    await chrome.storage.local.set({ mcpPort: port, mcpToken: token, mcpEnabled: enabled });
    document.getElementById("config").value = buildLocalConfig(port, token);
    try { await chrome.runtime.sendMessage({ type: "htfy_MCP_RECONNECT" }); } catch {}
    refreshStatus();
    toast("Saved");
  } catch (e) {
    toast("Error: " + (e?.message || e));
  }
});

// Generate token
document.getElementById("generate")?.addEventListener("click", () => {
  const el = document.getElementById("token");
  if (el) el.value = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
});

// Copy config
document.getElementById("copy")?.addEventListener("click", () => {
  const ta = document.getElementById("config");
  if (ta) { navigator.clipboard.writeText(ta.value); toast("Copied"); }
});

// Status refresh
async function refreshStatus() {
  const pill = document.getElementById("status");
  if (!pill) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: "htfy_MCP_STATUS" });
    const st = (res && res.state) || "disconnected";
    pill.dataset.state = st;
    pill.textContent = st;
  } catch {
    pill.dataset.state = "disconnected";
    pill.textContent = "disconnected";
  }
}

// Init
async function loadSettings() {
  try {
    const icon = document.getElementById("brandIcon");
    if (icon) {
      try { icon.src = chrome.runtime.getURL("icons/icon32.png"); } catch {}
    }

    const data = await chrome.storage.local.get(["mcpPort", "mcpToken", "mcpEnabled"]);
    document.getElementById("port").value = data.mcpPort || 17321;
    document.getElementById("token").value = data.mcpToken || "";
    document.getElementById("enabled").checked = data.mcpEnabled !== false;
    document.getElementById("config").value = buildLocalConfig(data.mcpPort || 17321, data.mcpToken || "GENERATE_AND_PASTE");

    refreshStatus();
  } catch (e) {
    console.error("[MCP Options] Load failed:", e);
  }
}

loadSettings();
