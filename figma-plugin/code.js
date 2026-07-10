/**
 * Send2Figma Design System plugin
 * Paste capture → run plugin → paste designSystem JSON → create variables + rename matching layers.
 */
figma.showUI(__html__, { width: 360, height: 420 });

function ensureCollection(name) {
  const existing = figma.variables.getLocalVariableCollections().find((c) => c.name === name);
  if (existing) return existing;
  return figma.variables.createVariableCollection(name);
}

function parseCssColor(input) {
  if (!input) return null;
  const s = String(input).trim();

  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 4) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    const a =
      h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
  }

  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (rgb) {
    return {
      r: Number(rgb[1]) / 255,
      g: Number(rgb[2]) / 255,
      b: Number(rgb[3]) / 255,
      a: rgb[4] != null ? Number(rgb[4]) : 1,
    };
  }

  // Modern CSS: oklab(L a b / alpha) or oklab(L a b)
  const oklab = s.match(
    /^oklab\(\s*([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)(?:\s*\/\s*([-\d.e+%]+))?\s*\)$/i
  );
  if (oklab) {
    const paint = oklabToSrgb(Number(oklab[1]), Number(oklab[2]), Number(oklab[3]));
    if (!paint) return null;
    paint.a = parseAlpha(oklab[4]);
    return paint;
  }

  // CSS lab(): lab(L a b / alpha) or legacy lab(L, a, b, A)
  const labSpace = s.match(
    /^lab\(\s*([-\d.e+%]+)\s+([-\d.e+]+)\s+([-\d.e+]+)(?:\s*\/\s*([-\d.e+%]+))?\s*\)$/i
  );
  if (labSpace) {
    const paint = cieLabToSrgb(parseLabL(labSpace[1]), Number(labSpace[2]), Number(labSpace[3]));
    if (!paint) return null;
    paint.a = parseAlpha(labSpace[4]);
    return paint;
  }
  const labComma = s.match(
    /^lab\(\s*([-\d.e+%]+)\s*,\s*([-\d.e+]+)\s*,\s*([-\d.e+]+)(?:\s*,\s*([-\d.e+%]+))?\s*\)$/i
  );
  if (labComma) {
    const paint = cieLabToSrgb(parseLabL(labComma[1]), Number(labComma[2]), Number(labComma[3]));
    if (!paint) return null;
    paint.a = parseAlpha(labComma[4]);
    return paint;
  }

  return null;
}

