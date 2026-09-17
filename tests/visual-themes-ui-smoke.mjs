import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { defaultState } from "../src/content/state.js";
import { applyVisualTheme, captureVisualTheme, DEFAULT_VISUAL_THEME, MAX_VISUAL_THEMES, savedVisualThemes, VISUAL_APPEARANCE_KEYS, VISUAL_SETTING_KEYS, VISUAL_THEMES, visualThemeMatches } from "../src/content/visual-themes.js";

const source = fs.readFileSync(new URL("../src/content/runtime/visual-theme-settings.js", import.meta.url), "utf8");
const runtimeState = structuredClone(defaultState);
const original = captureVisualTheme(runtimeState);
const pickers = [];
let updates = 0, saves = 0;
const r = { $render() {}, $showToast() {} };
const context = vm.createContext({
  runtimeState, structuredClone, Object,
  applyVisualTheme, captureVisualTheme, DEFAULT_VISUAL_THEME, MAX_VISUAL_THEMES, savedVisualThemes, VISUAL_APPEARANCE_KEYS, VISUAL_SETTING_KEYS, VISUAL_THEMES, visualThemeMatches,
  createSettingsDisclosure: () => ({ content: { append() {} }, group: {} }),
  createSettingsPicker: options => { pickers.push(options); return { element: {} }; },
  createSettingsRow: () => ({}), createSettingsRowCopy: () => ({}),
  appendThemeBreakdown() {}, appendThemeActions() {}, themePreview() {}, appendSavedThemeManagement() {},
  syncVisualTheme: () => updates++, runtimeSaveState: () => saves++
});
vm.runInContext(source.slice(source.indexOf("export function createVisualThemeSettings")).replace("export function", "function"), context);
context.createVisualThemeSettings(r);
const picker = pickers.find(item => item.ariaLabel === "Visual theme");
assert.ok(picker, "The full visual-theme picker must be rendered");
assert.equal(picker.options[0].value, "current", "Custom must be the first full-theme option");
assert.equal(picker.options[0].label, "Custom", "The current unsaved look is called Custom");
for (const label of ["Theme colours", "Theme player", "Theme surface", "Theme corners", "Theme timeline", "Theme handle", "Theme visualiser", "Theme player size"])
  assert.match(source, new RegExp(`ariaLabel: ["']${label}["']`), `${label} must be directly editable in Themes`);
assert.match(source, /createSettingsDisclosure\("Advanced", "", "visual-theme-advanced"\)/,
  "Secondary theme controls must use the Advanced disclosure");
assert.match(source, /onPreview:\s*colourPreview\.preview[\s\S]*?onPreview:\s*timelinePreview\.preview[\s\S]*?onPreview:\s*visualizerPreview\.preview/,
  "Colour, timeline, and visualiser choices must preview on hover and keyboard focus");
assert.match(source, /\["Colours", "colours", colourPicker\][\s\S]*?\["Surface", "design", surfacePicker\][\s\S]*?createSettingsDisclosure\("Advanced"[\s\S]*?\["Corners", "design", cornerPicker\][\s\S]*?\["Visualiser", "visualiser", visualizerPicker\]/,
  "Only colours, player, and surface remain above Advanced");
assert.match(source, /createButtonIcon\("icon-open\.svg"\)/,
  "Theme editor shortcuts must use the shared Lucide arrow icon");
assert.match(source, /menuClassName:\s*"hub-theme-options"[\s\S]*?optionClassName:\s*"hub-theme-option"/,
  "Theme colours must reuse the curated palette menu");
assert.match(source, /ariaLabel:\s*"Theme timeline", className:\s*"hub-visual-theme-basic-picker hub-timeline-picker"/,
  "Theme timelines must reuse the dedicated timeline picker modal");
assert.match(source, /ariaLabel:\s*"Theme visualiser", className:\s*"hub-visual-theme-basic-picker hub-visualizer-type"/,
  "Theme visualisers must reuse the dedicated visualiser picker modal");
assert.match(source, /link\.dataset\.settingsTooltip = `Open full \$\{label\.toLowerCase\(\)\} settings`/,
  "Theme editor arrows must use Bandkit's portalled tooltips");
assert.doesNotMatch(source, /link\.title\s*=/,
  "Theme editor arrows must not invoke Chrome's native tooltip");
assert.match(source, /Open full \$\{label\.toLowerCase\(\)\} settings/,
  "Each basic theme row must expose an accessible full-editor shortcut");
picker.onPreview("clarity");
assert.equal(visualThemeMatches(runtimeState, VISUAL_THEMES[0]), true);
picker.onPreview("clarity");
assert.equal(updates, 1, "Pointer and focus on the same option must not apply the theme twice");
runtimeState.djToolsEnabled = false;
const backgroundSave = structuredClone(runtimeState);
r.$restoreVisualThemeForSave(backgroundSave);
assert.deepEqual(captureVisualTheme(backgroundSave), original, "Background saves must preserve the committed look while previewing");
assert.equal(backgroundSave.djToolsEnabled, false, "Background saves must retain unrelated changes");
picker.onPreview("night-drive");
assert.equal(updates, 2, "Moving between full previews should not restore and reapply every setting");
picker.onPreview(null);
assert.deepEqual(captureVisualTheme(runtimeState), original, "Escape and pointer leave must restore the original visuals");
assert.equal(saves, 0, "Previewing never saves a selection");
picker.onPreview("orbit");
picker.onChange("orbit");
picker.onPreview(null);
assert.equal(runtimeState.appearance.visualThemeId, "orbit");
assert.equal(visualThemeMatches(runtimeState, VISUAL_THEMES.find(theme => theme.id === "orbit")), true);
assert.equal(saves, 1, "Selecting a theme commits exactly once");
picker.onPreview("clarity");
r.$restoreVisualThemePreview();
assert.equal(visualThemeMatches(runtimeState, VISUAL_THEMES.find(theme => theme.id === "orbit")), true,
  "Re-rendering or leaving settings must clear a temporary preview");
console.log("Visual theme UI: preview, cancellation, commit, deduplication and background-save isolation passed.");
