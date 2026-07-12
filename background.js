import {
  getAuthState,
  signInWithGoogle,
  signOut,
  recordExportUsage,
  createCheckoutSession,
  createPortalSession,
  getPaymentHistory,
} from "./src/auth.js";
import {
  postProcessCaptureHtml,
  decodeFigh2dHtml,
  encodeFigh2dHtml,
} from "./src/fidelityPost.js";
import { resolveStylesheets } from "./src/cssFetch.js";
import { buildCaptureWarnings, buildFidelityReport } from "./src/composeFrames.js";
import { buildDesignSystemExport, summarizeDesignSystem, buildAgentDesignSystem, formatCompactStyleReference } from "./src/designSystem.js";
import {
  connectMcpBridge,
  disconnectMcpBridge,
  setMcpHandlers,
  mcpConnectionState,
  getMcpSettings,
} from "./src/mcpBridge.js";
import {
  cdpInspectNode,
  cdpForceHoverAndCapture,
  cdpCaptureNodePng,
} from "./src/mcpCdpStyles.js";

const BLOCKED = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "edge://",
  "about:",
  "https://chrome.google.com/webstore/",
];
const STORE = "payloads";
const PENDING = "pending";
const PREVIEW = "preview";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("htfy_capture_db", 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function putPending(html) {
  return idbPut(PENDING, html);
}

async function clearPending() {
  return idbDel(PENDING);
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "Offscreen.html",
    reasons: ["CLIPBOARD"],
    justification: "Write the captured page payload to the clipboard for pasting into Figma.",
  });
}

async function showToast(tabId, text, isError) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (msg, err) => {
        window.__htfyShowToast && window.__htfyShowToast(msg, err);
      },
      args: [text, !!isError],
    });
  } catch (_) {}
}

async function withDeviceEmulation(tabId, { width, height, mobile }, run) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
      width,
      height: height || 900,
      deviceScaleFactor: 1,
      mobile: !!mobile,
    });
    await new Promise((r) => setTimeout(r, 250));
    return await run({ emulated: true });
  } catch (err) {
    console.warn(
      "[Send2Figma] Device emulation unavailable, falling back to DOM-width hack:",
      err.message || err
    );
    return await run({ emulated: false });
  } finally {
    if (attached) {
      try {
        await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride");
      } catch (_) {}
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_) {}
    }
  }
}

async function runCapture(tab, msg, { emulated }) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["relay.js"] });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    files: ["contentscript.js", "superDevHelpers.js", "designSystemCapture.js", "fidelity.js"],
  });
  if (msg.width) {
    await showToast(
      tab.id,
      emulated ? `Emulating ${msg.width}px viewport…` : `Framing at ${msg.width}px…`,
      false
    );
  }
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (opts) =>
        window.__htfyLiteCapture && window.__htfyLiteCapture.captureForDesign
          ? window.__htfyLiteCapture.captureForDesign(opts)
          : { ok: false, error: "captureForDesign unavailable" },
      args: [
        {
          selector: msg.selector || "body",
          verbose: false,
          width: emulated ? null : msg.width || null,
          qualityMode: msg.qualityMode || "editable",
        },
      ],
    });
    return result;
  } finally {
    // Remove picker mark from the page DOM (set in isolated world, visible in MAIN).
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => {
          document.querySelectorAll("[data-h2d-pick]").forEach((n) => n.removeAttribute("data-h2d-pick"));
        },
      });
    } catch (_) {}
  }
}

async function writeClipboard(html) {
  await ensureOffscreen();
  try {
    await putPending(html);
    return await chrome.runtime.sendMessage({ type: "htfy_WRITE_CLIPBOARD" });
  } finally {
    await clearPending();
  }
}

function previewPayload(data, html, extra = {}) {
  const warnings = buildCaptureWarnings(data);
  const summary = data?.fidelity?.treeSummary || null;
  const fidelityReport = buildFidelityReport(data);
  const ds = data?.fidelity?.designSystemSummary || null;
  if (ds) {
    warnings.push(
      `Design system: ${ds.colors} colors, ${ds.fonts} fonts, ${ds.components} components.`
    );
  }
  const vr = data?.viewportRect;
  const rootSize =
    vr && Number.isFinite(vr.width) && Number.isFinite(vr.height)
      ? `${Math.round(vr.width)}×${Math.round(vr.height)}`
      : null;
  return {
    warnings,
    summary: summary ? { ...summary, rootSize: rootSize || summary.rootSize } : { rootSize },
    fidelityReport,
    designSystem: data?.fidelity?.designSystemExport || null,
    title: data?.documentTitle || "Capture",
    qualityMode: data?.fidelity?.qualityMode || null,
    bytes: html?.length || 0,
    captureLabel: extra.captureLabel || null,
    selector: extra.selector || null,
  };
}

