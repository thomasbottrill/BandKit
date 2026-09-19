import assert from "node:assert/strict";
import fs from "node:fs";
import { readContentSource, readHubStyles, readModernStyles } from "./support/source.mjs";

const source = readContentSource();
const css = readHubStyles();
const modernCss = readModernStyles();
const liveScanningSource = fs.readFileSync(new URL("../src/content/runtime/live-scanning.js", import.meta.url), "utf8");
const playerShellSource = ["player-shell.js", "player-handoffs.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
const djPlaybackSource = fs.readFileSync(new URL("../src/content/runtime/dj-playback.js", import.meta.url), "utf8");
const spectrumRendererSource = ["visualizer-colour-field.js", "spectrum-renderer.js"].map(file => fs.readFileSync(new URL(`../src/content/${file}`, import.meta.url), "utf8")).join("\n");
const runtimeShellSource = ["runtime-shell.js", "runtime-dom-shell.js", "../components/music-bar.js", "../components/section-navigation.js"].map((file) => (
  fs.readFileSync(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
)).join("\n");
const pagePlayerUiSource = fs.readFileSync(new URL("../src/content/runtime/page-player-ui.js", import.meta.url), "utf8");
const scrubHandlePickerSource = fs.readFileSync(new URL("../src/content/scrub-handle-picker.js", import.meta.url), "utf8");
const coreSource = fs.readFileSync(new URL("../src/content/core.js", import.meta.url), "utf8");
const interactionGuardsSource = fs.readFileSync(new URL("../src/content/runtime/interaction-guards.js", import.meta.url), "utf8");
const musicBarSettingsSource = fs.readFileSync(new URL("../src/content/music-bar-settings.js", import.meta.url), "utf8");
const settingsPickerSource = fs.readFileSync(new URL("../src/content/settings-picker.js", import.meta.url), "utf8");
const visualizerThemeSource = fs.readFileSync(new URL("../src/content/visualizer-theme.js", import.meta.url), "utf8");
const backgroundSource = fs.readFileSync(new URL("../src/background/index.js", import.meta.url), "utf8");
const offscreenSource = ["index.js", "visualizer.js"].map((file) => (
  fs.readFileSync(new URL(`../src/offscreen/${file}`, import.meta.url), "utf8")
)).join("\n");
const pageActionsSource = fs.readFileSync(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8");
const appearanceSource = fs.readFileSync(new URL("../src/content/runtime/appearance.js", import.meta.url), "utf8");
const playerSurfaceSource = fs.readFileSync(new URL("../src/content/runtime/player-surface.js", import.meta.url), "utf8");
const collectionPlaylistCss = fs.readFileSync(new URL("../src/styles/modern/collection-playlists.css", import.meta.url), "utf8");

assert.match(source, /musicBarWidth:\s*"default"/, "Music bar width must default to the standard 800px layout");
assert.match(source, /musicBarBottomOffset:\s*0/, "Player height above the page edge must default to zero");
assert.match(source, /musicBarStyle:\s*"zune"/, "Music bar style must default to the Fade layout");
assert.match(source, /musicBarDynamicColor:\s*true/, "Dynamic music bar colour must be enabled by default");
assert.match(source, /musicBarPlayerDynamicColor:\s*true[\s\S]*?musicBarPanelDynamicColor:\s*true/,
  "Player and panel dynamic colour must each default on beneath the master switch");
assert.match(source, /musicBarBlendMode:\s*"normal"/, "Player surfaces must preserve their existing appearance by default");
assert.match(source, /frostedGlass:\s*false[\s\S]*?glassTransparency:\s*20[\s\S]*?glassBlur:\s*20/, "Frosted glass must be optional with restrained default transparency and blur");
assert.match(source, /cornerStyle:\s*"rounded"[\s\S]*?customCornerRadius:\s*12/, "Bandkit surfaces must preserve their current rounded treatment by default");
assert.match(source, /musicBarPanelButtons:\s*"compact"/, "Populated music bars must use the single chevron by default");
assert.doesNotMatch(source, /musicBarControlsAlwaysVisible/, "The removed always-visible controls preference must not remain in default state");
assert.match(source, /musicBarScrubberWidth:\s*"full"/, "Music bar timelines must span the playback row by default");
assert.match(source, /scrubberHandleShape:\s*"pill"/, "Scrub handles must preserve the existing pill as their default shape");
assert.match(source, /keepMusicBarAnalysisVisible:\s*false/, "Persistent music bar analysis must remain opt-in");
assert.match(source, /musicBarVisualizer:\s*"glow"/, "The ambient glow must be the default music-bar visualizer");
assert.match(source, /musicBarVisualizerType:\s*"glow"/, "The ambient glow must remain the default visualizer type for existing users");
assert.match(source, /musicBarVisualizerOpacity:\s*100/, "The ambient glow must default to 100% intensity");
assert.match(source, /musicBarVisualizerWidth:\s*"auto"/, "Visualizer width must default to automatic sizing");
assert.match(source, /musicBarVisualizerHeight:\s*"auto"/, "Visualizer height must default to automatic sizing");
assert.match(source, /musicBarVisualizerBlendMode:\s*"normal"/, "Visualizer blending must default to Normal");
assert.match(source, /VISUALIZER_BLEND_MODES = \[[\s\S]*?"normal"[\s\S]*?"multiply"[\s\S]*?"screen"[\s\S]*?"overlay"[\s\S]*?"darken"[\s\S]*?"lighten"[\s\S]*?"color-dodge"[\s\S]*?"color-burn"[\s\S]*?"hard-light"[\s\S]*?"soft-light"[\s\S]*?"difference"[\s\S]*?"exclusion"[\s\S]*?"hue"[\s\S]*?"saturation"[\s\S]*?"color"[\s\S]*?"luminosity"[\s\S]*?"plus-lighter"/,
  "The visualizer picker must include every blend mode supported by the target browser");
assert.match(source, /PLAYER_BLEND_MODES = VISUALIZER_BLEND_MODES\.filter\(\(mode\) => mode !== "auto"\)/,
  "The player picker must reuse the full explicit CSS blend-mode list without Visualizer's theme-aware Auto option");
assert.match(runtimeShellSource, /visualizerAddsDockedClearance = runtimeState\.musicBarStyle === "docked"[\s\S]*?runtimeState\.musicBarVisualizer !== "off"[\s\S]*?const height = compact \? 72 : 96;[\s\S]*?visualizerAddsDockedClearance \? "24px" : "0px"/,
  "Docked players must add only minimal vertical clearance while their visualizer is enabled");
assert.match(runtimeShellSource, /musicBarBottomOffset[\s\S]*?--hub-player-offset[\s\S]*?--hub-player-bottom-gap/,
  "the player height setting must publish one shared geometry value for the player and its panel");
assert.match(musicBarSettingsSource, /ariaLabel:\s*"Player height above the bottom of the page"[\s\S]*?createPlayerSettingRow\("Height"/,
  "Player Size settings must expose the modern scrubbable height control");
assert.match(css, /data-player-style="docked"\]\s*\{[^}]*height:\s*calc\(var\(--hub-player-height\) \+ var\(--hub-dock-visualizer-clearance, 0px\) \+ var\(--hub-player-offset, 0px\)\)/s,
  "Dock must grow upward while retaining its ordinary content row at the top");
assert.match(css, /data-player-style="zune"\] \.hub-player-content\s*\{[^}]*transform:\s*translateY\(calc\(0px - var\(--hub-zune-content-lift\) - var\(--hub-player-offset, 0px\)\)\)/s,
  "Fade and Float content must rise by the configured amount");
assert.match(css, /data-player-variant="rounded"\] \.hub-player-backdrop-glow\s*\{[^}]*bottom:\s*calc\(var\(--hub-zune-content-lift\) - 8px \+ var\(--hub-player-offset, 0px\)\)/s,
  "Float's visible card must rise with its contents");
assert.match(css, /\.hub-player-visualizer\s*\{[^}]*bottom:\s*0;[\s\S]*?position:\s*absolute;/s,
  "the visualizer foundation must remain anchored at the page-facing bottom of the player shell");
assert.match(runtimeShellSource, /function syncMusicBarVisualizer\(\)[\s\S]*?r\.\$syncMusicBarSize\(\);/,
  "Changing the visualizer must immediately resync docked player height");
assert.match(runtimeShellSource, /function syncMusicBarStyle\(\)[\s\S]*?r\.\$syncMusicBarSize\(\);/,
  "Changing player style must immediately restore the appropriate player height");
assert.match(css, /\.hub-player\.is-compact \.hub-player-main\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/s,
  "Compact mode must give metadata and the full-width timeline their own rows");
assert.match(source, /Number\(state\.sectionPanelHeight\) \|\| Math\.round\(window\.innerHeight \* 0\.72\)/,
  "the panel must use a moderate default height while retaining a user's saved height");
assert.match(musicBarSettingsSource, /applyMusicBarStylePreset[\s\S]*?musicBarPanelButtons = "compact"/,
  "Every player style must normalize populated controls to the single chevron");
assert.doesNotMatch(musicBarSettingsSource, /ariaLabel:\s*"Music bar buttons"|createPlayerSettingRow\("Buttons"/,
  "Player settings must not expose the removed expanded-buttons option");
assert.match(runtimeShellSource, /const returnSettingsToRoot = \(tabId, control\) => \{[\s\S]*?control\.classList\.contains\("is-active"\)[\s\S]*?resetSettingsDisclosures\(\);[\s\S]*?runtimeState\.settingsView = "index";[\s\S]*?returnSettingsToRoot\(tab\.id, (?:button|panelShortcut)\);/,
  "reselecting the rendered active Settings destination must return to the Settings root");
assert.match(runtimeShellSource, /const mode = "compact";[\s\S]*?dataset\.panelButtons = mode;/,
  "Empty and occupied players must use the same single panel chevron");
assert.match(source, /hub-compact-panel-chevron[\s\S]*?icon-panel-caret\.svg/, "The compact panel button must use the filled rounded panel caret");
assert.match(source, /classList\.toggle\("is-active", state\.open\)/, "The compact chevron must point down whenever its panel is open");
assert.match(source, /setupCompactPanelNotices[\s\S]*?is-notifying[\s\S]*?3600/, "Compact destination notices must return to the chevron after a few seconds");
assert.doesNotMatch(source, /has-notice-count|compactPanelNoticeCount/, "Compact destination notices must not render numeric counters");
assert.match(css, /\.hub-player-sections \.hub-now-playing-count\s*\{[^}]*display:\s*none !important;[\s\S]*?\.hub-player \.hub-header-shortcut-count\s*\{[^}]*display:\s*none !important;/s,
  "Play and Cart controls in the music bar must never display numeric counters");
assert.match(source, /compactPanelButton\.classList\.remove\("has-count"\)/, "The closed compact chevron must not retain a destination total");
assert.doesNotMatch(source, /showCompactPanelNotice\("icon-(?:now-playing|playlist)\.svg"/, "Now Playing and saved playlists must not trigger a numeric destination preview");
assert.match(source, /showCompactPanelNotice\(icon[\s\S]*?!icon\.includes\("cart"\)[\s\S]*?noticeIcon\.textContent = `Cart \$\{count\}`/,
  "The compact destination preview must be reserved for cart totals");
assert.match(css, /@keyframes hub-compact-panel-notice[\s\S]*?translateX\(-140%\)[\s\S]*?translateX\(140%\)/, "Compact destination notices must swipe right across the button");
assert.match(css, /@keyframes hub-compact-panel-caret-notice[\s\S]*?translateX\(140%\)[\s\S]*?translateX\(-140%\)[\s\S]*?translateX\(0\)/, "The compact caret must reset invisibly on the left and return by moving right");
assert.ok(fs.existsSync(new URL("../assets/icon-panel-caret.svg", import.meta.url)), "The compact panel caret asset must be bundled");
assert.match(source, /playlist\.push[\s\S]*?if \(added\) state\.musicBarRecentPanel = "playlist"/, "Adding to Now Playing must make it the recent compact destination");
assert.match(source, /uniqueItems\.length > state\.cart\.length[\s\S]*?musicBarRecentPanel = "cart"/, "Adding to the cart must make it the recent compact destination");
assert.match(css, /data-panel-buttons="compact"[^}]*\.hub-compact-panel-button\s*\{[^}]*display:\s*inline-flex;/s, "Compact mode must show one music-bar panel button");
assert.match(css, /\.hub-panel\[data-panel-buttons="compact"\] \.hub-panel-shortcuts\s*\{[^}]*display:\s*grid;/s, "Compact mode must expose four destinations at the bottom of the panel");
assert.doesNotMatch(css, /\.hub-panel\[data-panel-buttons="compact"\]\[data-player-empty="true"\] \.hub-panel-shortcuts\s*\{[^}]*display:\s*none;/s,
  "The empty player's chevron must open the same four panel destinations as an occupied player");
assert.match(css, /\.hub-panel\[data-panel-buttons="compact"\] \.hub-panel-shortcut::before,[\s\S]*?\.hub-panel\[data-panel-buttons="compact"\] \.hub-panel-shortcut-icon,[\s\S]*?\.hub-panel\[data-panel-buttons="compact"\] \.hub-panel-shortcut-count\s*\{[^}]*display:\s*none;[\s\S]*?\.hub-panel\[data-panel-buttons="compact"\] \.hub-panel-shortcut-label\s*\{[^}]*display:\s*inline;/s,
  "Every populated player panel must use the same Play, Cart, Activity and Settings text labels");
assert.match(css, /\.hub-panel-shortcut\.is-active::before\s*\{[^}]*background:\s*transparent;[^}]*width:\s*68px;/s,
  "The selected panel destination must retain its full hit area without drawing a pill");
assert.match(css, /\.hub-panel-shortcut::before\s*\{[^}]*border-radius:\s*999px;[^}]*height:\s*40px;[^}]*width:\s*40px;/s,
  "Inactive panel destinations must retain compact circular hit-state geometry");
assert.match(css, /\.hub-panel-shortcut:hover::before\s*\{[^}]*background:\s*transparent;[^}]*width:\s*68px;/s,
  "Hovered panel destinations must retain their full hit area without drawing a backing");
assert.match(css, /\.hub-panel-shortcuts\s*\{[^}]*column-gap:\s*4px;[^}]*grid-template-columns:\s*repeat\(4, 68px\);[^}]*justify-content:\s*center;/s,
  "Panel destinations must form a tightly spaced centred cluster");
assert.match(css, /\.hub-panel-shortcut-count\s*\{[^}]*right:\s*calc\(50% - 34px\);[^}]*top:\s*1px;/s,
  "Panel destination counters must sit on the pill's upper-right edge");
assert.match(css, /\.hub-panel\.is-frosted-glass \.hub-panel-shortcut-count\s*\{[^}]*border-color:\s*transparent;/s,
  "glass panel counters must remove their outline without changing badge geometry");
assert.match(source, /\{ value: "docked", label: "Dock" \}[\s\S]*?\{ value: "zune", label: "Fade" \}[\s\S]*?\{ value: "rounded", label: "Float" \}/,
  "Settings must expose the simplified Dock, Fade and Float music bar styles");
assert.doesNotMatch(source, /options: \[[^\]]*label: "(?:Docked|Floating|Zune|Rounded)"/,
  "The style picker must not expose superseded player names");
assert.match(source, /musicBarStyle: incoming\.musicBarStyle === "floating" \? "rounded"/,
  "Saved users of the former Floating style must migrate to the replacement Float presentation");
assert.match(musicBarSettingsSource, /applyMusicBarStylePreset\(r, nextStyle\)[\s\S]*?r\.\$renderPlayer\(\)[\s\S]*?runtimeSaveState\(\)/,
  "Changing music-bar style must immediately apply and persist its complete preset");
assert.match(source, /renderedStyle = style === "rounded" \? "zune" : style[\s\S]*?player\.dataset\.playerStyle = renderedStyle[\s\S]*?player\.dataset\.playerVariant = renderedVariant/,
  "Saved music bar styles must reach the player layout while Rounded inherits Zune geometry through its variant");
assert.doesNotMatch(css, /data-player-style="floating"|data-panel-buttons="expanded"|hub-player-sections-backdrop/,
  "Production styles must not retain retired Floating or expanded-button presentation branches");
assert.doesNotMatch(runtimeShellSource, /hub-player-sections-backdrop/,
  "The retired expanded-button backdrop must not remain in player markup");
assert.match(css, /\.hub-player\[data-player-style="zune"\]\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s,
  "The Zune music bar must sit directly on the page without its own card surface");
assert.match(css, /data-player-style="zune"\]\s*\{[^}]*--hub-fade-backdrop-width:\s*min\(1440px, 74vw\);[^}]*--hub-zune-surface:\s*var\(--hub-zune-surface-live, var\(--bandkit-page-surface, var\(--hub-panel\)\)\);[\s\S]*?data-player-style="zune"\] \.hub-player-backdrop-glow\s*\{[^}]*bottom:\s*-96px;[^}]*height:\s*calc\(228px \+ var\(--hub-player-offset, 0px\)\);[^}]*width:\s*var\(--hub-fade-backdrop-width\);/s,
  "The Zune music bar must use a centred, bounded page-surface plume behind its content");
