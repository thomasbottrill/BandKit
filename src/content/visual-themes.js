import { BUILT_IN_THEMES, defaultState } from "./state.js";

export const MAX_VISUAL_THEMES = 20;
// An explicit boundary: visual presets never capture music, tools, account data,
// visibility preferences, panel position, or settings navigation.
export const VISUAL_SETTING_KEYS = Object.freeze([
  "scrubberStyle", "scrubberHandleShape", "scrubberHandleSize", "customScrubberHandle",
  "customTimeline", "customPlayerButtons", "retainTimelineColors", "retainSvgHandleColors",
  "retainPngHandleColors", "musicBarTimelineColor", "musicBarHandleColor", "musicBarControlsColor",
  "musicBarPlayerColor", "musicBarScrubberWidth", "musicBarStyle", "musicBarDynamicColor",
  "musicBarPlayerDynamicColor", "musicBarPanelDynamicColor", "musicBarBlendMode", "musicBarSize",
  "musicBarVisualizer", "musicBarVisualizerType", "musicBarVisualizerOpacity", "musicBarVisualizerWidth",
  "musicBarVisualizerHeight", "musicBarVisualizerBlendMode", "musicBarWidth", "musicBarCustomWidth"
]);
export const VISUAL_APPEARANCE_KEYS = Object.freeze([
  "pageAware", "applyToPage", "frostedGlass", "paperTexture", "paperTextureStrength",
  "paperFibreStrength", "paperMottleStrength", "paperGrainSize", "glassTransparency", "glassBlur",
  "cornerStyle", "customCornerRadius", "preset", "customAccent", "customScrubAccent",
  "customVisualizerColor1", "customVisualizerColor2", "customVisualizerColor3", "customSurface",
  "customPanelLinked", "customCard", "customContentLinked", "customPageBackground",
  "customPageSurface", "customNavbar", "customText", "customSecondaryText"
]);

function pick(source, defaults, keys) {
  return Object.fromEntries(keys.map(key => [key, structuredClone(source?.[key] ?? defaults[key])]));
}

export function captureVisualTheme(state) {
  const appearance = pick(state.appearance, defaultState.appearance, VISUAL_APPEARANCE_KEYS);
  // Keep saved palettes self-contained, so deleting a palette cannot break a theme.
  const palette = [...BUILT_IN_THEMES, ...(state.appearance.savedThemes || [])]
    .find(item => item.id === appearance.preset);
  if (palette) {
    Object.assign(appearance, {
      customAccent: palette.accent, customScrubAccent: palette.scrubAccent || palette.accent,
      customSurface: palette.surface, customCard: palette.card || palette.surface,
      customPageBackground: palette.background || palette.surface,
      customPageSurface: palette.pageSurface || palette.surface, customNavbar: palette.navbar || palette.surface,
      customText: palette.text, customSecondaryText: palette.secondaryText,
      customPanelLinked: false, customContentLinked: false
    });
    if (!BUILT_IN_THEMES.some(item => item.id === palette.id)) {
      appearance.preset = "custom";
      palette.visualizerColors?.forEach((colour, index) => {
        if (!appearance[`customVisualizerColor${index + 1}`]) appearance[`customVisualizerColor${index + 1}`] = colour;
      });
    }
  }
  return { version: 1, settings: pick(state, defaultState, VISUAL_SETTING_KEYS), appearance };
}

export function applyVisualTheme(state, theme) {
  if (theme?.version !== 1 || !theme.settings || !theme.appearance) return false;
  Object.assign(state, pick(theme.settings, defaultState, VISUAL_SETTING_KEYS));
  Object.assign(state.appearance, pick(theme.appearance, defaultState.appearance, VISUAL_APPEARANCE_KEYS));
  return true;
}

export function visualThemeMatches(state, theme) {
  if (!theme) return false;
  const copy = { appearance: { savedThemes: state.appearance.savedThemes } };
  applyVisualTheme(copy, theme);
  return sameVisualValue(captureVisualTheme(state), captureVisualTheme(copy));
}

// Chrome storage can reorder object keys, including the custom artwork roles.
function sameVisualValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameVisualValue(left[key], right[key]));
}

