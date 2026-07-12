/**
 * Page-world helpers for MCP inspect / interaction CSS / images / HTML sanitize.
 * Builds agent-ready layoutSpec / typeSpec / colorSpec so recreates don't guess.
 */
(function () {
  if (window.__htfyMcpInspect?.version >= 2) return;

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

  function parseRgb(css) {
    if (!css) return null;
    const m = String(css).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/i);
    if (!m) return null;
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }

  function toHex({ r, g, b }) {
    const h = (n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function isOpaqueFill(style) {
    const rgb = parseRgb(style.backgroundColor);
    if (!rgb || rgb.a < 0.12) return false;
    // ignore near-white page cream as "cta fill"
    if (rgb.r > 245 && rgb.g > 245 && rgb.b > 235) return false;
    return true;
  }

  function luminance({ r, g, b }) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function sanitizeHtml(root) {
    const clone = root.cloneNode(true);
    clone
      .querySelectorAll("script, noscript, style[data-htfy], #htfyRoot, [data-htfy-chrome='1'], [id^='__htfy']")
      .forEach((n) => n.remove());
    clone.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === "srcdoc") el.removeAttribute(attr.name);
      }
    });
    return clone.outerHTML;
  }

  function layoutSlice(style) {
    return {
      display: style.display,
      position: style.position,
      width: style.width,
      height: style.height,
      maxWidth: style.maxWidth,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      marginTop: style.marginTop,
      marginRight: style.marginRight,
      marginBottom: style.marginBottom,
      marginLeft: style.marginLeft,
      gap: style.gap !== "normal" ? style.gap : style.columnGap,
      rowGap: style.rowGap,
      columnGap: style.columnGap,
      justifyContent: style.justifyContent,
      alignItems: style.alignItems,
      flexDirection: style.flexDirection,
    };
  }

  function typeSlice(style) {
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      textTransform: style.textTransform,
      color: style.color,
    };
  }

  function colorSlice(style) {
    const bg = parseRgb(style.backgroundColor);
    const fg = parseRgb(style.color);
    return {
      backgroundColor: style.backgroundColor,
      backgroundColorHex: bg && bg.a > 0.1 ? toHex(bg) : null,
      color: style.color,
      colorHex: fg && fg.a > 0.1 ? toHex(fg) : null,
      backgroundImage: style.backgroundImage !== "none" ? style.backgroundImage : null,
      borderRadius: style.borderTopLeftRadius,
      boxShadow: style.boxShadow !== "none" ? style.boxShadow : null,
    };
  }

  function classHint(el) {
    return String(el.className || "");
  }

  function pickPriorityElements(root, maxChildren) {
    const picked = [];
    const seen = new Set();

    function add(el, role, score) {
      if (!el || el.nodeType !== 1 || isOurChrome(el) || seen.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      seen.add(el);
      picked.push({ el, role, score: score || 0 });
    }

    add(root, "root", 100);

    // Direct structural children (nav rows, etc.)
    [...root.children].forEach((el, i) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "nav") add(el, i === 0 ? "nav" : "navSecondary", 95);
      else if (tag === "ul" || tag === "ol") add(el, "menuList", 90);
      else add(el, "sectionChild", 70);
    });

    // Flex clusters (logo row / menu row / actions)
    root.querySelectorAll("div, nav, ul, menu").forEach((el) => {
      try {
        const s = getComputedStyle(el);
        if (!String(s.display).includes("flex")) return;
        const hint = classHint(el);
        let role = "flexRow";
        if (/menu|nav|link/i.test(hint)) role = "menuRow";
        else if (/left|brand|logo/i.test(hint)) role = "brandRow";
        else if (/right|action|button/i.test(hint)) role = "actionsRow";
        // Prefer rows with explicit gap / space-between
        const score =
          (s.justifyContent === "center" ? 20 : 0) +
          (s.justifyContent === "space-between" ? 25 : 0) +
          (parseFloat(s.gap || s.columnGap) > 0 ? 15 : 0) +
          50;
        add(el, role, score);
      } catch (_) {}
    });

    // Nav links
    root.querySelectorAll("nav a, [class*='menu' i] a, [class*='MenuLink' i], [class*='nav' i] a").forEach((el) => {
      add(el, "navLink", 85);
    });

    // CTA / buttons — highest priority for color accuracy
    const ctaCandidates = [];
    root
      .querySelectorAll(
        "button, a[class*='button' i], [class*='Button' i], [class*='btn' i], [role='button'], input[type='submit']"
      )
      .forEach((el) => {
        try {
          const s = getComputedStyle(el);
          const hint = classHint(el);
          const opaque = isOpaqueFill(s);
          const looksCta = opaque || /button|btn|cta|teal|black|primary|login|contact|signup/i.test(hint);
          if (!looksCta) return;
          // Prefer the painted surface: if button itself is transparent, climb to opaque child/parent
          let paintEl = el;
          if (!opaque) {
            const child = [...el.querySelectorAll("*")].find((c) => {
              try {
                return isOpaqueFill(getComputedStyle(c));
              } catch {
                return false;
              }
            });
            if (child) paintEl = child;
          }
          const ps = getComputedStyle(paintEl);
          const rgb = parseRgb(ps.backgroundColor);
          ctaCandidates.push({ el: paintEl, trigger: el, rgb, hint });
        } catch (_) {}
      });

    // Sort CTAs: darker / branded fills first
    ctaCandidates.sort((a, b) => {
      const la = a.rgb ? luminance(a.rgb) : 1;
      const lb = b.rgb ? luminance(b.rgb) : 1;
      return la - lb;
    });

    let ctaPrimarySet = false;
    let ctaSecondarySet = false;
    for (const c of ctaCandidates) {
      if (!c.rgb) {
        add(c.trigger, "control", 75);
        continue;
      }
      const lum = luminance(c.rgb);
      const greenish = c.rgb.g > c.rgb.r && c.rgb.g > c.rgb.b;
      if (!ctaPrimarySet && (greenish || /teal|primary|contact/i.test(c.hint))) {
        add(c.el, "ctaPrimary", 99);
        if (c.el !== c.trigger) add(c.trigger, "ctaPrimaryTrigger", 98);
        ctaPrimarySet = true;
      } else if (!ctaSecondarySet && (lum < 0.35 || /black|dark|login|secondary/i.test(c.hint))) {
        add(c.el, "ctaSecondary", 98);
        if (c.el !== c.trigger) add(c.trigger, "ctaSecondaryTrigger", 97);
        ctaSecondarySet = true;
      } else {
        add(c.el, "ctaOther", 80);
      }
    }

    // Opaque surfaces (cards, chips) after CTAs
    root.querySelectorAll("*").forEach((el) => {
      if (seen.has(el) || el === root) return;
      try {
        const s = getComputedStyle(el);
        if (isOpaqueFill(s)) add(el, "surface", 40);
      } catch (_) {}
    });

    picked.sort((a, b) => b.score - a.score);
    // Keep unique els in score order, cap
    const out = [];
    const used = new Set();
    for (const p of picked) {
      if (used.has(p.el)) continue;
      used.add(p.el);
      out.push(p);
      if (out.length >= maxChildren) break;
    }
    return out;
  }

  function buildAgentSpecs(root, prioritized) {
    const layoutSpec = {};
    const typeSpec = {};
    const colorSpec = {};
    const roles = [];

    for (const { el, role } of prioritized) {
      const style = getComputedStyle(el);
      const selector = el === root ? null : cssPath(el);
      const entry = {
        role,
        tag: el.tagName.toLowerCase(),
        selector: selector || (el === root ? "(root)" : cssPath(el)),
        text: (el.innerText || "").trim().slice(0, 80) || null,
      };
      roles.push(entry);

      // Prefer first occurrence of each semantic role for specs
      if (!layoutSpec[role]) {
        layoutSpec[role] = { ...entry, ...layoutSlice(style) };
      }
      if (!typeSpec[role] && (role === "root" || role === "navLink" || role.startsWith("cta") || role === "nav")) {
        typeSpec[role] = { ...entry, ...typeSlice(style) };
      }
      if (!colorSpec[role]) {
        const colors = colorSlice(style);
        if (colors.backgroundColorHex || colors.colorHex || role === "root") {
          colorSpec[role] = { ...entry, ...colors };
        }
      }
    }

    // Semantic aliases for agents
    const aliases = {};
    if (colorSpec.root?.backgroundColorHex) aliases.surfaceBackground = colorSpec.root.backgroundColorHex;
    if (colorSpec.root?.colorHex) aliases.textPrimary = colorSpec.root.colorHex;
    if (typeSpec.navLink?.colorHex || colorSpec.navLink?.colorHex) {
      aliases.textNav = colorSpec.navLink?.colorHex || typeSpec.navLink?.color;
    }
    if (colorSpec.ctaPrimary?.backgroundColorHex) aliases.ctaPrimaryBg = colorSpec.ctaPrimary.backgroundColorHex;
    if (colorSpec.ctaPrimary?.colorHex) aliases.ctaPrimaryFg = colorSpec.ctaPrimary.colorHex;
    if (colorSpec.ctaSecondary?.backgroundColorHex) aliases.ctaSecondaryBg = colorSpec.ctaSecondary.backgroundColorHex;
    if (colorSpec.ctaSecondary?.colorHex) aliases.ctaSecondaryFg = colorSpec.ctaSecondary.colorHex;
    if (layoutSpec.nav) {
      aliases.navPadding = {
        top: layoutSpec.nav.paddingTop,
        right: layoutSpec.nav.paddingRight,
        bottom: layoutSpec.nav.paddingBottom,
        left: layoutSpec.nav.paddingLeft,
      };
      aliases.navHeight = layoutSpec.nav.height;
      aliases.navGap = layoutSpec.nav.gap;
      aliases.navJustify = layoutSpec.nav.justifyContent;
    }
    if (layoutSpec.menuRow) {
      aliases.menuGap = layoutSpec.menuRow.gap;
      aliases.menuJustify = layoutSpec.menuRow.justifyContent;
    }
    if (layoutSpec.brandRow) {
      aliases.brandRowGap = layoutSpec.brandRow.gap;
    }
    if (layoutSpec.root) {
      aliases.rootHeight = layoutSpec.root.height;
    }

    return {
      version: 2,
      layoutSpec,
      typeSpec,
      colorSpec,
      aliases,
      roles: roles.slice(0, 60),
      rules: [
        "MUST use layoutSpec / typeSpec / colorSpec / aliases for spacing, type, and color.",
        "Do NOT invent padding, gap, justify-content, font-size, or brand colors.",
        "If a value is missing from specs, say so and sample from the screenshot — do not guess.",
        "Screenshot is the pixel source of truth for visual QA.",
      ],
    };
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

  function inspectDom(selector, maxChildren = 80) {
    const root = document.querySelector(selector);
    if (!root || isOurChrome(root)) throw new Error(`Element not found: ${selector}`);

    const rootStyle = getComputedStyle(root);
    const prioritized = pickPriorityElements(root, maxChildren);
    const specs = buildAgentSpecs(root, prioritized);

    const rootInspect = {
      selector,
      tag: root.tagName.toLowerCase(),
      role: "root",
      html: sanitizeHtml(root),
      computed: filterComputed(rootStyle),
      matchedRules: [],
      boxModel: null,
    };

    const children = prioritized
      .filter((p) => p.el !== root)
      .map(({ el, role }) => ({
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        role,
        computed: filterComputed(getComputedStyle(el)),
        matchedRules: [],
        boxModel: null,
      }));

    const fidelityNotes = ["matched_rules_pending_cdp", "agent_specs_v2"];
    if (!specs.aliases.ctaPrimaryBg) fidelityNotes.push("cta_primary_color_missing");
    if (!specs.aliases.ctaSecondaryBg) fidelityNotes.push("cta_secondary_color_missing");

    return {
      url: location.href,
      title: document.title,
      root: rootInspect,
      children,
      specs,
      capturedAt: new Date().toISOString(),
      fidelityNotes,
    };
  }

  window.__htfyMcpInspect = {
    version: 2,
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
    buildAgentSpecs,
  };
})();
