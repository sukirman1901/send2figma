/**
 * Page-world helpers for MCP inspect / interaction CSS / images / HTML sanitize.
 * Builds agent-ready layoutSpec / typeSpec / colorSpec so recreates don't guess.
 */
(function () {
  if (window.__htfyMcpInspect?.version >= 3) return;

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
    const display = style.display;
    const isFlex = display.includes("flex");
    const isGrid = display.includes("grid");
    
    const slice = {
      display,
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
    
    // Add flex-specific details
    if (isFlex) {
      slice.flexWrap = style.flexWrap;
      slice.flexGrow = style.flexGrow;
      slice.flexShrink = style.flexShrink;
      slice.flexBasis = style.flexBasis;
      slice.alignSelf = style.alignSelf;
      slice.alignContent = style.alignContent;
    }
    
    // Add grid-specific details
    if (isGrid) {
      slice.gridTemplateColumns = style.gridTemplateColumns;
      slice.gridTemplateRows = style.gridTemplateRows;
      slice.gridColumnGap = style.gridColumnGap;
      slice.gridRowGap = style.gridRowGap;
      slice.gridAutoColumns = style.gridAutoColumns;
      slice.gridAutoRows = style.gridAutoRows;
      slice.gridAutoFlow = style.gridAutoFlow;
    }
    
    return slice;
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

  // Accessibility data capture
  function captureAccessibility(el) {
    const ariaAttrs = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('aria-') || attr.name === 'role') {
        ariaAttrs[attr.name] = attr.value;
      }
    }
    
    return {
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      ariaLabelledby: el.getAttribute('aria-labelledby') || null,
      ariaDescribedby: el.getAttribute('aria-describedby') || null,
      ariaHidden: el.getAttribute('aria-hidden') || null,
      ariaExpanded: el.getAttribute('aria-expanded') || null,
      ariaSelected: el.getAttribute('aria-selected') || null,
      ariaChecked: el.getAttribute('aria-checked') || null,
      ariaDisabled: el.getAttribute('aria-disabled') || null,
      ariaRequired: el.getAttribute('aria-required') || null,
      ariaInvalid: el.getAttribute('aria-invalid') || null,
      ariaLive: el.getAttribute('aria-live') || null,
      ariaAtomic: el.getAttribute('aria-atomic') || null,
      ariaRelevant: el.getAttribute('aria-relevant') || null,
      tabIndex: el.tabIndex !== -1 ? el.tabIndex : null,
      tabindex: el.getAttribute('tabindex') || null,
      isInteractive: ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.getAttribute('role') === 'button',
      isFocusable: el.tabIndex >= 0 || ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName),
      allAriaAttrs: Object.keys(ariaAttrs).length > 0 ? ariaAttrs : null,
    };
  }

  // Transitions & animations capture
  function captureTransitions(style) {
    const transitions = style.transition || style.transitionProperty;
    const animations = style.animation || style.animationName;
    
    return {
      transition: transitions && transitions !== 'none' ? transitions : null,
      transitionDuration: style.transitionDuration !== '0s' ? style.transitionDuration : null,
      transitionTimingFunction: style.transitionTimingFunction !== 'ease' ? style.transitionTimingFunction : null,
      transitionDelay: style.transitionDelay !== '0s' ? style.transitionDelay : null,
      animation: animations && animations !== 'none' ? animations : null,
      animationDuration: style.animationDuration !== '0s' ? style.animationDuration : null,
      animationTimingFunction: style.animationTimingFunction !== 'ease' ? style.animationTimingFunction : null,
      animationIterationCount: style.animationIterationCount !== '1' ? style.animationIterationCount : null,
      animationDirection: style.animationDirection !== 'normal' ? style.animationDirection : null,
      animationFillMode: style.animationFillMode !== 'none' ? style.animationFillMode : null,
      animationDelay: style.animationDelay !== '0s' ? style.animationDelay : null,
    };
  }

  // React component detection
  function detectReactComponents(el) {
    const fiberKey = Object.keys(el).find(k => 
      k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (!fiberKey) return null;
    
    const fiber = el[fiberKey];
    const components = [];
    let current = fiber;
    
    while (current && components.length < 10) {
      if (current.type && typeof current.type === 'function') {
        const name = current.type.name || current.type.displayName || 'Anonymous';
        if (!components.includes(name)) {
          components.unshift(name);
        }
      }
      current = current.return;
    }
    
    return components.length > 0 ? components : null;
  }

  // Box model capture
  function captureBoxModel(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    
    return {
      content: {
        width: rect.width,
        height: rect.height,
      },
      padding: {
        top: parseFloat(style.paddingTop),
        right: parseFloat(style.paddingRight),
        bottom: parseFloat(style.paddingBottom),
        left: parseFloat(style.paddingLeft),
      },
      border: {
        top: parseFloat(style.borderTopWidth),
        right: parseFloat(style.borderRightWidth),
        bottom: parseFloat(style.borderBottomWidth),
        left: parseFloat(style.borderLeftWidth),
      },
      margin: {
        top: parseFloat(style.marginTop),
        right: parseFloat(style.marginRight),
        bottom: parseFloat(style.marginBottom),
        left: parseFloat(style.marginLeft),
      },
      totalWidth: rect.width + 
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) +
        parseFloat(style.marginLeft) + parseFloat(style.marginRight),
      totalHeight: rect.height + 
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) +
        parseFloat(style.marginTop) + parseFloat(style.marginBottom),
    };
  }

  // New helper functions for design system detection
  
  function detectSpacingScale(root) {
    const spacingValues = new Map();
    const elements = root.querySelectorAll("*");
    
    for (const el of elements) {
      try {
        const style = getComputedStyle(el);
        const values = [
          style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft,
          style.marginTop, style.marginRight, style.marginBottom, style.marginLeft,
          style.gap, style.rowGap, style.columnGap
        ].filter(v => v && v !== "0px" && v !== "auto");
        
        for (const val of values) {
          const num = parseFloat(val);
          if (num > 0 && num < 200) { // Filter out unreasonable values
            spacingValues.set(val, (spacingValues.get(val) || 0) + 1);
          }
        }
      } catch (_) {}
    }
    
    // Sort by frequency and return top values
    const sorted = [...spacingValues.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));
    
    // Detect scale pattern (4px, 8px, 12px, 16px, etc.)
    const scale = [];
    const commonUnits = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];
    for (const unit of commonUnits) {
      const found = sorted.find(s => Math.abs(parseFloat(s.value) - unit) < 2);
      if (found) scale.push({ unit: `${unit}px`, frequency: found.count });
    }
    
    return { values: sorted, scale, pattern: scale.length >= 3 ? "4px-grid" : "custom" };
  }

  function detectTypeScale(root) {
    const fontSizes = new Map();
    const elements = root.querySelectorAll("h1, h2, h3, h4, h5, h6, p, a, span, li, td, th, button, label, div");
    
    for (const el of elements) {
      try {
        const style = getComputedStyle(el);
        const size = style.fontSize;
        const weight = style.fontWeight;
        const tag = el.tagName.toLowerCase();
        
        if (size) {
          const key = `${size}|${weight}`;
          fontSizes.set(key, {
            size,
            weight,
            tag,
            count: (fontSizes.get(key)?.count || 0) + 1,
            text: (el.textContent || "").trim().slice(0, 30)
          });
        }
      } catch (_) {}
    }
    
    // Sort by font size
    const sorted = [...fontSizes.values()]
      .sort((a, b) => parseFloat(b.size) - parseFloat(a.size))
      .slice(0, 15);
    
    // Detect scale pattern
    const sizes = sorted.map(s => parseFloat(s.size));
    const uniqueSizes = [...new Set(sizes)].sort((a, b) => b - a);
    
    // Check for common scale ratios
    let scaleType = "custom";
    if (uniqueSizes.length >= 3) {
      const ratios = [];
      for (let i = 0; i < uniqueSizes.length - 1; i++) {
        ratios.push(uniqueSizes[i] / uniqueSizes[i + 1]);
      }
      const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      if (Math.abs(avgRatio - 1.25) < 0.1) scaleType = "major-third";
      else if (Math.abs(avgRatio - 1.333) < 0.1) scaleType = "perfect-fourth";
      else if (Math.abs(avgRatio - 1.5) < 0.1) scaleType = "perfect-fifth";
      else if (Math.abs(avgRatio - 1.618) < 0.1) scaleType = "golden-ratio";
    }
    
    return { sizes: sorted, scaleType, uniqueSizes: uniqueSizes.slice(0, 8) };
  }

  function detectColorPalette(root) {
    const colors = new Map();
    const elements = root.querySelectorAll("*");
    
    for (const el of elements) {
      try {
        const style = getComputedStyle(el);
        const bg = style.backgroundColor;
        const fg = style.color;
        
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          const rgb = parseRgb(bg);
          if (rgb && rgb.a > 0.1) {
            const hex = toHex(rgb);
            colors.set(hex, {
              hex,
              rgb,
              type: "background",
              count: (colors.get(hex)?.count || 0) + 1,
              luminance: luminance(rgb)
            });
          }
        }
        
        if (fg) {
          const rgb = parseRgb(fg);
          if (rgb && rgb.a > 0.1) {
            const hex = toHex(rgb);
            if (!colors.has(hex)) {
              colors.set(hex, {
                hex,
                rgb,
                type: "text",
                count: 0,
                luminance: luminance(rgb)
              });
            }
            colors.get(hex).count++;
          }
        }
      } catch (_) {}
    }
    
    // Sort by frequency
    const sorted = [...colors.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    // Categorize colors
    const palette = {
      primary: null,
      secondary: null,
      accent: null,
      neutral: [],
      text: [],
      background: []
    };
    
    // Find primary (most frequent non-neutral color)
    for (const color of sorted) {
      const { luminance: lum, hex } = color;
      const isNeutral = Math.abs(color.rgb.r - color.rgb.g) < 20 && 
                       Math.abs(color.rgb.g - color.rgb.b) < 20;
      
      if (isNeutral) {
        palette.neutral.push(color);
      } else if (!palette.primary && color.type === "background") {
        palette.primary = color;
      } else if (!palette.secondary && color.type === "background") {
        palette.secondary = color;
      } else if (!palette.accent) {
        palette.accent = color;
      }
      
      if (lum < 0.3 || lum > 0.7) {
        palette.text.push(color);
      }
    }
    
    return { colors: sorted, palette };
  }

  function detectSemanticRoles(root) {
    const roles = [];
    const elements = root.querySelectorAll("*");
    
    for (const el of elements) {
      try {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const ariaLabel = el.getAttribute("aria-label");
        const className = el.className;
        const text = (el.textContent || "").trim().slice(0, 50);
        
        // Semantic role detection
        let semanticRole = null;
        
        // Navigation patterns
        if (tag === "nav" || role === "navigation" || /nav|menu|sidebar/i.test(className)) {
          semanticRole = "navigation";
        }
        // Header/hero patterns
        else if (tag === "header" || role === "banner" || /hero|header|banner/i.test(className)) {
          semanticRole = "header";
        }
        // Footer patterns
        else if (tag === "footer" || role === "contentinfo" || /footer/i.test(className)) {
          semanticRole = "footer";
        }
        // Main content
        else if (tag === "main" || role === "main" || /main|content/i.test(className)) {
          semanticRole = "main";
        }
        // Article/content
        else if (tag === "article" || role === "article" || /article|post|blog/i.test(className)) {
          semanticRole = "article";
        }
        // Card patterns
        else if (/card|tile|panel/i.test(className)) {
          semanticRole = "card";
        }
        // Button patterns
        else if (tag === "button" || role === "button" || /btn|button|cta/i.test(className)) {
          semanticRole = "button";
        }
        // Input patterns
        else if (tag === "input" || tag === "textarea" || tag === "select" || /input|field|form/i.test(className)) {
          semanticRole = "input";
        }
        // Image patterns
        else if (tag === "img" || /img|image|photo|avatar/i.test(className)) {
          semanticRole = "image";
        }
        // List patterns
        else if (tag === "ul" || tag === "ol" || role === "list" || /list/i.test(className)) {
          semanticRole = "list";
        }
        // Table patterns
        else if (tag === "table" || role === "table" || /table|grid/i.test(className)) {
          semanticRole = "table";
        }
        
        if (semanticRole) {
          roles.push({
            element: el,
            role: semanticRole,
            tag,
            className,
            text: text || null,
            ariaLabel
          });
        }
      } catch (_) {}
    }
    
    return roles;
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

    // Add semantic roles first (highest priority)
    const semanticRoles = detectSemanticRoles(root);
    for (const { element, role, tag, className, text, ariaLabel } of semanticRoles) {
      const score = 95; // High priority for semantic roles
      add(element, `semantic:${role}`, score);
    }

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
        accessibility: captureAccessibility(el),
        transitions: captureTransitions(style),
        reactComponents: detectReactComponents(el),
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

    // Detect design system patterns
    const spacingScale = detectSpacingScale(root);
    const typeScale = detectTypeScale(root);
    const colorPalette = detectColorPalette(root);

    return {
      version: 4, // Bump version for new features
      layoutSpec,
      typeSpec,
      colorSpec,
      aliases,
      roles: roles.slice(0, 60),
      designSystem: {
        spacingScale,
        typeScale,
        colorPalette,
      },
      rules: [
        "MUST use layoutSpec / typeSpec / colorSpec / aliases for spacing, type, and color.",
        "Do NOT invent padding, gap, justify-content, font-size, or brand colors.",
        "If a value is missing from specs, say so and sample from the screenshot — do not guess.",
        "Screenshot is the pixel source of truth for visual QA.",
        "Use spacingScale for consistent spacing (4px/8px/16px patterns).",
        "Use typeScale for typography hierarchy (headings, body, captions).",
        "Use colorPalette for brand colors (primary, secondary, accent, neutral).",
        "Use accessibility data for ARIA attributes and interactive elements.",
        "Use transitions/animations for motion design.",
        "Use reactComponents for component hierarchy.",
        "Use boxModel for precise spacing and sizing.",
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
      boxModel: captureBoxModel(root),
    };

    const children = prioritized
      .filter((p) => p.el !== root)
      .map(({ el, role }) => ({
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        role,
        computed: filterComputed(getComputedStyle(el)),
        matchedRules: [],
        boxModel: captureBoxModel(el),
      }));

    const fidelityNotes = ["matched_rules_pending_cdp", "agent_specs_v4", "accessibility_data", "transitions_captured", "box_model_captured"];
    if (!specs.aliases.ctaPrimaryBg) fidelityNotes.push("cta_primary_color_missing");
    if (!specs.aliases.ctaSecondaryBg) fidelityNotes.push("cta_secondary_color_missing");
    if (specs.designSystem?.spacingScale?.pattern === "custom") fidelityNotes.push("custom_spacing_scale");
    if (specs.designSystem?.typeScale?.scaleType === "custom") fidelityNotes.push("custom_type_scale");
    const hasReact = roles.some(r => r.reactComponents && r.reactComponents.length > 0);
    if (hasReact) fidelityNotes.push("react_detected");

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
    version: 4,
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
    captureAccessibility,
    captureTransitions,
    detectReactComponents,
    captureBoxModel,
  };
})();
