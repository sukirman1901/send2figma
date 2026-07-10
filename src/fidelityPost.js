/** Post-process figh2d clipboard HTML: refill CORS assets, embed font bytes, raster hard regions. */

const FIGH2D_RE = /<!--\(figh2d\)([\s\S]*?)\(\/figh2d\)-->/;

export function decodeFigh2dHtml(html) {
  const m = html && html.match(FIGH2D_RE);
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export async function encodeFigh2dHtml(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let b64;
  if (typeof Buffer !== "undefined") {
    b64 = Buffer.from(bytes).toString("base64");
  } else {
    b64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).slice(String(fr.result).indexOf(",") + 1));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(new Blob([bytes], { type: "application/octet-stream" }));
    });
  }
  return `<span data-h2d="<!--(figh2d)${b64}(/figh2d)-->"></span>`;
}

async function blobToDataUrl(blob) {
  if (typeof Buffer !== "undefined" && typeof FileReader === "undefined") {
    const ab = await blob.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    return `data:${blob.type || "application/octet-stream"};base64,${b64}`;
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function fetchAsAsset(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { type: blob.type || "application/octet-stream", base64Blob: dataUrl };
  } finally {
    clearTimeout(t);
  }
}

export async function refillMissingAssets(data) {
  if (!data?.assets) return data;
  const entries = Object.entries(data.assets);
  await Promise.all(
    entries.map(async ([key, asset]) => {
      if (asset?.blob?.base64Blob) return;
      const url = asset?.url || key;
      if (!url || url.startsWith("rasterized:") || url.startsWith("data:")) return;
      try {
        const blob = await fetchAsAsset(url);
        data.assets[key] = { url, blob };
      } catch (err) {
        console.warn("[Send2Figma] asset refill failed:", url, err.message || err);
      }
    })
  );
  return data;
}

export async function embedFontFaceBytes(data) {
  const faces = data?.fidelity?.fontFaces;
  if (!Array.isArray(faces)) return data;
  for (const face of faces) {
    if (!face.urls?.length) continue;
    face.embedded = face.embedded || [];
    for (const url of face.urls.slice(0, 3)) {
      if (url.startsWith("data:")) {
        face.embedded.push({ url, base64Blob: url });
        continue;
      }
      try {
        const blob = await fetchAsAsset(url, 15000);
        face.embedded.push({ url, ...blob });
        // Mirror into fonts[family].faces
        const key = (face.familyName || "").toLowerCase();
        if (key && data.fonts?.[key]) {
          data.fonts[key].faces = data.fonts[key].faces || [];
          data.fonts[key].faces.push({
            src: [blob.base64Blob],
            fontWeight: face.fontWeight,
            fontStyle: face.fontStyle,
            fontStretch: face.fontStretch,
          });
        }
      } catch (err) {
        console.warn("[Send2Figma] font embed failed:", url, err.message || err);
      }
    }
  }
  return data;
}

export async function prefetchListedAssets(data) {
  const urls = data?.fidelity?.assetUrls;
  if (!Array.isArray(urls) || !urls.length) return data;
  data.assets = data.assets || {};
  await Promise.all(
    urls.slice(0, 80).map(async (url) => {
      if (!url || data.assets[url]?.blob?.base64Blob) return;
      if (url.startsWith("data:") || url.startsWith("blob:")) return;
      try {
        const blob = await fetchAsAsset(url);
        data.assets[url] = { url, blob };
      } catch (err) {
        console.warn("[Send2Figma] listed asset failed:", url, err.message || err);
      }
    })
  );
  return data;
}

import {
  injectHardRegionRasters,
  applyStructuralStyles,
  summarizeTree,
} from "./treePatch.js";
import { applyComponentNames, buildDesignSystemExport, summarizeDesignSystem } from "./designSystem.js";

/** Light hygiene before region screenshots: kill motion, hide extension chrome only. */
export async function withRasterHygiene(tabId, fn, { exceptElementIds = [] } = {}) {
  if (tabId == null) return fn();
  let handle = null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["superDevHelpers.js"],
    });
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (exceptIds) => {
        const h = window.__htfySuperDevHelpers;
        if (!h) return false;
        // Do NOT sticky→relative or blanket-hide fixed — that shifts clips and blanks targets.
        window.__htfyRasterHygiene = h.installRasterHygiene({
          stickyToRelative: false,
          trackFixed: true,
        });
        window.__htfyRasterHygiene.hideFixed(exceptIds || []);
        document.querySelectorAll('#htfyRoot, [id^="__htfy"], [data-htfy-chrome="1"]').forEach((el) => {
          el.setAttribute("data-htfy-raster-hide", "1");
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
        });
        return true;
      },
      args: [exceptElementIds],
    });
    handle = result;
    return await fn();
  } finally {
    if (handle) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            try {
              window.__htfyRasterHygiene?.cleanup();
            } catch (_) {}
            document.querySelectorAll("[data-htfy-raster-hide='1']").forEach((el) => {
              el.removeAttribute("data-htfy-raster-hide");
              el.style.removeProperty("display");
              el.style.removeProperty("visibility");
            });
            delete window.__htfyRasterHygiene;
          },
        });
      } catch (_) {}
    }
  }
}

