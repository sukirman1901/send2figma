/**
 * Build a strict recreate prompt from bundle specs (Node + shared wording).
 */

export type AgentSpecs = {
  aliases?: Record<string, unknown>;
  layoutSpec?: unknown;
  typeSpec?: unknown;
  colorSpec?: unknown;
  rules?: string[];
};

export type AgentDesignSystem = {
  brand?: Record<string, unknown>;
  typography?: { primaryFont?: string; scale?: unknown[] };
  colors?: Record<string, unknown>;
  buttons?: Array<Record<string, unknown>>;
  interaction?: { hoverRules?: unknown[]; note?: string };
  rules?: string[];
};

export function buildStrictAgentPrompt({
  framework = "next",
  selector,
  sectionName,
  screenshotPath,
  specs,
  designSystem,
  fidelityNotes = [],
}: {
  framework?: string;
  selector: string;
  sectionName?: string;
  screenshotPath?: string;
  specs?: AgentSpecs;
  designSystem?: AgentDesignSystem | null;
  fidelityNotes?: string[];
}): string {
  const aliases = specs?.aliases || {};
  const rules = [
    ...(designSystem?.rules || []),
    ...(specs?.rules || [
      "MUST use layoutSpec / typeSpec / colorSpec / aliases.",
      "Do NOT invent spacing or brand colors.",
    ]),
  ];

  const aliasLines = Object.entries(aliases)
    .map(([k, v]) => `  - ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");

  const brand = designSystem?.brand || {};
  const colors = designSystem?.colors || {};
  const buttons = designSystem?.buttons || [];
  const hoverCount = designSystem?.interaction?.hoverRules?.length || 0;

  const dsLines = [
    `  - primaryFont: ${brand.primaryFont || "(missing)"}`,
    `  - textPrimary: ${colors.textPrimary || brand.textPrimary || "(missing)"}`,
    `  - surface: ${colors.surface || brand.surface || "(missing)"}`,
    `  - primaryAction: ${colors.primary || brand.primaryAction || "(missing)"}`,
    `  - buttons: ${buttons.length} variant(s)`,
    `  - hoverRules: ${hoverCount}`,
  ].join("\n");

  return [
    `Recreate UI section "${sectionName || selector}" as ${framework}.`,
    `Selector: ${selector}`,
    "",
    "SOURCE OF TRUTH (in order):",
    "1) designSystem (page brand: typography, colors, buttons, hover)",
    "2) specs.aliases / layoutSpec / typeSpec / colorSpec (section measures — win on conflict)",
    "3) screenshot (pixel QA)",
    "4) section HTML structure (semantics only — ignore hashed CSS-module class names)",
    "",
    "HARD RULES:",
    ...[...new Set(rules)].map((r: string) => `- ${r}`),
    "",
    "DESIGN SYSTEM (page):",
    dsLines,
    "",
    "SECTION ALIASES (use verbatim when present):",
    aliasLines || "  (none — call out missing data; do not invent)",
    "",
    `Screenshot: ${screenshotPath || "(missing)"}`,
    `Fidelity notes: ${fidelityNotes.join("; ") || "none"}`,
    "",
    "Deliver: tokens/CSS variables from designSystem + component from section specs.",
  ].join("\n");
}
