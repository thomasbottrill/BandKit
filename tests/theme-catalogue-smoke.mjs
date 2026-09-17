import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BUILT_IN_THEMES, THEME_COLOR_KEYS } from "../src/content/state.js";
import { contrast, hexColor } from "../src/content/color.js";

const [settingsSource, themeCss, settingsCss] = await Promise.all([
  readFile(new URL("../src/content/runtime/activity-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/hub/settings-theme.css", import.meta.url), "utf8"),
  Promise.all(["settings.css", "settings-controls.css", "settings-actions.css"].map((file) => (
    readFile(new URL(`../src/styles/hub/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n"))
]);

assert.equal(BUILT_IN_THEMES.length, 42, "Bandkit should offer the four eight-theme collections plus ten Wacky presets");
assert.deepEqual(
  [...new Set(BUILT_IN_THEMES.map((theme) => theme.group))].sort(),
  ["dark", "electric", "light", "print", "wacky"],
  "Every built-in theme should belong to a named picker collection"
);
assert.equal(BUILT_IN_THEMES.filter((theme) => theme.group === "light").length, 8);
assert.equal(BUILT_IN_THEMES.filter((theme) => theme.group === "dark").length, 8);
assert.equal(BUILT_IN_THEMES.filter((theme) => theme.group === "electric").length, 8);
assert.equal(BUILT_IN_THEMES.filter((theme) => theme.group === "print").length, 8);
assert.equal(BUILT_IN_THEMES.filter((theme) => theme.group === "wacky").length, 10);
for (const legacyId of ["studio", "midnight", "warm", "forest", "mono", "plum", "ocean"]) {
  assert.ok(BUILT_IN_THEMES.some((theme) => theme.id === legacyId), `Existing preset ${legacyId} must remain selectable`);
}
for (const stressId of ["acid-signal", "ultraviolet", "laser-cyan", "toxic-candy", "arcade-gold", "plasma-mint", "cyberpink", "infrared", "risograph", "newsprint", "blueprint", "pulp", "bauhaus", "candy-wrapper", "halftone", "thermal"]) {
  assert.ok(BUILT_IN_THEMES.some((theme) => theme.id === stressId), `Stress-test preset ${stressId} must remain selectable`);
}
for (const wackyId of ["pickle-disco", "bubblegum-rust", "wrong-aquarium", "dentists-office", "traffic-jam", "birthday-carpet", "haunted-yogurt", "office-party", "wormhole-picnic", "wet-cement-cake"]) {
  assert.ok(BUILT_IN_THEMES.some((theme) => theme.id === wackyId), `Wacky preset ${wackyId} must remain selectable`);
}
for (const theme of BUILT_IN_THEMES) {
  assert.match(theme.id, /^[a-z][a-z0-9-]*$/, `${theme.label} should have a stable preset ID`);
  assert.ok(theme.label, "Every built-in theme should have a display name");
  for (const key of [...THEME_COLOR_KEYS, "scrubAccent"]) {
    assert.match(theme[key], /^#[\da-f]{6}$/i, `${theme.label} should explicitly define ${key}`);
  }
  const surfaces = [theme.surface, theme.card, theme.background, theme.pageSurface, theme.navbar].map((colour) => hexColor(colour));
  const minimumContrast = (colour) => Math.min(...surfaces.map((surface) => contrast(hexColor(colour), surface)));
  assert.ok(minimumContrast(theme.text) >= 7, `${theme.label} primary text should meet enhanced contrast across its surfaces`);
  assert.ok(minimumContrast(theme.secondaryText) >= 4.5, `${theme.label} secondary text should meet AA contrast across its surfaces`);
  assert.ok(minimumContrast(theme.accent) >= 4.5, `${theme.label} accent should meet AA contrast across its surfaces`);
  assert.ok(contrast(hexColor(theme.scrubAccent), hexColor(theme.card)) >= 3, `${theme.label} scrubber should remain visible on its card surface`);
}
assert.equal(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size, BUILT_IN_THEMES.length, "Theme IDs must be unique");
assert.match(settingsSource, /\[\["custom", "Your colours"\], \["light", "Light"\], \["dark", "Dark"\], \["electric", "Electric"\], \["print", "Print Lab"\], \["wacky", "Wacky"\], \["saved", "Saved"\]\]/,
  "The theme picker should organize custom, light, dark, electric, print, wacky, and saved themes into named groups");
assert.match(settingsSource, /optionGroup\.setAttribute\("role", "group"\)[\s\S]*?optionGroup\.setAttribute\("aria-labelledby", groupLabel\.id\)/,
  "Theme groups should expose their labels to assistive technology");
assert.match(themeCss, /\.hub-theme-option-group-label\s*\{[\s\S]*?text-transform:\s*uppercase;/,
  "Theme group labels should have a distinct compact heading treatment");
assert.match(settingsCss, /\.hub-theme-options\s*\{[\s\S]*?max-height:\s*min\(360px, 62vh\);[\s\S]*?overflow-y:\s*auto;/,
  "The expanded 42-theme catalogue must remain scrollable inside the settings panel");

console.log("Theme catalogue checks passed.");
