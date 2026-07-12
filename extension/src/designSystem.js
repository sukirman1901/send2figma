/**
 * Service-worker / Node-safe design system helpers (no DOM).
 */

import { formatDesignSystemMarkdown, formatCompactStyleReference } from "./designSystemMd.js";

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

function parsePx(v) {
  const n = parseFloat(String(v ?? "").replace(/px$/i, ""));
  return Number.isFinite(n) ? n : null;
}

function typeRole(px) {
  if (px == null) return "body";
  if (px >= 48) return "display";
  if (px >= 32) return "heading";
  if (px >= 22) return "subheading";
  if (px >= 16) return "body";
  if (px >= 14) return "body-sm";
  return "caption";
}

function lumHex(hex) {
  if (!hex || hex[0] !== "#") return 0.5;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isGrayishHex(hex) {
  if (!hex || hex[0] !== "#") return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < 28;
}

/**
 * Agent-ready design system: clear roles (not a noisy token dump).
 * Prefer this over raw `tokens` when recreating UI.
 */
export function buildAgentDesignSystem({
  tokens = {},
  buttons = [],
  links = [],
  interactionRules = [],
  sectionAliases = null,
  source = "Send2Figma",
} = {}) {
  const colors = tokens.colors || [];
  const fontFamilies = tokens.fontFamilies || [];
  const fontSizes = [...(tokens.fontSizes || [])].sort(
    (a, b) => (parsePx(a.value) || 0) - (parsePx(b.value) || 0)
  );
  const fontWeights = tokens.fontWeights || [];
  const spaces = [...(tokens.spaces || [])].sort(
    (a, b) => (parsePx(a.value) || 0) - (parsePx(b.value) || 0)
  );
  const radii = [...(tokens.radii || [])].sort(
    (a, b) => (parsePx(a.value) || 0) - (parsePx(b.value) || 0)
  );

  const withLum = colors
    .map((c) => ({ ...c, L: lumHex(c.hex) }))
    .filter((c) => c.hex);

  const textPrimary =
    sectionAliases?.textPrimary ||
    sectionAliases?.textNav ||
    withLum.find((c) => c.L < 0.35)?.hex ||
    withLum[0]?.hex ||
    null;
  const surface =
    sectionAliases?.surfaceBackground ||
    withLum.find((c) => c.L > 0.9)?.hex ||
    withLum.find((c) => c.L > 0.8)?.hex ||
    null;
  const primaryFromBtn = buttons.find((b) => b.role === "primary")?.backgroundColorHex;
  const accent =
    sectionAliases?.ctaPrimaryBg ||
    primaryFromBtn ||
    withLum.find((c) => c.L > 0.15 && c.L < 0.85 && !isGrayishHex(c.hex))?.hex ||
    null;
  const secondaryBtn = buttons.find((b) => b.role === "secondary");

  const typography = {
    primaryFont: fontFamilies[0]?.family || tokens.fonts?.[0]?.value || null,
    fallbackStack: fontFamilies[0]
      ? `${fontFamilies[0].family}, -apple-system, system-ui, sans-serif`
      : "system-ui, sans-serif",
    weights: fontWeights.map((w) => w.value).slice(0, 6),
    scale: fontSizes.slice(0, 10).map((s, i) => {
      const px = parsePx(s.value);
      return {
        role: typeRole(px),
        size: s.value,
        token: s.token || `fontSize/${s.value}`,
        count: s.count,
        index: i,
      };
    }),
  };

  const colorRoles = {
    textPrimary,
    surface,
    primary: accent,
    primaryForeground: sectionAliases?.ctaPrimaryFg || "#ffffff",
    secondary: secondaryBtn?.backgroundColorHex || null,
    secondaryForeground: secondaryBtn?.colorHex || null,
    border: textPrimary ? `${textPrimary}20` : null,
  };

  const buttonContracts = (buttons.length ? buttons : [])
    .slice(0, 6)
    .map((b) => ({
      role: b.role,
      labelSample: b.text,
      background: b.backgroundColorHex || b.backgroundColor,
      foreground: b.colorHex || b.color,
      height: b.height,
      radius: b.borderRadius,
      fontSize: b.fontSize,
      fontWeight: b.fontWeight,
      padding: b.padding,
      gap: b.gap,
    }));

  const linkContracts = (links || []).slice(0, 4).map((l) => ({
    role: l.role || "navLink",
    color: l.colorHex || l.color,
    fontSize: l.fontSize,
    fontWeight: l.fontWeight,
    lineHeight: l.lineHeight,
  }));

  const hover = (interactionRules || [])
    .filter((r) => /:hover/i.test(r.selector || r.cssText || ""))
    .slice(0, 24)
    .map((r) => ({
      selector: r.selector,
      cssText: String(r.cssText || "").slice(0, 400),
      source: r.source || null,
    }));

  const spacingScale = spaces.slice(0, 12).map((s) => ({
    value: s.value,
    token: s.token,
    count: s.count,
  }));

  const radiusScale = radii.slice(0, 8).map((r) => ({
    value: r.value,
    token: r.token,
    count: r.count,
  }));

  const cssVarsBrand = (tokens.cssVariables || [])
    .filter((v) => /color|font|space|radius|primary|brand|bg|text/i.test(v.name || ""))
    .slice(0, 40);

  return {
    version: 1,
    format: "agent-design-system",
    source,
    exportedAt: new Date().toISOString(),
    brand: {
      primaryFont: typography.primaryFont,
      textPrimary: colorRoles.textPrimary,
      surface: colorRoles.surface,
      primaryAction: colorRoles.primary,
      primaryActionFg: colorRoles.primaryForeground,
    },
    typography,
    colors: colorRoles,
    buttons: buttonContracts,
    links: linkContracts,
    spacing: spacingScale,
    radii: radiusScale,
    interaction: {
      hoverRules: hover,
      note:
        hover.length === 0
          ? "No :hover rules captured — call get_interaction_css or bundle with includeHoverShot."
          : "Apply matching :hover rules; do not invent hover colors.",
    },
    cssVariables: cssVarsBrand,
    sectionAliases: sectionAliases || null,
    rules: [
      "Use brand / colors / typography / buttons as the page design system.",
      "Section specs.aliases override page tokens when both exist for the same role.",
      "Do not invent primary colors, type sizes, or button radii.",
      "Implement hover from interaction.hoverRules when present.",
    ],
  };
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
    buttons: tokens.buttons || [],
    links: tokens.links || [],
    treeSummary: data?.fidelity?.treeSummary || null,
  };
  exp.designSystem = buildAgentDesignSystem({
    tokens: exp.tokens,
    buttons: exp.buttons,
    links: exp.links,
    source: exp.source,
  });
  exp.markdown = formatDesignSystemMarkdown(exp);
  exp.styleReference = exp.markdown;
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

export { formatDesignSystemMarkdown, formatCompactStyleReference };

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