chrome.debugger.onDetach.addListener((source, reason) => {
  if (reason !== "target_closed" && reason !== "canceled_by_user") {
    console.warn("[Send2Figma] Debugger detached unexpectedly:", reason, source);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "htfy_RESOLVE_CSS") return;
  (async () => {
    try {
      const cssText = await resolveStylesheets(msg.sheets || []);
      sendResponse({ ok: true, cssText });
    } catch (err) {
      console.warn("[Send2Figma] resolve CSS failed:", err.message || err);
      sendResponse({ ok: false, cssText: "", error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "htfy_CAPTURE") return;
  (async () => {
    let tab;
    try {
      if (sender.tab?.id) {
        tab = sender.tab;
      } else {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      if (!tab?.id || !tab.url || BLOCKED.some((p) => tab.url.startsWith(p))) {
        sendResponse({ ok: false, error: "This page can't be captured." });
        return;
      }

      const captureOnce = (ctx) => runCapture(tab, msg, ctx);
      const result = msg.width
        ? await withDeviceEmulation(
            tab.id,
            { width: msg.width, height: msg.height, mobile: msg.mobile },
            captureOnce
          )
        : await captureOnce({ emulated: false });

      if (!result?.ok) {
        sendResponse(result || { ok: false, error: "Capture failed" });
        return;
      }

      let html = result.html;
      try {
        await showToast(tab.id, "Refining assets…", false);
        html = await postProcessCaptureHtml(html, {
          tabId: tab.id,
          qualityMode: msg.qualityMode,
        });
      } catch (err) {
        console.warn("[Send2Figma] post-process skipped:", err.message || err);
      }

      let data = decodeFigh2dHtml(html);
      if (data) {
        data.fidelity = data.fidelity || {};
        data.fidelity.qualityMode = msg.qualityMode || "editable";
        html = await encodeFigh2dHtml(data);
      }

      const selector = msg.selector || "body";
      const isElementCapture = selector !== "body" && selector !== "html";
      const captureLabel = isElementCapture
        ? msg.captureLabel || selector.slice(0, 64)
        : data?.documentTitle || "Page";
      const preview = previewPayload(data, html, { captureLabel, selector });

      // Preview-before-copy: store only. Do not touch the system clipboard yet.
      const usePreview = msg.preview === true;
      if (usePreview) {
        await idbPut(PREVIEW, html);
        sendResponse({
          ok: true,
          needsConfirm: true,
          preview,
        });
        await showToast(tab.id, "Capture ready — confirm Copy in the Send2Figma panel.", false);
        return;
      }

      const clip = await writeClipboard(html);
      if (clip?.ok) {
        // Keep preview store in sync so a later Confirm Copy can't restore a stale full-page payload.
        try {
          await idbPut(PREVIEW, html);
        } catch (_) {}
        const toastMsg = isElementCapture
          ? `Copied ${captureLabel} — paste into Figma (Cmd/Ctrl+V).`
          : "Copied! Paste into Figma Desktop (Cmd/Ctrl+V).";
        await showToast(tab.id, toastMsg, false);
        let user = null;
        try {
          const { isLoggedIn } = await getAuthState();
          if (isLoggedIn) user = await recordExportUsage();
        } catch (_) {}
        sendResponse({
          ok: true,
          user,
          fidelity: data?.fidelity || result.fidelity || null,
          preview,
        });
      } else {
        const error = "Clipboard write failed: " + (clip?.error || "unknown error");
        await showToast(tab.id, error, true);
        sendResponse({ ok: false, error });
      }
    } catch (err) {
      console.error("[Send2Figma]", err);
      if (tab?.id) await showToast(tab.id, "Capture failed: " + (err.message || String(err)), true);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "htfy_CONFIRM_COPY") return;
  (async () => {
    try {
      const html = await idbGet(PREVIEW);
      if (!html) {
        sendResponse({ ok: false, error: "Nothing to copy — capture again." });
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const clip = await writeClipboard(html);
      await idbDel(PREVIEW);
      if (clip?.ok) {
        if (tab?.id) {
          await showToast(tab.id, "Copied! Paste into Figma Desktop (Cmd/Ctrl+V).", false);
        }
        let user = null;
        try {
          const { isLoggedIn } = await getAuthState();
          if (isLoggedIn) user = await recordExportUsage();
        } catch (_) {}
        sendResponse({ ok: true, user });
      } else {
        sendResponse({ ok: false, error: clip?.error || "Clipboard write failed" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "htfy_DISCARD_PREVIEW") return;
  (async () => {
    await idbDel(PREVIEW);
    sendResponse({ ok: true });
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg?.type?.startsWith("htfy_AUTH_")) return;
  (async () => {
    try {
      if (msg.type === "htfy_AUTH_STATUS") {
        sendResponse({ ok: true, ...(await getAuthState()) });
        return;
      }
      if (msg.type === "htfy_AUTH_SIGNIN") {
        const user = await signInWithGoogle();
        const { config } = await getAuthState();
        sendResponse({ ok: true, user, config });
        return;
      }
      if (msg.type === "htfy_AUTH_SIGNOUT") {
        await signOut();
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "Unknown auth message: " + msg.type });
    } catch (err) {
      console.error("[Send2Figma] Auth error:", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "htfy_BILLING_CHECKOUT") return;
  (async () => {
    try {
      const url = await createCheckoutSession();
      await chrome.tabs.create({ url });
      sendResponse({ ok: true });
    } catch (err) {
      console.error("[Send2Figma] Checkout error:", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "htfy_BILLING_PORTAL") return;
  (async () => {
    try {
      const url = await createPortalSession();
      await chrome.tabs.create({ url });
      sendResponse({ ok: true });
    } catch (err) {
      console.error("[Send2Figma] Portal error:", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "htfy_BILLING_HISTORY") return;
  (async () => {
    try {
      const items = await getPaymentHistory();
      sendResponse({ ok: true, items });
    } catch (err) {
      console.error("[Send2Figma] Billing history error:", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

function isBlockedUrl(url = "") {
  return BLOCKED.some((p) => url.startsWith(p));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientInjectError(err) {
  const m = String(err?.message || err || "");
  return /Frame with ID \d+ was removed|No tab with id|The tab was closed|Cannot access contents of (the page|url)|receiving end does not exist|The frame was removed/i.test(
    m
  );
}

async function waitTabInjectable(tabId, timeoutMs = 10000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await chrome.tabs.get(tabId);
    // Need a real http(s) document that finished (or at least has a URL).
    if (last.url && !isBlockedUrl(last.url) && last.status === "complete") return last;
    if (last.url && !isBlockedUrl(last.url) && Date.now() - start > 1500) {
      // Some SPAs stay "loading"; try inject after a short wait.
      return last;
    }
    await sleep(100);
  }
  return last || chrome.tabs.get(tabId);
}

async function injectPanelScripts(tabId) {
  const files = [
    "relay.js",
    "picker.js",
    "ui/icons/reicon-inline.js",
    "ui/panel.js",
    "ui/panel-boot.js",
  ];
  // Probe main document first — fails fast if frame was just replaced.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!(document.documentElement || document.body),
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });
}

async function togglePanel(tab) {
  if (!tab?.id) return { ok: false, error: "No active tab" };

  let current;
  try {
    current = await chrome.tabs.get(tab.id);
  } catch {
    return { ok: false, error: "Tab closed" };
  }

  if (isBlockedUrl(current.url || "")) {
    return { ok: false, error: "Can't open on this page. Try a normal website." };
  }

  if (current.status === "loading" || !current.url) {
    try {
      current = await waitTabInjectable(tab.id);
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  if (!current?.url || isBlockedUrl(current.url)) {
    return { ok: false, error: "Can't open on this page. Try a normal website." };
  }

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      current = await chrome.tabs.get(tab.id);
      if (isBlockedUrl(current.url || "")) {
        return { ok: false, error: "Can't open on this page. Try a normal website." };
      }
      await injectPanelScripts(tab.id);
      return { ok: true };
    } catch (err) {
      lastErr = err;
      if (!isTransientInjectError(err) || attempt === 3) break;
      // Page navigated / Cloudflare swapped the main frame — wait and retry.
      await sleep(150 * (attempt + 1));
    }
  }

  console.error("[Send2Figma] toggle panel failed:", lastErr);
  return {
    ok: false,
    error:
      lastErr?.message ||
      String(lastErr) ||
      "Couldn't open panel — reload the page and try again.",
  };
}

chrome.action.onClicked.addListener(async (tab) => {
  const res = await togglePanel(tab);
  if (!res?.ok && res?.error) {
    console.warn("[Send2Figma] panel:", res.error);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "htfy_EXTRACT_DESIGN_SYSTEM") return;
  (async () => {
    let tab;
    try {
      if (sender.tab?.id) tab = sender.tab;
      else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || isBlockedUrl(tab.url)) {
        sendResponse({ ok: false, error: "This page can't be scanned." });
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        files: ["designSystemCapture.js"],
      });

      const [{ result: tokens } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => {
          const api = window.__htfyDesignSystemCapture;
          if (!api?.extractDesignSystem) {
            return { ok: false, error: "Design system capture unavailable" };
          }
          const root = document.documentElement || document.body;
          const designTokens = api.extractDesignSystem(root);
          return {
            ok: true,
            designTokens,
            documentTitle: document.title || "",
          };
        },
      });

      if (!tokens?.ok || !tokens.designTokens) {
        sendResponse({
          ok: false,
          error: tokens?.error || "Couldn't extract design tokens from this page.",
        });
        return;
      }

      const designSystem = buildDesignSystemExport({
        documentTitle: tokens.documentTitle || tab.title || "Send2Figma",
        fidelity: { designTokens: tokens.designTokens },
      });
      const summary = summarizeDesignSystem(tokens.designTokens);

      sendResponse({
        ok: true,
        designSystem,
        summary,
      });
    } catch (err) {
      console.error("[Send2Figma] design system extract failed:", err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "htfy_START_PICKER" && msg?.type !== "htfy_INJECT_PICKER") return;
  (async () => {
    try {
      let tabId = sender.tab?.id;
      if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
      }
      if (!tabId) {
        sendResponse({ ok: false, error: "No tab for picker" });
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["relay.js", "picker.js"],
      });
      // Inject only — panel starts picker in the same isolated world.
      if (msg.type === "htfy_INJECT_PICKER") {
        sendResponse({ ok: true });
        return;
      }
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          if (typeof window.__htfyStartPicker !== "function") {
            return { ok: false, error: "Picker failed to load" };
          }
          window.__htfyStartPicker();
          return { ok: true };
        },
      });
      sendResponse(result?.ok ? { ok: true } : { ok: false, error: result?.error || "Picker start failed" });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

async function setExtensionChromeVisible(tabId, visible) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (show) => {
        document.querySelectorAll('#htfyRoot, [id^="__htfy"], [data-htfy-chrome="1"]').forEach((el) => {
          if (show) {
            if (el.dataset.htfyShotHide === "1") {
              el.style.removeProperty("display");
              el.style.removeProperty("visibility");
              delete el.dataset.htfyShotHide;
            }
          } else {
            el.dataset.htfyShotHide = "1";
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("visibility", "hidden", "important");
          }
        });
      },
      args: [!!visible],
    });
  } catch (_) {}
}

function screenshotFilename(mode, format = "png") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `send2figma-${mode}-${stamp}.${format}`;
}

async function downloadDataUrl(dataUrl, filename) {
  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
  });
}

async function cropDataUrlInTab(tabId, dataUrl, region) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (src, rect) => {
      const img = new Image();
      img.src = src;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("Failed to load screenshot"));
      });
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.max(0, Math.round(rect.x * dpr));
      const sy = Math.max(0, Math.round(rect.y * dpr));
      const sw = Math.max(1, Math.round(rect.width * dpr));
      const sh = Math.max(1, Math.round(rect.height * dpr));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      return canvas.toDataURL("image/png");
    },
    args: [dataUrl, region],
  });
  if (!result) throw new Error("Crop failed");
  return result;
}

/** Cap for GPU texture / CDP full-page capture (same ballpark as DevTools). */
const FULLPAGE_MAX_CSS_PX = 16384;

/**
 * Full-page screenshot the way Chrome DevTools does it:
 * getLayoutMetrics → setDeviceMetricsOverride to content size →
 * captureScreenshot with clip covering the page → clear override.
 * Bare captureBeyondViewport (no clip/resize) often tiles the viewport
 * repeatedly when attached via chrome.debugger — that is the bug we hit.
 */
async function captureFullPageViaCdp(tabId) {
  let attached = false;
  let overridden = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    try {
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    } catch (_) {}

    const metrics = await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics");
    const content = metrics.cssContentSize || metrics.contentSize;
    if (!content?.width || !content?.height) {
      throw new Error("Could not read page content size");
    }

    const width = Math.max(1, Math.ceil(content.width));
    const height = Math.max(1, Math.ceil(Math.min(content.height, FULLPAGE_MAX_CSS_PX)));

    // Resize the emulated viewport to the full document so the compositor
    // actually paints the whole page (classic DevTools / Puppeteer fullPage path).
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", {
      mobile: false,
      width,
      height,
      deviceScaleFactor: 1,
      screenOrientation: { type: "portraitPrimary", angle: 0 },
    });
    overridden = true;
    await new Promise((r) => setTimeout(r, 200));

    const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    if (!result?.data) throw new Error("Full-page capture returned empty");
    return `data:image/png;base64,${result.data}`;
  } finally {
    if (overridden) {
      try {
        await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride");
      } catch (_) {}
    }
    if (attached) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_) {}
    }
  }
}

/** Scroll the page and stitch viewport captures — fallback when CDP resize fails. */
async function captureFullPageByStitch(tab) {
  const tabId = tab.id;
  const [{ result: meta } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const el = document.documentElement;
      const body = document.body;
      return {
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        pageW: Math.max(el.scrollWidth, body?.scrollWidth || 0, el.clientWidth),
        pageH: Math.max(el.scrollHeight, body?.scrollHeight || 0, el.clientHeight),
        dpr: window.devicePixelRatio || 1,
      };
    },
  });
  if (!meta?.pageH) throw new Error("Could not measure page for stitch");

  const pageH = Math.min(meta.pageH, FULLPAGE_MAX_CSS_PX);
  const pageW = meta.pageW;
  const viewportH = Math.max(1, meta.viewportH);
  const shots = [];

  try {
    for (let y = 0; y < pageH; y += viewportH) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (sy) => {
          window.scrollTo(0, sy);
        },
        args: [y],
      });
      // Let paint / sticky / lazy content settle after each scroll.
      await new Promise((r) => setTimeout(r, 250));
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      shots.push({ y, dataUrl });
    }
  } finally {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (x, y) => {
        window.scrollTo(x, y);
      },
      args: [meta.scrollX, meta.scrollY],
    });
  }

  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (tiles, w, h, dpr) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      const ctx = canvas.getContext("2d");
      for (const tile of tiles) {
        const img = new Image();
        img.src = tile.dataUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error("Failed to load stitch tile"));
        });
        const destY = Math.round(tile.y * dpr);
        const remaining = canvas.height - destY;
        if (remaining <= 0) continue;
        const srcH = Math.min(img.height, remaining);
        ctx.drawImage(img, 0, 0, img.width, srcH, 0, destY, img.width, srcH);
      }
      return canvas.toDataURL("image/png");
    },
    args: [shots, pageW, pageH, meta.dpr],
  });
  if (!result) throw new Error("Stitch failed");
  return result;
}