assert.match(css, /hub-player-backdrop-glow::before,[\s\S]*?hub-player-backdrop-glow::after\s*\{[^}]*background-color:\s*var\(--hub-zune-surface\);[^}]*border-radius:\s*50% 50% 0 0 \/ 90% 90% 0 0;[^}]*left:\s*50%;[^}]*transition:\s*background-color 420ms cubic-bezier\(0\.22, 1, 0\.36, 1\);[^}]*transform:\s*translateX\(-50%\);[\s\S]*?hub-player-backdrop-glow::before\s*\{[^}]*bottom:\s*-18px;[^}]*filter:\s*blur\(clamp\(28px, 2\.2vw, 42px\)\);[^}]*height:\s*calc\(244px \+ var\(--hub-player-offset, 0px\)\);[^}]*width:\s*104%;[\s\S]*?hub-player-backdrop-glow::after\s*\{[^}]*bottom:\s*-54px;[^}]*filter:\s*blur\(clamp\(9px, 0\.75vw, 13px\)\);[^}]*height:\s*calc\(280px \+ var\(--hub-player-offset, 0px\)\);[^}]*width:\s*94%;/s,
  "The Zune backing must retain its established progressive blur layers while tapering only the upper side contour");
assert.match(css, /:host\(\[data-corner-style="square"\]\) \.hub-player\[data-player-style="zune"\]:not\(\[data-player-variant="rounded"\]\)[\s\S]*?border-radius:\s*50% 50% 0 0 \/ 90% 90% 0 0 !important;/s,
  "Square corners must not flatten Fade's tapered background plume");
assert.match(css, /data-corner-style="square"[\s\S]*?:not\(\.hub-player-backdrop-glow\)[\s\S]*?data-corner-style="custom"[\s\S]*?:not\(\.hub-player-backdrop-glow\)/,
  "Global corner treatments must exempt Fade's optical backdrop in every corner mode");
assert.doesNotMatch(css, /data-player-style="zune"\] \.hub-player-backdrop-glow\s*\{[^}]*radial-gradient/s,
  "The Zune backing must not regress to a visible radial-opacity contour");
assert.match(css, /data-player-style="zune"\] \.hub-player-visualizer\s*\{[^}]*bottom:\s*-3px;[^}]*left:\s*50%;[^}]*position:\s*fixed;[^}]*right:\s*auto;[^}]*transform:\s*translateX\(-50%\);[^}]*width:\s*min\(64vw, 1520px\);/s,
  "The Zune visualizer must remain centred, sit slightly below the page edge, and stop growing on very wide displays");
assert.match(css, /@media \(max-width:\s*2063px\)[\s\S]*?data-player-style="zune"\] \.hub-player-visualizer\s*\{[^}]*width:\s*min\(1320px, calc\(100vw \+ 160px\)\);/s,
  "The Zune visualizer must hold the combined player-and-menu breadth before gently overscanning narrow pages");
assert.match(css, /data-player-style="zune"\]\s*\{[^}]*--hub-zune-content-lift:\s*18px;[^}]*z-index:\s*2147483646;/s,
  "Zune content must sit above its visualizer while the contextual panel remains the top layer");
assert.match(css, /data-player-style="zune"\] \.hub-player-main\s*\{[^}]*padding-right:\s*calc\(var\(--hub-player-height\) \+ 4px\);/s,
  "Zune must reserve a full artwork-sized slot for the right-hand chevron");
assert.match(css, /data-player-style="zune"\] \.hub-play-button \.hub-button-icon\s*\{[^}]*height:\s*30px;[^}]*width:\s*30px;/s,
  "Zune must use a more prominent play and pause glyph without changing its hit target");
assert.match(css, /data-player-style="zune"\] \.hub-previous-button\s*\{[^}]*margin-right:\s*-10px;[\s\S]*?data-player-style="zune"\] \.hub-next-button\s*\{[^}]*margin-left:\s*-10px;/s,
  "Zune previous and next controls must sit closer to the centre control");
assert.match(css, /data-player-style="docked"\] \.hub-player-actions\s*\{[^}]*gap:\s*0;[^}]*left:\s*var\(--hub-zune-actions-x, 48px\);[^}]*top:\s*50%;/s,
  "Docked transport controls must anchor to the album-art centre");
assert.match(css, /data-player-style="docked"\] \.hub-previous-button\s*\{[^}]*margin-right:\s*-10px;[\s\S]*?data-player-style="docked"\] \.hub-next-button\s*\{[^}]*margin-left:\s*-10px;/s,
  "Docked transport spacing must match the tighter Zune and Rounded cluster");
assert.match(css, /data-player-style="docked"\]:has\(:is\(\.hub-player-content, \.hub-player-actions\):is\(:hover, :focus-within\)\) \.hub-player-art-link,[\s\S]*?data-player-style="docked"\]:has\(\.hub-player-tools \[aria-expanded="true"\]\) \.hub-player-art-link\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*transform:\s*scale\(0\.88\);/s,
  "Docked hover and keyboard focus must replace artwork with transport controls");
assert.doesNotMatch(css, /data-player-style="zune"\] \.hub-compact-panel-button\s*\{[^}]*height:/s,
  "Zune must preserve Floating's compact chevron size inside its balanced artwork-sized slot");
assert.match(source, /hub-header-shortcut-icon[^\n]*hub-header-shortcut-label[^\n]*\$\{tab\.label\}/,
  "Expanded music-bar destinations must include visible text labels");
assert.match(runtimeShellSource, /hub-now-playing-label">Play<\/span>/,
  "The combined Now Playing and Playlists music-bar destination must use the concise Play label");
assert.match(playerShellSource, /querySelector\("\.hub-now-playing-label"\)\.textContent = "Play"/,
  "Player rerenders must preserve the concise Play destination label");
assert.match(runtimeShellSource, /panelShortcutLabel = tab\.id === "playlist" \? "play" : tab\.label\.toLowerCase\(\)/,
  "The panel footer must use Play while preserving the full internal Now Playing and Playlists headings");
assert.match(css, /@media \(max-width:\s*1120px\)[\s\S]*?data-player-style="zune"\]\s*\{[^}]*--hub-fade-backdrop-width:\s*calc\(100vw \+ 640px\);/s,
  "Constrained Zune layouts must extend the opaque backing beyond both viewport edges");
assert.doesNotMatch(interactionGuardsSource, /showExpandedZuneCount|is-count-notifying|expandedPanelNoticeCounts/,
  "Player navigation notices must use icons without numeric event counters");
assert.match(playerShellSource, /trackIdentity[\s\S]*?trackChanged[\s\S]*?if \(trackChanged\) restartPlayerEntry/,
  "Panel tab changes must not replay the current track metadata entrance animation");
assert.match(playerShellSource, /function renderedPageSurfaceAt[\s\S]*?minimumSurfaceWidth[\s\S]*?backgroundImage !== "none"[\s\S]*?surfaceRoot = renderedParentElement\(surfaceRoot\)/,
  "Zune surface detection must climb beyond image and media fallback fills to the owning page section");
assert.match(playerShellSource, /function renderedPageSurfaceAt[\s\S]*?extensionLayers = new Set\(\[r\.\$root, r\.\$host\]\)[\s\S]*?root instanceof ShadowRoot[\s\S]*?extensionLayers\.add\(root\.host\)[\s\S]*?!extensionLayers\.has\(element\)/,
  "Zune surface detection must ignore extension hosts across Bandcamp shadow-root boundaries");
assert.match(playerShellSource, /function renderedShadowTargetAt[\s\S]*?target\.shadowRoot\.querySelectorAll\("\*"\)[\s\S]*?matches\.at\(-1\)[\s\S]*?renderedShadowTargetAt\(layer, x, y\)/,
  "Zune surface detection must descend into external Bandcamp shadow roots to find the visible section surface");
assert.match(playerShellSource, /function renderedParentElement[\s\S]*?root instanceof ShadowRoot \? root\.host : null[\s\S]*?for \(let element = surfaceRoot; element; element = renderedParentElement\(element\)\)/,
  "Zune surface compositing must follow the rendered parent chain across external shadow boundaries");
assert.match(playerShellSource, /function syncZunePageSurfaces[\s\S]*?--hub-zune-surface-live[\s\S]*?--hub-zune-menu-surface-live[\s\S]*?applyZuneSurfacePalette\(r, "main", mainSurface\)[\s\S]*?applyZuneSurfacePalette\(r, "menu", mainSurface\)/,
  "Zune player and destination plumes must share the resolved section surface and contrast palette");
assert.match(playerShellSource, /function applyDynamicPanelPalette[\s\S]*?blendRenderedColor\(shade,[\s\S]*?"--hub-panel"[\s\S]*?"--hub-header"[\s\S]*?"--hub-wash"[\s\S]*?"--hub-panel-ink"[\s\S]*?"--hub-panel-accent"[\s\S]*?applyDynamicPanelPalette\(r, mainSurface\)/,
  "Dynamic colour must give the panel a contrast-safe, subtly offset shade of the sampled music-bar surface");
assert.match(playerShellSource, /function applyDynamicPanelPalette[\s\S]*?readableColor\(themedAccent, \[panelSurface\], 4\.5\)\.color/,
  "Dynamic settings panels must retain the selected theme accent hue while correcting it for the sampled surface");
assert.match(playerShellSource, /panelDynamicColor = dynamicColor && runtimeState\.musicBarPanelDynamicColor !== false[\s\S]*?if \(!panelDynamicColor\)[\s\S]*?r\.\$panel\.style\.removeProperty\(property\)/,
  "Disabling panel dynamic colour must restore its selected theme palette independently");
assert.match(playerShellSource, /playerDynamicColor = dynamicColor && runtimeState\.musicBarPlayerDynamicColor !== false[\s\S]*?if \(!playerDynamicColor\)[\s\S]*?r\.\$player\.style\.removeProperty\(property\)/,
  "Disabling player dynamic colour must clear its sampled surface and contrast palette independently");
assert.match(playerShellSource, /"--hub-ink"[\s\S]*?"--hub-muted"[\s\S]*?"--hub-accent"[\s\S]*?"--hub-panel-ink"[\s\S]*?"--hub-panel-muted"/,
  "The dynamic panel readability pass must update both generic and panel-specific semantic foreground roles");
assert.match(playerShellSource, /"--hub-on-accent"[\s\S]*?"--hub-panel-on-accent"[\s\S]*?"--hub-control-bg"[\s\S]*?"--hub-control-fg"/,
  "Dynamic panels must keep primary actions and their labels contrast-safe as the sampled colour changes");
assert.match(css, /\.hub-panel\s*\{[^}]*color:\s*var\(--hub-panel-ink\)/s,
  "The panel must establish its dynamic foreground as the inherited colour for unclassified copy");
assert.match(css, /\.hub-content\s*\{[^}]*color:\s*var\(--hub-ink\)/s,
  "Every panel view must inherit the contrast-safe content foreground");
assert.match(css, /\.hub-row-title \.hub-price\s*\{[^}]*color:\s*var\(--hub-ink\)/s,
  "Cart prices must use a contrast-safe semantic foreground");
assert.match(css, /\.hub-saved-playlist-open\s*\{[^}]*color:\s*var\(--hub-ink\)/s,
  "Saved cart and playlist buttons must not inherit Bandcamp page text colours");
assert.doesNotMatch(playerShellSource, /if \(!\["zune", "rounded"\]\.includes\(runtimeState\.musicBarStyle\)\) return;/,
  "The page-surface sampler must run for Dock as well as Fade and Float");
assert.match(playerShellSource, /function colorContrast[\s\S]*?function applyZuneSurfacePalette[\s\S]*?--hub-zune-\$\{prefix\}-ink-live[\s\S]*?--hub-zune-\$\{prefix\}-accent-live/,
  "Dynamic Zune surfaces must publish a contrast-safe foreground palette for both player and destination content");
assert.match(playerShellSource, /function usesUnthemedBandcampProgressAccent[\s\S]*?bandkitPageTheme === "true"[\s\S]*?#HomepageApp, #DiscoverApp, \.discover-app[\s\S]*?daily\.bandcamp\.com[\s\S]*?\/radio/,
  "Unthemed Home, Discover, Daily, and Radio players must opt into the native progress contrast repair");
assert.match(playerShellSource, /unthemedBandcampProgress[\s\S]*?bandcampAccent[\s\S]*?readableColor\(bandcampAccent, \[surface\], 4\.5\)/,
  "Unthemed Bandcamp editorial playback must use a distinct accessible progress accent");
assert.match(playerShellSource, /const lineAlpha = unthemedBandcampProgress \? 0\.26 : 0\.42/,
  "Unthemed Bandcamp editorial playback must keep the remaining waveform quieter than progress");
assert.match(css, /data-player-style="zune"\]\s*\{[^}]*--hub-ink:\s*var\(--hub-zune-main-ink-live[^}]*--hub-accent:\s*var\(--hub-zune-main-accent-live[^}]*--hub-scrub-accent:\s*var\(--hub-zune-main-accent-live/s,
  "Zune text, controls, and scrubber must follow the sampled surface contrast palette");
assert.match(css, /data-player-style="zune"\] \.hub-player-sections\s*\{[^}]*--hub-ink:\s*var\(--hub-zune-menu-ink-live[^}]*--hub-accent:\s*var\(--hub-zune-menu-accent-live/s,
  "Expanded destinations must use the independently sampled menu-surface contrast palette");
assert.match(playerShellSource, /window\.addEventListener\("scroll", r\.\$schedulePlayerSectionGeometry, \{ passive: true \}\)[\s\S]*?window\.addEventListener\("resize", r\.\$schedulePlayerSectionGeometry, \{ passive: true \}\)/,
  "Live Zune surface sampling must follow scrolling and responsive layout without rerendering track content");
assert.match(css, /data-player-style="zune"\]:has\(:is\(\.hub-player-content, \.hub-player-actions\):is\(:hover, :focus-within\)\) \.hub-player-art-link[\s\S]*?opacity:\s*0;/s,
  "Zune mode must swap artwork for transport controls only within the actual player region");
assert.match(source, /panelShortcutLabel = tab\.id === "playlist" \? "play" : tab\.label\.toLowerCase\(\)[\s\S]*?hub-panel-shortcut-label/,
  "Panel destinations must use the concise Play label in addition to their standard icons");
assert.match(css, /\.hub-panel\[data-panel-buttons="compact"\] \.hub-panel-shortcut-icon,[\s\S]*?hub-panel-shortcut-count\s*\{[^}]*display:\s*none;/s,
  "All populated player panels must replace destination icons and counters with text-only navigation");
assert.doesNotMatch(css, /\.hub-player\.is-compact[^}]*\.hub-player-content\s*\{[^}]*padding-right:/s,
  "Compact bars must not add right-only padding beyond their symmetric main-content inset");
assert.doesNotMatch(css, /data-panel-buttons="compact"\]:is\(:hover, :focus-within\) \.hub-player-content/,
  "Revealing the compact panel chevron must never resize the waveform");
assert.doesNotMatch(musicBarSettingsSource, /musicBarControlsAlwaysVisible|Always show controls|Always show player controls/,
  "Player design settings must not expose the removed controls-visibility choice");
assert.match(musicBarSettingsSource, /musicBarDynamicColor = runtimeState\.musicBarDynamicColor === false[\s\S]*?options\.hidden = runtimeState\.musicBarDynamicColor === false[\s\S]*?hub-music-bar-dynamic-color[\s\S]*?musicBarPlayerDynamicColor[\s\S]*?musicBarPanelDynamicColor/,
  "Player Style settings must progressively disclose independent player and panel dynamic-colour switches");
assert.match(musicBarSettingsSource, /if \(runtimeState\.musicBarDynamicColor\)\s*\{[\s\S]*?musicBarPlayerDynamicColor = true;[\s\S]*?musicBarPanelDynamicColor = true;[\s\S]*?\[playerToggle, panelToggle\][\s\S]*?setAttribute\("aria-checked", "true"\)/,
  "Turning dynamic colour on must enable both surfaces and immediately update both child switches");
assert.match(css, /\.hub-dynamic-color-options\s*\{[^}]*display:\s*grid;[^}]*margin:\s*0;[^}]*padding:\s*0;/s,
  "Dynamic Player and Panel controls must remain a divider-free dependent group");
assert.match(css, /\.hub-settings-dependent-options > \.hub-player-setting-row,[\s\S]*?\.hub-settings-dependent-row,[\s\S]*?padding-inline-start:\s*16px;/s,
  "Dependent settings must use one consistent child indent");
assert.match(musicBarSettingsSource, /hub-visualizer-enabled-options hub-settings-dependent-options[\s\S]*?enabledOptions\.hidden = !enabled[\s\S]*?enabledOptions\.hidden = !active/,
  "Disabled visualisers must conceal their dependent controls until enabled");
