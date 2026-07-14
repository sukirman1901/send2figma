/**
 * Build a strict recreate prompt from bundle specs (Node + shared wording).
 */

export type AgentSpecs = {
  aliases?: Record<string, unknown>;
  layoutSpec?: unknown;
  typeSpec?: unknown;
  colorSpec?: unknown;
  rules?: string[];
  roles?: Array<{
    role: string;
    tag: string;
    selector: string;
    text?: string;
    accessibility?: {
      role?: string;
      ariaLabel?: string;
      ariaLabelledby?: string;
      ariaDescribedby?: string;
      ariaHidden?: string;
      ariaExpanded?: string;
      ariaSelected?: string;
      ariaChecked?: string;
      ariaDisabled?: string;
      ariaRequired?: string;
      ariaInvalid?: string;
      ariaLive?: string;
      tabIndex?: number;
      isInteractive?: boolean;
      isFocusable?: boolean;
      allAriaAttrs?: Record<string, string>;
    };
    transitions?: {
      transition?: string;
      transitionDuration?: string;
      transitionTimingFunction?: string;
      animation?: string;
      animationDuration?: string;
      animationTimingFunction?: string;
      animationIterationCount?: string;
    };
    reactComponents?: string[];
  }>;
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

  // Build interactive states section
  const interactiveElements = (specs?.roles || []).filter(r => 
    r.accessibility?.isInteractive || 
    r.accessibility?.isFocusable ||
    r.transitions?.transition ||
    r.transitions?.animation
  );

  const interactiveLines = [];
  if (interactiveElements.length > 0) {
    interactiveLines.push("INTERACTIVE ELEMENTS (with states):");
    for (const el of interactiveElements.slice(0, 10)) {
      const states = [];
      if (el.transitions?.transition) states.push(`transition: ${el.transitions.transition}`);
      if (el.transitions?.animation) states.push(`animation: ${el.transitions.animation}`);
      if (el.accessibility?.ariaExpanded) states.push(`aria-expanded: ${el.accessibility.ariaExpanded}`);
      if (el.accessibility?.ariaSelected) states.push(`aria-selected: ${el.accessibility.ariaSelected}`);
      if (el.accessibility?.ariaChecked) states.push(`aria-checked: ${el.accessibility.ariaChecked}`);
      if (states.length > 0) {
        interactiveLines.push(`  - ${el.tag}[role="${el.role}"] (${el.selector}): ${states.join(", ")}`);
      }
    }
  }

  // Build accessibility section
  const accessibleElements = (specs?.roles || []).filter(r => 
    r.accessibility?.role ||
    r.accessibility?.ariaLabel ||
    r.accessibility?.ariaLabelledby ||
    r.accessibility?.ariaDescribedby
  );

  const accessibilityLines = [];
  if (accessibleElements.length > 0) {
    accessibilityLines.push("ACCESSIBILITY PATTERNS:");
    for (const el of accessibleElements.slice(0, 10)) {
      const attrs = [];
      if (el.accessibility?.role) attrs.push(`role="${el.accessibility.role}"`);
      if (el.accessibility?.ariaLabel) attrs.push(`aria-label="${el.accessibility.ariaLabel}"`);
      if (el.accessibility?.ariaLabelledby) attrs.push(`aria-labelledby="${el.accessibility.ariaLabelledby}"`);
      if (el.accessibility?.ariaDescribedby) attrs.push(`aria-describedby="${el.accessibility.ariaDescribedby}"`);
      if (attrs.length > 0) {
        accessibilityLines.push(`  - ${el.tag} (${el.selector}): ${attrs.join(", ")}`);
      }
    }
  }

  // Build transitions section
  const animatedElements = (specs?.roles || []).filter(r => 
    r.transitions?.transition ||
    r.transitions?.animation
  );

  const transitionsLines = [];
  if (animatedElements.length > 0) {
    transitionsLines.push("TRANSITIONS & ANIMATIONS:");
    for (const el of animatedElements.slice(0, 8)) {
      const anims = [];
      if (el.transitions?.transition) anims.push(`transition: ${el.transitions.transition}`);
      if (el.transitions?.transitionDuration) anims.push(`duration: ${el.transitions.transitionDuration}`);
      if (el.transitions?.animation) anims.push(`animation: ${el.transitions.animation}`);
      if (el.transitions?.animationDuration) anims.push(`anim-duration: ${el.transitions.animationDuration}`);
      if (anims.length > 0) {
        transitionsLines.push(`  - ${el.tag}[role="${el.role}"]: ${anims.join(", ")}`);
      }
    }
  }

  // Build React components section
  const reactElements = (specs?.roles || []).filter(r => 
    r.reactComponents && r.reactComponents.length > 0
  );

  const reactLines = [];
  if (reactElements.length > 0) {
    reactLines.push("REACT COMPONENT HIERARCHY:");
    for (const el of reactElements.slice(0, 8)) {
      if (el.reactComponents && el.reactComponents.length > 0) {
        reactLines.push(`  - ${el.tag}[role="${el.role}"]: ${el.reactComponents.join(" > ")}`);
      }
    }
  }

  // Build box model section
  const elementsWithBoxModel = (specs?.roles || []).filter(r => 
    r.role === "root" || 
    r.role === "nav" || 
    r.role?.startsWith("cta") ||
    r.role === "card"
  );

  const boxModelLines = [];
  if (elementsWithBoxModel.length > 0) {
    boxModelLines.push("BOX MODEL (key elements):");
    for (const el of elementsWithBoxModel.slice(0, 5)) {
      // Box model data is in the inspect output, not in roles
      // We'll reference it in the prompt
      boxModelLines.push(`  - ${el.tag}[role="${el.role}"]: use boxModel data for precise spacing`);
    }
  }

  return [
    `Recreate UI section "${sectionName || selector}" as ${framework}.`,
    `Selector: ${selector}`,
    "",
    "SOURCE OF TRUTH (in order):",
    "1) designSystem (page brand: typography, colors, buttons, hover, spacing, type scale)",
    "2) specs.aliases / layoutSpec / typeSpec / colorSpec (section measures — win on conflict)",
    "3) screenshot (pixel QA)",
    "4) section HTML structure (semantics only — ignore hashed CSS-module class names)",
    "5) accessibility data (ARIA attributes, roles, interactive elements)",
    "6) transitions/animations (motion design specs)",
    "7) reactComponents (component hierarchy for React/Next.js)",
    "8) boxModel (precise spacing and sizing)",
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
    ...(interactiveLines.length > 0 ? [...interactiveLines, ""] : []),
    ...(accessibilityLines.length > 0 ? [...accessibilityLines, ""] : []),
    ...(transitionsLines.length > 0 ? [...transitionsLines, ""] : []),
    ...(reactLines.length > 0 ? [...reactLines, ""] : []),
    ...(boxModelLines.length > 0 ? [...boxModelLines, ""] : []),
    "",
    `Screenshot: ${screenshotPath || "(missing)"}`,
    `Fidelity notes: ${fidelityNotes.join("; ") || "none"}`,
    "",
    "Deliver: tokens/CSS variables from designSystem + component from section specs.",
    "Include: hover/focus/active states, transitions, ARIA attributes, and responsive behavior.",
  ].join("\n");
}