async function captureFullPagePng(tab) {
  try {
    return await captureFullPageViaCdp(tab.id);
  } catch (err) {
    console.warn("[Send2Figma] CDP full-page failed, stitching viewports:", err.message || err);
    return await captureFullPageByStitch(tab);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "htfy_SCREENSHOT") return;
  (async () => {
    let tab;
    try {
      if (sender.tab?.id) tab = sender.tab;
      else [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || isBlockedUrl(tab.url)) {
        sendResponse({ ok: false, error: "Can't screenshot this page." });
        return;
      }

      const mode = msg.mode === "fullPage" || msg.mode === "custom" ? msg.mode : "visible";
      const format = msg.format === "jpeg" ? "jpeg" : "png";

      if (mode === "custom") {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["screenshot.js"],
        });
        const [{ result: region } = {}] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async () => {
            if (typeof window.__htfyStartScreenshotRegion !== "function") {
              throw new Error("Region picker failed to load");
            }
            return window.__htfyStartScreenshotRegion();
          },
        });
        if (!region?.width) {
          sendResponse({ ok: false, error: "Selection cancelled" });
          return;
        }
        await setExtensionChromeVisible(tab.id, false);
        await new Promise((r) => setTimeout(r, 120));
        try {
          const raw = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: "png",
          });
          const cropped = await cropDataUrlInTab(tab.id, raw, region);
          const filename = screenshotFilename("region", "png");
          await downloadDataUrl(cropped, filename);
          sendResponse({ ok: true, mode: "custom", filename });
        } finally {
          await setExtensionChromeVisible(tab.id, true);
        }
        return;
      }

      await setExtensionChromeVisible(tab.id, false);
      await new Promise((r) => setTimeout(r, 120));
      try {
        let dataUrl;
        if (mode === "fullPage") {
          dataUrl = await captureFullPagePng(tab);
        } else {
          dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format,
            quality: format === "jpeg" ? 92 : undefined,
          });
        }
        const filename = screenshotFilename(mode === "fullPage" ? "fullpage" : "visible", format);
        await downloadDataUrl(dataUrl, filename);
        sendResponse({ ok: true, mode, filename });
      } finally {
        await setExtensionChromeVisible(tab.id, true);
      }
    } catch (err) {
      console.error("[Send2Figma] screenshot failed:", err);
      if (tab?.id) await setExtensionChromeVisible(tab.id, true);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || isBlockedUrl(tab.url || "")) return;
    if (command === "capture-desktop" || command === "capture-mobile") {
      await togglePanel(tab);
    }
  } catch (err) {
    console.warn("[Send2Figma] command failed:", err);
  }
});

