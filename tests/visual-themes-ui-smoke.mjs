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
assert.equal(picker.value, "dynamic", "Bandkit's adaptive default must be presented as the Dynamic theme");
assert.equal(picker.options[0].value, "dynamic", "An unchanged theme must not show a redundant Custom option");
assert.equal(DEFAULT_VISUAL_THEME.label, "Dynamic");
assert.match(source, /const options = unchanged \? selectable : \[current, \.\.\.selectable\]/,
  "Custom must appear only after the selected theme has been modified");
assert.match(source, /Custom theme based on \$\{active\.label\}/,
  "A modified theme must identify the preset it is based on");
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
// A preview reflows the music bar under the open panel, so the panel has to be
// pinned for the duration or browsing themes slides it across the screen.
assert.match(source, /previewId = id;[\s\S]*?r\.\$holdPanelPosition\?\.\(\)[\s\S]*?applyVisualTheme\(runtimeState, selectable\.find/,
  "a theme preview must pin the panel before the theme reflows the music bar");
assert.match(source, /const restore = \(\) => \{[\s\S]*?r\.\$releasePanelPositionHold\?\.\(\)/,
  "leaving a preview must release the panel back to its live anchor");
assert.match(source, /syncVisualTheme\(r\);[\s\S]*?r\.\$releasePanelPositionHold\?\.\(\)/,
  "committing a theme must release the hold once the new look is in place");
assert.match(source, /function createThemeOptionPreview\(r, applyValue\)[\s\S]*?r\.\$holdPanelPosition\?\.\(\)[\s\S]*?applyValue\(value\)/,
  "individual theme options must pin the panel while previewing too");
assert.match(source, /function createThemeOptionPreview[\s\S]*?commit\(value, message\)[\s\S]*?r\.\$releasePanelPositionHold\?\.\(\)/,
  "committing an individual theme option must release the panel");
const playerShell = fs.readFileSync(new URL("../src/content/runtime/player-shell.js", import.meta.url), "utf8");
const baseStyles = fs.readFileSync(new URL("../src/styles/hub/base.css", import.meta.url), "utf8");
assert.match(playerShell, /function holdPanelPosition\(\)[\s\S]*?--hub-panel-hold-left[\s\S]*?--hub-panel-hold-bottom[\s\S]*?data-panel-position-hold/,
  "holding the panel must capture where it currently sits");
assert.match(baseStyles, /:host\(\[data-panel-position-hold\]\) \.hub-panel \{[\s\S]*?left: var\(--hub-panel-hold-left[^}]*?transition: none/,
  "the pinned panel must ignore the reflowed geometry and any position transition");

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
runtimeState.appearance.visualizerColourSource = "custom";
runtimeState.appearance.customVisualizerColor1 = "#123456";
pickers.length = 0;
context.createVisualThemeSettings(r);
const modifiedPicker = pickers.find(item => item.ariaLabel === "Visual theme");
assert.equal(modifiedPicker.value, "current", "Changing one visual component must move the complete theme to Custom");
assert.equal(modifiedPicker.options[0].label, "Custom");
assert.equal(runtimeState.appearance.visualThemeId, "orbit", "Custom must retain Orbit as its reset and comparison baseline");
console.log("Visual theme UI: Dynamic baseline, Custom derivation, preview, commit and background-save isolation passed.");
