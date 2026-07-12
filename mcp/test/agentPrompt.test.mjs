import { buildStrictAgentPrompt } from "../dist/agentPrompt.js";
import assert from "node:assert/strict";
import { test } from "node:test";

test("buildStrictAgentPrompt includes aliases and forbids guessing", () => {
  const prompt = buildStrictAgentPrompt({
    framework: "next",
    selector: "header",
    sectionName: "Header",
    screenshotPath: "/tmp/default.png",
    specs: {
      aliases: {
        navPaddingX: "20px",
        menuGap: "40px",
        ctaPrimaryBg: "rgb(45, 122, 98)",
      },
      rules: ["MUST use layoutSpec", "Do NOT invent spacing"],
    },
    designSystem: {
      brand: { primaryFont: "Suisse Int'l", primaryAction: "#5a7b6c" },
      colors: { textPrimary: "#3c3a39", surface: "#fffcf6", primary: "#5a7b6c" },
      buttons: [{ role: "primary", background: "#5a7b6c" }],
      interaction: { hoverRules: [{ selector: "a:hover" }] },
    },
    fidelityNotes: ["agent_specs_v2"],
  });

  assert.match(prompt, /navPaddingX: 20px/);
  assert.match(prompt, /ctaPrimaryBg/);
  assert.match(prompt, /Do NOT invent/);
  assert.match(prompt, /SOURCE OF TRUTH/);
  assert.match(prompt, /DESIGN SYSTEM/);
  assert.match(prompt, /primaryAction: #5a7b6c/);
  assert.match(prompt, /hoverRules: 1/);
  assert.match(prompt, /\/tmp\/default\.png/);
});

test("buildStrictAgentPrompt handles missing aliases", () => {
  const prompt = buildStrictAgentPrompt({
    selector: "header",
    specs: { aliases: {} },
  });
  assert.match(prompt, /none — call out missing data/);
});