assert.match(runtimeShellSource, /player\.dataset\.dynamicColor = dynamicColor && runtimeState\.musicBarPlayerDynamicColor !== false[\s\S]*?panel\.dataset\.dynamicColor = dynamicColor && runtimeState\.musicBarPanelDynamicColor !== false/,
  "The player and panel must expose their independent effective dynamic-colour states");
assert.match(css, /data-player-style="docked"\]\[data-dynamic-color="true"\]\s*\{[^}]*--hub-docked-surface:\s*var\(--hub-zune-surface-live, var\(--hub-panel\)\);[^}]*background:\s*transparent;/s,
  "Dock must consume the same sampled page surface as Fade and Float");
assert.match(musicBarSettingsSource, /ariaLabel: "Player blend mode"[\s\S]*?PLAYER_BLEND_MODES\.includes\(nextBlendMode\)[\s\S]*?syncMusicBarStyle\(\)/,
  "Player Style settings must expose and immediately apply every validated player-surface blend mode");
assert.match(runtimeShellSource, /PLAYER_BLEND_MODES\.includes\(runtimeState\.musicBarBlendMode\)[\s\S]*?dataset\.blendMode = blendMode;[\s\S]*?--hub-player-blend-mode", blendMode\)/,
  "The selected player blend mode must reach the live surface CSS without changing its child controls");
assert.doesNotMatch(css, /data-player-style="zune"\] \.hub-player-backdrop-glow\s*\{[^}]*mix-blend-mode:/s,
  "Fade's parent must not become a blend group that prevents its child from sampling the real page backdrop");
assert.match(css, /data-player-style="zune"\] \.hub-player-backdrop-glow::before,[\s\S]*?mix-blend-mode:\s*var\(--hub-player-blend-mode, normal\);/s,
  "Fade and Float must apply the selected blend mode to their visible surface layers");
assert.match(playerSurfaceSource, /\.blend-surface\[data-fade="true"\]::after[\s\S]*?feTurbulence[\s\S]*?mask-image:\s*radial-gradient[\s\S]*?mix-blend-mode:\s*soft-light[\s\S]*?opacity:\s*0\.055/s,
  "Fade must dither low-contrast blur steps without changing its existing blur geometry");
assert.match(playerSurfaceSource, /fillBase\.hidden = surface\.hidden \|\| paperFade \|\| blendMode === "normal" \|\| r\.\$player\.classList\.contains\("is-frosted-glass"\)/,
  "Normal Fade surfaces must not double-composite the same translucent blur edge");
assert.match(css, /data-player-style="docked"\]::before\s*\{[^}]*background:\s*var\(--hub-docked-surface\);[^}]*mix-blend-mode:\s*var\(--hub-player-blend-mode, normal\);/s,
  "Dock must blend only its dedicated backing layer so artwork, text and controls remain legible");
assert.match(css, /data-player-style="docked"\]\s*\{[^}]*border-top-color:\s*transparent;[\s\S]*?data-player-style="docked"\]:is\(:hover, :focus-within\)\s*\{[^}]*border-top-color:/s,
  "Dock's top divider must appear only on hover or keyboard focus");
assert.match(css, /data-player-variant="rounded"\] \.hub-player-backdrop-glow::before\s*\{[^}]*border:\s*1px solid transparent;[\s\S]*?data-player-variant="rounded"\]:is\(:hover, :focus-within\) \.hub-player-backdrop-glow::before\s*\{[^}]*border-color:/s,
  "Float must reveal a subtle themed outline only on hover or keyboard focus");
assert.doesNotMatch(runtimeShellSource, /controlsVisibility|musicBarControlsAlwaysVisible/,
  "The live music bar must no longer branch on the removed controls-visibility preference");
assert.match(runtimeShellSource, /dataset\.panelOpen = runtimeState\.open === true \? "true" : "false"/,
  "The live music bar must expose whether a section panel is open");
assert.match(musicBarSettingsSource, /Keep BPM and key visible[\s\S]*?hub-persistent-analysis-toggle[\s\S]*?keepMusicBarAnalysisVisible = runtimeState\.keepMusicBarAnalysisVisible !== true/,
  "DJ Tools must expose an independent persistent BPM and key setting");
assert.match(runtimeShellSource, /dataset\.analysisVisibility = runtimeState\.keepMusicBarAnalysisVisible === true \? "always" : "hover"/,
  "Persistent analysis visibility must reach the live music bar");
assert.match(css, /data-analysis-visibility="always"\] \.hub-player-tools\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*none;[\s\S]*?data-analysis-visibility="always"\] \.hub-player-tools > :not\(\.hub-player-analysis\)\s*\{[^}]*opacity:\s*0;/s,
  "Persistent analysis must reveal BPM and key without exposing the other utility controls");
assert.match(css, /data-analysis-visibility="always"\] \.hub-player-tools > :not\(\.hub-player-analysis\)\s*\{[^}]*position:\s*absolute;[^}]*transform:\s*translate3d\(10px, 0, 0\);[^}]*transition:[^}]*opacity 180ms ease-out,[^}]*transform 240ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/s,
  "Persistent-analysis utility controls must enter on compositor-friendly opacity and transform properties");
assert.match(css, /data-analysis-visibility="always"\]:has\(:is\(\.hub-player-content, \.hub-player-actions\):is\(:hover, :focus-within\)\) \.hub-player-analysis,[\s\S]*?transform:\s*translate3d\(-77px, 0, 0\);/s,
  "Persistent BPM and key data must glide aside without triggering per-frame row layout");
assert.doesNotMatch(css, /data-analysis-visibility="always"\] \.hub-player-tools > :not\(\.hub-player-analysis\)\s*\{[^}]*(?:max-width|margin|gap)\s*:/s,
  "The utility reveal must not animate layout-affecting dimensions or spacing");
assert.doesNotMatch(css, /data-controls-visibility/,
  "Player styles must not retain obsolete always-visible control selectors");
assert.match(runtimeShellSource, /playerSections\.prepend\(r\.\$compactPanelButton\)/,
  "The compact chevron must live in its dedicated player section column");
assert.match(css, /data-panel-buttons="compact"\] \.hub-compact-panel-button\s*\{[^}]*display:\s*inline-flex;[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;[^}]*transform:\s*scale\(1\);/s,
  "The compact panel chevron must remain accessible at rest, including when the player is empty");
assert.match(css, /\.hub-compact-panel-button\s*\{[^}]*border:\s*1px solid transparent;[^}]*color:\s*var\(--hub-playback-color, var\(--hub-muted\)\);[^}]*height:\s*44px;[^}]*width:\s*44px;/s,
  "The compact chevron must use a muted resting colour inside a borderless square hit target");
assert.match(css, /\.hub-compact-panel-button\.is-active\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--hub-playback-color, var\(--hub-accent\)\);/s,
  "The open compact panel control must use an accent glyph without a button backing");
assert.match(css, /\.hub-player\[data-panel-buttons="compact"\] \.hub-compact-panel-button:hover,\s*\.hub-player\[data-panel-buttons="compact"\] \.hub-compact-panel-button:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--hub-playback-color, var\(--hub-accent\)\);[^}]*transform:\s*scale\(1\);/s,
  "The compact panel button surface must remain fixed on hover");
assert.match(css, /\.hub-player\[data-panel-buttons="compact"\] \.hub-compact-panel-button\.is-active:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--hub-playback-color, var\(--hub-accent\)\);/s,
  "An active compact chevron must remain accent-only while the icon scales on hover");
assert.match(css, /\.hub-compact-panel-glyphs\s*\{[^}]*height:\s*26px;[^}]*width:\s*26px;/s,
  "The compact chevron glyph must be large enough to make its scale response apparent");
assert.match(css, /\.hub-player\[data-panel-buttons="compact"\] \.hub-compact-panel-button:is\(:hover, :focus-visible\) \.hub-compact-panel-glyphs\s*\{[^}]*transform:\s*scale\(1\.14\);/s,
  "Only the compact chevron glyph must grow on hover or keyboard focus");
assert.match(css, /\.hub-player\[data-panel-buttons="compact"\]:is\(:hover, :focus-within\) \.hub-compact-panel-button,[\s\S]*?\.hub-compact-panel-button\.is-active[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  "The compact panel chevron must reveal on intent and remain visible while active");
assert.match(css, /@media \(hover: none\)[\s\S]*?\.hub-player\[data-panel-buttons="compact"\] \.hub-compact-panel-button[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  "Touch users must retain a visible compact panel control");
assert.match(interactionGuardsSource, /addEventListener\("click", \(event\)[\s\S]*?event\.detail === 0[\s\S]*?setTimeout\([\s\S]*?!isPanelOpen\(\)[\s\S]*?scheduleCompactPanelFocusRelease/,
  "Only pointer-driven panel closes may schedule automatic focus release");
assert.match(liveScanningSource, /\$headerCloseButton\.addEventListener\("click", \(event\)[\s\S]*?event\.detail !== 0[\s\S]*?\$headerCloseButton\.blur\(\)[\s\S]*?\$setOpen\(false\)/,
  "Pointer clicks on the panel close button must release panel focus before returning the music bar to rest");
assert.match(interactionGuardsSource, /scheduleCompactPanelFocusRelease[\s\S]*?setTimeout\([\s\S]*?\.matches\(":hover"\)[\s\S]*?compactPanelButton\.blur\(\)[\s\S]*?5000/,
  "A pointer-closed compact panel must release restored focus five seconds after mouseout");
assert.match(source, /sectionRect = playerSections\.getBoundingClientRect\(\)[\s\S]*?sectionRect\.left \+ sectionRect\.width \/ 2 - playerRect\.left/,
  "Contextual panels must use the launcher's rendered center after preset layout resolves");
assert.match(source, /sectionCenter = docked[\s\S]*?window\.innerWidth - 16 - panelWidth \/ 2 - playerRect\.left[\s\S]*?: contextual[\s\S]*?: panelCenter - playerRect\.left;/,
  "Docked panel controls must use their stable right-edge anchor while floating and Zune launchers use their rendered position");
assert.match(source, /anchorCenter = playerRect\.left \+ sectionCenter[\s\S]*?anchorCenter - panelWidth \/ 2/, "Floating contextual panels must center on their music-bar control");
assert.match(source, /maxPanelLeft = Math\.max\(12, window\.innerWidth - panelWidth - 12\)/, "Floating contextual panels must stay inside the viewport");
assert.match(css, /\.hub-panel\.is-contextual\[data-player-style="zune"\]\s*\{[^}]*left:\s*var\(--hub-context-panel-left, 12px\);[^}]*right:\s*auto;/s,
  "Zune contextual panels must use their chevron anchor");
assert.match(css, /\.hub-panel\.is-contextual\[data-player-style="zune"\]\s*\{[^}]*bottom:\s*calc\(var\(--hub-player-height\) \+ var\(--hub-player-bottom-gap\) - 20px\);/s,
  "Zune contextual panels must sit closer to the destination labels at the bottom of the player");
assert.match(css, /\.hub-panel\.is-contextual\[data-player-style="zune"\]\[data-panel-buttons="compact"\]\s*\{[^}]*bottom:\s*calc\(var\(--hub-player-height\) \+ var\(--hub-player-bottom-gap\) \+ 20px\);/s,
  "Fade's single-button panel must sit higher than its lower chevron trigger");
assert.match(css, /\.hub-panel\.is-contextual\[data-player-style="zune"\]\[data-player-variant="rounded"\]\[data-panel-buttons="compact"\]\s*\{[^}]*bottom:\s*calc\(var\(--hub-player-height\) \+ var\(--hub-player-bottom-gap\) \+ 36px\);/s,
  "Float's populated panel must sit slightly higher above its chevron");
assert.match(liveScanningSource, /\["left", "right"\][\s\S]*?hub-player-resize-handle[\s\S]*?if \(event\.button !== 0\) return;[\s\S]*?direction \* 2/, "Dragging either edge must resize every music-bar style from the centre");
assert.match(liveScanningSource, /applyResizeWidth[\s\S]*?musicBarWidth = "custom"/, "Dragging a floating-bar edge must create a custom width");
assert.match(liveScanningSource, /function bindFloatingPlayerResize[\s\S]*?const finishResize[\s\S]*?runtimeSaveState\(\)/, "Completing a floating-bar resize must save the custom width");
assert.match(liveScanningSource, /requestAnimationFrame[\s\S]*?applyResizeWidth/, "Floating-bar resize updates must be coalesced to animation frames");
assert.doesNotMatch(liveScanningSource.match(/function bindFloatingPlayerResize[\s\S]*?function setupLiveScanning2/)?.[0] || "", /r\.\$render\(\)/,
  "Completing a floating-bar resize must not rerender track metadata");
assert.match(runtimeShellSource, /ResizeObserver[\s\S]*?refreshScrubWaveform\(true, entries\[0\]\?\.contentRect\.width \|\| 0\)/,
  "The waveform must rebuild to preserve its spacing while the floating bar is resizing");
assert.match(liveScanningSource, /reservedWidth: 0/, "Current music-bar styles must resize their visible content directly without a retired shell allowance");
assert.match(css, /\.hub-player-resize-handle\s*\{[^}]*bottom:\s*0;[^}]*cursor:\s*ew-resize[^}]*top:\s*0;[^}]*width:\s*16px;/s, "The floating bar resize grips must cover the full left and right edges");
assert.match(css, /data-player-style="zune"\]\[data-player-variant="rounded"\] \.hub-player-resize-handle\s*\{[^}]*display:\s*block;/s, "Rounded music bars must expose the same horizontal resize grips");
assert.match(css, /data-player-style="docked"\] \.hub-player-resize-handle,[\s\S]*?data-player-style="zune"\] \.hub-player-resize-handle\s*\{[^}]*display:\s*block;[^}]*pointer-events:\s*auto;/s, "Docked and Zune music bars must expose interactive horizontal resize grips");
assert.match(css, /data-player-style="zune"\]\[data-content-width="custom"\]:not\(\[data-player-variant="rounded"\]\)\s*\{[^}]*--hub-fade-backdrop-width:[^}]*var\(--hub-player-custom-width, 900px\) \+ 640px/, "A resized Zune player must expand its feathered backdrop");
assert.match(css, /data-player-style="zune"\]\[data-content-width="full"\]:not\(\[data-player-variant="rounded"\]\)\s*\{[^}]*--hub-fade-backdrop-width:\s*calc\(100vw \+ 160px\);/s,
  "A full-width Fade player must extend its blurred backing beyond both viewport edges");
assert.match(css, /data-player-style="zune"\]\[data-content-width="custom"\]:not\(\[data-player-variant="rounded"\]\) \.hub-player-visualizer\s*\{[^}]*var\(--hub-player-custom-width, 900px\) \+ var\(--hub-player-custom-width, 900px\)/, "A resized Zune visualizer must remain about twice its player width");
assert.match(css, /data-player-style="zune"\]\[data-player-variant="rounded"\] \.hub-player-visualizer\s*\{[^}]*var\(--hub-rounded-card-width\) \+ var\(--hub-rounded-card-width\)/, "Rounded visualizers must remain about twice the resizable card width");
assert.match(css, /\.hub-player-resize-handle::after\s*\{[^}]*border-radius:\s*999px;[^}]*height:\s*30px;[^}]*transform:\s*translateY\(-50%\)/s, "Each floating resize edge must reveal a rounded vertical line");
assert.match(source, /showMusicBarAnalysis:\s*true/, "Music bar BPM and key badges must be visible by default");
assert.match(source, /\{ value: "default", label: "Default \(800 px\)" \}/, "Settings must expose the default music bar width");
assert.match(source, /\{ value: "tight", label: "Tight \(640 px\)" \}/, "Settings must expose a tight music bar width");
assert.match(source, /\{ value: "wide", label: "Wide \(1120 px\)" \}/, "Settings must expose a wide music bar width");
assert.match(source, /\{ value: "full", label: "Full width" \}/, "Settings must expose a full-width music bar option");
assert.match(source, /\{ value: "custom", label: "Custom" \}/, "Settings must expose an exact custom music bar width");
assert.match(source, /ariaLabel: "Custom music bar width"[\s\S]*?max: 2000,[\s\S]*?min: 480,[\s\S]*?suffix: "px"/,
  "Custom width must use the bounded, pixel-based scrubbable control");
