/**
 * Page-world design system capture (DOM + getComputedStyle).
 * SuperDev-inspired: full color sweep, font grouping, CSS variable harvest.
 */
(() => {
  if (window.__htfyDesignSystemCapture?.version >= 3) return;

  const COLOR_RE =
    /(?:rgba?|hsla?|lab|lch|oklab|oklch|color)\([^)]+\)|#[0-9a-fA-F]{3,8}\b/g;
  const ICON_FONT_RE = /font\s*awesome|material\s*icons|glyphicon|icon|symbol|bootstrap-icons/i;

  function topEntries(map, n = 12) {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([value, count]) => ({ value, count }));
  }

  function sizeBucket(n) {
    const v = Math.round(Number(n) || 0);
    return Math.round(v / 4) * 4;
  }

  function classSignature(el) {
    return [...el.classList]
      .filter((c) => c && !c.startsWith("h2d") && !c.startsWith("htfy") && c.length < 48)
      .slice(0, 3)
      .sort()
      .join(".");
  }

  function childSig(el) {
    return Array.from(el.children)
      .slice(0, 6)
      .map((c) => c.tagName.toLowerCase())
      .join(">");
  }

  function slug(v) {
    return String(v)
      .replace(/[^a-z0-9.]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
      .toLowerCase();
  }

  /** Resolve modern color spaces to rgb/rgba via canvas (SuperDev F$ pattern). */
  function resolveToRgb(cssColor) {
    if (!cssColor) return null;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = cssColor;
      if (typeof ctx.fillStyle !== "string" || !ctx.fillStyle) return null;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return null;
      if (a < 255) return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      return `rgb(${r}, ${g}, ${b})`;
    } catch {
      return null;
    }
  }

  function toHex(rgb) {
    const m = String(rgb).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    const to = (n) =>
      Math.max(0, Math.min(255, Math.round(+n)))
        .toString(16)
        .padStart(2, "0");
    return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
  }


  function isOpaqueFill(bg) {
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
    if (/gradient/i.test(bg)) return true;
    const m = String(bg).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/i);
    if (!m) return !!toHex(resolveToRgb(bg));
    return m[4] === undefined || Number(m[4]) > 0.15;
  }

  function labelOf(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48);
  }

  function hslSortKey(rgb) {
    const m = String(rgb).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return [0, 0, 0];
    let r = +m[1] / 255;
    let g = +m[2] / 255;
    let b = +m[3] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        default:
          h = ((r - g) / d + 4) / 6;
      }
    }
    const gray = s < 0.08 ? 0 : 1;
    return [gray, h, s, l];
  }

  function suggestFoundationName(css, i) {
    const rgb = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!rgb) return `swatch-${i + 1}`;
    const r = +rgb[1];
    const g = +rgb[2];
    const b = +rgb[3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 12) {
      if (max > 230) return "white";
      if (max < 30) return "black";
      const step = Math.round((max / 255) * 9) * 100;
      return `gray-${Math.min(900, Math.max(100, step))}`;
    }
    const hue =
      r >= g && r >= b ? "red" : g >= r && g >= b ? "green" : "blue";
    const light = max > 200 ? "300" : max > 140 ? "400" : max > 80 ? "600" : "800";
    return `${hue}-${light}`;
  }

  function harvestCssVariables() {
    const vars = [];
    const seen = new Set();
    const add = (name, value) => {
      if (!name || !name.startsWith("--") || seen.has(name)) return;
      if (!value || value === "initial" || value === "inherit") return;
      seen.add(name);
      const resolved = resolveToRgb(value);
      vars.push({
        name,
        value: String(value).trim().slice(0, 200),
        resolved: resolved || null,
        hex: resolved ? toHex(resolved) : null,
      });
    };

    try {
      const rootStyles = getComputedStyle(document.documentElement);
      for (let i = 0; i < rootStyles.length; i++) {
        const prop = rootStyles[i];
        if (prop.startsWith("--")) add(prop, rootStyles.getPropertyValue(prop).trim());
      }
    } catch (_) {}

    try {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        if (!rules) continue;
        for (const rule of rules) {
          if (!rule.style) continue;
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (prop.startsWith("--")) add(prop, rule.style.getPropertyValue(prop).trim());
          }
        }
      }
    } catch (_) {}

    return vars.slice(0, 80);
  }

  function hasText(el) {
    try {
      const t = el.textContent || "";
      return t.replace(/\s+/g, "").length > 0;
    } catch {
      return false;
    }
  }

  function isVisible(el) {
    try {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    } catch {
      return false;
    }
  }

  function isExtensionChrome(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const id = el.id || "";
      if (id === "htfyRoot" || id.startsWith("__htfy")) return true;
      if (el.getAttribute("data-htfy-chrome") === "1") return true;
      if (el.getAttribute("data-h2d-ignore") === "true") return true;
      if (el.closest?.("#htfyRoot, [id^='__htfy'], [data-htfy-chrome='1']")) return true;
    } catch (_) {}
    return false;
  }


  function extractControlVariants(root) {
    const buttons = [];
    const links = [];
    const seenBtn = new Set();
    const seenLink = new Set();
    const candidates = root.querySelectorAll(
      'button, [role="button"], a, input[type="submit"], input[type="button"]'
    );

    const scoreButton = (el, contract) => {
      let score = 0;
      const h = parseFloat(contract.height) || 0;
      const w = parseFloat(String(contract.width)) || 0;
      const r = parseFloat(contract.borderRadius) || 0;
      if (contract.text && contract.text.length >= 2) score += 60;
      if (h >= 28 && h <= 48) score += 30;
      if (w >= 70) score += 25;
      if (w < 40 && (r >= 40 || contract.borderRadius === "50%")) score -= 120; // icon chips
      try {
        if (el.closest("header, [role='banner'], nav")) score += 45;
        if (el.closest("footer, [role='contentinfo']")) score -= 15;
      } catch (_) {}
      const cls = (contract.className || "").toLowerCase();
      if (/hero|tab|submit|connecticon|social|hamburger/.test(cls)) score -= 35;
      if (/button|btn|cta|teal|black|primary/.test(cls)) score += 15;
      return score;
    };

    const labelFontSize = (el, fallback) => {
      try {
        const label = el.querySelector("p, span, .label, [class*='label']");
        if (label) {
          const fs = getComputedStyle(label).fontSize;
          if (fs && fs !== "13.3333px") return fs;
        }
      } catch (_) {}
      return fallback;
    };

    for (const el of candidates) {
      if (isExtensionChrome(el) || !isVisible(el)) continue;
      let s;
      try {
        s = getComputedStyle(el);
      } catch {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 16) continue;

      const bg = s.backgroundColor;
      const rgb = resolveToRgb(bg);
      const hex = rgb ? toHex(rgb) : null;
      const tag = el.tagName.toLowerCase();
      const text = labelOf(el);
      const contract = {
        tag,
        text: text || null,
        backgroundColor: bg,
        backgroundColorHex: hex,
        color: s.color,
        colorHex: toHex(resolveToRgb(s.color) || "") || null,
        height: s.height,
        width: `${Math.round(r.width)}px`,
        borderRadius: s.borderTopLeftRadius,
        fontFamily: s.fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim() || null,
        fontSize: labelFontSize(el, s.fontSize),
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
        gap: s.gap !== "normal" ? s.gap : null,
        boxShadow: s.boxShadow !== "none" ? s.boxShadow : null,
        border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
        className: classSignature(el),
        inChrome: !!(el.closest?.("header, [role='banner'], nav")),
      };

      if ((tag === "button" || el.getAttribute("role") === "button" || tag === "input") && isOpaqueFill(bg)) {
        const key = `${hex}|${s.height}|${s.borderTopLeftRadius}|${Math.round(r.width)}`;
        if (!seenBtn.has(key)) {
          seenBtn.add(key);
          buttons.push({ ...contract, _score: scoreButton(el, contract) });
        }
      } else if (tag === "a" && text && !isOpaqueFill(bg)) {
        const key = `${contract.colorHex}|${s.fontSize}|${s.fontWeight}`;
        if (!seenLink.has(key) && links.length < 8) {
          seenLink.add(key);
          links.push({ ...contract, role: "navLink" });
        }
      } else if (tag === "a" && isOpaqueFill(bg) && text) {
        const key = `a-${hex}|${s.height}|${Math.round(r.width)}`;
        if (!seenBtn.has(key)) {
          seenBtn.add(key);
          buttons.push({ ...contract, _score: scoreButton(el, contract) });
        }
      }
    }

    // Prefer header/nav CTAs; drop low-score icon noise
    const ranked = buttons
      .filter((b) => (b._score || 0) > 0)
      .sort((a, b) => (b._score || 0) - (a._score || 0));

    const chromeFirst = ranked.filter((b) => b.inChrome);
    const pick = (chromeFirst.length >= 2 ? chromeFirst : ranked).slice(0, 6);

    const named = pick.map((b, i) => {
      const { _score, inChrome, ...rest } = b;
      let role = `variant-${i + 1}`;
      if (i === 0) role = "primary";
      else if (i === 1) role = "secondary";
      return { ...rest, role, score: _score };
    });

    return { buttons: named, links: links.slice(0, 6) };
  }

  function extractDesignSystem(root) {
    const colors = new Map();
    const fonts = new Map(); // family -> { count, sizes:Map, weights:Map, tags:Map }
    const fontSizes = new Map();
    const fontWeights = new Map();
    const lineHeights = new Map();
    const letterSpacings = new Map();
    const radii = new Map();
    const spaces = new Map();
    const shadows = new Map();
    const components = new Map();

    const els = [root, ...root.querySelectorAll("*")].filter(
      (n) => n.nodeType === 1 && !isExtensionChrome(n)
    );
    const maxEls = Math.min(els.length, 2500);

    for (let ei = 0; ei < maxEls; ei++) {
      const el = els[ei];
      let s;
      try {
        s = getComputedStyle(el);
      } catch {
        continue;
      }

      // Full computed-style color sweep (SuperDev Color Palette)
      try {
        for (const prop of s) {
          const val = s.getPropertyValue(prop);
          if (!val || val.length > 400) continue;
          if (!/rgb|lab|lch|oklab|oklch|color\(|#/.test(val)) continue;
          const matches = val.match(COLOR_RE) || [];
          for (const raw of matches) {
            const rgb = resolveToRgb(raw);
            if (rgb) colors.set(rgb, (colors.get(rgb) || 0) + 1);
          }
        }
      } catch (_) {
        for (const key of ["color", "backgroundColor", "borderTopColor", "outlineColor", "fill", "stroke"]) {
          const rgb = resolveToRgb(s[key]);
          if (rgb) colors.set(rgb, (colors.get(rgb) || 0) + 1);
        }
      }

      // Typography (List All Fonts style)
      if (hasText(el) && isVisible(el) && s.fontFamily) {
        const fam = s.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
        if (fam && !ICON_FONT_RE.test(fam) && !/^var\(/i.test(fam)) {
          let entry = fonts.get(fam);
          if (!entry) {
            entry = { count: 0, sizes: new Map(), weights: new Map(), tags: new Map() };
            fonts.set(fam, entry);
          }
          entry.count += 1;
          if (s.fontSize) {
            entry.sizes.set(s.fontSize, (entry.sizes.get(s.fontSize) || 0) + 1);
            fontSizes.set(s.fontSize, (fontSizes.get(s.fontSize) || 0) + 1);
          }
          if (s.fontWeight) {
            entry.weights.set(s.fontWeight, (entry.weights.get(s.fontWeight) || 0) + 1);
            fontWeights.set(s.fontWeight, (fontWeights.get(s.fontWeight) || 0) + 1);
          }
          const tag = el.tagName.toLowerCase();
          entry.tags.set(tag, (entry.tags.get(tag) || 0) + 1);
          if (s.lineHeight && s.lineHeight !== "normal") {
            lineHeights.set(s.lineHeight, (lineHeights.get(s.lineHeight) || 0) + 1);
          }
          if (s.letterSpacing && s.letterSpacing !== "normal") {
            letterSpacings.set(s.letterSpacing, (letterSpacings.get(s.letterSpacing) || 0) + 1);
          }
        }
      }

      for (const key of [
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderBottomRightRadius",
        "borderBottomLeftRadius",
      ]) {
        const v = s[key];
        if (v && v !== "0px") radii.set(v, (radii.get(v) || 0) + 1);
      }

      for (const key of [
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
        "gap",
        "rowGap",
        "columnGap",
      ]) {
        const v = s[key];
        if (!v || v === "0px" || v === "normal") continue;
        spaces.set(v, (spaces.get(v) || 0) + 1);
      }

      if (s.boxShadow && s.boxShadow !== "none") {
        shadows.set(s.boxShadow, (shadows.get(s.boxShadow) || 0) + 1);
      }

      const cls = classSignature(el);
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 16) continue;
      if (!cls && !["BUTTON", "A", "LI", "ARTICLE", "NAV", "HEADER"].includes(el.tagName)) continue;

      const sig = [
        el.tagName.toLowerCase(),
        cls || "_",
        sizeBucket(r.width),
        sizeBucket(r.height),
        childSig(el),
      ].join("|");

      const entry = components.get(sig) || {
        signature: sig,
        tag: el.tagName.toLowerCase(),
        className: cls,
        count: 0,
        width: sizeBucket(r.width),
        height: sizeBucket(r.height),
        elements: [],
        sampleStyles: null,
      };
      entry.count += 1;
      if (entry.elements.length < 8) entry.elements.push(el);
      if (!entry.sampleStyles) {
        entry.sampleStyles = {
          color: s.color,
          backgroundColor: s.backgroundColor,
          borderRadius: s.borderTopLeftRadius,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontFamily: s.fontFamily?.split(",")[0]?.replace(/['"]/g, "").trim(),
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
        };
      }
      components.set(sig, entry);
    }

    const colorList = [...colors.entries()]
      .sort((a, b) => {
        const ka = hslSortKey(a[0]);
        const kb = hslSortKey(b[0]);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return b[1] - a[1];
      })
      .slice(0, 24)
      .map(([value, count], i) => {
        const foundation = suggestFoundationName(value, i);
        return {
          value,
          hex: toHex(value),
          count,
          foundation: `--color-${foundation}`,
          token: `color/${foundation}`,
        };
      });

    const fontFamilies = [...fonts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([family, data]) => ({
        family,
        count: data.count,
        token: `--font-${slug(family)}`,
        sizes: topEntries(data.sizes, 12).map((x) => x.value),
        weights: topEntries(data.weights, 8).map((x) => x.value),
        tags: topEntries(data.tags, 10).map((x) => x.value),
      }));

    const repeated = [...components.values()]
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 24)
      .map((c, i) => {
        const base =
          c.className?.split(".")[0] ||
          (c.tag === "button" ? "Button" : c.tag === "a" ? "Link" : c.tag);
        const name = `Component/${base.charAt(0).toUpperCase()}${base.slice(1) || "Block"}-${i + 1}`;
        return {
          name,
          signature: c.signature,
          tag: c.tag,
          className: c.className,
          count: c.count,
          width: c.width,
          height: c.height,
          styles: c.sampleStyles,
          elementIds: [],
        };
      });

    let compIdx = 0;
    for (const c of [...components.values()].filter((x) => x.count >= 2).slice(0, 24)) {
      const meta = repeated[compIdx];
      if (!meta) break;
      for (const el of c.elements) {
        if (!el.id) el.id = `htfy-comp-${compIdx}-${meta.elementIds.length}`;
        el.setAttribute("data-h2d-component", meta.name);
        meta.elementIds.push(el.id);
      }
      compIdx++;
    }

    const controls = extractControlVariants(root);

    return {
      colors: colorList,
      fonts: fontFamilies.map((f) => ({ value: f.family, count: f.count, token: `font/${slug(f.family)}` })),
      fontFamilies,
      fontSizes: topEntries(fontSizes, 12).map((t) => ({
        ...t,
        token: `fontSize/${slug(t.value)}`,
      })),
      fontWeights: topEntries(fontWeights, 8).map((t) => ({
        ...t,
        token: `fontWeight/${slug(t.value)}`,
      })),
      lineHeights: topEntries(lineHeights, 8).map((t) => ({
        ...t,
        token: `lineHeight/${slug(t.value)}`,
      })),
      letterSpacings: topEntries(letterSpacings, 8).map((t) => ({
        ...t,
        token: `letterSpacing/${slug(t.value)}`,
      })),
      radii: topEntries(radii, 10).map((t) => ({ ...t, token: `radius/${slug(t.value)}` })),
      spaces: topEntries(spaces, 16).map((t) => ({ ...t, token: `space/${slug(t.value)}` })),
      shadows: topEntries(shadows, 6).map((t, i) => ({ ...t, token: `shadow/${i + 1}` })),
      cssVariables: harvestCssVariables(),
      components: repeated,
      buttons: controls.buttons,
      links: controls.links,
    };
  }

  window.__htfyDesignSystemCapture = { version: 3, extractDesignSystem };
})();
