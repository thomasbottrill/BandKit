import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource, readHubStyles, readModernStyles } from "./support/source.mjs";

const source = readContentSource();
const pageCss = readModernStyles();
const hubCss = readHubStyles();

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

const context = vm.createContext({});
vm.runInContext([
  extractFunction("hexColor"),
  extractFunction("mixColor"),
  extractFunction("luminance"),
  extractFunction("contrast"),
  extractFunction("readableColor"),
  extractFunction("accessibleAppearanceTheme"),
  extractFunction("accessibleSurfaceRole"),
  extractFunction("modernArtistForeground"),
  extractFunction("accessibleModernPagePalette"),
  `globalThis.hostileTheme = {
    surface: "#050505",
    card: "#fafafa",
    background: "#030303",
    pageSurface: "#080808",
    navbar: "#f7f7f7",
    text: "#292929",
    secondaryText: "#343434",
    accent: "#303030",
    scrubAccent: "#303030"
  };
  globalThis.selected = accessibleAppearanceTheme(hostileTheme);
  globalThis.nativePanel = accessibleSurfaceRole(
    { r: 5, g: 5, b: 5, a: 1 },
    { r: 41, g: 41, b: 41, a: 1 },
    { r: 52, g: 52, b: 52, a: 1 },
    { r: 48, g: 48, b: 48, a: 1 }
  );
  globalThis.nativeModern = {
    background: { r: 3, g: 3, b: 3, a: 1 },
    surface: { r: 5, g: 5, b: 5, a: 1 },
    surfaceRaised: { r: 250, g: 250, b: 250, a: 1 },
    footerBackground: { r: 247, g: 247, b: 247, a: 1 },
    navbar: { r: 17, g: 17, b: 17, a: 1 },
    text: { r: 41, g: 41, b: 41, a: 1 },
    secondary: { r: 52, g: 52, b: 52, a: 1 },
    link: { r: 48, g: 48, b: 48, a: 1 },
    navbarText: { r: 41, g: 41, b: 41, a: 1 },
    line: { r: 41, g: 41, b: 41, a: 0.18 },
    preserveArtistColors: true
  };
  globalThis.nativeModernAccessible = accessibleModernPagePalette(nativeModern);`
].join("\n"), context);

const { contrast } = context;
const expectContrast = (foreground, background, minimum, label) => {
  assert.ok(contrast(foreground, background) >= minimum, `${label} must reach ${minimum}:1`);
};

const selected = context.selected;
for (const [foreground, background, minimum, label] of [
  [selected.panelText, selected.panel, 7, "selected-theme panel text"],
  [selected.cardText, selected.card, 7, "selected-theme card text"],
  [selected.text, selected.pageSurface, 7, "selected-theme page text"],
  [selected.backgroundText, selected.background, 7, "selected-theme background text"],
  [selected.navbarText, selected.navbar, 7, "selected-theme navigation text"],
  [selected.panelMuted, selected.panel, 4.5, "selected-theme panel secondary text"],
  [selected.cardMuted, selected.card, 4.5, "selected-theme card secondary text"],
  [selected.muted, selected.pageSurface, 4.5, "selected-theme page secondary text"],
  [selected.backgroundMuted, selected.background, 4.5, "selected-theme background secondary text"],
  [selected.panelAccent, selected.panel, 4.5, "selected-theme panel links"],
  [selected.cardAccent, selected.card, 4.5, "selected-theme card links"],
  [selected.accent, selected.pageSurface, 4.5, "selected-theme page links"],
  [selected.backgroundAccent, selected.background, 4.5, "selected-theme background links"],
  [selected.panelBorder, selected.panel, 3, "selected-theme panel boundaries"],
  [selected.cardBorder, selected.card, 3, "selected-theme card boundaries"],
  [selected.border, selected.pageSurface, 3, "selected-theme page boundaries"],
  [selected.backgroundBorder, selected.background, 3, "selected-theme background boundaries"]
]) expectContrast(foreground, background, minimum, label);

