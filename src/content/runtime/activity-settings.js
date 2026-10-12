import { createColourField } from "../components/colour-field.js";
import { attachMenuKeyNavigation, attachMenuTriggerKeyNavigation } from "../menu-keyboard.js";
import { createSettingsAction, createPlayerSettingLabel, createSettingsActionRow, createSettingsActions, createSettingsRow, createSettingsRowCopy, createSettingsToggle } from "../components/settings.js";
import { runtimeSaveState, runtimeState, updateRuntimeState } from "./context.js";
import { createTimelinePicker } from "../timeline-picker.js";
import { createPlayerButtonSettings } from "../player-button-settings.js";
import { appendControlsDrawers } from "../controls-settings.js";
import { asset, createButtonIcon, createElement, createPanelCaret } from "../core.js";
import { hexColor, hexString, luminance, mixColor } from "../color.js";
import { BUILT_IN_THEMES, FEEDBACK_FORM_URL, FEEDBACK_LIST_URL, RELEASE_NOTES_URL, SUPPORT_CONTACT_EMAIL, SUPPORT_PAYMENT_URL, defaultState } from "../state.js";
import { MESSAGES } from "../../shared/contracts.js";
import { appendSettingsDisclosureSections, createSettingsDisclosure, createSettingsOverviewCard, prepareSettingsDetail, resetSettingsDisclosures } from "../settings-drawer.js";
import { registerSettingsOverview } from "../settings-overview.js";
import { createCornerStyleSetting, createFrostedGlassSetting, createMusicBarAnalysisSetting, createMusicBarSettings, createPersistentMusicBarAnalysisSetting, createVisualizerSettings } from "../music-bar-settings.js";
import { registerActivityView } from "./activity-view.js";
import { createCustomScrubColourSetting, createCustomVisualizerColourSettings } from "./visualizer-settings.js";
import { createControlsColourOverrides } from "../player-colour-overrides.js";
import { createScrubberHandleSetting } from "../scrub-handle-picker.js";
import { createThemeSourcePreview } from "../settings-option-previews.js";
import { createDynamicThemeInfo } from "../theme-option-markers.js";
import { createSettingsPicker } from "../settings-picker.js";
import { closeSettingsPopover, openSettingsPopover, settingsPopoverContainsFocus } from "../settings-popover.js";
import { appendCustomThemeEditor, createCustomThemeSaveAction } from "./custom-theme-settings.js";
function createTrackAnalysisSettings(r) {
  const section = createElement("section", "hub-analysis-settings hub-settings-group");
  section.hidden = runtimeState.djToolsEnabled === false;
  const primaryRow = createSettingsRow({ className: "hub-analysis-primary-row" });
  const primaryCopy = createSettingsRowCopy("Track analysis", "Automatically detect BPM and musical key on track pages.");
  const enabled = runtimeState.autoAnalyzeTracks !== false;
  const primaryToggle = createSettingsToggle({ checked: enabled, ariaLabel: "Enable track analysis", className: "hub-auto-analyze-toggle", controls: "hub-analysis-options", expanded: enabled });
  primaryToggle.addEventListener("click", () => {
    runtimeState.autoAnalyzeTracks = runtimeState.autoAnalyzeTracks === false;
    runtimeSaveState();
    r.$injectPageDjToolsLink();
    r.$render();
    r.$showToast(runtimeState.autoAnalyzeTracks ? "Track analysis enabled" : "Track analysis disabled");
  });
  primaryRow.append(primaryCopy, primaryToggle);

  const options = createElement("div", "hub-analysis-options hub-settings-dependent-options");
  options.id = "hub-analysis-options";
  options.hidden = !enabled;

  const playlistRow = createSettingsRow({ className: "hub-analysis-option-row hub-playlist-metadata-row" });
  const playlistCopy = createSettingsRowCopy("Save to playlists", "Store detected BPM and key on playlist track cards.");
  const recordPlaylistMetadata = runtimeState.recordPlaylistMetadata !== false;
  const playlistToggle = createSettingsToggle({ checked: recordPlaylistMetadata, ariaLabel: "Save BPM and key on playlists", className: "hub-playlist-metadata-toggle" });
  playlistToggle.addEventListener("click", () => {
    runtimeState.recordPlaylistMetadata = !(runtimeState.recordPlaylistMetadata !== false);
    runtimeSaveState();
    r.$render();
    r.$showToast(runtimeState.recordPlaylistMetadata ? "Playlist analysis enabled" : "Playlist analysis disabled");
  });
  playlistRow.append(playlistCopy, playlistToggle);

  const keysRow = createSettingsRow({ className: "hub-analysis-option-row hub-show-track-keys-row" });
  const keysCopy = createSettingsRowCopy("Musical key", "Show familiar key names such as A minor alongside BPM.");
  const showTrackKeys = runtimeState.showTrackKeys !== false;
  const keysToggle = createSettingsToggle({ checked: showTrackKeys, ariaLabel: "Show musical keys", className: "hub-show-track-keys-toggle" });
  keysToggle.addEventListener("click", () => {
    runtimeState.showTrackKeys = runtimeState.showTrackKeys === false;
    r.$syncTrackKeyVisibilityMode();
    r.$syncPageTrackAnalysisUi();
    runtimeSaveState();
    r.$render();
    r.$showToast(runtimeState.showTrackKeys ? "Musical keys shown" : "Musical keys hidden");
  });
  keysRow.append(keysCopy, keysToggle);

  const camelotRow = createSettingsRow({ className: "hub-analysis-option-row hub-show-camelot-row" });
  camelotRow.hidden = !showTrackKeys;
  const camelotCopy = createSettingsRowCopy("Camelot notation", "Show DJ-style values such as 8A alongside BPM.");
  const showCamelotNotation = runtimeState.showCamelotNotation === true;
  const camelotToggle = createSettingsToggle({ checked: showCamelotNotation, ariaLabel: "Show Camelot notation", className: "hub-show-camelot-toggle" });
  camelotToggle.addEventListener("click", () => {
    runtimeState.showCamelotNotation = runtimeState.showCamelotNotation !== true;
    r.$syncTrackKeyVisibilityMode();
    r.$syncPageTrackAnalysisUi();
    runtimeSaveState();
    r.$render();
    r.$showToast(runtimeState.showCamelotNotation ? "Camelot notation shown" : "Camelot notation hidden");
  });
  camelotRow.append(camelotCopy, camelotToggle);
  options.append(playlistRow, keysRow, camelotRow, createMusicBarAnalysisSetting(r), createPersistentMusicBarAnalysisSetting(r));
  section.append(primaryRow, options);
  return section;
}