async function remeasureRegion(tabId, region) {
  if (!region?.elementId) return region;
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return {
          docX: r.left + window.scrollX,
          docY: r.top + window.scrollY,
          width: r.width,
          height: r.height,
          dpr: window.devicePixelRatio || 1,
        };
      },
      args: [region.elementId],
    });
    if (!result) return region;
    return { ...region, ...result };
  } catch {
    return region;
  }
}

const EDITABLE_SKIP_RASTER_KINDS = new Set(["filter", "backdrop", "blend", "shadow"]);

export async function rasterHardRegions(tabId, data, { qualityMode = "editable" } = {}) {
  let regions = data?.fidelity?.hardRegions;
  if (!Array.isArray(regions) || !regions.length || tabId == null) return data;

  // Editable: only raster media embeds (iframe/canvas/video/svg), never effect flats.
  if (qualityMode !== "exact") {
    regions = regions.filter((r) => !EDITABLE_SKIP_RASTER_KINDS.has(r.kind));
    if (!regions.length) return data;
  }

  const exceptIds = regions.map((r) => r.elementId).filter(Boolean);

  return withRasterHygiene(
    tabId,
    async () => {
      let attached = false;
      try {
        await chrome.debugger.attach({ tabId }, "1.3");
        attached = true;
        data.assets = data.assets || {};

        for (let i = 0; i < Math.min(regions.length, 12); i++) {
          let region = regions[i];
          region = await remeasureRegion(tabId, region);
          const dpr = region.dpr || 1;
          const clipX = region.docX ?? region.x;
          const clipY = region.docY ?? region.y;
          const width = region.width;
          const height = region.height;
          if (!(width > 1) || !(height > 1)) continue;
          try {
            const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
              format: "png",
              fromSurface: true,
              clip: {
                x: clipX,
                y: clipY,
                width,
                height,
                scale: dpr,
              },
              captureBeyondViewport: true,
            });
            if (!result?.data) continue;
            const key = `rasterized:hard:${i}:${region.kind}`;
            const dataUrl = `data:image/png;base64,${result.data}`;
            data.assets[key] = {
              url: key,
              blob: { type: "image/png", base64Blob: dataUrl },
            };
            region.assetKey = key;
            // Keep measured box on the region for inject matching.
            regions[i] = region;
          } catch (err) {
            console.warn("[Send2Figma] region raster failed:", region, err.message || err);
          }
        }
      } catch (err) {
        console.warn("[Send2Figma] debugger raster unavailable:", err.message || err);
      } finally {
        if (attached) {
          try {
            await chrome.debugger.detach({ tabId });
          } catch (_) {}
        }
      }
      return data;
    },
    { exceptElementIds: exceptIds }
  );
}

function tokensAreEmpty(tokens) {
  if (!tokens || typeof tokens !== "object") return true;
  const keys = ["colors", "fonts", "fontFamilies", "fontSizes", "radii", "spaces", "components"];
  return !keys.some((k) => Array.isArray(tokens[k]) && tokens[k].length > 0);
}

/** Live extract when prepare timed out / tokens missing from capture payload. */
async function extractDesignTokensLive(tabId) {
  if (!tabId) return null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["designSystemCapture.js"],
    });
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const api = window.__htfyDesignSystemCapture;
        if (!api?.extractDesignSystem) return null;
        const root = document.documentElement || document.body;
        return api.extractDesignSystem(root);
      },
    });
    return result && !tokensAreEmpty(result) ? result : null;
  } catch (err) {
    console.warn("[Send2Figma] live design-token extract failed:", err.message || err);
    return null;
  }
}

export async function postProcessCaptureHtml(html, { tabId, qualityMode } = {}) {
  let data = decodeFigh2dHtml(html);
  if (!data) return html;
  const mode = qualityMode || data?.fidelity?.qualityMode || "editable";
  data = await prefetchListedAssets(data);
  data = await refillMissingAssets(data);
  data = await embedFontFaceBytes(data);
  data = await rasterHardRegions(tabId, data, { qualityMode: mode });
  data = injectHardRegionRasters(data, { qualityMode: mode });
  data = applyStructuralStyles(data);
  data = applyComponentNames(data);
  data.fidelity = data.fidelity || {};
  data.fidelity.qualityMode = mode;
  data.fidelity.treeSummary = summarizeTree(data);
  if (tokensAreEmpty(data.fidelity.designTokens)) {
    const live = await extractDesignTokensLive(tabId);
    if (live) {
      data.fidelity.designTokens = live;
      data.fidelity.designTokensLiveFallback = true;
    } else if (!data.fidelity.designTokens) {
      data.fidelity.designTokens = { colors: [], fonts: [], radii: [], components: [] };
    }
  }
  data.fidelity.designSystemSummary = summarizeDesignSystem(data.fidelity.designTokens);
  data.fidelity.designSystemExport = buildDesignSystemExport(data);
  data.fidelity.layerNaming =
    data.fidelity.layerNaming ||
    "Elements named from tag/id/class; repeated UI → Component/*; hard regions → placeholderUrl rasters.";
  data.fidelity.phaseA = {
    rastersInjected: data.fidelity.rastersInjected || 0,
    structuralStylesApplied: !!data.fidelity.structuralStylesApplied,
  };
  data.fidelity.phaseC = {
    componentsNamed: data.fidelity.componentsNamed || 0,
    tokens: data.fidelity.designSystemSummary,
  };
  return encodeFigh2dHtml(data);
}
