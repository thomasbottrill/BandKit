import { colorString, hexColor, hexString, mixColor } from "./color.js";

export function customVisualizerColourDefaults(appearance) {
  const accent = appearance.customAccent;
  const scrub = appearance.customScrubAccent || accent;
  return [accent, scrub, hexString(mixColor(hexColor(accent), hexColor(scrub), 0.62))];
}

export function customVisualizerColors(appearance) {
  const defaults = customVisualizerColourDefaults(appearance);
  return defaults.map((colour, index) => appearance[`customVisualizerColor${index + 1}`] || colour);
}

export function themeVisualizerColors(theme) {
  if (Array.isArray(theme.visualizerColors) && theme.visualizerColors.length === 3) return [...theme.visualizerColors];
  const accent = theme.accent;
  const scrub = theme.scrubAccent || accent;
  return [accent, scrub, hexString(mixColor(hexColor(accent), hexColor(scrub), 0.62))];
}

export function appearanceVisualizerColourDefaults(appearance, themes = []) {
  if (appearance?.preset === "custom") return customVisualizerColourDefaults(appearance);
  const selected = themes.find((theme) => theme.id === appearance?.preset) || themes[0];
  return selected ? themeVisualizerColors(selected) : customVisualizerColourDefaults(appearance);
}

export function resolvedVisualizerColors(baseColors, appearance, themeColors = baseColors) {
  if (appearance?.visualizerColourSource === "custom") {
    return baseColors.map((colour, index) => appearance?.[`customVisualizerColor${index + 1}`] || themeColors[index] || colour);
  }
  return baseColors.map((colour, index) => {
    const override = appearance?.[`customVisualizerColor${index + 1}`];
    const themeColour = themeColors[index];
    if (!override || String(override).toLowerCase() === String(themeColour).toLowerCase()) return colour;
    return override;
  });
}

export function visualizerThemeVariables(colors, dark) {
  const serialized = colors.map((color) => typeof color === "string" ? color : colorString(color));
  return {
    "--hub-visualizer-blend-mode": dark ? "screen" : "multiply",
    "--hub-spectrum-blend-mode": dark ? "plus-lighter" : "multiply",
    "--hub-visualizer-color-1": serialized[0],
    "--hub-visualizer-color-2": serialized[1],
    "--hub-visualizer-color-3": serialized[2]
  };
}
