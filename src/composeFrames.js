/**
 * Dual-frame helpers: label a single capture, or (legacy) compose side-by-side.
 */

const GAP = 48;

/**
 * Name a capture so Figma pastes it as its own top-level frame.
 * @param {object} data
 * @param {string} label e.g. "Closed" | "Open"
 */
export function labelDualFrame(data, label) {
  if (!data) return data;
  const out = deepClone(data);
  out.documentTitle = label;
  if (out.root) out.root.name = label;
  out.fidelity = out.fidelity || {};
  out.fidelity.dualFrame = true;
  out.fidelity.dualFramePart = label;
  return out;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function offsetTree(node, dx, dy) {
  if (!node) return node;
  if (node.rect) {
    node.rect = {
      ...node.rect,
      x: (node.rect.x || 0) + dx,
      y: (node.rect.y || 0) + dy,
    };
    if (node.rect.quad) {
      for (const p of ["p1", "p2", "p3", "p4"]) {
        if (node.rect.quad[p]) {
          node.rect.quad[p] = {
            x: node.rect.quad[p].x + dx,
            y: node.rect.quad[p].y + dy,
          };
        }
      }
    }
  }
  for (const child of node.childNodes || []) offsetTree(child, dx, dy);
  return node;
}

function mergeMaps(target, source) {
  if (!source) return target;
  target = target || {};
  for (const [k, v] of Object.entries(source)) {
    if (target[k] == null) target[k] = v;
  }
  return target;
}

function frameSize(data) {
  const r = data?.root?.rect || data?.documentRect || {};
  return {
    width: r.width || r.cssWidth || data?.viewportRect?.width || 400,
    height: r.height || r.cssHeight || data?.viewportRect?.height || 600,
  };
}

/**
 * @param {Array<{ data: object, label: string }>} frames
 */
export function composeFramesSideBySide(frames, { gap = GAP } = {}) {
  if (!frames?.length) throw new Error("No frames to compose");
  if (frames.length === 1) return frames[0].data;

  const clones = frames.map((f, i) => ({
    label: f.label || `Frame ${i + 1}`,
    data: deepClone(f.data),
  }));

  let x = 0;
  let maxH = 0;
  const children = [];

  for (const item of clones) {
    const size = frameSize(item.data);
    const root = item.data.root;
    if (!root) continue;

    // Wrapper keeps original local coords; position wrapper via rect
    const wrap = {
      nodeType: 1,
      id: `h2d-dual-${children.length}`,
      tag: "DIV",
      name: item.label,
      attributes: { "data-h2d-frame": item.label },
      styles: {
        display: "block",
        position: "absolute",
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: "visible",
      },
      rect: {
        x,
        y: 0,
        width: size.width,
        height: size.height,
        cssWidth: size.width,
        cssHeight: size.height,
      },
      childNodes: [offsetTree(root, 0, 0)],
    };
    // Place child root at 0,0 inside wrapper (already root-relative)
    if (wrap.childNodes[0]?.rect) {
      const dx = -(wrap.childNodes[0].rect.x || 0);
      const dy = -(wrap.childNodes[0].rect.y || 0);
      if (dx || dy) offsetTree(wrap.childNodes[0], dx, dy);
    }

    children.push(wrap);
    maxH = Math.max(maxH, size.height);
    x += size.width + gap;
  }

  const totalW = Math.max(0, x - gap);
  const assets = {};
  const fonts = {};
  const fidelity = {
    version: 1,
    dualFrame: true,
    frameLabels: clones.map((c) => c.label),
    composed: true,
  };

  for (const item of clones) {
    mergeMaps(assets, item.data.assets);
    mergeMaps(fonts, item.data.fonts);
    if (item.data.fidelity) {
      fidelity.parts = fidelity.parts || [];
      fidelity.parts.push({
        label: item.label,
        treeSummary: item.data.fidelity.treeSummary,
        phaseA: item.data.fidelity.phaseA,
        rastersInjected: item.data.fidelity.rastersInjected,
      });
    }
  }

  return {
    version: 2,
    documentTitle: clones.map((c) => c.label).join(" + "),
    documentRect: { x: 0, y: 0, width: totalW, height: maxH },
    viewportRect: { x: 0, y: 0, width: totalW, height: maxH },
    devicePixelRatio: clones[0].data.devicePixelRatio || 1,
    rootBackgroundColor: "#ffffff",
    root: {
      nodeType: 1,
      id: "h2d-dual-root",
      tag: "DIV",
      name: "Dual frame",
      attributes: {},
      styles: {
        display: "block",
        position: "relative",
        width: `${totalW}px`,
        height: `${maxH}px`,
        backgroundColor: "#ffffff",
      },
      rect: {
        x: 0,
        y: 0,
        width: totalW,
        height: maxH,
        cssWidth: totalW,
        cssHeight: maxH,
      },
      childNodes: children,
    },
    assets,
    fonts,
    fidelity,
  };
}

const KIND_LABELS = {
  filter: "filter",
  shadow: "shadow",
  blend: "blend",
  backdrop: "backdrop",
  canvas: "canvas",
  video: "video",
  iframe: "iframe",
  svg: "svg",
  raster: "raster",
};

function formatByKind(byKind) {
  const parts = Object.entries(byKind || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${KIND_LABELS[k] || k}×${n}`);
  return parts.join(", ");
}

/**
 * Trustable fidelity summary for the panel: % editable, raster breakdown, highlight rects.
 */
export function buildFidelityReport(data) {
  const summary = data?.fidelity?.treeSummary || {};
  const elements = Number(summary.elements) || 0;
  const texts = Number(summary.texts) || 0;
  const treeRasters = Number(summary.rasters) || 0;
  const injected =
    Number(data?.fidelity?.rastersInjected) ||
    Number(data?.fidelity?.phaseA?.rastersInjected) ||
    0;
  const rasters = Math.max(treeRasters, injected);
  const editableNodes = Math.max(0, elements - rasters);
  const editablePct = elements > 0 ? Math.round((editableNodes / elements) * 100) : 100;
  const qualityMode = data?.fidelity?.qualityMode === "exact" ? "exact" : "editable";

  const hardRegions = Array.isArray(data?.fidelity?.hardRegions) ? data.fidelity.hardRegions : [];
  const byKind = {};
  for (const r of hardRegions) {
    const k = r?.kind || "raster";
    byKind[k] = (byKind[k] || 0) + 1;
  }
  if (!Object.keys(byKind).length && rasters > 0) {
    byKind.raster = rasters;
  }

  const regions = hardRegions
    .filter((r) => r && Number(r.width) > 1 && Number(r.height) > 1)
    .slice(0, 48)
    .map((r) => ({
      kind: r.kind || "raster",
      elementId: r.elementId || null,
      tag: r.tag || null,
      docX: Number.isFinite(r.docX) ? r.docX : null,
      docY: Number.isFinite(r.docY) ? r.docY : null,
      width: r.width,
      height: r.height,
    }));

  const kindDetail = formatByKind(byKind);
  return {
    qualityMode,
    elements,
    texts,
    rasters,
    editablePct,
    byKind,
    regions,
    label: `${editablePct}% editable`,
    detail:
      rasters > 0
        ? `${rasters} raster${rasters === 1 ? "" : "s"}${kindDetail ? ` · ${kindDetail}` : ""}`
        : "All captured layers stay editable",
    modeHint:
      qualityMode === "exact"
        ? "Exact mode: closer look; filters/shadows/media may become images."
        : "Editable mode: more layers you can edit in Figma.",
  };
}

export function buildCaptureWarnings(data) {
  const warnings = [];
  const assets = data?.assets || {};
  let missing = 0;
  for (const [key, asset] of Object.entries(assets)) {
    if (key.startsWith("rasterized:")) continue;
    if (!asset?.blob?.base64Blob) missing++;
  }
  if (missing > 0) {
    warnings.push(`${missing} image asset(s) failed to embed (CORS/timeout).`);
  }

  const faces = data?.fidelity?.fontFaces || [];
  const noUrl = faces.filter((f) => !f.urls?.length && !f.embedded?.length);
  if (noUrl.length > 0) {
    warnings.push(`${noUrl.length} font face(s) have no embeddable files — Figma may fall back.`);
  }

  const report = buildFidelityReport(data);
  if (report.rasters > 0) {
    warnings.push(
      `${report.rasters} region(s) rasterized (not fully editable)${
        formatByKind(report.byKind) ? `: ${formatByKind(report.byKind)}` : ""
      }.`
    );
  }

  if (data?.fidelity?.forceOpen) {
    warnings.push("Open overlays were force-expanded for capture.");
  }

  if (report.elements > 0) {
    warnings.push(
      `Layers: ${report.elements} elements, ${report.texts} text · ${report.label}.`
    );
  }

  return warnings;
}
