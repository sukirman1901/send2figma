/**
 * Page-world helpers adopted from SuperDev-style tooling:
 * - stylesheet harvest
 * - inherited CSS recovery (iframe initial vs styled)
 * - raster capture hygiene (sticky/fixed + kill animations)
 * - color flattening via canvas
 */
(() => {
  if (window.__htfySuperDevHelpers) return;

  const INHERITED = [
    "border-collapse",
    "border-spacing",
    "caption-side",
    "color",
    "cursor",
    "direction",
    "empty-cells",
    "font-family",
    "font-size",
    "font-style",
    "font-variant",
    "font-weight",
    "font-stretch",
    "letter-spacing",
    "line-height",
    "list-style",
    "orphans",
    "quotes",
    "tab-size",
    "text-align",
    "text-align-last",
    "text-indent",
    "text-transform",
    "visibility",
    "white-space",
    "widows",
    "word-break",
    "word-spacing",
    "word-wrap",
  ];

  function harvestStylesheets() {
    const sheets = [];
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.href) {
          sheets.push({ href: sheet.href });
          continue;
        }
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        let cssText = "";
        for (let i = 0; i < rules.length; i++) cssText += rules[i].cssText + "\n";
        sheets.push({ cssText, base: location.href });
      } catch (_) {
        if (sheet.href) sheets.push({ href: sheet.href });
      }
    }
    return sheets;
  }

  function resolveCssVars(style) {
    const out = {};
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      let val = style.getPropertyValue(prop);
      if (!val) continue;
      if (val.includes("var(")) {
        // Computed style is already resolved; keep as-is
      }
      out[prop] = val.trim();
    }
    return out;
  }

  function flattenColor(value) {
    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return value;
    if (/^#|^rgb|^hsl/i.test(value) && !/color\(|oklab|oklch|lab\(|lch\(/i.test(value)) {
      return value;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillStyle = value;
      const normalized = ctx.fillStyle;
      if (normalized && normalized !== "#000000") return normalized;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return "rgba(0, 0, 0, 0)";
      if (a === 255) return `rgb(${r}, ${g}, ${b})`;
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      return value;
    }
  }

  /**
   * Recover inheritable styles that would be lost if the subtree were detached.
   * Technique from SuperDev Export Element (iframe styled vs initial).
   * Skips huge subtrees — cloning multi-MB outerHTML freezes the main thread.
   */
  async function recoverInheritedCss(rootEl, opts = {}) {
    if (!rootEl || rootEl.nodeType !== 1) return {};
    const maxHtml = typeof opts.maxHtmlBytes === "number" ? opts.maxHtmlBytes : 500_000;
    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 2000;
    let html;
    try {
      html = rootEl.outerHTML;
    } catch (_) {
      return {};
    }
    if (!html || html.length > maxHtml) {
      return { __skipped: true, reason: "html_too_large", bytes: html?.length || 0 };
    }

    const run = async () => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("data-h2d-ignore", "true");
      iframe.style.cssText =
        "position:fixed;left:-10000px;top:0;width:800px;height:600px;opacity:0;pointer-events:none;border:0;";
      document.documentElement.appendChild(iframe);
      let iframe2 = null;

      try {
        const doc = iframe.contentDocument;
        doc.open();
        doc.write(`<!doctype html><html><head></head><body>${html}</body></html>`);
        doc.close();
        await new Promise((r) => setTimeout(r, 30));

        const live = getComputedStyle(rootEl);
        const probe = doc.body.firstElementChild;
        if (!probe) return {};
        const isolated = getComputedStyle(probe);

        iframe2 = document.createElement("iframe");
        iframe2.setAttribute("data-h2d-ignore", "true");
        iframe2.style.cssText = iframe.style.cssText;
        document.documentElement.appendChild(iframe2);
        const doc2 = iframe2.contentDocument;
        doc2.open();
        doc2.write(
          `<!doctype html><html><head><style>body>*{all:revert}</style></head><body>${html}</body></html>`
        );
        doc2.close();
        await new Promise((r) => setTimeout(r, 30));
        const initialEl = doc2.body.firstElementChild;
        const initial = initialEl ? getComputedStyle(initialEl) : null;

        const recovered = {};
        for (const prop of INHERITED) {
          const liveVal = live.getPropertyValue(prop);
          const isoVal = isolated.getPropertyValue(prop);
          const initVal = initial ? initial.getPropertyValue(prop) : "";
          if (liveVal && liveVal !== isoVal) {
            recovered[prop] = flattenColor(liveVal);
          } else if (liveVal && initVal && liveVal !== initVal && prop.startsWith("font")) {
            recovered[prop] = liveVal;
          }
        }
        return recovered;
      } catch (err) {
        console.warn("[Send2Figma] inherited CSS recovery failed:", err.message || err);
        return {};
      } finally {
        try {
          iframe2?.remove();
        } catch (_) {}
        try {
          iframe.remove();
        } catch (_) {}
      }
    };

    try {
      return await Promise.race([
        run(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ __skipped: true, reason: "timeout" }), timeoutMs)
        ),
      ]);
    } catch (err) {
      console.warn("[Send2Figma] inherited CSS recovery failed:", err.message || err);
      return {};
    }
  }

  function applyInheritedToRoot(rootEl, inherited) {
    if (!rootEl || !inherited || !Object.keys(inherited).length) return () => {};
    const prev = rootEl.getAttribute("style") || "";
    const extra = Object.entries(inherited)
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
    rootEl.style.cssText = `${prev};${extra}`;
    rootEl.setAttribute("data-h2d-inherited", "1");
    return () => {
      rootEl.setAttribute("style", prev);
      rootEl.removeAttribute("data-h2d-inherited");
    };
  }

  /** Raster hygiene: kill animations, hide scrollbars, manage sticky/fixed. */
  function installRasterHygiene(opts = {}) {
    const stickyToRelative = opts.stickyToRelative === true;
    const trackFixed = opts.trackFixed !== false;

    const style = document.createElement("style");
    style.id = "__htfy_cssFixes__";
    style.setAttribute("data-h2d-ignore", "true");
    style.textContent = `
      html, body, .scrollElem { scroll-behavior: auto !important; }
      * {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    `;
    document.documentElement.appendChild(style);

    const sticky = [];
    const fixed = [];
    document.querySelectorAll("body, body *").forEach((el) => {
      try {
        // Never treat our chrome as page fixed chrome to hide.
        const id = el.id || "";
        if (id === "htfyRoot" || id.startsWith("__htfy") || el.getAttribute("data-htfy-chrome") === "1") {
          return;
        }
        const pos = getComputedStyle(el).position;
        if (stickyToRelative && pos === "sticky") {
          sticky.push({
            el,
            position: el.style.position,
            inset: el.style.inset,
            top: el.style.top,
          });
          el.style.setProperty("position", "relative", "important");
          el.style.setProperty("inset", "auto", "important");
        } else if (trackFixed && pos === "fixed") {
          fixed.push({
            el,
            visibility: el.style.visibility,
            overflow: el.style.overflow,
          });
        }
      } catch (_) {}
    });

    return {
      hideFixed(exceptIds = []) {
        const except = new Set(exceptIds.filter(Boolean));
        for (const item of fixed) {
          if (except.has(item.el.id)) continue;
          // Keep hard-region targets and their ancestors visible.
          if (item.el.closest?.("[data-h2d-hard-raster]")) continue;
          if (item.el.querySelector?.("[data-h2d-hard-raster]")) continue;
          item.el.style.setProperty("visibility", "hidden", "important");
          item.el.style.setProperty("overflow", "hidden", "important");
        }
      },
      showFixed() {
        for (const item of fixed) {
          if (item.visibility) item.el.style.visibility = item.visibility;
          else item.el.style.removeProperty("visibility");
          if (item.overflow) item.el.style.overflow = item.overflow;
          else item.el.style.removeProperty("overflow");
        }
      },
      cleanup() {
        style.remove();
        for (const item of sticky) {
          if (item.position) item.el.style.position = item.position;
          else item.el.style.removeProperty("position");
          if (item.inset) item.el.style.inset = item.inset;
          else item.el.style.removeProperty("inset");
          if (item.top) item.el.style.top = item.top;
        }
        this.showFixed();
      },
    };
  }

  function collectAssetUrls(root, opts = {}) {
    const urls = new Set();
    const maxNodes = typeof opts.maxNodes === "number" ? opts.maxNodes : 4000;
    const add = (u) => {
      if (!u || u.startsWith("data:") || u.startsWith("blob:")) return;
      try {
        urls.add(new URL(u, location.href).href);
      } catch (_) {}
    };
    root.querySelectorAll("img, source, video, image").forEach((el) => {
      add(el.currentSrc || el.src || el.getAttribute("href") || el.getAttribute("xlink:href"));
      const srcset = el.getAttribute("srcset");
      if (srcset) {
        srcset.split(",").forEach((part) => add(part.trim().split(/\s+/)[0]));
      }
    });
    const all = root.querySelectorAll("*");
    const limit = Math.min(all.length, maxNodes);
    for (let i = 0; i < limit; i++) {
      const el = all[i];
      try {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === "none") continue;
        const re = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;
        let m;
        while ((m = re.exec(bg))) add(m[2]);
      } catch (_) {}
    }
    return [...urls];
  }

  function requestCssResolve(sheets, opts = {}) {
    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 6000;
    return new Promise((resolve) => {
      if (!sheets?.length) {
        resolve("");
        return;
      }
      const id = "css_" + Math.random().toString(36).slice(2);
      let settled = false;
      const finish = (css) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMsg);
        resolve(css || "");
      };
      const onMsg = (e) => {
        if (e.source !== window) return;
        const data = e.data;
        if (!data || data.type !== "__htfy_css_resolved__" || data.id !== id) return;
        finish(data.cssText || "");
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "__htfy_css_resolve__", id, sheets }, "*");
      setTimeout(() => finish(""), timeoutMs);
    });
  }

  window.__htfySuperDevHelpers = {
    harvestStylesheets,
    recoverInheritedCss,
    applyInheritedToRoot,
    installRasterHygiene,
    collectAssetUrls,
    requestCssResolve,
    flattenColor,
    resolveCssVars,
  };
})();
