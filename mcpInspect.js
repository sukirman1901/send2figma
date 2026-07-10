/**
 * Page-world helpers for MCP inspect / interaction CSS / images / HTML sanitize.
 */
(function () {
  if (window.__htfyMcpInspect) return;

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
    "overflow-x",
    "overflow-y",
    "opacity",
    "box-shadow",
    "transform",
    "filter",
    "z-index",
    "object-fit",
  ]);

  function isOurChrome(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === "htfyRoot" || (el.id || "").startsWith("__htfy")) return true;
    if (el.getAttribute("data-htfy-chrome") === "1") return true;
    return !!el.closest?.("#htfyRoot, [id^='__htfy'], [data-htfy-chrome='1']");
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function filterComputed(style) {
    const out = {};
    for (const key of COMPUTED_ALLOW) {
      try {
        const v = style.getPropertyValue(key);
        if (v) out[key] = v;
      } catch (_) {}
    }
    return out;
  }

  function sanitizeHtml(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, noscript, style[data-htfy], #htfyRoot, [data-htfy-chrome='1'], [id^='__htfy']").forEach((n) => n.remove());
    clone.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === "srcdoc") el.removeAttribute(attr.name);
      }
    });
    return clone.outerHTML;
  }

  function collectInteractionRules(root) {
    const rules = [];
    const pseudoRe = /:(hover|focus|focus-visible|focus-within|active|disabled)\b/;
    try {
      for (const sheet of document.styleSheets) {
        let cssRules;
        try {
          cssRules = sheet.cssRules;
        } catch (_) {
          continue;
        }
        if (!cssRules) continue;
        for (const rule of cssRules) {
          if (!rule.selectorText || !pseudoRe.test(rule.selectorText)) continue;
          try {
            // Keep if any node in subtree might match the non-pseudo part (best-effort)
            const rough = rule.selectorText.replace(pseudoRe, "").trim();
            if (rough && root.querySelector(rough.split(",")[0].trim())) {
              rules.push({
                selector: rule.selectorText,
                source: sheet.href || "inline",
                cssText: rule.cssText,
                origin: sheet.href ? "author" : "inline",
              });
            } else if (!rough || rough === "" || rough === "*") {
              rules.push({
                selector: rule.selectorText,
                source: sheet.href || "inline",
                cssText: rule.cssText,
                origin: sheet.href ? "author" : "inline",
              });
            }
          } catch (_) {
            rules.push({
              selector: rule.selectorText,
              source: sheet.href || "inline",
              cssText: rule.cssText,
              origin: "unknown",
            });
          }
          if (rules.length >= 200) return rules;
        }
      }
    } catch (_) {}
    return rules;
  }

  function collectImages(root) {
    const urls = new Set();
    root.querySelectorAll("img").forEach((img) => {
      const u = img.currentSrc || img.src;
      if (u && !u.startsWith("data:")) urls.add(u);
    });
    root.querySelectorAll("*").forEach((el) => {
      try {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === "none") return;
        const re = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;
        let m;
        while ((m = re.exec(bg))) {
          if (m[2] && !m[2].startsWith("data:")) urls.add(m[2]);
        }
      } catch (_) {}
    });
    return [...urls].slice(0, 60);
  }

  function inspectDom(selector, maxChildren = 40) {
    const root = document.querySelector(selector);
    if (!root || isOurChrome(root)) throw new Error(`Element not found: ${selector}`);

    const rootStyle = getComputedStyle(root);
    const rootInspect = {
      selector,
      tag: root.tagName.toLowerCase(),
      html: sanitizeHtml(root),
      computed: filterComputed(rootStyle),
      matchedRules: [], // filled via CDP when available
      boxModel: null,
    };

    const children = [];
    const nodes = root.querySelectorAll("*");
    let n = 0;
    for (const el of nodes) {
      if (isOurChrome(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      children.push({
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        computed: filterComputed(getComputedStyle(el)),
        matchedRules: [],
        boxModel: null,
      });
      if (++n >= maxChildren) break;
    }

    return {
      url: location.href,
      title: document.title,
      root: rootInspect,
      children,
      capturedAt: new Date().toISOString(),
      fidelityNotes: ["matched_rules_pending_cdp"],
    };
  }

  window.__htfyMcpInspect = {
    inspectDom,
    collectInteractionRules: (selector) => {
      const root = document.querySelector(selector);
      if (!root) throw new Error(`Element not found: ${selector}`);
      return collectInteractionRules(root);
    },
    collectImages: (selector) => {
      const root = document.querySelector(selector);
      if (!root) throw new Error(`Element not found: ${selector}`);
      return collectImages(root);
    },
    sanitizeHtml: (selector) => {
      const root = document.querySelector(selector);
      if (!root) throw new Error(`Element not found: ${selector}`);
      return sanitizeHtml(root);
    },
    filterComputed,
    cssPath,
  };
})();
