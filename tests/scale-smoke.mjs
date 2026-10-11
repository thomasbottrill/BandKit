import assert from "node:assert/strict";
import { defaultState } from "../src/content/state.js";
import { normalizeAppearanceScales, normalizeScale, resolvePageScale, interfaceScale, scalePercent, scaleRect } from "../src/content/scale.js";
import { readFile } from "node:fs/promises";
import { applyVisualTheme, captureVisualTheme, VISUAL_THEMES } from "../src/content/visual-themes.js";

const appearance = structuredClone(defaultState.appearance);
assert.equal(resolvePageScale(appearance, "release"), 1, "Existing installations retain their page size");
assert.equal(interfaceScale(appearance), 1);
appearance.pageScale = { preset: "custom", custom: 90, overrides: { release: 80, community: 115 } };
assert.equal(resolvePageScale(appearance, "release"), 0.9, "Per-page controls stay inactive until their master switch is on");
appearance.pageScale.adjustByPage = true;
assert.equal(resolvePageScale(appearance, "release"), 0.8);
assert.equal(resolvePageScale(appearance, "feed"), 0.9);
assert.equal(resolvePageScale(appearance, "community"), 1.15);
for (const type of ["music", "merch", "video", "subscribe"]) assert.equal(resolvePageScale(appearance, type), 0.9);
appearance.pageScale.overrides.artist = 95;
assert.equal(resolvePageScale(appearance, "music"), 0.95);
for (const type of ["", "discover", "home", "collection", "checkout"]) assert.equal(resolvePageScale(appearance, type), 1);
appearance.modernReleasePages = false;
assert.equal(resolvePageScale(appearance, "release"), 1, "Disabling modern pages restores the native size");
appearance.modernReleasePages = true;
appearance.pageScale.preset = "normal";
assert.equal(resolvePageScale(appearance, "release"), 1, "Presets suspend custom overrides");
appearance.pageScale.preset = "custom";
assert.equal(resolvePageScale(appearance, "release"), 0.8, "Returning to custom restores saved overrides");
appearance.interfaceScale = { preset: "larger", custom: 130 };
assert.equal(interfaceScale(appearance), 1.15);
assert.equal(resolvePageScale(appearance, "release"), 0.8, "Interface scale does not compound page scale");
appearance.interfaceScale.preset = "custom";
assert.equal(interfaceScale(appearance), 1.3);
for (const invalid of [undefined, null, "", NaN, Infinity, {}, [], false]) assert.equal(scalePercent(invalid), 100);
assert.equal(scalePercent(-100), 75);
assert.equal(scalePercent(9000), 150);
assert.equal(scalePercent("87"), 87);
assert.deepEqual(normalizeScale({ preset: "unknown", custom: "bad", overrides: { release: "bad", feed: 0, unknown: 85 } }, true), {
  preset: "normal", custom: 100, adjustByPage: false, overrides: { release: null, feed: 75, community: null, artist: null }
});
const storageOrder = value => value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, storageOrder(value[key])])) : value;
const migratedScales = { pageScale: { preset: "custom", custom: "90", overrides: { release: 80 } } };
assert.equal(normalizeAppearanceScales(migratedScales), true, "Missing and invalid scale settings still need a one-time migration");
assert.equal(migratedScales.pageScale.custom, 90);
assert.equal(migratedScales.pageScale.overrides.release, 80);
assert.equal(normalizeAppearanceScales(migratedScales), false, "Normalization must settle after the migration");
for (let roundTrip = 0; roundTrip < 10; roundTrip++) {
  const received = storageOrder(migratedScales);
  assert.equal(normalizeAppearanceScales(received), false,
    "Receiving reordered scale objects from another tab must never request another storage write");
  assert.deepEqual(received, migratedScales);
}
migratedScales.pageScale.overrides.feed = 900;
assert.equal(normalizeAppearanceScales(migratedScales), true, "A real out-of-range override must still be repaired");
assert.equal(migratedScales.pageScale.overrides.feed, 150);
const state = { ...structuredClone(defaultState), appearance };
const preferences = structuredClone([appearance.pageScale, appearance.interfaceScale]);
applyVisualTheme(state, VISUAL_THEMES[0]);
assert.deepEqual([state.appearance.pageScale, state.appearance.interfaceScale], preferences, "Applying a theme preserves viewing preferences");
assert.equal("pageScale" in captureVisualTheme(state).appearance, false, "Shared themes do not carry personal scaling");
assert.equal("interfaceScale" in captureVisualTheme(state).appearance, false);

const [scaleSettingsSource, scrubControlSource, themeSettingsSource, overviewSource] = await Promise.all([
  readFile(new URL("../src/content/runtime/scale-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/music-bar-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/visual-theme-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/settings-overview.js", import.meta.url), "utf8")
]);
assert.match(scaleSettingsSource, /createScaleSettingsSection[\s\S]*?createSettingsDisclosure\("Scale"[\s\S]*?createScaleSettings\(r\), createScaleSettings\(r, \{ pages: false \}\)/,
  "Appearance must group page and interface scaling in one Scale destination");
assert.doesNotMatch(themeSettingsSource, /createScaleSettings/,
  "Viewing scale must stay outside visual themes");
assert.match(overviewSource, /appearance\.prepend\(createVisualThemeSettings\(r\), createScaleSettingsSection\(r\)\)/,
  "Scale must appear as its own Appearance section after Themes");
assert.match(scaleSettingsSource, /createSettingsToggle\(\{ checked: getScale\(\)\.adjustByPage, ariaLabel: "Adjust scale by page type" \}\)[\s\S]*?defaultControl\.setDisabled\(on\)/,
  "Per-page scaling must use one master switch and disable the default control while active");
assert.match(scaleSettingsSource, /createSettingsAction\("Reset"[\s\S]*?getScale\(\)\.overrides\[key\] = null/,
  "Per-page scaling must offer a reset to the default scale");
assert.match(scaleSettingsSource, /createSettingsActionRow\(\{[\s\S]*?label: "Page scales"[\s\S]*?createSettingsActions\("hub-scale-page-actions", reset\)/,
  "The page-scale reset must use the shared inline settings action row");
assert.match(scrubControlSource, /control\.setDisabled = \(disabled\)[\s\S]*?input\.disabled = Boolean\(disabled\)/,
  "The text scrub control must expose a real disabled state");
const rect = scaleRect({ left: 150, right: 780, top: 90, bottom: 990, width: 630, height: 900, x: 150, y: 90 }, 1.5);
assert.equal(rect.width, 420);
assert.equal(rect.left, 100);
assert.equal(rect.bottom, 660);
assert.equal(scaleRect(null, 1.5), null);
console.log("Independent page/interface scaling, overrides, normalization, theme isolation and local geometry passed.");
