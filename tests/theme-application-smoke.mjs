import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource } from "./support/source.mjs";

const source = readContentSource();
const hubBaseCss = fs.readFileSync(new URL("../src/styles/hub/base.css", import.meta.url), "utf8");

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

const colors = Object.fromEntries([
  "nativeBackground", "nativeSurface", "nativeCard", "nativeFooter", "themeBackground",
  "themeSurface", "themeCard", "themeText", "themeMuted", "themeAccent", "themeNavbar",
  "themeNavbarText", "themeBorder", "themeOnAccent"
].map((name) => [name, { name }]));
const properties = new Map();
const context = vm.createContext({
  colors,
  state: { appearance: { applyToPage: true, pageAware: true } },
  accessibleAppearanceTheme: () => ({
    background: colors.themeBackground,
    pageSurface: colors.themeSurface,
    card: colors.themeCard,
    text: colors.themeText,
    muted: colors.themeMuted,
    accent: colors.themeAccent,
    navbar: colors.themeNavbar,
    navbarText: colors.themeNavbarText,
    border: colors.themeBorder,
    onAccent: colors.themeOnAccent
  }),
  luminance: () => 0.2,
  colorString: (color) => color?.name || String(color),
  document: { documentElement: { style: { setProperty: (name, value) => properties.set(name, value) } } }
});
vm.runInContext([
  extractFunction("themedModernReleasePalette"),
  extractFunction("setModernReleasePalette"),
  `const nativePalette = {
    background: colors.nativeBackground,
    surface: colors.nativeSurface,
    surfaceRaised: colors.nativeCard,
    footerBackground: colors.nativeFooter,
    text: colors.themeText,
    secondary: colors.themeMuted,
    link: colors.themeAccent,
    navbar: colors.themeNavbar,
    navbarText: colors.themeNavbarText,
    line: colors.themeBorder,
    accentSoft: colors.themeAccent,
    onAccent: colors.themeOnAccent,
    scheme: "light"
  };
  globalThis.palette = themedModernReleasePalette(nativePalette);
  setModernReleasePalette(globalThis.palette);`
].join("\n"), context);

assert.equal(context.palette.background.name, "themeBackground", "Modern page backgrounds should use the selected theme");
assert.equal(context.palette.surface.name, "themeSurface", "Modern page content should use the selected theme");
assert.equal(context.palette.surfaceRaised.name, "themeSurface", "Modern page cards should use the selected page-content colour");
assert.equal(context.palette.footerBackground.name, "themeBackground", "Modern page footers should not retain the original page colour");
assert.equal(context.palette.link.name, "themeAccent", "Modern page controls should use the selected accent");
assert.equal(context.palette.background.name, "themeBackground", "The page-theme switch should apply the selected theme independently of Match Bandcamp");
assert.equal(properties.get("--bandkit-release-surface-raised"), "themeSurface");
assert.equal(properties.get("--bandkit-release-footer-bg"), "themeBackground");
assert.equal(properties.get("--bandkit-release-accent"), "themeAccent");

