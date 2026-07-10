/**
 * Service-worker CSS fetch: CORS bypass, recursive @import inlining, absolute urls.
 */

const IMPORT_RE = /@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?[^;]*;/gi;
const URL_RE = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;

export function absolutizeCssUrls(cssText, baseHref) {
  if (!cssText || !baseHref) return cssText || "";
  let base;
  try {
    base = new URL(baseHref);
  } catch {
    return cssText;
  }
  return cssText.replace(URL_RE, (match, quote, raw) => {
    const url = raw.trim();
    if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("#")) {
      return match;
    }
    try {
      const abs = new URL(url, base).href;
      return `url(${quote || ""}${abs}${quote || ""})`;
    } catch {
      return match;
    }
  });
}

export async function fetchCssText(url, { timeoutMs = 12000, depth = 0, seen = new Set() } = {}) {
  if (!url || depth > 6 || seen.has(url)) return "";
  seen.add(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();
    text = absolutizeCssUrls(text, url);
    const imports = [];
    text.replace(IMPORT_RE, (_, href) => {
      imports.push(href);
      return "";
    });
    let inlined = "";
    for (const href of imports) {
      try {
        const abs = new URL(href, url).href;
        inlined += (await fetchCssText(abs, { timeoutMs, depth: depth + 1, seen })) + "\n";
      } catch (err) {
        console.warn("[Send2Figma] @import failed:", href, err.message || err);
      }
    }
    // Strip @import rules after inlining
    text = text.replace(IMPORT_RE, "/* inlined import */");
    return inlined + text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Array<{href?: string, cssText?: string}>} sheets
 */
export async function resolveStylesheets(sheets = []) {
  const out = [];
  const seen = new Set();
  for (const sheet of sheets) {
    if (sheet.cssText) {
      out.push(absolutizeCssUrls(sheet.cssText, sheet.href || sheet.base || ""));
      continue;
    }
    if (sheet.href) {
      try {
        out.push(await fetchCssText(sheet.href, { seen }));
      } catch (err) {
        console.warn("[Send2Figma] stylesheet fetch failed:", sheet.href, err.message || err);
      }
    }
  }
  return out.filter(Boolean).join("\n\n");
}
