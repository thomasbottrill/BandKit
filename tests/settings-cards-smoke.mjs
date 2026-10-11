import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [coreSource, drawerSource, activitySource, overviewSource, playerSource, pickerSource, popoverSource, stateSource, persistenceSource, layoutSource, css] = await Promise.all([
  readFile(new URL("../src/content/core.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/settings-drawer.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/activity-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/settings-overview.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/music-bar-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/settings-picker.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/settings-popover.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/state.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/persistence-playback.js", import.meta.url), "utf8"),
  Promise.all(["layout-cart.js", "layout-cart-rendering.js"].map((file) => (
    readFile(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n")),
  Promise.all(["base.css", "navigation.css", "settings.css", "settings-controls.css", "settings-actions.css", "settings-colours.css", "settings-disclosure.css", "player-foundation.css", "settings-backup.css", "settings-detail.css"].map((file) => (
    readFile(new URL(`../src/styles/hub/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n"))
]);
const settingsSource = `${activitySource}\n${overviewSource}\n${await readFile(new URL("../src/content/components/settings.js", import.meta.url), "utf8")}`;
const previewSource = await readFile(new URL("../src/content/settings-option-previews.js", import.meta.url), "utf8");

assert.match(stateSource, /settingsView:\s*"index"/, "settings must open on the index");
assert.match(persistenceSource, /settingsView:\s*typeof value\.settingsView === "string" \? value\.settingsView : "index"/,
  "the selected detail must persist with panel layout state");
assert.match(layoutSource, /activeTab === "settings" \? `\$\{runtimeState\.settingsView \|\| "index"\}:\$\{runtimeState\.settingsSubView \|\| "index"\}`/,
  "detail navigation must receive its own render key");
assert.match(layoutSource, /const settingsScroll = runtimeState\.activeTab === "settings";[\s\S]*?is-settings-scroll[\s\S]*?offsetWidth - scrollBody\.clientWidth[\s\S]*?--hub-settings-scrollbar-width[\s\S]*?ResizeObserver\(syncSettingsScrollbar\)/,
  "settings scrolling must continuously measure and compensate only the scrollbar gutter");
assert.match(css, /\.hub-content-scroll\.is-settings-scroll\s*\{[^}]*overflow-x:\s*hidden;[^}]*padding-right:\s*max\(0px, calc\(16px - var\(--hub-settings-scrollbar-width, 0px\)\)\);/s,
  "the settings scrollbar must overlay the existing right padding instead of narrowing content");

assert.match(drawerSource, /SETTINGS_DESTINATION_ICONS[\s\S]*?function createSettingsOverviewCard\(\{ id, title, onOpen \}\)[\s\S]*?hub-settings-overview-trigger[\s\S]*?hub-settings-overview-icon[\s\S]*?aria-hidden[\s\S]*?hub-settings-overview-title[\s\S]*?return trigger/,
  "overview destinations must pair accessible text with a decorative intent-revealed icon");
assert.match(drawerSource, /design:\s*"icon-settings-design\.svg"[\s\S]*?theme:\s*"icon-theme-curated\.svg"/,
  "Design and Theme destinations must use distinct purpose-specific icons");
assert.doesNotMatch(drawerSource, /hub-settings-overview-(?:card|description|arrow|peek|summary)/,
  "overview destinations must not restore cards, descriptions, arrows, or metadata");
assert.doesNotMatch(overviewSource, /\b(?:icon|description|chips|summary):/,
  "overview data must contain only destination identity and text");

for (const [id, title] of [
  ["player", "Player"],
  ["features", "Features"],
  ["appearance", "Appearance"],
  ["browsing", "Browsing"],
  ["onboarding", "Help"],
  ["privacy", "Data"],
  ["about", "About"]
]) {
  assert.match(overviewSource, new RegExp(`\\{ id: "${id}", title: "${title}" \\}`),
    `${title} must appear as a concise root destination`);
  assert.match(overviewSource, new RegExp(`view === "${id}"`), `${title} must open a dedicated detail`);
}

assert.match(drawerSource, /function createSettingsDetailHeader\(title\)[\s\S]*?function createSettingsBackRow\(label, onBack(?:, actions = null)?\)[\s\S]*?createPanelBackButton\(label, onBack/,
  "detail views must put shared accessible back navigation below the heading");
assert.match(coreSource, /function createPanelBackButton\(label, onBack[\s\S]*?aria-label[\s\S]*?icon-arrow-left\.svg[\s\S]*?hub-panel-back-label", "Back"/,
  "shared panel back navigation must expose an accessible label and the standard arrow");
assert.doesNotMatch(drawerSource, /hub-settings-detail-icon|createSettingsDetailHeader\(title, iconName/,
  "detail headings must not repeat decorative destination icons");
assert.match(drawerSource, /openSettingsDisclosures = new Set[\s\S]*?resetSettingsDisclosures[\s\S]*?aria-expanded[\s\S]*?content\.hidden = !open/,
  "disclosures must start closed and expose their state accessibly");
assert.match(overviewSource, /onOpen: \(\) => \{[\s\S]*?resetSettingsDisclosures\(\)[\s\S]*?runtimeState\.settingsView = section\.id/,
  "entering a detail must reset its drawers");
assert.match(drawerSource, /if \(nextOpen\) openSettingsDisclosures\.add\(disclosureKey\)[\s\S]*?openSettingsDisclosures\.delete\(disclosureKey\)/,
  "open drawers must survive setting-triggered rerenders");

assert.match(settingsSource, /renderPlaybackSettings[\s\S]*?\[\["design", "Design"\], \["size", "Size"\], \["timeline", "Controls"\], \["visualiser", "Visualiser"\]\][\s\S]*?createSettingsOverviewCard[\s\S]*?runtimeState\.settingsSubView = id/,
  "Player must use concise Design, Size, Timeline, and Visualiser destinations");
assert.match(overviewSource, /playerSections = new Map[\s\S]*?\["design", "Design"\][\s\S]*?\["visualiser", "Visualiser"\][\s\S]*?Back to Player/,
  "Player destinations must open titled subpages with a route back to Player");
assert.match(playerSource, /ariaLabel:\s*"Music bar style"[\s\S]*?createPlayerSettingRow\("Style"/,
  "Dock, Fade, and Float must remain a Style setting inside Design");
assert.match(await Promise.all(["onboarding.js", "onboarding-controls.js"].map(file => readFile(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8"))).then(parts => parts.join("\n")), /function createOnboardingPlayerStylePicker[\s\S]*?label: "Style"[\s\S]*?renderPreview: createPlayerDesignPreview/,
  "onboarding must present music bar Style as a preview-enabled picker");
assert.doesNotMatch(playerSource, /ariaLabel:\s*"Music bar buttons"|createPlayerSettingRow\("Buttons"/,
  "Player Style must not expose the removed Expanded or Single button choice");
assert.match(settingsSource, /createDjSettingsGroups[\s\S]*?createSettingsDisclosure\("DJ", "", "dj"\)[\s\S]*?createSettingsDisclosure\("Analysis", "", "analysis"\)/,
  "DJ and Analysis must use the same description-free disclosure pattern");
assert.match(settingsSource, /createSettingsDisclosure\("Colours", "", "colours"\)[\s\S]*?createSettingsDisclosure\("Finish", "", "finish"\)/,
  "Appearance must use the same description-free disclosure pattern");
assert.doesNotMatch(settingsSource, /createSettingsDisclosure\("Page", "", "page"\)/,
  "page-level features belong in Features, not Appearance");
assert.match(settingsSource, /renderFeatureSettings[\s\S]*?"Bandkit cart"[\s\S]*?"Saved playlists"[\s\S]*?"Activity"[\s\S]*?"Modern Bandcamp pages"[\s\S]*?"Bandkit player"/,
  "Features must hold the cart, modern pages and Bandkit player switches");
assert.match(activitySource, /hub-analysis-options hub-settings-dependent-options[\s\S]*?camelotRow\.hidden = !showTrackKeys/,
  "Analysis children must be indented and Camelot notation disclosed only with musical keys");
assert.match(css, /\.hub-settings-detail \.hub-analysis-option-row\[hidden\]\s*\{[^}]*display:\s*none;/s,
  "Conditional analysis rows must remain hidden despite their grid row styling");
assert.match(playerSource, /row\.hidden = runtimeState\.showMusicBarAnalysis === false/,
  "Persistent analysis visibility must be disclosed only when music-bar analysis is enabled");
assert.match(activitySource, /createSettingsDisclosure\("Modules", "", "modules"\)[\s\S]*?features\.append\(coreGroup\.group, \.\.\.r\.\$createDjSettingsGroups\(\)\)/,
  "Features must group its switches as Modules, then DJ and Analysis");
assert.match(activitySource, /hub-dj-secondary-row hub-settings-dependent-row[\s\S]*?if \(!djToolsEnabled\) return \[djGroup\.group\];/,
  "DJ gesture and Analysis settings must only be offered while DJ tools is on");
assert.doesNotMatch(activitySource, /createSettingsDisclosure\([^\n]*icon-[^)]+\)/,
  "settings disclosures must not render decorative icons");

assert.match(settingsSource, /createPlayerSettingLabel\(label, tooltip[\s\S]*?hub-settings-control-label[\s\S]*?hub-settings-control-description/,
  "shared setting copies must construct labels and descriptions together");
assert.doesNotMatch(drawerSource, /dataset\.settingsTooltip/,
  "detail preparation must not retrofit labels after rendering");
assert.match(settingsSource, /dataset\.settingsTooltip[\s\S]*?tabIndex = 0/,
  "Player descriptions must remain keyboard-accessible tooltips");
assert.match(css, /\.hub-settings-detail-title\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*700;[^}]*line-height:\s*20px/s,
  "detail headings must match the root Settings heading typography");
assert.match(css, /\.hub-panel-back-label\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(-4px\)[\s\S]*?\.hub-panel-back-button:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--hub-accent\)[\s\S]*?\.hub-panel-back-label\s*\{[^}]*opacity:\s*1/s,
  "shared back navigation must reveal its label and accent on hover or keyboard focus");
assert.match(css, /\.hub-settings-back-row\s*\{[^}]*margin:\s*0 24px 8px/s,
  "settings back navigation must occupy its own row below the heading");
assert.match(pickerSource, /createSettingsPicker[\s\S]*?role", "combobox"[\s\S]*?createPanelCaret\("hub-settings-combobox-chevron"\)/,
  "fields must use the shared accessible icon-capable picker and player caret");
assert.match(pickerSource, /openSettingsPopover\(trigger, menu\)[\s\S]*?closeSettingsPopover\(menu\)/,
  "shared settings fields must open through the overlay popover layer");
assert.match(pickerSource, /menu\.classList\.add\(`\$\{pickerClass\}-options`\)/,
  "portalled settings menus must retain a picker-specific styling hook");
for (const renderer of ["createPlayerDesignPreview", "createVisualizerStylePreview", "createBlendModePreview"]) {
  assert.match(playerSource, new RegExp(`renderPreview:\\s*${renderer}`),
    `Settings must use ${renderer} in selected fields and option modals`);
}
assert.match(previewSource, /drawVisualizerVariant[\s\S]*?document\.createElement\("canvas"\)[\s\S]*?drawVisualizerPreview/,
  "visualiser choices must use cropped frames drawn by the production visualiser renderer");
assert.match(previewSource, /createVisualizerStylePreview\(type\)\s*\{\s*if \(type === "off"\) return null;/,
  "The Off visualiser choice must render as text without an empty canvas preview");
assert.match(previewSource, /createPlayerDesignPreview[\s\S]*?createOptionIconPreview[\s\S]*?docked: "icon-style-dock\.svg"[\s\S]*?zune: "icon-style-fade\.svg"[\s\S]*?rounded: "icon-style-float\.svg"/,
  "Dock, Fade, and Float previews must use their shared quiet icon renderer");
assert.match(css, /hub-settings-picker\.has-preview \.hub-settings-combobox\s*\{[^}]*grid-template-columns:\s*max-content max-content[^}]*justify-content:\s*end/s,
  "visual previews must sit immediately beside dynamically sized right-aligned field labels");
assert.match(css, /:host > \.hub-scrub-handle-picker-options\s*\{[^}]*width:\s*min\(220px, calc\(100vw - 16px\)\)/s,
  "the scrub-handle menu must be wide enough to display complete shape labels");
assert.match(css, /:host > \.hub-scrub-handle-picker-options\s*\{[^}]*overflow-x:\s*hidden[^}]*\}[\s\S]*?\.hub-settings-picker-option\s*\{[^}]*grid-template-columns:\s*26px minmax\(0, 1fr\)/s,
  "the portalled scrub-handle menu must retain its preview and label layout without horizontal scrolling");
assert.match(css, /\.hub-custom-handle-controls\s*\{[^}]*margin-right:\s*var\(--hub-settings-compact-control-inset\);[^}]*width:\s*var\(--hub-settings-input-width\);[^}]*\}[\s\S]*?\.hub-custom-handle-name\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/s,
  "the custom handle row must share the right-aligned control column and truncate long filenames within it");
assert.doesNotMatch(pickerSource, /hub-settings-picker-option-check|✓/,
  "shared settings pickers must express selection without a checkmark");
assert.doesNotMatch(activitySource, /hub-theme-option-check|✓/,
  "theme pickers must express selection without a checkmark");
assert.match(css, /\.hub-settings-picker-option\.is-selected\s*\{[^}]*color:\s*var\(--hub-accent\)[\s\S]*?\.hub-settings-picker-option\.is-selected \.hub-settings-picker-option-label\s*\{[^}]*font-weight:\s*800/s,
  "selected modal options must use a bold accent treatment");
assert.match(css, /\.hub-settings-picker-options:has\(\.hub-settings-picker-option:is\(:hover, :focus-visible\)\)[\s\S]*?\.hub-settings-picker-option:not\(:hover, :focus-visible\)\s*\{[^}]*opacity:\s*0\.38/s,
  "hovering or focusing a modal option must defocus all sibling options");
assert.match(css, /\.hub-theme-source-picker-options\.has-trailing \.hub-settings-picker-option\.has-option-trailing\s*\{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\) 16px/s,
  "the colour-source info marker must stay in the Dynamic option row");
assert.match(activitySource, /openSettingsPopover\(themeTrigger, themeOptions\)[\s\S]*?closeSettingsPopover\(themeOptions\)/,
  "the theme chooser must use the same overlay popover layer");
assert.match(activitySource, /appearanceSource[\s\S]*?Colour source[\s\S]*?value: "match", label: "Dynamic"[\s\S]*?value: "theme", label: "Curated"[\s\S]*?value: "custom", label: "Custom"/,
  "the parent theme source picker must expose Dynamic, Curated, and Custom");
assert.match(activitySource, /mode === "custom"\) runtimeState\.appearance\.preset = "custom"[\s\S]*?mode === "theme" && runtimeState\.appearance\.preset === "custom"[\s\S]*?preset = "studio"/,
  "the parent source picker must share Custom state with the theme shortcut and return Custom users to a curated preset");
assert.match(activitySource, /const customTheme = \{[\s\S]*?id: "custom"[\s\S]*?availableThemes = \[customTheme, \.\.\.BUILT_IN_THEMES/,
  "the curated theme chooser must retain Custom as a shortcut to the shared custom-theme state");
assert.match(activitySource, /createControlsColourOverrides/, "the Controls page must use the shared concise colour rows");
assert.match(css, /\.hub-colour-field input\[type="color"\]\s*\{[^}]*height:\s*28px;[^}]*padding:\s*0;[^}]*width:\s*28px;/s,
  "colour controls must use a square swatch with one outer outline");
assert.match(css, /\.hub-colour-field input\[type="color"\]::-(?:webkit-color-swatch|moz-color-swatch)\s*\{[^}]*border:\s*0;/s,
  "native colour swatches must not add a second inner outline");
assert.match(popoverSource, /style\.position = "fixed"[\s\S]*?root\.append\(popover\)[\s\S]*?window\.addEventListener\("scroll", reposition, true\)/,
  "settings popovers must leave panel layout and remain anchored without forcing scroll");
assert.match(popoverSource, /cssMaxHeight[\s\S]*?Math\.min\(availableHeight, cssMaxHeight\)[\s\S]*?style\.maxHeight = `\$\{Math\.round\(cappedHeight\)\}px`/,
  "popover positioning must preserve each picker’s CSS height cap");
assert.match(playerSource, /createVisualizerSettings\(r, \{ standalone = false \} = \{\}\)[\s\S]*?hub-visualizer-toggle[\s\S]*?createPlayerSettingRow\([\s\S]*?"Enabled"[\s\S]*?if \(standalone\)[\s\S]*?section\.replaceChildren\(options\)/,
  "Visualiser must put its activation toggle inside its standalone settings page");
assert.doesNotMatch(playerSource, /options\.hidden = !active|section\.classList\.toggle\("is-open", active\)/,
  "Visualizer activation must not control whether its drawer is open");
assert.match(playerSource, /const widthControl = createPlayerSettingRow\([\s\S]*?"Width"[\s\S]*?width,[\s\S]*?const heightControl = createPlayerSettingRow\([\s\S]*?"Height"[\s\S]*?height/,
  "Visualizer width and height must use separate settings rows");

assert.match(css, /\.hub-settings-overview-trigger\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;[\s\S]*?color:\s*var\(--hub-muted\)/,
  "root destinations must have no card backing");
assert.match(css, /\.hub-settings-overview-trigger:is\(:hover, :focus-visible\)[\s\S]*?color:\s*var\(--hub-accent\)/,
  "the active root destination must use the accent colour");
assert.match(css, /\.hub-settings-overview-icon\s*\{[^}]*margin-left:\s*auto;[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(-4px\);[\s\S]*?\.hub-settings-overview-trigger:is\(:hover, :focus-visible\) \.hub-settings-overview-icon\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateX\(0\);/s,
  "only the active page link may reveal its right-aligned associated icon");
assert.match(css, /\.hub-settings-overview-stack\s*\{[\s\S]*?gap:\s*0[\s\S]*?\.hub-settings-overview-trigger\s*\{[\s\S]*?display:\s*flex[\s\S]*?min-height:\s*58px/,
  "root destination hover targets must be continuous without changing the visual rhythm");
assert.match(css, /\.hub-settings-overview-stack:has\([\s\S]*?\.hub-settings-overview-trigger:not\(:hover\):not\(:focus-visible\)[\s\S]*?opacity:\s*0\.38/,
  "inactive root destinations must de-emphasize while one receives intent");
assert.doesNotMatch(css, /\.hub-settings-overview-(?:card|description|arrow|peek|summary|chip)/,
  "obsolete overview card styling must be removed");

assert.match(css, /Every settings destination shares the same quiet, text-first language/,
  "all detail pages must opt into one shared visual system");
assert.match(css, /\.hub-backup-block > \.hub-settings-text-actions > \.hub-settings-action\s*\{[^}]*margin-right:\s*var\(--hub-settings-compact-control-inset\);[\s\S]*?\.hub-backup-frequency \.hub-settings-combobox\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) calc\(var\(--hub-settings-compact-control-inset\) \* 2\);/s,
  "Data actions, readouts and picker carets must share one visible right-hand endpoint");
assert.match(css, /:is\(\.hub-settings-detail, \.hub-onboarding-scale\) \.hub-settings-disclosure--quiet[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0/,
  "detail disclosures must not use card backings");
assert.match(css, /\.hub-settings-detail:has\(> \.hub-settings-disclosure--quiet > \.hub-settings-disclosure-trigger:is\(:hover, :focus-visible\)\)[\s\S]*?> \.hub-settings-disclosure--quiet:not\(\.is-open\):not\(:has\(> \.hub-settings-disclosure-trigger:is\(:hover, :focus-visible\)\)\)\s*\{[^}]*opacity:\s*0\.38;/s,
  "top-level detail drawers must defocus only their closed siblings, never nested disclosures");
assert.match(css, /:is\(\.hub-settings-detail, \.hub-onboarding-scale\) \.hub-settings-disclosure--quiet \.hub-settings-disclosure-title\s*\{[^}]*font-weight:\s*600;[\s\S]*?\.hub-settings-disclosure--quiet\.is-open \.hub-settings-disclosure-title\s*\{[^}]*font-weight:\s*750;/s,
  "an open settings drawer must use a distinctly bolder heading than closed drawers");
assert.match(css, /:is\(\.hub-settings-detail, \.hub-onboarding-scale\) \.hub-settings-disclosure--quiet \.hub-settings-disclosure-chevron\s*\{[\s\S]*?opacity:\s*0[\s\S]*?\.hub-settings-disclosure-trigger:is\(:hover, :focus-visible\) \.hub-settings-disclosure-chevron\s*\{[\s\S]*?opacity:\s*1/,
  "detail disclosure chevrons must only reveal on header hover or focus");
assert.doesNotMatch(css, /\.hub-settings-disclosure--quiet\.is-open \.hub-settings-disclosure-chevron\s*\{\s*opacity:\s*1/,
  "opening a detail drawer must not make its chevron persist");
assert.match(css, /\.hub-settings-control-description\s*\{[\s\S]*?display:\s*none/,
  "inline descriptions must leave the visual layout");
assert.match(css, /\.hub-settings-control-label::after[\s\S]*?content:\s*attr\(data-settings-tooltip\)[\s\S]*?\.hub-settings-control-label:is\(:hover, :focus-visible\)::after[\s\S]*?opacity:\s*1/,
  "control descriptions must appear as quiet hover and focus tooltips");
assert.match(css, /\.hub-settings-detail \.hub-settings-row:is\(:hover, :focus-within\) :is\(\.hub-settings-control-label, \.hub-settings-copy strong\)[\s\S]*?color:\s*var\(--hub-accent\)/,
  "every detail-row label must reveal intent through accent text");
assert.doesNotMatch(css, /\.hub-settings-detail \.hub-visualizer-dimensions-row/,
  "Visualizer dimensions must use the standard separate-row layout");
assert.match(css, /\.hub-settings-detail\s*\{\s*--hub-settings-control-font-size:\s*13px;[\s\S]*?\.hub-player-setting-label,[\s\S]*?\.hub-settings-control-label\s*\{[\s\S]*?font-size:\s*var\(--hub-settings-control-font-size\)/,
  "left-side setting labels must share one control size beneath larger section headings");
assert.match(css, /\.hub-settings-detail :is\([\s\S]*?\.hub-settings-combobox-label,[\s\S]*?\.hub-theme-combobox-label,[\s\S]*?\.hub-settings-unit[\s\S]*?font-size:\s*var\(--hub-settings-control-font-size, 13px\)/,
  "right-side setting values must use the same text size across field types");
assert.match(css, /\.hub-settings-detail \.hub-theme-picker-field \.hub-theme-combobox\s*\{[^}]*grid-template-columns:\s*auto auto var\(--hub-settings-control-tail-width\);[^}]*column-gap:\s*9px;[^}]*justify-content:\s*end;/s,
  "the selected theme palette must stay grouped immediately before its right-aligned label");
assert.match(css, /\.hub-settings-detail\s*\{[^}]*--hub-settings-control-tail-width:\s*28px;[\s\S]*?\.hub-settings-detail \.hub-settings-combobox\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--hub-settings-control-tail-width\);[\s\S]*?\.hub-scrubbable-percentage\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--hub-settings-control-tail-width, 28px\);/s,
  "dropdown carets and scrubbable steppers must reserve the same trailing slot so values align");
assert.match(css, /\.hub-settings-detail \.hub-settings-picker\.has-preview \.hub-settings-combobox\s*\{[^}]*grid-template-columns:\s*22px auto var\(--hub-settings-control-tail-width\);[^}]*justify-content:\s*end;/s,
  "the handle preview and label must align together against the right-side caret");
assert.match(css, /:is\(\.hub-settings-detail, \.hub-settings-picker-options\) \.hub-scrub-handle-preview::after\s*\{[\s\S]*?background:\s*var\(--hub-accent\)/,
  "scrub handle previews must inherit the active settings theme accent");
assert.match(css, /\.hub-settings-detail\s*\{[^}]*--hub-settings-control-font-size:\s*13px;/s,
  "configuration rows must share one legible control-text scale");
assert.match(css, /\.hub-settings-detail \.hub-settings-number,[\s\S]*?\.hub-settings-detail \.hub-settings-select,[\s\S]*?font-size:\s*var\(--hub-settings-control-font-size\)/,
  "native and custom setting values must inherit the same control-text scale");
assert.match(css, /\.hub-settings-detail \.hub-settings-row \.hub-settings-copy strong,[\s\S]*?\.hub-corner-radius-value,[\s\S]*?\.hub-settings-segment[\s\S]*?font-size:\s*var\(--hub-settings-control-font-size\)/,
  "legacy labels, readouts and segmented controls must use the shared scale");
assert.doesNotMatch(css, /\.hub-settings-detail \.hub-settings-row:is\(:hover, :focus-within\)\s*\{[^}]*background:/,
  "detail rows must not paint hover backings");
assert.match(css, /\.hub-player-setting-row,[\s\S]*?\.hub-settings-detail \.hub-settings-row:not\(\.hub-appearance-mode-row\),[\s\S]*?padding:\s*var\(--hub-settings-row-padding\) 0;/,
  "open drawer rows must share one grid and padding rule");
assert.match(css, /--hub-settings-row-padding:\s*5px;/,
  "shared row padding must preserve the existing five-pixel rhythm");
assert.match(css, /\.hub-settings-detail :is\(\.hub-glass-settings, \.hub-corner-settings\)\s*\{[^}]*gap:\s*2px;[^}]*padding:\s*0;/s,
  "Surface and Corners must share the standard detail spacing and column edges in every destination");
assert.match(css, /\.hub-settings-dependent-options > \.hub-player-setting-row,[\s\S]*?padding-inline-start:\s*16px;/s,
  "Dependent settings must share the nested row inset");
assert.match(css, /\.hub-settings-detail \.hub-backup-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*padding:\s*5px 0;/s,
  "backup controls must use the same two-column alignment and vertical rhythm as other settings rows");
assert.match(css, /\.hub-backup-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*flex-end;/s,
  "backup actions must stay right aligned without squeezing or overflowing their label");

assert.match(css, /\.hub-settings-toggle:is\(\.is-active, \[aria-checked="true"\]\)\s*\{[^}]*color:\s*var\(--hub-accent\)/s,
  "active settings options must retain the accent colour");
assert.match(css, /\.hub-settings-toggle::after\s*\{[^}]*content:\s*"Off"[\s\S]*?\.hub-settings-toggle\[aria-checked="true"\]::after\s*\{[^}]*content:\s*"On"/s,
  "settings toggles must present consistent text states");
assert.match(css, /\.hub-settings-toggle-thumb\s*\{[^}]*display:\s*none;/s,
  "obsolete toggle tracks and thumbs must stay out of the simplified settings layout");

console.log("Settings hierarchy simplification checks passed.");
