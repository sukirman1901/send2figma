import assert from "node:assert/strict";
import {
  composeFramesSideBySide,
  labelDualFrame,
  buildCaptureWarnings,
  buildFidelityReport,
} from "../extension/src/composeFrames.js";
import { encodeFigh2dHtml, decodeFigh2dHtml } from "../extension/src/fidelityPost.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function frame(label, w, h) {
  return {
    version: 2,
    documentTitle: "Page",
    root: {
      nodeType: 1,
      id: "r1",
      tag: "DIV",
      name: "Page",
      attributes: {},
      styles: { backgroundColor: "#fff" },
      rect: { x: 0, y: 0, width: w, height: h },
      childNodes: [],
    },
    assets: {
      [`img-${label}`]: {
        url: `img-${label}`,
        blob: { type: "image/png", base64Blob: "data:image/png;base64,xx" },
      },
    },
    fonts: {},
    fidelity: { treeSummary: { elements: 1, texts: 0, rasters: 0, named: 1, withBgLayers: 0 } },
  };
}

function testLabelDualFrame() {
  const labeled = labelDualFrame(frame("x", 300, 400), "Closed");
  assert.equal(labeled.documentTitle, "Closed");
  assert.equal(labeled.root.name, "Closed");
  assert.equal(labeled.fidelity.dualFrame, true);
  assert.equal(labeled.fidelity.dualFramePart, "Closed");
}

function testCompose() {
  const composed = composeFramesSideBySide([
    { data: frame("Closed", 300, 400), label: "Closed" },
    { data: frame("Open", 320, 420), label: "Open" },
  ]);
  assert.equal(composed.fidelity.dualFrame, true);
  assert.equal(composed.root.childNodes.length, 2);
  assert.ok(composed.root.rect.width >= 300 + 48 + 320);
  assert.ok(composed.assets["img-Closed"]);
  assert.ok(composed.assets["img-Open"]);
  assert.equal(composed.root.childNodes[0].name, "Closed");
  assert.equal(composed.root.childNodes[1].name, "Open");
}

async function testComposeRoundTrip() {
  const composed = composeFramesSideBySide([
    { data: frame("A", 100, 100), label: "A" },
    { data: frame("B", 100, 100), label: "B" },
  ]);
  const html = await encodeFigh2dHtml(composed);
  const decoded = decodeFigh2dHtml(html);
  assert.equal(decoded.fidelity.dualFrame, true);
  assert.equal(decoded.root.childNodes.length, 2);
}

function testWarnings() {
  const w = buildCaptureWarnings({
    assets: { a: { url: "a", blob: null }, b: { url: "b", blob: { base64Blob: "x" } } },
    fidelity: {
      fontFaces: [{ familyName: "X", urls: [] }],
      rastersInjected: 2,
      forceOpen: true,
      treeSummary: { elements: 10, texts: 3, rasters: 2 },
    },
  });
  assert.ok(w.some((x) => /image asset/i.test(x)));
  assert.ok(w.some((x) => /font/i.test(x)));
  assert.ok(w.some((x) => /raster/i.test(x)));
  assert.ok(w.some((x) => /force-expanded/i.test(x)));
  assert.ok(w.some((x) => /80% editable|Layers:/i.test(x)));
  assert.ok(!w.some((x) => /Dual frame/i.test(x)));
}

function testFidelityReport() {
  const report = buildFidelityReport({
    fidelity: {
      qualityMode: "exact",
      rastersInjected: 2,
      treeSummary: { elements: 10, texts: 3, rasters: 2 },
      hardRegions: [
        { kind: "filter", docX: 10, docY: 20, width: 40, height: 40 },
        { kind: "canvas", docX: 50, docY: 60, width: 80, height: 80 },
      ],
    },
  });
  assert.equal(report.editablePct, 80);
  assert.equal(report.qualityMode, "exact");
  assert.equal(report.rasters, 2);
  assert.equal(report.byKind.filter, 1);
  assert.equal(report.byKind.canvas, 1);
  assert.equal(report.regions.length, 2);
  assert.match(report.label, /80% editable/);
}

function testUiSurfaces() {
  const html = readFileSync(join(__dirname, "../extension/ui/panel.js"), "utf8");
  assert.match(html, /qualityModeExact/);
  assert.match(html, /previewToggle/);
  assert.match(html, /previewPanel/);
  assert.match(html, /htfy_CONFIRM_COPY/);
  assert.doesNotMatch(html, /dualFrameToggle/);
  assert.doesNotMatch(html, /dualFramePart/);
  assert.match(html, /fidelityReport|fidelityWhyBtn|highlightRastersBtn/);
  assert.match(html, /showFidelityReport|highlightRastersOnPage/);
  const boot = readFileSync(join(__dirname, "../extension/ui/panel-boot.js"), "utf8");
  assert.match(boot, /htfyRoot/);
  assert.match(boot, /__htfyTogglePanel/);
  assert.match(html, /htfy-dock/);
  assert.match(html, /data-action=\"screenshot\"|htfy_SCREENSHOT|data-shot/);
  const bg = readFileSync(join(__dirname, "../extension/background.js"), "utf8");
  assert.match(bg, /reicon-inline\.js/);
  assert.match(bg, /buildFidelityReport/);
  assert.doesNotMatch(bg, /labelDualFrame/);
  assert.doesNotMatch(bg, /dualFramePart/);
  assert.match(bg, /htfy_CONFIRM_COPY/);
  assert.match(bg, /action\.onClicked/);
  assert.match(bg, /htfy_START_PICKER/);
  assert.match(bg, /htfy_SCREENSHOT/);
  assert.match(bg, /getLayoutMetrics/);
  assert.match(bg, /setDeviceMetricsOverride/);
  assert.match(bg, /captureFullPageByStitch|captureFullPageViaCdp/);
  assert.match(readFileSync(join(__dirname, "../extension/screenshot.js"), "utf8"), /__htfyStartScreenshotRegion/);
  const manifest = JSON.parse(readFileSync(join(__dirname, "../extension/manifest.json"), "utf8"));
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(manifest.permissions?.includes("downloads"));
  assert.ok(manifest.web_accessible_resources?.length);
  const css = readFileSync(join(__dirname, "../extension/ui/panel.css"), "utf8");
  assert.match(css, /89fe65/);
  assert.match(css, /htfy-dock/);
  assert.match(css, /fidelity-report|fidelity-meter/);
}

testLabelDualFrame();
testCompose();
await testComposeRoundTrip();
testWarnings();
testFidelityReport();
testUiSurfaces();
console.log("phase-b-regression: ok");
