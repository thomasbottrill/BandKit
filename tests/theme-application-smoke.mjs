import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource, readPageStyles } from "./support/source.mjs";
import { removeStyleProperty, setStyleProperty } from "../src/content/core.js";

// The page theme moved into its own document_start stylesheet; its rules are
// still Bandkit's shipped styling, so they stay in scope for these checks.
const source = `${readContentSource()}\n${readPageStyles()}`;
const shadowHeaderThemeCss = source.match(/const SHADOW_HEADER_THEME_CSS = `([\s\S]*?)`;/)?.[1] || "";
const hubBaseCss = fs.readFileSync(new URL("../src/styles/hub/base.css", import.meta.url), "utf8");

assert.match(source, /const hoverColor = mixColor\(cardColor, cardRole\.accent, darkPage \? 0\.22 : 0\.12\)/,
  "page-aware settings hover washes must derive from the active accent");
assert.match(source, /"--hub-hover": colorString\(mixColor\(card, cardRole\.accent, dark \? 0\.24 : 0\.13\)\)/,
  "selected-theme settings hover washes must derive from the active accent");

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
  document: { documentElement: { style: {
    getPropertyValue: (name) => properties.get(name) ?? "",
    getPropertyPriority: () => "",
    setProperty: (name, value) => properties.set(name, value),
    removeProperty: (name) => properties.delete(name)
  } } },
  setStyleProperty,
  removeStyleProperty
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
assert.equal(context.palette.surfaceRaised.name, "themeCard", "Modern page cards should use the selected card colour");
assert.equal(context.palette.footerBackground.name, "themeBackground", "Modern page footers should not retain the original page colour");
assert.equal(context.palette.link.name, "themeAccent", "Modern page controls should use the selected accent");
assert.equal(context.palette.background.name, "themeBackground", "The page-theme switch should apply the selected theme independently of Match Bandcamp");
assert.equal(properties.get("--bandkit-release-surface-raised"), "themeCard");
assert.equal(properties.get("--bandkit-release-footer-bg"), "themeBackground");
assert.equal(properties.get("--bandkit-release-accent"), "themeAccent");

