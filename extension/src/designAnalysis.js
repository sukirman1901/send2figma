/**
 * Design system analysis functions (service-worker safe, no DOM).
 * Shared by designSystem.js and designSystemMd.js to avoid circular imports.
 */

function yamlEscape(s) {
  if (!s) return "";
  return String(s).replace(/['":]/g, "\\$&").trim();
}

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

  // URL path patterns (strong signals)
  if (/\/docs?\//.test(url) || /\/api\//.test(url) || /\/reference\//.test(url) || /\/guide\//.test(url)) scores.docs += 3;
  if (/\/blog\//.test(url) || /\/post\//.test(url) || /\/article\//.test(url)) scores.blog += 3;
  if (/\/app\//.test(url) || /\/dashboard\//.test(url) || /\/settings\//.test(url) || /\/admin\//.test(url)) scores.app += 3;
  if (/\/shop\//.test(url) || /\/product\//.test(url) || /\/cart\//.test(url) || /\/checkout\//.test(url)) scores.ecommerce += 3;
  if (/\/pricing/.test(url) || /\/features/.test(url) || /\/about/.test(url) || /\/contact/.test(url) || /\/careers/.test(url)) scores.marketing += 3;

  // Title/description keyword matching
  if (/\b(documentation|docs|api|reference|guide|tutorial|manual|learn)\b/.test(combined)) scores.docs += 2;
  if (/\b(buy|price|shop|product|deal|discount|offer|purchase|store)\b/.test(combined)) scores.ecommerce += 2;
  if (/\b(sign up|start|try|free|trial|demo|plan|launch|build|create|ship|no-code|template|showcase|drop in|export)\b/.test(combined)) scores.marketing += 2;
  if (/\b(dashboard|settings|account|profile|login|admin|console)\b/.test(combined)) scores.app += 2;

  // DOM heuristics (weaker signals, only boost if already scoring)
  if (meta.articleCount >= 5) scores.blog += 1;
  if (meta.formCount >= 3) scores.app += 1;

  // Root URL with short path = likely marketing/landing
  const pathParts = url.replace(/https?:\/\//, "").replace(/[^/]/g, "").length;
  if (pathParts <= 1 && scores.marketing === 0) scores.marketing += 1;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = sorted[0];
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  const confidence = bestScore === 0 ? 0.3 : Math.min(0.95, bestScore / total);

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
      recommendations.push(`Moderate: "${p.text}" (${p.fg} on ${p.bg}) has ratio ${p.ratio}:1 — increase contrast to 4.5:1`);
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
  const combined = `${meta.title || ""} ${meta.description || ""}`.toLowerCase();
  let audience = "general users";
  if (/\b(developer|api|code|engineer|devops|frontend|backend|fullstack|devtool)\b/i.test(combined)) audience = "developers";
  else if (/\b(business|enterprise|team|company|saas|b2b|organization)\b/i.test(combined)) audience = "businesses";
  else if (/\b(shop|buy|product|deal|discount|offer|purchase|store|cart)\b/i.test(combined)) audience = "consumers";
  else if (/\b(design|creative|template|mockup|showcase|portfolio|ui|ux|figma|sketch)\b/i.test(combined)) audience = "designers and creatives";
  else if (/\b(learn|course|tutorial|education|student|teach|training|lesson)\b/i.test(combined)) audience = "learners and students";
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
  const sentenceCount = allText.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const avgSentenceLen = wordCount / Math.max(sentenceCount, 1);

  const formalMarkers = /\b(please|thank you|welcome|information|available|request|submit|require|ensure|must|should|shall|provides|offers|enables|facilitates|utilize|implement|establish)\b/i;
  const casualMarkers = /\b(hey|wow|cool|awesome|super|gonna|wanna|check out|yep|nope|stuff|things|pretty much|kind of|sort of|right\?|yeah)\b/i;
  const technicalMarkers = /\b(api|endpoint|function|variable|config|deploy|server|database|query|component|render|state|props|hook|middleware|schema|token|build|compile|bundle)\b/i;
  const marketingMarkers = /\b(best|free|top|amazing|transform|boost|grow|launch|new|exclusive|limited|offer|deal|discount|save|get started|try|start|sign up|join|discover|explore|create|ship|build|no-code|template|showcase|drop in|export|instant|fast|powerful)\b/i;

  const scores = { formal: 0, casual: 0, technical: 0, marketing: 0, neutral: 0 };
  if (formalMarkers.test(allText)) scores.formal += 2;
  if (casualMarkers.test(allText)) scores.casual += 2;
  if (technicalMarkers.test(allText)) scores.technical += 2;
  if (marketingMarkers.test(allText)) scores.marketing += 2;
  if (hasExcl) scores.casual += 1;
  if (hasQuestion) scores.formal += 0.5;
  if (avgWordLen > 6) scores.formal += 1;
  if (avgWordLen < 4) scores.casual += 1;
  if (avgSentenceLen > 20) scores.formal += 0.5;
  if (avgSentenceLen < 8) scores.casual += 0.5;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = sorted[0];
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;

  let confidence;
  if (bestScore === 0) {
    confidence = 0.3;
  } else if (bestScore >= 4) {
    confidence = 0.85;
  } else if (bestScore >= 2) {
    confidence = 0.65;
  } else {
    confidence = Math.min(0.7, bestScore / total);
  }

  const descriptions = {
    formal: "Professional, structured communication",
    casual: "Friendly, approachable language",
    technical: "Developer-focused, precise terminology",
    marketing: "Promotional, action-oriented copy",
    neutral: "Balanced, general-purpose tone",
  };
  return { tone: best, confidence, description: descriptions[best] };
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
  push(`name: ${yamlEscape(brand.name || exp?.source || "site")}-design-skill`);
  push(`description: Design system rules for ${yamlEscape(brand.name || "the target site")}`);
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
