function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildConfig(port, token) {
  const extPath = "(set absolute path to htmltofigma/mcp/dist/index.js)";
  return JSON.stringify(
    {
      mcpServers: {
        "send2figma-web-clone": {
          command: "node",
          args: [extPath],
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

async function load() {
  const data = await chrome.storage.local.get(["mcpPort", "mcpToken", "mcpEnabled"]);
  const port = data.mcpPort || 17321;
  const token = data.mcpToken || "";
  document.getElementById("port").value = port;
  document.getElementById("token").value = token;
  document.getElementById("enabled").checked = data.mcpEnabled !== false;
  document.getElementById("config").value = buildConfig(port, token);
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
}

async function refreshStatus() {
  const res = await chrome.runtime.sendMessage({ type: "htfy_MCP_STATUS" });
  const el = document.getElementById("status");
  const state = res?.state || "disconnected";
  el.dataset.state = state;
  el.innerHTML = `Status: <strong>${state}</strong>`;
}

document.getElementById("generate").addEventListener("click", () => {
  document.getElementById("token").value = randomToken();
});

document.getElementById("save").addEventListener("click", () => {
  save();
});

document.getElementById("copy").addEventListener("click", async () => {
  await save();
  const text = document.getElementById("config").value;
  await navigator.clipboard.writeText(text);
  document.getElementById("copy").textContent = "Copied";
  setTimeout(() => {
    document.getElementById("copy").textContent = "Copy Cursor config";
  }, 1200);
});

load();
setInterval(refreshStatus, 2000);