/* ─── Web Clone MCP bridge handlers ─── */

async function mcpResolveTab(tabId) {
  if (tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.id || isBlockedUrl(tab.url || "")) throw new Error("Tab blocked or missing");
    return tab;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || isBlockedUrl(tab.url || "")) throw new Error("No active http(s) tab");
  return tab;
}

async function mcpInject(tabId, files) {
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files });
}

async function mcpFetchImage(url) {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return {
      url,
      mimeType: blob.type || "application/octet-stream",
      base64: btoa(binary),
    };
  } catch (err) {
    return { url, error: err.message || String(err) };
  }
}

async function mcpInspect(params = {}) {
  const tab = await mcpResolveTab(params.tabId);
  const selector = params.selector;
  if (!selector) throw new Error("selector required");
  await mcpInject(tab.id, ["mcpInspect.js"]);
  const [{ result: domInspect } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (sel, maxChildren) => window.__htfyMcpInspect.inspectDom(sel, maxChildren),
    args: [selector, params.maxChildren || 80],
  });
  const fidelityNotes = [...(domInspect?.fidelityNotes || [])];
  try {
    const cdp = await cdpInspectNode(tab.id, selector);
    if (domInspect?.root) {
      domInspect.root.matchedRules = cdp.matchedRules;
      if (Object.keys(cdp.computed || {}).length) domInspect.root.computed = cdp.computed;
      domInspect.root.boxModel = cdp.boxModel;
    }
    fidelityNotes.push("cdp_matched_styles");
  } catch (err) {
    fidelityNotes.push(`cdp_unavailable: ${err.message || err}`);
  }
  return { ...domInspect, fidelityNotes };
}

