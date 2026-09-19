import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultState, VISUALIZER_BLEND_MODES } from "../src/content/state.js";

assert.equal(defaultState.musicBarVisualizerBlendMode, "normal");
assert.equal(VISUALIZER_BLEND_MODES[0], "normal");
assert.ok(!VISUALIZER_BLEND_MODES.includes("auto"));
for (const file of ["runtime/lifecycle.js", "runtime/runtime-shell.js", "music-bar-settings.js"]) {
  const source = readFileSync(new URL(`../src/content/${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /\?\s*(?:incoming|runtimeState)\.musicBarVisualizerBlendMode\s*:\s*"auto"/);
  assert.match(source, /\?\s*(?:incoming|runtimeState)\.musicBarVisualizerBlendMode\s*:\s*"normal"/);
}
console.log("Visualizer Normal default and legacy Auto fallback passed.");
