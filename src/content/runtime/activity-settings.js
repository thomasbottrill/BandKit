import { runtimeSaveState, runtimeState, updateRuntimeState } from "./context.js";
import { asset, createArt, createButtonIcon, createElement, createSectionHeading } from "../core.js";
import { hexColor, hexString, luminance, mixColor } from "../color.js";
import { BUILT_IN_THEMES, FEEDBACK_FORM_URL, FEEDBACK_LIST_URL, MUSIC_BAR_WIDTHS, SUPPORT_PAYMENT_URL, defaultState } from "../state.js";
import { MESSAGES } from "../../shared/contracts.js";

function registerActivitySettings1(r) {
r.$renderActivity = function renderActivity() {
      r.$content.append(createSectionHeading("Activity", `${runtimeState.activity.length} entr${runtimeState.activity.length === 1 ? "y" : "ies"}`));
      const latestActivityAt = runtimeState.activity.reduce((latest, item) => {
        const timestamp = new Date(item.createdAt || item.time || 0).getTime();
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, 0);
      const backup = createElement("div", "hub-cart-backup hub-activity-backup");
      backup.append(createElement(
        "div",
        "hub-cart-backup-time",
        latestActivityAt ? `Last updated ${new Date(latestActivityAt).toLocaleString()}` : "Not updated yet"
      ));
      const actions = createElement("div", "hub-toolbar");
      const exportButton = r.$createPlaylistToolbarButton("Download activity", "icon-download-all.svg", r.$exportActivity);
      exportButton.classList.add("hub-activity-download");
      actions.append(exportButton);
      backup.append(actions);
      r.$content.append(backup);
      const list = createElement("div", "hub-activity-list");
      for (const item of runtimeState.activity.slice(0, 20)) {
        const row = createElement("article", "hub-activity-item");
        const artLink = r.$createPageLink("", item.url, "hub-art-link");
        artLink.setAttribute("aria-label", `Open ${item.title}`);
        artLink.append(createArt(item.art, true));
        row.append(artLink);
        const details = createElement("div", "hub-activity-details");
        const copy = createElement("div", "hub-activity-copy");
        copy.append(document.createTextNode(`You ${item.action} `));
        copy.append(r.$createPageLink(item.title, item.url, "hub-inline-link"));
        copy.append(document.createTextNode(" by "));
        copy.append(r.$createPageLink(item.artist, item.artistUrl || item.url, "hub-inline-link"));
        details.append(copy);
        const meta = createElement("div", "hub-activity-meta");
        const time = item.createdAt ? new Date(item.createdAt).toLocaleString() : item.time || "Recorded locally";
        meta.append(createElement("span", `hub-event-chip ${item.action}`, item.action), createElement("span", "hub-meta", time));
        details.append(meta);
        row.append(details);
        list.append(row);
      }
      r.$content.append(list);
      if (!runtimeState.activity.length) r.$content.append(createElement("div", "hub-empty", "Nothing recorded yet. Tracks you play will appear here with a link back to their Bandcamp page."));
    };
}

function createMusicBarAnalysisSetting(r) {
  const row = createElement("div", "hub-settings-row hub-settings-subrow");
  const copy = createElement("div", "hub-settings-copy");
  copy.append(
    createElement("strong", "", "BPM and key in music bar"),
    createElement("span", "", "Show compact analysis badges beside DJ tools.")
  );
  const shown = runtimeState.showMusicBarAnalysis !== false;
  const toggle = createElement("button", `hub-settings-toggle hub-music-bar-analysis-toggle${shown ? " is-active" : ""}`);
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "Show BPM and key in music bar");
  toggle.setAttribute("aria-checked", String(shown));
  toggle.append(createElement("span", "hub-settings-toggle-thumb"));
  toggle.addEventListener("click", () => {
    runtimeState.showMusicBarAnalysis = runtimeState.showMusicBarAnalysis === false;
    runtimeSaveState();
    r.$renderPlayer();
    r.$render();
    r.$showToast(runtimeState.showMusicBarAnalysis ? "Music bar BPM and key shown" : "Music bar BPM and key hidden");
  });
  row.append(copy, toggle);
  return row;
}