async function mcpInteractionCss(params = {}) {
  const tab = await mcpResolveTab(params.tabId);
  const selector = params.selector;
  if (!selector) throw new Error("selector required");
  await mcpInject(tab.id, ["mcpInspect.js"]);
  const [{ result: rules } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (sel) => window.__htfyMcpInspect.collectInteractionRules(sel),
    args: [selector],
  });
  const fidelityNotes = [];
  let hoverScreenshotBase64;
  if (params.forceHover || params.hoverScreenshot) {
    try {
      const forced = await cdpForceHoverAndCapture(tab.id, selector, {
        screenshot: !!params.hoverScreenshot,
      });
      hoverScreenshotBase64 = forced.hoverScreenshotBase64;
      fidelityNotes.push("forced_hover");
    } catch (err) {
      fidelityNotes.push(`force_hover_failed: ${err.message || err}`);
    }
  }
  return { rules: rules || [], hoverScreenshotBase64, fidelityNotes };
}

async function mcpExportImages(params = {}) {
  const tab = await mcpResolveTab(params.tabId);
  const selector = params.selector;
  if (!selector) throw new Error("selector required");
  await mcpInject(tab.id, ["mcpInspect.js"]);
  const [{ result: urls } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (sel) => window.__htfyMcpInspect.collectImages(sel),
    args: [selector],
  });
  const images = [];
  for (const url of urls || []) {
    images.push(await mcpFetchImage(url));
  }
  return { images };
}