assert.match(source, /createPlayerSettingRow\([\s\S]*?"Custom"[\s\S]*?hub-music-bar-custom-width-row[\s\S]*?customMusicBarWidthRow\.hidden = !custom/,
  "Choosing Custom width must reveal a dedicated value row beneath the preset row");
assert.match(musicBarSettingsSource, /hub-music-bar-style-settings[\s\S]*?hub-music-bar-size-settings/,
  "Music bar settings must provide dedicated Style and Size containers");
assert.match(musicBarSettingsSource, /styleSettings\.append\([\s\S]*?createPlayerSettingRow\("Style"[\s\S]*?createDynamicColorSetting[\s\S]*?sizeSettings\.append\([\s\S]*?createPlayerSettingRow\("Size"[\s\S]*?createPlayerSettingRow\("Width"/,
  "Music bar settings must be split into concise Style and Size groups");
assert.doesNotMatch(css, /\.hub-music-bar-settings\s*\{[^}]*(?:background|border):/s, "Music bar settings must not paint a separate filled surface or strong outline");
assert.doesNotMatch(css, /\.hub-glass-settings\s*\{[^}]*border-top:/s, "Frosted glass controls must not be separated by an internal divider");
assert.match(source, /"Surface"[\s\S]*?createSettingsPicker\(\{[\s\S]*?\{ value: "solid", label: "Solid" \}[\s\S]*?\{ value: "glass", label: "Glass" \}[\s\S]*?hub-glass-controls[\s\S]*?createPlayerSettingRow\("Transparency"[\s\S]*?createPlayerSettingRow\("Blur"/, "Appearance settings must expose Surface with one scrubbable Transparency and Blur row each");
assert.match(source, /function createScrubbablePercentage\(\{[^}]*suffix = "%"[\s\S]*?input\.value = `\$\{currentValue\}\$\{suffix\}`/, "Scrubbable settings must support both percentage and pixel values");
assert.match(source, /createAppearanceSettings[\s\S]*?createFrostedGlassSetting\(r\)[\s\S]*?createCornerStyleSetting\(r\)/, "Surface settings must live in Appearance before Corners");
assert.match(source, /function createCornerStyleSetting[\s\S]*?Corners[\s\S]*?styleLabels = \{ rounded: "Rounded", square: "Square", custom: "Custom" \}[\s\S]*?createSettingsPicker\(\{[\s\S]*?hub-corner-radius/, "Appearance settings must expose rounded, square and custom corner treatments through the shared picker");
assert.match(musicBarSettingsSource, /createScrubbablePercentage[\s\S]*?input\.addEventListener\("change"[\s\S]*?pointerdown[\s\S]*?pointermove[\s\S]*?Math\.round\(delta \/ 5\)/,
  "Visualizer opacity must support horizontal pointer scrubbing and typed values");
assert.match(musicBarSettingsSource, /event\.key === "Enter"[\s\S]*?commitTypedValue\(\)[\s\S]*?input\.select\(\)/,
  "Typed opacity values must commit when Enter is pressed");
assert.match(source, /createAppearanceSettings[\s\S]*?createCornerStyleSetting\(r\)/, "Corner styling must live in Appearance settings");
assert.match(playerShellSource, /function syncCornerStyle[\s\S]*?dataset\.cornerStyle = style[\s\S]*?--hub-custom-corner-radius/, "Corner changes must update one shared player and panel design token");
assert.match(playerShellSource, /dataset\.bandkitCornerStyle = style[\s\S]*?--bandkit-page-corner-radius/, "Corner changes must also update the page-wide corner mode and custom radius token");
assert.match(pageActionsSource, /\$pageDjHost = inlineHost;[\s\S]*?\$syncCornerStyle\?\.\(\)/, "Page DJ tools must inherit the shared corner mode when their shadow surface mounts");
assert.match(css, /data-corner-style="square"[\s\S]*?\.hub-panel[\s\S]*?\.hub-player[\s\S]*?border-radius:\s*0\s*!important/, "Square mode must remove rounding throughout both Bandkit surfaces");
assert.match(css, /data-corner-style="custom"[\s\S]*?--hub-custom-corner-radius[\s\S]*?!important/, "Custom mode must apply the chosen radius throughout both Bandkit surfaces");
assert.match(css, /data-corner-style="square"[\s\S]*?\.hub-play-button\.is-loading::after[\s\S]*?data-corner-style="custom"[\s\S]*?\.hub-play-button\.is-loading::after[\s\S]*?border-radius:\s*50%\s*!important/, "Playback loading progress must stay circular in Square and Custom modes");
assert.match(modernCss, /data-bandkit-modern-styling="true"\]\[data-bandkit-corner-style="square"\][\s\S]*?body[\s\S]*?border-radius:\s*0\s*!important/, "Square mode must remove rounding throughout modern Bandcamp pages");
assert.match(modernCss, /data-bandkit-modern-styling="true"\]\[data-bandkit-corner-style="custom"\][\s\S]*?--bandkit-page-corner-radius[\s\S]*?!important/, "Custom mode must apply its shared radius throughout modern Bandcamp pages");
assert.match(collectionPlaylistCss, /:host-context\(html\[data-bandkit-modern-styling="true"\]\[data-bandkit-corner-style="square"\]\)[\s\S]*?border-radius:\s*0\s*!important/, "Square mode must reach Bandcamp's shadow-DOM playlist cards");
assert.match(collectionPlaylistCss, /:host-context\(html\[data-bandkit-modern-styling="true"\]\[data-bandkit-corner-style="custom"\]\)[\s\S]*?--bandkit-page-corner-radius/, "Custom mode must reach Bandcamp's shadow-DOM playlist cards");
assert.match(appearanceSource, /function syncPageCornerShadowRoots[\s\S]*?host\.shadowRoot[\s\S]*?data-bandkit-page-corners[\s\S]*?data-bandkit-corner-style="square"[\s\S]*?data-bandkit-corner-style="custom"[\s\S]*?--bandkit-page-corner-radius/, "Page corner modes must be injected into every reachable Bandcamp shadow root");
assert.match(appearanceSource, /data-bandkit-corner-style="square"[\s\S]*?:not\(\.hub-play-button\.is-loading\)::after[\s\S]*?data-bandkit-corner-style="custom"[\s\S]*?:not\(\.hub-play-button\.is-loading\)::after/, "Shadow-root corner propagation must not flatten the playback progress ring");
assert.match(appearanceSource, /:not\(\.hub-player-art-link\):not\(\.hub-player-art\)/, "Generic shadow-root corner propagation must leave edge-aware player artwork clipping intact");
assert.match(appearanceSource, /:not\(\.hub-button-icon\)/, "Generic shadow-root corner propagation must not distort masked button glyphs");
assert.match(css, /data-corner-style[^}]*\.hub-play-button \.hub-button-icon\s*\{[^}]*border-radius:\s*0\s*!important;/s, "Music-bar play and pause glyphs must remain unrounded in every corner mode");
assert.match(modernCss, /\.inline_player \.playbutton[\s\S]*?\.play_status[\s\S]*?\.play-pause-button[\s\S]*?border-radius:\s*0\s*!important;/, "Page play and pause glyph layers must remain unrounded");
assert.match(modernCss, /\.bandkit-modern-release-body > \*[\s\S]*?#track_table \.track_row_view[\s\S]*?\.bandkit-modern-tags-panel[\s\S]*?border-radius:\s*0\s*!important;/, "Album divider sections and track rows must not inherit page corner rounding");
assert.match(appearanceSource, /MutationObserver\(r\.\$schedulePageCornerShadowSync\)[\s\S]*?observe\(document\.body, \{ childList: true, subtree: true \}\)/, "New web components must inherit the active page corner mode as they mount");
assert.match(source, /classList\.toggle\("is-frosted-glass", enabled\)[\s\S]*?--hub-glass-surface-opacity[\s\S]*?--hub-glass-blur/, "The saved glass setting must update both surface translucency and blur");
assert.match(css, /\.hub-player\.is-frosted-glass\s*\{[^}]*background:\s*transparent;/s, "The music bar shell must not become a backdrop root around the DJ drawer");
assert.doesNotMatch(css, /\.hub-player\.is-frosted-glass::before\s*\{[^}]*backdrop-filter:/s,
  "The three player styles must not share a pseudo-layer whose geometry conflicts with their visible surfaces");
assert.match(css, /\.hub-player\.is-frosted-glass\[data-player-style="docked"\]::before\s*\{[^}]*color-mix\(in srgb, var\(--hub-docked-surface\)[^}]*backdrop-filter:\s*blur/s,
  "Dock must blur its full-width visible surface");
assert.match(css, /\.hub-player\.is-frosted-glass\[data-player-style="zune"\]\[data-player-variant="rounded"\] \.hub-player-backdrop-glow::before\s*\{[^}]*color-mix\(in srgb, var\(--hub-zune-surface\)[^}]*backdrop-filter:\s*blur/s,
  "Float must blur its compact rounded surface");
assert.match(css, /\.hub-player\[data-player-style="docked"\]::before\s*\{[^}]*z-index:\s*0;[\s\S]*?\.hub-player\[data-player-style="docked"\] \.hub-player-content\s*\{[^}]*z-index:\s*1;/s,
  "Dock's visible glass layer must paint above the page and below its controls");
assert.match(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*background:\s*color-mix[^}]*backdrop-filter:\s*blur/s,
  "Panels must apply glass directly so the blur is present throughout their opening animation");
assert.doesNotMatch(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*(?:will-change:\s*backdrop-filter|-?backface-visibility:\s*hidden)/s,
  "Large panel glass must not be forced into persistent GPU tiles that can flash rectangular seams");
assert.match(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*backdrop-filter:\s*blur\(var\(--hub-glass-blur, 19px\)\) saturate\(1\.16\);[^}]*transition:\s*border-color/s,
  "Large panel glass must use its backdrop-filter surface without animated background colour");
assert.doesNotMatch(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*(?:contain:\s*paint|isolation:\s*isolate)/s,
  "Large panel glass must avoid containment that creates visible tiled seams");
assert.doesNotMatch(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*transition:[^}]*(?:background|backdrop-filter)/s,
  "Panel glass must not animate properties that Chromium repaints in separate GPU tiles");
assert.match(css, /\.hub-panel\.is-frosted-glass::before\s*\{[^}]*content:\s*none;/s,
  "Panels must not retain the isolated negative layer that made blur appear after opening");
assert.match(css, /\.hub-player\s*\{[^}]*background:\s*var\(--hub-panel\)/s, "The music bar must use the exact panel surface colour");
assert.match(css, /var\(--hub-docked-surface\) var\(--hub-glass-surface-opacity/,
  "Dock glass must preserve its dynamic theme-derived surface colour");
assert.match(css, /var\(--hub-zune-surface\) var\(--hub-glass-surface-opacity/,
  "Float glass must preserve its dynamic theme-derived surface colour");
assert.doesNotMatch(runtimeShellSource, /hub-player-backdrop-glass/,
  "Fade must not render a glass layer");
assert.doesNotMatch(css, /data-player-style="zune"[^}]*hub-player-backdrop-glass|hub-player-backdrop-glass[^}]*backdrop-filter/s,
  "Fade must ignore the glass setting instead of falling back to plain translucency");
assert.match(css, /\.hub-player\[data-player-style="zune"\] \.hub-player-backdrop-glow::before\s*\{[^}]*filter:\s*blur/s,
  "Fade must retain its normal independently blurred tint layers");
assert.match(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*var\(--hub-panel\) var\(--hub-glass-surface-opacity/s, "The panel must use the music bar's exact glass surface colour and opacity");
assert.doesNotMatch(css, /\.hub-panel\.is-frosted-glass\s*\{[^}]*(?:contain:\s*paint|isolation:\s*isolate|will-change:\s*backdrop-filter)/s, "The glass panel must remain one compositor-managed backdrop surface without forced tiling");
assert.match(css, /\.hub-dj-drawer\.is-frosted-glass\s*\{[^}]*backdrop-filter:\s*blur\(var\(--hub-glass-blur[^}]*background:[^}]*color-mix\(in srgb, var\(--hub-panel\) var\(--hub-glass-surface-opacity[^}]*will-change:\s*backdrop-filter, opacity;/s,
  "DJ tools must apply refraction directly to their visible surface");
assert.match(runtimeShellSource, /const djDrawer = player\.querySelector\("\.hub-dj-drawer"\);[\s\S]*?djDrawer\.remove\(\);/,
  "The music-bar component must detach the drawer before returning it");
assert.match(runtimeShellSource, /\$djDrawer = musicBar\.djDrawer;[\s\S]*?\$shadow\.append\(r\.\$launcher, r\.\$panel, r\.\$player, r\.\$djDrawer\)/,
  "DJ tools must live beside the player so the player compositor cannot clip their backdrop sample");
assert.match(css, /\.hub-dj-drawer\s*\{[^}]*display:\s*block;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[\s\S]*?\.hub-dj-drawer\.is-open\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  "DJ glass must remain composited while closed and become interactive only when open");
assert.match(css, /\.hub-dj-drawer\s*\{[^}]*z-index:\s*2147483647;[\s\S]*?\.hub-player\.is-empty \+ \.hub-dj-drawer\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
  "The detached DJ surface must paint above every player style and remain hidden while the player is empty");
assert.match(css, /\.hub-dj-drawer \.hub-dj-card\s*\{[^}]*max-height:[^}]*overflow:\s*auto;/s,
  "DJ controls must scroll inside the stable glass surface");
assert.match(runtimeShellSource + playerShellSource + djPlaybackSource, /\$djDrawer\.toggleAttribute\("inert", !enabled \|\| !runtimeState\.dj\.open\)/,
  "The visually hidden DJ surface must also be removed from keyboard navigation");
assert.match(playerShellSource, /if \(!hasCurrentTrack && runtimeState\.dj\.open\)\s*\{[\s\S]*?runtimeState\.dj\.open = false;[\s\S]*?r\.\$renderDjTools\(\);/,
  "Clearing playback must explicitly close the detached DJ drawer");
assert.match(playerShellSource, /\$djPlayerButton\.hidden = runtimeState\.djToolsEnabled === false \|\| !hasCurrentTrack;/,
  "An empty player must not expose the DJ trigger");
assert.match(css, /\.hub-dj-drawer\s*\{[^}]*--hub-card:\s*var\(--hub-panel\);[^}]*--hub-card-accent:\s*var\(--hub-panel-accent\);[^}]*--hub-card-ink:\s*var\(--hub-panel-ink\);[^}]*background:\s*var\(--hub-panel\);/s,
  "DJ tools and their controls must inherit the shared panel palette in every theme");
assert.match(css, /\.hub-panel\.is-frosted-glass \.hub-header,[\s\S]*?\.hub-panel\.is-frosted-glass \.hub-content\s*\{[^}]*background:\s*transparent/s, "Panel sections must not stack extra translucent layers over the shared glass shell");
assert.match(css, /\.hub-panel\.is-frosted-glass \.hub-panel-card\s*\{[^}]*background:\s*transparent;/s,
  "Frosted panel cards must remain transparent instead of stacking card-shaped glass layers");
assert.match(css, /\.hub-panel\.is-frosted-glass \.hub-panel-card > \.hub-card-footer\s*\{[^}]*background:\s*transparent;/s,
  "Integrated card footers must not paint an opaque layer over frosted panels");
assert.match(css, /\.hub-playlist-toolbar-icon\.is-add-page \.hub-button-icon\s*\{[^}]*mask-composite:\s*subtract;/s,
  "The add-page icon must subtract its badge separation from the queue mask");
assert.match(css, /\.hub-add-page-badge\s*\{[^}]*border:\s*0;/s,
  "The add-page badge must not paint a card-coloured halo over glass surfaces");
assert.match(css, /\.hub-panel-back-button\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*color:\s*var\(--hub-muted\)/s,
  "Saved playlist, cart, and settings back buttons must share an unfilled muted treatment");
assert.match(source, /renderSavedPlaylistDetail[\s\S]*?createPanelBackButton\("Back to playlists"[\s\S]*?toolbar\.append\(title\)[\s\S]*?hub-panel-secondary-nav/,
  "saved playlist Back navigation must live in the shared row below its title");
assert.match(source, /renderSavedCartDetail[\s\S]*?createPanelBackButton\("Back to saved carts"[\s\S]*?toolbar\.append\(createElement\("h2"[\s\S]*?hub-panel-secondary-nav/,
  "saved cart Back navigation must live in the shared row below its title");
assert.match(css, /\.hub-saved-playlist-icon-actions:has\(\.hub-saved-playlist-icon-button:is\(:hover, :focus-visible\)\)[\s\S]*?opacity:\s*0\.38/s,
  "saved detail actions must defocus inactive siblings when one receives intent");
assert.match(source, /restoreIconPreload = document\.createElement\("img"\)[\s\S]*?restoreIconPreload\.src = asset\("icon-restore\.svg"\)/,
  "The saved-cart restore mask must be warm before its first render");
assert.match(source, /if \(tab\.id === "playlist"\) continue;/, "The combined Now Playing and Playlists section must occupy one music-bar slot");
assert.match(source, /showingSavedPlaylists \? "icon-playlist\.svg" : "icon-now-playing\.svg"/, "The combined music-bar slot must reflect its last active inner tab");
assert.match(source, /const currentPanelVisible = state\.open && state\.activeTab === "playlist";[\s\S]*?state\.activeTab = "playlist";[\s\S]*?state\.open = !currentPanelVisible;/, "The combined music-bar slot must reopen the last active inner tab");
assert.match(source, /saved \? "icon-saved-cart\.svg" : "icon-cart\.svg"/, "The cart music-bar slot must reflect its last active inner tab");
assert.match(source, /const count = saved \? 0 : state\.cart\.length/, "Saved carts must not expose a persistent library total in the music bar");
assert.match(source, /const count = saved \? 0 : queuedTrackCount/, "Saved playlists must not expose a persistent library total in panel navigation");
assert.match(source, /button\.dataset\.tab === "playlist" \? queuedTrackCount : 0/, "The playlist destination badge must represent Now Playing rather than saved playlists");
assert.doesNotMatch(source, /function toggleSectionPanel\(tabId\)[\s\S]{0,300}state\.cartView\s*=/, "The shared cart music-bar slot must reopen the last active inner tab");
assert.ok(fs.existsSync(new URL("../assets/icon-saved-cart.svg", import.meta.url)), "The saved-cart music-bar state must have a dedicated icon");
assert.match(source, /player\.dataset\.contentWidth = width/, "Saved width selection must reach the player layout");
assert.match(source, /if \(width === "custom"\)[\s\S]*?setProperty\("--hub-player-custom-width"[\s\S]*?else player\.style\.removeProperty\("--hub-player-custom-width"\)/,
  "Leaving Custom width must discard the custom-only player value");
assert.match(source, /previousWidth === width && previousCustomWidth === nextCustomWidth\) return;[\s\S]*?playerSectionGeometrySignature = ""[\s\S]*?syncPlayerPageSpace\(\)[\s\S]*?schedulePlayerSectionGeometry\(\)/,
  "Changing width mode must recalculate page spacing and panel-button geometry after layout");
assert.match(source, /hub-track-title[\s\S]*?hub-track-artist[\s\S]*?hub-player-tools[\s\S]*?hub-player-analysis[\s\S]*?hub-dj-player-button[\s\S]*?hub-scrub-row[\s\S]*?hub-duration/, "The music bar must retain its two-line track copy and original analysis/tool positioning");
assert.match(source, /hub-player-content[\s\S]*?hub-player-art-link[\s\S]*?hub-player-main[\s\S]*?hub-player-top-row[\s\S]*?hub-player-track[\s\S]*?hub-player-tools[\s\S]*?hub-player-playback-row[\s\S]*?hub-scrub-row[\s\S]*?hub-player-actions/,
  "The music bar must keep metadata and utilities above the timeline with transport anchored to the player shell");
assert.match(source, /hub-player-backdrop-glow[\s\S]*?hub-player-visualizer[\s\S]*?hub-player-content[\s\S]*?hub-player-playback-row[\s\S]*?hub-scrub-row/,
  "The viewport-anchored visualizer must remain outside the lifted player content while the scrubber fills the lower row");
assert.match(source, /hub-scrub-control[\s\S]*?hub-scrub-playhead[\s\S]*?hub-scrub-time-readout[\s\S]*?hub-current-time[\s\S]*?hub-duration/,
  "Elapsed and remaining time must use an overlaid waveform readout instead of permanent side columns");
assert.match(css, /\.hub-scrub-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  "The waveform must use the full scrub row after removing permanent time labels");
assert.match(css, /\.hub-scrub-time-readout\s*\{[^}]*bottom:\s*calc\(100% - 1px\);[^}]*position:\s*absolute;[^}]*right:\s*0;/s,
  "The elapsed and remaining labels must overlay above the waveform without changing music-bar height");
assert.match(css, /\.hub-scrub-time-readout\s*\{[^}]*color:\s*var\(--hub-muted\);[^}]*font-weight:\s*500;/s,
  "The waveform readout must use subdued theme text instead of a primary colour");
assert.doesNotMatch(css, /\.hub-scrub-time-readout\s*\{[^}]*text-shadow:/s,
  "Waveform time labels must remain crisp without a drop shadow");
assert.match(css, /\.hub-scrub-control:hover \.hub-scrub-time-readout,[\s\S]*?\.hub-scrub-control:focus-within \.hub-scrub-time-readout/,
  "The waveform time readout must progressively disclose on pointer hover and keyboard focus");
assert.match(css, /\.hub-scrub-control\.is-traditional \.hub-scrub-playhead\s*\{[^}]*opacity:\s*0;/s,
  "The classic timeline handle must be hidden at rest");
assert.match(css, /\.hub-scrub-control\.is-traditional:hover \.hub-scrub-playhead,[\s\S]*?\.hub-scrub-slider:active ~ \.hub-scrub-playhead\s*\{[^}]*opacity:\s*1;/s,
  "The classic timeline handle must appear on hover, keyboard focus, and active scrubbing");
assert.match(source, /durationLabel\.textContent = `−\$\{formatDuration\(Math\.max\(0, duration - currentTime\)\)\}`/,
  "The right-side waveform label must show time remaining with a minus sign");
assert.match(musicBarSettingsSource, /createVisualizerSettings[\s\S]*?createSettingsToggle\([\s\S]*?Enable music bar visualizer[\s\S]*?musicBarVisualizer = active \? runtimeState\.musicBarVisualizerType : "off"[\s\S]*?syncMusicBarVisualizer\(\)/,
  "A dedicated Visualizer settings section must expose an immediate enable switch while remembering its selected type");
assert.match(musicBarSettingsSource, /Visualizer style[\s\S]*?\{ value: "glow", label: "Ambient" \}[\s\S]*?\{ value: "spectrum", label: "Spectrum" \}[\s\S]*?musicBarVisualizerType = MUSIC_BAR_VISUALIZER_TYPES\.includes\(nextType\)[\s\S]*?musicBarVisualizer = runtimeState\.musicBarVisualizerType/,
  "The Visualizer section must expose concise Ambient and Spectrum type labels");
assert.match(musicBarSettingsSource, /ariaLabel: "Visualizer opacity"[\s\S]*?defaultValue: 100[\s\S]*?max: 400[\s\S]*?min: 10[\s\S]*?musicBarVisualizerOpacity = nextOpacity[\s\S]*?syncMusicBarVisualizer\(\)/,
  "The Visualizer section must expose a live typeable opacity control from 10% to 400%");
assert.match(musicBarSettingsSource, /ariaLabel: "Visualizer width"[\s\S]*?musicBarVisualizerWidth = nextWidth[\s\S]*?ariaLabel: "Visualizer height"[\s\S]*?musicBarVisualizerHeight = nextHeight/,
  "The Visualizer section must expose independent width and height controls");
assert.match(musicBarSettingsSource, /input\.addEventListener\("dblclick"[\s\S]*?setValue\("auto"\)/,
  "Visualizer dimensions must reset to Auto on double-click");
assert.match(musicBarSettingsSource, /ariaLabel: "Visualizer blend mode"[\s\S]*?VISUALIZER_BLEND_MODES\.includes\(nextBlendMode\)/,
  "The Visualizer section must expose a validated blend-mode picker");
assert.match(runtimeShellSource, /musicBarVisualizerWidth[\s\S]*?style\.setProperty\("width", `\$\{width\}px`\)[\s\S]*?style\.setProperty\("height", `\$\{height\}px`\)[\s\S]*?--hub-spectrum-blend-mode/,
  "Visualizer dimension and blend-mode overrides must be applied to the live visualizer");
assert.match(settingsPickerSource, /hub-settings-picker[\s\S]*?renderPreview[\s\S]*?hub-settings-combobox-preview[\s\S]*?role", "listbox"/,
  "All Player dropdowns must use the icon-capable settings picker");
assert.match(css, /data-visualizer="glow"\]\.is-playing \.hub-player-visualizer\s*\{[^}]*opacity:\s*var\(--hub-visualizer-opacity, 1\);/s,
  "The active glow must use the saved opacity with its 100% default");
assert.match(runtimeShellSource, /<canvas class="hub-player-spectrum" width="1200" height="120"><\/canvas>/,
  "The peak spectrum must use a high-resolution canvas rather than morphing a decorative SVG");
assert.match(css, /data-visualizer="spectrum"\][\s\S]*?\.hub-player-spectrum\s*\{[^}]*display:\s*block;[\s\S]*?data-visualizer="spectrum"\]\.is-playing \.hub-player-visualizer\s*\{[^}]*opacity:\s*var\(--hub-visualizer-opacity, 1\);/s,
  "Spectrum mode must reveal its canvas layer and respect the shared visualizer opacity");
assert.doesNotMatch(css, /data-visualizer="spectrum"\] \.hub-player-visualizer::before\s*\{[^}]*display:\s*none/,
  "Spectrum must retain Ambient's shared glow foundation");
assert.match(css, /data-visualizer="spectrum"\]\.is-playing \.hub-player-visualizer::before\s*\{[^}]*animation-play-state:\s*running;/s,
  "Spectrum's shared ambient foundation must remain sound reactive");
assert.match(css, /\.hub-player-visualizer\s*\{[^}]*mix-blend-mode:\s*var\(--hub-visualizer-blend-mode, multiply\);/s,
  "Ambient blending must happen on the combined visualizer layer so it reaches the player backdrop");
assert.match(css, /data-visualizer="spectrum"\] \.hub-player-visualizer\s*\{[^}]*mix-blend-mode:\s*var\(--hub-spectrum-blend-mode, plus-lighter\);/s,
  "Spectrum blending must happen on the combined visualizer layer so it reaches the player backdrop");
assert.match(css, /\.hub-player-spectrum\s*\{[^}]*bottom:\s*0;[^}]*height:\s*100%;[^}]*mix-blend-mode:\s*normal;/s,
  "The spectrum canvas must join the parent blend group instead of blending inside an opacity-isolated child layer");
assert.match(css, /data-visualizer="glow"\] \.hub-player-spectrum\s*\{[^}]*display:\s*block;[^}]*filter:\s*blur\(2\.2px\) saturate\(1\.18\);[^}]*mix-blend-mode:\s*normal;/s,
  "Ambient glow must reveal a softened FFT layer inside the combined blend group");