function preset(id, label, palette, style, surface, timeline, handle, visualizer, extra = {}) {
  const state = structuredClone(defaultState);
  Object.assign(state, {
    musicBarStyle: style, scrubberStyle: timeline, scrubberHandleShape: handle,
    musicBarVisualizer: visualizer, musicBarVisualizerType: visualizer === "off" ? "glow" : visualizer,
    musicBarDynamicColor: false, musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false,
    ...extra
  });
  Object.assign(state.appearance, {
    preset: palette, pageAware: false, applyToPage: true,
    frostedGlass: surface === "glass", paperTexture: surface === "paper",
    cornerStyle: surface === "paper" ? "square" : "rounded"
  });
  return Object.freeze({ id, label, ...captureVisualTheme(state) });
}

// "No theme": Bandkit's out-of-the-box look. Selecting it clears whatever theme
// is applied and leaves Bandcamp pages in their normal, unstyled state.
export const DEFAULT_VISUAL_THEME = Object.freeze({
  id: "none", label: "None", ...captureVisualTheme(defaultState)
});

// Themes built from custom hex colours rather than one of the built-in palettes
// cannot be expressed as a preset() recipe, so they ship as complete themes.
function customTheme(id, label, settings, appearance) {
  return Object.freeze({ id, label, version: 1, settings, appearance });
}

