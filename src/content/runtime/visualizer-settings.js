import { createColourField } from "../components/colour-field.js";
import { createElement } from "../core.js";
import { BUILT_IN_THEMES } from "../state.js";
import { appearanceVisualizerColourDefaults } from "../visualizer-theme.js";
import { runtimeSaveState, runtimeState } from "./context.js";

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
        const overridden = isOverridden(key, index, defaults);
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
      sourceLabel: playerSettings ? "Theme colour" : sourceLabel,
      resetLabel: playerSettings ? "Reset to theme" : resetLabel
    });
    input.dataset.themeColour = key;
    r.$containThemeColourPointer(input);
    inputs.set(key, input);
    const resetLinkedColour = () => {
      runtimeState.appearance[key] = null;
      r.$spectrumColourCache = null;
      syncAll();
      r.$applyAppearance();
      runtimeSaveState();
    };
    setOverridden(isOverridden(key, index));
    input.addEventListener("input", () => {
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
  return { group, syncAll, syncLinked };
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
