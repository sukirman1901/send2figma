import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { BridgeServer } from "../mcp/dist/bridge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../mcp/package.json"));
const WebSocket = require("ws");

function testFilesExist() {
  const root = join(__dirname, "..");
  for (const f of [
    "sectionDetect.js",
    "mcpInspect.js",
    "src/mcpBridge.js",
    "src/mcpCdpStyles.js",
    "ui/mcp-options.html",
    "mcp/src/index.ts",
    "mcp/package.json",
    "mcp/dist/index.js",
  ]) {
    assert.ok(readFileSync(join(root, f), "utf8").length > 50, f);
  }
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.options_ui.page, "ui/mcp-options.html");
  assert.ok(manifest.permissions.includes("alarms"));
}

function testSectionDetectApi() {
  const src = readFileSync(join(__dirname, "../sectionDetect.js"), "utf8");
  assert.match(src, /__htfyDetectSections/);
  assert.match(src, /header, nav, main/);
}

function testInspectApi() {
  const src = readFileSync(join(__dirname, "../mcpInspect.js"), "utf8");
  assert.match(src, /__htfyMcpInspect/);
  assert.match(src, /collectInteractionRules/);
  assert.match(src, /sanitizeHtml/);
}

async function testBridgeAuth() {
  const port = 17322;
  const token = "test-token-bridge";
  const bridge = new BridgeServer(port, token);
  await bridge.start();

  await new Promise((resolve, reject) => {
    const bad = new WebSocket(`ws://127.0.0.1:${port}`);
    bad.on("open", () => bad.send(JSON.stringify({ type: "auth", token: "wrong" })));
    bad.on("close", () => resolve());
    bad.on("error", reject);
    setTimeout(() => reject(new Error("bad auth timeout")), 3000);
  });

  const ext = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    ext.on("open", () => ext.send(JSON.stringify({ type: "auth", token })));
    ext.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "auth_ok") resolve();
    });
    ext.on("error", reject);
    setTimeout(() => reject(new Error("good auth timeout")), 3000);
  });

  ext.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "req" && msg.method === "ping") {
      ext.send(JSON.stringify({ id: msg.id, type: "res", ok: true, result: { pong: true } }));
    }
  });

  for (let i = 0; i < 20 && !bridge.connected; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(bridge.connected, true);
  const result = await bridge.request("ping", {}, 3000);
  assert.equal(result.pong, true);

  ext.close();
  await bridge.close();
}

testFilesExist();
testSectionDetectApi();
testInspectApi();
await testBridgeAuth();
console.log("mcp-regression: ok");