function registerPlaybackSettings(r) {
r.$renderPlaybackSettings = function renderPlaybackSettings() {
      const playback = createElement("section", "hub-card hub-settings-card");
      playback.append(createElement("h2", "hub-settings-heading", "Playback"));
      const knobRow = createElement("div", "hub-settings-row");
      const knobCopy = createElement("div", "hub-settings-copy");
      knobCopy.append(
        createElement("strong", "", "Knob gesture"),
        createElement("span", "", "Choose how DJ knobs respond.")
      );
      const knobMode = createElement("select", "hub-settings-select");
      knobMode.setAttribute("aria-label", "Knob gesture");
      for (const [value, label] of [
        ["both", "Up/down + left/right"],
        ["vertical", "Up and down"],
        ["horizontal", "Left and right"],
        ["radial", "Turn around the dial"]
      ]) {
        const option = createElement("option", "", label);
        option.value = value;
        option.selected = runtimeState.dj.knobMode === value;
        knobMode.append(option);
      }
      knobMode.addEventListener("change", () => {
        runtimeState.dj.knobMode = knobMode.value;
        runtimeSaveState();
      });
      knobRow.append(knobCopy, knobMode);
      playback.append(knobRow);

      const scrubberRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const scrubberCopy = createElement("div", "hub-settings-copy");
      scrubberCopy.append(
        createElement("strong", "", "Scrubber style"),
        createElement("span", "", "Use the same timeline in the page player and music bar.")
      );
      const scrubberStyle = createElement("select", "hub-settings-select");
      scrubberStyle.setAttribute("aria-label", "Scrubber style");
      for (const [value, label] of [["traditional", "Traditional scrub head"], ["waveform", "Waveform"]]) {
        const option = createElement("option", "", label);
        option.value = value;
        option.selected = runtimeState.scrubberStyle === value;
        scrubberStyle.append(option);
      }
      scrubberStyle.addEventListener("change", () => {
        runtimeState.scrubberStyle = scrubberStyle.value === "traditional" ? "traditional" : "waveform";
        r.$syncScrubberStyles();
        r.$ensurePagePlayerWaveforms();
        runtimeSaveState();
        r.$showToast(runtimeState.scrubberStyle === "traditional" ? "Traditional scrub heads enabled" : "Waveform scrubbers enabled");
      });
      scrubberRow.append(scrubberCopy, scrubberStyle);
      playback.append(scrubberRow);

      const musicBarRow = createElement("div", "hub-settings-row hub-settings-subrow hub-settings-combined-row");
      const musicBarCopy = createElement("div", "hub-settings-copy");
      musicBarCopy.append(
        createElement("strong", "", "Music bar"),
        createElement("span", "", "Adjust its size and width.")
      );
      const musicBarSize = createElement("select", "hub-settings-select");
      musicBarSize.setAttribute("aria-label", "Music bar size");
      for (const [value, label] of [["compact", "Compact"], ["standard", "Standard"]]) {
        const option = createElement("option", "", label);
        option.value = value;
        option.selected = runtimeState.musicBarSize === value;
        musicBarSize.append(option);
      }
      musicBarSize.addEventListener("change", () => {
        runtimeState.musicBarSize = musicBarSize.value === "compact" ? "compact" : "standard";
        r.$syncMusicBarSize();
        r.$renderPlayer();
        runtimeSaveState();
        r.$showToast(runtimeState.musicBarSize === "compact" ? "Compact music bar enabled" : "Standard music bar enabled");
      });
      const musicBarWidth = createElement("select", "hub-settings-select");
      musicBarWidth.setAttribute("aria-label", "Music bar width");
      for (const [value, label] of [
        ["default", "Default (800 px)"],
        ["tight", "Tight (640 px)"],
        ["wide", "Wide (1120 px)"],
        ["full", "Full width"],
        ["custom", "Custom"]
      ]) {
        const option = createElement("option", "", label);
        option.value = value;
        option.selected = runtimeState.musicBarWidth === value;
        musicBarWidth.append(option);
      }
      const customMusicBarWidth = createElement("input", "hub-settings-number");
      customMusicBarWidth.type = "number";
      customMusicBarWidth.min = "480";
      customMusicBarWidth.max = "2000";
      customMusicBarWidth.step = "10";
      customMusicBarWidth.value = String(runtimeState.musicBarCustomWidth);
      customMusicBarWidth.hidden = runtimeState.musicBarWidth !== "custom";
      customMusicBarWidth.setAttribute("aria-label", "Custom music bar width in pixels");
      const musicBarWidthUnit = createElement("span", "hub-settings-unit", "px");
      musicBarWidthUnit.hidden = customMusicBarWidth.hidden;
      const musicBarWidthControl = createElement("div", "hub-settings-width-control");
      musicBarWidthControl.append(musicBarWidth, customMusicBarWidth, musicBarWidthUnit);
      const syncCustomWidthVisibility = () => {
        const custom = musicBarWidth.value === "custom";
        customMusicBarWidth.hidden = !custom;
        musicBarWidthUnit.hidden = !custom;
      };
      musicBarWidth.addEventListener("change", () => {
        runtimeState.musicBarWidth = MUSIC_BAR_WIDTHS.includes(musicBarWidth.value) ? musicBarWidth.value : "default";
        syncCustomWidthVisibility();
        r.$syncMusicBarWidth();
        r.$renderPlayer();
        runtimeSaveState();
        const label = musicBarWidth.selectedOptions[0]?.textContent || "Default";
        r.$showToast(`${label} music bar width enabled`);
      });
      customMusicBarWidth.addEventListener("input", () => {
        runtimeState.musicBarCustomWidth = customMusicBarWidth.value;
        r.$syncMusicBarWidth();
      });
      customMusicBarWidth.addEventListener("change", () => {
        r.$syncMusicBarWidth();
        customMusicBarWidth.value = String(runtimeState.musicBarCustomWidth);
        runtimeSaveState();
        r.$showToast(`Custom music bar width set to ${runtimeState.musicBarCustomWidth}px`);
      });
      const musicBarControls = createElement("div", "hub-settings-paired-controls");
      const musicBarSizeField = createElement("label", "hub-settings-inline-field");
      musicBarSizeField.append(createElement("span", "", "Size"), musicBarSize);
      const musicBarWidthField = createElement("label", "hub-settings-inline-field");
      musicBarWidthField.append(createElement("span", "", "Width"), musicBarWidthControl);
      musicBarControls.append(musicBarSizeField, musicBarWidthField);
      musicBarRow.append(musicBarCopy, musicBarControls);
      playback.append(musicBarRow, createMusicBarAnalysisSetting(r));

      const playlistMetadataRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const playlistMetadataCopy = createElement("div", "hub-settings-copy");
      playlistMetadataCopy.append(
        createElement("strong", "", "Playlist BPM and key"),
        createElement("span", "", "Save detected analysis and show it on track cards.")
      );
      const recordPlaylistMetadata = runtimeState.recordPlaylistMetadata !== false;
      const playlistMetadataToggle = createElement("button", `hub-settings-toggle hub-playlist-metadata-toggle${recordPlaylistMetadata ? " is-active" : ""}`);
      playlistMetadataToggle.type = "button";
      playlistMetadataToggle.setAttribute("role", "switch");
      playlistMetadataToggle.setAttribute("aria-label", "Save BPM and key on playlists");
      playlistMetadataToggle.setAttribute("aria-checked", String(recordPlaylistMetadata));
      playlistMetadataToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      playlistMetadataToggle.addEventListener("click", () => {
        runtimeState.recordPlaylistMetadata = !(runtimeState.recordPlaylistMetadata !== false);
        runtimeSaveState();
        r.$render();
        r.$showToast(runtimeState.recordPlaylistMetadata ? "Playlist BPM and key enabled" : "Playlist BPM and key disabled");
      });
      playlistMetadataRow.append(playlistMetadataCopy, playlistMetadataToggle);
      playback.append(playlistMetadataRow);

      const autoAnalyzeRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const autoAnalyzeCopy = createElement("div", "hub-settings-copy");
      autoAnalyzeCopy.append(
        createElement("strong", "", "Auto-analyze tracks"),
        createElement("span", "", "Show BPM and musical key beside tracks when an artist page opens.")
      );
      const autoAnalyzeTracks = runtimeState.autoAnalyzeTracks !== false;
      const autoAnalyzeToggle = createElement("button", `hub-settings-toggle hub-auto-analyze-toggle${autoAnalyzeTracks ? " is-active" : ""}`);
      autoAnalyzeToggle.type = "button";
      autoAnalyzeToggle.setAttribute("role", "switch");
      autoAnalyzeToggle.setAttribute("aria-label", "Auto-analyze tracks");
      autoAnalyzeToggle.setAttribute("aria-checked", String(autoAnalyzeTracks));
      autoAnalyzeToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      autoAnalyzeToggle.addEventListener("click", () => {
        runtimeState.autoAnalyzeTracks = runtimeState.autoAnalyzeTracks === false;
        runtimeSaveState();
        r.$injectPageDjToolsLink();
        r.$render();
        r.$showToast(runtimeState.autoAnalyzeTracks ? "Automatic track analysis enabled" : "Manual track analysis enabled");
      });
      autoAnalyzeRow.append(autoAnalyzeCopy, autoAnalyzeToggle);
      playback.append(autoAnalyzeRow);

      const showTrackKeysRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const showTrackKeysCopy = createElement("div", "hub-settings-copy");
      showTrackKeysCopy.append(
        createElement("strong", "", "Show track keys"),
        createElement("span", "", "Include Camelot and musical key columns beside analyzed BPM.")
      );
      const showTrackKeys = runtimeState.showTrackKeys !== false;
      const showTrackKeysToggle = createElement("button", `hub-settings-toggle hub-show-track-keys-toggle${showTrackKeys ? " is-active" : ""}`);
      showTrackKeysToggle.type = "button";
      showTrackKeysToggle.setAttribute("role", "switch");
      showTrackKeysToggle.setAttribute("aria-label", "Show track keys");
      showTrackKeysToggle.setAttribute("aria-checked", String(showTrackKeys));
      showTrackKeysToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      showTrackKeysToggle.addEventListener("click", () => {
        runtimeState.showTrackKeys = runtimeState.showTrackKeys === false;
        r.$syncTrackKeyVisibilityMode();
        r.$syncPageTrackAnalysisUi();
        runtimeSaveState();
        r.$render();
        r.$showToast(runtimeState.showTrackKeys ? "Track keys shown" : "Track keys hidden");
      });
      showTrackKeysRow.append(showTrackKeysCopy, showTrackKeysToggle);
      playback.append(showTrackKeysRow);
      r.$content.append(playback);
    };
}