function registerPlaybackSettings(r) {
r.$renderPlaybackSettings = function renderPlaybackSettings(requestedSubView = runtimeState.settingsSubView) {
      const playback = createElement("section", "hub-card hub-settings-card");
      playback.append(createElement("h2", "hub-settings-heading", "Player"));

      const subView = ["design", "size", "timeline", "visualiser"].includes(requestedSubView)
        ? requestedSubView : "index";
      if (subView === "index") {
        const stack = createElement("div", "hub-settings-overview-stack hub-settings-subview-stack");
        for (const [id, title] of [["design", "Design"], ["size", "Size"], ["timeline", "Controls"], ["visualiser", "Visualiser"]]) {
          stack.append(createSettingsOverviewCard({
            id,
            title,
            onOpen: () => {
              resetSettingsDisclosures();
              runtimeState.settingsSubView = id;
              runtimeSaveState();
              r.$saveLayoutState?.();
              r.$render();
            }
          }));
        }
        playback.append(stack);
        const detail = prepareSettingsDetail(playback);
        detail.classList.add("hub-player-settings", "is-subview-index");
        r.$content.append(detail);
        return;
      }

      const scrubberRow = createElement("div", "hub-player-setting-row hub-music-bar-scrubber-row");
      const scrubberLabel = createPlayerSettingLabel("Style", "Choose the timeline design used in the page player and music bar.", { ariaLabel: "Style. Choose the timeline design used in the page player and music bar." });
      const scrubberStyle = createTimelinePicker(r);
      scrubberRow.append(scrubberLabel, scrubberStyle.element);
      const scrubberHandleRow = createScrubberHandleSetting(r);
      const scrubberWidthRow = createElement("div", "hub-player-setting-row hub-music-bar-scrubber-width-row");
      const scrubberWidthLabel = createPlayerSettingLabel("Width", "Choose how far the music bar timeline extends.", { ariaLabel: "Width. Choose how far the music bar timeline extends." });
      const scrubberWidth = createSettingsPicker({
        ariaLabel: "Music bar timeline width",
        options: [{ value: "small", label: "Small" }, { value: "default", label: "Medium" }, { value: "full", label: "Full" }],
        value: runtimeState.musicBarScrubberWidth,
        onChange: (nextWidth, label) => {
          runtimeState.musicBarScrubberWidth = ["small", "full"].includes(nextWidth) ? nextWidth : "default";
          r.$syncScrubberStyles();
          r.$refreshScrubWaveform(true);
          runtimeSaveState();
          r.$showToast(`${label} music bar timeline enabled`);
        }
      });
      scrubberWidthRow.append(scrubberWidthLabel, scrubberWidth.element);
      const { styleSettings, sizeSettings } = createMusicBarSettings(r);
      const controlColours = createControlsColourOverrides(r);
      if (subView === "design") playback.append(styleSettings, createFrostedGlassSetting(r, { showBlendMode: true }), createCornerStyleSetting(r));
      if (subView === "size") playback.append(sizeSettings);
      if (subView === "timeline") appendControlsDrawers(
        playback,
        [controlColours.timeline, scrubberRow, scrubberStyle.customRows, scrubberWidthRow],
        [controlColours.handle, scrubberHandleRow],
        [controlColours.playback, createPlayerButtonSettings(r)]
      );
      if (subView === "visualiser") playback.append(createVisualizerSettings(r, { standalone: true }));
      const detail = prepareSettingsDetail(playback);
      detail.classList.add("hub-player-settings", `is-${subView}-subview`);
      r.$content.append(detail);
    };

// DJ and Analysis fine-tuning, shown under Features while DJ tools is on.
r.$createDjSettingsGroups = function createDjSettingsGroups() {
      const djToolsEnabled = runtimeState.djToolsEnabled !== false;
      const djSettings = createElement("section", "hub-dj-settings hub-settings-group hub-settings-subrow");
      const masterRow = createSettingsRow({ className: "hub-dj-master-row" });
      const masterToggle = createSettingsToggle({ checked: djToolsEnabled, ariaLabel: "DJ tools", className: "hub-dj-tools-toggle" });
      masterToggle.addEventListener("click", () => { r.$setDjToolsEnabled(!djToolsEnabled, { announce: true }); r.$render(); });
      masterRow.append(createSettingsRowCopy("DJ tools", "Add BPM, key, local analysis, tempo, EQ, filters and beat controls."), masterToggle);
      djSettings.append(masterRow);
      const knobRow = createSettingsRow({ className: "hub-dj-secondary-row hub-settings-dependent-row" });
      knobRow.hidden = !djToolsEnabled;
      const knobCopy = createSettingsRowCopy("Knob gesture", "Choose how DJ knobs respond.");
      const knobMode = createSettingsPicker({
        ariaLabel: "Knob gesture",
        options: [
          { value: "both", label: "Up/down + left/right" },
          { value: "vertical", label: "Up and down" },
          { value: "horizontal", label: "Left and right" },
          { value: "radial", label: "Turn around the dial" }
        ],
        value: runtimeState.dj.knobMode,
        onChange: (nextMode) => {
          runtimeState.dj.knobMode = nextMode;
          runtimeSaveState();
        }
      });
      knobRow.append(knobCopy, knobMode.element);
      djSettings.append(knobRow);
      const djGroup = createSettingsDisclosure("DJ", "", "dj");
      appendSettingsDisclosureSections(djGroup.content, djSettings);
      if (!djToolsEnabled) return [djGroup.group];
      const analysisGroup = createSettingsDisclosure("Analysis", "", "analysis");
      appendSettingsDisclosureSections(analysisGroup.content, createTrackAnalysisSettings(r));
      return [djGroup.group, analysisGroup.group];
    };
}

