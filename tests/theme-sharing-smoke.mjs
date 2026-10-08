import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource } from "./support/source.mjs";
import { hexColor, hexString, mixColor } from "../src/content/color.js";
import { appearanceVisualizerColourDefaults, resolvedVisualizerColors, themeVisualizerColors } from "../src/content/visualizer-theme.js";

const source = readContentSource();
const settingsCss = fs.readFileSync(new URL("../src/styles/hub/settings-colours.css", import.meta.url), "utf8");
const settingsActionsCss = ["settings-actions.css", "settings-backup.css", "settings-detail.css"].map(file => fs.readFileSync(new URL(`../src/styles/hub/${file}`, import.meta.url), "utf8")).join("\n");
const visualizerSettingsSource = fs.readFileSync(new URL("../src/content/runtime/visualizer-settings.js", import.meta.url), "utf8");
const visualizerThemeSource = fs.readFileSync(new URL("../src/content/visualizer-theme.js", import.meta.url), "utf8");

function extractFunction(name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content.js`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

const toastMessages = [];
const context = vm.createContext({
  THEME_COLOR_KEYS: ["accent", "surface", "card", "background", "pageSurface", "navbar", "text", "secondaryText"],
  MAX_SAVED_THEMES: 12,
  hexColor,
  hexString,
  mixColor,
  themeVisualizerColors,
  state: { appearance: { savedThemes: [] } },
  toastMessages,
  showToast(message) { toastMessages.push(message); }
});
vm.runInContext([
  extractFunction("validThemeHex"),
  extractFunction("parseThemeBackup"),
  extractFunction("hasSavedThemeCapacity"),
  "globalThis.parse = parseThemeBackup; globalThis.hasCapacity = hasSavedThemeCapacity;"
].join("\n"), context);

const validPayload = JSON.parse(fs.readFileSync(new URL("./shared-theme-fixture.json", import.meta.url), "utf8"));
validPayload.theme.accent = "#8B7CFF";

const parsed = context.parse(JSON.stringify(validPayload));
assert.equal(parsed.label, "Shared Night");
assert.equal(parsed.accent, "#8b7cff", "Imported colours should be normalized");
assert.equal(parsed.scrubAccent, "#8b7cff", "Older themes should default the scrub colour to the accent");
assert.deepEqual(Array.from(parsed.visualizerColors), ["#8b7cff", "#8b7cff", "#8b7cff"], "Older themes should derive a complete visualizer palette");
assert.equal(parsed.secondaryText, "#cbd5e1");

validPayload.theme.scrubAccent = "#FF4D8D";
assert.equal(context.parse(JSON.stringify(validPayload)).scrubAccent, "#ff4d8d", "Imported scrub colours should be normalized");
validPayload.theme.visualizerColors = ["#11AAFF", "#FF4D8D", "#A855F7"];
assert.deepEqual(Array.from(context.parse(JSON.stringify(validPayload)).visualizerColors), ["#11aaff", "#ff4d8d", "#a855f7"], "Imported visualizer colours should be normalized");

const visualizerTheme = { id: "test", accent: "#112233", scrubAccent: "#445566", visualizerColors: ["#112233", "#445566", "#778899"] };
const linkedAppearance = { preset: "test", customAccent: "#112233", customVisualizerColor1: "#112233", customVisualizerColor2: null, customVisualizerColor3: "#abcdef" };
assert.deepEqual(appearanceVisualizerColourDefaults(linkedAppearance, [visualizerTheme]), visualizerTheme.visualizerColors,
  "Visualizer settings should expose the selected theme's three source colours");
assert.deepEqual(resolvedVisualizerColors(["#010101", "#020202", "#030303"], linkedAppearance, visualizerTheme.visualizerColors), ["#010101", "#020202", "#abcdef"],
  "Theme-matching values should stay linked while genuine visualizer overrides replace either curated or dynamic colours");
assert.deepEqual(resolvedVisualizerColors(["#010101", "#020202", "#030303"], {
  ...linkedAppearance,
  visualizerColourSource: "custom",
  customVisualizerColor1: "#112233",
  customVisualizerColor2: "#445566",
  customVisualizerColor3: "#778899"
}, visualizerTheme.visualizerColors), visualizerTheme.visualizerColors,
"An explicit Custom source must keep fixed colours even when they happen to equal the theme palette");

assert.throws(() => context.parse("not json"), /not valid JSON/);
assert.throws(() => context.parse(JSON.stringify({ ...validPayload, version: 2 })), /not a supported Bandkit palette/);
assert.throws(() => context.parse(JSON.stringify({
  ...validPayload,
  theme: { ...validPayload.theme, accent: "red" }
})), /invalid accent colour/);
assert.throws(() => context.parse(JSON.stringify({
  ...validPayload,
  theme: { ...validPayload.theme, scrubAccent: "pink" }
})), /invalid scrubAccent colour/);
assert.throws(() => context.parse(JSON.stringify({
  ...validPayload,
  theme: { ...validPayload.theme, visualizerColors: ["#11aaff", "pink", "#a855f7"] }
})), /invalid visualizer colours/);

context.state.appearance.savedThemes = Array.from({ length: 11 }, (_, index) => ({ id: `saved-${index}` }));
assert.equal(context.hasCapacity(), true, "A twelfth saved theme should be allowed");
context.state.appearance.savedThemes.push({ id: "saved-11" });
assert.equal(context.hasCapacity(), false, "A thirteenth saved theme should be rejected without eviction");
assert.match(context.toastMessages.at(-1), /save up to 12 palettes.*Delete one/i);

assert.match(source, /Downloaded palette/);
assert.match(source, /Imported and saved palette/);
assert.doesNotMatch(extractFunction("importAppearanceTheme"), /slice\(-12\)/, "Theme import must not silently evict an older saved theme");
assert.doesNotMatch(extractFunction("appendCustomThemeSettings"), /slice\(-12\)/, "Theme saving must not silently evict an older saved theme");
assert.match(source, /appendSavedThemeSettings[\s\S]*?Rename saved[\s\S]*?Delete saved/, "Saved themes should expose rename and delete controls");
assert.match(source, /preset = "custom";[\s\S]*?Deleted palette/, "Deleting the active saved palette should preserve its colours as Custom");
assert.match(source, /importThemeInput\.accept = "\.json,application\/json"/);
assert.match(source, /hub-theme-back-actions[\s\S]*?settingsBackActions = "true"[\s\S]*?icon-download-all\.svg[\s\S]*?icon-import\.svg/,
  "Theme download and import must move into the back row as shared icon actions");
assert.doesNotMatch(source, /createSettingsRowCopy\("Actions"|hub-theme-sharing-row/,
  "Theme sharing must not retain a separate Actions settings row");
assert.match(source, /createColourGroup\("Bandcamp", "theme-bandcamp-colours"\)[\s\S]*?createColourGroup\("Bandkit surfaces", "theme-bandkit-colours"\)[\s\S]*?createColourGroup\("Player", "theme-player-colours"\)/,
  "Custom theme colours must use the three requested nested disclosure groups");
assert.match(source, /customThemeEditorMode: "simple"/,
  "Custom themes must default to the approachable four-colour editor");
assert.match(settingsCss, /\.hub-custom-colours\[hidden\]\s*\{[^}]*display:\s*none/s,
  "Simple mode must suppress the advanced colour grid despite its display rule");
assert.match(source, /ariaLabel: "Custom colour detail"[\s\S]*?value: "simple", label: "Simple"[\s\S]*?value: "advanced", label: "Advanced"/,
  "Custom themes must offer explicit Simple and Advanced editing modes");
assert.match(source, /\["customAccent", "Accent"[\s\S]*?\["customPageBackground", "Page background"[\s\S]*?\["customPageSurface", "Content surface"[\s\S]*?\["customText", "Text"/,
  "The simple custom-theme editor must expose exactly the four palette foundations");
assert.match(source, /customScrubAccent: null[\s\S]*?customVisualizerColor1: null[\s\S]*?customVisualizerColor3: null/,
  "Changing the simple accent must relink timelines and visualisers to that accent");
assert.match(source, /customNavbar: value[\s\S]*?customCard: value[\s\S]*?customSurface: value[\s\S]*?customSecondaryText: simpleSecondaryText\(\)/,
  "Changing the simple content surface must derive navigation, cards, panels, and secondary text");
const simpleContext = vm.createContext({
  state: { appearance: {
    customAccent: "#123456", customScrubAccent: "#654321",
    customVisualizerColor1: "#111111", customVisualizerColor2: "#222222", customVisualizerColor3: "#333333",
    customPageSurface: "#ffffff", customNavbar: "#eeeeee", customCard: "#dddddd", customSurface: "#cccccc",
    customContentLinked: false, customPanelLinked: false, customText: "#111827", customSecondaryText: "#6b7280"
  } },
  hexColor, hexString, luminance: (colour) => {
    const channels = [colour.r, colour.g, colour.b].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }, mixColor
});
vm.runInContext(`${extractFunction("simpleSecondaryText")}\n${extractFunction("applySimpleColour")}\napplySimpleColour("customAccent", "#ff0066"); applySimpleColour("customPageSurface", "#202124");`, simpleContext);
assert.equal(simpleContext.state.appearance.customScrubAccent, null, "Simple accent changes must clear the advanced scrub override");
assert.deepEqual([
  simpleContext.state.appearance.customNavbar,
  simpleContext.state.appearance.customCard,
  simpleContext.state.appearance.customSurface
], ["#202124", "#202124", "#202124"], "Simple surfaces must keep the page, navigation, cards, and player together");
assert.equal(simpleContext.state.appearance.customContentLinked, true);
assert.equal(simpleContext.state.appearance.customPanelLinked, true);
assert.match(source, /hub-colour-field hub-player-setting-row hub-theme-colour-row[\s\S]*?hub-theme-colour-control/,
  "Custom theme colours must use the shared left-label and right-control row pattern");
assert.match(settingsCss, /\.hub-theme-name\s*\{[^}]*background:\s*transparent;[^}]*border-bottom:[^}]*color:\s*var\(--hub-muted\);/s,
  "Theme naming must use a muted underlined text control");
assert.match(source, /createNamedSaveAction[\s\S]*?hub-theme-save-trigger[\s\S]*?openSettingsPopover\(trigger, form\)[\s\S]*?input\.focus\(\)/,
  "Save theme must live in the header and reveal its naming popover on demand");
assert.match(settingsCss, /\.hub-theme-save-popover\s*\{[^}]*border:\s*1px solid var\(--hub-line\);[^}]*display:\s*flex;/s,
  "The on-demand theme naming control must use a compact stroked popover");
assert.match(settingsCss, /\.hub-settings-action\.hub-save-theme\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*color:\s*var\(--hub-accent\);/s,
  "Save theme should use the accent-coloured text-only action treatment");
assert.match(source, /customScrubAccent: null/, "Track scrub colours should follow the accent by default");
assert.match(source, /customVisualizerColor1: null,[\s\S]*?customVisualizerColor2: null,[\s\S]*?customVisualizerColor3: null/, "Visualizer colours should remain linked until individually overridden");
assert.match(visualizerSettingsSource, /"Visualizer"[\s\S]*?Colour 1[\s\S]*?Colour 2[\s\S]*?Colour 3/, "Custom themes should expose the three editable colours below a concise Visualizer heading");
assert.match(settingsCss, /\.hub-visualizer-colours\.is-theme-settings \.hub-visualizer-colour-row\s*\{[^}]*margin-left:\s*14px;/s, "Advanced visualizer colours should be indented below their heading");
assert.match(source, /createControlsColourOverrides\(r\)[\s\S]*?playerColourGroup\.append\([\s\S]*?visualizerColours\.group,[\s\S]*?playerColourOverrides\.playback,[\s\S]*?playerColourOverrides\.handle,[\s\S]*?createCustomScrubColourSetting/, "Advanced custom colours should group visualizer, playback, handle and timeline colours under Player");
assert.match(source, /createCustomVisualizerColourSettings\(r, \{ variant: "player" \}\)[\s\S]*?createSettingsDisclosure\("Colour", colourDescription, "player-visualiser-colours"\)[\s\S]*?colourDisclosure\.content\.append\(visualizerColours\.group\)/, "Player Visualizer settings should place the shared colour-source editor behind a nested Colour disclosure");
assert.match(visualizerSettingsSource, /ariaLabel: "Visualiser colour source"[\s\S]*?value: "theme", label: "Follow theme"[\s\S]*?value: "custom", label: "Custom"/, "Visualizer colours must explicitly choose between theme inheritance and custom values");
assert.match(visualizerSettingsSource, /visualizerColourSource = source === "custom"[\s\S]*?renderedVisualizerColours\(r, defaults\)[\s\S]*?customVisualizerColor/, "Choosing Custom must freeze the currently resolved visualizer colours");
assert.match(visualizerSettingsSource, /source === "custom" \? "Custom visualiser colours enabled" : "Visualiser now follows the theme"/, "Changing visualizer colour source must explain the resulting inheritance state");
assert.match(visualizerSettingsSource, /querySelectorAll\(`\[data-theme-colour=[\s\S]*?syncAll\(\);[\s\S]*?\$applyAppearance\(\)/, "Both visualizer colour editors should synchronize before applying the shared appearance state");
assert.match(settingsCss, /\.hub-visualizer-colours \.hub-visualizer-colour-row,\s*\.hub-theme-colour-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s, "Theme and player visualizer colours should follow the shared aligned settings-row layout");
assert.match(settingsCss, /\.hub-visualizer-colour-row\[hidden\]\s*\{[^}]*display:\s*none;/s, "Inherited visualizer colours must stay hidden despite the shared grid row display");
assert.match(settingsCss, /\.hub-visualizer-colour-disclosure > \.hub-settings-disclosure-trigger\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--hub-settings-control-tail-width\);[^}]*min-height:\s*46px;/s, "The nested Colour heading should share the same right-hand control tail as the other settings rows");
assert.match(settingsCss, /\.hub-visualizer-colour-disclosure > \.hub-settings-disclosure-trigger \.hub-settings-disclosure-chevron\s*\{[^}]*opacity:\s*0\.72;[^}]*transform:\s*rotate\(0deg\);[\s\S]*?\.hub-visualizer-colour-disclosure\.is-open > \.hub-settings-disclosure-trigger \.hub-settings-disclosure-chevron\s*\{[^}]*transform:\s*rotate\(180deg\);/s, "The Colour caret should point down while closed and rotate upward while open");
assert.match(settingsCss, /\.hub-visualizer-colour-control\s*\{[^}]*margin-right:\s*8px;/s, "Visualizer colour controls should share the compact right-hand inset");
assert.match(settingsActionsCss, /--hub-settings-compact-control-inset:\s*8px;[\s\S]*?\.hub-settings-detail \.hub-player-setting-row > \.hub-settings-toggle,[\s\S]*?margin-right:\s*var\(--hub-settings-compact-control-inset\);/s, "Settings toggles should align with the compact right-hand control edge");
assert.match(source, /visualizerColors:[\s\S]*?customVisualizerColor1[\s\S]*?customVisualizerColor2[\s\S]*?customVisualizerColor3/, "Saved custom themes should preserve the complete visualizer palette");
assert.match(visualizerThemeSource, /"--hub-visualizer-color-1"[\s\S]*?"--hub-visualizer-color-2"[\s\S]*?"--hub-visualizer-color-3"/, "Theme application should publish all three visualizer colours");
assert.match(`${source}\n${visualizerSettingsSource}`, /"From accent"[\s\S]*?"Reset to accent"/, "The custom scrub colour should explain inheritance and expose a consistent reset action only after an override");
assert.match(source, /customPanelLinked: true/, "Bandkit panel colours should follow Bandkit content by default");
assert.match(source, /customContentLinked: true/, "Bandkit content colours should follow Page content by default");
assert.match(source, /"From page"[\s\S]*?"Reset to page"/, "A separately edited Bandkit content colour should clearly reset to Page content");
assert.match(source, /"From content"[\s\S]*?"Reset to content"/, "A separately edited Bandkit panel colour should clearly reset to Bandkit content");
assert.match(extractFunction("appendCustomThemeSettings"), /\["customCard", "Bandkit content"\],[\s\S]*?\["customSurface", "Bandkit panel"\]/,
  "The two Bandkit surface colours should remain adjacent inside their dedicated group");
assert.match(source, /colourLink\.addEventListener\("click",[\s\S]{0,700}?applyAppearance\(\);[\s\S]*?saveState\(\);/,
  "linked-colour resets should update in place without rebuilding and shifting the settings scroller");
assert.match(settingsCss, /input\[type="color"\]::-webkit-color-swatch-wrapper\s*\{[^}]*padding:\s*0;/s,
  "colour inputs should remove the browser's extra inner swatch padding");
for (const pseudoElement of ["webkit-color-swatch", "moz-color-swatch"]) {
  assert.match(settingsCss, new RegExp(`input\\[type="color"\\]::-${pseudoElement}\\s*\\{[^}]*border:\\s*0;`, "s"),
    "each browser's colour input should render as one outlined swatch rather than nested boxes");
}
assert.match(source, /accessibleScrubberPalette\(accessible\.preferredScrubAccent, card\)/, "The scrub override should feed the player palette");
assert.match(source, /function elementText\(root, selectors\) \{\s*if \(!root\) return "";/, "Page analysis should tolerate pages without an inline player");

console.log("Theme sharing checks passed.");
