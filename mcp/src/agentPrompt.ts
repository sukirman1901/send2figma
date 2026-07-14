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
  spacingScale?: {
    values?: Array<{ value: string; count: number }>;
    scale?: Array<{ unit: string; frequency: number }>;
    pattern?: string;
  };
  typeScale?: {
    sizes?: Array<{ size: string; weight: string; tag: string; count: number; text: string }>;
    scaleType?: string;
    uniqueSizes?: number[];
  };
  colorPalette?: {
    colors?: Array<{ hex: string; rgb: { r: number; g: number; b: number }; type: string; count: number; luminance: number }>;
    palette?: {
      primary?: { hex: string };
      secondary?: { hex: string };
      accent?: { hex: string };
      neutral?: Array<{ hex: string }>;
      text?: Array<{ hex: string }>;
      background?: Array<{ hex: string }>;
    };
  };
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

  // Add design system patterns if available
  const spacingLines = [];
  if (designSystem?.spacingScale) {
    const { pattern, scale } = designSystem.spacingScale;
    spacingLines.push(`  - spacingPattern: ${pattern || "custom"}`);
    if (scale && scale.length > 0) {
      spacingLines.push(`  - spacingScale: ${scale.map(s => s.unit).join(", ")}`);
    }
  }

  const typeLines = [];
  if (designSystem?.typeScale) {
    const { scaleType, uniqueSizes } = designSystem.typeScale;
    typeLines.push(`  - typeScale: ${scaleType || "custom"}`);
    if (uniqueSizes && uniqueSizes.length > 0) {
      typeLines.push(`  - fontSizes: ${uniqueSizes.map(s => `${s}px`).join(", ")}`);
    }
  }

  const colorLines = [];
  if (designSystem?.colorPalette?.palette) {
    const { primary, secondary, accent } = designSystem.colorPalette.palette;
    if (primary) colorLines.push(`  - primaryColor: ${primary.hex}`);
    if (secondary) colorLines.push(`  - secondaryColor: ${secondary.hex}`);
    if (accent) colorLines.push(`  - accentColor: ${accent.hex}`);
  }

  const allDesignLines = [...dsLines, ...spacingLines, ...typeLines, ...colorLines].join("\n");

  return [
    `Recreate UI section "${sectionName || selector}" as ${framework}.`,
    `Selector: ${selector}`,
    "",
    "SOURCE OF TRUTH (in order):",
    "1) designSystem (page brand: typography, colors, buttons, hover, spacing, type scale)",
    "2) specs.aliases / layoutSpec / typeSpec / colorSpec (section measures — win on conflict)",
    "3) screenshot (pixel QA)",
    "4) section HTML structure (semantics only — ignore hashed CSS-module class names)",
    "",
    "HARD RULES:",
    ...[...new Set(rules)].map((r: string) => `- ${r}`),
    "",
    "DESIGN SYSTEM (page):",
    allDesignLines,
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