for (const variable of ["--bandkit-page-card", "--bandkit-page-accent-soft"]) {
  assert.ok(source.includes(`"${variable}"`), `${variable} must be part of the shared page palette`);
}
for (const variable of ["--bandkit-page-background-muted", "--bandkit-page-background-accent", "--bandkit-page-background-border", "--bandkit-page-surface-text"]) {
  assert.ok(source.includes(`"${variable}"`), `${variable} must be emitted and cleared for Home page surface roles`);
}
assert.match(source, /#HomepageApp \.g-section\s*\{[\s\S]*?--bandkit-page-text:\s*var\(--bandkit-page-background-text\)/, "Home sections must enter the selected theme's background contrast context");
assert.match(source, /#HomepageApp \.g-section\.inverted\s*\{[\s\S]*?--bandkit-page-text:\s*var\(--bandkit-page-surface-text\)/, "Inverted Home sections must enter the selected theme's surface contrast context");
assert.match(source, /#HomepageApp :is\(\.play-pause-button, \.play-button, \.artwork-play-button\)\.over-image\s*\{[\s\S]*?background-color:\s*transparent\s*!important/, "Home play hit areas must not cover playlist artwork");
assert.match(source, /:is\(\.page-banners, \.banner-manager\) \.text-banner\s*\{[\s\S]*?background:\s*var\(--bandkit-page-surface\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-text\)\s*!important/, "Terms and other page banners must use a readable themed surface");
assert.match(source, /#DiscoverApp \.filters-banner :is\(\.chip-button, \.filter-button, \.follow-button, \.radio-item, \[role="option"\]\)[\s\S]*?color:\s*var\(--bandkit-page-card-text\)\s*!important/, "Discover filters must use card-corrected text instead of native genre colours");
assert.match(source, /"--bandkit-page-card": colorString\(theme\.pageSurface\)[\s\S]*?"--bandkit-page-card-text": colorString\(theme\.text\)/,
  "Bandcamp-owned cards must use Page content rather than the Bandkit content colour");
assert.doesNotMatch(source, /surfaceRaised:\s*theme\.card/,
  "the internal Bandkit content colour must not leak into modern page surfaces");
assert.match(source, /const header = surface;[\s\S]*?"--hub-panel": colorString\(surface\)[\s\S]*?"--hub-wash": colorString\(surface\)/,
  "the Bandkit panel, header, and scrolling surface must track the selected panel colour exactly");
assert.match(source, /"--hub-panel-accent": "--hub-accent"[\s\S]*?"--hub-panel-ink": "--hub-ink"/,
  "panel-contained cards must inherit the panel's accessible foreground roles");
assert.match(hubBaseCss, /\.hub-content\s*\{[\s\S]*?--hub-card:\s*var\(--hub-panel\);[\s\S]*?--hub-card-footer:\s*var\(--hub-panel\);/,
  "cards and card footers inside Bandkit panels must use the panel surface colour");
assert.match(source, /#DiscoverApp \.filters-banner :is\(\.chip-button\.selected-tag, \.radio-item\.active,[\s\S]*?background:\s*var\(--bandkit-page-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-on-accent\)\s*!important/, "Selected Discover filters must use the accessible accent foreground pair");
assert.match(source, /#DiscoverApp :is\(\.tag-search-wrapper, \.filters-banner\) input::placeholder[\s\S]*?color:\s*var\(--bandkit-page-card-muted\)\s*!important;[\s\S]*?opacity:\s*1\s*!important/, "Discover search placeholders must remain readable when themed");
assert.match(source, /#PlaylistPage \.tracklist-pane\s*\{\s*background:\s*var\(--bandkit-page-surface\)\s*!important;/, "Playlist tracklists must match the page surface");
assert.match(source, /#PlaylistPage :is\(\.play-pause-button\.play-target, \.play-pause-button\.over-image, \.wishlist-button, \.wishlist-button\.action\)[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important/, "Playlist artwork and wishlist controls must not receive generic button boxes");
assert.doesNotMatch(source, /:is\([^)]*\.track_row_view[^)]*\)\s*\{\s*background-color:\s*var\(--bandkit-page-card\)/, "Release track rows must inherit the page surface instead of becoming individual cards");
assert.match(source, /\.track_row_view\s*\{\s*background-color:\s*transparent\s*!important;\s*background-image:\s*none\s*!important;/, "Release track rows must explicitly discard Bandcamp's native backing colour");
assert.match(source, /data-bandkit-page-theme="true"\]\[data-bandkit-feed-page="true"\][\s\S]*?color: var\(--bandkit-page-accent\) !important/, "Feed controls must override Bandcamp blue with the selected accent");
assert.match(source, /function applyShadowHeaderTheme\(\)[\s\S]*?--menubar-background-color[\s\S]*?--menubar-search-input-background-color/, "The shadow-DOM Bandcamp search and navigation header must receive the selected theme");
assert.match(source, /function applyShadowHeaderTheme\(\)[\s\S]*?navbarAccent = readableColor\(theme\.accent, \[theme\.navbar\], 4\.5\)[\s\S]*?navbarBorder = readableColor/s, "Feed header accents and boundaries must pass through contrast correction");
assert.match(source, /applyBandcampPageTheme\(\);\s*applyShadowHeaderTheme\(\);\s*applyModernReleaseLayout\(\);/, "Every appearance change must update the Bandcamp shadow header along with the page");
assert.match(source, /function scheduleCustomThemePreview\(\)[\s\S]*?requestAnimationFrame\(applyCustomThemePreview\)/,
  "continuous colour changes must be coalesced into animation frames so the native hue slider stays responsive");
assert.match(source, /input\.addEventListener\("input",[\s\S]*?scheduleCustomThemePreview\(\);[\s\S]*?input\.addEventListener\("change", commitCustomThemeColour\)/,
  "custom colours must preview continuously but persist only after the colour interaction commits");
assert.doesNotMatch(source, /input\.addEventListener\("input",[\s\S]{0,500}?applyAppearance\(\)/,
  "dragging a colour slider must not repeatedly rebuild the modern page layout");
assert.match(source, /appearanceModeControl\.setAttribute\("role", "radiogroup"\)/, "Page colour modes should use one exclusive segmented control");
assert.match(source, /state\.appearance\.pageAware = mode === "match";[\s\S]*?state\.appearance\.applyToPage = mode === "theme";/, "The appearance segments must keep Match page and Theme pages mutually exclusive");
assert.match(source, /state\.appearance\.pageAware = !state\.appearance\.applyToPage;/, "Stored appearance preferences must migrate to one exclusive colour mode");
assert.match(source, /accessibleControlPalette\(\[panelColor, cardColor, activeCardColor\], cardRole\.accent\)/,
  "Match-page controls must contrast against both the inherited panel and card surfaces");
assert.match(source, /const panelColor = mixColor\(pageBackground, darkPage \? white : black, darkPage \? 0\.07 : 0\.045\);[\s\S]*?const cardColor = panelColor;[\s\S]*?const cardFooterColor = panelColor;[\s\S]*?const headerColor = panelColor;[\s\S]*?const washColor = panelColor;/,
  "Match page must give the panel, player, and DJ tools one shared surface with a subtle light/dark-aware offset from the page");
assert.match(source, /"--hub-wash": colorString\(washColor\)/,
  "The matched content wash must remain opaque and identical to the shared surface");
assert.match(source, /state\.appearance\.pageAware && !state\.appearance\.applyToPage\)[\s\S]*?surfaceRaised: palette\.surface,[\s\S]*?footerBackground: palette\.background/,
  "Match page must prevent More to explore and footer cards from drifting toward white");
assert.match(source, /accessibleControlPalette\(\[surface, card, activeCard\], cardRole\.accent\)/,
  "selected-theme controls must contrast against both the panel and card surfaces");
assert.match(source, /if \(appearanceMode === "theme"\) \{[\s\S]*?hub-theme-combobox/, "Theme controls should only render while Theme pages is active");
assert.match(source, /pageAware: true,[\s\S]*?applyToPage: false,/, "Match page should remain the default appearance mode");
assert.match(source, /hub-hide-cart-toggle[\s\S]*?hidePageCart = enabled;[\s\S]*?hideHeaderCart = enabled;/, "One shopping-cart control must update both Bandcamp cart surfaces");
assert.doesNotMatch(source, /hub-page-theme-toggle/, "The old independent page-theme switch should be removed");
assert.match(source, /#DiscoverApp :is\([\s\S]*?border-radius:8px!important[\s\S]*?height:36px!important[\s\S]*?width:36px!important/, "Discover play and add controls should share the compact rounded-square control style");
assert.match(source, /color-mix\(in srgb,var\(--bandkit-page-accent[\s\S]*?opacity:1!important/, "Discover controls should keep an opaque themed fill on hover");
assert.match(source, /#DiscoverApp :is\(\.results-grid-item \.content, \.focused-result\)\s*\{[^}]*background-color:\s*var\(--bandkit-page-surface\)\s*!important/, "Discover metadata and the selected album should paint the stable page surface");
assert.doesNotMatch(source, /:is\([^)]*#DiscoverApp \.results-grid-item \.content[^)]*\)\s*\{[^}]*background-color:\s*var\(--bandkit-page-card\)/, "Discover metadata must not use the raised card colour");
assert.doesNotMatch(source, /:is\([^)]*#DiscoverApp \.focused-result[^)]*\)\s*\{[^}]*background-color:\s*var\(--bandkit-page-card\)/, "The selected Discover album must not use the raised card colour");
for (const selector of ["#DiscoverApp main.app", "#PlaylistPage .playlist-page", "#fan-container", "#collection-items", "#music-grid", "#merch-grid", "#community", ".story-innards", "section.floating-player", "#menubar-wrapper"]) {
  assert.ok(source.includes(selector), `Shared page theming must cover ${selector}`);
}

const shadowHeaderProperties = new Map();
const contrastCalls = [];
const menuBar = {
  shadowRoot: {},
  style: {
    setProperty(name, value, priority) { shadowHeaderProperties.set(name, { value, priority }); },
    removeProperty(name) { shadowHeaderProperties.delete(name); }
  }
};
const shadowContext = vm.createContext({
  state: { appearance: { applyToPage: true } },
  document: { querySelector: (selector) => selector === "menu-bar" ? menuBar : null },
  accessibleAppearanceTheme: () => ({
    navbar: { name: "navbar" }, navbarText: { name: "navbarText" }, muted: { name: "muted" }, accent: { name: "accent" }
  }),
  luminance: () => 0.2,
  readableColor(preferred, backgrounds, minimum) {
    contrastCalls.push({ preferred: preferred.name, background: backgrounds[0].name, minimum });
    return { color: { name: `${preferred.name}-readable-${minimum}` } };
  },
  mixColor(left, right, amount) { return { name: `mix-${left.name}-${right.name}-${amount}` }; },
  colorString: (color, alpha) => alpha === undefined ? color.name : `${color.name}-${alpha}`
});
vm.runInContext(`${extractFunction("applyShadowHeaderTheme")}\napplyShadowHeaderTheme();`, shadowContext);
assert.equal(shadowHeaderProperties.get("--menubar-background-color")?.value, "navbar");
assert.equal(shadowHeaderProperties.get("--menubar-search-input-background-color")?.value, "mix-navbar-navbarText-0.16");
assert.equal(shadowHeaderProperties.get("--bandcamp-blue")?.value, "navbarText",
  "the Bandcamp logo must use the readable navbar foreground rather than the selected accent");
assert.equal(shadowHeaderProperties.get("--artist-blue")?.value, "accent-readable-4.5");
assert.equal(shadowHeaderProperties.get("--border-color")?.priority, "important");
assert.deepEqual(contrastCalls.slice(0, 2), [
  { preferred: "accent", background: "navbar", minimum: 4.5 },
  { preferred: "muted", background: "navbar", minimum: 4.5 }
]);
shadowContext.state.appearance.applyToPage = false;
vm.runInContext("applyShadowHeaderTheme();", shadowContext);
assert.equal(shadowHeaderProperties.size, 0, "Match-page mode must restore the native Bandcamp header palette");

console.log("Cross-page theme application checks passed.");
