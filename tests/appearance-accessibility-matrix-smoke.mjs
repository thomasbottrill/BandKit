import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource, readHubStyles, readModernStyles, readPageStyles } from "./support/source.mjs";
import { themeVisualizerColors } from "../src/content/visualizer-theme.js";

// The page theme moved into its own document_start stylesheet; its rules are
// still Bandkit's shipped styling, so they stay in scope for these checks.
const source = `${readContentSource().replaceAll("r.$", "")}\n${readPageStyles()}`;
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
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1).replaceAll("r.$", "");
  }
  throw new Error(`Could not parse ${name}`);
}

const context = vm.createContext({ themeVisualizerColors });
vm.runInContext([
  extractFunction("hexColor"),
  extractFunction("hexString"),
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
assert.match(source, /state\.appearance\.modernReleasePages = !modernReleasePages;\s*applyAppearance\(\);/, "The Modern Pages switch must re-run the complete appearance pipeline");
assert.match(source, /const modernReleasePages = Boolean\(state\.appearance\.modernReleasePages\);[\s\S]*?createSettingsToggle\(\{ checked: modernReleasePages/,
  "Stored legacy Modern Pages values must render with a valid boolean ARIA state");
assert.match(source, /state\.appearance\.modernReleasePages = Boolean\(storedModernReleasePages\)/,
  "Upgraded Modern Pages preferences must be normalized to booleans");
assert.match(source, /panel\.setAttribute\("aria-hidden", String\(panelHidden\)\);[\s\S]*?panel\.toggleAttribute\("inert", panelHidden\)/,
  "Hidden Bandkit panels must leave both the accessibility tree and keyboard order");
assert.match(source, /panel\.contains\(shadow\.activeElement\)[\s\S]*?\.focus\(\)/,
  "Closing a focused Bandkit panel must return focus to a visible launcher control");

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
assert.doesNotMatch(source, /:is\([^)]*\.inline_player[^)]*\)\s*\{\s*background-color:\s*var\(--bandkit-page-card\)/,
  "The themed page player must remain on the page surface without an unnecessary card backing");
assert.match(source, /#HomepageApp \.g-section\.inverted\s*\{[\s\S]*?background-color:\s*var\(--bandkit-page-surface\)\s*!important/, "Inverted Home sections must paint the surface used for their foreground tokens");
assert.match(source, /#page-footer\s*\{[\s\S]*?--bandkit-page-text:\s*var\(--bandkit-page-navbar-text\)[\s\S]*?--bandkit-page-accent:\s*var\(--bandkit-page-navbar-accent\)/,
  "the Home footer must use contrast-corrected navbar text and link roles");
assert.match(source, /#HomepageApp :is\(\.play-pause-button, \.play-button, \.artwork-play-button\)\.over-image\s*\{[\s\S]*?background-color:\s*transparent\s*!important/, "Home artwork overlays must remain transparent");
assert.match(source, /\.bandcamp-logo-link,[\s\S]*?a\[aria-label="Bandcamp home"\][\s\S]*?color:\s*var\(--bandkit-page-navbar-text\)\s*!important/,
  "legacy Bandcamp logos must use the readable navbar foreground instead of the page accent");
assert.match(pageCss, /--bandkit-release-raised-ink/, "Modern pages must retain their independent raised-surface contrast context");
assert.match(hubCss, /\.hub-dj-bpm-reset\s*\{[^}]*transition:\s*none/s, "The periodically rebuilt BPM reset must not restart a hover transition and flash");
assert.match(hubCss, /\.hub-panel\s*\{[^}]*box-shadow:\s*0 8px 22px -14px rgba\(0, 0, 0, 0\.18\)/s,
  "Docked panels must use restrained elevation against the page");
assert.match(hubCss, /\.hub-panel\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--hub-line\) 20%, var\(--hub-panel\)\)[\s\S]*?\.hub-panel:is\(:hover, :focus-within\)\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--hub-line\) 34%, var\(--hub-panel\)\)/s,
  "Panels must retain a near-surface outline and strengthen it when the user interacts with them");
assert.match(hubCss, /\.hub-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--hub-line\) 30%, transparent\)/s,
  "Cart, Now Playing, and saved-playlist card outlines must remain visually subtle");
assert.match(hubCss, /\.hub-playlist-track\.is-playing\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*box-shadow:\s*none;/s,
  "active Now Playing cards must preserve the quiet borderless treatment");
assert.match(hubCss, /\.hub-dj-drawer\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--hub-line\) 55%, transparent\)/s,
  "The DJ panel must share the softened outline treatment");
assert.match(hubCss, /\.hub-dj-drawer\s*\{[^}]*--hub-card-line:\s*var\(--hub-panel-line\);[^}]*background:\s*var\(--hub-panel\);/s,
  "The DJ panel and its nested controls must use the same accessible surface roles as the panel and music bar");
assert.match(hubCss, /\.hub-playlist-toolbar-icon\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid transparent;/s,
  "Panel toolbar actions must show only their icons at rest");
assert.match(hubCss, /\.hub-playlist-toolbar-icon\s*\{[^}]*color:\s*var\(--hub-muted\);/s,
  "Panel toolbar actions must use the subdued theme colour at rest");
assert.match(hubCss, /\.hub-playlist-toolbar-icon:hover:not\(:disabled\),[\s\S]*?\.hub-playlist-toolbar-icon\[aria-expanded="true"\]\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border-color:\s*transparent;[\s\S]*?color:\s*var\(--hub-accent\);/,
  "Panel toolbar actions must use an accent-colour glyph without a hover backing");
assert.match(hubCss, /\.hub-toolbar:has\(:is\(\.hub-playlist-toolbar-icon, \.hub-saved-playlist-icon-button\):is\(:hover, :focus-visible\)\)[\s\S]*?:not\(\[aria-pressed="true"\]\)\s*\{[^}]*opacity:\s*0\.38;/s,
  "Panel toolbar actions must defocus inactive siblings while one action receives pointer or keyboard intent");
assert.match(hubCss, /\.hub-saved-playlist-action-row \.hub-saved-playlist-icon-button\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;/s,
  "Saved cart and playlist detail toolbars must use the same icon-only resting state");
assert.doesNotMatch(hubCss, /0 25px 50px -12px rgba\(0, 0, 0, 0\.28\)/,
  "Docked panels must not restore the former heavy shadow");

console.log("Appearance accessibility settings matrix checks passed.");
