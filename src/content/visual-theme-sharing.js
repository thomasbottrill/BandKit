import { normalizeCustomPlayerButtons } from "./custom-player-buttons.js";
import { normalizeCustomHandle } from "./custom-scrub-handle.js";
import { normalizeCustomTimeline } from "./custom-timeline.js";
import {
  defaultState, MUSIC_BAR_SCRUBBER_WIDTHS, MUSIC_BAR_STYLES, MUSIC_BAR_VISUALIZER_TYPES,
  MUSIC_BAR_WIDTHS, PLAYER_BLEND_MODES, SCRUBBER_HANDLE_SHAPES, VISUALIZER_BLEND_MODES,
  normalizeHandleSize, normalizeVisualizerType
} from "./state.js";
import { normalizeTimelineStyle } from "./timeline-styles.js";

export const VISUAL_THEME_FILE_FORMAT = "bandkit-visual-theme";
export const MAX_VISUAL_THEME_FILE_SIZE = 10 * 1024 * 1024;

const hex = (value, fallback) => /^#[\da-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
const optionalHex = value => /^#[\da-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : null;
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
};
const dimension = (value, min, max) => value === "auto" || value == null || value === ""
  ? "auto" : clamp(value, min, max, "auto");

export function normalizePortableVisualTheme(value) {
  if (!value || Number(value.version) !== 1 || !value.settings || !value.appearance) {
    throw new Error("This is not a supported Bandkit theme.");
  }
  const input = value.settings;
  const customHandle = normalizeCustomHandle(input.customScrubberHandle);
  const customTimeline = normalizeCustomTimeline(input.customTimeline);
  const visualizerType = normalizeVisualizerType(input.musicBarVisualizerType, input.musicBarVisualizer);
  const settings = {
    scrubberStyle: normalizeTimelineStyle(input.scrubberStyle),
    scrubberHandleShape: SCRUBBER_HANDLE_SHAPES.includes(input.scrubberHandleShape) ? input.scrubberHandleShape : "pill",
    scrubberHandleSize: normalizeHandleSize(input.scrubberHandleSize),
    customScrubberHandle: customHandle,
    customTimeline,
    customPlayerButtons: normalizeCustomPlayerButtons(input.customPlayerButtons),
    retainTimelineColors: input.retainTimelineColors !== false,
    retainSvgHandleColors: input.retainSvgHandleColors === true,
    retainPngHandleColors: input.retainPngHandleColors !== false,
    musicBarTimelineColor: optionalHex(input.musicBarTimelineColor),
    musicBarHandleColor: optionalHex(input.musicBarHandleColor),
    musicBarControlsColor: optionalHex(input.musicBarControlsColor),
    musicBarPlayerColor: optionalHex(input.musicBarPlayerColor),
    musicBarScrubberWidth: MUSIC_BAR_SCRUBBER_WIDTHS.includes(input.musicBarScrubberWidth) ? input.musicBarScrubberWidth : "full",
    musicBarStyle: MUSIC_BAR_STYLES.includes(input.musicBarStyle) ? input.musicBarStyle : "zune",
    musicBarDynamicColor: input.musicBarDynamicColor !== false,
    musicBarPlayerDynamicColor: input.musicBarPlayerDynamicColor !== false,
    musicBarPanelDynamicColor: input.musicBarPanelDynamicColor !== false,
    musicBarBlendMode: PLAYER_BLEND_MODES.includes(input.musicBarBlendMode) ? input.musicBarBlendMode : "normal",
    musicBarSize: input.musicBarSize === "compact" ? "compact" : "standard",
    musicBarVisualizer: input.musicBarVisualizer === "off" ? "off" : visualizerType,
    musicBarVisualizerType: MUSIC_BAR_VISUALIZER_TYPES.includes(visualizerType) ? visualizerType : "glow",
    musicBarVisualizerOpacity: clamp(input.musicBarVisualizerOpacity, 10, 400, 100),
    musicBarVisualizerWidth: dimension(input.musicBarVisualizerWidth, 240, 3200),
    musicBarVisualizerHeight: dimension(input.musicBarVisualizerHeight, 24, 240),
    musicBarVisualizerBlendMode: VISUALIZER_BLEND_MODES.includes(input.musicBarVisualizerBlendMode) ? input.musicBarVisualizerBlendMode : "normal",
    musicBarWidth: MUSIC_BAR_WIDTHS.includes(input.musicBarWidth) ? input.musicBarWidth : "default",
    musicBarCustomWidth: clamp(input.musicBarCustomWidth, 480, 2000, 900)
  };
  if (settings.scrubberHandleShape === "custom" && !customHandle) settings.scrubberHandleShape = "pill";
  if (settings.scrubberStyle === "custom" && !customTimeline) settings.scrubberStyle = "waveform";

  const source = value.appearance;
  const defaults = defaultState.appearance;
  const appearance = {
    pageAware: source.pageAware === true,
    applyToPage: source.applyToPage === true,
    frostedGlass: source.frostedGlass === true && source.paperTexture !== true,
    paperTexture: source.paperTexture === true,
    paperTextureStrength: clamp(source.paperTextureStrength, 0, 200, defaults.paperTextureStrength),
    paperFibreStrength: clamp(source.paperFibreStrength, 0, 200, defaults.paperFibreStrength),
    paperMottleStrength: clamp(source.paperMottleStrength, 0, 200, defaults.paperMottleStrength),
    paperGrainSize: clamp(source.paperGrainSize, 80, 480, defaults.paperGrainSize),
    glassTransparency: clamp(source.glassTransparency, 0, 70, defaults.glassTransparency),
    glassBlur: clamp(source.glassBlur, 0, 30, defaults.glassBlur),
    cornerStyle: ["rounded", "square", "custom"].includes(source.cornerStyle) ? source.cornerStyle : "rounded",
    customCornerRadius: clamp(source.customCornerRadius, 0, 40, defaults.customCornerRadius),
    // A shared theme is self-contained; it must not depend on a palette that may
    // only exist in the exporting browser.
    preset: "custom",
    customAccent: hex(source.customAccent, defaults.customAccent),
    customScrubAccent: optionalHex(source.customScrubAccent),
    visualizerColourSource: source.visualizerColourSource === "custom" ? "custom" : "theme",
    customVisualizerColor1: optionalHex(source.customVisualizerColor1),
    customVisualizerColor2: optionalHex(source.customVisualizerColor2),
    customVisualizerColor3: optionalHex(source.customVisualizerColor3),
    customSurface: hex(source.customSurface, defaults.customSurface),
    customPanelLinked: source.customPanelLinked !== false,
    customCard: hex(source.customCard, defaults.customCard),
    customContentLinked: source.customContentLinked !== false,
    customPageBackground: hex(source.customPageBackground, defaults.customPageBackground),
    customPageSurface: hex(source.customPageSurface, defaults.customPageSurface),
    customNavbar: hex(source.customNavbar, defaults.customNavbar),
    customText: hex(source.customText, defaults.customText),
    customSecondaryText: hex(source.customSecondaryText, defaults.customSecondaryText)
  };
  return { version: 1, settings, appearance };
}

export function parseVisualThemeDocument(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("The selected theme file is empty.");
  let payload;
  try { payload = JSON.parse(source); }
  catch { throw new Error("The selected file is not valid JSON."); }
  if (payload?.format !== VISUAL_THEME_FILE_FORMAT || Number(payload.version) !== 1) {
    throw new Error("This is not a supported Bandkit theme.");
  }
  const label = String(payload.name || payload.theme?.label || "Imported theme").trim().slice(0, 28) || "Imported theme";
  return { label, ...normalizePortableVisualTheme(payload.theme) };
}

export function portableVisualThemeDocument(theme, label, exportedAt = new Date()) {
  return {
    format: VISUAL_THEME_FILE_FORMAT,
    version: 1,
    name: String(label || "Custom").trim().slice(0, 28) || "Custom",
    exportedAt: exportedAt.toISOString(),
    theme: normalizePortableVisualTheme(theme)
  };
}
