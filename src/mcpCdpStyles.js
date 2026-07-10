/**
 * CDP helpers for MCP inspect (matched styles, computed, box model, force pseudo).
 * Used from the extension service worker via chrome.debugger.
 */

const COMPUTED_ALLOW = new Set([
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "justify-content",
  "align-items",
  "align-self",
  "align-content",
  "gap",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "overflow",
  "opacity",
  "box-shadow",
  "transform",
  "filter",
  "z-index",
  "object-fit",
]);

function filterComputedEntries(entries) {
  const out = {};
  for (const e of entries || []) {
    const name = e.name || e;
    const value = e.value;
    if (COMPUTED_ALLOW.has(name) && value != null) out[name] = value;
  }
  return out;
}

function mapMatchedRules(matched) {
  const rules = [];
  const pushRule = (rule, origin) => {
    if (!rule) return;
    const selector =
      rule.selectorList?.text ||
      rule.selectorText ||
      (rule.style?.cssText ? "(inline)" : "");
    const cssText = rule.style?.cssText || rule.cssText || "";
    if (!selector && !cssText) return;
    rules.push({
      selector,
      source: rule.origin || origin || "unknown",
      cssText,
      origin: origin || "author",
    });
  };

  for (const m of matched?.matchedCSSRules || []) {
    pushRule(m.rule, m.rule?.origin || "author");
  }
  for (const rule of matched?.inherited?.[0]?.matchedCSSRules || []) {
    pushRule(rule.rule, "inherited");
  }
  if (matched?.inlineStyle?.cssText) {
    rules.unshift({
      selector: "(inline)",
      source: "inline",
      cssText: matched.inlineStyle.cssText,
      origin: "inline",
    });
  }
  return rules.slice(0, 80);
}

export async function withDebugger(tabId, run) {
  let attached = false;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    try {
      await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
    } catch (_) {}
    try {
      await chrome.debugger.sendCommand({ tabId }, "CSS.enable");
    } catch (_) {}
    return await run();
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach({ tabId });
      } catch (_) {}
    }
  }
}

export async function cdpInspectNode(tabId, selector) {
  return withDebugger(tabId, async () => {
    const doc = await chrome.debugger.sendCommand({ tabId }, "DOM.getDocument", {
      depth: 1,
    });
    const { nodeId } = await chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`CDP: node not found for ${selector}`);

    let matched = null;
    let computed = {};
    let boxModel = null;

    try {
      matched = await chrome.debugger.sendCommand({ tabId }, "CSS.getMatchedStylesForNode", {
        nodeId,
      });
    } catch (_) {}

    try {
      const comp = await chrome.debugger.sendCommand({ tabId }, "CSS.getComputedStyleForNode", {
        nodeId,
      });
      computed = filterComputedEntries(comp.computedStyle);
    } catch (_) {}

    try {
      const box = await chrome.debugger.sendCommand({ tabId }, "DOM.getBoxModel", { nodeId });
      if (box?.model) {
        boxModel = {
          content: box.model.content,
          padding: box.model.padding,
          border: box.model.border,
          margin: box.model.margin,
          width: box.model.width,
          height: box.model.height,
        };
      }
    } catch (_) {}

    return {
      matchedRules: mapMatchedRules(matched),
      computed,
      boxModel,
      nodeId,
    };
  });
}

export async function cdpForceHoverAndCapture(tabId, selector, { screenshot = true } = {}) {
  return withDebugger(tabId, async () => {
    const doc = await chrome.debugger.sendCommand({ tabId }, "DOM.getDocument", {
      depth: 1,
    });
    const { nodeId } = await chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`CDP: node not found for ${selector}`);

    await chrome.debugger.sendCommand({ tabId }, "CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: ["hover"],
    });
    await new Promise((r) => setTimeout(r, 120));

    let hoverScreenshotBase64;
    if (screenshot) {
      let clip;
      try {
        const box = await chrome.debugger.sendCommand({ tabId }, "DOM.getBoxModel", { nodeId });
        const m = box?.model;
        if (m) {
          const xs = m.border.filter((_, i) => i % 2 === 0);
          const ys = m.border.filter((_, i) => i % 2 === 1);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          clip = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, scale: 1 };
        }
      } catch (_) {}
      try {
        await chrome.debugger.sendCommand({ tabId }, "Page.enable");
      } catch (_) {}
      const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: true,
        ...(clip ? { clip } : {}),
      });
      hoverScreenshotBase64 = result?.data;
    }

    await chrome.debugger.sendCommand({ tabId }, "CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: [],
    });

    return { hoverScreenshotBase64 };
  });
}

export async function cdpCaptureNodePng(tabId, selector) {
  return withDebugger(tabId, async () => {
    const doc = await chrome.debugger.sendCommand({ tabId }, "DOM.getDocument", {
      depth: 1,
    });
    const { nodeId } = await chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`CDP: node not found for ${selector}`);

    let clip;
    try {
      const box = await chrome.debugger.sendCommand({ tabId }, "DOM.getBoxModel", { nodeId });
      const m = box?.model;
      if (m) {
        const xs = m.border.filter((_, i) => i % 2 === 0);
        const ys = m.border.filter((_, i) => i % 2 === 1);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const width = Math.max(...xs) - x;
        const height = Math.max(...ys) - y;
        clip = { x, y, width, height, scale: 1 };
      }
    } catch (_) {}

    try {
      await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    } catch (_) {}

    const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      ...(clip ? { clip } : {}),
    });
    if (!result?.data) throw new Error("CDP screenshot empty");
    return {
      mimeType: "image/png",
      base64: result.data,
      width: clip?.width,
      height: clip?.height,
    };
  });
}