assert.match(spectrumRendererSource, /function featherSpectrumEdges[\s\S]*?addColorStop\(0, "rgba\(0, 0, 0, 0\)"\)[\s\S]*?addColorStop\(0\.14, "#000"\)[\s\S]*?addColorStop\(0\.86, "#000"\)[\s\S]*?addColorStop\(1, "rgba\(0, 0, 0, 0\)"\)[\s\S]*?globalCompositeOperation = "destination-in"[\s\S]*?fillRect\(0, 0, width, height\)/,
  "The rendered spectrum pixels must feather at both horizontal edges instead of relying on a clipped container glow");
assert.match(spectrumRendererSource, /function spectrumAnalyzerContour[\s\S]*?Math\.max\(257, spectrum\.length\)[\s\S]*?overallEnergy = spectrum\.reduce[\s\S]*?frequencyPosition = horizontal \* lastBand[\s\S]*?localContrast = \(energy - nearby\) \* 0\.9[\s\S]*?centreEnvelope = Math\.pow\(Math\.sin\(Math\.PI \* horizontal\), 0\.84\)[\s\S]*?bodyAmplitude[\s\S]*?detailAmplitude/,
  "Spectrum must place dense frequency detail on Ambient's centre-weighted silhouette");
assert.doesNotMatch(spectrumRendererSource, /function spectrumAnalyzerContour[\s\S]*?Math\.max\(0\.16, \.\.\.spectrum\)|Math\.min\(height \* 0\.62, amplitude\)/,
  "Spectrum must not normalize each frame to a shared peak or clamp it against a hard contour ceiling");
assert.match(spectrumRendererSource, /function drawLiveSpectrum[\s\S]*?lineWidth = 4\.5[\s\S]*?shadowBlur = 28[\s\S]*?lineWidth = 1\.55[\s\S]*?shadowBlur = 6/,
  "The live FFT renderer must use a thin ridge with a broad, softly fading halo");
