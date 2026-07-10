/**
 * Phase A regression: tree patch (raster inject + structural styles).
 * Run: node tests/phase-a-regression.mjs
 */
import assert from "node:assert/strict";
import {
  injectHardRegionRasters,
  applyStructuralStyles,
  findBestNodeForRegion,
  summarizeTree,
} from "../src/treePatch.js";
import { encodeFigh2dHtml, decodeFigh2dHtml } from "../src/fidelityPost.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(__dirname, "snapshots");

function sampleTree() {
  return {
    version: 2,
    rootBackgroundColor: "rgb(240, 253, 250)",
    root: {
      nodeType: 1,
      id: "h2d-node-1",
      tag: "DIV",
      attributes: { id: "fixture-root" },
      styles: {
        backgroundImage: "linear-gradient(135deg, rgb(236, 254, 255), rgb(255, 255, 255))",
        color: "oklch(0.4 0.1 180)",
      },
      rect: { x: 0, y: 0, width: 420, height: 500 },
      childNodes: [
        {
          nodeType: 1,
          id: "h2d-node-2",
          tag: "IFRAME",
          attributes: { id: "htfy-hard-0" },
          styles: { width: "200px", height: "100px" },
          rect: { x: 20, y: 200, width: 200, height: 100 },
          childNodes: [
            {
              nodeType: 1,
              id: "h2d-node-3",
              tag: "DIV",
              styles: {},
              rect: { x: 20, y: 200, width: 200, height: 100 },
              childNodes: [],
            },
          ],
        },
        {
          nodeType: 3,
          id: "h2d-node-4",
          text: "Hello",
          rect: { x: 10, y: 10, width: 40, height: 16 },
          lineCount: 1,
        },
      ],
    },
    assets: {},
    fidelity: {
      hardRegions: [
        {
          kind: "iframe",
          x: 20,
          y: 200,
          width: 200,
          height: 100,
          elementId: "htfy-hard-0",
          assetKey: "rasterized:hard:0:iframe",
        },
      ],
      backgrounds: {
        "fixture-root": {
          backgroundImage: "linear-gradient(135deg, rgb(236, 254, 255), rgb(255, 255, 255))",
          layers: [{ type: "linear-gradient", value: "135deg, #ecfeff, #fff" }],
          backgroundSize: "auto",
          backgroundPosition: "0% 0%",
          backgroundColor: "rgba(0, 0, 0, 0)",
        },
      },
      inheritedStyles: {
        "font-family": "Georgia, serif",
        "font-size": "16px",
        color: "rgb(19, 78, 74)",
      },
    },
  };
}

function testFindByElementId() {
  const data = sampleTree();
  const region = data.fidelity.hardRegions[0];
  const node = findBestNodeForRegion(data.root, region);
  assert.equal(node.attributes.id, "htfy-hard-0");
}

function testInjectRasterClearsChildren() {
  const data = sampleTree();
  data.assets["rasterized:hard:0:iframe"] = {
    url: "rasterized:hard:0:iframe",
    blob: { type: "image/png", base64Blob: "data:image/png;base64,aaa" },
  };
  injectHardRegionRasters(data);
  const iframe = data.root.childNodes[0];
  assert.equal(iframe.placeholderUrl, "rasterized:hard:0:iframe");
  assert.equal(iframe.childNodes.length, 0);
  assert.equal(data.fidelity.rastersInjected, 1);
}

function testStructuralStyles() {
  const data = sampleTree();
  applyStructuralStyles(data, {
    flattenColor: (v) => (v.startsWith("oklch") ? "rgb(19, 78, 74)" : v),
  });
  assert.equal(data.root.name, "div#fixture-root");
  assert.ok(data.root.styles.backgroundLayers?.length);
  assert.equal(data.root.styles["font-family"], "Georgia, serif");
  assert.equal(data.root.styles.color, "rgb(19, 78, 74)");
  assert.equal(data.fidelity.structuralStylesApplied, true);
}

async function testRoundTripSnapshot() {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  let data = sampleTree();
  data.assets["rasterized:hard:0:iframe"] = {
    url: "rasterized:hard:0:iframe",
    blob: { type: "image/png", base64Blob: "data:image/png;base64,aaa" },
  };
  data = injectHardRegionRasters(data);
  data = applyStructuralStyles(data);
  const summary = summarizeTree(data);
  assert.equal(summary.rasters, 1);
  assert.ok(summary.named >= 1);
  assert.ok(summary.withBgLayers >= 1);

  const html = await encodeFigh2dHtml(data);
  const decoded = decodeFigh2dHtml(html);
  assert.equal(decoded.root.childNodes[0].placeholderUrl, "rasterized:hard:0:iframe");

  const snapshotPath = join(SNAPSHOT_DIR, "phase-a-summary.json");
  const payload = {
    summary,
    phaseA: {
      rastersInjected: decoded.fidelity?.rastersInjected,
      hasBackgroundLayers: !!decoded.root.styles?.backgroundLayers,
      rootHasInheritedFont: decoded.root.styles?.["font-family"] === "Georgia, serif",
    },
  };
  writeFileSync(snapshotPath, JSON.stringify(payload, null, 2));

  // Stable contract checks (visual pixel diff needs browser; structural is CI-safe)
  const expected = {
    rasters: 1,
    withBgLayersMin: 1,
    rootHasInheritedFont: true,
  };
  assert.equal(summary.rasters, expected.rasters);
  assert.ok(summary.withBgLayers >= expected.withBgLayersMin);
  assert.equal(payload.phaseA.rootHasInheritedFont, expected.rootHasInheritedFont);
}

function testFixtureStillPresent() {
  const html = readFileSync(join(__dirname, "../fixtures/fidelity-fixture.html"), "utf8");
  assert.match(html, /backdrop-filter|linear-gradient|dropdown/);
}

testFindByElementId();
testInjectRasterClearsChildren();
testStructuralStyles();
await testRoundTripSnapshot();
testFixtureStillPresent();
console.log("phase-a-regression: ok");