const CUSTOM_THEMES = Object.freeze([
  customTheme("tomb", "Tomb", {
    scrubberStyle: "waveform", scrubberHandleShape: "star-5", scrubberHandleSize: 120, customScrubberHandle: null,
    customTimeline: null, customPlayerButtons: {}, retainTimelineColors: true, retainSvgHandleColors: false,
    retainPngHandleColors: true, musicBarTimelineColor: "#ec9cb0", musicBarHandleColor: "#ff61b5",
    musicBarControlsColor: null, musicBarPlayerColor: null, musicBarScrubberWidth: "full", musicBarStyle: "zune",
    musicBarDynamicColor: true, musicBarPlayerDynamicColor: true, musicBarPanelDynamicColor: true,
    musicBarBlendMode: "normal", musicBarSize: "standard", musicBarVisualizer: "pixels",
    musicBarVisualizerType: "pixels", musicBarVisualizerOpacity: 100, musicBarVisualizerWidth: "auto",
    musicBarVisualizerHeight: "auto", musicBarVisualizerBlendMode: "normal", musicBarWidth: "default",
    musicBarCustomWidth: 900
  }, {
    pageAware: false, applyToPage: true, frostedGlass: false, paperTexture: false, paperTextureStrength: 100,
    paperFibreStrength: 70, paperMottleStrength: 20, paperGrainSize: 240, glassTransparency: 20, glassBlur: 20,
    cornerStyle: "rounded", customCornerRadius: 12, preset: "custom", customAccent: "#438736",
    customScrubAccent: null, customVisualizerColor1: null, customVisualizerColor2: null, customVisualizerColor3: null,
    customSurface: "#213128", customPanelLinked: true, customCard: "#17231d", customContentLinked: true,
    customPageBackground: "#0c1510", customPageSurface: "#17231d", customNavbar: "#111c16", customText: "#f2fbf5",
    customSecondaryText: "#a9c7b5"
  }),
  customTheme("premier", "Premier", {
    scrubberStyle: "dashes", scrubberHandleShape: "pill", scrubberHandleSize: 100, customScrubberHandle: null,
    customTimeline: null, customPlayerButtons: {}, retainTimelineColors: true, retainSvgHandleColors: false,
    retainPngHandleColors: true, musicBarTimelineColor: null, musicBarHandleColor: null, musicBarControlsColor: null,
    musicBarPlayerColor: null, musicBarScrubberWidth: "full", musicBarStyle: "docked", musicBarDynamicColor: false,
    musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false, musicBarBlendMode: "normal",
    musicBarSize: "standard", musicBarVisualizer: "dna", musicBarVisualizerType: "dna",
    musicBarVisualizerOpacity: 100, musicBarVisualizerWidth: "auto", musicBarVisualizerHeight: "auto",
    musicBarVisualizerBlendMode: "normal", musicBarWidth: "default", musicBarCustomWidth: 900
  }, {
    pageAware: false, applyToPage: true, frostedGlass: false, paperTexture: true, paperTextureStrength: 100,
    paperFibreStrength: 70, paperMottleStrength: 20, paperGrainSize: 240, glassTransparency: 20, glassBlur: 20,
    cornerStyle: "square", customCornerRadius: 12, preset: "custom", customAccent: "#a34420",
    customScrubAccent: "#cf6335", customVisualizerColor1: null, customVisualizerColor2: null,
    customVisualizerColor3: null, customSurface: "#fffaf5", customPanelLinked: false, customCard: "#f8eadf",
    customContentLinked: false, customPageBackground: "#efe0d2", customPageSurface: "#fff8f0",
    customNavbar: "#f7e7d8", customText: "#291b16", customSecondaryText: "#76574a"
  }),
  customTheme("burrow", "Burrow", {
    scrubberStyle: "dots", scrubberHandleShape: "circle", scrubberHandleSize: 100, customScrubberHandle: null,
    customTimeline: null, customPlayerButtons: {}, retainTimelineColors: true, retainSvgHandleColors: false,
    retainPngHandleColors: true, musicBarTimelineColor: null, musicBarHandleColor: null, musicBarControlsColor: null,
    musicBarPlayerColor: null, musicBarScrubberWidth: "full", musicBarStyle: "rounded", musicBarDynamicColor: false,
    musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false, musicBarBlendMode: "normal",
    musicBarSize: "standard", musicBarVisualizer: "constellation", musicBarVisualizerType: "constellation",
    musicBarVisualizerOpacity: 100, musicBarVisualizerWidth: "auto", musicBarVisualizerHeight: "auto",
    musicBarVisualizerBlendMode: "normal", musicBarWidth: "default", musicBarCustomWidth: 900
  }, {
    pageAware: false, applyToPage: true, frostedGlass: false, paperTexture: false, paperTextureStrength: 100,
    paperFibreStrength: 70, paperMottleStrength: 20, paperGrainSize: 240, glassTransparency: 20, glassBlur: 20,
    cornerStyle: "rounded", customCornerRadius: 12, preset: "custom", customAccent: "#bf1d1d",
    customScrubAccent: null, customVisualizerColor1: "#ffcd1a", customVisualizerColor2: "#ffad1f",
    customVisualizerColor3: "#ffda24", customSurface: "#340909", customPanelLinked: true, customCard: "#340909",
    customContentLinked: true, customPageBackground: "#250404", customPageSurface: "#340909", customNavbar: "#340909",
    customText: "#111827", customSecondaryText: "#1d131d"
  }),
  customTheme("camp-st", "Camp St", {
    scrubberStyle: "dashes", scrubberHandleShape: "butterfly", scrubberHandleSize: 100, customScrubberHandle: null,
    customTimeline: null, customPlayerButtons: {}, retainTimelineColors: true, retainSvgHandleColors: false,
    retainPngHandleColors: true, musicBarTimelineColor: null, musicBarHandleColor: "#f7cc55",
    musicBarControlsColor: null, musicBarPlayerColor: null, musicBarScrubberWidth: "full", musicBarStyle: "zune",
    musicBarDynamicColor: false, musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false,
    musicBarBlendMode: "normal", musicBarSize: "standard", musicBarVisualizer: "embers",
    musicBarVisualizerType: "embers", musicBarVisualizerOpacity: 100, musicBarVisualizerWidth: "auto",
    musicBarVisualizerHeight: "auto", musicBarVisualizerBlendMode: "normal", musicBarWidth: "default",
    musicBarCustomWidth: 900
  }, {
    pageAware: false, applyToPage: true, frostedGlass: false, paperTexture: false, paperTextureStrength: 100,
    paperFibreStrength: 70, paperMottleStrength: 20, paperGrainSize: 240, glassTransparency: 20, glassBlur: 20,
    cornerStyle: "rounded", customCornerRadius: 12, preset: "custom", customAccent: "#d06767",
    customScrubAccent: null, customVisualizerColor1: null, customVisualizerColor2: null, customVisualizerColor3: null,
    customSurface: "#fffee0", customPanelLinked: true, customCard: "#fffee0", customContentLinked: true,
    customPageBackground: "#e9e6dd", customPageSurface: "#fffee0", customNavbar: "#fffee0", customText: "#14231a",
    customSecondaryText: "#777f6d"
  }),
  customTheme("prion", "Prion", {
    scrubberStyle: "ticks", scrubberHandleShape: "star-4", scrubberHandleSize: 100, customScrubberHandle: null,
    customTimeline: null, customPlayerButtons: {}, retainTimelineColors: true, retainSvgHandleColors: false,
    retainPngHandleColors: true, musicBarTimelineColor: null, musicBarHandleColor: null, musicBarControlsColor: null,
    musicBarPlayerColor: null, musicBarScrubberWidth: "full", musicBarStyle: "rounded", musicBarDynamicColor: false,
    musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false, musicBarBlendMode: "normal",
    musicBarSize: "standard", musicBarVisualizer: "contours", musicBarVisualizerType: "contours",
    musicBarVisualizerOpacity: 100, musicBarVisualizerWidth: "auto", musicBarVisualizerHeight: "auto",
    musicBarVisualizerBlendMode: "normal", musicBarWidth: "default", musicBarCustomWidth: 900
  }, {
    pageAware: false, applyToPage: true, frostedGlass: false, paperTexture: true, paperTextureStrength: 100,
    paperFibreStrength: 70, paperMottleStrength: 20, paperGrainSize: 240, glassTransparency: 20, glassBlur: 20,
    cornerStyle: "square", customCornerRadius: 12, preset: "custom", customAccent: "#0085f9", customScrubAccent: null,
    customVisualizerColor1: null, customVisualizerColor2: null, customVisualizerColor3: null,
    customSurface: "#dde0e6", customPanelLinked: true, customCard: "#dde0e6", customContentLinked: true,
    customPageBackground: "#e8ebf2", customPageSurface: "#dde0e6", customNavbar: "#dde0e6", customText: "#211f1a",
    customSecondaryText: "#707070"
  }),
  customTheme("tarn", "Tarn", {
    scrubberStyle: "peaks", scrubberHandleShape: "circle", scrubberHandleSize: 100, customScrubberHandle: null,
    customTimeline: null, customPlayerButtons: {}, retainTimelineColors: true, retainSvgHandleColors: false,
    retainPngHandleColors: true, musicBarTimelineColor: null, musicBarHandleColor: null, musicBarControlsColor: null,
    musicBarPlayerColor: null, musicBarScrubberWidth: "full", musicBarStyle: "rounded", musicBarDynamicColor: false,
    musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false, musicBarBlendMode: "normal",
    musicBarSize: "standard", musicBarVisualizer: "cross-stitch", musicBarVisualizerType: "cross-stitch",
    musicBarVisualizerOpacity: 100, musicBarVisualizerWidth: "auto", musicBarVisualizerHeight: "auto",
    musicBarVisualizerBlendMode: "normal", musicBarWidth: "default", musicBarCustomWidth: 900
  }, {
    pageAware: false, applyToPage: true, frostedGlass: true, paperTexture: false, paperTextureStrength: 100,
    paperFibreStrength: 70, paperMottleStrength: 20, paperGrainSize: 240, glassTransparency: 20, glassBlur: 20,
    cornerStyle: "rounded", customCornerRadius: 12, preset: "custom", customAccent: "#67d2ff",
    customScrubAccent: "#8adeff", customVisualizerColor1: null, customVisualizerColor2: null,
    customVisualizerColor3: null, customSurface: "#0f2433", customPanelLinked: false, customCard: "#183649",
    customContentLinked: false, customPageBackground: "#071721", customPageSurface: "#0f2433",
    customNavbar: "#0a1c28", customText: "#f0f9ff", customSecondaryText: "#abc5d4"
  })
]);

export const VISUAL_THEMES = Object.freeze([
  preset("clarity", "Minimal", "studio", "docked", "solid", "traditional", "circle", "off", { musicBarSize: "compact" }),
  preset("after-hours", "Kickons", "midnight", "zune", "glass", "waveform", "pill", "glow"),
  preset("superbloom", "Faery", "daybreak", "rounded", "solid", "weave", "butterfly", "firefly"),
  preset("transmission", "Green Pill", "acid-signal", "docked", "solid", "circuit", "space-invader", "matrix"),
  preset("orbit", "Weichselstraße", "ultraviolet", "zune", "glass", "pulse", "star-4", "constellation"),
  preset("night-drive", "Douglas", "ember", "zune", "solid", "peaks", "lightning", "warp"),
  ...CUSTOM_THEMES
]);

export function savedVisualThemes(appearance) {
  return (Array.isArray(appearance.visualThemes) ? appearance.visualThemes : [])
    .filter(theme => theme?.id && typeof theme.label === "string" && theme.version === 1 && theme.settings && theme.appearance)
    .slice(0, MAX_VISUAL_THEMES);
}