assert.doesNotMatch(spectrumRendererSource.match(/function drawLiveSpectrum[\s\S]*?function featherSpectrumEdges/)?.[0] || "", /context\.fill\(|traceSpectrumContour\(context, points, height, true\)/,
  "Spectrum must render only its analyzer lines without a solid fill beneath them");
assert.doesNotMatch(spectrumRendererSource, /function drawSpectrumFoundation|drawSpectrumFoundation\(/,
  "Spectrum must not render a second independent foundation edge beneath its ridge");
assert.match(spectrumRendererSource, /function flowingColour[\s\S]*?weights = \[0, 1, 2\][\s\S]*?colours\.reduce[\s\S]*?for \(let index = 0; index <= 32[\s\S]*?flowingColour\(colours, position, phase, cycles\)/,
  "Every spectrum gradient stop must be a live mixture of all three theme colours");
assert.match(spectrumRendererSource, /function ambientSpectrumContour[\s\S]*?pointCount = 65[\s\S]*?primary \* 0\.78[\s\S]*?localContrast = \(primary - nearby\) \* 0\.86[\s\S]*?localPeak[\s\S]*?centreEnvelope[\s\S]*?function drawAmbientGlow[\s\S]*?context\.clip\(\)[\s\S]*?cellCount = 13[\s\S]*?createRadialGradient/,
  "Ambient mode must combine a centre-shaped FFT contour with overlapping local colour cells");
assert.match(spectrumRendererSource, /centreEnvelope = Math\.pow\(Math\.sin\(Math\.PI \* horizontal\), 0\.84\)/,
  "Ambient mode must taper to true zero-height points at both horizontal edges");
assert.match(spectrumRendererSource, /localPeak = softLimitPeak\(localEnergy \+ localContrast\)[\s\S]*?Math\.pow\(localPeak, 1\.18\) \* 0\.5[\s\S]*?shadowBlur = 16[\s\S]*?Math\.min\(height \* 0\.52, Math\.max\(width \/ 30, peakHeight \* 1\.05\)\)/,
  "Ambient peaks must use soft compression and retain headroom instead of flattening against the canvas ceiling");
assert.match(spectrumRendererSource, /function syncCanvasResolution[\s\S]*?getBoundingClientRect[\s\S]*?devicePixelRatio[\s\S]*?canvas\.width !== targetWidth[\s\S]*?canvas\.height !== targetHeight[\s\S]*?setTransform\?\.\(pixelRatio, 0, 0, pixelRatio, 0, 0\)/,
  "The spectrum canvas must render at its displayed dimensions and device density instead of being non-uniformly stretched");
assert.match(spectrumRendererSource, /dataset\?\.visualizer === "glow"[\s\S]*?drawAmbientGlow[\s\S]*?featherSpectrumEdges[\s\S]*?return;/,
  "Ambient mode must draw from the real FFT instead of relying only on decorative CSS blooms");
assert.match(spectrumRendererSource, /topPadding = Math\.min\(10, height \* 0\.14\)[\s\S]*?contourHeight = Math\.max\(1, height - topPadding\)[\s\S]*?insetContour\(spectrumAnalyzerContour\(bins, width, contourHeight\), topPadding\)[\s\S]*?drawLiveSpectrum\(context, points/,
  "Spectrum must reserve enough canvas headroom for its halo to fade without clipping");
assert.match(spectrumRendererSource, /elapsed \/ 44000 \* Math\.PI \* 2[\s\S]*?const phase = r\.\$spectrumColourPhase \|\| 0[\s\S]*?spectrumGradient\(context, width, colours, phase, r\.\$player\?\.dataset\?\.visualizer === "weave" \? 0\.85 : 2\)/,
  "The mixed spectrum colour field must drift slowly across the analyzer");
assert.match(playerShellSource, /values\.spectrum\.length \|\| reducedMotion[\s\S]*?drawSpectrumAnalyzer\(r, values\.spectrum, reactive, visualizerIntensity\)[\s\S]*?dataset\.spectrumSource = values\.spectrum\.length \? "fft" : "none"/,
  "Only real FFT-bin samples may activate the dynamic spectrum renderer");
assert.match(playerShellSource, /visualizerIntensity = Math\.max\(1, Math\.min\(4,[\s\S]*?"bloom-opacity": Math\.min\(1, \(r\.\$player\.dataset\.visualizer === "firefly"[\s\S]*?: 0\.12 \+ values\.level \* 0\.26\) \* visualizerIntensity\)/,
  "Values above 100% must strengthen the internal bloom instead of being silently clamped by CSS opacity");
assert.match(playerShellSource, /"bass-height": `\$\{76 \+ leftEnergy \* 64\}%`[\s\S]*?"high-height": `\$\{76 \+ rightEnergy \* 64\}%`[\s\S]*?"mid-height": `\$\{104 \+ centreEnergy \* 104\}%`[\s\S]*?scale: \(0\.38 \+ values\.level \* 0\.68\)/,
  "The ambient CSS body must stay below its former ceiling while retaining reactive variation");
assert.doesNotMatch(source, /setAttribute\("aria-label", "Music bar visualizer"\)/,
  "The visualizer toggle must not remain buried in the music-bar layout grid");
assert.match(playerShellSource, /displayIsPlaying = Boolean\(audibleDiscover \|\| runtimeLive\.isPlaying\)/,
  "Playing state must cover Discover's own audible playback as well as Bandkit's runtime");
assert.match(playerShellSource, /preserveVisualizerMotion = playbackLoading && r\.\$player\.classList\.contains\("is-playing"\)[\s\S]*?classList\.toggle\("is-playing", hasCurrentTrack && \(displayIsPlaying \|\| preserveVisualizerMotion\)\)/,
  "An active visualizer must keep its animation state through a track handoff without making an idle load animate");
assert.match(offscreenSource, /createAnalyser\(\)/, "The ambient visualizer must attach an analyser to the playback audio graph");
assert.match(offscreenSource, /getByteFrequencyData/, "The ambient visualizer must sample live frequency energy");
assert.match(offscreenSource, /fftSize: 4096[\s\S]*?maxDecibels: -6[\s\S]*?smoothingTimeConstant: 0\.08[\s\S]*?fall = transitioning \? 0\.055 : 0\.28[\s\S]*?target > smoothedSpectrum\[index\] \? 0\.88 : fall[\s\S]*?target > level \? 0\.68 : transitioning \? 0\.045 : 0\.12/,
  "The visualizer must retain fast peak attack and use a gentler decay only while sources are changing");
assert.match(offscreenSource, /interval = \(playing && !audio\.ended\) \|\| transitioning \? ACTIVE_SAMPLE_INTERVAL_MS : IDLE_SAMPLE_INTERVAL_MS/,
  "Track handoffs must retain the active animation cadence without making a genuine pause expensive");
assert.match(offscreenSource, /visualizerHandoffUntil = Date\.now\(\) \+ 240[\s\S]*?status = "loading"/,
  "A replacement track must retain a short visual handoff window while Chromium warms its new analyser buffer");
assert.match(offscreenSource, /status = "playing";\s*visualizerHandoffUntil = Date\.now\(\) \+ 240/,
  "The analyser warm-up window must restart when replacement playback actually begins");
assert.match(offscreenSource, /ACTIVE_SAMPLE_INTERVAL_MS = 33[\s\S]*?nextSampleAt \+= interval[\s\S]*?setTimeout\(sample, Math\.max\(0, nextSampleAt - now\)\)/,
  "Analyzer deadlines must exclude sampling cost and avoid accumulated timer drift");
assert.match(backgroundSource, /VISUALIZER_BROADCAST_INTERVAL_MS = 32[\s\S]*?function scheduleVisualizerBroadcast[\s\S]*?if \(visualizerBroadcastTimer \|\| visualizerBroadcastRunning \|\| !pendingVisualizerSignal\) return[\s\S]*?function flushVisualizerBroadcast[\s\S]*?pendingVisualizerSignal = null[\s\S]*?function queueVisualizerBroadcast[\s\S]*?pendingVisualizerSignal = signal/,
  "Visualizer messages must be latest-frame coalesced so delayed browser work cannot create a burst backlog");
assert.match(playerShellSource, /createVisualizerFrameQueue\([\s\S]*?visible: \(\) => !document\.hidden/,
  "The player must use the tested latest-frame queue and skip invisible visualizers");
assert.match(playerShellSource, /VISUALIZER_BLOOM_INTERVAL_MS = 96[\s\S]*?\$visualizerBloomUpdatedAt[\s\S]*?style\.setProperty/,
  "The supporting CSS bloom must not trigger a style repaint for every FFT frame");
assert.match(spectrumRendererSource, /\$spectrumCanvasSize[\s\S]*?getBoundingClientRect[\s\S]*?\$spectrumColourCache[\s\S]*?updatedAt < 500/,
  "Canvas geometry and theme colours must be cached across animation frames");
assert.match(offscreenSource, /SPECTRUM_BAND_COUNT = 320[\s\S]*?function logarithmicSpectrum[\s\S]*?spectrum: Array\.from\(smoothedSpectrum/,
  "The audio engine must send a dense logarithmic FFT profile instead of only broad energy summaries");
assert.match(playerShellSource, /signal\.spectrum\.slice\(0, 320\)[\s\S]*?\/ 255/,
  "The player must retain the complete high-resolution FFT profile supplied by the audio engine");
assert.match(source, /OFFSCREEN_VISUALIZER[\s\S]*?VISUALIZER_STATE|VISUALIZER_STATE[\s\S]*?OFFSCREEN_VISUALIZER/,
  "Live visualizer samples must reach Bandcamp content tabs");
assert.match(css, /\.hub-player-visualizer\s*\{[^}]*left:\s*50%;[^}]*mask-image:\s*linear-gradient\(90deg, transparent 0%, transparent 1%, #000 14%, #000 86%, transparent 99%, transparent 100%\);[^}]*right:\s*auto;[^}]*width:\s*100%;[^}]*transform:\s*translateX\(-50%\);/s,
  "The ambient glow must use a true horizontal alpha feather so boosted opacity cannot reveal rectangular side edges");
assert.doesNotMatch(css, /\.hub-player-visualizer\s*\{[^}]*ellipse 72% 125%/s,
  "The ambient container must not force every FFT frame back into a stretched ellipse");
assert.match(css, /\.hub-player-visualizer\s*\{[^}]*bottom:\s*0;[^}]*height:\s*56px;[^}]*overflow:\s*hidden;/s,
  "The visualizer must originate at the music bar's bottom edge without leaking below it");
assert.match(css, /\.hub-play-button\s*\{[^}]*height:\s*48px;[^}]*width:\s*48px;[\s\S]*?\.hub-play-button \.hub-button-icon\s*\{[^}]*height:\s*26px;[^}]*width:\s*26px;/s,
  "The primary playback control must have a visibly larger icon and hit target");
assert.match(css, /\.hub-skip-button:is\(:hover, :focus-visible\)\s*\{[^}]*transform:\s*scale\(1\.16\);[\s\S]*?\.hub-skip-icon\s*\{[^}]*height:\s*16px;[^}]*width:\s*16px;/s,
  "Previous and next must use smaller glyphs with a clear grow-on-hover response");
assert.match(css, /\.hub-player \.hub-player-actions \.hub-skip-button:is\(:hover, :focus-visible\)\s*\{[^}]*transform:\s*scale\(1\.16\);/s,
  "The direct skip-button hover must outrank the player-level reveal transform");
assert.match(css, /\.hub-player-visualizer::before\s*\{[^}]*mix-blend-mode:\s*normal/s,
  "The glow must join the parent blend group before the group reaches the music-bar surface");
assert.match(visualizerThemeSource, /"--hub-visualizer-blend-mode": dark \? "screen" : "multiply"/,
  "Light and dark themes must select an appropriate visualizer surface blend");
assert.match(visualizerThemeSource, /"--hub-spectrum-blend-mode": dark \? "plus-lighter" : "multiply"/,
  "The spectrum must use additive light on dark themes and retain contrast on light themes");
assert.match(css, /\.hub-scrub-waveform-remaining\s*\{[^}]*filter:\s*none;[^}]*mix-blend-mode:\s*var\(--hub-visualizer-blend-mode, normal\);[^}]*color-mix\(in srgb, var\(--hub-scrub-remaining\) 72%, var\(--hub-panel-ink\) 28%\)/s,
  "The unplayed waveform must stay crisp while retaining its adaptive foreground colour");
assert.match(playerShellSource, /leftEnergy = values\.level \* 0\.8 \+ values\.bass \* 0\.2[\s\S]*?rightEnergy = values\.level \* 0\.8 \+ values\.high \* 0\.2/,
  "Outer blooms must weight overall energy equally so bass-heavy tracks do not pull the visualizer left");
assert.match(playerShellSource, /"bass-height": `\$\{76 \+ leftEnergy \* 64\}%`[\s\S]*?"mid-height": `\$\{104 \+ centreEnergy \* 104\}%`[\s\S]*?scale: \(0\.38 \+ values\.level \* 0\.68\)/,
  "Live energy must remain clearly reactive without driving the ambient blooms into the container ceiling");
assert.match(playerShellSource, /"mix-a": `\$\{15 \+ values\.mid \* 8 - values\.high \* 3\}%`[\s\S]*?"mix-c": `\$\{50 \+ \(values\.high - values\.bass\) \* 7\}%`[\s\S]*?"mix-e": `\$\{85 \+ values\.mid \* 3 - values\.bass \* 8\}%`/,
  "The interleaved colour field must shift symmetrically with the live frequency signal");
assert.match(css, /--hub-visualizer-field-a:[^;]*var\(--hub-visualizer-warm\)[^;]*var\(--hub-visualizer-hot\)[^;]*var\(--hub-visualizer-cool\)[\s\S]*?--hub-visualizer-field-e:[^;]*var\(--hub-visualizer-hot\)[^;]*var\(--hub-visualizer-warm\)[^;]*var\(--hub-visualizer-cool\)/,
  "Every ambient colour field entry must mix all three connected theme colours");
assert.match(css, /\.hub-player-visualizer::before\s*\{[^}]*animation:\s*hub-player-glow-drift 32s[\s\S]*?var\(--hub-visualizer-field-c\)[\s\S]*?var\(--hub-visualizer-field-e\)[\s\S]*?var\(--hub-visualizer-field-a\)[\s\S]*?var\(--hub-visualizer-field-b\)[\s\S]*?var\(--hub-visualizer-field-d\)[^}]*background-blend-mode:\s*screen;/,
  "The ambient visualizer must use five overlapping mixed-colour blooms with a slow shared drift");
assert.doesNotMatch(css, /\.hub-player-visualizer::after\s*\{/,
  "The ambient visualizer must not render a hard baseline beneath its diffuse colour blooms");
assert.match(playerShellSource, /for \(const name of \["level", "bass", "mid", "high"\]\)/,
  "Visualizer energy values must be formatted consistently before the glow is updated");
assert.doesNotMatch(playerShellSource, /Object\.entries\(values\)/,
  "Visualizer CSS updates must remain limited to the explicit energy values");
assert.match(css, /\.hub-player-visualizer::before\s*\{[^}]*transform:\s*translate3d\(-3%, 7px, 0\)[\s\S]*?@keyframes hub-player-glow-drift[\s\S]*?translate3d\(-4%, 7px, 0\)[\s\S]*?translate3d\(4%, 5px, 0\)/s,
  "The ambient visualizer bloom must sit low in the music bar");
assert.match(css, /--hub-visualizer-cool:\s*var\(--hub-visualizer-color-3,[\s\S]*?--hub-visualizer-hot:\s*var\(--hub-visualizer-color-2,[\s\S]*?--hub-visualizer-warm:\s*var\(--hub-visualizer-color-1,/,
  "Every ambient glow colour must use the active theme's visualizer palette with linked fallbacks");
assert.match(visualizerThemeSource, /"--hub-visualizer-color-1"[\s\S]*?"--hub-visualizer-color-2"[\s\S]*?"--hub-visualizer-color-3"/,
  "Theme application must provide the visualizer's three connected colours");
assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.hub-player-visualizer::before\s*\{[^}]*animation:\s*none;/,
  "Reduced-motion users must receive a static glow");
assert.doesNotMatch(source, /hub-player-meta/, "The music bar must not add a third metadata line");
assert.match(source, /Show in music bar[\s\S]*?hub-music-bar-analysis-toggle[\s\S]*?showMusicBarAnalysis = state\.showMusicBarAnalysis === false/, "The expanded analysis section must let users hide music-bar analysis");
assert.match(musicBarSettingsSource, /styleSettings\.append\([\s\S]*?createPlayerSettingRow\("Style"[\s\S]*?createDynamicColorSetting\(r, playerColourRow\),\s*playerColourRow/,
  "The Style group must include layout, dynamic colour and its player-colour override");
assert.doesNotMatch(musicBarSettingsSource, /group\.append\([^)]*createFrostedGlassSetting/, "Surface controls must no longer render inside Player settings");
assert.match(coreSource, /function enableRangeReset[\s\S]*?dblclick[\s\S]*?dispatchEvent\(new Event\("input"[\s\S]*?dispatchEvent\(new Event\("change"/, "Range controls must share a double-click reset helper");
assert.match(musicBarSettingsSource, /ariaLabel: "Custom corner radius"[\s\S]*?defaultValue: 12[\s\S]*?max: 32[\s\S]*?min: 0[\s\S]*?suffix: "px"/,
  "Custom corner radius must use the resettable pixel-based scrubbable control");
assert.match(musicBarSettingsSource, /ariaLabel: "Frosted glass transparency"[\s\S]*?defaultValue: 20[\s\S]*?ariaLabel: "Frosted glass blur"[\s\S]*?defaultValue: 20[\s\S]*?suffix: "px"/,
  "Glass transparency and blur must use resettable scrubbable controls with their correct units");
assert.match(musicBarSettingsSource, /ariaLabel: "Visualizer opacity"[\s\S]*?defaultValue: 100/,
  "The scrubbable visualizer percentage must expose its 100% default");
assert.match(runtimeShellSource, /enableRangeReset\(r\.\$scrubSlider, 0\)/, "The playback slider must reset to the beginning on double-click");
assert.match(source, /controls\.hidden = !enabled[\s\S]*?controls\.hidden = !active/, "Glass detail controls must stay hidden until Glass is selected");
assert.match(source, /const showPlayerAnalysis = state\.djToolsEnabled !== false[\s\S]*?state\.showMusicBarAnalysis !== false[\s\S]*?playerAnalysis\.hidden = !showPlayerAnalysis/, "The music bar must respect both its DJ master and analysis visibility settings");
assert.match(source, /matchingQueueTrack\(\[seamless\.track\], displayTrack\)/,
  "Music-bar EP fallback must be limited to the identity-matched active queue track");
assert.match(source, /hub-player-secondary[\s\S]*?hub-player-artist[\s\S]*?hub-player-secondary-separator[\s\S]*?hub-player-album/,
  "Music-bar second line must give artist and EP separate link targets");
assert.match(source, /updatePageLink\(playerArtist,[\s\S]*?updatePageLink\(playerAlbum,/,
  "Music-bar artist and EP links must be updated independently");
assert.match(source, /hub-player-key-name[\s\S]*?hub-player-key-camelot/,
  "Music-bar musical key must appear before its Camelot value");
assert.match(css, /\.hub-player \.hub-track-title\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*15px;/s,
  "Music-bar title must retain a compact line box above its credits");
assert.match(css, /\.hub-player-track\s*\{[^}]*transform:\s*translateY\(-2px\);/s,
  "The grouped music-bar metadata must sit clear of the timeline time readout");
assert.match(css, /\.hub-player \.hub-player-secondary\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*14px;/s,
  "Music-bar artist and EP must share one equal-sized, closely grouped line");
assert.match(css, /\.hub-player \.hub-player-secondary :is\(\.hub-player-artist, \.hub-player-album\)\s*\{[^}]*font-size:\s*inherit;[^}]*line-height:\s*inherit;/s,
  "Music-bar artist and EP links must not pick up mismatched generic track typography");
assert.match(css, /\.hub-player-analysis:not\(\[hidden\]\) \+ \.hub-dj-player-button\s*\{[^}]*margin-left:\s*8px;/s,
  "Music-bar DJ control must have additional space after key metadata");
assert.match(css, /\.hub-player-content\s*\{[^}]*container-name:\s*hub-player-content;[^}]*container-type:\s*inline-size;/s,
  "The player must expose its real content width to responsive metadata rules");
assert.match(css, /:is\(\.hub-player-analysis,\.hub-dj-key\):is\(:hover,:focus-within,.is-deep-analyzing\):not\(\.is-deep-analysis-result\) > :not\(\.bandkit-deep-analysis\)\s*\{[^}]*opacity:\s*0;/s,
  "Hovering BPM and key must replace their values with the rescan action without changing layout width");
assert.match(css, /:is\(\.hub-player-analysis,\.hub-dj-key\)\.is-deep-analysis-result > :not\(\.bandkit-deep-analysis\)\s*\{[^}]*opacity:\s*1;[^}]*\}[\s\S]*?is-deep-analysis-result \.bandkit-deep-analysis\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
  "Music-bar and DJ results must remain visible until the pointer leaves their metadata region");
assert.match(css, /@container hub-player-content \(max-width:\s*760px\)\s*\{[\s\S]*?\.hub-player-analysis\s*\{[^}]*display:\s*none\s*!important;[\s\S]*?\.hub-player-analysis \+ \.hub-dj-player-button\s*\{[^}]*margin-left:\s*0;/s,
  "BPM and key must yield at the next compact breakpoint before overlapping the DJ control");
assert.match(css, /@container hub-player-content \(max-width:\s*760px\)[\s\S]*?\.hub-player\.is-compact \.hub-player-analysis:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex\s*!important;/s,
  "Compact one-row mode must preserve BPM, key, and Camelot while letting its waveform yield space");
assert.match(css, /data-player-style="zune"\] \.hub-player-analysis:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex\s*!important;/s,
  "Zune must keep detected BPM and key eligible for display at every responsive content width");
assert.match(css, /data-player-style="docked"\] \.hub-player-analysis:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex\s*!important;/s,
  "Dock must preserve detected BPM and key even when resized below 760px");
assert.match(css, /data-player-style="docked"\] \.hub-player-content\s*\{[^}]*height:\s*var\(--hub-player-height\);/s,
  "Dock must reserve its added height below the controls for the visualizer");
assert.match(css, /height:\s*calc\(var\(--hub-player-height\) \+ var\(--hub-dock-visualizer-clearance, 0px\) \+ var\(--hub-player-offset, 0px\)\)/,
  "Visualizer clearance and the user height offset must expand only the outer dock, never the art sizing token");
assert.match(css, /\.hub-panel\.is-contextual\[data-player-style="docked"\]\s*\{[^}]*bottom:\s*calc\(var\(--hub-player-height\) \+ var\(--hub-dock-visualizer-clearance, 0px\) \+ var\(--hub-player-bottom-gap\) \+ var\(--hub-panel-player-gap\)\);/s,
  "Dock panels must clear the added visualizer lane as well as the content row");
assert.match(css, /data-player-style="zune"\] \.hub-player-analysis \.bandkit-deep-analysis:not\(\[hidden\]\)\s*\{[^}]*display:\s*inline-flex\s*!important;/s,
  "Zune must keep the BPM deep-scan action eligible at every responsive content width");
assert.doesNotMatch(css, /\.hub-player\.is-compact \.hub-player-key-name\s*\{[^}]*display:\s*none/s,
  "Compact mode must not suppress the musical key name");
assert.match(css, /\.hub-player-analysis-badge\s*\{[^}]*color:\s*var\(--hub-muted\);[^}]*font-size:\s*11px;[^}]*font-weight:\s*700;/s,
  "Music-bar BPM and key must render as subdued larger plain text");
assert.doesNotMatch(css, /\.hub-player-analysis-badge\s*\{[^}]*(?:background|border|border-radius|padding):/s,
  "Music-bar BPM and key must not use chip styling");
assert.match(css, /\.hub-player-analysis\s*\{[^}]*display:\s*flex;[^}]*gap:\s*4px;/s,
  "Music-bar BPM and key must retain a small gap");
assert.doesNotMatch(css, /\.hub-player-analysis[^}]*::before\s*\{[^}]*content:\s*"·"/s,
  "Music-bar BPM and key must not include a dot separator");
