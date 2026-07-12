const MCP_DIST =
  "/Users/aaa/Documents/Developer/Extensi Chrome/htmltofigma/mcp/dist/index.js";

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildConfig(port, token) {
  return JSON.stringify(
    {
      mcpServers: {
        "send2figma-web-clone": {
          command: "node",
          args: [MCP_DIST],
          env: {
            S2F_MCP_TOKEN: token || "GENERATE_AND_PASTE",
            S2F_MCP_PORT: String(port || 17321),
          },
        },
      },
    },
    null,
    2
  );
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg || "";
  if (!msg) return;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.textContent = "";
  }, 2200);
}

async function load() {
  const icon = document.getElementById("brandIcon");
  if (icon) icon.src = chrome.runtime.getURL("icons/icon32.png");

  const data = await chrome.storage.local.get(["mcpPort", "mcpToken", "mcpEnabled"]);
  const port = data.mcpPort || 17321;
  const token = data.mcpToken || "";
  document.getElementById("port").value = port;
  document.getElementById("token").value = token;
  document.getElementById("enabled").checked = data.mcpEnabled !== false;
  document.getElementById("config").value = buildConfig(port, token || "GENERATE_AND_PASTE");
  if (!token) {
    toast("Token kosong — paste token dari clipboard, lalu Save & reconnect");
  }
  refreshStatus();
}

async function save() {
  const port = Number(document.getElementById("port").value) || 17321;
  const token = document.getElementById("token").value.trim();
  const enabled = document.getElementById("enabled").checked;
  await chrome.storage.local.set({ mcpPort: port, mcpToken: token, mcpEnabled: enabled });
  document.getElementById("config").value = buildConfig(port, token);
  await chrome.runtime.sendMessage({ type: "htfy_MCP_RECONNECT" });
  refreshStatus();
  toast("Saved — reconnecting…");
}

async function refreshStatus() {
  const res = await chrome.runtime.sendMessage({ type: "htfy_MCP_STATUS" });
  const el = document.getElementById("status");
  const state = res?.state || "disconnected";
  el.dataset.state = state;
  el.textContent = state;
}

document.getElementById("generate").addEventListener("click", () => {
  document.getElementById("token").value = randomToken();
  toast("Token generated — click Save");
});

document.getElementById("save").addEventListener("click", () => {
  save();
});

document.getElementById("copy").addEventListener("click", async () => {
  await save();
  const text = document.getElementById("config").value;
  await navigator.clipboard.writeText(text);
  const btn = document.getElementById("copy");
  btn.textContent = "Copied";
  toast("Cursor config copied");
  setTimeout(() => {
    btn.textContent = "Copy Cursor config";
  }, 1200);
});

load();
setInterval(refreshStatus, 2000);
