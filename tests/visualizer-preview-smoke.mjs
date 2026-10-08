import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultState, MUSIC_BAR_VISUALIZER_TYPES, normalizeVisualizerType, VISUALIZER_BLEND_MODES } from "../src/content/state.js";
import { removeStyleProperty, setDatasetValue, setStyleProperty } from "../src/content/core.js";

const source = readFileSync(new URL("../src/content/runtime/runtime-shell.js", import.meta.url), "utf8");
const body = source.match(/r\.\$syncMusicBarVisualizer = function syncMusicBarVisualizer\(\) \{([\s\S]*?)\n    \};/)[1];
const state = { ...defaultState, musicBarVisualizer: "spectrum", musicBarVisualizerType: "spectrum" };
const declaration = () => {
  const values = new Map();
  return {
    getPropertyValue: (key) => values.get(key) || "",
    setProperty: (key, value) => values.set(key, value),
    removeProperty: (key) => values.delete(key)
  };
};
const element = () => ({ dataset: {}, style: declaration() });
const r = { $player: element(), $panel: element(), $playerVisualizer: element(), $syncMusicBarSize() {} };
const sync = new Function("r", "runtimeState", "normalizeVisualizerType", "VISUALIZER_BLEND_MODES",
  "setDatasetValue", "setStyleProperty", "removeStyleProperty", body);
const apply = () => sync(r, state, normalizeVisualizerType, VISUALIZER_BLEND_MODES,
  setDatasetValue, setStyleProperty, removeStyleProperty);
for (const type of MUSIC_BAR_VISUALIZER_TYPES) {
  r.$visualizerPreviewType = type;
  apply();
  assert.equal(r.$player.dataset.visualizer, type);
  assert.equal(r.$panel.dataset.visualizer, type);
  assert.equal(state.musicBarVisualizerType, "spectrum", "Preview must not change persisted selection");
  assert.equal(state.musicBarVisualizer, "spectrum");
}
r.$visualizerPreviewType = null;
apply();
assert.equal(r.$player.dataset.visualizer, "spectrum", "Cancel restores selection");
r.$visualizerPreviewType = "grass";
state.musicBarVisualizerType = "grass";
state.musicBarVisualizer = "grass";
apply();
r.$visualizerPreviewType = null;
apply();
assert.equal(r.$player.dataset.visualizer, "grass", "Commit survives preview cleanup");
state.musicBarVisualizer = "off";
r.$visualizerPreviewType = "rain";
apply();
assert.equal(r.$player.dataset.visualizer, "off", "Preview respects disabled visualiser");
console.log("Visualizer style preview, cancellation, commit and disabled-state checks passed.");