async function mcpExtractTokens(params = {}) {
  const tab = await mcpResolveTab(params.tabId);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    files: ["designSystemCapture.js"],
  });
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => {
      const api = window.__htfyDesignSystemCapture;
      if (!api?.extractDesignSystem) return { ok: false, error: "extractor missing" };
      // Prefer header/banner scope for button roles; fall back to body for full palette
      const chromeRoot =
        document.querySelector("header") ||
        document.querySelector("[role='banner']") ||
        document.body ||
        document.documentElement;
      const pageRoot = document.body || document.documentElement;
      const pageTokens = api.extractDesignSystem(pageRoot);
      const chromeTokens = chromeRoot !== pageRoot ? api.extractDesignSystem(chromeRoot) : null;
      if (chromeTokens?.buttons?.length) {
        pageTokens.buttons = chromeTokens.buttons;
        pageTokens.links = chromeTokens.links?.length ? chromeTokens.links : pageTokens.links;
      }
      return { ok: true, designTokens: pageTokens };
    },
  });
  if (!result?.ok) throw new Error(result?.error || "token extract failed");

  let interactionRules = [];
  try {
    await mcpInject(tab.id, ["mcpInspect.js"]);
    const [{ result: rules } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        const root = document.body || document.documentElement;
        return window.__htfyMcpInspect?.collectInteractionRules
          ? window.__htfyMcpInspect.collectInteractionRules("body")
          : [];
      },
    });
    interactionRules = Array.isArray(rules) ? rules : [];
  } catch (_) {}

  const exportPayload = buildDesignSystemExport({
    documentTitle: tab.title || "Page",
    fidelity: { designTokens: result.designTokens, treeSummary: null },
  });
  const designSystem = buildAgentDesignSystem({
    tokens: exportPayload.tokens,
    buttons: result.designTokens.buttons || exportPayload.buttons || [],
    links: result.designTokens.links || exportPayload.links || [],
    interactionRules,
    source: exportPayload.source,
  });

  return {
    designSystem,
    tokens: exportPayload.tokens,
    components: exportPayload.components,
    buttons: result.designTokens.buttons || [],
    links: result.designTokens.links || [],
    summary: {
      ...summarizeDesignSystem(result.designTokens),
      buttons: (result.designTokens.buttons || []).length,
      hoverRules: designSystem.interaction?.hoverRules?.length || 0,
    },
    source: exportPayload.source,
    markdown: exportPayload.markdown,
    styleReference: exportPayload.styleReference || exportPayload.markdown,
  };
}

