import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { visualizerLayerAlpha } from "../src/content/visualizer-intensity.js";

for (const [cap, weight] of [[0.52, 0.25], [0.72, 0.36], [0.48, 0.23], [0.72, 0.38],
  [0.34, 0.14], [0.92, 0.72], [0.7, 0.42], [0.85, 0.68], [0.8, 0.58], [0.9, 0.68]]) {
  for (const strength of [0.1, 0.8, 1, 1.5, 2]) {
    assert.equal(visualizerLayerAlpha(cap, weight, strength), Math.min(cap, weight * strength),
      "Existing strengths must look exactly as before");
  }
  const levels = [2, 3, 4].map((strength) => visualizerLayerAlpha(cap, weight, strength));
  assert.ok(levels[0] <= levels[1] && levels[1] <= levels[2]);
  assert.ok(levels[2] > levels[0], "400% must visibly strengthen every style, even previously capped layers");
  assert.ok(levels[2] <= 1, "Canvas alpha must never exceed its legal range");
  assert.equal(visualizerLayerAlpha(cap, weight, 400), levels[2]);
}
const source = (path) => readFileSync(new URL(`../src/content/${path}`, import.meta.url), "utf8");
assert.match(source("state.js"), /musicBarVisualizerOpacity: 100/);
assert.match(source("music-bar-settings.js"), /ariaLabel: "Visualizer opacity",\s*defaultValue: 100,\s*max: 400/);
for (const path of ["music-bar-settings.js", "runtime/runtime-shell.js", "runtime/lifecycle.js"]) {
  assert.doesNotMatch(source(path), /Number\((?:runtimeState|incoming)\.musicBarVisualizerOpacity\) \|\| 80/);
  assert.match(source(path), /Number\((?:runtimeState|incoming)\.musicBarVisualizerOpacity\) \|\| 100/);
}
assert.match(source("runtime/runtime-shell.js"), /Math\.min\(400, Number\(runtimeState\.musicBarVisualizerOpacity\)/);
assert.match(source("runtime/player-shell.js"), /Math\.min\(4, Number\(runtimeState\.musicBarVisualizerOpacity\)/);
assert.match(source("runtime/lifecycle.js"), /Math\.min\(400, Number\(incoming\.musicBarVisualizerOpacity\)/);
assert.match(source("runtime/lifecycle.js"), /Math\.min\(400, Number\(runtimeState\.musicBarVisualizerOpacity\)/);
console.log("Visualizer 400% intensity and persistence limits passed.");
