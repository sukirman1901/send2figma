/**
 * Phase A: patch figh2d JSON so fidelity work actually affects Figma paste.
 * - inject hard-region rasters into nodes (placeholderUrl + clear children)
 * - apply structural styles (colors, backgrounds, layer names, root inherited)
 */

const ELEMENT = 1;
const TEXT = 3;

function rectsOverlap(a, b, pad = 2) {
  if (!a || !b) return false;
  const ax1 = a.x ?? 0;
  const ay1 = a.y ?? 0;
  const ax2 = ax1 + (a.width ?? a.cssWidth ?? 0);
  const ay2 = ay1 + (a.height ?? a.cssHeight ?? 0);
  const bx1 = (b.x ?? 0) - pad;
  const by1 = (b.y ?? 0) - pad;
  const bx2 = bx1 + (b.width ?? 0) + pad * 2;
  const by2 = by1 + (b.height ?? 0) + pad * 2;
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

function rectCenterDistance(a, b) {
  const acx = (a.x ?? 0) + (a.width ?? 0) / 2;
  const acy = (a.y ?? 0) + (a.height ?? 0) / 2;
  const bcx = (b.x ?? 0) + (b.width ?? 0) / 2;
  const bcy = (b.y ?? 0) + (b.height ?? 0) / 2;
  const dx = acx - bcx;
  const dy = acy - bcy;
  return Math.hypot(dx, dy);
}

function area(r) {
  return Math.max(0, r?.width || 0) * Math.max(0, r?.height || 0);
}

/** Prefer node whose rect best matches the hard region (same space: root-relative). */
export function findBestNodeForRegion(root, region) {
  let best = null;
  let bestScore = Infinity;
  const regionArea = area(region);

  function walk(node) {
    if (!node || node.nodeType !== ELEMENT) return;
    if (region.elementId && node.attributes?.id === region.elementId) {
      best = node;
      bestScore = -1;
      return;
    }
    if (node.rect && rectsOverlap(node.rect, region)) {
      const nodeArea = area(node.rect);
      // Never attach a small raster to a much larger parent (would wipe the page).
      if (regionArea > 0 && nodeArea > regionArea * 4) {
        // still walk children
      } else {
        const tag = (node.tag || "").toUpperCase();
        const kind = region.kind || "";
        const tagBonus =
          (kind === "iframe" && tag === "IFRAME") ||
          (kind === "video" && tag === "VIDEO") ||
          (kind === "canvas" && tag === "CANVAS") ||
          (kind === "svg" && tag === "SVG") ||
          (kind === "backdrop" && tag)
            ? 0
            : 40;
        const sizeDiff = Math.abs(nodeArea - regionArea);
        const score = rectCenterDistance(node.rect, region) + sizeDiff * 0.01 + tagBonus;
        if (score < bestScore) {
          bestScore = score;
          best = node;
        }
      }
    }
    for (const child of node.childNodes || []) {
      if (bestScore < 0) return;
      walk(child);
    }
  }

  walk(root);
  return bestScore < 200 ? best : null;
}

const EDITABLE_SKIP_INJECT = new Set(["filter", "backdrop", "blend", "shadow"]);

export function injectHardRegionRasters(data, { qualityMode = "editable" } = {}) {
  let regions = (data?.fidelity?.hardRegions || []).filter((r) => r.assetKey);
  if (qualityMode !== "exact") {
    regions = regions.filter((r) => !EDITABLE_SKIP_INJECT.has(r.kind));
  }
  if (!regions.length || !data?.root) return data;

  const used = new Set();
  for (const region of regions) {
    const node = findBestNodeForRegion(data.root, region);
    if (!node || used.has(node)) continue;
    // Extra guard: refuse to wipe a node much larger than the region unless id-matched.
    const idMatch = region.elementId && node.attributes?.id === region.elementId;
    if (!idMatch && area(node.rect) > area(region) * 4) continue;
    used.add(node);
    node.placeholderUrl = region.assetKey;
    node.childNodes = [];
    delete node.content;
    node.styles = {
      ...(node.styles || {}),
      overflow: "hidden",
      backgroundImage: "none",
    };
    node.attributes = {
      ...(node.attributes || {}),
      "data-h2d-raster": region.kind || "hard",
    };
    node.name = node.name || `raster:${region.kind || "hard"}`;
    region.appliedTo = node.id || node.name;
  }

  data.fidelity = data.fidelity || {};
  data.fidelity.rastersInjected = used.size;
  return data;
}

const COLOR_PROPS = new Set([
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "columnRuleColor",
  "caretColor",
  "fill",
  "stroke",
]);

/** Flatten modern CSS colors to rgb/rgba when a flattener fn is provided; otherwise keep. */
export function flattenStyleColors(styles, flattenFn) {
  if (!styles || typeof styles !== "object") return styles;
  const out = { ...styles };
  for (const key of Object.keys(out)) {
    if (!COLOR_PROPS.has(key) && !/color/i.test(key)) continue;
    const v = out[key];
    if (typeof v !== "string") continue;
    if (flattenFn) out[key] = flattenFn(v);
  }
  return out;
}

export function applyLayerName(node) {
  if (!node || node.nodeType !== ELEMENT) return;
  if (node.name) return;
  const tag = (node.tag || "div").toLowerCase();
  const id = node.attributes?.id;
  const cls = (node.attributes?.class || node.attributes?.className || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");
  if (id) node.name = `${tag}#${id}`;
  else if (cls) node.name = `${tag}.${cls}`;
  else node.name = tag;
}

export function applyBackgroundMeta(node, backgrounds) {
  if (!node || !backgrounds) return;
  const bgId = node.attributes?.id;
  let meta = (bgId && backgrounds[bgId]) || null;
  if (!meta && node.styles?.backgroundImage && node.styles.backgroundImage !== "none") {
    meta =
      Object.values(backgrounds).find((b) => b.backgroundImage === node.styles.backgroundImage) ||
      Object.values(backgrounds).find(
        (b) =>
          node.styles.backgroundImage.includes("gradient") &&
          b.layers?.some((l) => String(l.type || "").includes("gradient"))
      ) ||
      null;
  }
  if (!meta) return;
  node.styles = node.styles || {};
  node.styles.backgroundLayers = meta.layers;
  if (meta.backgroundSize) node.styles.backgroundSize = meta.backgroundSize;
  if (meta.backgroundPosition) node.styles.backgroundPosition = meta.backgroundPosition;
  if (meta.backgroundRepeat) node.styles.backgroundRepeat = meta.backgroundRepeat;
  if (meta.backgroundBlendMode) node.styles.backgroundBlendMode = meta.backgroundBlendMode;
  if (meta.backgroundColor && meta.backgroundColor !== "rgba(0, 0, 0, 0)") {
    node.styles.backgroundColor = meta.backgroundColor;
  }
}

/**
 * Walk tree: names, background layers, color flatten, merge root inherited.
 */
export function applyStructuralStyles(data, { flattenColor } = {}) {
  if (!data?.root) return data;
  const backgrounds = data.fidelity?.backgrounds || {};
  const inherited = data.fidelity?.inheritedStyles || null;

  function walk(node, isRoot) {
    if (!node) return;
    if (node.nodeType === ELEMENT) {
      applyLayerName(node);
      if (node.styles) {
        node.styles = flattenStyleColors(node.styles, flattenColor);
      }
      applyBackgroundMeta(node, backgrounds);
      if (isRoot && inherited && typeof inherited === "object") {
        node.styles = { ...inherited, ...(node.styles || {}) };
        node.styles = flattenStyleColors(node.styles, flattenColor);
      }
      for (const child of node.childNodes || []) walk(child, false);
    } else if (node.nodeType === TEXT) {
      // no-op
    }
  }

  walk(data.root, true);

  // Ensure document-level background survives
  if (data.rootBackgroundColor && data.root.styles) {
    if (!data.root.styles.backgroundColor || data.root.styles.backgroundColor === "rgba(0, 0, 0, 0)") {
      data.root.styles.backgroundColor = data.rootBackgroundColor;
    }
  }

  data.fidelity = data.fidelity || {};
  data.fidelity.structuralStylesApplied = true;
  return data;
}

export function summarizeTree(data) {
  let elements = 0;
  let texts = 0;
  let rasters = 0;
  let named = 0;
  let withBgLayers = 0;

  function walk(node) {
    if (!node) return;
    if (node.nodeType === ELEMENT) {
      elements++;
      if (node.placeholderUrl) rasters++;
      if (node.name) named++;
      if (node.styles?.backgroundLayers) withBgLayers++;
      for (const c of node.childNodes || []) walk(c);
    } else if (node.nodeType === TEXT) {
      texts++;
    }
  }
  walk(data?.root);
  return { elements, texts, rasters, named, withBgLayers, version: data?.version };
}
