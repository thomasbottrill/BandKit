import { createButtonIcon, createElement } from "../core.js";
import { createPlayerSettingLabel, createSettingsAction, createSettingsActionRow, createSettingsActions, createSettingsRow, createSettingsRowCopy } from "../components/settings.js";
import { createSettingsDisclosure, resetSettingsDisclosures } from "../settings-drawer.js";
import { createSettingsPicker } from "../settings-picker.js";
import { createCornerStylePreview, createPlayerDesignPreview, createSurfacePreview, createThemeSourcePreview, createVisualizerStylePreview } from "../settings-option-previews.js";
import { createTimelinePreview, TIMELINE_STYLES } from "../timeline-styles.js";
import { BUILT_IN_THEMES } from "../state.js";
import { createHandlePreview, HANDLE_LABELS } from "../scrub-handle-picker.js";
import { applyVisualTheme, captureVisualTheme, DEFAULT_VISUAL_THEME, MAX_VISUAL_THEMES, savedVisualThemes, VISUAL_APPEARANCE_KEYS, VISUAL_SETTING_KEYS, VISUAL_THEMES, visualThemeMatches } from "../visual-themes.js";
import { MAX_VISUAL_THEME_FILE_SIZE, parseVisualThemeDocument, portableVisualThemeDocument } from "../visual-theme-sharing.js";
import { createNamedSaveAction } from "./custom-theme-settings.js";
import { runtimeSaveState, runtimeState } from "./context.js";
import { createDynamicThemeInfo } from "../theme-option-markers.js";

const titleCase = value => String(value).replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const playerNames = { docked: "Dock", zune: "Fade", rounded: "Float" };
const rowTooltips = Object.freeze({
  Colours: "Choose the palette used across Bandcamp pages and Bandkit.",
  Player: "Choose the music bar layout.",
  Surface: "Choose a solid, glass, or paper surface.",
  Corners: "Choose the corner treatment used throughout Bandkit.",
  Timeline: "Choose the timeline artwork used by the page player and music bar.",
  Handle: "Choose the handle shape used by timeline and settings controls.",
  Visualiser: "Choose the visual effect shown behind the music bar.",
  Size: "Choose the music bar density.",
  "Playback buttons": "Customize the previous, play, next, and queue button artwork."
});
const visualizerOptions = [
  ["off", "Off"], ["glow", "Ambient"], ["spectrum", "Spectrum"], ["grass", "Grass"],
  ["embers", "Embers"], ["contours", "Contours"], ["firefly", "Firefly"], ["pixels", "Pixels"],
  ["scanlines", "Scanlines"], ["cross-stitch", "Cross-stitch"], ["weave", "Weave"], ["rain", "Rain"],
  ["constellation", "Constellation"], ["terrain", "Terrain"], ["matrix", "Matrix"], ["fog", "Fog"],
  ["warp", "Warp"], ["dna", "DNA"], ["glitch", "Glitch"]
].map(([value, label]) => ({ value, label }));

function syncVisualTheme(r) {
  r.$spectrumColourCache = null;
  r.$applyAppearance();
  r.$syncScrubberStyles(); r.$syncMusicBarStyle(); r.$syncMusicBarPanelButtons();
  r.$syncMusicBarSize(); r.$syncMusicBarVisualizer(); r.$syncMusicBarWidth();
  r.$syncFrostedGlass(); r.$syncCornerStyle(); r.$refreshScrubWaveform(true); r.$renderPlayer();
}

function palettePreview(theme) {
  const palette = createElement("span", "hub-theme-option-palette");
  palette.setAttribute("aria-hidden", "true");
  const colours = theme.appearance || theme;
  for (const key of ["customAccent", "customPageBackground", "customPageSurface", "customText"]) {
    const swatch = createElement("span", "hub-theme-option-swatch");
    swatch.style.backgroundColor = colours[key]; palette.append(swatch);
  }
  return palette;
}

function themePreview(theme, context) {
  if (theme.id === "current") return createButtonIcon("icon-settings.svg");
  if (context === "trigger") return createPlayerDesignPreview(theme.settings.musicBarStyle);
  const preview = createElement("span", "hub-visual-theme-preview");
  preview.style.color = theme.appearance.customAccent;
  preview.append(createPlayerDesignPreview(theme.settings.musicBarStyle), palettePreview(theme));
  preview.setAttribute("aria-hidden", "true");
  return preview;
}

