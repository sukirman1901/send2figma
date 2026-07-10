/**
 * Service-worker / Node-safe design system helpers (no DOM).
 */

import { formatDesignSystemMarkdown } from "./designSystemMd.js";

export function applyComponentNames(data) {
  const comps = data?.fidelity?.designTokens?.components;
  if (!Array.isArray(comps) || !data?.root) return data;

  const idToName = new Map();
  for (const c of comps) {
    for (const id of c.elementIds || []) idToName.set(id, c.name);
  }

  function walk(node) {
    if (!node || node.nodeType !== 1) return;
    const id = node.attributes?.id;
    if (id && idToName.has(id)) {
      const name = idToName.get(id);
      node.name = name;
      node.attributes = { ...node.attributes, "data-h2d-component": name };
      node.componentHint = name;
    }
    for (const child of node.childNodes || []) walk(child);
  }
  walk(data.root);
  data.fidelity = data.fidelity || {};
  data.fidelity.componentsNamed = idToName.size;
  return data;
}

export function buildDesignSystemExport(data) {
  const tokens = data?.fidelity?.designTokens || {};
  const exp = {
    version: 3,
    format: "design-system-ai-rulebook",
    source: data?.documentTitle || "Send2Figma",
    exportedAt: new Date().toISOString(),
    tokens: {
      colors: tokens.colors || [],
      fonts: tokens.fonts || [],
      fontFamilies: tokens.fontFamilies || [],
      fontSizes: tokens.fontSizes || [],
      fontWeights: tokens.fontWeights || [],
      lineHeights: tokens.lineHeights || [],
      letterSpacings: tokens.letterSpacings || [],
      radii: tokens.radii || [],
      spaces: tokens.spaces || [],
      shadows: tokens.shadows || [],
      cssVariables: tokens.cssVariables || [],
    },
    components: tokens.components || [],
    treeSummary: data?.fidelity?.treeSummary || null,
  };
  exp.markdown = formatDesignSystemMarkdown(exp);
  return exp;
}

/** JSON payload for Figma plugin (no markdown). */
export function toDesignSystemJsonPayload(exp) {
  if (!exp) return null;
  return {
    version: exp.version ?? 3,
    source: exp.source,
    exportedAt: exp.exportedAt,
    tokens: exp.tokens || {},
    components: exp.components || [],
    treeSummary: exp.treeSummary ?? null,
  };
}

export { formatDesignSystemMarkdown };

export function summarizeDesignSystem(tokens) {
  if (!tokens) return null;
  return {
    colors: tokens.colors?.length || 0,
    fonts: tokens.fontFamilies?.length || tokens.fonts?.length || 0,
    radii: tokens.radii?.length || 0,
    spaces: tokens.spaces?.length || 0,
    components: tokens.components?.length || 0,
    cssVariables: tokens.cssVariables?.length || 0,
  };
}
