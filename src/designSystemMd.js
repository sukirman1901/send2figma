/**
 * Format design-system export as an AI rulebook markdown.
 *
 * Token hierarchy (matches design-token best practice):
 *   Default value → Foundation → Semantic → Component
 *
 * Goal: agents reading this file know WHAT to use WHERE — not just a dump of hex codes.
 */

function rgbToHex(css) {
  if (!css || typeof css !== "string") return null;
  const hex = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return `#${h.slice(0, 6).toLowerCase()}`;
  }
  const m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  const to = (n) =>
    Math.max(0, Math.min(255, Math.round(Number(n))))
      .toString(16)
      .padStart(2, "0");
  return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
}

function lum(hex) {
  if (!hex || hex[0] !== "#") return 0.5;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parsePx(v) {
  const n = parseFloat(String(v).replace(/px$/i, ""));
  return Number.isFinite(n) ? n : null;
}

function sortByPxAsc(items) {
  return [...(items || [])].sort((a, b) => (parsePx(a.value) || 0) - (parsePx(b.value) || 0));
}

function slug(v) {
  return String(v || "")
    .replace(/[^a-z0-9.]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .toLowerCase() || "token";
}

function titleCase(s) {
  return String(s || "")
    .replace(/[-_/]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function detectTheme(colors) {
  const hexes = (colors || []).map((c) => c.hex || rgbToHex(c.value)).filter(Boolean);
  if (!hexes.length) return "light";
  const top = hexes.slice(0, 5);
  const avg = top.reduce((s, h) => s + lum(h), 0) / top.length;
  return avg < 0.4 ? "dark" : "light";
}

function typeRole(px, i, total) {
  if (px == null) return `step-${i + 1}`;
  if (px >= 96) return "display";
  if (px >= 48) return "heading-lg";
  if (px >= 36) return "heading";
  if (px >= 28) return "heading-sm";
  if (px >= 22) return "subheading";
  if (px >= 18) return "body";
  if (px >= 15) return "body-sm";
  if (i === total - 1 || px <= 13) return "caption";
  return `size-${Math.round(px)}`;
}

function isGrayish(hex) {
  if (!hex || hex[0] !== "#") return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < 28;
}

/**
 * Map foundation colors → semantic roles by luminance + frequency.
 */
function buildColorSemantics(colors, theme) {
  const list = (colors || []).map((c, i) => ({
    ...c,
    hex: c.hex || rgbToHex(c.value) || c.value,
    L: lum(c.hex || rgbToHex(c.value) || "#888888"),
    i,
  }));

  const ink = list.find((c) => c.L < 0.12) || (theme === "dark" ? list[list.length - 1] : list[0]);
  const canvas =
    list.find((c) => c.L > 0.92) ||
    (theme === "light" ? list.find((c) => c.L > 0.8) : list[0]);
  const muted = list.find(
    (c) => c !== ink && c !== canvas && c.L > 0.35 && c.L < 0.85 && isGrayish(c.hex)
  );
  const surface2 = list.find(
    (c) => c !== ink && c !== canvas && c !== muted && c.L > 0.75 && c.L <= 0.92
  );
  const accent = list.find(
    (c) =>
      c !== ink &&
      c !== canvas &&
      c !== muted &&
      c !== surface2 &&
      c.L > 0.12 &&
      c.L < 0.85 &&
      !isGrayish(c.hex)
  );

  const semantic = [];
  const push = (name, foundation, role) => {
    if (!foundation) return;
    semantic.push({
      semantic: name,
      foundation: foundation.foundation || foundation.token || `--color-${slug(foundation.value)}`,
      hex: foundation.hex,
      role,
    });
  };

  push("--color-text-primary", ink, "Primary body and heading text");
  push("--color-fg-primary", ink, "Icons, strokes, structural foreground");
  push("--color-bg-primary", canvas, "Primary page / surface background");
  if (surface2) push("--color-bg-secondary", surface2, "Secondary bands, cards on tinted ground");
  if (muted) push("--color-text-muted", muted, "Helper text, captions, de-emphasized UI");
  push("--color-border-default", ink, "Default borders and dividers");
  if (accent) {
    push("--color-bg-accent", accent, "Brand / accent fills and highlights");
    push("--color-text-accent", accent, "Accent labels and emphasis text");
  }

  return semantic.filter((s) => s.hex);
}

function buildSizeSemantics(spaces, radii) {
  const spaceSorted = sortByPxAsc(spaces);
  const radiusSorted = sortByPxAsc(radii);
  const semantic = [];

  const pick = (arr, pred) => arr.find((x) => pred(parsePx(x.value)));

  const s1 = pick(spaceSorted, (n) => n === 4) || spaceSorted[0];
  const s2 = pick(spaceSorted, (n) => n >= 8 && n <= 12) || spaceSorted[1];
  const s3 = pick(spaceSorted, (n) => n >= 14 && n <= 20) || spaceSorted[2];
  const s4 = pick(spaceSorted, (n) => n >= 24 && n <= 40) || spaceSorted[Math.floor(spaceSorted.length / 2)];

  if (s1) {
    semantic.push({
      semantic: "--spacing-1",
      foundation: `--spacing-${slug(parsePx(s1.value) ?? s1.value)}`,
      value: s1.value,
      role: "Tight gaps / compact padding",
    });
  }
  if (s2) {
    semantic.push({
      semantic: "--spacing-2",
      foundation: `--spacing-${slug(parsePx(s2.value) ?? s2.value)}`,
      value: s2.value,
      role: "Default element gap",
    });
  }
  if (s3) {
    semantic.push({
      semantic: "--padding-md",
      foundation: `--spacing-${slug(parsePx(s3.value) ?? s3.value)}`,
      value: s3.value,
      role: "Control / card padding",
    });
  }
  if (s4) {
    semantic.push({
      semantic: "--section-gap",
      foundation: `--spacing-${slug(parsePx(s4.value) ?? s4.value)}`,
      value: s4.value,
      role: "Section vertical rhythm",
    });
  }

  const rSm = radiusSorted[0];
  const rFull = radiusSorted.find((r) => (parsePx(r.value) || 0) >= 999) || radiusSorted[radiusSorted.length - 1];
  if (rSm) {
    semantic.push({
      semantic: "--radius-sm",
      foundation: `--radius-${slug(rSm.value)}`,
      value: rSm.value,
      role: "Inputs, small chips",
    });
  }
  if (rFull && rFull !== rSm) {
    semantic.push({
      semantic: "--radius-pill",
      foundation: `--radius-${slug(rFull.value)}`,
      value: rFull.value,
      role: "Buttons / tags (pill)",
    });
  } else if (radiusSorted[1]) {
    semantic.push({
      semantic: "--radius-md",
      foundation: `--radius-${slug(radiusSorted[1].value)}`,
      value: radiusSorted[1].value,
      role: "Cards / buttons",
    });
  }

  return semantic;
}

function componentTokenName(comp, part) {
  const base = String(comp.name || "component")
    .replace(/^Component\//, "")
    .replace(/-\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return `--${base}-${part}`;
}

/**
 * @param {object} exp
 * @returns {string}
 */
export function formatDesignSystemMarkdown(exp) {
  const source = exp?.source || "Untitled";
  const title = String(source).replace(/\s*[—|-]\s*.*$/, "").trim() || "Untitled";
  const tokens = exp?.tokens || {};
  const colors = tokens.colors || [];
  const fontFamilies = tokens.fontFamilies || [];
  const fonts = tokens.fonts || [];
  const fontSizes = sortByPxAsc(tokens.fontSizes || []);
  const fontWeights = [...(tokens.fontWeights || [])].sort(
    (a, b) => (parseInt(a.value, 10) || 0) - (parseInt(b.value, 10) || 0)
  );
  const lineHeights = tokens.lineHeights || [];
  const letterSpacings = tokens.letterSpacings || [];
  const radii = sortByPxAsc(tokens.radii || []);
  const spaces = sortByPxAsc(tokens.spaces || []);
  const shadows = tokens.shadows || [];
  const cssVariables = tokens.cssVariables || [];
  const components = exp?.components || [];
  const theme = detectTheme(colors);
  const colorSemantics = buildColorSemantics(colors, theme);
  const sizeSemantics = buildSizeSemantics(spaces, radii);
  const primaryFont = fontFamilies[0]?.family || fonts[0]?.value || "system-ui";

  const lines = [];
  const push = (...xs) => lines.push(...xs);

  push(`# ${title} — Design System`);
  push("");
  push(`> AI rulebook for rebuilding this UI. Prefer **semantic** tokens in components; never hard-code raw values when a token exists.`);
  push("");
  push(`**Theme:** ${theme}  `);
  push(`**Primary typeface:** ${primaryFont}  `);
  push(`**Source:** ${source}  `);
  push(`**Generated:** ${exp?.exportedAt || "n/a"}`);
  push("");

  push(`## How to use this file (for AI)`);
  push("");
  push(`1. Read **Token hierarchy** — always map Default → Foundation → Semantic → Component.`);
  push(`2. When building UI, reference **semantic** names (\`--color-text-primary\`), not raw hex.`);
  push(`3. Only introduce a new foundation token if no existing value is within ~4% luminance / 2px size.`);
  push(`4. Component tokens alias semantics — do not invent a third hex for the same role.`);
  push(`5. Follow **Do / Don't** before writing CSS or generating layouts.`);
  push("");

  push(`## Token hierarchy`);
  push("");
  push(`\`\`\``);
  push(`Default value  →  Foundation token  →  Semantic token  →  Component token`);
  push(`#182230        →  --color-gray-900 →  --color-text-primary →  --button-primary-text`);
  push(`4px            →  --spacing-4      →  --radius-sm / --padding-1 →  --button-radius-sm`);
  push(`\`\`\``);
  push("");

  // ——— Foundation: Colors ———
  push(`## Foundation — Colors`);
  push("");
  push(`Raw palette from the page (opaque colors, HSL-sorted). These are the **only** allowed hex sources.`);
  push("");
  push(`| Foundation | Value | Count |`);
  push(`|------------|-------|-------|`);
  for (const c of colors) {
    const hex = c.hex || rgbToHex(c.value) || c.value;
    const found = c.foundation || `--color-${slug(c.token)}`;
    push(`| \`${found}\` | \`${hex}\` | ${c.count || "—"} |`);
  }
  if (!colors.length) push(`| — | — | — |`);
  push("");

  // Author CSS variables
  if (cssVariables.length) {
    push(`### Author CSS variables (from :root / stylesheets)`);
    push("");
    push(`Prefer these names when they already encode intent.`);
    push("");
    push(`| Variable | Value | Resolved |`);
    push(`|----------|-------|----------|`);
    for (const v of cssVariables.slice(0, 40)) {
      push(`| \`${v.name}\` | \`${v.value}\` | ${v.hex ? `\`${v.hex}\`` : "—"} |`);
    }
    push("");
  }

  // ——— Semantic: Colors ———
  push(`## Semantic — Colors`);
  push("");
  push(`Intent-based aliases. **Use these in UI code.**`);
  push("");
  push(`| Semantic | → Foundation | Value | Role |`);
  push(`|----------|--------------|-------|------|`);
  for (const s of colorSemantics) {
    push(`| \`${s.semantic}\` | \`${s.foundation}\` | \`${s.hex}\` | ${s.role} |`);
  }
  if (!colorSemantics.length) push(`| — | — | — | — |`);
  push("");

  // ——— Foundation: Typography ———
  push(`## Foundation — Typography`);
  push("");
  const families = fontFamilies.length
    ? fontFamilies
    : fonts.map((f) => ({
        family: f.value,
        token: `--font-${slug(f.value)}`,
        sizes: fontSizes.map((s) => s.value),
        weights: fontWeights.map((w) => w.value),
        tags: [],
        count: f.count,
      }));

  for (const f of families) {
    push(`### ${f.family}`);
    push(`- **Token:** \`${f.token || `--font-${slug(f.family)}`}\``);
    push(`- **Sizes:** ${(f.sizes || []).join(" · ") || "—"}`);
    push(`- **Weights:** ${(f.weights || []).join(" · ") || "—"}`);
    if (f.tags?.length) push(`- **Tags:** ${f.tags.join(" · ")}`);
    push(`- **Samples:** ${f.count || "n"} text nodes`);
    push("");
  }

  push(`### Type scale (foundation sizes → semantic roles)`);
  push("");
  push(`| Role (semantic) | Size | Token |`);
  push(`|-----------------|------|-------|`);
  fontSizes.forEach((s, i) => {
    const px = parsePx(s.value);
    const role = typeRole(px, i, fontSizes.length);
    push(`| \`--text-${role}\` | ${s.value} | maps to size foundation |`);
  });
  if (!fontSizes.length) push(`| \`--text-body\` | 16px | — |`);
  push("");

  if (lineHeights.length || letterSpacings.length) {
    push(`### Leading & tracking`);
    push("");
    if (lineHeights.length) {
      push(`- **Line heights:** ${lineHeights.map((x) => x.value).join(" · ")}`);
    }
    if (letterSpacings.length) {
      push(`- **Letter spacing:** ${letterSpacings.map((x) => x.value).join(" · ")}`);
    }
    push("");
  }

  // ——— Foundation: Spacing & radius ———
  push(`## Foundation — Spacing & radius`);
  push("");
  push(`| Foundation | Value |`);
  push(`|------------|-------|`);
  for (const s of spaces) {
    const px = parsePx(s.value);
    push(`| \`--spacing-${slug(px ?? s.value)}\` | ${s.value} |`);
  }
  for (const r of radii) {
    push(`| \`--radius-${slug(r.value)}\` | ${r.value} |`);
  }
  if (!spaces.length && !radii.length) push(`| — | — |`);
  push("");

  push(`## Semantic — Spacing & radius`);
  push("");
  push(`| Semantic | → Foundation | Value | Role |`);
  push(`|----------|--------------|-------|------|`);
  for (const s of sizeSemantics) {
    push(`| \`${s.semantic}\` | \`${s.foundation}\` | ${s.value} | ${s.role} |`);
  }
  if (!sizeSemantics.length) push(`| — | — | — | — |`);
  push("");

  // ——— Components ———
  push(`## Component tokens`);
  push("");
  push(`Each repeated pattern aliases **semantic** tokens. Rebuild components with these contracts.`);
  push("");

  if (components.length) {
    for (const c of components) {
      const label = titleCase(String(c.name || "Component").replace(/^Component\//, ""));
      push(`### ${label}`);
      push(`- **Tag:** \`<${c.tag || "div"}>\`${c.className ? ` · \`.${c.className}\`` : ""}`);
      push(`- **Footprint:** ~${c.width || "?"}×${c.height || "?"}px · seen ${c.count || "?"}×`);
      push("");
      push(`| Component token | Suggested alias |`);
      push(`|-----------------|-----------------|`);
      const textSem = colorSemantics.find((s) => s.semantic.includes("text-primary"));
      const bgSem = colorSemantics.find((s) => s.semantic.includes("bg-primary"));
      const radiusSem = sizeSemantics.find((s) => s.semantic.includes("radius"));
      const padSem = sizeSemantics.find((s) => s.semantic.includes("padding"));
      push(
        `| \`${componentTokenName(c, "text")}\` | \`${textSem?.semantic || "--color-text-primary"}\` |`
      );
      push(`| \`${componentTokenName(c, "bg")}\` | \`${bgSem?.semantic || "--color-bg-primary"}\` |`);
      if (radiusSem) {
        push(`| \`${componentTokenName(c, "radius")}\` | \`${radiusSem.semantic}\` |`);
      }
      if (padSem) {
        push(`| \`${componentTokenName(c, "padding-x")}\` | \`${padSem.semantic}\` |`);
      }
      if (c.styles) {
        push("");
        push(`**Captured sample styles:**`);
        push(`- color: \`${c.styles.color || "—"}\``);
        push(`- background: \`${c.styles.backgroundColor || "—"}\``);
        push(`- radius: \`${c.styles.borderRadius || "—"}\``);
        push(`- type: \`${c.styles.fontSize || "—"} / ${c.styles.fontWeight || "—"} / ${c.styles.fontFamily || "—"}\``);
        push(`- padding: \`${c.styles.padding || "—"}\``);
        push(`- border: \`${c.styles.border || "—"}\``);
      }
      push("");
    }
  } else {
    push(`_No repeated component signatures detected._`);
    push("");
  }

  // ——— Rules ———
  push(`## Rules — Do`);
  push("");
  push(`- Use semantic color tokens for text, surfaces, borders, and accents.`);
  push(`- Keep the type stack led by **${primaryFont}**; add a second family only if captured above.`);
  if (fontWeights.length) {
    push(`- Limit weights to: ${fontWeights.map((w) => w.value).join(", ")}.`);
  }
  push(`- Space with the spacing scale; prefer semantic spacing roles over magic numbers.`);
  if (!shadows.length) {
    push(`- Prefer flat surfaces; elevation via spacing/tone, not new shadow recipes.`);
  }
  push("");

  push(`## Rules — Don't`);
  push("");
  push(`- Don't hard-code hex/px in components when a semantic token exists.`);
  push(`- Don't create parallel foundations for the same visual value.`);
  push(`- Don't mix extra font families for body UI.`);
  if (!shadows.length) push(`- Don't add drop shadows or glass that weren't in the source.`);
  push(`- Don't skip the hierarchy (component → semantic → foundation → value).`);
  push("");

  // ——— Agent prompts ———
  push(`## Agent prompt snippets`);
  push("");
  push(`### Quick color reference`);
  for (const s of colorSemantics.slice(0, 8)) {
    push(`- ${s.semantic.replace(/^--color-/, "")}: ${s.hex}`);
  }
  push(`- font: ${primaryFont}`);
  push("");

  if (components.length) {
    push(`### Example rebuild prompts`);
    components.slice(0, 4).forEach((c, i) => {
      const label = titleCase(String(c.name || `Component ${i + 1}`).replace(/^Component\//, ""));
      push(
        `${i + 1}. **${label}**: Build \`<${c.tag || "div"}>\` using \`${componentTokenName(c, "text")}\` → text-primary, \`${componentTokenName(c, "bg")}\` → bg-primary, type ${primaryFont}. Match ~${c.width || "?"}×${c.height || "?"}px.`
      );
    });
    push("");
  }

  // ——— CSS output ———
  push(`## Quick Start — CSS`);
  push("");
  push("```css");
  push(":root {");
  push("  /* Foundation — color */");
  for (const c of colors) {
    const hex = c.hex || rgbToHex(c.value) || c.value;
    push(`  ${c.foundation || `--color-${slug(c.token)}`}: ${hex};`);
  }
  push("");
  push("  /* Semantic — color */");
  for (const s of colorSemantics) {
    push(`  ${s.semantic}: var(${s.foundation});`);
  }
  push("");
  push("  /* Foundation — type */");
  push(
    `  --font-sans: '${primaryFont}', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`
  );
  fontSizes.forEach((s, i) => {
    const role = typeRole(parsePx(s.value), i, fontSizes.length);
    push(`  --text-${role}: ${s.value};`);
  });
  for (const w of fontWeights) {
    const label =
      String(w.value) === "700" || String(w.value) === "bold"
        ? "bold"
        : String(w.value) === "600"
          ? "semibold"
          : String(w.value) === "500"
            ? "medium"
            : "regular";
    push(`  --font-weight-${label}: ${w.value};`);
  }
  push("");
  push("  /* Foundation — space / radius */");
  for (const s of spaces) {
    const px = parsePx(s.value);
    push(`  --spacing-${slug(px ?? s.value)}: ${s.value};`);
  }
  for (const r of radii) {
    push(`  --radius-${slug(r.value)}: ${r.value};`);
  }
  push("");
  push("  /* Semantic — space / radius */");
  for (const s of sizeSemantics) {
    push(`  ${s.semantic}: var(${s.foundation});`);
  }
  push("}");
  push("```");
  push("");

  push(`## Quick Start — Tailwind v4`);
  push("");
  push("```css");
  push("@theme {");
  for (const c of colors) {
    const hex = c.hex || rgbToHex(c.value) || c.value;
    push(`  ${c.foundation || `--color-${slug(c.token)}`}: ${hex};`);
  }
  for (const s of colorSemantics) {
    push(`  ${s.semantic}: var(${s.foundation});`);
  }
  push(
    `  --font-sans: '${primaryFont}', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`
  );
  fontSizes.forEach((s, i) => {
    const role = typeRole(parsePx(s.value), i, fontSizes.length);
    push(`  --text-${role}: ${s.value};`);
  });
  for (const s of spaces) {
    const px = parsePx(s.value);
    push(`  --spacing-${slug(px ?? s.value)}: ${s.value};`);
  }
  for (const r of radii) {
    push(`  --radius-${slug(r.value)}: ${r.value};`);
  }
  push("}");
  push("```");
  push("");
  push(`---`);
  push(`_Send2Figma design system · hierarchy: default → foundation → semantic → component_`);
  push("");

  return lines.join("\n");
}