function saveTheme(r, active, name) {
  const themes = savedVisualThemes(runtimeState.appearance);
  const label = (name || `My theme ${themes.length + 1}`).slice(0, 28);
  const replacing = themes.find(theme => theme.id === active?.id && theme.label === label);
  if (!replacing && themes.length >= MAX_VISUAL_THEMES) {
    r.$showToast(`You can save ${MAX_VISUAL_THEMES} themes. Delete one to make room.`); return false;
  }
  const theme = { ...captureVisualTheme(runtimeState), id: replacing?.id || `visual-${crypto.randomUUID()}`, label };
  runtimeState.appearance.visualThemes = replacing
    ? themes.map(item => item.id === theme.id ? theme : item) : [...themes, theme];
  runtimeState.appearance.visualThemeId = theme.id;
  runtimeSaveState(); r.$render(); r.$showToast(`Saved theme “${label}”`);
  return true;
}

function downloadVisualTheme(r, active) {
  const unchanged = active && visualThemeMatches(runtimeState, active);
  const label = unchanged ? active.label : "Custom";
  const payload = portableVisualThemeDocument(captureVisualTheme(runtimeState), label);
  const blobUrl = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "custom";
  link.href = blobUrl; link.download = `bandkit-theme-${slug}.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  r.$showToast(`Downloaded theme “${label}”`);
}

async function importVisualTheme(r, file, button) {
  if (!file) return;
  button.disabled = true;
  try {
    const themes = savedVisualThemes(runtimeState.appearance);
    if (themes.length >= MAX_VISUAL_THEMES) throw new Error(`You can save ${MAX_VISUAL_THEMES} themes. Delete one to make room.`);
    if (file.size > MAX_VISUAL_THEME_FILE_SIZE) throw new Error("Theme files must be smaller than 10 MB.");
    const imported = parseVisualThemeDocument(await file.text());
    const theme = { ...imported, id: `visual-${crypto.randomUUID()}` };
    runtimeState.appearance.visualThemes = [...themes, theme];
    applyVisualTheme(runtimeState, theme); runtimeState.appearance.visualThemeId = theme.id;
    syncVisualTheme(r); runtimeSaveState(); r.$render(); r.$showToast(`Imported and saved theme “${theme.label}”`);
  } catch (error) {
    r.$showToast(error?.message || "The theme could not be imported.");
  } finally { button.disabled = false; }
}

function appendThemeActions(r, content, active) {
  const saved = savedVisualThemes(runtimeState.appearance).some(theme => theme.id === active?.id);
  const actions = createElement("div", "hub-toolbar hub-theme-back-actions");
  actions.dataset.settingsBackActions = "true";
  actions.append(createNamedSaveAction({ noun: "theme", name: saved ? active.label : "", onSave: name => saveTheme(r, active, name) }));
  const download = createElement("button", "hub-playlist-toolbar-icon hub-theme-sharing-action");
  download.type = "button"; download.dataset.settingsTooltip = "Download the current Bandkit theme as a file.";
  download.setAttribute("aria-label", "Download theme"); download.append(createButtonIcon("icon-download-all.svg"));
  download.addEventListener("click", () => downloadVisualTheme(r, active));
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
  const importButton = createElement("button", "hub-playlist-toolbar-icon hub-theme-sharing-action");
  importButton.type = "button"; importButton.dataset.settingsTooltip = "Import a Bandkit theme from a saved file.";
  importButton.setAttribute("aria-label", "Import theme"); importButton.append(createButtonIcon("icon-import.svg"));
  importButton.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0]; input.value = ""; void importVisualTheme(r, file, importButton);
  });
  actions.append(download, importButton, input);
  if (active && !visualThemeMatches(runtimeState, active)) {
    const reset = createSettingsAction("Reset to theme", { ariaLabel: "Reset visual changes to this theme" });
    reset.addEventListener("click", () => {
      applyVisualTheme(runtimeState, active); syncVisualTheme(r); runtimeSaveState(); r.$render();
    });
    content.append(reset);
  }
  content.append(actions);
}

// Saved themes get the same management row as saved palettes: it only appears
// while a saved theme is the active one, so the section stays quiet otherwise.
function appendSavedThemeManagement(r, content) {
  const appearance = runtimeState.appearance;
  const saved = savedVisualThemes(appearance).find(theme => theme.id === appearance.visualThemeId);
  if (!saved) return;
  const actions = createSettingsActions();
  const rename = createSettingsAction("Rename", { className: "hub-theme-management-action", ariaLabel: "Rename saved theme" });
  rename.addEventListener("click", () => {
    const label = window.prompt("Rename this saved theme", saved.label)?.trim();
    if (!label) return;
    const nextLabel = label.slice(0, 28);
    appearance.visualThemes = savedVisualThemes(appearance)
      .map(theme => theme.id === saved.id ? { ...theme, label: nextLabel } : theme);
    runtimeSaveState(); r.$render(); r.$showToast(`Renamed theme to “${nextLabel}”`);
  });
  const remove = createSettingsAction("Delete", { className: "hub-theme-management-action is-danger", ariaLabel: "Delete saved theme" });
  remove.addEventListener("click", () => {
    if (!window.confirm(`Delete the saved theme “${saved.label}”? Your current appearance will stay as it is.`)) return;
    appearance.visualThemes = savedVisualThemes(appearance).filter(theme => theme.id !== saved.id);
    appearance.visualThemeId = "dynamic";
    runtimeSaveState(); r.$render(); r.$showToast(`Deleted theme “${saved.label}”`);
  });
  actions.append(rename, remove);
  content.append(createSettingsActionRow({
    label: "Saved theme", description: "Rename or delete this saved theme.",
    actions, className: "hub-theme-management-row"
  }));
}

function openThemeEditor(r, section) {
  resetSettingsDisclosures();
  runtimeState.settingsSubView = `theme-${section}`;
  runtimeSaveState(); r.$saveLayoutState?.(); r.$render();
}

function themeRowCopy(r, label, destination) {
  const copy = createElement("div", "hub-settings-copy hub-settings-control-copy hub-visual-theme-row-copy");
  const heading = createElement("span", "hub-visual-theme-row-heading");
  heading.append(createPlayerSettingLabel(label, rowTooltips[label], { tag: "strong", className: "hub-settings-control-label" }));
  const link = createElement("button", "hub-visual-theme-editor-link");
  link.type = "button";
  link.setAttribute("aria-label", `Open full ${label.toLowerCase()} settings`);
  link.dataset.settingsTooltip = `Open full ${label.toLowerCase()} settings`;
  link.append(createButtonIcon("icon-open.svg"));
  link.addEventListener("click", () => openThemeEditor(r, destination));
  heading.append(link); copy.append(heading);
  return copy;
}

function commitVisualEdit(r, message) {
  syncVisualTheme(r); runtimeSaveState(); r.$render();
  if (message) r.$showToast(message);
}

function paletteValues(palette) {
  return {
    customAccent: palette.accent,
    customScrubAccent: palette.scrubAccent || palette.accent,
    customVisualizerColor1: palette.visualizerColors?.[0] || null,
    customVisualizerColor2: palette.visualizerColors?.[1] || null,
    customVisualizerColor3: palette.visualizerColors?.[2] || null,
    customSurface: palette.card || palette.surface,
    customPanelLinked: false,
    customCard: palette.card || palette.surface,
    customContentLinked: false,
    customPageBackground: palette.background || palette.surface,
    customPageSurface: palette.pageSurface || palette.surface,
    customNavbar: palette.navbar || palette.surface,
    customText: palette.text,
    customSecondaryText: palette.secondaryText
  };
}

function appendBasicThemeRow(content, r, { label, destination, picker }) {
  content.append(createSettingsRow({
    className: "hub-visual-theme-basic-row",
    copy: themeRowCopy(r, label, destination),
    control: picker.element
  }));
}

function createThemeOptionPreview(r, applyValue) {
  let snapshot = null;
  return {
    preview(value) {
      if (value == null) {
        if (!snapshot) return;
        applyVisualTheme(runtimeState, snapshot);
        snapshot = null;
        r.$releasePanelPositionHold?.();
        syncVisualTheme(r);
        return;
      }
      snapshot ??= captureVisualTheme(runtimeState);
      // Options like Player and Size reflow the music bar, which would drag the
      // open panel with it. Pin the panel for the preview and release it after.
      r.$holdPanelPosition?.();
      applyValue(value);
      syncVisualTheme(r);
    },
    commit(value, message) {
      snapshot = null;
      applyValue(value);
      commitVisualEdit(r, message);
      r.$releasePanelPositionHold?.();
    }
  };
}

function appendThemeBreakdown(r, content) {
  const state = runtimeState, appearance = state.appearance;
  const surface = appearance.paperTexture ? "paper" : appearance.frostedGlass ? "glass" : "solid";
  const visualizer = state.musicBarVisualizer === "off" ? "off" : state.musicBarVisualizerType;
  const palettes = [...BUILT_IN_THEMES, ...(appearance.savedThemes || [])];
  const paletteOptions = [{ value: "dynamic", label: "Dynamic" }, { value: "custom", label: "Custom" },
    ...palettes.map(palette => ({ value: palette.id, label: palette.label }))];
  const colourValue = appearance.pageAware ? "dynamic"
    : paletteOptions.some(option => option.value === appearance.preset) ? appearance.preset : "custom";
  const applyColour = (value) => {
    if (value === "dynamic") Object.assign(appearance, { pageAware: true, applyToPage: false });
    else if (value === "custom") Object.assign(appearance, { pageAware: false, applyToPage: true, preset: "custom" });
    else Object.assign(appearance, { pageAware: false, applyToPage: true, preset: value }, paletteValues(palettes.find(palette => palette.id === value)));
  };
  const colourPreview = createThemeOptionPreview(r, applyColour);
  const colourPicker = createSettingsPicker({
    ariaLabel: "Theme colours", className: "hub-visual-theme-basic-picker hub-visual-theme-colour-picker",
    menuClassName: "hub-theme-options", optionClassName: "hub-theme-option", optionLabelClassName: "hub-theme-option-label",
    options: paletteOptions, value: colourValue,
    renderPreview: value => value === "dynamic" ? createThemeSourcePreview("match")
      : value === "custom" ? createButtonIcon("icon-settings.svg")
        : palettePreview(paletteValues(palettes.find(palette => palette.id === value))),
    renderTrailing: value => value === "dynamic" ? createDynamicThemeInfo()
      : value === "custom" ? createButtonIcon("icon-settings.svg") : null,
    onPreview: colourPreview.preview,
    onChange: (value, label) => colourPreview.commit(value, `${label} colours enabled`)
  });
  const applyPlayer = (value) => {
    state.musicBarStyle = Object.hasOwn(playerNames, value) ? value : "zune";
    state.musicBarPanelButtons = "compact";
  };
  const playerPreview = createThemeOptionPreview(r, applyPlayer);
  const playerPicker = createSettingsPicker({
    ariaLabel: "Theme player", className: "hub-visual-theme-basic-picker",
    options: Object.entries(playerNames).map(([value, label]) => ({ value, label })), value: state.musicBarStyle,
    renderPreview: createPlayerDesignPreview,
    onPreview: playerPreview.preview,
    onChange: (value, label) => playerPreview.commit(value, `${label} player enabled`)
  });
  const applySurface = (value) => {
    appearance.frostedGlass = value === "glass";
    appearance.paperTexture = value === "paper";
  };
  const surfacePreview = createThemeOptionPreview(r, applySurface);
  const surfacePicker = createSettingsPicker({
    ariaLabel: "Theme surface", className: "hub-visual-theme-basic-picker",
    options: ["solid", "glass", "paper"].map(value => ({ value, label: titleCase(value) })), value: surface,
    renderPreview: createSurfacePreview,
    onPreview: surfacePreview.preview,
    onChange: (value, label) => surfacePreview.commit(value, `${label} surfaces enabled`)
  });
  const applyCorners = value => { appearance.cornerStyle = ["square", "custom"].includes(value) ? value : "rounded"; };
  const cornerPreview = createThemeOptionPreview(r, applyCorners);
  const cornerPicker = createSettingsPicker({
    ariaLabel: "Theme corners", className: "hub-visual-theme-basic-picker",
    options: ["rounded", "square", "custom"].map(value => ({ value, label: titleCase(value) })), value: appearance.cornerStyle,
    renderPreview: createCornerStylePreview,
    onPreview: cornerPreview.preview,
    onChange: (value, label) => cornerPreview.commit(value, `${label} corners enabled`)
  });
  const timelineOptions = [...TIMELINE_STYLES.map(({ value, label }) => ({ value, label }))];
  if (state.customTimeline) timelineOptions.unshift({ value: "custom", label: state.customTimeline.name || "Custom" });
  const applyTimeline = value => { state.scrubberStyle = timelineOptions.some(option => option.value === value) ? value : "waveform"; };
  const timelinePreview = createThemeOptionPreview(r, applyTimeline);
  const timelinePicker = createSettingsPicker({
    ariaLabel: "Theme timeline", className: "hub-visual-theme-basic-picker hub-timeline-picker",
    options: timelineOptions, value: state.scrubberStyle, renderPreview: createTimelinePreview,
    onPreview: timelinePreview.preview,
    onChange: (value, label) => timelinePreview.commit(value, `${label} timeline enabled`)
  });
  const handleOptions = Object.entries(HANDLE_LABELS)
    .filter(([value]) => value !== "custom" || state.customScrubberHandle)
    .map(([value, label]) => ({ value, label: value === "custom" ? state.customScrubberHandle?.name || label : label }));
  const applyHandle = value => { state.scrubberHandleShape = handleOptions.some(option => option.value === value) ? value : "pill"; };
  const handlePreview = createThemeOptionPreview(r, applyHandle);
  const handlePicker = createSettingsPicker({
    ariaLabel: "Theme handle", className: "hub-visual-theme-basic-picker",
    options: handleOptions, value: state.scrubberHandleShape, renderPreview: createHandlePreview,
    onPreview: handlePreview.preview,
    onChange: (value, label) => handlePreview.commit(value, `${label} handle enabled`)
  });
  const applyVisualizer = (value) => {
    if (value === "off") state.musicBarVisualizer = "off";
    else { state.musicBarVisualizerType = value; state.musicBarVisualizer = value; }
  };
  const visualizerPreview = createThemeOptionPreview(r, applyVisualizer);
  const visualizerPicker = createSettingsPicker({
    ariaLabel: "Theme visualiser", className: "hub-visual-theme-basic-picker hub-visualizer-type",
    options: visualizerOptions, value: visualizer, renderPreview: createVisualizerStylePreview,
    onPreview: visualizerPreview.preview,
    onChange: (value, label) => visualizerPreview.commit(value, `${label} visualiser selected`)
  });
  const applySize = value => { state.musicBarSize = value === "compact" ? "compact" : "standard"; };
  const sizePreview = createThemeOptionPreview(r, applySize);
  const sizePicker = createSettingsPicker({
    ariaLabel: "Theme player size", className: "hub-visual-theme-size-picker",
    options: [{ value: "compact", label: "Compact" }, { value: "standard", label: "Standard" }], value: state.musicBarSize,
    onPreview: sizePreview.preview,
    onChange: (value, label) => sizePreview.commit(value, `${label} player size enabled`)
  });
  for (const row of [["Colours", "colours", colourPicker], ["Player", "design", playerPicker], ["Surface", "design", surfacePicker]]) {
    appendBasicThemeRow(content, r, { label: row[0], destination: row[1], picker: row[2] });
  }

  const custom = createSettingsDisclosure("Advanced", "", "visual-theme-advanced");
  custom.group.classList.add("hub-visual-theme-advanced");
  for (const row of [
    ["Corners", "design", cornerPicker], ["Timeline", "timeline", timelinePicker], ["Handle", "timeline", handlePicker],
    ["Visualiser", "visualiser", visualizerPicker], ["Size", "size", sizePicker]
  ]) appendBasicThemeRow(custom.content, r, { label: row[0], destination: row[1], picker: row[2] });
  const playback = createSettingsRow({
    className: "hub-visual-theme-basic-row hub-visual-theme-advanced-row",
    copy: themeRowCopy(r, "Playback buttons", "timeline"),
    control: createButtonIcon("icon-play.svg")
  });
  playback.setAttribute("aria-label", Object.values(state.customPlayerButtons || {}).some(button => button.enabled && button.artwork)
    ? "Custom playback button artwork" : "Default playback button artwork");
  custom.content.append(playback);
  content.append(custom.group);
}

export function createVisualThemeSettings(r) {
  const disclosure = createSettingsDisclosure("Themes", "", "themes");
  const savedThemes = savedVisualThemes(runtimeState.appearance);
  const savedIds = new Set(savedThemes.map(theme => theme.id));
  const themes = [...VISUAL_THEMES, ...savedThemes];
  const selectable = [DEFAULT_VISUAL_THEME, ...themes];
  const storedBaseId = runtimeState.appearance.visualThemeId === "none"
    ? "dynamic" : runtimeState.appearance.visualThemeId;
  const active = selectable.find(theme => theme.id === storedBaseId) || DEFAULT_VISUAL_THEME;
  const unchanged = visualThemeMatches(runtimeState, active);
  const current = { ...captureVisualTheme(runtimeState), id: "current", label: "Custom" };
  const options = unchanged ? selectable : [current, ...selectable];
  // Mirrors the palette picker: a heading line per section, saved work last.
  const themeGroup = id => savedIds.has(id) ? "saved"
    : id === "current" ? "custom" : "bandkit";
  let snapshot = null;
  let previewId = null;
  const restore = () => {
    if (!snapshot) return;
    applyVisualTheme(runtimeState, snapshot); snapshot = null; previewId = null;
    r.$releasePanelPositionHold?.();
    syncVisualTheme(r);
  };
  r.$restoreVisualThemePreview = restore;
  // Playback and activity can save while a menu is hovered. Only persist the
  // committed look; unrelated state changes must still be saved normally.
  r.$restoreVisualThemeForSave = value => {
    if (snapshot) applyVisualTheme(value, snapshot);
  };
  const picker = createSettingsPicker({
    ariaLabel: "Visual theme", className: "hub-visual-theme-picker",
    value: unchanged ? active.id : "current",
    options: options.map(theme => ({ value: theme.id, label: theme.label, group: themeGroup(theme.id) })),
    groups: [["custom", "Custom"], ["bandkit", "Themes"], ["saved", "Saved"]],
    renderPreview: (id, context) => themePreview(options.find(theme => theme.id === id), context),
    renderTrailing: id => {
      if (id === "dynamic") return createDynamicThemeInfo();
      if (id === "current") {
        const basedOn = createElement("span", "hub-visual-theme-based-on", `Based on ${active.label}`);
        basedOn.setAttribute("aria-label", `Based on ${active.label}`);
        return basedOn;
      }
      if (!savedIds.has(id)) return null;
      const marker = createButtonIcon("icon-settings.svg");
      marker.classList.add("hub-visual-theme-saved-marker");
      marker.setAttribute("role", "img");
      marker.setAttribute("aria-label", "Saved theme");
      marker.setAttribute("title", "Saved theme");
      return marker;
    },
    onPreview: id => {
      if (!id || id === "current") { restore(); return; }
      if (id === previewId) return;
      snapshot ??= { version: 1,
        settings: Object.fromEntries(VISUAL_SETTING_KEYS.map(key => [key, structuredClone(runtimeState[key])])),
        appearance: Object.fromEntries(VISUAL_APPEARANCE_KEYS.map(key => [key, structuredClone(runtimeState.appearance[key])])) };
      previewId = id;
      // Pin the panel before the theme reflows the music bar under it, so the
      // preview shows the look without the panel chasing the new geometry.
      r.$holdPanelPosition?.();
      applyVisualTheme(runtimeState, selectable.find(theme => theme.id === id)); syncVisualTheme(r);
    },
    onChange: id => {
      if (id === "current") {
        restore(); return;
      }
      const theme = selectable.find(item => item.id === id);
      snapshot = null; previewId = null;
      applyVisualTheme(runtimeState, theme);
      runtimeState.appearance.visualThemeId = id;
      syncVisualTheme(r);
      // Release only after the committed theme is in place so the panel glides
      // from where it was held to the anchor that theme actually wants.
      r.$releasePanelPositionHold?.();
      runtimeSaveState(); r.$render();
      r.$showToast(`Applied “${theme.label}”`);
    }
  });
  const themeDescription = unchanged
    ? "A complete look: colours, player, controls and effects."
    : `Custom theme based on ${active.label}. Save it to keep this combination.`;
  const row = createSettingsRow({ copy: createSettingsRowCopy("Theme", themeDescription), control: picker.element });
  disclosure.content.append(row);
  appendSavedThemeManagement(r, disclosure.content);
  appendThemeBreakdown(r, disclosure.content);
  appendThemeActions(r, disclosure.content, active);
  return disclosure.group;
}