async function mcpBundle(params = {}) {
  const tab = await mcpResolveTab(params.tabId);
  const selector = params.selector;
  if (!selector) throw new Error("selector required");

  const inspect = await mcpInspect({
    selector,
    tabId: tab.id,
    maxChildren: 80,
  });
  const interaction = await mcpInteractionCss({
    selector,
    tabId: tab.id,
    forceHover: !!params.includeHoverShot,
    hoverScreenshot: !!params.includeHoverShot,
  });
  const imagesRes = await mcpExportImages({ selector, tabId: tab.id });
  let tokens = null;
  let designSystem = null;
  let styleReference = null;
  try {
    const tok = await mcpExtractTokens({ tabId: tab.id });
    tokens = {
      summary: tok.summary,
      // Keep raw tokens available but prefer designSystem for agents
      colors: tok.tokens?.colors?.slice(0, 16),
      fontFamilies: tok.tokens?.fontFamilies?.slice(0, 4),
      fontSizes: tok.tokens?.fontSizes?.slice(0, 10),
    };
    designSystem = buildAgentDesignSystem({
      tokens: tok.tokens,
      buttons: tok.buttons || [],
      links: tok.links || [],
      interactionRules: interaction.rules || [],
      sectionAliases: inspect?.specs?.aliases || null,
      source: tab.title || "Page",
    });
    styleReference =
      tok.styleReference ||
      formatCompactStyleReference({
        source: tab.title || "Page",
        exportedAt: new Date().toISOString(),
        tokens: tok.tokens,
        buttons: tok.buttons || [],
        links: tok.links || [],
        designSystem,
        components: tok.components || [],
      });
  } catch (_) {}

  await setExtensionChromeVisible(tab.id, false);
  await new Promise((r) => setTimeout(r, 80));
  let screenshotBase64;
  try {
    const shot = await cdpCaptureNodePng(tab.id, selector);
    screenshotBase64 = shot.base64;
  } catch (err) {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    screenshotBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    inspect.fidelityNotes = [
      ...(inspect.fidelityNotes || []),
      `node_shot_fallback_visible: ${err.message || err}`,
    ];
  } finally {
    await setExtensionChromeVisible(tab.id, true);
  }

  const [{ result: meta } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => ({
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dpr: window.devicePixelRatio || 1,
    }),
  });

  const fidelityNotes = [
    ...(inspect.fidelityNotes || []),
    ...(interaction.fidelityNotes || []),
    "Screenshot is pixel-accurate; code must follow specs — do not invent spacing/colors.",
  ];

  return {
    meta,
    section: {
      name: params.sectionName || selector,
      selector,
      html: inspect?.root?.html || "",
    },
    inspect,
    specs: inspect?.specs || null,
    interaction: {
      rules: interaction.rules,
      hoverScreenshotBase64: interaction.hoverScreenshotBase64,
    },
    screenshotBase64,
    images: imagesRes.images,
    tokens,
    designSystem,
    styleReference,
    fidelityNotes,
    agentPrompt: null,
  };
}

