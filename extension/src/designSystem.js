/**
 * Service-worker / Node-safe design system helpers (no DOM).
 */

import { formatDesignSystemMarkdown, formatCompactStyleReference } from "./designSystemMd.js";

/**
 * Detect page type from URL patterns and DOM heuristics.
 * @param {{ url: string, title: string, host: string, description: string, articleCount: number, formCount: number, navCount: number, headingCount: number }} meta
 * @returns {{ type: string, confidence: number, label: string }}
 */
export function pageProfile(meta) {
  if (!meta) return { type: "content", confidence: 0.3, label: "Unknown page" };
  const url = (meta.url || "").toLowerCase();
  const title = (meta.title || "").toLowerCase();
  const desc = (meta.description || "").toLowerCase();
  const combined = `${url} ${title} ${desc}`;

  const scores = { docs: 0, app: 0, marketing: 0, ecommerce: 0, blog: 0, content: 0 };

  // URL pattern matching
  if (/\/docs?\//.test(url) || /\/api\//.test(url) || /\/reference\//.test(url) || /\/guide\//.test(url)) scores.docs += 3;
  if (/\/blog\//.test(url) || /\/post\//.test(url) || /\/article\//.test(url)) scores.blog += 3;
  if (/\/app\//.test(url) || /\/dashboard\//.test(url) || /\/settings\//.test(url) || /\/admin\//.test(url)) scores.app += 3;
  if (/\/shop\//.test(url) || /\/product\//.test(url) || /\/cart\//.test(url) || /\/checkout\//.test(url)) scores.ecommerce += 3;
  if (/\/pricing/.test(url) || /\/features/.test(url) || /\/about/.test(url) || /\/contact/.test(url) || /\/careers/.test(url)) scores.marketing += 3;

  // Title/description matching
  if (/\b(documentation|docs|api|reference|guide|tutorial|manual)\b/.test(combined)) scores.docs += 2;
  if (/\b(buy|price|shop|product|deal|discount|offer)\b/.test(combined)) scores.ecommerce += 2;
  if (/\b(sign up|start|try|free|trial|demo|plan)\b/.test(combined)) scores.marketing += 2;
  if (/\b(dashboard|settings|account|profile|login|admin)\b/.test(combined)) scores.app += 2;

  // DOM heuristics
  if (meta.articleCount >= 3) scores.blog += 2;
  if (meta.formCount >= 2) scores.app += 1;
  if (meta.navCount >= 2) scores.docs += 1;
  if (meta.headingCount >= 5) scores.docs += 1;
  if (meta.headingCount >= 8) scores.blog += 1;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = sorted[0];
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  const confidence = Math.min(0.95, bestScore / total);

  const labels = {
    docs: "Documentation / API reference",
    app: "Web application / Dashboard",
    marketing: "Marketing / Landing page",
    ecommerce: "E-commerce / Product catalog",
    blog: "Blog / Content publishing",
    content: "Content page",
  };

  return { type: bestType, confidence, label: labels[bestType] || "Content page" };
}

/**
 * Summarize WCAG contrast compliance from captured pairs.
 * @param {{ fg: string, bg: string, ratio: number, pass: boolean, text: string }[]} pairs
 * @returns {{ pass: number, fail: number, total: number, pairs: object[], recommendations: string[] }}
 */
export function wcagSummary(pairs) {
  if (!pairs || !pairs.length) return { pass: 0, fail: 0, total: 0, pairs: [], recommendations: [] };
  const pass = pairs.filter((p) => p.pass).length;
  const fail = pairs.length - pass;
  const failingPairs = pairs.filter((p) => !p.pass).slice(0, 10);
  const recommendations = [];
  for (const p of failingPairs) {
    if (p.ratio < 3) {
      recommendations.push(`Critical: "${p.text}" (${p.fg} on ${p.bg}) has ratio ${p.ratio}:1 — needs 4.5:1 minimum`);
    } else {
      recommendations.push(`Low: "${p.text}" (${p.fg} on ${p.bg}) has ratio ${p.ratio}:1 — increase contrast to 4.5:1`);
    }
  }
  return { pass, fail, total: pairs.length, pairs: failingPairs, recommendations };
}

/**
 * Infer brand context from page metadata.
 * @param {{ title: string, url: string, host: string, description: string }} meta
 * @returns {{ name: string, mission: string, audience: string, url: string }}
 */
export function inferBrand(meta) {
  if (!meta) return { name: "", mission: "", audience: "", url: "" };
  const host = meta.host || "";
  const name = meta.title?.split(/[—|–-]/)[0]?.trim() || host.split(".")[0] || "";
  const mission = meta.description || `Products and services from ${name}`;
  let audience = "general users";
  if (/\b(developer|api|code|engineer)\b/i.test(`${meta.title} ${meta.description}`)) audience = "developers";
  else if (/\b(business|enterprise|team|company)\b/i.test(`${meta.title} ${meta.description}`)) audience = "businesses";
  else if (/\b(shop|buy|product|deal)\b/i.test(`${meta.title} ${meta.description}`)) audience = "consumers";
  return { name, mission, audience, url: meta.url || "" };
}

/**
 * Infer writing tone from text samples.
 * @param {{ tag: string, text: string, fontWeight: string, fontSize: string }[]} samples
 * @returns {{ tone: string, confidence: number, description: string }}
 */
export function inferTone(samples) {
  if (!samples || !samples.length) return { tone: "neutral", confidence: 0.3, description: "Unable to determine tone" };
  const allText = samples.map((s) => s.text).join(" ").toLowerCase();
  const wordCount = allText.split(/\s+/).length;
  const avgWordLen = allText.replace(/[^a-z]/g, "").length / Math.max(wordCount, 1);
  const hasExcl = /!/.test(allText);
  const hasQuestion = /\?/.test(allText);
  const formalMarkers = /\b(please|thank you|welcome|information|available|request|submit)\b/i;
  const casualMarkers = /\b(hey|wow|cool|awesome|super|gonna|wanna|check out)\b/i;
  const technicalMarkers = /\b(api|endpoint|function|variable|config|deploy|server|database|query)\b/i;
  const marketingMarkers = /\b(best|free|top|amazing|transform|boost|grow|launch|new|exclusive)\b/i;

  const scores = { formal: 0, casual: 0, technical: 0, marketing: 0, neutral: 0 };
  if (formalMarkers.test(allText)) scores.formal += 2;
  if (casualMarkers.test(allText)) scores.casual += 2;
  if (technicalMarkers.test(allText)) scores.technical += 2;
  if (marketingMarkers.test(allText)) scores.marketing += 2;
  if (hasExcl) scores.casual += 1;
  if (hasQuestion) scores.formal += 0.5;
  if (avgWordLen > 6) scores.formal += 1;
  if (avgWordLen < 4) scores.casual += 1;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = sorted[0];
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  const descriptions = {
    formal: "Professional, structured communication",
    casual: "Friendly, approachable language",
    technical: "Developer-focused, precise terminology",
    marketing: "Promotional, action-oriented copy",
    neutral: "Balanced, general-purpose tone",
  };
  return { tone: best, confidence: Math.min(0.9, bestScore / total), description: descriptions[best] };
}

/**
 * Check token coverage completeness.
 * @param {object} exp — full export object
 * @returns {{ gates: { name: string, pass: boolean, message: string }[], score: number }}
 */
export function qualityGates(exp) {
  const tokens = exp?.tokens || {};
  const gates = [
    { name: "Colors", pass: (tokens.colors || []).length > 0, message: `${(tokens.colors || []).length} color tokens detected` },
    { name: "Font families", pass: (tokens.fontFamilies || []).length > 0, message: `${(tokens.fontFamilies || []).length} font families` },
    { name: "Type scale", pass: (tokens.fontSizes || []).length >= 3, message: `${(tokens.fontSizes || []).length} type sizes (need 3+)` },
    { name: "Spacing", pass: (tokens.spaces || []).length > 0, message: `${(tokens.spaces || []).length} spacing tokens` },
    { name: "Components", pass: (exp?.components || []).length > 0, message: `${(exp?.components || []).length} components detected` },
    { name: "Buttons", pass: (exp?.buttons || []).length > 0, message: `${(exp?.buttons || []).length} button variants` },
  ];
  const score = Math.round((gates.filter((g) => g.pass).length / gates.length) * 100);
  return { gates, score };
}

/**
 * Generate SKILL.md with YAML frontmatter for AI agents.
 * @param {object} exp — full export object
 * @returns {string}
 */
export function buildSkillMd(exp) {
  const profile = pageProfile(exp?.pageMeta);
  const brand = inferBrand(exp?.pageMeta);
  const tone = inferTone(exp?.pageMeta?.textSamples);
  const tokens = exp?.tokens || {};
  const colors = tokens.colors || [];
  const fontFamilies = tokens.fontFamilies || [];
  const buttons = exp?.buttons || [];

  const lines = [];
  const push = (...xs) => lines.push(...xs);

  push("---");
  push(`name: ${brand.name || exp?.source || "site"}-design-skill`);
  push(`description: Design system rules for ${brand.name || "the target site"}`);
  push(`version: 1`);
  push(`source: ${exp?.source || "Send2Figma"}`);
  push(`url: ${exp?.pageMeta?.url || ""}`);
  push(`surface: ${profile.type}`);
  push(`theme: ${tokens.theme || "light"}`);
  push("---");
  push("");

  push(`# ${brand.name || "Site"} Design Skill`);
  push("");
  push(`## Brand`);
  push(`- **Name:** ${brand.name}`);
  push(`- **Mission:** ${brand.mission}`);
  push(`- **Audience:** ${brand.audience}`);
  push("");

  push(`## Design Tokens`);
  push(`- Colors: ${colors.length}`);
  push(`- Font families: ${fontFamilies.length}`);
  push(`- Buttons: ${buttons.length}`);
  push("");

  push(`## Rules`);
  push(`1. Use only tokens defined in the DESIGN.md`);
  push(`2. Follow the Do/Don't rules from DESIGN.md`);
  push(`3. Maintain ${tone.tone} tone: ${tone.description}`);
  push("");

  return lines.join("\n");
}

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
    version: 4,
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
      theme: tokens.theme || null,
    },
    components: tokens.components || [],
    buttons: tokens.buttons || [],
    links: tokens.links || [],
    treeSummary: data?.fidelity?.treeSummary || null,
    contrastPairs: tokens.contrastPairs || [],
    breakpoints: tokens.breakpoints || [],
    pageMeta: tokens.pageMeta || null,
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
export { pageProfile, wcagSummary, inferBrand, inferTone, qualityGates, buildSkillMd };

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
