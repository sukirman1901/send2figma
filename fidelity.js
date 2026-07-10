/**
 * Fidelity layer — wraps __htfyLiteCapture.captureForDesign
 * Materializes pseudos, settles motion, hardens SVG/select, enriches fonts/tokens.
 */
(() => {
  if (window.__htfyFidelityWrapped) return;
  window.__htfyFidelityWrapped = true;

  const PSEUDO_ATTR = "data-h2d-pseudo";
  const MARK_ATTR = "data-h2d-fidelity";
  const HIDDEN_ATTR = "data-h2d-was-hidden";
  const SELECT_ATTR = "data-h2d-select-proxy";
  const HARD_ATTR = "data-h2d-hard-raster";
  const IFRAME_ATTR = "data-h2d-iframe-proxy";

  function toast(text, isError) {
    try {
      document.dispatchEvent(
        new CustomEvent("__htfy_progress__", { detail: { text, isError: !!isError } })
      );
    } catch (_) {}
    // Keep dock/panel visible during capture — still show page toasts for status.
    if (window.__htfyShowToast) window.__htfyShowToast(text, !!isError);
  }

  /** Our dock/panel/toast hosts — must never enter the Figma payload. */
  function isExtensionChrome(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const id = el.id || "";
      if (id === "htfyRoot" || id.startsWith("__htfy")) return true;
      if (el.getAttribute("data-htfy-chrome") === "1") return true;
      if (el.getAttribute("data-h2d-ignore") === "true" && (id === "htfyRoot" || id.startsWith("__htfy"))) {
        return true;
      }
      if (el.closest?.("#htfyRoot, [id^='__htfy'], [data-htfy-chrome='1']")) return true;
      const root = el.getRootNode?.();
      if (root && root !== document && root.host) return isExtensionChrome(root.host);
    } catch (_) {}
    return false;
  }

  /**
   * Mark extension chrome so serializers skip it — do NOT detach from the DOM.
   * Users need the dock/panel visible to monitor capture progress; contentscript
   * already omits #htfyRoot / [data-htfy-chrome] / data-h2d-ignore nodes.
   */
  function markExtensionChrome() {
    try {
      const root = document.getElementById("htfyRoot");
      if (root) {
        root.setAttribute("data-h2d-ignore", "true");
        root.setAttribute("data-htfy-chrome", "1");
      }
      document.querySelectorAll('[id^="__htfy"], [data-htfy-chrome="1"]').forEach((el) => {
        el.setAttribute("data-h2d-ignore", "true");
        el.setAttribute("data-htfy-chrome", "1");
      });
    } catch (_) {}
    return () => {};
  }

  function cssTextFromComputed(style, extra = {}) {
    const props = [
      "display",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "width",
      "height",
      "minWidth",
      "minHeight",
      "maxWidth",
      "maxHeight",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "boxSizing",
      "backgroundColor",
      "backgroundImage",
      "backgroundSize",
      "backgroundPosition",
      "backgroundRepeat",
      "backgroundClip",
      "backgroundOrigin",
      "backgroundBlendMode",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderTopStyle",
      "borderRightStyle",
      "borderBottomStyle",
      "borderLeftStyle",
      "borderTopColor",
      "borderRightColor",
      "borderBottomColor",
      "borderLeftColor",
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
      "boxShadow",
      "opacity",
      "transform",
      "transformOrigin",
      "filter",
      "backdropFilter",
      "overflow",
      "zIndex",
      "color",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "fontStretch",
      "lineHeight",
      "letterSpacing",
      "textAlign",
      "textDecoration",
      "textTransform",
      "whiteSpace",
      "verticalAlign",
      "objectFit",
      "objectPosition",
      "pointerEvents",
      "content",
      "flex",
      "alignSelf",
      "order",
      "gridArea",
      "float",
      "clear",
      "clipPath",
      "maskImage",
      "webkitMaskImage",
    ];
    const parts = [];
    for (const p of props) {
      const v = extra[p] ?? style[p];
      if (v == null || v === "" || v === "none" && p !== "display") continue;
      const css = p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      parts.push(`${css}:${v}`);
    }
    if (!extra.pointerEvents) parts.push("pointer-events:none");
    return parts.join(";");
  }

  function parseContent(content) {
    if (!content || content === "none" || content === "normal") return null;
    const urlMatch = content.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
    if (urlMatch) return { type: "url", value: urlMatch[2] };
    const strMatch = content.match(/^(['"])([\s\S]*)\1$/);
    if (strMatch) return { type: "text", value: strMatch[2].replace(/\\(["'/\\])/g, "$1") };
    if (content === "open-quote" || content === "close-quote") return { type: "text", value: '"' };
    return { type: "text", value: content.replace(/^["']|["']$/g, "") };
  }

  function materializePseudos(root, opts = {}) {
    const created = [];
    const hosts = new Set();
    const maxNodes = typeof opts.maxNodes === "number" ? opts.maxNodes : 4000;
    const all = [root, ...root.querySelectorAll("*")].filter((n) => n.nodeType === 1);
    const els = all.slice(0, maxNodes);
    for (const el of els) {
      if (el.hasAttribute(PSEUDO_ATTR) || el.hasAttribute(MARK_ATTR)) continue;
      if (isExtensionChrome(el)) continue;
      for (const pseudo of ["::before", "::after"]) {
        let style;
        try {
          style = getComputedStyle(el, pseudo);
        } catch (_) {
          continue;
        }
        const parsed = parseContent(style.content);
        if (!parsed) continue;
        if (style.display === "none") continue;

        const node = document.createElement("span");
        node.setAttribute(PSEUDO_ATTR, pseudo.slice(2));
        node.setAttribute(MARK_ATTR, "pseudo");
        node.style.cssText = cssTextFromComputed(style, {
          display: style.display === "normal" ? "inline" : style.display,
          content: "normal",
        });

        if (parsed.type === "url") {
          const img = document.createElement("img");
          img.src = parsed.value;
          img.alt = "";
          img.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
          node.appendChild(img);
        } else if (parsed.value) {
          node.textContent = parsed.value;
        }

        if (pseudo === "::before") el.insertBefore(node, el.firstChild);
        else el.appendChild(node);
        created.push(node);
        hosts.add(el);
      }
    }

    // Kill original CSS pseudos so layout isn't measured twice (span + ::before/::after).
    let styleEl = null;
    if (hosts.size) {
      for (const host of hosts) {
        host.setAttribute("data-h2d-pseudo-host", "1");
      }
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-h2d-ignore", "true");
      styleEl.setAttribute(MARK_ATTR, "pseudo-kill");
      styleEl.textContent = `
        [data-h2d-pseudo-host="1"]::before,
        [data-h2d-pseudo-host="1"]::after {
          content: none !important;
          display: none !important;
        }
      `;
      document.documentElement.appendChild(styleEl);
    }

    return () => {
      for (const n of created) n.remove();
      for (const host of hosts) host.removeAttribute("data-h2d-pseudo-host");
      styleEl?.remove();
    };
  }

  async function settleAnimations(root, { strategy = "pause" } = {}) {
    try {
      const anims =
        typeof root.getAnimations === "function"
          ? root.getAnimations({ subtree: true })
          : typeof document.getAnimations === "function"
            ? document.getAnimations({ subtree: true })
            : [];
      for (const a of anims) {
        try {
          if (strategy === "finish") a.finish();
          else a.pause();
        } catch (_) {
          try {
            a.cancel();
          } catch (_) {}
        }
      }
      if (strategy === "finish") {
        await Promise.all(
          anims.map((a) => (a.finished ? a.finished.catch(() => {}) : Promise.resolve()))
        );
      }
    } catch (_) {}
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, strategy === "finish" ? 80 : 30));
  }

  function isVisiblyPainted(el) {
    try {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (parseFloat(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch (_) {
      return false;
    }
  }

  const MENU_PANEL_SEL =
    '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], .menu-panel, .dropdown-menu, [data-radix-menu-content], [data-radix-dropdown-menu-content], [data-radix-select-content], [data-radix-popper-content-wrapper], [data-headlessui-state], .tippy-box, [data-state="open"], [data-state="closed"]';

  function forceRevealPanel(el, touched) {
    if (!el || el.nodeType !== 1) return;
    const style = getComputedStyle(el);
    const prev = {
      display: el.style.getPropertyValue("display"),
      displayP: el.style.getPropertyPriority("display"),
      visibility: el.style.getPropertyValue("visibility"),
      visibilityP: el.style.getPropertyPriority("visibility"),
      opacity: el.style.getPropertyValue("opacity"),
      opacityP: el.style.getPropertyPriority("opacity"),
      transform: el.style.getPropertyValue("transform"),
      transformP: el.style.getPropertyPriority("transform"),
      pointerEvents: el.style.getPropertyValue("pointer-events"),
      pointerEventsP: el.style.getPropertyPriority("pointer-events"),
      ariaHidden: el.getAttribute("aria-hidden"),
      dataState: el.getAttribute("data-state"),
    };
    if (style.display === "none") el.style.setProperty("display", "block", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    if (style.transform && style.transform !== "none" && /translate/i.test(style.transform)) {
      // Keep layout transforms; only clear pure hide-offscreen if needed
    }
    if (el.getAttribute("aria-hidden") === "true") el.setAttribute("aria-hidden", "false");
    if (el.getAttribute("data-state") === "closed") el.setAttribute("data-state", "open");
    el.setAttribute(MARK_ATTR, "forced-open");
    el.removeAttribute("data-h2d-ignore");
    touched.push(() => {
      const restore = (prop, value, priority) => {
        if (value) el.style.setProperty(prop, value, priority || "");
        else el.style.removeProperty(prop);
      };
      restore("display", prev.display, prev.displayP);
      restore("visibility", prev.visibility, prev.visibilityP);
      restore("opacity", prev.opacity, prev.opacityP);
      restore("transform", prev.transform, prev.transformP);
      restore("pointer-events", prev.pointerEvents, prev.pointerEventsP);
      if (prev.ariaHidden == null) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", prev.ariaHidden);
      if (prev.dataState == null) el.removeAttribute("data-state");
      else el.setAttribute("data-state", prev.dataState);
      el.removeAttribute(MARK_ATTR);
    });

    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      if (p.classList && !p.classList.contains("open") && !p.classList.contains("show")) {
        if (
          p.classList.contains("menu") ||
          p.classList.contains("dropdown") ||
          p.classList.contains("popover") ||
          p.hasAttribute("data-radix-menu") ||
          p.getAttribute("data-state") === "closed"
        ) {
          const hadOpen = p.classList.contains("open");
          const hadShow = p.classList.contains("show");
          const prevState = p.getAttribute("data-state");
          if (!hadOpen) p.classList.add("open");
          if (!hadShow && p.classList.contains("dropdown")) p.classList.add("show");
          if (prevState === "closed") p.setAttribute("data-state", "open");
          touched.push(() => {
            if (!hadOpen) p.classList.remove("open");
            if (!hadShow) p.classList.remove("show");
            if (prevState == null) p.removeAttribute("data-state");
            else p.setAttribute("data-state", prevState);
          });
        }
      }
      p = p.parentElement;
    }
  }

  function expandInteractive(root, { forceOpen = false } = {}) {
    const touched = [];
    const scopes = [root];
    if (
      forceOpen &&
      root !== document.body &&
      root !== document.documentElement &&
      document.body
    ) {
      scopes.push(document.body);
    }

    if (!forceOpen) {
      root.querySelectorAll("details:not([open])").forEach((d) => {
        d.setAttribute("open", "");
        d.setAttribute(MARK_ATTR, "expanded-details");
        touched.push(() => {
          d.removeAttribute("open");
          d.removeAttribute(MARK_ATTR);
        });
      });
      root.querySelectorAll("[popover]:not(:popover-open)").forEach((el) => {
        try {
          if (typeof el.showPopover === "function") {
            el.showPopover();
            el.setAttribute(MARK_ATTR, "expanded-popover");
            touched.push(() => {
              try {
                el.hidePopover();
              } catch (_) {}
              el.removeAttribute(MARK_ATTR);
            });
          }
        } catch (_) {}
      });
      return () => touched.forEach((fn) => fn());
    }

    // --- forceOpen: dual-frame "Open" — open menus/selects even if user didn't ---
    for (const scope of scopes) {
      scope.querySelectorAll("select").forEach((sel) => {
        if (sel.dataset.h2dExpand === "1") return;
        sel.dataset.h2dExpand = "1";
        touched.push(() => {
          delete sel.dataset.h2dExpand;
        });
      });

      scope.querySelectorAll("details:not([open])").forEach((d) => {
        d.setAttribute("open", "");
        d.setAttribute(MARK_ATTR, "expanded-details");
        touched.push(() => {
          d.removeAttribute("open");
          d.removeAttribute(MARK_ATTR);
        });
      });

      scope.querySelectorAll("[popover]:not(:popover-open)").forEach((el) => {
        try {
          if (typeof el.showPopover === "function") {
            el.showPopover();
            el.setAttribute(MARK_ATTR, "expanded-popover");
            touched.push(() => {
              try {
                el.hidePopover();
              } catch (_) {}
              el.removeAttribute(MARK_ATTR);
            });
          }
        } catch (_) {}
      });

      // Toggle closed triggers (skip if already expanded)
      scope
        .querySelectorAll(
          '[aria-expanded="false"], [aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"], [data-state="closed"]'
        )
        .forEach((btn) => {
          if (btn.getAttribute("aria-expanded") === "true") return;
          if (btn.getAttribute(MARK_ATTR) === "trigger-opened") return;
          try {
            const before = btn.getAttribute("aria-expanded");
            btn.click();
            btn.setAttribute("aria-expanded", "true");
            btn.setAttribute(MARK_ATTR, "trigger-opened");
            touched.push(() => {
              if (before == null) btn.removeAttribute("aria-expanded");
              else btn.setAttribute("aria-expanded", before);
              btn.removeAttribute(MARK_ATTR);
            });
          } catch (_) {}
        });

      // Class-based menus (fixture .menu / Bootstrap / etc.)
      scope.querySelectorAll(".menu:not(.open), .dropdown:not(.open), .dropdown:not(.show)").forEach((menu) => {
        const hadOpen = menu.classList.contains("open");
        const hadShow = menu.classList.contains("show");
        if (!hadOpen) menu.classList.add("open");
        if (!hadShow) menu.classList.add("show");
        menu.setAttribute(MARK_ATTR, "menu-opened");
        const btn = menu.querySelector('[aria-expanded], button, [role="button"]');
        if (btn) btn.setAttribute("aria-expanded", "true");
        touched.push(() => {
          if (!hadOpen) menu.classList.remove("open");
          if (!hadShow) menu.classList.remove("show");
          menu.removeAttribute(MARK_ATTR);
        });
      });

      scope.querySelectorAll(MENU_PANEL_SEL).forEach((el) => {
        if (!isVisiblyPainted(el) || el.getAttribute("data-state") === "closed") {
          forceRevealPanel(el, touched);
        }
      });
    }

    return () => touched.forEach((fn) => fn());
  }

  function isOpenOverlay(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isExtensionChrome(el)) return false;
    const mark = el.getAttribute(MARK_ATTR);
    if (mark === "forced-open" || mark === "overlay-open" || mark === "menu-opened") return true;
    if (!isVisiblyPainted(el) && mark !== "forced-open") {
      // Closed role=menu panels must not block culling
      return false;
    }
    try {
      if (
        el.matches(
          '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [data-state="open"], [data-open], [aria-expanded="true"], :popover-open, .tippy-box, [data-radix-popper-content-wrapper], [data-headlessui-state*="open"]'
        )
      ) {
        return true;
      }
    } catch (_) {
      // :popover-open may throw on older engines — ignore
    }
    if (el.getAttribute("aria-hidden") === "false") return true;
    if (el.classList?.contains("open") || el.classList?.contains("show")) return true;
    const pos = getComputedStyle(el).position;
    if ((pos === "fixed" || pos === "absolute") && el.getAttribute("aria-expanded") !== "false") {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") {
        if (el.parentElement === document.body || el.parentElement === document.documentElement) {
          return parseFloat(getComputedStyle(el).opacity) > 0;
        }
      }
    }
    return false;
  }

  function protectOpenOverlays(root) {
    const protectedEls = [];
    root.querySelectorAll("*").forEach((el) => {
      if (isExtensionChrome(el)) return;
      if (!isOpenOverlay(el)) return;
      el.setAttribute(MARK_ATTR, el.getAttribute(MARK_ATTR) || "overlay-open");
      // Ensure ancestors aren't culled away from visibility walk
      let p = el.parentElement;
      while (p && p !== root.parentElement) {
        if (isExtensionChrome(p)) break;
        if (p.getAttribute("data-h2d-ignore") === "true") {
          p.removeAttribute("data-h2d-ignore");
          p.setAttribute(MARK_ATTR, "overlay-ancestor");
        }
        p = p.parentElement;
      }
      protectedEls.push(el);
    });
    // Stable paint order hint for portals
    protectedEls
      .map((el) => ({ el, z: parseInt(getComputedStyle(el).zIndex, 10) || 0 }))
      .sort((a, b) => a.z - b.z)
      .forEach((item, i) => {
        item.el.setAttribute("data-h2d-stack-order", String(i));
      });
  }

  function cullHidden(root) {
    protectOpenOverlays(root);
    const marked = [];
    const els = root.querySelectorAll("*");
    for (const el of els) {
      if (el.hasAttribute(PSEUDO_ATTR) || el.hasAttribute(SELECT_ATTR)) continue;
      if (isOpenOverlay(el)) continue;
      let style;
      try {
        style = getComputedStyle(el);
      } catch (_) {
        continue;
      }
      const hidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        (parseFloat(style.opacity) === 0 && style.position !== "fixed");
      if (!hidden) continue;
      el.setAttribute(HIDDEN_ATTR, "1");
      el.setAttribute("data-h2d-ignore", "true");
      marked.push(el);
    }
    return () => {
      for (const el of marked) {
        el.removeAttribute(HIDDEN_ATTR);
        if (el.getAttribute("data-h2d-ignore") === "true") el.removeAttribute("data-h2d-ignore");
      }
    };
  }

  function applyObjectFitHints(root) {
    root.querySelectorAll("img, video").forEach((el) => {
      try {
        const s = getComputedStyle(el);
        if (s.objectFit && s.objectFit !== "fill") {
          el.style.objectFit = s.objectFit;
        }
        if (s.objectPosition && s.objectPosition !== "50% 50%") {
          el.style.objectPosition = s.objectPosition;
        }
      } catch (_) {}
    });
  }

  function inlineSvgUses(root) {
    const svgs = root.querySelectorAll("svg");
    const cleanups = [];
    for (const svg of svgs) {
      const uses = [...svg.querySelectorAll("use")];
      for (const use of uses) {
        const href = use.getAttribute("href") || use.getAttribute("xlink:href");
        if (!href || !href.startsWith("#")) continue;
        const id = href.slice(1);
        const target = document.getElementById(id) || svg.querySelector(`#${CSS.escape(id)}`);
        if (!target) continue;
        try {
          const clone = target.cloneNode(true);
          clone.removeAttribute("id");
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute(MARK_ATTR, "svg-use-inline");
          const x = use.getAttribute("x");
          const y = use.getAttribute("y");
          if (x || y) g.setAttribute("transform", `translate(${x || 0}, ${y || 0})`);
          while (clone.firstChild) g.appendChild(clone.firstChild);
          if (clone.tagName && clone.tagName.toLowerCase() !== "symbol") {
            g.appendChild(clone);
          }
          use.parentNode.insertBefore(g, use);
          use.style.display = "none";
          use.setAttribute(MARK_ATTR, "svg-use-hidden");
          cleanups.push(() => {
            use.style.display = "";
            use.removeAttribute(MARK_ATTR);
            g.remove();
          });
        } catch (_) {}
      }

      // Raster fallback for filtered / masked SVGs
      try {
        const s = getComputedStyle(svg);
        const hard =
          (s.filter && s.filter !== "none") ||
          (s.maskImage && s.maskImage !== "none") ||
          svg.querySelector("filter, mask, feGaussianBlur");
        if (hard && svg.getBoundingClientRect().width > 0) {
          svg.setAttribute(HARD_ATTR, "svg");
        }
      } catch (_) {}
    }
    return () => cleanups.forEach((fn) => fn());
  }

  function proxyNativeSelects(root) {
    const cleanups = [];
    root.querySelectorAll("select").forEach((sel) => {
      try {
        const rect = sel.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const style = getComputedStyle(sel);
        const proxy = document.createElement("div");
        proxy.setAttribute(SELECT_ATTR, "1");
        proxy.setAttribute(MARK_ATTR, "select-proxy");
        proxy.style.cssText = cssTextFromComputed(style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          content: "normal",
          cursor: "default",
        });
        const label = document.createElement("span");
        label.textContent = sel.options[sel.selectedIndex]?.text || sel.value || "";
        label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        const chevron = document.createElement("span");
        chevron.textContent = "▾";
        chevron.style.cssText = "margin-left:8px;opacity:.7;font-size:12px;";
        proxy.appendChild(label);
        proxy.appendChild(chevron);

        // Open options list as sibling panel (visible state for fidelity)
        if (sel.size > 1 || sel.multiple || sel.dataset.h2dExpand === "1") {
          const list = document.createElement("div");
          list.setAttribute(MARK_ATTR, "select-options");
          list.style.cssText =
            "position:absolute;left:0;right:0;top:100%;z-index:2147483646;background:#fff;border:1px solid #e4e4e7;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:240px;overflow:auto;";
          proxy.style.position = proxy.style.position || "relative";
          for (const opt of sel.options) {
            const row = document.createElement("div");
            row.textContent = opt.text;
            row.style.cssText = `padding:8px 10px;font:${style.font};color:${style.color};${
              opt.selected ? "background:#f5f3ff;" : ""
            }`;
            list.appendChild(row);
          }
          proxy.appendChild(list);
        }

        sel.style.setProperty("display", "none", "important");
        sel.setAttribute(MARK_ATTR, "select-hidden");
        sel.parentNode.insertBefore(proxy, sel);
        cleanups.push(() => {
          proxy.remove();
          sel.style.removeProperty("display");
          sel.removeAttribute(MARK_ATTR);
        });
      } catch (_) {}
    });
    return () => cleanups.forEach((fn) => fn());
  }

  function markHardRegions(root, qualityMode = "editable") {
    const exact = qualityMode === "exact";
    root.querySelectorAll("iframe, canvas, video").forEach((el) => {
      try {
        if (isExtensionChrome(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        if (el.tagName === "IFRAME") {
          let sameOrigin = false;
          try {
            sameOrigin = !!(el.contentDocument && el.contentDocument.documentElement);
          } catch (_) {
            sameOrigin = false;
          }
          if (sameOrigin) {
            el.setAttribute(IFRAME_ATTR, "same-origin");
          } else {
            el.setAttribute(HARD_ATTR, "iframe");
          }
        } else if (el.tagName === "CANVAS") {
          el.setAttribute(HARD_ATTR, "canvas");
        } else {
          el.setAttribute(HARD_ATTR, "video");
        }
      } catch (_) {}
    });
    root.querySelectorAll("*").forEach((el) => {
      try {
        if (isExtensionChrome(el)) return;
        const s = getComputedStyle(el);
        if (
          (s.backdropFilter && s.backdropFilter !== "none") ||
          (s.webkitBackdropFilter && s.webkitBackdropFilter !== "none")
        ) {
          // Exact only — Editable keeps layers (imperfect filter beats wiped subtree).
          if (exact) el.setAttribute(HARD_ATTR, "backdrop");
        }
        const filterHeavy = s.filter && s.filter !== "none" && !/^blur\(0/.test(s.filter);
        if (exact && filterHeavy) {
          el.setAttribute(HARD_ATTR, el.getAttribute(HARD_ATTR) || "filter");
        }
        if (exact && s.mixBlendMode && s.mixBlendMode !== "normal") {
          el.setAttribute(HARD_ATTR, el.getAttribute(HARD_ATTR) || "blend");
        }
        // Exact: also flatten complex multi-layer shadows
        if (exact) {
          const complexShadow =
            s.boxShadow && s.boxShadow !== "none" && s.boxShadow.split("rgb").length > 2;
          if (complexShadow && !el.getAttribute(HARD_ATTR)) {
            el.setAttribute(HARD_ATTR, "shadow");
          }
        }
      } catch (_) {}
    });
  }

  function proxySameOriginIframes(root) {
    const cleanups = [];
    root.querySelectorAll(`iframe[${IFRAME_ATTR}="same-origin"]`).forEach((iframe) => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) return;
        const rect = iframe.getBoundingClientRect();
        const proxy = document.createElement("div");
        proxy.setAttribute(MARK_ATTR, "iframe-proxy");
        proxy.style.cssText = `display:block;width:${rect.width}px;height:${rect.height}px;overflow:hidden;position:relative;box-sizing:border-box;`;
        const clone = doc.body.cloneNode(true);
        // Strip scripts
        clone.querySelectorAll("script").forEach((s) => s.remove());
        proxy.appendChild(clone);
        iframe.style.setProperty("display", "none", "important");
        iframe.parentNode.insertBefore(proxy, iframe);
        cleanups.push(() => {
          proxy.remove();
          iframe.style.removeProperty("display");
        });
      } catch (_) {}
    });
    return () => cleanups.forEach((fn) => fn());
  }

  function collectFontFaces() {
    const faces = [];
    try {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch (_) {
          continue;
        }
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
          const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
          const src = rule.style.getPropertyValue("src");
          const weight = rule.style.getPropertyValue("font-weight") || "400";
          const style = rule.style.getPropertyValue("font-style") || "normal";
          const stretch = rule.style.getPropertyValue("font-stretch") || "100%";
          const urls = [];
          const re = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;
          let m;
          while ((m = re.exec(src))) urls.push(m[2]);
          if (family && urls.length) {
            faces.push({ familyName: family, urls, fontWeight: weight, fontStyle: style, fontStretch: stretch });
          }
        }
      }
      if (document.fonts) {
        for (const f of document.fonts) {
          faces.push({
            familyName: f.family.replace(/['"]/g, ""),
            urls: [],
            fontWeight: String(f.weight || "400"),
            fontStyle: f.style || "normal",
            fontStretch: f.stretch || "100%",
            status: f.status,
          });
        }
      }
    } catch (_) {}
    return faces;
  }

  function parseGradients(backgroundImage) {
    if (!backgroundImage || backgroundImage === "none") return [];
    const layers = [];
    // Split top-level commas (not inside parentheses)
    let depth = 0;
    let cur = "";
    for (let i = 0; i < backgroundImage.length; i++) {
      const ch = backgroundImage[i];
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        layers.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) layers.push(cur.trim());

    return layers.map((layer) => {
      const url = layer.match(/^url\(\s*(['"]?)(.*?)\1\s*\)/i);
      if (url) return { type: "image", url: url[2] };
      const linear = layer.match(/^(repeating-)?linear-gradient\((.+)\)$/i);
      if (linear) return { type: "linear-gradient", repeating: !!linear[1], value: linear[2] };
      const radial = layer.match(/^(repeating-)?radial-gradient\((.+)\)$/i);
      if (radial) return { type: "radial-gradient", repeating: !!radial[1], value: radial[2] };
      const conic = layer.match(/^(repeating-)?conic-gradient\((.+)\)$/i);
      if (conic) return { type: "conic-gradient", repeating: !!conic[1], value: conic[2] };
      return { type: "unknown", value: layer };
    });
  }

  function collectBackgroundMeta(root) {
    const meta = {};
    const els = [root, ...root.querySelectorAll("*")];
    let i = 0;
    for (const el of els) {
      if (el.nodeType !== 1) continue;
      try {
        const s = getComputedStyle(el);
        if (!s.backgroundImage || s.backgroundImage === "none") continue;
        const layers = parseGradients(s.backgroundImage);
        if (!layers.length) continue;
        if (!el.id) {
          el.id = `htfy-bg-${i}`;
          el.setAttribute(MARK_ATTR, "temp-bg-id");
        }
        const id = el.id;
        el.setAttribute("data-h2d-bg-id", id);
        meta[id] = {
          layers,
          backgroundImage: s.backgroundImage,
          backgroundSize: s.backgroundSize,
          backgroundPosition: s.backgroundPosition,
          backgroundRepeat: s.backgroundRepeat,
          backgroundBlendMode: s.backgroundBlendMode,
          backgroundColor: s.backgroundColor,
        };
        i++;
      } catch (_) {}
    }
    return meta;
  }

  function collectHardRegionRects(root) {
    const regions = [];
    const rootRect = root.getBoundingClientRect();
    let i = 0;
    root.querySelectorAll(`[${HARD_ATTR}]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      // Ensure matchable id for tree patch (attributes whitelist includes id)
      if (!el.id) {
        el.id = `htfy-hard-${i}`;
        el.setAttribute(MARK_ATTR, "temp-hard-id");
      }
      regions.push({
        kind: el.getAttribute(HARD_ATTR),
        // Root-relative — same space as serialized node.rect
        x: r.left - rootRect.left,
        y: r.top - rootRect.top,
        width: r.width,
        height: r.height,
        // Document coords for CDP screenshot clip
        docX: r.left + window.scrollX,
        docY: r.top + window.scrollY,
        dpr: window.devicePixelRatio || 1,
        tag: el.tagName,
        elementId: el.id,
      });
      i++;
    });
    return regions;
  }

  function extractDesignTokens(root) {
    if (window.__htfyDesignSystemCapture?.extractDesignSystem) {
      return window.__htfyDesignSystemCapture.extractDesignSystem(root);
    }
    // Fallback minimal
    const colors = new Map();
    const fonts = new Map();
    const radii = new Map();
    root.querySelectorAll("*").forEach((el) => {
      try {
        const s = getComputedStyle(el);
        for (const key of ["color", "backgroundColor", "borderTopColor"]) {
          const v = s[key];
          if (v && v !== "rgba(0, 0, 0, 0)" && v !== "transparent") {
            colors.set(v, (colors.get(v) || 0) + 1);
          }
        }
        if (s.fontFamily) {
          const fam = s.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
          fonts.set(fam, (fonts.get(fam) || 0) + 1);
        }
        if (s.borderTopLeftRadius && s.borderTopLeftRadius !== "0px") {
          radii.set(s.borderTopLeftRadius, (radii.get(s.borderTopLeftRadius) || 0) + 1);
        }
      } catch (_) {}
    });
    const top = (map, n = 12) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([value, count]) => ({ value, count }));
    return { colors: top(colors), fonts: top(fonts, 8), radii: top(radii, 8), components: [] };
  }

  function layerNameFromEl(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${el.id}`;
    const cls = [...el.classList].filter((c) => !c.startsWith("h2d") && c.length < 40).slice(0, 2);
    if (cls.length) return `${el.tagName.toLowerCase()}.${cls.join(".")}`;
    return el.tagName.toLowerCase();
  }

  function annotateLayerNames(root) {
    root.querySelectorAll("*").forEach((el) => {
      const name = layerNameFromEl(el);
      if (name) el.setAttribute("data-h2d-layer-name", name);
    });
  }

  function decodePayloadHtml(html) {
    const m = html && html.match(/<!--\(figh2d\)([\s\S]*?)\(\/figh2d\)-->/);
    if (!m) return null;
    try {
      const bin = atob(m[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
      try {
        return JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      } catch (e2) {
        return null;
      }
    }
  }

  async function encodePayloadHtml(data) {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    const b64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result.slice(fr.result.indexOf(",") + 1));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(new File([bytes], "", { type: "application/octet-stream" }));
    });
    return `<span data-h2d="<!--(figh2d)${b64}(/figh2d)-->"></span>`;
  }

  function enrichPayload(data, extras) {
    if (!data || typeof data !== "object") return data;
    data.fidelity = {
      version: 1,
      fontFaces: extras.fontFaces || [],
      backgrounds: extras.backgrounds || {},
      hardRegions: extras.hardRegions || [],
      designTokens: extras.designTokens || null,
      assetUrls: extras.assetUrls || [],
      inheritedStyles: extras.inheritedStyles || null,
      resolvedCssBytes: extras.resolvedCss ? extras.resolvedCss.length : 0,
      dualFrameHint: null,
    };
    if (extras.resolvedCss) {
      data.fidelity.resolvedCss = extras.resolvedCss.slice(0, 500000);
    }
    if (data.fonts && extras.fontFaces?.length) {
      for (const face of extras.fontFaces) {
        const key = (face.familyName || "").toLowerCase();
        if (!key) continue;
        if (!data.fonts[key]) {
          data.fonts[key] = { familyName: face.familyName, faces: [], usages: [] };
        }
        const entry = data.fonts[key];
        entry.faces = entry.faces || [];
        if (face.urls?.length) {
          entry.faces.push({
            src: face.urls,
            fontWeight: face.fontWeight,
            fontStyle: face.fontStyle,
            fontStretch: face.fontStretch,
          });
        }
      }
    }
    // Ensure object-fit related styles survive on image-like tags via attributes mirror
    return data;
  }

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label || `timeout ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function prepare(root, opts = {}) {
    const qualityMode = opts.qualityMode === "exact" ? "exact" : "editable";
    const forceOpen = opts.forceOpen === true;
    const keepClosed = false;
    const cancelled = () => opts.cancel?.cancelled === true;
    const helpers = window.__htfySuperDevHelpers;
    let undoInherited = () => {};
    let undoCss = () => {};
    let undoExpand = () => {};
    let undoSelect = () => {};
    let undoPseudo = () => {};
    let undoCull = () => {};
    let undoSvg = () => {};
    let undoIframe = () => {};
    let sheets = [];
    let assetUrls = [];
    let resolvedCss = "";
    let inheritedStyles = null;
    let inheritedApplied = false;

    const bailIfCancelled = () => {
      if (!cancelled()) return false;
      try {
        undoCull();
      } catch (_) {}
      try {
        undoPseudo();
      } catch (_) {}
      try {
        undoExpand();
      } catch (_) {}
      try {
        undoIframe();
      } catch (_) {}
      try {
        undoSelect();
      } catch (_) {}
      try {
        undoSvg();
      } catch (_) {}
      try {
        undoInherited();
      } catch (_) {}
      try {
        undoCss();
      } catch (_) {}
      return true;
    };

    if (helpers) {
      try {
        if (bailIfCancelled()) throw new Error("prepare_cancelled");
        sheets = helpers.harvestStylesheets();
        assetUrls = helpers.collectAssetUrls(root, { maxNodes: 4000 });
        toast("Resolving CSS…");
        const cssStarted = Date.now();
        resolvedCss = await helpers.requestCssResolve(sheets, { timeoutMs: 6000 });
        if (bailIfCancelled()) throw new Error("prepare_cancelled");
        if (Date.now() - cssStarted >= 5500 && !resolvedCss) {
          toast("CSS resolve slow, continuing…");
        }
        if (resolvedCss) {
          const styleEl = document.createElement("style");
          styleEl.setAttribute("data-h2d-ignore", "true");
          styleEl.setAttribute(MARK_ATTR, "resolved-css");
          styleEl.textContent = resolvedCss;
          document.documentElement.appendChild(styleEl);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          undoCss = () => styleEl.remove();
        }
        if (bailIfCancelled()) throw new Error("prepare_cancelled");
        const target = root === document.documentElement ? document.body || root : root;
        toast("Recovering styles…");
        const recovered = await helpers.recoverInheritedCss(target, {
          maxHtmlBytes: 500_000,
          timeoutMs: 2000,
        });
        if (bailIfCancelled()) throw new Error("prepare_cancelled");
        if (recovered?.__skipped) {
          toast("Styles recovery skipped…");
          inheritedStyles = null;
        } else {
          inheritedStyles = recovered || null;
          if (inheritedStyles && helpers.flattenColor) {
            for (const k of Object.keys(inheritedStyles)) {
              if (/color/i.test(k)) inheritedStyles[k] = helpers.flattenColor(inheritedStyles[k]);
            }
          }
          undoInherited = helpers.applyInheritedToRoot(target, inheritedStyles);
          inheritedApplied = !!inheritedStyles && Object.keys(inheritedStyles).length > 0;
        }
      } catch (err) {
        if (String(err?.message || err) === "prepare_cancelled") throw err;
        console.warn("[Send2Figma] superDev prep partial fail:", err.message || err);
      }
    }

    if (bailIfCancelled()) throw new Error("prepare_cancelled");
    toast("Materializing…");
    annotateLayerNames(root);
    applyObjectFitHints(root);
    markHardRegions(root, qualityMode);
    undoSvg = inlineSvgUses(root);
    undoIframe = proxySameOriginIframes(root);

    await settleAnimations(root, { strategy: "pause" });
    if (bailIfCancelled()) throw new Error("prepare_cancelled");

    if (!keepClosed) {
      undoExpand = expandInteractive(root, { forceOpen });
      await settleAnimations(root, {
        strategy: forceOpen ? "finish" : "pause",
      });
      if (forceOpen) await new Promise((r) => setTimeout(r, 100));
    }

    if (bailIfCancelled()) throw new Error("prepare_cancelled");
    undoSelect = proxyNativeSelects(root);
    undoPseudo = materializePseudos(root, { maxNodes: 4000 });
    undoCull = cullHidden(root);
    const fontFaces = collectFontFaces();
    const backgrounds = collectBackgroundMeta(root);
    const hardRegions = collectHardRegionRects(root);
    const designTokens = extractDesignTokens(root);
    if (bailIfCancelled()) throw new Error("prepare_cancelled");
    return {
      extras: {
        fontFaces,
        backgrounds,
        hardRegions,
        designTokens,
        stylesheets: sheets,
        resolvedCss,
        assetUrls,
        inheritedStyles,
        inheritedApplied,
        qualityMode,
        forceOpen,
      },
      cleanup() {
        try {
          undoCull();
        } catch (_) {}
        try {
          undoPseudo();
        } catch (_) {}
        try {
          undoExpand();
        } catch (_) {}
        try {
          undoIframe();
        } catch (_) {}
        try {
          undoSelect();
        } catch (_) {}
        try {
          undoSvg();
        } catch (_) {}
        try {
          undoInherited();
        } catch (_) {}
        try {
          undoCss();
        } catch (_) {}
        root.querySelectorAll(`[${HARD_ATTR}], [${IFRAME_ATTR}], [data-h2d-bg-id], [data-h2d-layer-name]`).forEach((el) => {
          el.removeAttribute(HARD_ATTR);
          el.removeAttribute(IFRAME_ATTR);
          el.removeAttribute("data-h2d-bg-id");
          el.removeAttribute("data-h2d-layer-name");
        });
      },
    };
  }

  function wrapCapture() {
    const api = window.__htfyLiteCapture;
    if (!api || typeof api.captureForDesign !== "function") return false;
    if (api.__fidelityPatched) return true;
    const original = api.captureForDesign.bind(api);

    api.captureForDesign = async function captureWithFidelity(opts = {}) {
      const selector = opts.selector || "body";
      const rootEl =
        selector === "body" || selector === "html"
          ? document.documentElement
          : document.querySelector(selector);
      if (!rootEl) return { ok: false, error: `Element not found: ${selector}` };

      // Keep dock/panel mounted for progress UI; serializers skip extension chrome.
      window.__htfyCapturing = true;
      const restoreChrome = markExtensionChrome();
      toast("Preparing fidelity…");
      let session;
      let prepTimedOut = false;
      const cancel = { cancelled: false };
      try {
        try {
          session = await withTimeout(
            prepare(rootEl, {
              qualityMode: opts.qualityMode,
              forceOpen: opts.forceOpen === true,
              cancel,
            }),
            12000,
            "prepare_timeout"
          );
        } catch (prepErr) {
          const msg = String(prepErr?.message || prepErr);
          if (msg.includes("prepare_timeout") || msg.includes("prepare_cancelled")) {
            cancel.cancelled = true;
            prepTimedOut = true;
            toast("Fidelity prep timed out — capturing anyway…");
            try {
              session?.cleanup();
            } catch (_) {}
            session = null;
          } else {
            throw prepErr;
          }
        }

        toast(opts.qualityMode === "exact" ? "Capturing (Exact)…" : "Capturing…");
        markExtensionChrome();

        // Always harvest design tokens (even after prepare timeout) so Export .json is not empty.
        let lateTokens = session?.extras?.designTokens || null;
        if (!lateTokens || !(lateTokens.colors?.length || lateTokens.components?.length || lateTokens.fonts?.length)) {
          try {
            lateTokens =
              window.__htfyDesignSystemCapture?.extractDesignSystem?.(rootEl) ||
              extractDesignTokens(rootEl);
          } catch (_) {}
        }

        const result = await original({
          ...opts,
        });
        if (!result?.ok || !result.html) return result;

        const extras = session?.extras
          ? { ...session.extras, designTokens: lateTokens || session.extras.designTokens }
          : lateTokens
            ? { designTokens: lateTokens, qualityMode: opts.qualityMode || "editable" }
            : null;

        if (extras) {
          toast("Enriching…");
          const data = decodePayloadHtml(result.html);
          if (data) {
            const enriched = enrichPayload(data, extras);
            result.html = await encodePayloadHtml(enriched);
            result.fidelity = enriched.fidelity;
          }
        } else if (prepTimedOut) {
          result.fidelity = { ...(result.fidelity || {}), prepTimedOut: true };
        }
        return result;
      } catch (err) {
        console.error("[Send2Figma fidelity]", err);
        toast("Fidelity prep failed: " + (err.message || String(err)), true);
        // Fallback to original capture without prep
        try {
          session?.cleanup();
        } catch (_) {}
        markExtensionChrome();
        return original(opts);
      } finally {
        try {
          session?.cleanup();
        } catch (_) {}
        try {
          restoreChrome();
        } catch (_) {}
        window.__htfyCapturing = false;
      }
    };

    api.__fidelityPatched = true;
    api.prepareFidelity = prepare;
    api.settleAnimations = settleAnimations;
    window.__htfyFidelity = {
      prepare,
      settleAnimations,
      decodePayloadHtml,
      encodePayloadHtml,
      enrichPayload,
      parseGradients,
      collectFontFaces,
    };
    return true;
  }

  function tryWrap() {
    if (wrapCapture()) return;
    // contentscript may load after us
    let tries = 0;
    const id = setInterval(() => {
      tries++;
      if (wrapCapture() || tries > 40) clearInterval(id);
    }, 50);
  }

  tryWrap();
})();
