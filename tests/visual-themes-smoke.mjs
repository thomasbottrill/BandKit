import assert from "node:assert/strict";
import { defaultState, BUILT_IN_THEMES } from "../src/content/state.js";
import { applyVisualTheme, captureVisualTheme, DEFAULT_VISUAL_THEME, VISUAL_THEMES, visualThemeMatches } from "../src/content/visual-themes.js";

assert.equal(DEFAULT_VISUAL_THEME.id, "dynamic");
assert.equal(DEFAULT_VISUAL_THEME.label, "Dynamic");

assert.equal(VISUAL_THEMES.length, 12);
assert.equal(new Set(VISUAL_THEMES.map(theme => theme.label)).size, VISUAL_THEMES.length,
  "Every visual theme needs a distinct label");
assert.ok(VISUAL_THEMES.every(theme => !BUILT_IN_THEMES.some(palette => palette.label === theme.label)));
assert.equal(new Set(VISUAL_THEMES.map(theme => JSON.stringify(theme.settings))).size, VISUAL_THEMES.length,
  "No two visual themes may resolve to the same settings");
const burrow = VISUAL_THEMES.find(theme => theme.id === "burrow");
assert.equal(burrow?.settings.musicBarVisualizerType, "spectrum",
  "Burrow must use the Spectrum visualizer");
for (const theme of VISUAL_THEMES) {
  const state = structuredClone(defaultState);
  Object.assign(state, { autoAnalyzeTracks: false, djToolsEnabled: false, openHomeToFeed: true,
    playlist: [{ id: "keep-me" }], musicBarRecentPanel: "cart", musicBarBottomOffset: 48,
    layout: { x: 12 }, settingsSubView: "themes" });
  Object.assign(state.appearance, { hideBandcampPlayer: false, modernReleasePages: false,
    savedThemes: [{ id: "my-palette" }], visualThemes: [{ id: "my-theme" }], customThemeEditorMode: "advanced" });
  const before = structuredClone(state);
  assert.equal(applyVisualTheme(state, theme), true);
  assert.equal(visualThemeMatches(state, theme), true, theme.label);
  for (const key of ["autoAnalyzeTracks", "djToolsEnabled", "openHomeToFeed", "playlist", "musicBarRecentPanel", "musicBarBottomOffset", "layout", "settingsSubView"]) {
    assert.deepEqual(state[key], before[key], `${theme.label} must preserve ${key}`);
  }
  for (const key of ["hideBandcampPlayer", "modernReleasePages", "savedThemes", "visualThemes", "customThemeEditorMode"]) {
    assert.deepEqual(state.appearance[key], before.appearance[key]);
  }
  state.scrubberHandleSize = 145;
  assert.equal(visualThemeMatches(state, theme), false);
  const saved = JSON.parse(JSON.stringify(captureVisualTheme(state)));
  const restored = structuredClone(defaultState);
  applyVisualTheme(restored, saved);
  assert.equal(restored.scrubberHandleSize, 145);
  assert.deepEqual(captureVisualTheme(restored), saved);
}
const custom = structuredClone(defaultState);
custom.customScrubberHandle = { name: "My handle", svg: "<svg/>" };
custom.customTimeline = { name: "My timeline", svg: "<svg/>" };
custom.customPlayerButtons = { play: { name: "My play", svg: "<svg/>" } };
custom.musicBarHandleColor = "#ff0000";
const saved = captureVisualTheme(custom);
const restored = structuredClone(defaultState);
applyVisualTheme(restored, saved);
assert.deepEqual(restored.customScrubberHandle, custom.customScrubberHandle);
assert.deepEqual(restored.customTimeline, custom.customTimeline);
assert.deepEqual(restored.customPlayerButtons, custom.customPlayerButtons);
assert.equal(restored.musicBarHandleColor, "#ff0000");
const reordered = structuredClone(saved);
reordered.settings.customPlayerButtons = { play: { svg: "<svg/>", name: "My play" } };
assert.equal(visualThemeMatches(restored, reordered), true, "Storage key order must not mark a saved theme modified");
restored.customScrubberHandle.name = "Changed";
assert.equal(saved.settings.customScrubberHandle.name, "My handle");
// Legacy saved colour themes remain palettes, and full themes survive their deletion.
custom.appearance.savedThemes = [{ ...BUILT_IN_THEMES[3], id: "saved-legacy", label: "Personal" }];
custom.appearance.preset = "saved-legacy";
const portable = captureVisualTheme(custom);
custom.appearance.savedThemes = [];
applyVisualTheme(custom, portable);
assert.equal(custom.appearance.preset, "custom");
assert.equal(custom.appearance.customAccent, BUILT_IN_THEMES[3].accent);
// Unknown configuration fields are never applied, even if a stored object contains them.
applyVisualTheme(restored, { ...saved, settings: { ...saved.settings, djToolsEnabled: false }, appearance: { ...saved.appearance, hidePageCart: false } });
assert.equal(restored.djToolsEnabled, defaultState.djToolsEnabled);
assert.equal(restored.appearance.hidePageCart, defaultState.appearance.hidePageCart);
console.log(`Visual themes: ${VISUAL_THEMES.length} distinct presets, visual-only scope, assets, modified state and round-trip persistence passed.`);