function registerBrowsingSettings(r) {
r.$renderBrowsingSettings = function renderBrowsingSettings() {
      const browsing = createElement("section", "hub-card hub-settings-card");
      browsing.append(createElement("h2", "hub-settings-heading", "Browsing"));
      const feedRow = createElement("div", "hub-settings-row");
      const feedCopy = createElement("div", "hub-settings-copy");
      feedCopy.append(
        createElement("strong", "", "Open Bandcamp to your feed"),
        createElement("span", "", "Use your music feed as the homepage.")
      );
      const openHomeToFeed = Boolean(runtimeState.openHomeToFeed);
      const feedToggle = createElement("button", `hub-settings-toggle hub-feed-home-toggle${openHomeToFeed ? " is-active" : ""}`);
      feedToggle.type = "button";
      feedToggle.setAttribute("role", "switch");
      feedToggle.setAttribute("aria-label", "Open Bandcamp to your feed");
      feedToggle.setAttribute("aria-checked", String(openHomeToFeed));
      feedToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      feedToggle.addEventListener("click", () => {
        runtimeState.openHomeToFeed = !runtimeState.openHomeToFeed;
        runtimeSaveState();
        r.$render();
      });
      feedRow.append(feedCopy, feedToggle);
      browsing.append(feedRow);
      r.$content.append(browsing);
    };
}

function registerAppearanceSettingsShell(r) {
r.$createAppearanceSettings = function createAppearanceSettings() {
      const appearance = createElement("section", "hub-card hub-settings-card");
      appearance.append(createElement("h2", "hub-settings-heading", "Appearance"));
      const appearanceMode = runtimeState.appearance.applyToPage ? "theme" : "match";
      const appearanceModeRow = createElement("div", "hub-settings-row hub-appearance-mode-row");
      const appearanceModeCopy = createElement("div", "hub-settings-copy");
      appearanceModeCopy.append(
        createElement("strong", "", "Page colours"),
        createElement("span", "", appearanceMode === "theme" ? "Apply a Bandkit theme across Bandcamp." : "Follow each Bandcamp page’s colours.")
      );
      const appearanceModeControl = createElement("div", "hub-settings-segmented");
      appearanceModeControl.setAttribute("role", "radiogroup");
      appearanceModeControl.setAttribute("aria-label", "Page colour mode");
      for (const [mode, label] of [["match", "Match page"], ["theme", "Theme pages"]]) {
        const modeButton = createElement("button", `hub-settings-segment${appearanceMode === mode ? " is-active" : ""}`, label);
        modeButton.type = "button";
        modeButton.setAttribute("role", "radio");
        modeButton.setAttribute("aria-checked", String(appearanceMode === mode));
        modeButton.dataset.appearanceMode = mode;
        modeButton.addEventListener("click", () => {
          runtimeState.appearance.pageAware = mode === "match";
          runtimeState.appearance.applyToPage = mode === "theme";
          r.$applyAppearance();
          runtimeSaveState();
          r.$render();
          r.$showToast(mode === "theme" ? "Bandkit theme applied to Bandcamp" : "Matching Bandcamp page colours");
        });
        appearanceModeControl.append(modeButton);
      }
      appearanceModeRow.append(appearanceModeCopy, appearanceModeControl);
      appearance.append(appearanceModeRow);
      return { appearance, appearanceMode };
    };
}

