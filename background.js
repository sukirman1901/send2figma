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
import { buildCaptureWarnings } from "./src/composeFrames.js";
import { buildDesignSystemExport, summarizeDesignSystem } from "./src/designSystem.js";

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
