/**
 * Regression checks for SuperDev-adopted helpers + fidelity post-process.
 * Run: node tests/fidelity-regression.mjs
 */
import {
  decodeFigh2dHtml,
  encodeFigh2dHtml,
  refillMissingAssets,
} from "../src/fidelityPost.js";
import { absolutizeCssUrls, resolveStylesheets } from "../src/cssFetch.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function samplePayload() {
  return {
    version: 2,
    root: { nodeType: 1, tag: "DIV", childNodes: [] },
    assets: {
      "https://example.invalid/missing.png": {
        url: "https://example.invalid/missing.png",
        blob: null,
      },
      "data:ok": {
        url: "data:ok",
        blob: { type: "image/png", base64Blob: "data:image/png;base64,aaa" },
      },
    },
    fonts: {
      inter: { familyName: "Inter", faces: [], usages: [] },
    },
    fidelity: {
      version: 1,
      fontFaces: [{ familyName: "Inter", urls: [], fontWeight: "400", fontStyle: "normal" }],
      backgrounds: {
        "bg-0": {
          layers: [{ type: "linear-gradient", value: "90deg, #000, #fff" }],
          backgroundColor: "rgb(255,255,255)",
        },
      },
      hardRegions: [],
      assetUrls: [],
      designTokens: {
        colors: [{ value: "rgb(15, 118, 110)", count: 4 }],
        fonts: [{ value: "Inter", count: 10 }],
        radii: [{ value: "8px", count: 3 }],
      },
    },
  };
}

async function testRoundTrip() {
  const html = await encodeFigh2dHtml(samplePayload());
  assert.match(html, /figh2d/);
  const data = decodeFigh2dHtml(html);
  assert.equal(data.version, 2);
  assert.equal(data.fidelity.designTokens.colors[0].value, "rgb(15, 118, 110)");
}

async function testRefillKeepsExisting() {
  const data = samplePayload();
  await refillMissingAssets(data);
  assert.equal(data.assets["data:ok"].blob.base64Blob, "data:image/png;base64,aaa");
}

function testAbsolutizeCss() {
  const css = absolutizeCssUrls(
    'body{background:url("/img.png")} @import url("theme.css");',
    "https://example.com/app/style.css"
  );
  assert.match(css, /https:\/\/example\.com\/img\.png/);
  assert.match(css, /https:\/\/example\.com\/app\/theme\.css/);
}

async function testResolveInlineSheet() {
  const css = await resolveStylesheets([
    { cssText: ".a{color:red;background:url(./x.png)}", href: "https://cdn.example/a.css" },
  ]);
  assert.match(css, /color:red/);
  assert.match(css, /https:\/\/cdn\.example\/x\.png/);
}

function testFixtureExists() {
  const path = join(__dirname, "../fixtures/fidelity-fixture.html");
  const html = readFileSync(path, "utf8");
  assert.match(html, /dropdown/);
  assert.match(html, /linear-gradient/);
}

function testScriptSurfaces() {
  const fidelity = readFileSync(join(__dirname, "../fidelity.js"), "utf8");
  assert.match(fidelity, /recoverInheritedCss|requestCssResolve|inheritedApplied/);
  assert.match(fidelity, /data-h2d-pseudo-host/);
  assert.match(fidelity, /exact && filterHeavy/);
  assert.match(fidelity, /prepare_timeout|withTimeout/);
  assert.match(fidelity, /Resolving CSS|Materializing|Fidelity prep timed out/);
  assert.match(fidelity, /markExtensionChrome|maxNodes:\s*4000/);
  const helpers = readFileSync(join(__dirname, "../superDevHelpers.js"), "utf8");
  assert.match(helpers, /installRasterHygiene|harvestStylesheets|recoverInheritedCss/);
  assert.match(helpers, /stickyToRelative/);
  assert.match(helpers, /timeoutMs:\s*6000|timeoutMs = .*6000/);
  assert.match(helpers, /maxHtmlBytes|html_too_large|__skipped/);
  assert.match(helpers, /maxNodes/);
  const picker = readFileSync(join(__dirname, "../picker.js"), "utf8");
  assert.match(picker, /ArrowUp|box-model|__htfyStartPicker/);
  const bg = readFileSync(join(__dirname, "../background.js"), "utf8");
  assert.match(bg, /htfy_RESOLVE_CSS|superDevHelpers\.js|resolveStylesheets/);
  const post = readFileSync(join(__dirname, "../src/fidelityPost.js"), "utf8");
  assert.match(post, /remeasureRegion|qualityMode/);
  assert.match(post, /extractDesignTokensLive|designTokensLiveFallback|tokensAreEmpty/);
  const capture = readFileSync(join(__dirname, "../designSystemCapture.js"), "utf8");
  assert.match(capture, /rgba\(\$\{r\}, \$\{g\}, \$\{b\}/);
  assert.doesNotMatch(capture, /a < 250\) return null/);
  const plugin = readFileSync(join(__dirname, "../figma-plugin/code.js"), "utf8");
  assert.match(plugin, /JSON has no tokens|Export \.json/);
  const panel = readFileSync(join(__dirname, "../ui/panel.js"), "utf8");
  assert.match(panel, /Tokens empty|designSystemTokenCount/);
  assert.match(panel, /Resolving CSS|Materializing|progressPct|Math\.max\(progressPct/);
  assert.match(panel, /Preparing fidelity/);
  const patch = readFileSync(join(__dirname, "../src/treePatch.js"), "utf8");
  assert.match(patch, /EDITABLE_SKIP_INJECT|regionArea \* 4/);
}

function testInjectSkipsEffectKindsInEditable() {
  return import("../src/treePatch.js").then(({ injectHardRegionRasters }) => {
    const data = {
      root: {
        nodeType: 1,
        tag: "DIV",
        attributes: { id: "htfy-hard-0" },
        rect: { x: 0, y: 0, width: 100, height: 40 },
        childNodes: [
          {
            nodeType: 1,
            tag: "SPAN",
            rect: { x: 0, y: 0, width: 50, height: 20 },
            childNodes: [],
          },
        ],
      },
      fidelity: {
        hardRegions: [
          {
            kind: "filter",
            elementId: "htfy-hard-0",
            assetKey: "rasterized:hard:0:filter",
            x: 0,
            y: 0,
            width: 100,
            height: 40,
          },
        ],
      },
    };
    injectHardRegionRasters(data, { qualityMode: "editable" });
    assert.equal(data.fidelity.rastersInjected || 0, 0);
    assert.equal(data.root.childNodes.length, 1);

    injectHardRegionRasters(data, { qualityMode: "exact" });
    assert.equal(data.fidelity.rastersInjected, 1);
    assert.equal(data.root.childNodes.length, 0);
    assert.equal(data.root.placeholderUrl, "rasterized:hard:0:filter");
  });
}

await testRoundTrip();
await testRefillKeepsExisting();
testAbsolutizeCss();
await testResolveInlineSheet();
testFixtureExists();
testScriptSurfaces();
await testInjectSkipsEffectKindsInEditable();
assert.match(readFileSync(join(__dirname, "../src/treePatch.js"), "utf8"), /injectHardRegionRasters/);

console.log("fidelity-regression: ok");