assert.match(source, /hub-previous-button[\s\S]*?hub-skip-icon[\s\S]*?--hub-skip-icon[\s\S]*?hub-next-button[\s\S]*?hub-skip-icon/,
  "music-bar Previous and Next must render their shared glyph as a themeable mask");
assert.match(css, /\.hub-play-button\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid transparent;[^}]*color:\s*var\(--hub-playback-color, var\(--hub-accent\)\);[^}]*height:\s*48px;[^}]*width:\s*48px;[\s\S]*?\.hub-play-button \.hub-button-icon\s*\{[^}]*height:\s*26px;[^}]*width:\s*26px;/s,
  "music-bar Play and Pause must use a larger accent glyph inside an invisible hit area");
assert.match(css, /\.hub-skip-button\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--hub-playback-color, var\(--hub-accent\)\);[^}]*height:\s*36px;[^}]*width:\s*36px;[\s\S]*?\.hub-skip-icon\s*\{[^}]*background:\s*currentColor;[^}]*height:\s*16px;[^}]*mask:\s*var\(--hub-skip-icon\)/s,
  "music-bar Previous and Next must use accent glyphs inside generous invisible hit areas");
assert.match(css, /\.hub-play-button:hover,[\s\S]*?background:\s*transparent;[^}]*filter:\s*none;[\s\S]*?\.hub-skip-button:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*transparent;[^}]*filter:\s*none;/s,
  "transport controls must use glyph-only interaction feedback without icon glow or visible button backings");
assert.doesNotMatch(css, /\.hub-player\.is-compact \.hub-player-content\s*\{[^}]*max-width:\s*none/s, "Compact mode must not override the standard default width");
assert.match(css, /data-content-width="tight"[^}]*max-width:\s*640px/s, "Tight width must cap player content at 640px");
assert.match(css, /data-content-width="default"[^}]*max-width:\s*800px/s, "Default width must explicitly restore the 800px content cap");
assert.match(css, /data-content-width="wide"[^}]*width:\s*min\(1120px/s, "Wide width must cap player content at 1120px");
assert.match(css, /data-content-width="wide"[^}]*margin-left:\s*auto;[^}]*margin-right:\s*auto/s, "Wide width must remain centred");
assert.match(css, /data-content-width="full"[^}]*width:\s*calc\(100%/s, "Full width must use the available player span");
assert.match(css, /data-content-width="custom"[^}]*var\(--hub-player-custom-width, 900px\)/s, "Custom width must reach the player content rule");
assert.match(css, /\.hub-settings-select\s*\{[^}]*appearance:\s*none;[^}]*background-position:\s*right 18px center, right 13px center/s, "Settings combobox chevrons must sit comfortably inside the right edge");
assert.match(css, /\.hub-player-setting-row,\s*\.hub-settings-detail \.hub-settings-row:not\(\.hub-appearance-mode-row\),\s*\.hub-settings-detail \.hub-appearance-mode-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s,
  "Player controls must use compact label and value rows");
assert.match(css, /\.hub-player-content\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\);[^}]*height:\s*100%;/s,
  "The player must reserve a full-height leading column for artwork");
assert.match(css, /\.hub-player-art-link\s*\{[^}]*height:\s*100%;[^}]*width:\s*var\(--hub-player-height\);[\s\S]*?\.hub-player-art-link \.hub-art\s*\{[^}]*height:\s*100%;[^}]*object-fit:\s*cover;[^}]*width:\s*100%;/s,
  "Floating artwork must fill and crop to the complete height of the music bar");
assert.match(css, /\.hub-player-art-link\s*\{[^}]*border-radius:\s*8px 0 0 8px;[\s\S]*?:host\(\[data-corner-style="square"\]\) \.hub-player-art-link\s*\{[^}]*border-radius:\s*0\s*!important;[\s\S]*?:host\(\[data-corner-style="custom"\]\) \.hub-player-art-link\s*\{[^}]*border-radius:\s*var\(--hub-custom-corner-radius, 12px\) 0 0 var\(--hub-custom-corner-radius, 12px\)\s*!important;/s,
  "Floating artwork must clip only its outer left corners in Rounded and Custom modes and stay square in Square mode");
assert.match(css, /\.hub-player\[data-player-style="docked"\] \.hub-player-art-link\s*\{[^}]*align-self:\s*center;[^}]*border-radius:\s*8px;[^}]*height:\s*calc\(100% - 16px\);[^}]*margin:\s*8px;[^}]*width:\s*calc\(var\(--hub-player-height\) - 16px\);/s,
  "Docked artwork must have an even inset and equal rounding on every corner");
assert.match(css, /\.hub-player\[data-player-style="docked"\] \.hub-player-main\s*\{[^}]*padding-left:\s*4px;/s,
  "Docked artwork inset must preserve the established gap before track metadata");
assert.match(css, /:host\(\[data-corner-style="square"\]\) \.hub-player\[data-player-style="docked"\] \.hub-player-art-link\s*\{[^}]*border-radius:\s*0\s*!important;[\s\S]*?:host\(\[data-corner-style="custom"\]\) \.hub-player\[data-player-style="docked"\] \.hub-player-art-link\s*\{[^}]*border-radius:\s*var\(--hub-custom-corner-radius, 12px\)\s*!important;/s,
  "Docked artwork must apply Square or Custom corner treatment equally on all four sides");
assert.match(css, /\.hub-player-art-link \.hub-art\s*\{[^}]*border-radius:\s*0\s*!important;/s,
  "The artwork image must remain square so its wrapper alone controls edge clipping");
assert.match(playerShellSource, /function setPlayerArtwork[\s\S]*?document\.createElement\("img"\)[\s\S]*?addEventListener\("load"[\s\S]*?crossfadePlayerArtwork[\s\S]*?addEventListener\("error"[\s\S]*?\$playerArtLink\.hidden = true/,
  "Artwork must be validated off-screen and crossfaded only after the replacement image has loaded");
assert.match(playerShellSource, /function crossfadePlayerArtwork[\s\S]*?hub-player-art-outgoing[\s\S]*?cloneNode\(false\)[\s\S]*?restartPlayerEntry\(r\.\$playerArt\)/,
  "Track changes must retain an outgoing artwork layer while the replacement animates in");
assert.match(playerShellSource, /restartPlayerEntry\(r\.\$playerTrack\.querySelector\("\.hub-track-copy"\)\)/,
  "Track metadata must animate as one stable block when its identity changes");
// Handoff presentation (retain across missing snapshots, replacement metadata, and explicit
// clear) now lives in src/content/player-presentation.js and is covered behaviourally by
// tests/player-presentation-smoke.mjs. Only the wiring is checked here.
assert.match(playerShellSource, /resolvePlayerPresentation\(r\.\$selectedPlayerTrack, candidateTrack,[\s\S]*?r\.\$nowPlayingExplicitlyCleared\)/,
  "The player must resolve its presentation through the shared handoff rules, including explicit clears");
assert.match(css, /@keyframes hub-player-copy-enter[\s\S]*?translateY\(4px\)[\s\S]*?\.hub-player \.hub-track-copy\.is-track-entering\s*\{[^}]*animation:\s*hub-player-copy-enter 220ms/s,
  "Metadata changes must use a short fade-and-rise transition");
assert.match(css, /\.hub-player-art-link \.hub-player-art-outgoing\s*\{[^}]*animation:\s*hub-player-art-leave 240ms[^}]*position:\s*absolute;/s,
  "Outgoing artwork must fade in place without disturbing music-bar layout");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hub-player \.hub-track-copy\.is-track-entering,[\s\S]*?\.hub-player-art-link \.hub-player-art-outgoing,[\s\S]*?\.hub-player:not\(\.is-empty\) \.hub-player-playback-row\s*\{[^}]*animation:\s*none;/s,
  "Track-change and empty-state motion must respect the reduced-motion preference");
assert.match(source, /player\.classList\.toggle\("is-empty", !hasCurrentTrack\)/,
  "The player shell must expose a stable empty state independently of track-copy rendering");
assert.doesNotMatch(source, /hub-player-empty-mark/,
  "The empty player must not render a competing artwork or brand placeholder");
assert.match(css, /\.hub-player\.is-empty \.hub-player-content\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
  "The empty player must collapse the unused artwork column");
assert.match(css, /\.hub-player\.is-empty :is\(\.hub-player-tools, \.hub-player-playback-row\)\s*\{[^}]*display:\s*none !important;/s,
  "An empty player must not expose a waveform, DJ tools, or overflow actions");
assert.match(css, /\.hub-player\.is-empty \.hub-player-actions\s*\{[^}]*left:\s*50%;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*top:\s*50%;[^}]*visibility:\s*hidden;/s,
  "Every empty player style must hide the disabled transport");
assert.match(css, /\.hub-player\.is-empty \.hub-player-actions \.hub-skip-button\s*\{[^}]*display:\s*none !important;[\s\S]*?\.hub-player\.is-empty \.hub-player-actions \.hub-play-button\s*\{[^}]*pointer-events:\s*none;[^}]*transform:\s*none;/s,
  "The empty transport must show only a non-interactive play glyph");
assert.match(css, /\.hub-player\.is-empty \.hub-player-sections\s*\{[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*translate\(-50%, -50%\);[\s\S]*?\.hub-player\.is-empty\[data-player-style="zune"\]\[data-panel-buttons="compact"\] \.hub-player-sections\s*\{[^}]*right:\s*calc\(50% - var\(--hub-player-height\) \/ 2\);/s,
  "Empty Dock and single-button Fade/Float players must center their panel control");
assert.match(css, /\.hub-player\.is-empty\[data-player-style="zune"\]:not\(\[data-player-variant="rounded"\]\)\[data-panel-buttons="compact"\]\s*\{[^}]*--hub-fade-backdrop-width:\s*280px;/s,
  "Empty Fade players must size their feathered surface around the compact chevron");
assert.match(css, /\.hub-player\.is-empty\[data-player-style="zune"\]\[data-player-variant="rounded"\]\[data-panel-buttons="compact"\]\s*\{[^}]*--hub-rounded-card-width:\s*68px;/s,
  "Empty Float players must collapse their rounded surface around the compact chevron");
assert.match(css, /\.hub-player\.is-empty\[data-player-style="zune"\]\[data-player-variant="rounded"\]\[data-panel-buttons\]\[data-visualizer\]\s*\{[^}]*--hub-zune-content-lift:\s*0px;[\s\S]*?\.hub-player-backdrop-glow\s*\{[^}]*bottom:\s*calc\(50% - 34px\);[^}]*height:\s*68px;/s,
  "Empty Float players must hug their centred destinations without retaining the visualizer lift");
assert.match(playerShellSource, /\$panel\.dataset\.playerEmpty = String\(!hasCurrentTrack\)/,
  "The contextual panel must receive the player's empty state for cross-style alignment");
assert.match(playerShellSource, /const empty = r\.\$player\.classList\.contains\("is-empty"\);\s*const contextual = zune \|\| empty;/,
  "Empty Dock panels must use the rendered destination group as their anchor");
assert.match(css, /\.hub-panel\.is-contextual\[data-player-empty="true"\]\[data-player-style="docked"\]\s*\{[^}]*left:\s*var\(--hub-context-panel-left, 12px\);[^}]*right:\s*auto;[^}]*transform:\s*none;/s,
  "Empty Dock panels must align above the centred destination controls");
assert.match(css, /\.hub-settings-picker\.is-open,\s*\.hub-theme-picker\.is-open\s*\{[^}]*z-index:\s*100;/s,
  "Open settings pickers must stack above closed controls and subsequent settings rows");
assert.match(playerShellSource, /\$playButton\.disabled = !hasCurrentTrack \|\| playbackLoading;[\s\S]*?\? "No track selected"/s,
  "The empty play control must be disabled and expose an accurate accessible label");
assert.match(css, /\.hub-player-art-link\[hidden\],[\s\S]*?\.hub-player:is\(\.is-empty, \.has-no-art\) \.hub-player-art-link\s*\{[^}]*display:\s*none;/s,
  "Empty and artwork-less players must collapse the complete artwork column and its outline");
assert.match(css, /\.hub-player-top-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[\s\S]*?\.hub-player-playback-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
  "Metadata and tools must share the top row while the scrubber owns the complete bottom row");
assert.match(css, /\.hub-player-top-row\s*\{[^}]*transform:\s*translateY\(6px\);/s,
  "Track metadata and right-side tools must align with the transport controls' vertical centre");
assert.match(css, /\.hub-player-playback-row\s*\{[^}]*padding-bottom:\s*4px;/s,
  "The lower playback line must sit clear of the music bar's bottom edge");
assert.match(css, /\.hub-scrub-row\s*\{[^}]*justify-self:\s*center;[^}]*width:\s*min\(64%, 1040px\);/s,
  "The inset Medium timeline preset must use the enlarged centred width");
assert.match(css, /data-scrubber-width="small"\] \.hub-scrub-row\s*\{[^}]*width:\s*min\(40%, 680px\);[\s\S]*?data-scrubber-width="full"\] \.hub-scrub-row\s*\{[^}]*width:\s*100%;/s,
  "Music bar timelines must provide smaller and full-width presets");
assert.match(source, /SCRUBBER_HANDLE_SHAPES\s*=\s*\["pill", "circle", "diamond", "star-4", "star-5", "star-6", "butterfly", "lightning", "space-invader", "cat", "custom"\]/,
  "The scrub handle catalogue must retain all ten built-in silhouettes and the custom artwork option");
for (const label of ["Scrub handle shape", "Four-point star", "Five-point star", "Six-point star", "Butterfly", "Lightning bolt", "Space invader", "Cat"]) {
  assert.match(scrubHandlePickerSource, new RegExp(label), `Player settings must expose the ${label} scrub-handle label`);
}
assert.match(scrubHandlePickerSource, /createSettingsPicker\([\s\S]*?Scrub handle shape[\s\S]*?renderPreview: \(shape\) => shape === "custom" \? createButtonIcon\("icon-settings.svg"\) : createHandlePreview\(shape\)/,
  "Scrub-handle settings must build on the shared visual settings picker");
assert.match(settingsPickerSource, /role", "combobox"[\s\S]*?role", "listbox"[\s\S]*?hub-settings-picker-option/,
  "Scrub-handle settings must use the visual accessible picker rather than a text-only select");
assert.match(css, /\.hub-settings-disclosure:has\(:is\(\.hub-theme-picker, \.hub-settings-picker\)\.is-open\)\s*\{[^}]*overflow:\s*visible;/s,
  "The scrub-handle list must escape its disclosure card without being clipped");
assert.match(runtimeShellSource, /SCRUBBER_HANDLE_SHAPES\.includes\(runtimeState\.scrubberHandleShape\)[\s\S]*?host\.dataset\.scrubHandleShape = handleShape[\s\S]*?--hub-scrub-handle-mask[\s\S]*?documentElement\.dataset\.bandkitScrubHandle = handleShape[\s\S]*?--bandkit-scrub-handle-mask/,
  "The selected handle artwork must reach the shadow UI and Bandcamp page players");
assert.match(css, /\.hub-scrub-playhead::before,[\s\S]*?\.hub-scrub-playhead::after[\s\S]*?mask:\s*var\(--hub-scrub-handle-mask\)[\s\S]*?\.hub-scrub-playhead::before\s*\{[^}]*background:\s*var\(--hub-scrub-surface\);[\s\S]*?\.hub-scrub-playhead::after\s*\{[^}]*background:\s*var\(--hub-handle-color, var\(--hub-scrub-accent\)\);[^}]*inset:\s*4px;/s,
  "Every music-bar handle shape must preserve the stronger surface outline and inset accent layer");