function registerBrowsingSettings(r) {
r.$renderBrowsingSettings = function renderBrowsingSettings() {
      const browsing = createElement("section", "hub-card hub-settings-card");
      browsing.append(createElement("h2", "hub-settings-heading", "Browsing"));
      const feedRow = createSettingsRow();
      const feedCopy = createSettingsRowCopy("Open Bandcamp to your feed", "Use your music feed as the homepage.");
      const openHomeToFeed = Boolean(runtimeState.openHomeToFeed);
      const feedToggle = createSettingsToggle({ checked: openHomeToFeed, ariaLabel: "Open Bandcamp to your feed", className: "hub-feed-home-toggle" });
      feedToggle.addEventListener("click", () => {
        runtimeState.openHomeToFeed = !runtimeState.openHomeToFeed;
        runtimeSaveState();
        r.$render();
      });
      feedRow.append(feedCopy, feedToggle);
      browsing.append(feedRow);
      r.$content.append(prepareSettingsDetail(browsing));
    };
}

function registerAppearanceSettingsShell(r) {
r.$createAppearanceSettings = function createAppearanceSettings() {
      const appearance = createElement("section", "hub-card hub-settings-card");
      appearance.append(createElement("h2", "hub-settings-heading", "Appearance"));
      const appearanceMode = runtimeState.appearance.applyToPage ? "theme" : "match";
      const appearanceSource = appearanceMode === "match"
        ? "match"
        : runtimeState.appearance.preset === "custom" ? "custom" : "theme";
      const appearanceModeRow = createSettingsRow({ className: "hub-appearance-mode-row" });
      const appearanceModeCopy = createSettingsRowCopy("Source", "Use dynamic page colours, a curated palette, or custom colours.");
      const appearanceModeControl = createSettingsPicker({
        ariaLabel: "Colour source",
        className: "hub-theme-source-picker",
        renderPreview: createThemeSourcePreview,
        options: [
          { value: "match", label: "Dynamic" },
          { value: "theme", label: "Curated" },
          { value: "custom", label: "Custom" }
        ],
        renderTrailing: mode => mode === "match" ? createDynamicThemeInfo() : null,
        value: appearanceSource,
        onChange: (mode) => {
          runtimeState.appearance.pageAware = mode === "match";
          runtimeState.appearance.applyToPage = mode !== "match";
          if (mode === "custom") runtimeState.appearance.preset = "custom";
          else if (mode === "theme" && runtimeState.appearance.preset === "custom") {
            runtimeState.appearance.preset = "studio";
          }
          r.$applyAppearance();
          runtimeSaveState();
          r.$render();
          r.$showToast(mode === "custom" ? "Custom colours enabled"
            : mode === "theme" ? "Palette applied to Bandcamp" : "Dynamic colours enabled");
        }
      });
      appearanceModeRow.append(appearanceModeCopy, appearanceModeControl.element);
      const themeDisclosure = createSettingsDisclosure("Colours", "", "colours");
      const themeGroup = themeDisclosure.content;
      themeGroup.classList.add("hub-theme-settings-group");
      themeGroup.append(appearanceModeRow);
      const surfaceGroup = createFrostedGlassSetting(r);
      const cornerStyleGroup = createCornerStyleSetting(r);
      const finishDisclosure = createSettingsDisclosure("Finish", "", "finish");
      appendSettingsDisclosureSections(finishDisclosure.content, surfaceGroup, cornerStyleGroup);
      appearance.append(themeDisclosure.group, finishDisclosure.group);
      return { appearance, appearanceMode, themeGroup };
    };
}

