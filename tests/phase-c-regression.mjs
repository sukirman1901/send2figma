/**
 * Phase C regression: design system apply/export + surfaces.
 * Run: node tests/phase-c-regression.mjs
 */
import assert from "node:assert/strict";
import { applyComponentNames, buildDesignSystemExport, summarizeDesignSystem, toDesignSystemJsonPayload } from "../src/designSystem.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function sample() {
  return {
    documentTitle: "Fixture",
    root: {
      nodeType: 1,
      id: "root",
      tag: "DIV",
      attributes: {},
      styles: {},
      childNodes: [
        {
          nodeType: 1,
          id: "n1",
          tag: "BUTTON",
          attributes: { id: "htfy-comp-0-0" },
          styles: {},
          childNodes: [],
        },
        {
          nodeType: 1,
          id: "n2",
          tag: "BUTTON",
          attributes: { id: "htfy-comp-0-1" },
          styles: {},
          childNodes: [],
        },
      ],
    },
    fidelity: {
      designTokens: {
        colors: [{ value: "rgb(15, 118, 110)", count: 4, token: "color/green-1" }],
        fonts: [{ value: "Inter", count: 10, token: "font/inter" }],
        fontSizes: [{ value: "14px", count: 5, token: "fontSize/14px" }],
        radii: [{ value: "8px", count: 3, token: "radius/8px" }],
        spaces: [{ value: "16px", count: 6, token: "space/16px" }],
        components: [
          {
            name: "Component/Button-1",
            count: 2,
            elementIds: ["htfy-comp-0-0", "htfy-comp-0-1"],
            className: "btn",
          },
        ],
      },
    },
  };
}

function testApplyNames() {
  const data = sample();
  applyComponentNames(data);
  assert.equal(data.root.childNodes[0].name, "Component/Button-1");
  assert.equal(data.root.childNodes[1].componentHint, "Component/Button-1");
  assert.equal(data.fidelity.componentsNamed, 2);
}

function testExport() {
  const data = sample();
  const exp = buildDesignSystemExport(data);
  assert.equal(exp.version, 3);
  assert.equal(exp.format, "design-system-ai-rulebook");
  assert.equal(exp.tokens.colors[0].token, "color/green-1");
  assert.equal(exp.components[0].name, "Component/Button-1");
  assert.match(exp.markdown, /# Fixture — Design System/);
  assert.match(exp.markdown, /Token hierarchy/);
  assert.match(exp.markdown, /Foundation — Colors/);
  assert.match(exp.markdown, /Semantic — Colors/);
  assert.match(exp.markdown, /How to use this file \(for AI\)/);
  assert.match(exp.markdown, /Rules — Do/);
  const sum = summarizeDesignSystem(data.fidelity.designTokens);
  assert.equal(sum.colors, 1);
  assert.equal(sum.components, 1);

  const json = toDesignSystemJsonPayload(exp);
  assert.equal(json.version, 3);
  assert.equal(json.source, "Fixture");
  assert.ok(json.exportedAt);
  assert.equal(json.tokens.colors[0].token, "color/green-1");
  assert.equal(json.components[0].name, "Component/Button-1");
  assert.equal("markdown" in json, false);
  assert.equal("format" in json, false);
}

function testSurfaces() {
  assert.match(readFileSync(join(__dirname, "../designSystemCapture.js"), "utf8"), /extractDesignSystem/);
  assert.match(readFileSync(join(__dirname, "../background.js"), "utf8"), /htfy_EXTRACT_DESIGN_SYSTEM/);
  assert.match(readFileSync(join(__dirname, "../ui/panel.js"), "utf8"), /extractDesignSystemFromPage|Extract from page/);
  assert.match(readFileSync(join(__dirname, "../ui/panel.js"), "utf8"), /downloadDesignSystemJson|Export \.json/);
  assert.match(readFileSync(join(__dirname, "../ui/panel.js"), "utf8"), /downloadDesignSystemMd|Export \.md/);
  assert.match(readFileSync(join(__dirname, "../designSystemCapture.js"), "utf8"), /extractDesignSystem/);
  assert.match(readFileSync(join(__dirname, "../src/designSystemMd.js"), "utf8"), /Token hierarchy/);
  assert.match(readFileSync(join(__dirname, "../designSystemCapture.js"), "utf8"), /harvestCssVariables|fontFamilies/);
  assert.match(readFileSync(join(__dirname, "../figma-plugin/code.js"), "utf8"), /JSON has no tokens/);
  assert.match(readFileSync(join(__dirname, "../src/fidelityPost.js"), "utf8"), /extractDesignTokensLive/);
  assert.match(readFileSync(join(__dirname, "../src/fidelityPost.js"), "utf8"), /applyComponentNames/);
}

testApplyNames();
testExport();
testSurfaces();
console.log("phase-c-regression: ok");