for (const variable of ["--bandkit-page-card", "--bandkit-page-accent-soft"]) {
  assert.ok(source.includes(`"${variable}"`), `${variable} must be part of the shared page palette`);
}
for (const variable of ["--bandkit-page-background-muted", "--bandkit-page-background-accent", "--bandkit-page-background-border", "--bandkit-page-surface-text"]) {
  assert.ok(source.includes(`"${variable}"`), `${variable} must be emitted and cleared for Home page surface roles`);
}
for (const variable of ["--bandkit-page-discover-glass-text", "--bandkit-page-discover-glass-muted"]) {
  assert.ok(source.includes(`"${variable}"`), `${variable} must be emitted and cleared for Discover's dark glass header`);
}
assert.match(source, /#HomepageApp \.g-section\s*\{[\s\S]*?--bandkit-page-text:\s*var\(--bandkit-page-background-text\)/, "Home sections must enter the selected theme's background contrast context");
assert.match(source, /#HomepageApp \.g-section\.inverted\s*\{[\s\S]*?--bandkit-page-text:\s*var\(--bandkit-page-surface-text\)/, "Inverted Home sections must enter the selected theme's surface contrast context");
assert.match(source, /html\[data-bandkit-page-theme="true"\] \.menu-bar \.search-instant-inline \.results\s*\{[\s\S]*?background:\s*var\(--bandkit-page-navbar\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-navbar-text\)\s*!important;/,
  "the current light-DOM homepage search results must use the selected navbar palette");
assert.match(source, /html\[data-bandkit-page-theme="true"\] :is\(#HomepageApp, body\) \.menu-bar \.search-instant-inline \.results \.tab\.active\s*\{[\s\S]*?background:\s*var\(--bandkit-page-navbar-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-navbar-on-accent\)\s*!important;/,
  "the current homepage search category must use an accessible accent pair");
assert.match(source, /:is\(#menubar-wrapper, \.menubar-wrapper, \.bandcamp-menubar, \.menu-bar, header\[role="banner"\]\)\s*\{[\s\S]*?background:\s*var\(--bandkit-page-navbar\)\s*!important;[\s\S]*?background-image:\s*none\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-navbar-text\)\s*!important;/,
  "the Bandcamp header must remain theme-owned instead of inheriting a genre background");
assert.match(source, /html\[data-bandkit-page-theme="true"\] #DiscoverApp \.menu-bar > nav\s*\{[\s\S]*?background:\s*var\(--bandkit-page-navbar\)\s*!important;[\s\S]*?background-image:\s*none\s*!important;/,
  "fixed themes must override Discover's genre gradient on the header's inner nav layer");
assert.doesNotMatch(source, /html(?!\[data-bandkit-page-theme="true"\])[^\n{]*#DiscoverApp \.menu-bar > nav\s*\{[^}]*background:/,
  "Dynamic mode must remain free to use Bandcamp's genre-responsive header background");
assert.match(source, /#HomepageApp \.discover-tags \.g-pill\s*\{[\s\S]*?background:\s*var\(--bandkit-page-card\)\s*!important;[\s\S]*?border:\s*1px solid var\(--bandkit-page-card-border\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-card-text\)\s*!important;/,
  "Home genre and location pills must use a complete contrast-corrected card colour pair");
assert.match(source, /#HomepageApp \.discover-tags \.g-pill:is\(:hover, :focus-visible\)\s*\{[\s\S]*?border-color:\s*var\(--bandkit-page-card-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-card-text\)\s*!important;/,
  "Home genre and location pill hover and focus states must remain readable");
assert.match(source, /#HomepageApp :is\(\.play-pause-button, \.play-button, \.artwork-play-button\)\.over-image\s*\{[\s\S]*?background-color:\s*transparent\s*!important/, "Home play hit areas must not cover playlist artwork");
assert.match(source, /:is\(\.page-banners, \.banner-manager\) \.text-banner\s*\{[\s\S]*?background:\s*var\(--bandkit-page-surface\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-text\)\s*!important/, "Terms and other page banners must use a readable themed surface");
assert.match(source, /#DiscoverApp \.filters-banner(?:\.not|:not\(\.genre-theme\))? :is\(\.chip-button, \.filter-button, \.follow-button, \.radio-item, \[role="option"\]\)[\s\S]*?color:\s*var\(--bandkit-page-card-text\)\s*!important/, "Discover filters must use card-corrected text instead of native genre colours");
assert.match(source, /#DiscoverApp \.breadcrumbs-bar\.dark-mode\s*\{[\s\S]*?--page-text-color:\s*var\(--bandkit-page-discover-glass-text\);[\s\S]*?color:\s*var\(--bandkit-page-discover-glass-text\)\s*!important;/,
  "Discover's sticky glass header must use a foreground corrected for its fixed dark backdrop");
assert.match(source, /#DiscoverApp \.breadcrumbs-bar\.dark-mode :is\(\.crumbs, \.crumb\)\s*\{[^}]*color:\s*var\(--bandkit-page-discover-glass-text\)\s*!important;/s,
  "Discover genre, category, and sort crumbs must inherit the accessible glass foreground");
assert.match(source, /discoverGlassSurfaces\s*=\s*\[[\s\S]*?\{ r: 34, g: 34, b: 34, a: 1 \}[\s\S]*?\{ r: 96, g: 96, b: 96, a: 1 \}[\s\S]*?readableColor\(theme\.text, discoverGlassSurfaces, 4\.5\)/,
  "Discover glass text must be contrast-corrected against both its opaque and light-page composite backgrounds");
assert.match(source, /"--bandkit-page-card": colorString\(theme\.card\)[\s\S]*?"--bandkit-page-card-text": colorString\(theme\.cardText\)/,
  "Bandcamp-owned cards must use the selected card surface and its contrast-corrected text");
assert.match(source, /surfaceRaised:\s*theme\.card/,
  "modern page cards must remain visually distinct from the page content surface");
assert.match(source, /const header = surface;[\s\S]*?"--hub-panel": colorString\(surface\)[\s\S]*?"--hub-wash": colorString\(surface\)/,
  "the Bandkit panel, header, and scrolling surface must track the selected panel colour exactly");
assert.match(source, /"--hub-panel-accent": "--hub-accent"[\s\S]*?"--hub-panel-ink": "--hub-ink"/,
  "panel-contained cards must inherit the panel's accessible foreground roles");
assert.match(hubBaseCss, /\.hub-content\s*\{[\s\S]*?--hub-card:\s*var\(--hub-panel\);[\s\S]*?--hub-card-footer:\s*var\(--hub-panel\);/,
  "cards and card footers inside Bandkit panels must use the panel surface colour");
assert.match(source, /#DiscoverApp \.filters-banner:not\(\.genre-theme\) :is\(\.chip-button\.selected-tag, \.radio-item\.active,[\s\S]*?background:\s*var\(--bandkit-page-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-on-accent\)\s*!important/, "Selected Discover filters must use the accessible accent foreground pair");
assert.match(source, /#DiscoverApp :is\(\.tag-search-wrapper, \.filters-banner\) input::placeholder[\s\S]*?color:\s*var\(--bandkit-page-card-muted\)\s*!important;[\s\S]*?opacity:\s*1\s*!important/, "Discover search placeholders must remain readable when themed");
assert.match(source, /#PlaylistPage \.tracklist-pane\s*\{\s*background:\s*var\(--bandkit-page-surface\)\s*!important;/, "Playlist tracklists must match the page surface");
assert.match(source, /#PlaylistPage :is\(\.play-pause-button\.play-target, \.play-pause-button\.over-image, \.wishlist-button, \.wishlist-button\.action\)[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important/, "Playlist artwork and wishlist controls must not receive generic button boxes");
assert.doesNotMatch(source, /:is\([^)]*\.track_row_view[^)]*\)\s*\{\s*background-color:\s*var\(--bandkit-page-card\)/, "Release track rows must inherit the page surface instead of becoming individual cards");
assert.match(source, /\.track_row_view\s*\{\s*background-color:\s*transparent\s*!important;\s*background-image:\s*none\s*!important;/, "Release track rows must explicitly discard Bandcamp's native backing colour");
assert.match(source, /data-bandkit-collection-page="true"\] #fan-container :is\(#collection-items, #wishlist-items\) \.collection-grid > \.collection-item-container\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border-color:\s*transparent\s*!important;[^}]*border-radius:\s*6px;[^}]*box-sizing:\s*border-box;[^}]*height:\s*auto;[^}]*min-height:\s*0;/s,
  "themed Collection and Wishlist tiles must use their compact natural height instead of a fixed oversized row");
assert.match(source, /data-bandkit-collection-page="true"\] #fan-container :is\(#collection-items, #wishlist-items\) \.collection-grid > \.collection-item-container:is\(:hover, :focus-within\)\s*\{[^}]*background:\s*var\(--bandkit-page-card\)\s*!important;[^}]*border-color:\s*var\(--bandkit-page-card-border\)\s*!important;/s,
  "themed Collection and Wishlist tiles must reveal their card fill and outline only on hover or keyboard focus");
assert.match(source, /data-bandkit-page-theme="true"\]\[data-bandkit-feed-page="true"\][\s\S]*?color: var\(--bandkit-page-accent\) !important/, "Feed controls must override Bandcamp blue with the selected accent");
assert.match(source, /#grid-tabs > li:not\(\.active\):is\(:hover, :focus-visible, :focus-within\)[\s\S]*?border-bottom-color: var\(--bandkit-page-accent\) !important/, "Collection tab hover must use the selected theme accent");
assert.match(source, /#grid-tabs-sticky\s*\{[\s\S]*?background: var\(--bandkit-page-surface\) !important;[\s\S]*?color: var\(--bandkit-page-text\) !important/, "The sticky collection tab bar must not retain its native white surface in dark themes");
assert.match(source, /#grid-tabs \.tab-new-badge[\s\S]*?background: var\(--bandkit-page-accent\) !important;[\s\S]*?color: var\(--bandkit-page-on-accent\) !important/, "Collection NEW badges must use an accessible theme accent pair");
assert.match(source, /\.collection-item-container :is\(\.save-button, \.save-button\.disabled\)[\s\S]*?background: var\(--bandkit-page-accent\) !important;[\s\S]*?color: var\(--bandkit-page-on-accent\) !important/, "Collection comment Save controls must use the selected theme");
assert.match(source, /\.collection-item-container \.just-hint[\s\S]*?background: var\(--bandkit-page-accent-soft\) !important;[\s\S]*?border-color: var\(--bandkit-page-accent\) !important/, "Collection comment hints must not retain the native yellow treatment");
assert.match(source, /data-bandkit-page-theme="true"\]\[data-bandkit-feed-page="true"\] body\.feed #pgBd\s*\{[^}]*background:\s*var\(--bandkit-page-background\)\s*!important/s,
  "the Feed page must not add a separate content-surface rectangle behind its raised cards");
assert.match(source, /#DiscoverApp \.filters-banner[\s\S]*?svg \*:not\(\[fill="none"\]\)[\s\S]*?fill:\s*currentColor\s*!important/,
  "Discover format icons must inherit each chip's accessible foreground colour");
assert.match(source, /#DiscoverApp \.buy-button\.buy-tralbum-button[\s\S]*?background:\s*var\(--bandkit-page-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-on-accent\)\s*!important/,
  "Discover album actions must not retain a dark native fill beneath the selected theme accent");
assert.match(source, /:not\(\.save-button\):not\(\.skip-link\):not\(\.ui-dialog\)/,
  "the generic themed-link rule must not override the skip link's on-accent foreground");
assert.match(source, /\.pager :is\(\.pagenum, \.nextprev\)[\s\S]*?background:\s*var\(--bandkit-page-card\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-card-accent\)\s*!important/,
  "Search pagination must use a complete themed surface and foreground pair");
assert.match(source, /#gift-card-vm \.preset-values > li\.selected[\s\S]*?background:\s*var\(--bandkit-page-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-on-accent\)\s*!important/,
  "selected gift-card values must use an accessible accent pair");
assert.match(source, /#gift-card-vm \.delivery-option\.selected[\s\S]*?border-color:\s*var\(--bandkit-page-accent\)\s*!important/,
  "gift-card delivery choices must not retain native white and green selection treatments");
assert.match(source, /#fan-container \.collected-by-header[\s\S]*?color:\s*var\(--bandkit-page-muted\)\s*!important/,
  "collection ownership metadata must use the corrected theme-muted colour");
assert.match(source, /#fan-container \.fan-location[\s\S]*?color:\s*var\(--bandkit-page-muted\)\s*!important/,
  "fan locations must not retain Bandcamp's fixed mid-gray on dark themes");
assert.match(source, /#fan-container \.edit-profile > a[\s\S]*?background:\s*var\(--bandkit-page-card\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-card-accent\)\s*!important/,
  "the collection profile action must not keep a native white pill under dark and electric themes");
assert.match(source, /\.ui-dialog\.nu-dialog :is\(\.checkout-button-wrapper, \.cart-button-wrapper\) > button[\s\S]*?background:\s*var\(--bandkit-page-accent\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-on-accent\)\s*!important/,
  "purchase-modal checkout actions must use a contrast-corrected theme pair");
assert.match(source, /data-bandkit-checkout-error="true"\] #pgBd :is\(div, section\)[\s\S]*?background-color:\s*transparent\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-surface-text\)\s*!important/,
  "checkout errors must discard nested native white surfaces and use the contrast-corrected themed foreground");
assert.match(source, /data-bandkit-checkout-page="true"\] #checkout > \.content[\s\S]*?background:\s*var\(--bandkit-page-surface\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-surface-text\)\s*!important/,
  "checkout review pages must replace Bandcamp's fixed white wrapper with the selected theme surface");
assert.match(source, /#checkout > \.content :is\([^)]*\.group[^)]*\)[\s\S]*?background:\s*transparent\s*!important/,
  "checkout order groups must not expose native light separators between themed rows");
assert.match(source, /data-bandkit-checkout-page="true"\] #checkout \.order-entry-panel[\s\S]*?background:\s*var\(--bandkit-page-card\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-card-text\)\s*!important/,
  "checkout order rows must use a readable themed card surface");
assert.match(source, /#checkout \.order-entry-panel :is\(\.detail, \.label\)[\s\S]*?color:\s*var\(--bandkit-page-card-muted\)\s*!important/,
  "checkout order metadata must use the contrast-corrected card-muted colour");
assert.match(extractFunction("applyBandcampPageTheme"), /dataset\.bandkitCheckoutPage = String\(location\.pathname\.startsWith\("\/cart\/checkout"\)\)/,
  "all checkout routes must expose a stable page-theme hook");
assert.match(extractFunction("applyBandcampPageTheme"), /dataset\.bandkitCheckoutError = String\(location\.pathname === "\/cart\/checkout_booboo"\)/,
  "the checkout error page must expose a stable theme hook");
assert.match(source, /#HomepageApp \.g-section time\s*\{\s*color:\s*var\(--bandkit-page-muted\)\s*!important/,
  "Home sales and event timestamps must not retain Bandcamp's light-on-dark colour on light themes");
assert.match(source, /#HomepageApp \.g-section \.text-badge[\s\S]*?color:\s*var\(--bandkit-page-accent\)\s*!important/,
  "Home event badges must use the selected section's accessible accent");
assert.match(source, /#page-footer\s*\{[\s\S]*?background:\s*var\(--bandkit-page-navbar\)\s*!important;[\s\S]*?color:\s*var\(--bandkit-page-navbar-text\)\s*!important/,
  "the Home footer must enter a complete readable theme context instead of mixing native dark and themed light colours");
assert.match(source, /function applyShadowHeaderTheme\(\)[\s\S]*?--menubar-background-color[\s\S]*?--menubar-search-input-background-color/, "The shadow-DOM Bandcamp search and navigation header must receive the selected theme");
assert.match(source, /function applyShadowHeaderTheme\(\)[\s\S]*?navbarMuted = readableColor\(theme\.muted, \[theme\.navbar\], 4\.5\)[\s\S]*?navbarBorder = readableColor/s, "Header secondary text and boundaries must pass through contrast correction");
assert.match(source, /applyBandcampPageTheme\(\);\s*applyShadowHeaderTheme\(\);\s*applyModernReleaseLayout\(\);/, "Every appearance change must update the Bandcamp shadow header along with the page");
assert.match(source, /function scheduleCustomThemePreview\(\)[\s\S]*?requestAnimationFrame\(applyCustomThemePreview\)/,
  "continuous colour changes must be coalesced into animation frames so the native hue slider stays responsive");
assert.match(source, /input\.addEventListener\("input",[\s\S]*?scheduleCustomThemePreview\(\);[\s\S]*?input\.addEventListener\("change", commitCustomThemeColour\)/,
  "custom colours must preview continuously but persist only after the colour interaction commits");
assert.doesNotMatch(source, /input\.addEventListener\("input",[\s\S]{0,500}?applyAppearance\(\)/,
  "dragging a colour slider must not repeatedly rebuild the modern page layout");
assert.match(source, /const appearanceModeControl = createSettingsPicker\(\{[\s\S]*?ariaLabel: "Colour source"/,
  "Colour source modes should use the shared exclusive settings picker");
assert.match(source, /createSettingsDisclosure\("Colours"/, "Appearance should use a concise Colours heading");
assert.match(source, /options:\s*\[\s*\{ value: "match", label: "Dynamic" \},\s*\{ value: "theme", label: "Curated" \},\s*\{ value: "custom", label: "Custom" \}\s*\]/,
  "Appearance must expose Dynamic, Curated and Custom source options");
assert.match(source, /const availableThemes = \[customTheme, \.\.\.BUILT_IN_THEMES/,
  "Custom must be the first theme choice");
assert.match(source, /const previewAppearanceTheme = \(theme\) => \{[\s\S]*?themePreviewSnapshot\s*=\s*\{\s*\.\.\.state\.appearance\s*\}[\s\S]*?applyAppearanceTheme\(theme\);/,
  "theme choices must preview without persisting over the committed appearance state");
assert.match(source, /option\.addEventListener\("pointerenter",[\s\S]*?previewAppearanceTheme\(theme\)[\s\S]*?option\.addEventListener\("focus",[\s\S]*?previewAppearanceTheme\(theme\)/,
  "hovering or keyboard-focusing a theme choice must preview it on the live Bandcamp page");
assert.match(source, /const restoreAppearanceThemePreview = \(\) => \{[\s\S]*?Object\.assign\(state\.appearance, themePreviewSnapshot\);[\s\S]*?applyAppearance\(\);[\s\S]*?themeOptions\.addEventListener\("pointerleave", restoreAppearanceThemePreview\)/,
  "leaving the theme menu must restore the committed theme");
assert.match(source, /const setThemePickerOpen = \(open\) => \{[\s\S]*?closeSettingsPopover\(themeOptions\);[\s\S]*?restoreAppearanceThemePreview\(\);/,
  "closing the theme picker with Escape, focus loss, or its trigger must cancel a temporary preview");
assert.match(source, /theme\.id === "custom"\)[\s\S]{0,300}?createButtonIcon\("icon-settings\.svg"\)/,
  "The custom theme choice should carry a settings marker");
assert.match(source, /state\.appearance\.pageAware = mode === "match";[\s\S]*?state\.appearance\.applyToPage = mode !== "match";/, "Dynamic must use page colours; Curated and Custom must apply their theme to pages");
assert.match(source, /state\.appearance\.pageAware = !state\.appearance\.applyToPage;/, "Stored appearance preferences must migrate to one exclusive colour mode");
assert.match(source, /accessibleControlPalette\(\[panelColor, cardColor, activeCardColor\], cardRole\.accent\)/,
  "Match-page controls must contrast against both the inherited panel and card surfaces");
assert.match(source, /const panelColor = mixColor\(pageBackground, darkPage \? white : black, darkPage \? 0\.07 : 0\.045\);[\s\S]*?const cardColor = panelColor;[\s\S]*?const cardFooterColor = panelColor;[\s\S]*?const headerColor = panelColor;[\s\S]*?const washColor = panelColor;/,
  "Match page must give the panel, player, and DJ tools one shared surface with a subtle light/dark-aware offset from the page");
assert.match(source, /function syncPageAwareTheme\(r\)[\s\S]*?pageAwareThemeSource\(r\)[\s\S]*?pageAwareThemeSignature === source\.signature && appliedPanel === source\.panelCss[\s\S]*?updateThemeFromPage\(source\)/,
  "Match page must restore its light/dark-derived surface when the page palette or applied panel token becomes stale");
assert.match(source, /function scanLivePlayer\(\) \{[\s\S]*?syncPageAwareTheme\?\.\(\)/,
  "live page maintenance must keep the derived panel and music-bar surface synchronized");
assert.match(source, /"--hub-wash": colorString\(washColor\)/,
  "The matched content wash must remain opaque and identical to the shared surface");
assert.match(source, /state\.appearance\.pageAware && !state\.appearance\.applyToPage\)[\s\S]*?surfaceRaised: palette\.surface,[\s\S]*?footerBackground: palette\.background/,
  "Match page must prevent More to explore and footer cards from drifting toward white");
assert.match(source, /accessibleControlPalette\(\[surface, card, activeCard\], cardRole\.accent\)/,
  "selected-theme controls must contrast against both the panel and card surfaces");
assert.match(source, /if \(appearanceMode === "theme"\) \{[\s\S]*?hub-theme-combobox/, "Theme controls should only render while Theme pages is active");
assert.match(source, /pageAware: true,[\s\S]*?applyToPage: false,/, "Match page should remain the default appearance mode");
assert.match(source, /setCartFeaturesEnabled[\s\S]*?hidePageCart = enabled !== false;[\s\S]*?hideHeaderCart = enabled !== false;/, "One cart switch must update both Bandcamp cart surfaces");
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
const shadowWrapperProperties = new Map();
const shadowMenuProperties = new Map();
const shadowFeedProperties = new Map();
const shadowCollectionProperties = new Map();
const shadowFooterProperties = new Map();
const contrastCalls = [];
let shadowPropertyWrites = 0;
let shadowTextWrites = 0;
const propertyStyle = (properties) => ({
  getPropertyValue(name) { return properties.get(name)?.value || ""; },
  getPropertyPriority(name) { return properties.get(name)?.priority || ""; },
  setProperty(name, value, priority) { shadowPropertyWrites++; properties.set(name, { value, priority }); },
  removeProperty(name) { properties.delete(name); }
});
const shadowWrapper = { style: propertyStyle(shadowWrapperProperties) };
const shadowMenu = { style: propertyStyle(shadowMenuProperties) };
const shadowFeed = { style: propertyStyle(shadowFeedProperties) };
const shadowCollection = { style: propertyStyle(shadowCollectionProperties) };
let shadowFooterStyle = null;
let shadowFooterStyleRemoved = false;
let shadowHeaderStyle = null;
let shadowHeaderStyleRemoved = false;
const shadowFooterRoot = {
  querySelector(selector) { return selector === "#bandkit-shadow-footer-theme" ? shadowFooterStyle : null; },
  append(style) { shadowFooterStyle = style; }
};
const pageFooter = { shadowRoot: shadowFooterRoot, style: propertyStyle(shadowFooterProperties) };
const menuBar = {
  shadowRoot: {
    querySelector(selector) {
      if (selector === "#bandkit-shadow-header-theme") return shadowHeaderStyle;
      if (selector === ".full-page-app-wrapper") return shadowWrapper;
      if (selector === ".menu-bar") return shadowMenu;
      if (selector === '[aria-label="Feed"]') return shadowFeed;
      if (selector === '[aria-label="Collection"]') return shadowCollection;
      return null;
    },
    append(style) { shadowHeaderStyle = style; }
  },
  style: propertyStyle(shadowHeaderProperties)
};
const shadowContext = vm.createContext({
  state: { appearance: { applyToPage: true } },
  document: {
    querySelector: (selector) => selector === "menu-bar" ? menuBar : selector === "page-footer" ? pageFooter : null,
    createElement: () => ({
      id: "",
      get textContent() { return this.text || ""; },
      set textContent(value) { shadowTextWrites++; this.text = value; },
      remove() {
        if (this.id === "bandkit-shadow-header-theme") {
          shadowHeaderStyleRemoved = true;
          shadowHeaderStyle = null;
        } else {
          shadowFooterStyleRemoved = true;
          shadowFooterStyle = null;
        }
      }
    })
  },
  accessibleAppearanceTheme: () => ({
    navbar: { name: "navbar" }, navbarText: { name: "navbarText" }, muted: { name: "muted" }, accent: { name: "accent" }
  }),
  luminance: () => 0.2,
  readableColor(preferred, backgrounds, minimum) {
    contrastCalls.push({ preferred: preferred.name, background: backgrounds[0].name, minimum });
    return { color: { name: `${preferred.name}-readable-${minimum}` } };
  },
  mixColor(left, right, amount) { return { name: `mix-${left.name}-${right.name}-${amount}` }; },
  colorString: (color, alpha) => alpha === undefined ? color.name : `${color.name}-${alpha}`,
  SHADOW_HEADER_THEME_CSS: shadowHeaderThemeCss
});
vm.runInContext(`${extractFunction("applyShadowHeaderTheme")}\napplyShadowHeaderTheme();`, shadowContext);
const initialPropertyWrites = shadowPropertyWrites;
const initialTextWrites = shadowTextWrites;
for (let i = 0; i < 50; i++) vm.runInContext("applyShadowHeaderTheme();", shadowContext);
assert.equal(shadowPropertyWrites, initialPropertyWrites, "Unchanged theme application must not invalidate styles");
assert.equal(shadowTextWrites, initialTextWrites, "Unchanged stylesheets must not retrigger the shadow-header observer");
shadowHeaderProperties.set("--menubar-background-color", { value: "native-reset", priority: "" });
vm.runInContext("applyShadowHeaderTheme();", shadowContext);
assert.equal(shadowPropertyWrites, initialPropertyWrites + 1, "Native style replacement must still be repaired");
assert.equal(shadowHeaderProperties.get("--menubar-background-color")?.value, "navbar");
assert.equal(shadowHeaderProperties.get("--menubar-search-input-background-color")?.value, "mix-navbar-navbarText-0.16");
assert.equal(shadowHeaderProperties.get("--g-button-text-color")?.value, "navbarText",
  "general navigation controls must use the readable navbar foreground");
assert.equal(shadowFeedProperties.get("--g-button-text-color"), undefined,
  "the Feed control must inherit the same readable foreground as the other header controls");
assert.equal(shadowCollectionProperties.get("--g-button-text-color"), undefined,
  "the Collection control must inherit the same readable foreground as the other header controls");
assert.equal(shadowHeaderProperties.get("--g-button-hover-background-color")?.value, "mix-navbar-navbarText-0.16");
assert.equal(shadowHeaderProperties.get("--bandcamp-blue")?.value, "navbarText",
  "the Bandcamp logo must use the readable navbar foreground rather than the selected accent");
assert.match(shadowHeaderStyle?.textContent || "", /\.menu-items > li > a[\s\S]*?color: var\(--bandkit-page-navbar-text\) !important/,
  "persistent header navigation controls must explicitly use the readable navbar foreground");
assert.match(shadowHeaderStyle?.textContent || "", /\) svg \{[\s\S]*?color: inherit !important/,
  "header SVGs must follow their control foreground instead of a native graphical colour");
assert.match(shadowHeaderStyle?.textContent || "", /:focus-visible[\s\S]*?outline-color: var\(--bandkit-page-navbar-accent\) !important/,
  "header keyboard focus must use the corrected navbar accent");
assert.match(shadowHeaderStyle?.textContent || "", /\.site-search-form input\s*\{[\s\S]*?background-color: var\(--menubar-search-input-background-color\) !important;[\s\S]*?color: var\(--bandkit-page-search-text\) !important;/,
  "the header search field must use a readable themed input pair");
assert.match(shadowHeaderStyle?.textContent || "", /\.site-search-form \.clear-search svg\s*\{[\s\S]*?fill: currentColor !important;/,
  "the header search icon must remain visible against the corrected input surface");
assert.match(shadowHeaderStyle?.textContent || "", /\.genre-suggestions a\.g-button\s*\{\s*color: var\(--g-button-text-color\) !important;/,
  "genre suggestion text must retain Bandcamp's native foreground when a theme is active");
assert.match(shadowHeaderStyle?.textContent || "", /\.genre-suggestions a\.g-button svg\s*\{[\s\S]*?fill: currentColor !important;/,
  "genre suggestion arrows must retain the same native foreground as their labels");
assert.match(shadowHeaderStyle?.textContent || "", /\.search-instant-inline \.results\s*\{[\s\S]*?background: var\(--bandkit-page-navbar\) !important;[\s\S]*?color: var\(--bandkit-page-navbar-text\) !important;/,
  "autocomplete results must replace Bandcamp's fixed dark surface with the selected navbar pair");
assert.match(shadowHeaderStyle?.textContent || "", /\.results \.tab\.active\s*\{[\s\S]*?background: var\(--bandkit-page-navbar-accent\) !important;[\s\S]*?color: var\(--bandkit-page-navbar-on-accent\) !important;/,
  "the selected autocomplete category must use an accessible accent pair");
assert.match(shadowHeaderStyle?.textContent || "", /\.results \.result-link :is\(\.meta, \.item-type\)\s*\{[\s\S]*?color: var\(--bandkit-page-navbar-muted\) !important;/,
  "autocomplete result metadata must use the contrast-corrected navbar secondary text");
assert.match(shadowHeaderStyle?.textContent || "", /\.results \.cta-buttons \.g-button\s*\{[\s\S]*?background: color-mix\(in srgb, var\(--bandkit-page-navbar-text\) 8%, var\(--bandkit-page-navbar\)\) !important;[\s\S]*?color: var\(--bandkit-page-navbar-text\) !important;/,
  "the autocomplete footer must not retain its native white surface");
assert.equal(shadowHeaderProperties.get("--artist-blue")?.value, "navbarText");
assert.equal(shadowHeaderProperties.get("--border-color")?.priority, "important");
assert.equal(shadowFooterProperties.get("--menubar-background-color")?.value, "navbar");
assert.match(shadowFooterStyle?.textContent || "", /footer#page-footer[\s\S]*?background: var\(--bandkit-page-navbar\) !important/,
  "the shadow-DOM page footer must receive the selected navbar surface");
assert.match(shadowFooterStyle?.textContent || "", /:is\(a, button\)[\s\S]*?color: var\(--bandkit-page-navbar-accent\) !important/,
  "the shadow-DOM page footer links must receive the corrected navbar accent");
for (const properties of [shadowWrapperProperties, shadowMenuProperties]) {
  assert.equal(properties.get("--menubar-background-color")?.value, "navbar",
    "the inner Bandcamp header scope must not replace the themed background with its foreground colour");
  assert.equal(properties.get("--bandcamp-blue")?.value, "navbarText",
    "the inner Bandcamp header logo and icons must inherit the readable foreground");
}
assert.deepEqual(contrastCalls.slice(0, 2), [
  { preferred: "muted", background: "navbar", minimum: 4.5 },
  { preferred: "mix-navbar-navbarText-0.24", background: "navbar", minimum: 3 }
]);
shadowContext.state.appearance.applyToPage = false;
vm.runInContext("applyShadowHeaderTheme();", shadowContext);
assert.equal(shadowHeaderProperties.size, 0, "Match-page mode must restore the native Bandcamp header palette");
assert.equal(shadowWrapperProperties.size, 0, "Match-page mode must clear the inner header wrapper palette");
assert.equal(shadowMenuProperties.size, 0, "Match-page mode must clear the native header palette");
assert.equal(shadowFeedProperties.size, 0, "Match-page mode must clear the Feed accent override");
assert.equal(shadowCollectionProperties.size, 0, "Match-page mode must clear the Collection accent override");
assert.equal(shadowHeaderStyleRemoved, true, "Match-page mode must remove the injected shadow header theme");
assert.equal(shadowFooterProperties.size, 0, "Match-page mode must restore the native shadow footer palette");
assert.equal(shadowFooterStyleRemoved, true, "Match-page mode must remove the injected shadow footer theme");

// A navigation used to paint Bandcamp's own palette until the runtime started
// at document_idle and injected the theme. The rules now ship with the
// extension at document_start, and the runtime only has to keep the colours
// they read from fresh enough for the next page to replay.
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const earlyScript = manifest.content_scripts.find((entry) => entry.js?.includes("modern-pages-bootstrap.js"));
assert.equal(earlyScript?.run_at, "document_start", "The page theme must be in place before Bandcamp paints");
assert.ok(earlyScript.css?.includes("page-theme.css"), "The page theme stylesheet must ship with that early injection");
assert.ok(earlyScript.css.indexOf("page-theme.css") > earlyScript.css.indexOf("modern-release.css"),
  "The page theme keeps the precedence it had when the runtime appended it after the modern stylesheet");
assert.doesNotMatch(source, /id = "bandkit-bandcamp-theme"/,
  "Nothing may reintroduce the runtime style injection the early stylesheet replaced");
assert.match(source, /cacheBandcampPageTheme\(true, variables\)/,
  "Resolved colours must be cached so the next navigation can replay them");
assert.match(source, /cacheBandcampPageTheme\(false, \{\}\)/,
  "Turning page theming off must be cached too, so it is not replayed");

console.log("Cross-page theme application checks passed.");