function registerAppearanceThemePicker(r) {
r.$appendAppearanceThemePicker = function appendAppearanceThemePicker(appearance, appearanceMode) {
      const customContent = runtimeState.appearance.customContentLinked === false
        ? runtimeState.appearance.customCard
        : runtimeState.appearance.customPageSurface;
      const customTheme = {
        id: "custom",
        label: "Custom",
        group: "custom",
        accent: runtimeState.appearance.customAccent,
        scrubAccent: runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent,
        visualizerColors: [
          runtimeState.appearance.customVisualizerColor1 || runtimeState.appearance.customAccent,
          runtimeState.appearance.customVisualizerColor2 || runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent,
          runtimeState.appearance.customVisualizerColor3 || hexString(mixColor(
            hexColor(runtimeState.appearance.customAccent),
            hexColor(runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent),
            0.62
          ))
        ],
        surface: runtimeState.appearance.customPanelLinked === false
          ? runtimeState.appearance.customSurface
          : customContent,
        card: customContent,
        background: runtimeState.appearance.customPageBackground,
        pageSurface: runtimeState.appearance.customPageSurface,
        navbar: runtimeState.appearance.customNavbar,
        text: runtimeState.appearance.customText,
        secondaryText: runtimeState.appearance.customSecondaryText
      };
      const availableThemes = [customTheme, ...BUILT_IN_THEMES, ...(runtimeState.appearance.savedThemes || [])]
        .map(({ id, label, group, accent, scrubAccent, visualizerColors, surface, card, background, pageSurface, navbar, text, secondaryText }) => {
        const surfaceColor = hexColor(surface, { r: 255, g: 255, b: 255, a: 1 });
        const resolvedCard = card || hexString(luminance(surfaceColor) < 0.34
          ? mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.07)
          : mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.4));
        const resolvedText = text || (luminance(hexColor(pageSurface || surface, { r: 255, g: 255, b: 255, a: 1 })) < 0.34 ? "#f8fafc" : "#111827");
        const resolvedNavbar = navbar || pageSurface || surface;
        const resolvedSecondaryText = secondaryText || hexString(mixColor(
          hexColor(resolvedText, { r: 17, g: 24, b: 39, a: 1 }),
          hexColor(pageSurface || surface, surfaceColor),
          luminance(hexColor(pageSurface || surface, surfaceColor)) < 0.34 ? 0.35 : 0.42
        ));
        return {
          id, label, group: group || "saved", accent, scrubAccent, visualizerColors, surface, card, background, pageSurface, navbar, text, secondaryText,
          resolvedCard, resolvedText, resolvedNavbar, resolvedSecondaryText
        };
      });

      const createThemePalette = (theme) => {
        const palette = createElement("span", "hub-theme-option-palette");
        palette.setAttribute("aria-hidden", "true");
        for (const colour of [theme.accent, theme.background || theme.surface, theme.pageSurface || theme.surface, theme.resolvedText]) {
          const swatch = createElement("span", "hub-theme-option-swatch");
          swatch.style.backgroundColor = colour;
          palette.append(swatch);
        }
        return palette;
      };
      const applyAppearanceTheme = (theme) => {
        const themeValues = theme.id === "custom" ? {} : {
          customAccent: theme.accent, customScrubAccent: theme.scrubAccent && theme.scrubAccent !== theme.accent ? theme.scrubAccent : null,
          customVisualizerColor1: theme.visualizerColors?.[0] || null, customVisualizerColor2: theme.visualizerColors?.[1] || null,
          customVisualizerColor3: theme.visualizerColors?.[2] || null, customSurface: theme.resolvedCard,
          customPanelLinked: true, customContentLinked: true, customPageBackground: theme.background || theme.surface,
          customPageSurface: theme.pageSurface || theme.surface, customCard: theme.pageSurface || theme.surface,
          customNavbar: theme.resolvedNavbar, customText: theme.resolvedText, customSecondaryText: theme.resolvedSecondaryText
        };
        Object.assign(runtimeState.appearance, { preset: theme.id, ...themeValues });
        r.$applyAppearance();
      };
      let themePreviewSnapshot = null;
      let previewedThemeId = null;
      const restoreAppearanceThemePreview = () => {
        if (!themePreviewSnapshot) return;
        Object.assign(runtimeState.appearance, themePreviewSnapshot); themePreviewSnapshot = null; previewedThemeId = null;
        r.$applyAppearance();
      };
      const previewAppearanceTheme = (theme) => {
        if (!theme || previewedThemeId === theme.id) return;
        if (!themePreviewSnapshot) themePreviewSnapshot = { ...runtimeState.appearance };
        else Object.assign(runtimeState.appearance, themePreviewSnapshot);
        previewedThemeId = theme.id; applyAppearanceTheme(theme);
      };
      const selectAppearanceTheme = (theme) => {
        if (themePreviewSnapshot) Object.assign(runtimeState.appearance, themePreviewSnapshot);
        themePreviewSnapshot = null; previewedThemeId = null; applyAppearanceTheme(theme);
        runtimeSaveState(); r.$render();
      };

      if (appearanceMode === "theme") {
        const selectedTheme = availableThemes.find((theme) => theme.id === runtimeState.appearance.preset)
          || availableThemes.find((theme) => theme.id === "studio")
          || availableThemes[0];
        const themeField = createSettingsRow({ className: "hub-theme-picker-field" });
        const themeCopy = createSettingsRowCopy("Palette", "Choose the colours applied to Bandcamp pages.");
        const themePicker = createElement("div", "hub-theme-picker");
        const listboxId = "hub-theme-picker-options";
        const themeTrigger = createElement("button", "hub-theme-combobox");
        themeTrigger.type = "button"; themeTrigger.setAttribute("role", "combobox"); themeTrigger.setAttribute("aria-label", "Palette");
        themeTrigger.setAttribute("aria-controls", listboxId); themeTrigger.setAttribute("aria-haspopup", "listbox");
        themeTrigger.setAttribute("aria-expanded", "false");
        const triggerMarker = createElement("span", "hub-theme-trigger-marker");
        if (selectedTheme.id === "custom") {
          const customIcon = createButtonIcon("icon-settings.svg");
          customIcon.classList.add("hub-theme-custom-icon"); customIcon.setAttribute("aria-hidden", "true"); triggerMarker.append(customIcon);
        }
        themeTrigger.append(
          createThemePalette(selectedTheme),
          createElement("span", "hub-theme-combobox-label", selectedTheme.label),
          triggerMarker,
          createPanelCaret("hub-theme-combobox-chevron")
        );
        const themeOptions = createElement("div", "hub-theme-options");
        themeOptions.id = listboxId; themeOptions.setAttribute("role", "listbox"); themeOptions.hidden = true;
        const setThemePickerOpen = (open) => {
          if (open) openSettingsPopover(themeTrigger, themeOptions);
          else { closeSettingsPopover(themeOptions); restoreAppearanceThemePreview(); }
          themeTrigger.setAttribute("aria-expanded", String(open));
          themePicker.classList.toggle("is-open", open);
        };
        themeTrigger.addEventListener("click", () => setThemePickerOpen(themeOptions.hidden));
        const closeThemePicker = () => { setThemePickerOpen(false); themeTrigger.focus(); };
        themePicker.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !themeOptions.hidden) closeThemePicker();
        });
        attachMenuKeyNavigation(themeOptions, { onEscape: closeThemePicker });
        attachMenuTriggerKeyNavigation(themeTrigger, themeOptions, { open: () => setThemePickerOpen(true) });
        const handleThemePickerFocusout = () => {
          window.setTimeout(() => {
            if (!settingsPopoverContainsFocus(themePicker, themeOptions)) setThemePickerOpen(false);
          }, 0);
        };
        themePicker.addEventListener("focusout", handleThemePickerFocusout);
        themeOptions.addEventListener("focusout", handleThemePickerFocusout);
        for (const [group, label] of [["custom", "Your colours"], ["light", "Light"], ["dark", "Dark"], ["electric", "Electric"], ["print", "Print Lab"], ["wacky", "Wacky"], ["saved", "Saved"]]) {
          const groupedThemes = availableThemes.filter((theme) => theme.group === group);
          if (!groupedThemes.length) continue;
          const optionGroup = createElement("div", "hub-theme-option-group");
          const groupLabel = createElement("div", "hub-theme-option-group-label", label);
          groupLabel.id = `hub-theme-option-group-${group}`;
          optionGroup.setAttribute("role", "group");
          optionGroup.setAttribute("aria-labelledby", groupLabel.id);
          optionGroup.dataset.themeGroup = group;
          optionGroup.append(groupLabel);
          for (const theme of groupedThemes) {
            const option = createElement("button", `hub-theme-option${theme.id === selectedTheme.id ? " is-selected" : ""}`);
            option.type = "button"; option.setAttribute("role", "option");
            option.setAttribute("aria-selected", String(theme.id === selectedTheme.id)); option.dataset.themeId = theme.id;
            const optionMarker = createElement("span", "hub-theme-option-marker");
            if (theme.id === "custom") {
              const customIcon = createButtonIcon("icon-settings.svg");
              customIcon.classList.add("hub-theme-custom-icon"); customIcon.setAttribute("aria-hidden", "true"); optionMarker.append(customIcon);
            }
            option.append(
              createThemePalette(theme),
              createElement("span", "hub-theme-option-label", theme.label)
            );
            if (optionMarker.childElementCount) option.append(optionMarker);
            option.addEventListener("pointerenter", () => { if (!themeOptions.hidden) previewAppearanceTheme(theme); });
            option.addEventListener("focus", () => { if (!themeOptions.hidden) previewAppearanceTheme(theme); });
            option.addEventListener("click", () => {
              setThemePickerOpen(false);
              selectAppearanceTheme(theme);
            });
            optionGroup.append(option);
          }
          themeOptions.append(optionGroup);
        }
        themeOptions.addEventListener("pointerleave", restoreAppearanceThemePreview);
        themePicker.append(themeTrigger, themeOptions);
        themeField.append(themeCopy, themePicker);
        appearance.append(themeField);

        const themeSharingActions = createElement("div", "hub-toolbar hub-theme-back-actions");
        themeSharingActions.dataset.settingsBackActions = "true";
        const downloadTheme = createElement("button", "hub-playlist-toolbar-icon hub-theme-sharing-action");
        downloadTheme.type = "button";
        downloadTheme.dataset.settingsTooltip = "Download the current Bandkit palette as a file.";
        downloadTheme.setAttribute("aria-label", "Download palette");
        downloadTheme.append(createButtonIcon("icon-download-all.svg"));
        downloadTheme.addEventListener("click", r.$exportAppearanceTheme);
        const importThemeInput = document.createElement("input");
        importThemeInput.type = "file";
        importThemeInput.accept = ".json,application/json";
        importThemeInput.hidden = true;
        const importTheme = createElement("button", "hub-playlist-toolbar-icon hub-theme-sharing-action");
        importTheme.type = "button";
        importTheme.dataset.settingsTooltip = "Import a Bandkit palette from a saved file.";
        importTheme.setAttribute("aria-label", "Import palette");
        importTheme.append(createButtonIcon("icon-import.svg"));
        importTheme.addEventListener("click", () => importThemeInput.click());
        importThemeInput.addEventListener("change", () => {
          const file = importThemeInput.files?.[0];
          importThemeInput.value = "";
          void r.$importAppearanceTheme(file, importTheme);
        });
        themeSharingActions.append(downloadTheme, importTheme, importThemeInput);
        appearance.append(themeSharingActions);
      }
    };
}