const modern = context.nativeModernAccessible;
const nativePanel = context.nativePanel;
for (const pageAware of [false, true]) {
  for (const applyToPage of [false, true]) {
    for (const modernPages of [false, true]) {
      const label = `match=${pageAware} page-theme=${applyToPage} modern=${modernPages}`;
      const panel = pageAware ? nativePanel : {
        text: selected.panelText,
        muted: selected.panelMuted,
        accent: selected.panelAccent,
        line: selected.panelBorder
      };
      expectContrast(panel.text, selected.panel, 7, `${label} Bandkit primary text`);
      if (applyToPage) {
        expectContrast(selected.text, selected.pageSurface, 7, `${label} page primary text`);
        expectContrast(selected.cardText, selected.card, 7, `${label} page card primary text`);
      }
      if (modernPages && !applyToPage) {
        expectContrast(modern.text, modern.surface, 7, `${label} modern primary text`);
        expectContrast(modern.raisedText, modern.surfaceRaised, 7, `${label} modern card primary text`);
      }
    }
  }
}

const applyAppearance = extractFunction("applyAppearance");
assert.match(applyAppearance, /captureModernReleasePalette\(\)[\s\S]*?applyBandcampPageTheme\(\);[\s\S]*?applyModernReleaseLayout\(\);[\s\S]*?pageAware\) updateThemeFromPage\(\)/, "Appearance must snapshot native colours, apply the final page state, then run Match Bandcamp");
assert.doesNotMatch(extractFunction("clearModernReleasePalette"), /modernReleasePalette\s*=\s*null/, "Disabling Modern Pages must retain the clean native palette snapshot");
assert.match(source, /state\.appearance\.modernReleasePages = !state\.appearance\.modernReleasePages;\s*applyAppearance\(\);/, "The Modern Pages switch must re-run the complete appearance pipeline");

for (const token of [
  "--bandkit-page-card-text",
  "--bandkit-page-card-muted",
  "--bandkit-page-card-accent",
  "--bandkit-page-card-border",
  "--bandkit-page-background-muted",
  "--bandkit-page-background-accent",
  "--bandkit-page-background-border",
  "--hub-card-ink",
  "--hub-card-muted",
  "--hub-card-accent",
  "--hub-card-line",
  "--hub-card-footer-ink"
]) {
  assert.ok(source.includes(`"${token}"`) || hubCss.includes(token), `${token} must be wired into the appearance system`);
}
assert.match(hubCss, /\.hub-card:not\(\.hub-settings-card\),[\s\S]*?--hub-ink:\s*var\(--hub-card-ink\)/, "Bandkit cards must enter their own contrast context");
assert.match(hubCss, /\.hub-card-footer,[\s\S]*?--hub-ink:\s*var\(--hub-card-footer-ink\)/, "Bandkit card footers must enter their own contrast context");
assert.match(source, /\.inline_player,[\s\S]*?background-color:\s*var\(--bandkit-page-card\)\s*!important;[\s\S]*?--bandkit-page-text:\s*var\(--bandkit-page-card-text\)/, "Themed Bandcamp cards must paint the same surface their foreground tokens were corrected against");
assert.match(source, /#HomepageApp \.g-section\.inverted\s*\{[\s\S]*?background-color:\s*var\(--bandkit-page-surface\)\s*!important/, "Inverted Home sections must paint the surface used for their foreground tokens");
assert.match(source, /#HomepageApp :is\(\.play-pause-button, \.play-button, \.artwork-play-button\)\.over-image\s*\{[\s\S]*?background-color:\s*transparent\s*!important/, "Home artwork overlays must remain transparent");
assert.match(source, /\.bandcamp-logo-link,[\s\S]*?a\[aria-label="Bandcamp home"\][\s\S]*?color:\s*var\(--bandkit-page-navbar-text\)\s*!important/,
  "legacy Bandcamp logos must use the readable navbar foreground instead of the page accent");
assert.match(pageCss, /--bandkit-release-raised-ink/, "Modern pages must retain their independent raised-surface contrast context");
assert.match(hubCss, /\.hub-dj-bpm-reset\s*\{[^}]*transition:\s*none/s, "The periodically rebuilt BPM reset must not restart a hover transition and flash");

console.log("Appearance accessibility settings matrix checks passed.");