function parseAlpha(raw) {
  if (raw == null || raw === "") return 1;
  const t = String(raw).trim();
  if (t.endsWith("%")) return Math.max(0, Math.min(1, Number(t.slice(0, -1)) / 100));
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

function parseLabL(raw) {
  const t = String(raw).trim();
  if (t.endsWith("%")) return Number(t.slice(0, -1));
  return Number(t);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function linearToSrgb(c) {
  const x = clamp01(c);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** OKLab → sRGB (0–1). */
function oklabToSrgb(L, a, b) {
  if (![L, a, b].every(Number.isFinite)) return null;
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return {
    r: linearToSrgb(rLin),
    g: linearToSrgb(gLin),
    b: linearToSrgb(bLin),
    a: 1,
  };
}

/** CIE L*a*b* (D65) → sRGB (0–1). */
function cieLabToSrgb(L, a, b) {
  if (![L, a, b].every(Number.isFinite)) return null;
  // Lab → XYZ (D65)
  let y = (L + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  const fInv = (t) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  x = 0.95047 * fInv(x);
  y = 1.0 * fInv(y);
  z = 1.08883 * fInv(z);
  // XYZ → linear sRGB
  const rLin = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const gLin = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const bLin = x * 0.0557 + y * -0.204 + z * 1.057;
  return {
    r: linearToSrgb(rLin),
    g: linearToSrgb(gLin),
    b: linearToSrgb(bLin),
    a: 1,
  };
}

function upsertColorVar(collection, modeId, name, css) {
  const paint = parseCssColor(css);
  if (!paint) return false;
  let variable = figma.variables
    .getLocalVariables("COLOR")
    .find((v) => v.name === name && v.variableCollectionId === collection.id);
  if (!variable) variable = figma.variables.createVariable(name, collection, "COLOR");
  variable.setValueForMode(modeId, {
    r: paint.r,
    g: paint.g,
    b: paint.b,
    a: paint.a ?? 1,
  });
  return true;
}

function upsertFloatVar(collection, modeId, name, cssPx) {
  const n = parseFloat(cssPx);
  if (!Number.isFinite(n)) return false;
  let variable = figma.variables
    .getLocalVariables("FLOAT")
    .find((v) => v.name === name && v.variableCollectionId === collection.id);
  if (!variable) variable = figma.variables.createVariable(name, collection, "FLOAT");
  variable.setValueForMode(modeId, n);
  return true;
}

function applyTokens(tokens) {
  const collection = ensureCollection("Send2Figma / Design System");
  const modeId = collection.modes[0].modeId;
  let colors = 0;
  let floats = 0;
  let skippedColors = 0;

  for (const entry of tokens.colors || []) {
    const name = entry.token || `color/${String(entry.value).slice(0, 24)}`;
    if (upsertColorVar(collection, modeId, name, entry.value)) colors++;
    else skippedColors++;
  }
  for (const entry of [...(tokens.radii || []), ...(tokens.spaces || []), ...(tokens.fontSizes || [])]) {
    const name = entry.token || `size/${entry.value}`;
    if (upsertFloatVar(collection, modeId, name, entry.value)) floats++;
  }

  figma.root.setPluginData("h2dTokens", JSON.stringify(tokens));
  return { colors, floats, skippedColors, components: (tokens.components || []).length };
}

function renameLayersFromComponents(components) {
  if (!components?.length) return 0;
  const names = new Set(components.map((c) => c.name));
  let renamed = 0;

  function walk(node) {
    if ("children" in node) {
      for (const child of node.children) walk(child);
    }
    // If layer already named like Component/… keep; also match loose class hints in name
    if (node.name && names.has(node.name)) {
      renamed++;
      return;
    }
    for (const c of components) {
      const hint = c.className?.split(".")[0];
      if (hint && node.name && node.name.toLowerCase().includes(hint.toLowerCase())) {
        if (!node.name.startsWith("Component/")) {
          node.name = c.name;
          renamed++;
        }
        break;
      }
    }
  }

  for (const page of figma.root.children) walk(page);
  return renamed;
}

function bindFillsToVariables(tokens) {
  if (!tokens?.colors?.length) return 0;
  const collection = ensureCollection("Send2Figma / Design System");
  const colorVars = figma.variables
    .getLocalVariables("COLOR")
    .filter((v) => v.variableCollectionId === collection.id);
  const byCss = new Map();
  for (const entry of tokens.colors) {
    const paint = parseCssColor(entry.value);
    if (!paint) continue;
    const key = `${paint.r.toFixed(3)},${paint.g.toFixed(3)},${paint.b.toFixed(3)}`;
    const name = entry.token;
    const variable = colorVars.find((v) => v.name === name);
    if (variable) byCss.set(key, variable);
  }

  let bound = 0;
  function walk(node) {
    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills.map((f) => {
        if (f.type !== "SOLID" || f.boundVariables?.color) return f;
        const key = `${f.color.r.toFixed(3)},${f.color.g.toFixed(3)},${f.color.b.toFixed(3)}`;
        const variable = byCss.get(key);
        if (!variable) return f;
        bound++;
        return figma.variables.setBoundVariableForPaint(f, "color", variable);
      });
      try {
        node.fills = fills;
      } catch (_) {}
    }
    if ("children" in node) for (const c of node.children) walk(c);
  }
  const sel = figma.currentPage.selection;
  const roots = sel.length ? sel : figma.currentPage.children;
  for (const r of roots) walk(r);
  return bound;
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "APPLY_JSON") {
    try {
      const raw = typeof msg.json === "string" ? msg.json.trim() : "";
      if (!raw) {
        throw new Error("Paste designsystem.json first (from Send2Figma → Design system → Export .json).");
      }
      const data = typeof msg.json === "string" ? JSON.parse(msg.json) : msg.json;
      const tokens =
        data?.tokens ||
        data?.fidelity?.designTokens ||
        data?.designTokens ||
        data?.fidelity?.designSystemExport?.tokens ||
        data;
      const components = data?.components || data?.fidelity?.designTokens?.components || [];
      const pack = { ...tokens, components };
      const colorCount = pack.colors?.length || 0;
      const floatCount =
        (pack.radii?.length || 0) + (pack.spaces?.length || 0) + (pack.fontSizes?.length || 0);
      if (!colorCount && !floatCount && !components.length) {
        throw new Error(
          "JSON has no tokens. In Chrome: Design system → Extract from page → Export .json (not .md)."
        );
      }
      const stats = applyTokens(pack);
      const renamed = renameLayersFromComponents(components);
      const bound = bindFillsToVariables(pack);
      const skipNote = stats.skippedColors ? `, skipped ${stats.skippedColors}` : "";
      figma.notify(
        `DS: ${stats.colors} colors, ${stats.floats} sizes, ${renamed} renames, ${bound} fills bound${skipNote}`
      );
      figma.ui.postMessage({ type: "DONE", stats: { ...stats, renamed, bound } });
    } catch (err) {
      figma.notify("Invalid design system JSON: " + err.message);
      figma.ui.postMessage({ type: "ERROR", error: err.message });
    }
  }
  if (msg.type === "CLOSE") figma.closePlugin();
};

figma.ui.postMessage({ type: "READY" });