function registerCustomThemePreview(r) {
r.$applyCustomThemePreview = function applyCustomThemePreview() {
      r.$customThemePreviewFrame = 0;
      r.$applyBandcampPageTheme();
      r.$applyShadowHeaderTheme();
      if (r.$modernReleasePalette) {
        const palette = r.$themedModernReleasePalette(r.$modernReleasePalette);
        r.$setModernReleasePalette(r.$accessibleModernPagePalette(palette));
      }
      r.$applySelectedTheme();
      const accessibility = r.$content.querySelector(".hub-theme-accessibility");
      if (accessibility) {
        const theme = r.$accessibleAppearanceTheme();
        accessibility.classList.toggle("is-adjusted", theme.adjusted);
        accessibility.querySelector("strong").textContent = theme.adjusted ? "Contrast adjusted automatically" : "Accessible contrast";
        accessibility.querySelector("span").textContent = `Text ${theme.textContrast.toFixed(1)}:1 · controls ${theme.accentContrast.toFixed(1)}:1`;
      }
    };
r.$scheduleCustomThemePreview = function scheduleCustomThemePreview() {
      if (r.$customThemePreviewFrame) return;
      r.$customThemePreviewFrame = requestAnimationFrame(r.$applyCustomThemePreview);
    };
r.$commitCustomThemeColour = function commitCustomThemeColour() {
      if (r.$customThemePreviewFrame) cancelAnimationFrame(r.$customThemePreviewFrame);
      r.$applyCustomThemePreview();
      runtimeSaveState();
    };
r.$containThemeColourPointer = function containThemeColourPointer(input) {
      for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
        input.addEventListener(eventName, (event) => event.stopPropagation());
      }
    };
}

