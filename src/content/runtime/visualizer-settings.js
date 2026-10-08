import { createColourField } from "../components/colour-field.js";
import { createSettingsRow, createSettingsRowCopy } from "../components/settings.js";
import { hexColor, hexString, parseColor } from "../color.js";
import { createElement } from "../core.js";
import { createSettingsPicker } from "../settings-picker.js";
import { BUILT_IN_THEMES } from "../state.js";
import { appearanceVisualizerColourDefaults } from "../visualizer-theme.js";
import { runtimeSaveState, runtimeState } from "./context.js";

function renderedVisualizerColours(r, fallbacks) {
  const target = r.$playerVisualizer || r.$player;
  const style = target ? getComputedStyle(target) : null;
  return fallbacks.map((fallback, index) => {
    const value = style?.getPropertyValue(`--hub-visualizer-color-${index + 1}`).trim();
    const colour = parseColor(value) || hexColor(value, hexColor(fallback, { r: 29, g: 160, b: 195, a: 1 }));
    return hexString(colour);
  });
}

export function createCustomVisualizerColourSettings(r, { showHeading = true, variant = "theme" } = {}) {
  const playerSettings = variant === "player";
  const group = createElement("section", `hub-bandkit-colours hub-visualizer-colours ${playerSettings ? "is-player-settings" : "is-theme-settings"}`);
  if (!playerSettings && showHeading) {
    group.append(createElement("h3", "hub-colour-group-label", "Visualizer"));
  }
  const inputs = new Map();
  const settings = [
    ["customVisualizerColor1", "Colour 1", "From accent", "Reset to accent", 0],
    ["customVisualizerColor2", "Colour 2", "From timeline", "Reset to timeline", 1],
    ["customVisualizerColor3", "Colour 3", "From accent + timeline", "Reset to blend", 2]
  ];
  const defaultsForTheme = () => appearanceVisualizerColourDefaults(runtimeState.appearance, [
    ...BUILT_IN_THEMES,
    ...(runtimeState.appearance.savedThemes || [])
  ]);
  const isOverridden = (key, index, defaults = defaultsForTheme()) => Boolean(
    runtimeState.appearance[key]
    && String(runtimeState.appearance[key]).toLowerCase() !== String(defaults[index]).toLowerCase()
  );
  const usesCustomSource = () => runtimeState.appearance.visualizerColourSource === "custom"
    || settings.some(([key, , , , index]) => isOverridden(key, index));
  const syncLinked = () => {
    const defaults = defaultsForTheme();
    settings.forEach(([key, , , , index]) => {
      if (!runtimeState.appearance[key]) inputs.get(key).value = defaults[index];
    });
  };
  const syncAll = () => {
    const defaults = defaultsForTheme();
    settings.forEach(([key, , , , index]) => {
      const value = runtimeState.appearance[key] || defaults[index];
      for (const input of r.$content.querySelectorAll(`[data-theme-colour="${key}"]`)) {
        input.value = value;
        const field = input.closest(".hub-colour-field");
        const overridden = runtimeState.appearance.visualizerColourSource === "custom"
          ? Boolean(runtimeState.appearance[key]) : isOverridden(key, index, defaults);
        const source = field?.querySelector(".hub-colour-source");
        const reset = field?.querySelector(".hub-colour-link");
        if (source) source.hidden = overridden;
        if (reset) reset.hidden = !overridden;
      }
    });
  };
  for (const [key, label, sourceLabel, resetLabel, index] of settings) {
    const { field, input, reset, setOverridden } = createColourField({
      label, tooltip: `Override ${label.toLowerCase()} or reset it to the active theme colour.`,
      ariaLabel: `${label}. Override this visualiser colour or reset it to the active theme colour.`,
      id: `bandkit-${playerSettings ? "player-visualizer" : "theme"}-colour-${key}`,
      value: runtimeState.appearance[key] || defaultsForTheme()[index],
      className: "hub-colour-field is-linked-colour hub-player-setting-row hub-visualizer-colour-row",
      controlClassName: "hub-visualizer-colour-control",
      sourceLabel: playerSettings ? "Theme" : sourceLabel,
      resetLabel: playerSettings ? "Use theme" : resetLabel
    });
    input.dataset.themeColour = key;
    r.$containThemeColourPointer(input);
    inputs.set(key, input);
    const resetLinkedColour = () => {
      runtimeState.appearance[key] = null;
      const returnedToTheme = settings.every(([colourKey]) => !runtimeState.appearance[colourKey]);
      if (returnedToTheme) runtimeState.appearance.visualizerColourSource = "theme";
      r.$spectrumColourCache = null;
      syncAll();
      r.$applyAppearance();
      runtimeSaveState();
      if (returnedToTheme && playerSettings) r.$render();
    };
    setOverridden(runtimeState.appearance.visualizerColourSource === "custom"
      ? Boolean(runtimeState.appearance[key]) : isOverridden(key, index));
    input.addEventListener("input", () => {
      runtimeState.appearance.visualizerColourSource = "custom";
      runtimeState.appearance[key] = input.value;
      r.$spectrumColourCache = null;
      syncAll();
      r.$applyAppearance();
    });
    input.addEventListener("change", () => {
      r.$spectrumColourCache = null;
      r.$applyAppearance();
      runtimeSaveState();
    });
    reset.addEventListener("click", resetLinkedColour);
    group.append(field);
  }
  if (playerSettings) {
    const sourceRow = createSettingsRow({ className: "hub-visualizer-colour-source-row" });
    const sourceCopy = createSettingsRowCopy("Source", "Follow the active theme, or keep fixed visualiser colours across pages.");
    const sourcePicker = createSettingsPicker({
      ariaLabel: "Visualiser colour source",
      className: "hub-visualizer-colour-source-picker",
      options: [
        { value: "theme", label: "Follow theme" },
        { value: "custom", label: "Custom" }
      ],
      value: usesCustomSource() ? "custom" : "theme",
      onChange: (source) => {
        const defaults = defaultsForTheme();
        runtimeState.appearance.visualizerColourSource = source === "custom" ? "custom" : "theme";
        if (source === "custom") {
          renderedVisualizerColours(r, defaults).forEach((colour, index) => {
            runtimeState.appearance[`customVisualizerColor${index + 1}`] = colour;
          });
        } else {
          for (let index = 1; index <= 3; index++) runtimeState.appearance[`customVisualizerColor${index}`] = null;
        }
        r.$spectrumColourCache = null;
        r.$applyAppearance();
        runtimeSaveState();
        r.$render();
        r.$showToast(source === "custom" ? "Custom visualiser colours enabled" : "Visualiser now follows the theme");
      }
    });
    sourceRow.append(sourceCopy, sourcePicker.element);
    group.prepend(sourceRow);
    for (const row of group.querySelectorAll(".hub-visualizer-colour-row")) row.hidden = !usesCustomSource();
  }
  return { group, syncAll, syncLinked, source: usesCustomSource() ? "custom" : "theme" };
}