function registerAppearanceThemePicker(r) {
r.$appendAppearanceThemePicker = function appendAppearanceThemePicker(appearance, appearanceMode) {
      const customContent = runtimeState.appearance.customContentLinked === false
        ? runtimeState.appearance.customCard
        : runtimeState.appearance.customPageSurface;
      const availableThemes = [...BUILT_IN_THEMES, ...(runtimeState.appearance.savedThemes || []), {
        id: "custom",
        label: "Custom",
        accent: runtimeState.appearance.customAccent,
        scrubAccent: runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent,
        surface: runtimeState.appearance.customPanelLinked === false
          ? runtimeState.appearance.customSurface
          : customContent,
        card: customContent,
        background: runtimeState.appearance.customPageBackground,
        pageSurface: runtimeState.appearance.customPageSurface,
        navbar: runtimeState.appearance.customNavbar,
        text: runtimeState.appearance.customText,
        secondaryText: runtimeState.appearance.customSecondaryText
      }].map(({ id, label, accent, scrubAccent, surface, card, background, pageSurface, navbar, text, secondaryText }) => {
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
          id, label, accent, scrubAccent, surface, card, background, pageSurface, navbar, text, secondaryText,
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
      const selectAppearanceTheme = (theme) => {
        runtimeState.appearance.preset = theme.id;
        if (theme.id !== "custom") {
          runtimeState.appearance.customAccent = theme.accent;
          runtimeState.appearance.customScrubAccent = theme.scrubAccent && theme.scrubAccent !== theme.accent ? theme.scrubAccent : null;
          runtimeState.appearance.customSurface = theme.resolvedCard;
          runtimeState.appearance.customPanelLinked = true;
          runtimeState.appearance.customContentLinked = true;
          runtimeState.appearance.customPageBackground = theme.background || theme.surface;
          runtimeState.appearance.customPageSurface = theme.pageSurface || theme.surface;
          runtimeState.appearance.customCard = runtimeState.appearance.customPageSurface;
          runtimeState.appearance.customNavbar = theme.resolvedNavbar;
          runtimeState.appearance.customText = theme.resolvedText;
          runtimeState.appearance.customSecondaryText = theme.resolvedSecondaryText;
        }
        r.$applyAppearance();
        runtimeSaveState();
        r.$render();
      };

      if (appearanceMode === "theme") {
        const selectedTheme = availableThemes.find((theme) => theme.id === runtimeState.appearance.preset) || availableThemes[0];
        const themeField = createElement("div", "hub-theme-picker-field");
        themeField.append(createElement("p", "hub-settings-field-label", "Theme"));
        const themePicker = createElement("div", "hub-theme-picker");
        const listboxId = "hub-theme-picker-options";
        const themeTrigger = createElement("button", "hub-theme-combobox");
        themeTrigger.type = "button";
        themeTrigger.setAttribute("role", "combobox");
        themeTrigger.setAttribute("aria-label", "Theme");
        themeTrigger.setAttribute("aria-controls", listboxId);
        themeTrigger.setAttribute("aria-haspopup", "listbox");
        themeTrigger.setAttribute("aria-expanded", "false");
        themeTrigger.append(
          createThemePalette(selectedTheme),
          createElement("span", "hub-theme-combobox-label", selectedTheme.label),
          createElement("span", "hub-theme-combobox-chevron")
        );
        const themeOptions = createElement("div", "hub-theme-options");
        themeOptions.id = listboxId;
        themeOptions.setAttribute("role", "listbox");
        themeOptions.hidden = true;
        const setThemePickerOpen = (open) => {
          themeOptions.hidden = !open;
          themeTrigger.setAttribute("aria-expanded", String(open));
          themePicker.classList.toggle("is-open", open);
        };
        themeTrigger.addEventListener("click", () => setThemePickerOpen(themeOptions.hidden));
        themePicker.addEventListener("keydown", (event) => {
          if (event.key !== "Escape" || themeOptions.hidden) return;
          event.preventDefault();
          setThemePickerOpen(false);
          themeTrigger.focus();
        });
        themePicker.addEventListener("focusout", () => {
          window.setTimeout(() => {
            if (!themePicker.contains(r.$shadow.activeElement)) setThemePickerOpen(false);
          }, 0);
        });
        for (const theme of availableThemes) {
          const option = createElement("button", `hub-theme-option${theme.id === selectedTheme.id ? " is-selected" : ""}`);
          option.type = "button";
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", String(theme.id === selectedTheme.id));
          option.dataset.themeId = theme.id;
          option.append(
            createThemePalette(theme),
            createElement("span", "hub-theme-option-label", theme.label),
            createElement("span", "hub-theme-option-check", "✓")
          );
          option.addEventListener("click", () => selectAppearanceTheme(theme));
          themeOptions.append(option);
        }
        themePicker.append(themeTrigger, themeOptions);
        themeField.append(themePicker);
        appearance.append(themeField);

        const themeSharing = createElement("div", "hub-theme-sharing-row");
        const downloadTheme = createElement("button", "hub-settings-action hub-theme-sharing-action", "Download selected");
        downloadTheme.type = "button";
        downloadTheme.prepend(createButtonIcon("icon-download-all.svg"));
        downloadTheme.addEventListener("click", r.$exportAppearanceTheme);
        const importThemeInput = document.createElement("input");
        importThemeInput.type = "file";
        importThemeInput.accept = ".json,application/json";
        importThemeInput.hidden = true;
        const importTheme = createElement("button", "hub-settings-action hub-theme-sharing-action", "Import theme");
        importTheme.type = "button";
        importTheme.prepend(createButtonIcon("icon-import.svg"));
        importTheme.addEventListener("click", () => importThemeInput.click());
        importThemeInput.addEventListener("change", () => {
          const file = importThemeInput.files?.[0];
          importThemeInput.value = "";
          void r.$importAppearanceTheme(file, importTheme);
        });
        themeSharing.append(downloadTheme, importTheme, importThemeInput);
        appearance.append(themeSharing);
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
        const customPanel = createElement("div", "hub-custom-theme-panel");
        const customColours = createElement("div", "hub-custom-colours");
        let contentInput = null;
        let panelInput = null;
        for (const [key, label] of [
          ["customAccent", "Accent"],
          ["customPageBackground", "Page background"],
          ["customPageSurface", "Page content"],
          ["customCard", "Bandkit content"],
          ["customSurface", "Bandkit panel"],
          ["customNavbar", "Artist navigation"],
          ["customText", "Primary text"],
          ["customSecondaryText", "Secondary text"]
        ]) {
          const field = createElement("label", "hub-colour-field");
          const input = createElement("input");
          input.type = "color";
          const contentLinked = key === "customCard" && runtimeState.appearance.customContentLinked !== false;
          const panelLinked = key === "customSurface" && runtimeState.appearance.customPanelLinked !== false;
          const resolvedContent = runtimeState.appearance.customContentLinked === false
            ? runtimeState.appearance.customCard
            : runtimeState.appearance.customPageSurface;
          input.value = contentLinked
            ? runtimeState.appearance.customPageSurface
            : panelLinked ? resolvedContent : runtimeState.appearance[key];
          input.dataset.themeColour = key;
          input.setAttribute("aria-label", `${label} colour`);
          r.$containThemeColourPointer(input);
          let colourLink = null;
          if (key === "customCard") {
            contentInput = input;
            colourLink = createElement("button", "hub-colour-link", "Use page");
            colourLink.type = "button";
            colourLink.disabled = contentLinked;
            colourLink.title = contentLinked
              ? "Bandkit content is following the Page content colour"
              : "Reset Bandkit content to follow the Page content colour";
            colourLink.addEventListener("click", () => {
              Object.assign(runtimeState.appearance, {
                customContentLinked: true, customCard: runtimeState.appearance.customPageSurface
              });
              if (runtimeState.appearance.customPanelLinked !== false) {
                runtimeState.appearance.customSurface = runtimeState.appearance.customCard;
              }
              r.$applyAppearance();
              runtimeSaveState();
              r.$render();
            });
          } else if (key === "customSurface") {
            panelInput = input;
            colourLink = createElement("button", "hub-colour-link", "Use content");
            colourLink.type = "button";
            colourLink.disabled = panelLinked;
            colourLink.title = panelLinked
              ? "Bandkit panel is following the Bandkit content colour"
              : "Reset Bandkit panel to follow the Bandkit content colour";
            colourLink.addEventListener("click", () => {
              Object.assign(runtimeState.appearance, {
                customPanelLinked: true,
                customSurface: runtimeState.appearance.customContentLinked === false
                  ? runtimeState.appearance.customCard : runtimeState.appearance.customPageSurface
              });
              r.$applyAppearance();
              runtimeSaveState();
              r.$render();
            });
          }
          input.addEventListener("input", () => {
            if (key === "customCard") {
              runtimeState.appearance.customContentLinked = false;
              colourLink.disabled = false;
              colourLink.title = "Reset Bandkit content to follow the Page content colour";
            } else if (key === "customSurface") {
              runtimeState.appearance.customPanelLinked = false;
              colourLink.disabled = false;
              colourLink.title = "Reset Bandkit panel to follow the Bandkit content colour";
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
            r.$scheduleCustomThemePreview();
          });
          input.addEventListener("change", r.$commitCustomThemeColour);
          const control = colourLink ? createElement("div", "hub-colour-controls") : null;
          if (control) control.append(colourLink, input);
          if (["customCard", "customSurface"].includes(key)) field.classList.add("is-linked-colour");
          field.append(createElement("span", "", label), control || input);
          customColours.append(field);
        }
        const scrubField = createElement("div", "hub-colour-field");
        const scrubControls = createElement("div", "hub-colour-controls");
        const matchAccent = createElement("button", "hub-colour-link", "Use accent");
        matchAccent.type = "button";
        matchAccent.disabled = !runtimeState.appearance.customScrubAccent;
        matchAccent.title = runtimeState.appearance.customScrubAccent ? "Reset track scrub to follow the accent colour" : "Track scrub is following the accent colour";
        const scrubInput = createElement("input");
        scrubInput.type = "color";
        scrubInput.value = runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent;
        scrubInput.dataset.themeColour = "customScrubAccent";
        scrubInput.setAttribute("aria-label", "Track scrub colour");
        r.$containThemeColourPointer(scrubInput);
        scrubInput.addEventListener("input", () => {
          runtimeState.appearance.customScrubAccent = scrubInput.value;
          matchAccent.disabled = false;
          matchAccent.title = "Reset track scrub to follow the accent colour";
          r.$scheduleCustomThemePreview();
        });
        scrubInput.addEventListener("change", r.$commitCustomThemeColour);
        matchAccent.addEventListener("click", () => {
          runtimeState.appearance.customScrubAccent = null;
          r.$applyAppearance();
          runtimeSaveState();
          r.$render();
        });
        scrubControls.append(matchAccent, scrubInput);
        scrubField.append(createElement("span", "", "Track scrub"), scrubControls);
        customColours.append(scrubField);
        const saveRow = createElement("div", "hub-save-theme-row");
        const themeName = createElement("input", "hub-theme-name");
        themeName.type = "text";
        themeName.maxLength = 28;
        themeName.placeholder = "Theme name";
        themeName.setAttribute("aria-label", "Theme name");
        const saveTheme = createElement("button", "hub-settings-action hub-save-theme", "Save theme");
        saveTheme.type = "button";
        saveTheme.addEventListener("click", () => {
          if (!r.$hasSavedThemeCapacity()) return;
          const number = (runtimeState.appearance.savedThemes || []).length + 1;
          const label = themeName.value.trim() || `Custom ${number}`;
          const savedTheme = {
            id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: label.slice(0, 28),
            accent: runtimeState.appearance.customAccent,
            scrubAccent: runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent,
            surface: runtimeState.appearance.customPanelLinked === false
              ? runtimeState.appearance.customSurface
              : runtimeState.appearance.customContentLinked === false
                ? runtimeState.appearance.customCard
                : runtimeState.appearance.customPageSurface,
            card: runtimeState.appearance.customContentLinked === false
              ? runtimeState.appearance.customCard
              : runtimeState.appearance.customPageSurface,
            background: runtimeState.appearance.customPageBackground,
            pageSurface: runtimeState.appearance.customPageSurface,
            navbar: runtimeState.appearance.customNavbar,
            text: runtimeState.appearance.customText,
            secondaryText: runtimeState.appearance.customSecondaryText
          };
          runtimeState.appearance.savedThemes = [...(runtimeState.appearance.savedThemes || []), savedTheme];
          runtimeState.appearance.preset = savedTheme.id;
          runtimeSaveState();
          r.$render();
          r.$showToast(`Saved theme “${savedTheme.label}”`);
        });
        saveRow.append(themeName, saveTheme);
        customPanel.append(customColours, saveRow);
        appearance.append(customPanel);
      }
    };
}

function registerSavedThemeSettings(r) {
r.$appendSavedThemeSettings = function appendSavedThemeSettings(appearance, appearanceMode) {
      if (appearanceMode !== "theme") return;
      const savedTheme = (runtimeState.appearance.savedThemes || []).find((theme) => theme.id === runtimeState.appearance.preset);
      if (!savedTheme) return;
      const actions = createElement("div", "hub-theme-management-row");
      const renameTheme = createElement("button", "hub-settings-action hub-theme-management-action", "Rename saved");
      renameTheme.type = "button";
      renameTheme.addEventListener("click", () => {
        const label = window.prompt("Rename this saved theme", savedTheme.label)?.trim();
        if (!label) return;
        const nextLabel = label.slice(0, 28);
        runtimeState.appearance.savedThemes = runtimeState.appearance.savedThemes.map((theme) => (
          theme.id === savedTheme.id ? { ...theme, label: nextLabel } : theme
        ));
        runtimeSaveState();
        r.$render();
        r.$showToast(`Renamed theme to “${nextLabel}”`);
      });
      const deleteTheme = createElement("button", "hub-settings-action hub-theme-management-action is-danger", "Delete saved");
      deleteTheme.type = "button";
      deleteTheme.addEventListener("click", () => {
        if (!window.confirm(`Delete the saved theme “${savedTheme.label}”?`)) return;
        runtimeState.appearance.savedThemes = runtimeState.appearance.savedThemes.filter((theme) => theme.id !== savedTheme.id);
        runtimeState.appearance.preset = "custom";
        runtimeSaveState();
        r.$render();
        r.$showToast(`Deleted theme “${savedTheme.label}”`);
      });
      actions.append(renameTheme, deleteTheme);
      appearance.append(actions);
    };
}

function registerAppearanceToggles(r) {
r.$appendAppearanceToggles = function appendAppearanceToggles(appearance) {
      const modernReleaseRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const modernReleaseCopy = createElement("div", "hub-settings-copy");
      modernReleaseCopy.append(
        createElement("strong", "", "Modern Bandcamp pages"),
        createElement("span", "", "Refresh legacy feeds and artist pages.")
      );
      const modernReleasePages = Boolean(runtimeState.appearance.modernReleasePages);
      const modernReleaseToggle = createElement("button", `hub-settings-toggle hub-modern-release-toggle${modernReleasePages ? " is-active" : ""}`);
      modernReleaseToggle.type = "button";
      modernReleaseToggle.setAttribute("role", "switch");
      modernReleaseToggle.setAttribute("aria-label", "Use modern Bandcamp pages");
      modernReleaseToggle.setAttribute("aria-checked", String(modernReleasePages));
      modernReleaseToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      modernReleaseToggle.addEventListener("click", () => {
        runtimeState.appearance.modernReleasePages = !modernReleasePages;
        r.$applyAppearance();
        r.$injectPlaylistButtons({ incremental: false });
        runtimeSaveState();
        r.$render();
        r.$showToast(runtimeState.appearance.modernReleasePages ? "Modern Bandcamp pages enabled" : "Classic Bandcamp pages restored");
      });
      modernReleaseRow.append(modernReleaseCopy, modernReleaseToggle);
      appearance.append(modernReleaseRow);

      const pageActionLabelsRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const pageActionLabelsCopy = createElement("div", "hub-settings-copy");
      pageActionLabelsCopy.append(
        createElement("strong", "", "Page icon labels"),
        createElement("span", "", "Show text beside Bandkit-enhanced page actions.")
      );
      const pageActionLabels = Boolean(runtimeState.pageActionLabels);
      const pageActionLabelsToggle = createElement("button", `hub-settings-toggle hub-page-action-labels-toggle${pageActionLabels ? " is-active" : ""}`);
      pageActionLabelsToggle.type = "button";
      pageActionLabelsToggle.setAttribute("role", "switch");
      pageActionLabelsToggle.setAttribute("aria-label", "Show page icon labels");
      pageActionLabelsToggle.setAttribute("aria-checked", String(pageActionLabels));
      pageActionLabelsToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      pageActionLabelsToggle.addEventListener("click", () => {
        runtimeState.pageActionLabels = !runtimeState.pageActionLabels;
        r.$syncPageActionLabelMode();
        runtimeSaveState();
        r.$pageActionsDirty = true;
        r.$injectPageDjToolsLink();
        r.$injectPlaylistButtons();
        r.$render();
        r.$showToast(runtimeState.pageActionLabels ? "Page icon labels enabled" : "Compact page icons enabled");
      });
      pageActionLabelsRow.append(pageActionLabelsCopy, pageActionLabelsToggle);
      appearance.append(pageActionLabelsRow);

      const hideCartRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const hideCartCopy = createElement("div", "hub-settings-copy");
      hideCartCopy.append(
        createElement("strong", "", "Hide shopping cart"),
        createElement("span", "", "Use Bandkit’s Cart panel instead of Bandcamp’s carts.")
      );
      const hideShoppingCart = Boolean(runtimeState.appearance.hidePageCart || runtimeState.appearance.hideHeaderCart);
      const hideCartToggle = createElement("button", `hub-settings-toggle hub-hide-cart-toggle${hideShoppingCart ? " is-active" : ""}`);
      hideCartToggle.type = "button";
      hideCartToggle.setAttribute("role", "switch");
      hideCartToggle.setAttribute("aria-label", "Hide shopping cart");
      hideCartToggle.setAttribute("aria-checked", String(hideShoppingCart));
      hideCartToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      hideCartToggle.addEventListener("click", () => {
        const enabled = !hideShoppingCart;
        runtimeState.appearance.hidePageCart = enabled;
        runtimeState.appearance.hideHeaderCart = enabled;
        r.$applyNativeCartVisibility();
        runtimeSaveState();
        r.$render();
      });
      hideCartRow.append(hideCartCopy, hideCartToggle);
      appearance.append(hideCartRow);

      const nativePlayerRow = createElement("div", "hub-settings-row hub-settings-subrow");
      const nativePlayerCopy = createElement("div", "hub-settings-copy");
      nativePlayerCopy.append(
        createElement("strong", "", "Hide Bandcamp music player"),
        createElement("span", "", "Use only Bandkit’s music player.")
      );
      const hideBandcampPlayer = Boolean(runtimeState.appearance.hideBandcampPlayer);
      const nativePlayerToggle = createElement("button", `hub-settings-toggle${hideBandcampPlayer ? " is-active" : ""}`);
      nativePlayerToggle.type = "button";
      nativePlayerToggle.setAttribute("role", "switch");
      nativePlayerToggle.setAttribute("aria-label", "Hide Bandcamp music player");
      nativePlayerToggle.setAttribute("aria-checked", String(hideBandcampPlayer));
      nativePlayerToggle.append(createElement("span", "hub-settings-toggle-thumb"));
      nativePlayerToggle.addEventListener("click", () => {
        runtimeState.appearance.hideBandcampPlayer = !runtimeState.appearance.hideBandcampPlayer;
        r.$applyNativePlayerVisibility();
        runtimeSaveState();
        r.$render();
      });
      nativePlayerRow.append(nativePlayerCopy, nativePlayerToggle);
      appearance.append(nativePlayerRow);
    };
}

function registerAppearanceSettingsFinish(r) {
r.$finishAppearanceSettings = function finishAppearanceSettings(appearance) {
      if (!runtimeState.appearance.pageAware) {
        const accessibleTheme = r.$accessibleAppearanceTheme();
        const accessibility = createElement("div", `hub-theme-accessibility${accessibleTheme.adjusted ? " is-adjusted" : ""}`);
        accessibility.append(
          createElement("strong", "", accessibleTheme.adjusted ? "Contrast adjusted automatically" : "Accessible contrast"),
          createElement("span", "", `Text ${accessibleTheme.textContrast.toFixed(1)}:1 · controls ${accessibleTheme.accentContrast.toFixed(1)}:1`)
        );
        appearance.append(accessibility);
      }
      r.$content.append(appearance);
    };
}

function registerSettingsInfoCards(r) {
r.$renderSettingsInfoCards = function renderSettingsInfoCards() {
      const feedback = createElement("section", "hub-card hub-settings-card");
      feedback.append(createElement("h2", "hub-settings-heading", "Feedback"));
      const feedbackCopy = createElement("div", "hub-settings-copy");
      feedbackCopy.append(
        createElement("strong", "", "Help improve Bandkit"),
        createElement("span", "", "Report a bug or suggest a feature. Submissions and attachments are public.")
      );
      const feedbackActions = createElement("div", "hub-settings-feedback-actions");
      const sendFeedback = createElement("a", "hub-settings-action", "Send feedback");
      sendFeedback.href = FEEDBACK_FORM_URL;
      sendFeedback.target = "_blank";
      sendFeedback.rel = "noopener noreferrer";
      const viewFeedback = createElement("a", "hub-settings-action", "View feedback");
      viewFeedback.href = FEEDBACK_LIST_URL;
      viewFeedback.target = "_blank";
      viewFeedback.rel = "noopener noreferrer";
      feedbackActions.append(sendFeedback, viewFeedback);
      feedback.append(feedbackCopy, feedbackActions);
      r.$content.append(feedback);

      const privacy = createElement("section", "hub-card hub-settings-card");
      privacy.append(createElement("h2", "hub-settings-heading", "Privacy and data"));
      const backupRow = createElement("div", "hub-settings-row hub-backup-row");
      const backupCopy = createElement("div", "hub-settings-copy");
      const lastBackupDate = runtimeState.lastBackupAt ? new Date(runtimeState.lastBackupAt) : null;
      const validLastBackupDate = lastBackupDate && !Number.isNaN(lastBackupDate.getTime());
      const backupStatus = validLastBackupDate
        ? `Saved in Chrome · last file backup ${lastBackupDate.toLocaleString()}`
        : "Saved in Chrome · no file backup yet";
      backupCopy.append(
        createElement("strong", "", "Backup"),
        createElement("span", "hub-backup-location", backupStatus)
      );
      const backupActions = createElement("div", "hub-settings-feedback-actions hub-backup-actions");
      const saveBackup = createElement("button", "hub-settings-action hub-backup-action", "Save");
      saveBackup.setAttribute("aria-label", "Save backup");
      saveBackup.type = "button";
      saveBackup.addEventListener("click", () => r.$runBackupAction(saveBackup, r.$savePortableBackup));
      const restoreBackup = createElement("button", "hub-settings-action hub-backup-action", "Restore");
      restoreBackup.setAttribute("aria-label", "Restore backup");
      restoreBackup.type = "button";
      restoreBackup.addEventListener("click", () => r.$runBackupAction(restoreBackup, r.$restorePortableBackup));
      backupActions.append(saveBackup, restoreBackup);
      backupRow.append(backupCopy, backupActions);

      const reminderRow = createElement("div", "hub-settings-row hub-backup-frequency-row");
      const reminderCopy = createElement("div", "hub-settings-copy");
      reminderCopy.append(
        createElement("strong", "", "Backup reminder"),
        createElement("span", "", "Choose how often Bandkit reminds you to save a fresh file.")
      );
      const reminderFrequency = createElement("select", "hub-settings-select hub-backup-frequency");
      for (const [value, label] of [["7", "Every week"], ["14", "Every 2 weeks"], ["30", "Every month"], ["0", "Off"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = r.$backupReminderDays() === Number(value);
        reminderFrequency.append(option);
      }
      reminderFrequency.addEventListener("change", () => {
        runtimeState.backupReminderDays = Number(reminderFrequency.value);
        if (runtimeState.backupIntroSeen !== true) runtimeState.backupIntroSeen = true;
        runtimeState.backupReminderSnoozedAt = new Date().toISOString();
        r.$saveState();
        r.$render();
        r.$showToast(Number(reminderFrequency.value) ? `Backup reminders set to ${reminderFrequency.selectedOptions[0].textContent.toLowerCase()}` : "Backup reminders turned off");
      });
      reminderRow.append(reminderCopy, reminderFrequency);
      const deleteData = createElement("button", "hub-settings-action hub-settings-danger", "Delete all Bandkit data");
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
      privacy.append(
        backupRow,
        reminderRow,
        deleteData
      );
      r.$content.append(privacy);

      const about = createElement("section", "hub-card hub-settings-card");
      about.append(createElement("h2", "hub-settings-heading", "About"));
      const aboutRow = createElement("div", "hub-settings-row hub-about-brand");
      const aboutIcon = document.createElement("img");
      aboutIcon.className = "hub-about-brand-icon";
      aboutIcon.src = asset("icon-bandkit.svg");
      aboutIcon.alt = "";
      const aboutCopy = createElement("div", "hub-settings-copy");
      aboutCopy.append(
        createElement("strong", "", "Bandkit"),
        createElement("span", "hub-settings-version", `Release v${chrome.runtime.getManifest().version}`)
      );
      aboutRow.append(aboutIcon, aboutCopy);
      about.append(createElement("p", "hub-settings-note", "Shortcut: Alt+Shift+B toggles the panel."), aboutRow);
      r.$content.append(about);

      const support = createElement("section", "hub-card hub-settings-card hub-support-card");
      support.append(createElement("h2", "hub-settings-heading", "Support"));
      const supportCopy = createElement("div", "hub-settings-copy hub-support-copy");
      supportCopy.append(
        createElement("strong", "", "Enjoying Bandkit?"),
        createElement("span", "", "Support continued development with a one-off tip. Payment is handled securely by Stripe.")
      );
      const supportLink = createElement("a", "hub-settings-action hub-support-action", "Support Bandkit");
      supportLink.href = SUPPORT_PAYMENT_URL;
      supportLink.target = "_blank";
      supportLink.rel = "noopener noreferrer";
      support.append(supportCopy, supportLink);
      r.$content.append(support);
    };
}

function registerActivitySettings2(r) {
r.$renderSettings = function renderSettings() {
      r.$content.append(createSectionHeading("Settings"));
      r.$renderPlaybackSettings();
      r.$renderBrowsingSettings();
      const { appearance, appearanceMode } = r.$createAppearanceSettings();
      r.$appendAppearanceThemePicker(appearance, appearanceMode);
      r.$appendSavedThemeSettings(appearance, appearanceMode);
      r.$appendCustomThemeSettings(appearance, appearanceMode);
      r.$appendAppearanceToggles(appearance);
      r.$finishAppearanceSettings(appearance);
      r.$renderSettingsInfoCards();
    };
}

export const registerActivitySettings = [registerPlaybackSettings, registerBrowsingSettings, registerAppearanceSettingsShell, registerAppearanceThemePicker, registerSavedThemeSettings, registerCustomThemePreview, registerCustomThemeSettings, registerAppearanceToggles, registerAppearanceSettingsFinish, registerSettingsInfoCards, registerActivitySettings1, registerActivitySettings2];

export const setupActivitySettings = [];