function registerCustomThemeSettings(r) {
r.$appendCustomThemeSettings = function appendCustomThemeSettings(appearance, appearanceMode) {
      if (appearanceMode === "theme" && runtimeState.appearance.preset === "custom") {
        const customPanel = createElement("div", "hub-custom-theme-panel"), customColours = createElement("div", "hub-custom-colours");
        appearance.querySelector("[data-settings-back-actions]")?.prepend(createCustomThemeSaveAction(r));
        customColours.hidden = appendCustomThemeEditor(r, customPanel) === "simple";
        const visualizerColours = createCustomVisualizerColourSettings(r);
        const playerColourOverrides = createControlsColourOverrides(r);
        const createColourGroup = (title, key) => {
          const disclosure = createSettingsDisclosure(title, "", key);
          disclosure.group.classList.add("hub-visualizer-colour-disclosure", "hub-theme-colour-disclosure");
          disclosure.content.classList.add("hub-theme-colour-group");
          customColours.append(disclosure.group);
          return disclosure.content;
        };
        const bandcampColours = createColourGroup("Bandcamp", "theme-bandcamp-colours");
        const bandkitColours = createColourGroup("Bandkit surfaces", "theme-bandkit-colours");
        const playerColourGroup = createColourGroup("Player", "theme-player-colours");
        let contentInput = null, panelInput = null;
        for (const [key, label] of [
          ["customAccent", "Accent"],
          ["customPageBackground", "Page background"],
          ["customPageSurface", "Page content"],
          ["customNavbar", "Artist navigation"],
          ["customCard", "Bandkit content"],
          ["customSurface", "Bandkit panel"],
          ["customText", "Primary text"],
          ["customSecondaryText", "Secondary text"]
        ]) {
          const contentLinked = key === "customCard" && runtimeState.appearance.customContentLinked !== false;
          const panelLinked = key === "customSurface" && runtimeState.appearance.customPanelLinked !== false;
          const resolvedContent = runtimeState.appearance.customContentLinked === false
            ? runtimeState.appearance.customCard
            : runtimeState.appearance.customPageSurface;
          const linked = key === "customCard" || key === "customSurface";
          const { field, input, reset: colourLink, setOverridden: setColourOverridden } = createColourField({
            label, tooltip: `Choose the ${label.toLowerCase()} colour.`, ariaLabel: null,
            id: `bandkit-theme-colour-${key}`,
            value: contentLinked ? runtimeState.appearance.customPageSurface
              : panelLinked ? resolvedContent : runtimeState.appearance[key],
            className: `hub-colour-field hub-player-setting-row hub-theme-colour-row${linked ? " is-linked-colour" : ""}`,
            sourceLabel: linked ? key === "customCard" ? "From page" : "From content" : undefined,
            resetLabel: key === "customCard" ? "Reset to page" : "Reset to content"
          });
          input.dataset.themeColour = key;
          r.$containThemeColourPointer(input);
          if (key === "customCard") {
            contentInput = input;
            setColourOverridden(!contentLinked);
            colourLink.addEventListener("click", () => {
              Object.assign(runtimeState.appearance, {
                customContentLinked: true, customCard: runtimeState.appearance.customPageSurface
              });
              input.value = runtimeState.appearance.customPageSurface;
              setColourOverridden(false);
              if (runtimeState.appearance.customPanelLinked !== false) {
                runtimeState.appearance.customSurface = runtimeState.appearance.customCard;
                if (panelInput) panelInput.value = runtimeState.appearance.customCard;
              }
              r.$applyAppearance();
              runtimeSaveState();
            });
          } else if (key === "customSurface") {
            panelInput = input;
            setColourOverridden(!panelLinked);
            colourLink.addEventListener("click", () => {
              Object.assign(runtimeState.appearance, {
                customPanelLinked: true,
                customSurface: runtimeState.appearance.customContentLinked === false
                  ? runtimeState.appearance.customCard : runtimeState.appearance.customPageSurface
              });
              input.value = runtimeState.appearance.customSurface;
              setColourOverridden(false);
              r.$applyAppearance();
              runtimeSaveState();
            });
          }
          input.addEventListener("input", () => {
            if (key === "customCard") {
              runtimeState.appearance.customContentLinked = false;
              setColourOverridden(true);
            } else if (key === "customSurface") {
              runtimeState.appearance.customPanelLinked = false;
              setColourOverridden(true);
            }
            runtimeState.appearance[key] = input.value;
            if (key === "customPageSurface" && runtimeState.appearance.customContentLinked !== false) {
              runtimeState.appearance.customCard = input.value;
              if (contentInput) contentInput.value = input.value;
            }
            if ((key === "customCard" || key === "customPageSurface")
              && runtimeState.appearance.customPanelLinked !== false
              && (key === "customCard" || runtimeState.appearance.customContentLinked !== false)) {
              runtimeState.appearance.customSurface = input.value;
              if (panelInput) panelInput.value = input.value;
            }
            if (key === "customAccent" && !runtimeState.appearance.customScrubAccent) {
              const scrubInput = customColours.querySelector('[data-theme-colour="customScrubAccent"]');
              if (scrubInput) scrubInput.value = input.value;
            }
            if (key === "customAccent") visualizerColours.syncLinked();
            r.$scheduleCustomThemePreview();
          });
          input.addEventListener("change", r.$commitCustomThemeColour);
          (key.startsWith("customPage") || key === "customAccent" || key === "customNavbar"
            ? bandcampColours : bandkitColours).append(field);
        }
        playerColourGroup.append(visualizerColours.group, playerColourOverrides.playback, playerColourOverrides.handle,
          createCustomScrubColourSetting(r, visualizerColours));
        customPanel.append(customColours);
        appearance.append(customPanel);
      }
    };
}

function registerSavedThemeSettings(r) {
r.$appendSavedThemeSettings = function appendSavedThemeSettings(appearance, appearanceMode) {
      if (appearanceMode !== "theme") return;
      const savedTheme = (runtimeState.appearance.savedThemes || []).find((theme) => theme.id === runtimeState.appearance.preset);
      if (!savedTheme) return;
      const actions = createSettingsActions();
      const renameTheme = createSettingsAction("Rename", { tag: "button", className: "hub-theme-management-action" });
      renameTheme.type = "button";
      renameTheme.setAttribute("aria-label", "Rename saved palette");
      renameTheme.addEventListener("click", () => {
        const label = window.prompt("Rename this saved palette", savedTheme.label)?.trim();
        if (!label) return;
        const nextLabel = label.slice(0, 28);
        runtimeState.appearance.savedThemes = runtimeState.appearance.savedThemes.map((theme) => (
          theme.id === savedTheme.id ? { ...theme, label: nextLabel } : theme
        ));
        runtimeSaveState();
        r.$render();
        r.$showToast(`Renamed palette to “${nextLabel}”`);
      });
      const deleteTheme = createSettingsAction("Delete", { tag: "button", className: "hub-theme-management-action is-danger" });
      deleteTheme.type = "button";
      deleteTheme.setAttribute("aria-label", "Delete saved palette");
      deleteTheme.addEventListener("click", () => {
        if (!window.confirm(`Delete the saved palette “${savedTheme.label}”?`)) return;
        runtimeState.appearance.savedThemes = runtimeState.appearance.savedThemes.filter((theme) => theme.id !== savedTheme.id);
        runtimeState.appearance.preset = "custom";
        runtimeSaveState();
        r.$render();
        r.$showToast(`Deleted palette “${savedTheme.label}”`);
      });
      actions.append(renameTheme, deleteTheme);
      appearance.append(createSettingsActionRow({
        label: "Saved palette", description: "Rename or delete this saved palette.",
        actions, className: "hub-theme-management-row"
      }));
    };
}