assert.match(pagePlayerUiSource, /mask:var\(--bandkit-scrub-handle-mask\) center\/contain no-repeat/,
  "Bandcamp page timelines must use the shared selected handle artwork");
assert.match(pagePlayerUiSource, /bandkit-page-scrub-playhead::after\{background:var\(--bandkit-handle-color,var\(--bandkit-scrub-accent\)\);inset:4px\}/,
  "Bandcamp page timeline handles must use the same stronger outline");
assert.match(pagePlayerUiSource, /renderedStyleColour\(r\.\$scrubWaveformPlayed, "stroke"\)[\s\S]*?renderedStyleColour\(r\.\$scrubWaveformRemaining, "stroke"\)/,
  "Page waveforms must copy the bottom player's rendered played and remaining colours");
assert.match(pagePlayerUiSource, /renderedStyleColour\([\s\S]*?\.hub-scrub-playhead[\s\S]*?"background-color", "::before"[\s\S]*?--bandkit-scrub-surface[\s\S]*?sharedSurfaceValue/,
  "Page waveform handles must copy the bottom player's rendered surface colour");
assert.match(css, /hub-dj-page-tempo-input[\s\S]*?hub-dj-fader-input[\s\S]*?hub-dj-vertical-tempo[\s\S]*?mask:\s*var\(--hub-scrub-handle-mask\)/,
  "The selected handle artwork must cover tempo and DJ fader sliders");
assert.match(coreSource, /function createShapedRange\(input[\s\S]*?hub-shaped-range-handle[\s\S]*?--hub-shaped-range-position[\s\S]*?return \{ element: range, sync \}/,
  "Native range controls must expose a shared positioned two-layer handle");
assert.match(css, /\.hub-shaped-range\.is-vertical \.hub-shaped-range-handle\s*\{[^}]*--hub-shaped-range-handle-rotation:\s*90deg;/s,
  "Vertical DJ faders must rotate their shaped handle by 90 degrees");
for (const sharedHandleUse of [
  /createShapedRange\(tempoSlider\)/,
  /createShapedRange\(control, \{ vertical: true \}\)/
]) assert.match(source, sharedHandleUse,
  "Page tempo and DJ fader sliders must use the shared shaped handle");
assert.match(css, /\.hub-shaped-range-handle::before,[\s\S]*?\.hub-shaped-range-handle::after[\s\S]*?\.hub-shaped-range-handle::before\s*\{[^}]*background:\s*var\(--hub-scrub-surface\);[\s\S]*?\.hub-shaped-range-handle::after\s*\{[^}]*background:\s*var\(--hub-handle-color, var\(--hub-scrub-accent\)\);[^}]*inset:\s*3px;/s,
  "Every native range handle must retain the same strong outer surface layer");
assert.doesNotMatch(css, /drop-shadow/,
  "Music-bar, DJ and settings slider handles must not render glow or drop-shadow effects");
assert.doesNotMatch(pagePlayerUiSource, /drop-shadow/,
  "Bandcamp page timeline handles must not render glow or drop-shadow effects");
for (const shape of ["pill", "circle", "diamond", "star-4", "star-5", "star-6", "butterfly", "lightning", "space-invader", "cat"]) {
  assert.ok(fs.existsSync(new URL(`../assets/icon-scrub-${shape}.svg`, import.meta.url)), `${shape} must have reusable handle artwork`);
}
for (const shape of ["star-4", "star-5", "star-6"]) assert.ok(
  fs.existsSync(new URL(`../assets/icon-scrub-${shape}-rounded.svg`, import.meta.url)),
  `${shape} must have rounded artwork for rounded interface settings`
);
assert.match(runtimeShellSource, /MUSIC_BAR_SCRUBBER_WIDTHS\.includes\(runtimeState\.musicBarScrubberWidth\)[\s\S]*?player\.dataset\.scrubberWidth = width/,
  "The player must expose the persisted timeline width as a styling state");
assert.match(source, /Choose how far the music bar timeline extends[\s\S]*?Music bar timeline width[\s\S]*?\{ value: "small", label: "Small" \}[\s\S]*?\{ value: "default", label: "Medium" \}[\s\S]*?\{ value: "full", label: "Full" \}/,
  "Player settings must expose Small, Medium and Full timeline widths");
assert.match(css, /\.hub-player-actions\s*\{[^}]*left:\s*50%;[^}]*position:\s*absolute;[^}]*top:\s*31%;[^}]*transform:\s*translate\(-50%, -50%\);[^}]*z-index:\s*8;/s,
  "Transport controls must align to the whole music bar's horizontal center and top-row vertical center");
assert.match(css, /\.hub-player-actions\s*\{[^}]*transition:\s*top 260ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/s,
  "The play control must glide from the empty center into its occupied top-row position");
assert.match(css, /@keyframes hub-player-playback-enter[\s\S]*?\.hub-player:not\(\.is-empty\) \.hub-player-playback-row\s*\{[^}]*animation:\s*hub-player-playback-enter 240ms/s,
  "The waveform row must fade into the space revealed by the rising play control");
assert.match(css, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)[\s\S]*?\.hub-player-actions\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*none;[^}]*transform:\s*translate\(-50%, -50%\);[\s\S]*?\.hub-player-actions \.hub-skip-button\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
  "The bare desktop player must retain its central play state while concealing skip controls");
assert.match(css, /\.hub-player:has\(:is\(\.hub-player-content, \.hub-player-actions\):is\(:hover, :focus-within\)\) \.hub-player-actions,[\s\S]*?\.hub-player:has\(\.hub-player-tools \[aria-expanded="true"\]\) \.hub-player-actions\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;[^}]*transform:\s*translate\(-50%, -50%\);/s,
  "Only hover or keyboard focus within the real player region may reveal transport controls");
assert.doesNotMatch(css, /\.hub-player:is\(:hover, :focus-within\) \.hub-player-actions/,
  "Hover or stale focus on the full-width panel launcher area must not reveal transport controls");
assert.doesNotMatch(css, /\.hub-tab\.is-active::after/,
  "Primary panel tabs must not draw an active underline");
assert.doesNotMatch(css, /\.hub-cart-view-tab\.is-active::after/,
  "Cart and playlist view tabs must not draw active underlines");
assert.match(css, /data-panel-open="true"\]:not\(:has\(\.hub-player-content:hover, \.hub-player-content:focus-within, \.hub-player-actions:hover, \.hub-player-actions:focus-within\)\) \.hub-player-actions\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
  "Resting open panels must not reveal or activate transport controls");
assert.match(css, /data-player-style="zune"\]\[data-panel-open="true"\]:not\(:has\(\.hub-player-content:hover, \.hub-player-content:focus-within, \.hub-player-actions:hover, \.hub-player-actions:focus-within\)\) \.hub-player-art-link\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\);/s,
  "A resting open Zune panel must retain artwork without overriding the player-content hover replacement");
assert.match(css, /data-player-style="zune"\]\[data-panel-open="true"\]:has\(\.hub-player-content:hover, \.hub-player-actions:hover\) \.hub-player-actions\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;[^}]*transform:\s*translate\(-50%, -50%\) scale\(1\);[\s\S]*?data-player-style="zune"\]\[data-panel-open="true"\]:has\(\.hub-player-content:hover, \.hub-player-actions:hover\) \.hub-player-art-link\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*transform:\s*scale\(0\.88\);/s,
  "Hovering the real player region with a panel open must replace its artwork with transport controls");
assert.match(css, /data-analysis-visibility="always"\] \.hub-player-tools > :not\(\.hub-player-analysis\)\s*\{[^}]*opacity:\s*0;[^}]*position:\s*absolute;/s,
  "Persistent BPM and key data must not reveal DJ tools over expanded destinations");
assert.match(css, /\.hub-player-tools\s*\{[^}]*justify-content:\s*flex-end;[^}]*justify-self:\s*end;[^}]*min-width:\s*0;/s,
  "Player utilities must occupy the right-hand column of the shared top row");
assert.doesNotMatch(css, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)[\s\S]*?\.hub-player-actions\s*\{[^}]*(?:background|box-shadow|padding):/s,
  "The transport group must not render as a floating surface above the player");
assert.match(css, /\.hub-player:has\(\.hub-player-tools \[aria-expanded="true"\]\) \.hub-player-tools\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  "Opening DJ tools, Now Playing, or overflow must pin the utility controls until that surface closes");
assert.match(css, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)/,
  "Hover-only hiding must stay scoped to devices that actually support precise hover");
assert.match(css, /@media \(max-width:\s*1120px\)\s*\{[\s\S]*?\.hub-player-content,[\s\S]*?data-content-width="full"[\s\S]*?\.hub-player-content\s*\{[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;[^}]*max-width:\s*none;[^}]*width:\s*calc\(100% - var\(--hub-sections-panel-width,[^;]+\) - 24px\);/,
  "Restricted desktop widths must left-anchor playback and reserve the real panel-launcher width");
assert.doesNotMatch(css, /@media \(max-width:\s*1120px\)[\s\S]{0,500}\.hub-player-content[^{]*\{[^}]*padding-left:/,
  "Restricted desktop widths must keep artwork flush with the player edge");
assert.doesNotMatch(css, /@media \(max-width:\s*1120px\)[\s\S]{0,220}calc\(100% - 704px\)/,
  "Restricted desktop widths must not collapse the playback area around the old fixed reservation");
assert.match(css, /\.hub-player-more-button\s*\{[^}]*border:\s*1px solid transparent;[^}]*color:\s*var\(--hub-muted\);/s,
  "The Ellipsis control must use the shared quiet resting treatment");
assert.match(css, /\.hub-dj-player-button\s*\{[^}]*border:\s*1px solid transparent;/s,
  "The DJ control must not show an outline until interaction");
assert.match(playerShellSource, /function syncDjDrawerAnchor\(r, playerRect = r\.\$player\.getBoundingClientRect\(\)\)[\s\S]*?buttonRect\.left \+ buttonRect\.width \/ 2[\s\S]*?--hub-dj-anchor-x[\s\S]*?--hub-dj-bottom/,
  "the detached DJ drawer must stay anchored to the DJ button in viewport coordinates");
assert.match(playerShellSource, /visualizerVisible[\s\S]*?hub-player-content[\s\S]*?\$playerVisualizer[\s\S]*?visibleTop = Math\.min[\s\S]*?--hub-dj-visualizer-clearance/,
  "Float and Fade DJ drawers must clear the highest visible player or visualizer edge");
assert.match(css, /\.hub-dj-drawer\s*\{[^}]*max-height:\s*calc\(100vh - var\(--hub-player-height\) - var\(--hub-dj-visualizer-clearance, 0px\)\);[\s\S]*?\.hub-dj-drawer \.hub-dj-card\s*\{[^}]*max-height:\s*calc\(100vh - var\(--hub-player-height\) - var\(--hub-dj-visualizer-clearance, 0px\) - 28px\);/s,
  "the DJ drawer must reserve its visualizer clearance within the viewport");
assert.match(playerShellSource, /function syncPlayerSectionGeometry\(\)[\s\S]*?syncDjDrawerAnchor\(r, playerRect\)/,
  "floating resize animation frames must continuously realign the open DJ drawer without rerendering it");
assert.match(css, /\.hub-player-more-button:hover:not\(:disabled\),[\s\S]*?background:\s*transparent;[\s\S]*?border-color:\s*transparent;[\s\S]*?color:\s*var\(--hub-accent\);[\s\S]*?\.hub-player-more-button\[aria-expanded="true"\]\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;/,
  "The Ellipsis control must use only its accent glyph on hover and while open");
assert.match(css, /\.hub-player-more-button\[aria-expanded="true"\]:is\(:hover, :focus-visible\)\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;/,
  "An open overflow trigger must remain surface-free while hovered or focused");
assert.match(css, /\.hub-dj-player-button:hover,[\s\S]*?background:\s*transparent;[\s\S]*?border-color:\s*transparent;[\s\S]*?color:\s*var\(--hub-accent\);[\s\S]*?\.hub-dj-player-button\.is-active\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;/,
  "The DJ control must use only its accent glyph on hover and while active");
assert.match(css, /\.hub-player-more-menu \.hub-queue-action\.is-labeled\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*border-radius:\s*3px;/s,
  "Overflow actions must render as menu rows rather than outlined buttons");
assert.match(css, /\.hub-player-more-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*border:\s*1px solid color-mix\(in srgb, var\(--hub-line\) 20%, var\(--hub-card\)\);[^}]*box-shadow:\s*none;[^}]*color:\s*var\(--hub-ink\);/s,
  "The music-bar ellipsis menu must use a subtle themed boundary without elevation");
assert.match(css, /\.hub-playlist-destination-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*border:\s*1px solid color-mix\(in srgb, var\(--hub-line\) 20%, var\(--hub-card\)\);[^}]*color:\s*var\(--hub-ink\);/s,
  "Add-to submenus must use the same themed menu surface and foreground");
assert.match(css, /\.hub-toolbar-actions-menu\s*\{[^}]*background:\s*var\(--hub-card\);[^}]*border:\s*1px solid color-mix\(in srgb, var\(--hub-line\) 20%, var\(--hub-card\)\);[^}]*color:\s*var\(--hub-ink\);/s,
  "Panel toolbar ellipsis menus must use the same themed menu surface and foreground");
assert.doesNotMatch(css, /var\(--hub-text\)/, "Menus must not depend on the retired hub text token");
assert.match(css, /\.hub-player-more-menu \.hub-queue-action\.is-labeled:hover:not\(:disabled\),[\s\S]*?background:\s*var\(--hub-accent-soft\);[\s\S]*?border-color:\s*transparent;/,
  "Overflow menu rows must retain a clear hover and keyboard-focus state without an outline");
assert.match(css, /\.hub-player-more-menu \.hub-playlist-destination-menu\s*\{[^}]*bottom:\s*auto;[^}]*left:\s*calc\(100% \+ 6px\);[^}]*right:\s*auto;[^}]*top:\s*-6px;/s,
  "Music-bar submenus must open to the right with their top edges aligned by default");
assert.match(css, /\.hub-player-more-menu \.hub-playlist-destination-menu\.opens-left\s*\{[^}]*left:\s*auto;[^}]*right:\s*calc\(100% \+ 6px\);/s,
  "Music-bar submenus must support a left-opening fallback");
assert.match(source, /const availableRight = window\.innerWidth - parentBounds\.right;[\s\S]*?classList\.toggle\("opens-left", availableRight < submenuWidth \+ 14\);/,
  "Music-bar submenus must flip left only when there is not enough viewport room on the right");
assert.match(source, /const showView = \(nextView\) => \{[\s\S]*?populatePlaylistDestinationMenu\(menu, trigger, track, nextView\);[\s\S]*?menu\.querySelector\("\.hub-playlist-menu-option"\)\?\.focus\(\);/,
  "Nested music-bar destinations must receive focus synchronously before the outer menu can close");
assert.match(source, /handlePlayerMoreFocusOut = \(\) => window\.setTimeout\([\s\S]*?}, 50\);[\s\S]*?playerMoreWrap\.addEventListener\("focusout", handlePlayerMoreFocusOut\);[\s\S]*?playerMoreMenu\.addEventListener\("focusout", handlePlayerMoreFocusOut\);/,
  "The music-bar menu must allow nested destination focus to settle before closing");
assert.match(source, /openPlayerMoreMenu[\s\S]*?\(fullscreenVisualizerStage \|\| shadow\)\.append\(playerMoreMenu\)[\s\S]*?style\.position = "fixed"[\s\S]*?style\.zIndex = "2147483647"/,
  "The player ellipsis menu must portal above an open panel");
assert.match(source, /createTrackActionControls\(track, \{ labeled: true, playlistsOnly: true, hideCart \}\)/,
  "The music-bar overflow must open playlists directly instead of duplicating Now Playing and cart destinations");
assert.match(source, /playlistsOnly \? "Add to playlist" : "Add"/,
  "The music-bar overflow must label its focused action Add to playlist");
assert.match(source, /playlistsOnly \? "playlists-only" : "destinations"/,
  "The music-bar Add to playlist action must bypass the generic destination menu");
assert.match(liveScanningSource, /const playerResizing = Boolean\(cursor\)[\s\S]*?r\.\$panel\.classList\.toggle\("is-player-resizing", playerResizing\)[\s\S]*?r\.\$player\.classList\.toggle\("is-resizing", playerResizing\)/,
  "Floating-player resize state must also cover its attached panel");
assert.match(css, /\.hub-player\.is-resizing,[\s\S]*?\.hub-panel\.is-player-resizing \*[\s\S]*?transition-duration:\s*0s !important;/,
  "Every layer of the floating composition must resize without trailing transitions");

console.log("Music bar width layout checks passed.");