setMcpHandlers({
  async ping() {
    const manifest = chrome.runtime.getManifest();
    return {
      pong: true,
      extensionVersion: manifest.version,
      bridge: mcpConnectionState(),
    };
  },

  async list_tabs() {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs
        .filter((t) => t.id && t.url && !isBlockedUrl(t.url))
        .map((t) => ({
          id: t.id,
          title: t.title || "",
          url: t.url,
          active: !!t.active,
        })),
    };
  },

  async screenshot(params = {}) {
    const tab = await mcpResolveTab(params.tabId);
    const mode = params.mode || "visible";
    await setExtensionChromeVisible(tab.id, false);
    await new Promise((r) => setTimeout(r, 80));
    try {
      if (mode === "fullPage") {
        const dataUrl = await captureFullPagePng(tab);
        return {
          mimeType: "image/png",
          base64: dataUrl.replace(/^data:image\/png;base64,/, ""),
        };
      }
      if (mode === "node") {
        if (!params.selector) throw new Error("selector required for node screenshot");
        return await cdpCaptureNodePng(tab.id, params.selector);
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      return {
        mimeType: "image/png",
        base64: dataUrl.replace(/^data:image\/png;base64,/, ""),
      };
    } finally {
      await setExtensionChromeVisible(tab.id, true);
    }
  },

  extract_tokens: mcpExtractTokens,
  list_sections: async (params = {}) => {
    const tab = await mcpResolveTab(params.tabId);
    await mcpInject(tab.id, ["sectionDetect.js"]);
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => window.__htfyDetectSections?.() || [],
    });
    return { sections: result || [] };
  },
  inspect: mcpInspect,
  interaction_css: mcpInteractionCss,
  export_images: mcpExportImages,
  bundle: mcpBundle,
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "htfy_MCP_STATUS") {
    sendResponse({ state: mcpConnectionState() });
    return false;
  }
  if (msg?.type === "htfy_MCP_RECONNECT") {
    disconnectMcpBridge();
    connectMcpBridge().then(() => sendResponse({ ok: true, state: mcpConnectionState() }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  connectMcpBridge().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  connectMcpBridge().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.mcpPort || changes.mcpToken || changes.mcpEnabled) {
    disconnectMcpBridge();
    connectMcpBridge().catch(() => {});
  }
});

try {
  chrome.alarms.create("mcpKeepalive", { periodInMinutes: 0.5 });
} catch (_) {}

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === "mcpKeepalive") connectMcpBridge().catch(() => {});
});

getMcpSettings().then(() => connectMcpBridge()).catch(() => {});
