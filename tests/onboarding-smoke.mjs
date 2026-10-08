import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [state, onboarding, persistence, lifecycle, settings, player, pageActions, analysis, musicBar, layout, css, playerCss, baseCss, merge] = await Promise.all([
  readFile(new URL("../src/content/state.js", import.meta.url), "utf8"),
  Promise.all(["onboarding.js", "onboarding-controls.js"].map(file => readFile(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8"))).then(parts => parts.join("\n")),
  readFile(new URL("../src/content/runtime/persistence-playback.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/lifecycle.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/activity-settings.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/player-shell.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/page-actions.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/runtime/page-commerce-analysis.js", import.meta.url), "utf8"),
  readFile(new URL("../src/content/music-bar-settings.js", import.meta.url), "utf8"),
  Promise.all(["layout-cart.js", "layout-cart-rendering.js"].map((file) => (
    readFile(new URL(`../src/content/runtime/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n")),
  readFile(new URL("../src/styles/hub/onboarding.css", import.meta.url), "utf8"),
  Promise.all(["player.css", "player-track.css", "player-interactions.css"].map((file) => (
    readFile(new URL(`../src/styles/hub/${file}`, import.meta.url), "utf8")
  ))).then((parts) => parts.join("\n")),
  readFile(new URL("../src/styles/hub/base.css", import.meta.url), "utf8"),
  readFile(new URL("../src/shared/state-merge.js", import.meta.url), "utf8")
]);

assert.match(state, /ONBOARDING_COMPLETE\s*=\s*1/);
assert.match(state, /onboardingCompletedVersion:\s*0/);
assert.match(state, /onboardingStep:\s*0/);
assert.match(lifecycle, /legacyOnboardingState[\s\S]*?onboardingCompletedVersion\s*=\s*ONBOARDING_COMPLETE/,
  "existing installations must be grandfathered instead of receiving an unexpected first-run tour");
assert.match(lifecycle, /storageGet\(\[STORAGE_KEYS\.STATE, STORAGE_KEYS\.LAYOUT, STORAGE_KEYS\.ONBOARDING_COMPLETE\]\)/,
  "startup must consult the permanent onboarding sentinel");
assert.match(lifecycle, /onboardingPermanentlyCompleted[\s\S]*?STORAGE_KEYS\.ONBOARDING_COMPLETE[\s\S]*?onboardingCompletedVersion\s*=\s*ONBOARDING_COMPLETE/,
  "a completed sentinel must survive missing or stale tab state");
assert.match(onboarding, /finishOnboarding[\s\S]*?persistLocal\(\{ \[STORAGE_KEYS\.ONBOARDING_COMPLETE\]: ONBOARDING_COMPLETE \}\)/,
  "finishing or skipping must persist the permanent sentinel separately");
assert.match(lifecycle, /\$restoreRuntimeState\([\s\S]*?\$activateFirstRunOnboarding\(\)[\s\S]*?\$render\(\)/,
  "first-run onboarding must activate immediately after state restoration");
assert.doesNotMatch(onboarding, /renderOnboarding[\s\S]*?onboardingCompletedVersion\) <= 0\) r\.\$onboardingActive = true/,
  "ordinary renders must not initiate onboarding before the restored first-run check");
assert.doesNotMatch(onboarding, /onboardingCompletedVersion\)\s*<\s*ONBOARDING_/,
  "application updates must not reactivate onboarding");
assert.match(lifecycle, /onboardingStep:\s*onboardingCompletedVersion > 0 \? 0 : Math\.max\(0, Math\.min\(10,/,
  "the persisted tour position must include the eleventh wrap-up step");

assert.match(onboarding, /Welcome to Bandkit[\s\S]*?Now Playing[\s\S]*?Playlists[\s\S]*?Add music[\s\S]*?Cart[\s\S]*?Activity[\s\S]*?Settings[\s\S]*?DJ tools[\s\S]*?Make it yours[\s\S]*?Backup[\s\S]*?You’re all set/,
  "the guided tour must cover every requested destination");
assert.match(onboarding, /demo:\s*"now-playing"[\s\S]*?demo:\s*"playlists"[\s\S]*?demo:\s*"add"[\s\S]*?panel:\s*"cart"[\s\S]*?demo:\s*"cart"[\s\S]*?panel:\s*"activity"[\s\S]*?demo:\s*"activity"/,
  "feature steps must drive the real panel with temporary sample content");
assert.match(onboarding, /function renderRealDemoPanel[\s\S]*?r\.\$renderPlaylist\(\)[\s\S]*?r\.\$renderCart\(\)[\s\S]*?r\.\$renderActivity\(\)/,
  "tour samples must be rendered by the production panel views");
assert.match(onboarding, /function applyStepNavigation[\s\S]*?runtimeState\.open = Boolean\(step\.panel\)[\s\S]*?runtimeState\.activeTab = step\.panel/,
  "each step must open the appropriate real Bandkit panel");
assert.match(onboarding, /\$onboardingUsesDemoPanel[\s\S]*?STEPS\[r\.\$onboardingSessionStep\]\?\.demo/,
  "the active guided step must identify when its temporary panel view is authoritative");
assert.match(layout, /\$onboardingUsesDemoPanel\?\.\(\)[\s\S]*?dataset\.onboardingDemo[\s\S]*?return/,
  "background panel refreshes must not erase guided-tour samples or their anchors");
assert.match(onboarding, /function targetForStep[\s\S]*?r\.\$player[\s\S]*?r\.\$panel[\s\S]*?r\.\$djDrawer/,
  "coachmarks must anchor to the real interface controls");
assert.match(onboarding, /function positionCoachmark[\s\S]*?getBoundingClientRect\(\)[\s\S]*?dataset\.placement = side/,
  "the coachmark must follow its target responsively");
assert.match(onboarding, /function coachmarkTargetRect[\s\S]*?hub-player-content[\s\S]*?\$playerArtLink[\s\S]*?hub-player-backdrop-glow[\s\S]*?\$playerVisualizer/,
  "player coachmarks must clear Float's lifted content, artwork, surface and visualizer");
assert.match(onboarding, /target === r\.\$panel[\s\S]*?window\.innerHeight \* \.32/,
  "panel coachmarks must share one stable screen position across consecutive steps");
assert.doesNotMatch(onboarding, /if \(target === r\.\$panel && side === "left"\)[\s\S]*?\$onboardingPanelCoachmarkLeft/,
  "panel coachmarks must follow the live panel instead of freezing at a stale horizontal anchor");
assert.match(onboarding, /function scheduleCoachmarkPosition[\s\S]*?now - startedAt < 420[\s\S]*?requestAnimationFrame\(followLayout\)/,
  "coachmarks must follow the panel through its empty-to-populated layout transition");
assert.doesNotMatch(css, /\.hub-onboarding-dialog::after|hub-onboarding-target/,
  "coachmarks must remain plain cards without pointers or target outlines");
assert.match(css, /\.hub-onboarding-layer\s*\{[^}]*pointer-events:\s*none;/s,
  "the tour must not dim or block the surrounding page");
assert.doesNotMatch(css, /background:\s*rgb\(0 0 0 \/ 52%\)/,
  "the old full-page modal backdrop must be removed");
assert.match(onboarding, /r\.\$onboardingDialog\.setAttribute\("aria-modal", "false"\)/,
  "the coachmark must not claim to be a modal dialog");

assert.match(onboarding, /const DEMO_TRACKS[\s\S]*?Night Drive[\s\S]*?Soft Signal[\s\S]*?Open Water/,
  "the guided panels must contain clearly synthetic demo data");
assert.doesNotMatch(onboarding, /runtimeState\.playlist\s*=\s*\[/,
  "demo content must never replace the persisted Now Playing queue");
assert.match(onboarding, /\$onboardingUiSnapshot[\s\S]*?Object\.assign\(runtimeState, r\.\$onboardingUiSnapshot \|\| \{\}\)/,
  "the tour must restore the user's previous panel navigation state");
assert.match(onboarding, /function setDemoPlayerContent[\s\S]*?icon-image\.svg[\s\S]*?Bandkit Test Song[\s\S]*?applyTimelinePath/,
  "the actual music bar must receive a temporary animated sample track");
assert.match(onboarding, /function setDemoPlayerContent[\s\S]*?dataset\.playerEmpty = "false"[\s\S]*?syncMusicBarPanelButtons/,
  "restoring the sample player must also restore the populated contextual-panel geometry");
assert.match(onboarding, /applyStepNavigation\(nextDefinition\)[\s\S]*?dataset\.playerEmpty = String\(nextDefinition\?\.emptyPlayer === true\)[\s\S]*?r\.\$render\(\)/,
  "step navigation must publish the destination player geometry before laying out the panel");
assert.match(onboarding, /function pausePlaybackForOnboarding[\s\S]*?silenceNativePagePlayback[\s\S]*?runtimeSeamless\.isPlaying[\s\S]*?SEAMLESS_PLAY_PAUSE/,
  "starting onboarding must pause native or seamless playback without replacing the queue");
assert.match(onboarding, /renderPlayerWithOnboardingDemo[\s\S]*?if \(!r\.\$onboardingActive\)[\s\S]*?renderPlayer\(\)[\s\S]*?syncOnboardingDemoPlayer/,
  "live player refreshes must not redraw the underlying track while the tour owns the player");
assert.match(onboarding, /clearTourDecorations\(r, \{ preservePlayer: true \}\)/,
  "ordinary tour renders must not restart the long-running demo animation");
assert.match(onboarding, /r\.\$playerTrackRenderSignature = ""[\s\S]*?r\.\$playerActionSignature = ""/,
  "finishing must force the real paused track presentation to replace every piece of dummy player content");
assert.match(css, /hub-onboarding-demo-player \.hub-scrub-playhead \{[^}]*animation:\s*hub-onboarding-playhead 600s linear 1 forwards;/s,
  "the sample playhead must make one uninterrupted ten-minute pass");
assert.match(css, /hub-onboarding-demo-player \.hub-scrub-waveform-played \{[^}]*animation:\s*hub-onboarding-waveform 600s linear 1 forwards;/s,
  "the played waveform must make the same uninterrupted ten-minute pass");
assert.match(css, /hub-onboarding-playhead \{ from \{ left: 0%; \} to \{ left: 100%; \} \}[\s\S]*?hub-onboarding-waveform \{ from \{ clip-path: inset\(0 100% 0 0\); \} to \{ clip-path: inset\(0 0 0 0\); \} \}/,
  "the playhead and played waveform must use matching endpoints");
assert.match(css, /hub-onboarding-visualizer[\s\S]*?scaleY\(\.55\)[\s\S]*?scaleY\(\.98\)/,
  "the sample visualizer must visibly react");

for (const option of ["Theme", "Custom", "Style", "Surface", "DJ tools", "Timeline", "Palette"]) {
  assert(onboarding.includes(`\"${option}\"`), `the compact coachmark configurator must retain ${option}`);
}
assert.match(onboarding, /setAttribute\("aria-label", `Handle: \$\{HANDLE_LABELS\[selected\]\}`\)/,
  "the compact coachmark configurator must retain the scrub handle picker");
// Corners and visualiser remain whole-kit choices with their full controls in Settings.
for (const settingsOnly of ["Corners", "Visualiser"]) {
  assert(!onboarding.includes(`label: "${settingsOnly}"`),
    `${settingsOnly} is a whole-kit choice and must not reappear in the onboarding configurator`);
}
assert.match(onboarding, /function createOnboardingPlayerStylePicker[\s\S]*?value:\s*"docked", label:\s*"Dock"[\s\S]*?value:\s*"zune", label:\s*"Fade"[\s\S]*?value:\s*"rounded", label:\s*"Float"[\s\S]*?applyMusicBarStylePreset\(r, value\)/,
  "the onboarding configurator must offer Dock, Fade and Float player styles");
assert.doesNotMatch(onboarding, /hub-onboarding-kit-settings-button|hub-onboarding-kit-settings-modal|\$onboardingKitSettings = kind/,
  "the kit configurator must expose its pickers directly instead of hiding them behind a settings button");
assert.match(onboarding, /card\.style\.bottom = "auto";[\s\S]*?card\.style\.top/,
  "ordinary coachmark positioning must release the temporary bottom anchor");
assert.match(css, /\.hub-onboarding-body\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
  "onboarding disclosures and portalled selectors must never create a horizontal body scrollbar");
assert.match(onboarding, /createOnboardingModeSwitch[\s\S]*?\[\["theme", "Theme"\], \["custom", "Custom"\]\][\s\S]*?role", "tab"/,
  "Make it yours must offer a clear Theme or Custom choice");
assert.match(onboarding, /\$onboardingKitMode = "theme"/,
  "each onboarding run must open Make it yours on the streamlined Theme choice");
assert.match(onboarding, /if \(mode === "theme"\)[\s\S]*?createOnboardingThemePicker[\s\S]*?else \{[\s\S]*?createOnboardingPlayerStylePicker[\s\S]*?createOnboardingPalettePicker/,
  "Theme must stay streamlined while Custom exposes the detailed player controls and palette");
assert.match(onboarding, /function createOnboardingPalettePicker[\s\S]*?BUILT_IN_THEMES[\s\S]*?label: "Palette"[\s\S]*?onPreview[\s\S]*?onRestore/,
  "Custom must reuse the real colour palettes with live previews");
assert.match(onboarding, /function createOnboardingThemePicker[\s\S]*?DEFAULT_VISUAL_THEME[\s\S]*?VISUAL_THEMES[\s\S]*?onPreview[\s\S]*?onRestore/,
  "the Theme path must provide live previews and restore uncommitted choices");
assert.match(onboarding, /SCRUBBER_HANDLE_SHAPES\.filter\(\(value\) => value !== "custom"\)/,
  "the onboarding handle selector must omit Custom");
assert.doesNotMatch(onboarding, /\$onboardingKitSettings === "(?:style|theme|timeline|handle)"/,
  "style, theme, timeline and handle must not add a second-level settings modal");
assert.match(onboarding, /pointerenter[\s\S]*?onPreview[\s\S]*?onRestore/,
  "custom onboarding pickers must preview options on intent and restore uncommitted values");
assert.doesNotMatch(onboarding, /hub-onboarding-kit-advanced-toggle/,
  "the busy global Advanced settings disclosure must be removed");
assert.doesNotMatch(onboarding, /hub-onboarding-kit-choice-icon/,
  "ordinary Tune your Bandkit controls must not add unrelated icons");
assert.match(onboarding, /if \(renderPreview\) valueWrap\.append\(renderPreview\(selected\.value\)\)/,
  "the selected timeline must retain its visual preview in the main field");
assert.match(onboarding, /function createOnboardingPlayerStylePicker[\s\S]*?renderPreview: createPlayerDesignPreview/,
  "the onboarding player Style field and modal must share the design previews");
assert.match(onboarding, /function createOnboardingSurfacePicker[\s\S]*?renderPreview: createSurfacePreview/,
  "the onboarding Surface field and modal must share the surface previews");
assert.match(onboarding, /valueWrap\.append\(createOnboardingHandlePreview\(selected\)/,
  "the selected handle, including Butterfly, must retain its visual preview in the main field");
assert.match(onboarding, /function syncOnboardingContrast[\s\S]*?luminance\(panel\) < 0\.34[\s\S]*?dataset\.scheme/,
  "coachmarks must use the inverse light or dark scheme of the player");
assert.match(onboarding, /"--hub-card-ink": colorString\(ink\)[\s\S]*?"--hub-card-muted": colorString\(muted\)[\s\S]*?"--hub-card-faint": colorString\(muted, 0\.72\)[\s\S]*?"--hub-card-accent-soft": colorString\(accent, 0\.12\)/,
  "nested production menus in onboarding must inherit the readable coachmark card roles at rest");
assert.match(onboarding, /\$activateFirstRunOnboarding[\s\S]*?onboardingStep\) \|\| 0\) === 0[\s\S]*?appearance\.pageAware = true[\s\S]*?appearance\.applyToPage = false/,
  "a genuinely new onboarding run must begin in Dynamic without overwriting a resumed selection");
assert.match(onboarding, /appearance\.visualThemeId = "dynamic"/,
  "a genuinely new onboarding run must explicitly select the Dynamic theme");
assert.match(onboarding, /renderTrailing: id => id === "dynamic" \? createDynamicThemeInfo\(\) : null/g,
  "Dynamic must carry its information marker in both onboarding theme menus");
assert.match(css, /hub-onboarding-kit-choice-copy span[^}]*font-size:\s*13px[\s\S]*?hub-onboarding-kit-picker-selection-copy > span:first-child[^}]*font-size:\s*13px/,
  "onboarding fields must use the same readable control scale as Settings");
assert.match(css, /\.hub-onboarding-kit-mode\s*\{[^}]*display:\s*flex;[^}]*gap:\s*18px;/s,
  "Theme and Custom must use a quiet inline text row rather than a segmented box");
assert.doesNotMatch(css, /\.hub-onboarding-kit-mode\s*\{[^}]*background:/s,
  "the Theme and Custom row must not introduce a separate control surface");
assert.match(css, /\.hub-onboarding-kit-choice\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  "Tune your Bandkit controls must be quiet text rows without card backing");
assert.match(onboarding, /choice:\s*"backup"[\s\S]*?\$runBackupAction\(action, r\.\$savePortableBackup\)/,
  "the anchored backup step must expose the real backup action");
assert.match(onboarding, /hub-onboarding-primary-navigation[\s\S]*?step\.choice === "backup"[\s\S]*?backupAction\(r\)[\s\S]*?primaryNavigation\.append\(next\)/,
  "Backup must sit beside the primary footer action");
assert.match(onboarding, /You’re all set[\s\S]*?target:\s*"player"[\s\S]*?placement:\s*"top"[\s\S]*?emptyPlayer:\s*true/,
  "the final step must close the panel and centre above the genuine empty player state");
assert.match(onboarding, /runtimeState\.open = Boolean\(step\.panel\)/,
  "a panel-less completion step must close any open panel");
assert.match(onboarding, /function setEmptyPlayerContent[\s\S]*?classList\.add\("is-empty"\)[\s\S]*?dataset\.playerEmpty = "true"[\s\S]*?syncMusicBarPanelButtons/,
  "the final player preview must use the production empty state and its four destination labels");
assert.match(onboarding, /if \(step\.emptyPlayer\) setEmptyPlayerContent\(r\);[\s\S]*?else setDemoPlayerContent/,
  "only the empty wrap-up step may replace the earlier illustrative player preview");
assert.match(onboarding, /hub-onboarding-backup-action", "Backup"/);
assert.match(onboarding, /hub-onboarding-skip", "Skip"/);
assert.match(onboarding, /cartView:\s*"saved"[\s\S]*?savedCarts:\s*DEMO_SAVED_CARTS/,
  "the Cart tour step must demonstrate saved carts");
assert.match(onboarding, /hub-onboarding-add-trigger[\s\S]*?icon-plus\.svg[\s\S]*?trigger\.click\(\)/,
  "the Add Music tour step must open the production add menu from a visible plus button");
assert.match(onboarding, /function createAddMusicExample[\s\S]*?Night Drive[\s\S]*?3:42[\s\S]*?Buy[\s\S]*?icon-plus\.svg/,
  "the Add Music coachmark must show the active plus button in a realistic track row");
assert.match(onboarding, /function createAddMusicExample[\s\S]*?Add to Now Playing[\s\S]*?Add to playlist…[\s\S]*?Add to cart…[\s\S]*?Add to Wishlist/,
  "the Add Music coachmark must also show every primary destination in the production menu treatment");
assert.match(css, /\.hub-onboarding-add-menu\s*\{[^}]*position:\s*static;[^}]*width:\s*100%;/s,
  "the example destination menu must remain visible inside the coachmark instead of floating away from it");
assert.match(onboarding, /renderDjToolsWithOnboardingDemo[\s\S]*?djToolsEnabled:\s*forceOpen \? true[\s\S]*?open:\s*forceOpen/,
  "the DJ step must show the active production DJ button and drawer");
assert.match(onboarding, /function decorateDemoArtwork[\s\S]*?hub-onboarding-demo-art[\s\S]*?icon-image\.svg/,
  "temporary panel artwork must use the themed demo treatment");
assert.doesNotMatch(css, /hub-onboarding-demo-art::before/,
  "temporary artwork must remain a quiet solid tile without diagonal decoration");
assert.match(css, /\.hub-onboarding-demo-art\s*\{[^}]*var\(--hub-panel-accent\)[^}]*var\(--hub-panel\)/s,
  "player and panel demo artwork must share the same theme-derived surface");
assert.match(css, /\.hub-onboarding-dialog\s*\{[^}]*isolation:\s*isolate;[^}]*overflow:\s*hidden;/s,
  "the glass coachmark must clip its filtered compositing layer to prevent rectangular bleed");
assert.match(css, /\.hub-onboarding-dialog\.is-frosted-glass\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--hub-panel, var\(--hub-card\)\) 94%, transparent\)/s,
  "coachmark contrast must not inherit an unreadably low player glass opacity");
assert.match(onboarding, /r\.\$panel\.classList\.toggle\("is-onboarding-preview", active\)/,
  "onboarding must identify the inert demo panel so its glass can use a stable compositing path");
assert.match(baseCss, /\.hub-panel\.is-frosted-glass\s*\{[^}]*background:\s*color-mix[^}]*backdrop-filter:\s*blur\(var\(--hub-glass-blur, 19px\)\)/s,
  "the onboarding panel preview must share the panel's immediate direct backdrop blur");
assert.match(onboarding, /canResume \? "Continue Tour" : "Take Tour"[\s\S]*?\$startOnboarding\(\{ replay: true, step: canResume \? savedStep : 0 \}\)/,
  "Settings must resume an interrupted guided tour");
assert.match(onboarding, /hub-onboarding-restart", "Take Tour"[\s\S]*?\$startOnboarding\(\{ replay: true, step: 0 \}\)/);

assert.match(persistence, /\$renderBackupReminder[\s\S]*?onboardingCompletedVersion\)\s*<=\s*0\) return null/,
  "the backup reminder must wait until onboarding is finished or skipped");
assert.match(settings, /renderOnboardingSettingsCard\(\)/,
  "Settings must mount the onboarding replay card");
assert.match(musicBar, /musicBarPanelButtons = "compact"/,
  "Every populated player style must use the single panel chevron");
assert.match(player, /djPlayerButton\.hidden\s*=\s*runtimeState\.djToolsEnabled === false/);
assert.match(playerCss, /\.hub-dj-player-button\[hidden\]\s*\{[^}]*display:\s*none;/s);
assert.match(pageActions, /runtimeState\.djToolsEnabled === false[\s\S]*?bandcamp-hub-page-dj-host/);
assert.match(analysis, /runtimeState\.djToolsEnabled === false[\s\S]*?bandkit-track-analysis/);
assert.match(layout, /\$renderOnboarding\(\)/, "normal Bandkit renders must update the coachmark");
assert.match(merge, /"onboardingCompletedVersion"[\s\S]*?"djToolsEnabled"/);
assert.match(merge, /merged\.onboardingCompletedVersion\s*=\s*Math\.max[\s\S]*?latestState\?\.onboardingCompletedVersion/);
assert.match(lifecycle, /applyOnboardingCompletionChange[\s\S]*?r\.\$onboardingActive && !r\.\$onboardingReplay/,
  "a transient unpacked-extension storage event must not dismiss an active first-run tour");
assert.match(css, /\.hub-onboarding-skip,[\s\S]*?\.hub-onboarding-backup-action\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*color:\s*var\(--hub-muted\);/s);
assert.doesNotMatch(onboarding, /replaceChildren\(header, title, body, footer\)/,
  "coachmarks must not render a persistent brand or step-count header");
assert.match(onboarding, /replaceChildren\(\.\.\.headingContent, title, body, footer\)/,
  "coachmarks should use a single heading");
assert.match(css, /\.hub-onboarding-back\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  "Back must remain text-only until interaction");
assert.match(css, /\.hub-onboarding-primary\s*\{[^}]*background:\s*var\(--hub-onboarding-bandcamp\);[^}]*border:\s*1px solid var\(--hub-onboarding-bandcamp\);/s,
  "the right-side primary action must retain its persistent button treatment");
assert.match(onboarding, /stepIndex === STEPS\.length - 1[\s\S]*?hub-onboarding-finish-logo[\s\S]*?logo-type-3\.svg/,
  "the final wrap-up step must show the Bandkit logo");
assert.match(css, /@media \(max-width: 700px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(onboarding, /Dynamic colour|createOnboardingBlendPicker/,
  "dynamic colour is on by default, so the tour must not ask about it or the glass blend behind it");
assert.match(onboarding, /createOnboardingHandlePicker[\s\S]*?hub-onboarding-handle-option[\s\S]*?createOnboardingHandlePreview/,
  "the onboarding handle control must expose a preview dropdown");
assert.match(css, /hub-onboarding-dialog:hover \.hub-onboarding-secondary-navigation[\s\S]*?hub-onboarding-secondary-navigation:focus-within/,
  "Back and Skip must reveal when the onboarding card is hovered or focused");
assert.doesNotMatch(onboarding, /musicBarSize|Player size/,
  "onboarding must leave player sizing to full Settings");

console.log("Onboarding guided-tour checks passed.");