function registerFeatureSettings(r) {
r.$renderFeatureSettings = function renderFeatureSettings() {
      const features = createElement("section", "hub-card hub-settings-card hub-feature-settings");
      features.append(createElement("h2", "hub-settings-heading", "Features"));
      // Two layers, like every other section: the switches that turn whole
      // parts of Bandkit on or off, then DJ and its analysis fine-tuning.
      const coreGroup = createSettingsDisclosure("Modules", "", "modules");
      const coreRows = createElement("section", "hub-settings-group hub-settings-subrow hub-module-settings");
      const featureRow = (label, description, checked, className, onToggle) => {
        const row = createSettingsRow();
        const toggle = createSettingsToggle({ checked, ariaLabel: label, className });
        toggle.addEventListener("click", onToggle);
        row.append(createSettingsRowCopy(label, description), toggle);
        coreRows.append(row);
      };
      // One switch owns the whole cart: on, Bandkit's Cart panel replaces
      // Bandcamp's carts; off, Bandcamp's own cart is back everywhere.
      const cartEnabled = r.$cartFeaturesEnabled();
      featureRow("Bandkit cart", "Mirror, save and edit your cart in Bandkit. Turn off to use Bandcamp’s own cart.",
        cartEnabled, "hub-cart-enabled-toggle", () => r.$setCartFeaturesEnabled(!cartEnabled));
      const playlistsEnabled = r.$playlistsFeatureEnabled();
      featureRow("Saved playlists", "Save, play and share playlists beside Now Playing.", playlistsEnabled,
        "hub-playlists-enabled-toggle", () => r.$setFeatureEnabled("playlistsEnabled", !playlistsEnabled, "Saved playlists"));
      const activityEnabled = r.$activityFeatureEnabled();
      featureRow("Activity", "Keep a local history of listening, cart and playlist actions.", activityEnabled,
        "hub-activity-enabled-toggle", () => r.$setFeatureEnabled("activityEnabled", !activityEnabled, "Activity"));
      const downloadsEnabled = r.$downloadsFeatureEnabled();
      featureRow("Collection downloads", "Select releases in your collection and download them in one go.", downloadsEnabled,
        "hub-downloads-enabled-toggle", () => {
          r.$setFeatureEnabled("downloadsEnabled", !downloadsEnabled, "Collection downloads");
          r.$syncCollectionDownloadSelection?.();
        });
      const modernReleasePages = Boolean(runtimeState.appearance.modernReleasePages);
      featureRow("Modern Bandcamp pages", "Refresh legacy feeds and artist pages.", modernReleasePages, "hub-modern-release-toggle", () => {
        runtimeState.appearance.modernReleasePages = !modernReleasePages;
        r.$applyAppearance();
        r.$injectPlaylistButtons({ incremental: false });
        runtimeSaveState();
        r.$render();
        r.$showToast(runtimeState.appearance.modernReleasePages ? "Modern Bandcamp pages enabled" : "Classic Bandcamp pages restored");
      });
      const bandkitPlayerEnabled = Boolean(runtimeState.appearance.hideBandcampPlayer);
      featureRow("Bandkit player", "Replace Bandcamp’s player with the Bandkit music bar. Turn off to restore Bandcamp’s player.", bandkitPlayerEnabled, "hub-native-player-toggle", () => {
        const enabled = !bandkitPlayerEnabled;
        const revision = (Number(r.$playerModeChangeRevision) || 0) + 1;
        r.$playerModeChangeRevision = revision;
        if (!enabled) {
          runtimeState.appearance.hideBandcampPlayer = false;
          r.$applyNativePlayerVisibility();
          runtimeSaveState();
        }
        void r.$clearPlayerModeQueue().catch(() => {}).then(async () => {
          if (revision !== r.$playerModeChangeRevision) return;
          runtimeState.appearance.hideBandcampPlayer = enabled;
          if (enabled) r.$releaseExplicitPlaybackClear();
          r.$applyNativePlayerVisibility();
          await runtimeSaveState();
          if (revision !== r.$playerModeChangeRevision) return;
          r.$render();
          r.$showToast(enabled ? "Bandkit player turned on" : "Bandcamp player restored");
        });
      });
      const keyboardShortcutsEnabled = runtimeState.keyboardShortcutsEnabled !== false;
      featureRow("Keyboard shortcuts", "Control playback from the keyboard. Press ? to see the keys.", keyboardShortcutsEnabled,
        "hub-keyboard-shortcuts-toggle", () => r.$setFeatureEnabled("keyboardShortcutsEnabled", !keyboardShortcutsEnabled, "Keyboard shortcuts"));
      appendSettingsDisclosureSections(coreGroup.content, coreRows);
      features.append(coreGroup.group, ...r.$createDjSettingsGroups());
      r.$content.append(prepareSettingsDetail(features));
    };
}

function registerAppearanceSettingsFinish(r) {
r.$finishAppearanceSettings = function finishAppearanceSettings(appearance) {
      r.$content.append(prepareSettingsDetail(appearance));
    };
}