export function createCustomScrubColourSetting(r, visualizerColours) {
  const { field, input, reset, setOverridden } = createColourField({
    label: "Timeline colour", tooltip: "Choose the timeline colour or reset it to the theme accent.",
    ariaLabel: null, inputLabel: "Timeline colour", id: "bandkit-theme-colour-customScrubAccent",
    value: runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent,
    className: "hub-colour-field hub-player-setting-row hub-theme-colour-row is-linked-colour",
    sourceLabel: "From accent", resetLabel: "Reset to accent"
  });
  const defaultsForTheme = () => appearanceVisualizerColourDefaults(runtimeState.appearance, [
    ...BUILT_IN_THEMES,
    ...(runtimeState.appearance.savedThemes || [])
  ]);
  input.dataset.themeColour = "customScrubAccent";
  r.$containThemeColourPointer(input);
  setOverridden(Boolean(runtimeState.appearance.customScrubAccent));
  input.addEventListener("input", () => {
    const currentVisualizerColours = defaultsForTheme();
    for (let index = 0; index < 3; index++) {
      const key = `customVisualizerColor${index + 1}`;
      if (!runtimeState.appearance[key]) runtimeState.appearance[key] = currentVisualizerColours[index];
    }
    runtimeState.appearance.customScrubAccent = input.value;
    setOverridden(true); visualizerColours.syncAll(); r.$scheduleCustomThemePreview();
  });
  input.addEventListener("change", r.$commitCustomThemeColour);
  reset.addEventListener("click", () => {
    runtimeState.appearance.customScrubAccent = null;
    input.value = runtimeState.appearance.customAccent;
    setOverridden(false); visualizerColours.syncAll(); r.$applyAppearance(); runtimeSaveState();
  });
  return field;
}
