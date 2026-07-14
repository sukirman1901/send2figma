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

import { pageProfile, wcagSummary, inferBrand, inferTone, qualityGates, buildSkillMd } from "./designAnalysis.js";

/**
 * Compact Style Reference (Superr-like) — DEFINE-phase artifact for agents.
 * Prefer this over the long hierarchy dump when cloning a site.
 *
 * @param {object} exp — design system export (+ optional designSystem / buttons / links)
 * @returns {string}
 */
export function formatCompactStyleReference(exp) {
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
  const radii = sortByPxAsc(tokens.radii || []);
  const spaces = sortByPxAsc(tokens.spaces || []);
  const shadows = tokens.shadows || [];
  const buttons = exp?.buttons || exp?.designSystem?.buttons || [];
  const links = exp?.links || exp?.designSystem?.links || [];
  const hoverRules = exp?.designSystem?.interaction?.hoverRules || [];
  const theme = detectTheme(colors);
  const colorSemantics = buildColorSemantics(colors, theme);
  const sizeSemantics = buildSizeSemantics(spaces, radii);
  const primaryFont = fontFamilies[0]?.family || fonts[0]?.value || "system-ui";
  const secondaryFont = fontFamilies[1]?.family || null;

  const findSem = (part) => colorSemantics.find((s) => s.semantic.includes(part));
  const dsColors = exp?.designSystem?.colors || {};
  const dsBrand = exp?.designSystem?.brand || {};
  const canvas =
    dsColors.surface ||
    dsBrand.surface ||
    findSem("bg-primary")?.hex ||
    colors.find((c) => lum(c.hex || "") > 0.9)?.hex;
  const ink =
    dsColors.textPrimary ||
    dsBrand.textPrimary ||
    findSem("text-primary")?.hex ||
    colors.find((c) => lum(c.hex || "") < 0.35 && lum(c.hex || "") > 0.08)?.hex ||
    colors.find((c) => lum(c.hex || "") < 0.25)?.hex;
  const accent =
    dsColors.primary ||
    dsBrand.primaryAction ||
    findSem("bg-accent")?.hex ||
    buttons[0]?.backgroundColorHex ||
    buttons[0]?.background;
  const surface2 = dsColors.surface && dsColors.surface !== canvas ? null : findSem("bg-secondary")?.hex;

  const voiceBits = [
    theme === "dark" ? "A dark UI" : "A light UI",
    canvas ? `grounded on ${canvas}` : null,
    ink ? `with ${ink} as primary ink` : null,
    accent ? `and ${accent} as the action accent` : null,
    primaryFont ? `Type is led by ${primaryFont}` : null,
  ].filter(Boolean);

  const lines = [];
  const push = (...xs) => lines.push(...xs);

  push(`# ${title} — Style Reference`);
  push(`> ${voiceBits.join(". ") || "Captured from live page."}. Measured values only — do not invent tokens.`);
  push("");
  push(`**Theme:** ${theme}`);
  push("");

  // ——— Brand ———
  const brand = inferBrand(exp?.pageMeta);
  const profile = pageProfile(exp?.pageMeta);
  if (brand.name || brand.mission) {
    push(`## Brand`);
    push("");
    if (brand.name) push(`- **Name:** ${brand.name}`);
    if (brand.mission) push(`- **Mission:** ${brand.mission}`);
    if (brand.audience) push(`- **Audience:** ${brand.audience}`);
    push(`- **Surface:** ${profile.label} (${Math.round(profile.confidence * 100)}% confidence)`);
    push(`- **URL:** ${brand.url || exp?.source || "N/A"}`);
    push("");
  }

  push(
    `${title} is rebuilt from a live capture. Prefer named tokens below for all UI. Section layout measures (padding/gap) may override spacing when cloning a specific block. Decorative colors that appear rarely should stay decorative — do not promote them to buttons or links unless listed under Components.`
  );
  push("");

  // ——— Colors ———
  push(`## Tokens — Colors`);
  push("");
  push(`| Name | Value | Token | Role |`);
  push(`|------|-------|-------|------|`);

  const namedColors = [];
  const pushColor = (name, hex, token, role) => {
    if (!hex) return;
    if (namedColors.some((c) => c.hex === hex)) return;
    namedColors.push({ name, hex, token, role });
    push(`| ${name} | \`${hex}\` | \`${token}\` | ${role} |`);
  };

  pushColor("Canvas", canvas, "--color-canvas", "Page background and default surfaces");
  pushColor("Ink", ink, "--color-ink", "Primary body and UI text");
  if (surface2) pushColor("Surface Tint", surface2, "--color-surface-tint", "Secondary panels / cards");
  pushColor("Accent", accent, "--color-accent", "Primary actions and brand emphasis");
  if (buttons[1]?.backgroundColorHex || buttons[1]?.background) {
    pushColor(
      "Accent Secondary",
      buttons[1].backgroundColorHex || buttons[1].background,
      "--color-accent-secondary",
      "Secondary CTA fill"
    );
  }
  for (const c of colors.slice(0, 10)) {
    const hex = c.hex || rgbToHex(c.value);
    const found = (c.foundation || `--color-${slug(c.token)}`).replace(/^--color-/, "");
    pushColor(titleCase(found), hex, c.foundation || `--color-${slug(found)}`, "Foundation swatch from page");
  }
  push("");

  // ——— Accessibility ———
  const contrastData = wcagSummary(exp?.contrastPairs);
  if (contrastData.total > 0) {
    push(`## Accessibility`);
    push("");
    push(`**WCAG 2.2 AA:** ${contrastData.pass}/${contrastData.total} contrast pairs pass`);
    push("");
    if (contrastData.fail > 0) {
      push(`**Failing pairs (${contrastData.fail}):**`);
      push("");
      for (const rec of contrastData.recommendations.slice(0, 5)) {
        push(`- ${rec}`);
      }
      push("");
    }
    push(`---`);
    push("");
  }

  // ——— Typography ———
  push(`## Tokens — Typography`);
  push("");
  const families = fontFamilies.length
    ? fontFamilies
    : fonts.map((f) => ({
        family: f.value,
        token: `--font-${slug(f.value)}`,
        sizes: fontSizes.map((s) => s.value),
        weights: fontWeights.map((w) => w.value),
        tags: [],
      }));

  families.slice(0, 3).forEach((f, i) => {
    const role =
      i === 0
        ? "Primary display, heading, and body"
        : "Secondary UI / navigation labels";
    push(`### ${f.family} — ${role} · \`${f.token || `--font-${slug(f.family)}`}\``);
    push(`- **Weights:** ${(f.weights || fontWeights.map((w) => w.value)).slice(0, 6).join(", ") || "—"}`);
    push(`- **Sizes:** ${(f.sizes || fontSizes.map((s) => s.value)).slice(0, 10).join(", ") || "—"}`);
    push(`- **Role:** ${role}. Use this family for the roles above; do not invent a third family.`);
    push("");
  });

  push(`### Type Scale`);
  push("");
  push(`| Role | Size | Token |`);
  push(`|------|------|-------|`);
  const usedTableRoles = [];
  fontSizes.forEach((s, i) => {
    const px = parsePx(s.value);
    let role = typeRole(px, i, fontSizes.length);
    let counter = 2;
    while (usedTableRoles.includes(role)) {
      role = `${role.replace(/-\d+$/, "")}-${counter}`;
      counter++;
    }
    usedTableRoles.push(role);
    push(`| ${role} | ${s.value} | \`--text-${role}\` |`);
  });
  if (!fontSizes.length) push(`| body | 16px | \`--text-body\` |`);
  push("");

  // ——— Spacing & shapes ———
  push(`## Tokens — Spacing & Shapes`);
  push("");
  const base =
    spaces.map((s) => parsePx(s.value)).find((n) => n === 4 || n === 8) || 4;
  push(`**Base unit:** ${base}px`);
  push("");
  push(`### Spacing Scale`);
  push("");
  push(`| Name | Value | Token |`);
  push(`|------|-------|-------|`);
  for (const s of spaces.slice(0, 14)) {
    const px = parsePx(s.value);
    push(`| ${px ?? s.value} | ${s.value} | \`--spacing-${slug(px ?? s.value)}\` |`);
  }
  if (!spaces.length) push(`| 8 | 8px | \`--spacing-8\` |`);
  push("");

  push(`### Border Radius`);
  push("");
  push(`| Element | Value |`);
  push(`|---------|-------|`);
  const btnR = buttons[0]?.borderRadius || buttons[0]?.radius;
  if (btnR) push(`| buttons | ${btnR} |`);
  for (const r of radii.slice(0, 6)) {
    const px = parsePx(r.value) || 0;
    const label = px >= 999 || px >= 40 ? "pill / large" : px >= 16 ? "cards / controls" : "inputs / chips";
    push(`| ${label} | ${r.value} |`);
  }
  if (!radii.length && !btnR) push(`| controls | 8px |`);
  push("");

  if (shadows.length) {
    push(`### Shadows`);
    push("");
    push(`| Name | Value | Token |`);
    push(`|------|-------|-------|`);
    shadows.slice(0, 4).forEach((s, i) => {
      push(`| ${i === 0 ? "default" : `shadow-${i + 1}`} | \`${String(s.value).slice(0, 120)}\` | \`--shadow-${i + 1}\` |`);
    });
    push("");
  }

  // ——— Components ———
  push(`## Components`);
  push("");
  if (buttons.length) {
    buttons.slice(0, 6).forEach((b, i) => {
      const role = b.role || (i === 0 ? "primary" : "secondary");
      const label = titleCase(String(role).replace(/-/g, " "));
      push(`### ${label} Button`);
      push(`**Role:** ${role === "primary" ? "Primary call-to-action" : "Secondary / alternate action"}`);
      push("");
      const bg = b.backgroundColorHex || b.background || "—";
      const fg = b.colorHex || b.foreground || b.color || "—";
      const radiusRaw = b.borderRadius || b.radius || "—";
      const radiusVal = typeof radiusRaw === "number" ? (radiusRaw > 999 ? "pill" : `${radiusRaw}px`) : radiusRaw;
      push(
        `Fill \`${bg}\`, text \`${fg}\`, height ${b.height || "—"}, radius ${radiusVal}, type ${b.fontSize || "—"} / weight ${b.fontWeight || "—"}, padding \`${b.padding || "—"}\`${b.text ? `. Sample label: \u201c${b.text}\u201d` : ""}.`
      );
      push("");
    });
  } else {
    push(`_No opaque button variants captured — inspect CTAs in the target section._`);
    push("");
  }

  if (links.length) {
    push(`### Nav / Text Link`);
    push(`**Role:** Navigation and inline links`);
    push("");
    const l = links[0];
    push(
      `Color \`${l.colorHex || l.color || "—"}\`, type ${l.fontSize || "—"} / weight ${l.fontWeight || "—"}, line-height ${l.lineHeight || "—"}.`
    );
    push("");
  }

  if (hoverRules.length) {
    push(`### Hover / Interaction`);
    push("");
    push(`Captured :hover rules (apply; do not invent):`);
    push("");
    for (const h of hoverRules.slice(0, 8)) {
      push(`- \`${h.selector}\` — \`${String(h.cssText || "").slice(0, 160)}\``);
    }
    push("");
  }

  // ——— Writing Tone ———
  const tone = inferTone(exp?.pageMeta?.textSamples);
  push(`## Writing Tone`);
  push("");
  push(`**Detected tone:** ${tone.tone} (${Math.round(tone.confidence * 100)}% confidence)`);
  push(`**Description:** ${tone.description}`);
  push("");

  // ——— Do / Don't ———
  push(`## Do's and Don'ts`);
  push("");
  push(`### Do`);
  push(`- Use **${primaryFont}** for primary UI type${secondaryFont ? `; reserve **${secondaryFont}** for secondary labels` : ""}`);
  if (canvas) push(`- Keep the canvas at \`${canvas}\` unless a section alias overrides`);
  if (ink) push(`- Use \`${ink}\` for body/UI text`);
  if (accent) push(`- Use \`${accent}\` only for primary actions / brand emphasis listed above`);
  if (btnR) push(`- Match button radius \`${btnR}\` and measured heights — do not switch to full-pill unless captured`);
  push(`- Prefer tokens in this file over raw capture dumps`);
  push("");
  push(`### Don't`);
  push(`- Don't invent brand hex or type sizes not listed here`);
  push(`- Don't promote rare decorative swatches to buttons/links`);
  push(`- Don't replace measured spacing with default Tailwind steps`);
  if (!shadows.length) push(`- Don't add heavy shadows or glass that weren't captured`);
  push(`- Don't skip DEFINE — write/update this Style Reference before BUILD`);
  push("");

  // ——— Quality Gates ———
  const gates = qualityGates(exp);
  push(`## Quality Gates`);
  push("");
  push(`**Score:** ${gates.score}/100`);
  push("");
  push(`| Gate | Status | Details |`);
  push(`|------|--------|---------|`);
  for (const g of gates.gates) {
    push(`| ${g.name} | ${g.pass ? "✅" : "❌"} | ${g.message} |`);
  }
  push("");

  // ——— Surfaces ———
  push(`## Surfaces`);
  push("");
  push(`| Level | Name | Value | Purpose |`);
  push(`|-------|------|-------|---------|`);
  if (canvas) push(`| 0 | Canvas | \`${canvas}\` | Page background |`);
  if (surface2) push(`| 1 | Surface Tint | \`${surface2}\` | Secondary panels |`);
  if (accent) push(`| 2 | Accent | \`${accent}\` | Action / brand surfaces |`);
  push("");

  // ——— Agent guide ———
  push(`## Agent Prompt Guide`);
  push("");
  push(`**Quick Color Reference**`);
  if (canvas) push(`- canvas: ${canvas}`);
  if (ink) push(`- text: ${ink}`);
  if (accent) push(`- accent / primary action: ${accent}`);
  if (surface2) push(`- surface tint: ${surface2}`);
  push(`- font: ${primaryFont}`);
  push("");
  push(`**Example Component Prompts**`);
  if (buttons[0]) {
    const b = buttons[0];
    push(
      `1. Build primary button: fill ${b.backgroundColorHex || b.background}, text ${b.colorHex || b.color}, height ${b.height}, radius ${b.borderRadius || b.radius}, type ${primaryFont} ${b.fontSize}/${b.fontWeight}.`
    );
  } else {
    push(`1. Build UI only from tokens in this file; measure missing CTAs from section specs.`);
  }
  push(`2. Build page chrome on canvas ${canvas || "(from tokens)"} with ink ${ink || "(from tokens)"}.`);
  push(`3. Clone a section only after reading section \`specs.aliases\` — they win on padding/gap conflicts.`);
  push("");

  // ——— CSS ———
  push(`## Quick Start`);
  push("");
  push(`### CSS Custom Properties`);
  push("");
  push("```css");
  push(":root {");
  push("  /* Colors */");
  for (const c of namedColors.slice(0, 12)) {
    push(`  ${c.token}: ${c.hex};`);
  }
  push("");
  push("  /* Typography */");
  push(
    `  --font-primary: '${primaryFont}', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`
  );
  if (secondaryFont) {
    push(
      `  --font-secondary: '${secondaryFont}', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;`
    );
  }
  const usedTextRoles = [];
  fontSizes.forEach((s, i) => {
    let role = typeRole(parsePx(s.value), i, fontSizes.length);
    let counter = 2;
    while (usedTextRoles.includes(role)) {
      role = `${role.replace(/-\d+$/, "")}-${counter}`;
      counter++;
    }
    usedTextRoles.push(role);
    push(`  --text-${role}: ${s.value};`);
  });
  for (const w of fontWeights.slice(0, 4)) {
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
  push("  /* Spacing & radius */");
  for (const s of spaces.slice(0, 12)) {
    const px = parsePx(s.value);
    push(`  --spacing-${slug(px ?? s.value)}: ${s.value};`);
  }
  for (const r of radii.slice(0, 6)) {
    push(`  --radius-${slug(r.value)}: ${r.value};`);
  }
  if (btnR) push(`  --radius-buttons: ${btnR};`);
  push("}");
  push("```");
  push("");

  // ——— Diagnostics ———
  push(`## Diagnostics`);
  push("");
  push(`- Elements scanned: ~${exp?.treeSummary?.nodeCount || "N/A"}`);
  push(`- Colors detected: ${colors.length}`);
  push(`- Type sizes: ${fontSizes.length}`);
  push(`- Components: ${(exp?.components || []).length}`);
  push(`- Generated: ${exp?.exportedAt || new Date().toISOString()}`);
  push("");

  push(`---`);
  push(`_Send2Figma compact Style Reference · DEFINE before PLAN/BUILD_`);
  push("");

  return lines.join("\n");
}

/**
 * @param {object} exp
 * @returns {string}
 */
export function formatDesignSystemMarkdown(exp) {
  // Compact Style Reference is the default DEFINE artifact (Superr-like).
  return formatCompactStyleReference(exp);
}

/** Legacy long-form hierarchy dump (optional). */
export function formatDesignSystemMarkdownDetailed(exp) {
  return formatCompactStyleReference(exp) + "\n\n" + _formatLegacyHierarchy(exp);
}

function _formatLegacyHierarchy(exp) {
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

  push(`# ${title} — Design System (detailed)`);
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

  push(`## Foundation — Colors`);
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

  if (cssVariables.length) {
    push(`### Author CSS variables (from :root / stylesheets)`);
    push("");
    push(`| Variable | Value | Resolved |`);
    push(`|----------|-------|----------|`);
    for (const v of cssVariables.slice(0, 40)) {
      push(`| \`${v.name}\` | \`${v.value}\` | ${v.hex ? `\`${v.hex}\`` : "—"} |`);
    }
    push("");
  }

  push(`## Semantic — Colors`);
  push("");
  push(`| Semantic | → Foundation | Value | Role |`);
  push(`|----------|--------------|-------|------|`);
  for (const s of colorSemantics) {
    push(`| \`${s.semantic}\` | \`${s.foundation}\` | \`${s.hex}\` | ${s.role} |`);
  }
  if (!colorSemantics.length) push(`| — | — | — | — |`);
  push("");

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

  push(`## Component tokens`);
  push("");
  if (components.length) {
    for (const c of components) {
      const label = titleCase(String(c.name || "Component").replace(/^Component\//, ""));
      push(`### ${label}`);
      push(`- **Tag:** \`<${c.tag || "div"}>\`${c.className ? ` · \`.${c.className}\`` : ""}`);
      push(`- **Footprint:** ~${c.width || "?"}×${c.height || "?"}px · seen ${c.count || "?"}×`);
      push("");
    }
  } else {
    push(`_No repeated component signatures detected._`);
    push("");
  }

  push(`## Rules — Do`);
  push("");
  push(`- Use semantic color tokens for text, surfaces, borders, and accents.`);
  push(`- Keep the type stack led by **${primaryFont}**.`);
  push("");
  push(`## Rules — Don't`);
  push("");
  push(`- Don't hard-code hex/px in components when a semantic token exists.`);
  push(`- Don't invent tokens not in this file.`);
  push("");
  if (shadows.length) {
    push(`## Shadows`);
    push("");
    for (const s of shadows.slice(0, 4)) push(`- \`${String(s.value).slice(0, 160)}\``);
    push("");
  }

  return lines.join("\n");
}