function registerSettingsInfoCards(r) {
r.$renderOnboardingSettings = function renderOnboardingSettings() {
      r.$content.append(prepareSettingsDetail(r.$renderOnboardingSettingsCard()));
    };

r.$renderPrivacySettings = function renderPrivacySettings() {
      const privacy = createElement("section", "hub-card hub-settings-card");
      privacy.append(createElement("h2", "hub-settings-heading", "Privacy and data"));
      const backupBlock = createElement("section", "hub-backup-block");
      const lastBackupDate = runtimeState.lastBackupAt ? new Date(runtimeState.lastBackupAt) : null;
      const validLastBackupDate = lastBackupDate && !Number.isNaN(lastBackupDate.getTime());
      const backupStatus = validLastBackupDate
        ? lastBackupDate.toLocaleString()
        : "Not yet saved";
      const lastBackupRow = createSettingsRow({ className: "hub-settings-dependent-row" });
      const lastBackupCopy = createSettingsRowCopy("Last backup", "See when the latest portable backup was saved.");
      lastBackupRow.append(lastBackupCopy, createElement("span", "hub-settings-row-value hub-backup-location", backupStatus));
      const backupActions = createSettingsActions("hub-backup-actions");
      const saveBackup = createSettingsAction("Save", { tag: "button", className: "hub-backup-action" });
      saveBackup.setAttribute("aria-label", "Save backup");
      saveBackup.type = "button";
      saveBackup.addEventListener("click", () => r.$runBackupAction(saveBackup, r.$savePortableBackup));
      const restoreBackup = createSettingsAction("Restore", { tag: "button", className: "hub-backup-action" });
      restoreBackup.setAttribute("aria-label", "Restore backup");
      restoreBackup.type = "button";
      restoreBackup.addEventListener("click", () => r.$runBackupAction(restoreBackup, r.$restorePortableBackup));
      const backupRow = createSettingsActionRow({
        label: "Backup", description: "Save or restore a portable copy of your Bandkit data.",
        actions: backupActions, className: "hub-backup-row"
      });

      const reminderRow = createSettingsRow({ className: "hub-backup-frequency-row hub-settings-dependent-row" });
      const reminderCopy = createSettingsRowCopy("Backup reminder", "Choose how often Bandkit reminds you to save a fresh file.");
      const reminderFrequency = createSettingsPicker({
        ariaLabel: "Backup reminder frequency",
        className: "hub-backup-frequency",
        options: [
          { value: "7", label: "Every week" },
          { value: "14", label: "Every 2 weeks" },
          { value: "30", label: "Every month" },
          { value: "0", label: "Off" }
        ],
        value: String(r.$backupReminderDays()),
        onChange: (nextFrequency, label) => {
          runtimeState.backupReminderDays = Number(nextFrequency);
          if (runtimeState.backupIntroSeen !== true) runtimeState.backupIntroSeen = true;
          runtimeState.backupReminderSnoozedAt = new Date().toISOString();
          r.$saveState();
          r.$render();
          r.$showToast(Number(nextFrequency) ? `Backup reminders set to ${label.toLowerCase()}` : "Backup reminders turned off");
        }
      });
      reminderRow.append(reminderCopy, reminderFrequency.element);
      const deleteData = createSettingsAction("Delete", { tag: "button", className: "hub-settings-danger" });
      deleteData.setAttribute("aria-label", "Delete all Bandkit data");
      deleteData.type = "button";
      deleteData.addEventListener("click", async () => {
        if (!window.confirm("Delete all Bandkit settings, playlists, cart backups, activity and playback data from this browser? Any backup file you previously saved will remain. This cannot be undone.")) return;
        deleteData.disabled = true;
        r.$storageDisabled = true;
        const response = await r.$runtimeMessage({ type: MESSAGES.DELETE_ALL_DATA });
        if (!response?.ok) {
          r.$storageDisabled = false;
          deleteData.disabled = false;
          r.$showToast(response?.error || "Bandkit data could not be deleted.");
          return;
        }
        r.$state = updateRuntimeState(structuredClone(defaultState));
        r.$layoutRevision = 0;
        r.$showToast("All Bandkit data deleted");
        window.setTimeout(() => location.reload(), 500);
      });
      backupActions.append(saveBackup, restoreBackup);
      const dataRow = createSettingsActionRow({ tag: "div", label: "Data", description: "Permanently remove Bandkit settings, playlists, activity and playback data from this browser.", actions: deleteData });
      backupBlock.append(backupRow, lastBackupRow, dataRow, reminderRow);
      privacy.append(backupBlock);
      r.$content.append(prepareSettingsDetail(privacy));
    };

r.$renderAboutSettings = function renderAboutSettings() {
      const info = createElement("section", "hub-card hub-settings-card");
      info.append(createElement("h2", "hub-settings-heading", "About & support"));
      const about = createElement("section", "hub-settings-info-rows");
      const aboutRow = createSettingsRow({ className: "hub-about-brand" });
      const aboutIcon = document.createElement("img");
      aboutIcon.className = "hub-about-brand-logo";
      aboutIcon.src = asset("logo-type-3.svg");
      aboutIcon.alt = "Bandkit";
      const aboutCopy = createSettingsRowCopy("Bandkit", "Your Bandcamp companion extension.");
      aboutRow.append(aboutCopy, aboutIcon);
      const releaseRow = createSettingsRow();
      const releaseCopy = createSettingsRowCopy("Release", "See the installed Bandkit version.");
      releaseRow.append(releaseCopy, createElement("span", "hub-settings-row-value", `v${chrome.runtime.getManifest().version}`));
      about.append(aboutRow, releaseRow);

      const releaseNotesLink = createSettingsAction("Release notes", { tag: "a" });
      releaseNotesLink.href = RELEASE_NOTES_URL;
      releaseNotesLink.target = "_blank";
      releaseNotesLink.rel = "noopener noreferrer";
      releaseNotesLink.dataset.settingsTooltip = "See what changed in each Bandkit release.";
      const releaseNotes = createSettingsActionRow({ tag: "section", label: "What’s new", description: "See what changed in each Bandkit release.", actions: releaseNotesLink });

      const feedbackActions = createSettingsActions();
      const sendFeedback = createSettingsAction("Send Feedback", { tag: "a" });
      sendFeedback.href = FEEDBACK_FORM_URL;
      sendFeedback.target = "_blank";
      sendFeedback.rel = "noopener noreferrer";
      sendFeedback.dataset.settingsTooltip = "Report a bug or suggest a feature. Submissions and attachments are public.";
      const viewFeedback = createSettingsAction("View Feedback", { tag: "a" });
      viewFeedback.href = FEEDBACK_LIST_URL;
      viewFeedback.target = "_blank";
      viewFeedback.rel = "noopener noreferrer";
      feedbackActions.append(sendFeedback, viewFeedback);
      const feedback = createSettingsActionRow({ tag: "section", label: "Feedback", description: "Send a suggestion or review existing feedback.", actions: feedbackActions });

      const supportLink = createSettingsAction("Support Bandkit", { tag: "a", className: "hub-support-action" });
      supportLink.href = SUPPORT_PAYMENT_URL;
      supportLink.target = "_blank";
      supportLink.rel = "noopener noreferrer";
      supportLink.dataset.settingsTooltip = "Support continued development with a one-off tip, handled securely by Stripe.";
      const support = createSettingsActionRow({ tag: "section", label: "Support", description: "Support continued Bandkit development with a one-off tip.", actions: supportLink });

      const contactLink = createSettingsAction(SUPPORT_CONTACT_EMAIL, { tag: "a", className: "hub-contact-action" });
      contactLink.href = `mailto:${SUPPORT_CONTACT_EMAIL}`;
      contactLink.dataset.settingsTooltip = `Open your email app to message ${SUPPORT_CONTACT_EMAIL}.`;
      const contact = createSettingsActionRow({ tag: "section", label: "Contact", description: "Email the developer about a problem or question.", actions: contactLink });
      info.append(about, releaseNotes, feedback, support, contact);
      r.$content.append(prepareSettingsDetail(info));
    };
}

export const registerActivitySettings = [
  registerPlaybackSettings, registerBrowsingSettings, registerAppearanceSettingsShell,
  registerAppearanceThemePicker, registerSavedThemeSettings, registerCustomThemePreview,
  registerCustomThemeSettings, registerFeatureSettings, registerAppearanceSettingsFinish,
  registerSettingsInfoCards, registerActivityView, registerSettingsOverview
];
