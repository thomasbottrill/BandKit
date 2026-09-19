import { createButtonIcon, createElement } from "./core.js";
import { drawVisualizerVariant, VISUALIZER_VARIANTS } from "./visualizer-variants.js";

const BLEND_MODE_ICONS = Object.freeze({
  normal: "icon-blend-layers.svg", multiply: "icon-blend-multiply.svg",
  screen: "icon-blend-screen.svg", overlay: "icon-blend-overlay.svg",
  darken: "icon-blend-darken.svg", lighten: "icon-blend-lighten.svg",
  "color-dodge": "icon-blend-dodge.svg", "color-burn": "icon-blend-burn.svg",
  "hard-light": "icon-blend-hard-light.svg", "soft-light": "icon-blend-soft-light.svg",
  difference: "icon-blend-difference.svg", exclusion: "icon-blend-exclusion.svg",
  hue: "icon-blend-hue.svg", saturation: "icon-blend-saturation.svg",
  color: "icon-blend-colour.svg", luminosity: "icon-blend-luminosity.svg",
  "plus-lighter": "icon-blend-plus.svg"
});

const SURFACE_ICONS = Object.freeze({ solid: "icon-surface-solid.svg", glass: "icon-surface-glass.svg", paper: "icon-surface-paper.svg" });
const CORNER_ICONS = Object.freeze({
  rounded: "icon-corners-rounded.svg", square: "icon-corners-square.svg", custom: "icon-corners-custom.svg"
});
const THEME_SOURCE_ICONS = Object.freeze({
  match: "icon-theme-dynamic.svg", theme: "icon-theme-curated.svg", custom: "icon-theme-custom.svg"
});

function createOptionIconPreview(value, icons, className) {
  const preview = createElement("span", className);
  preview.setAttribute("aria-hidden", "true");
  preview.append(createButtonIcon(icons[value] || Object.values(icons)[0]));
  return preview;
}

export function createPlayerDesignPreview(style) {
  return createOptionIconPreview(style, { docked: "icon-style-dock.svg", zune: "icon-style-fade.svg", rounded: "icon-style-float.svg" }, "hub-option-icon-preview");
}

export const createSurfacePreview = (value) => createOptionIconPreview(value, SURFACE_ICONS, "hub-surface-preview hub-option-icon-preview");
export const createCornerStylePreview = (value) => createOptionIconPreview(value, CORNER_ICONS, "hub-corner-style-preview hub-option-icon-preview");
export const createThemeSourcePreview = (value) => createOptionIconPreview(value, THEME_SOURCE_ICONS, "hub-theme-source-preview hub-option-icon-preview");

export function createVisualizerStylePreview(type) {
  if (type === "off") return null;
  const preview = createElement("span", "hub-visualizer-style-preview");
  preview.dataset.visualizerPreview = type;
  preview.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 44;
  preview.append(canvas);
  requestAnimationFrame(() => drawVisualizerPreview(preview, canvas, type));
  return preview;
}

function previewPoints(width, height) {
  return Array.from({ length: 57 }, (_, index) => {
    const position = index / 56;
    const envelope = 0.34 + Math.sin(position * Math.PI) * 0.66;
    const signal = 0.48 + Math.sin(position * 19) * 0.2 + Math.sin(position * 43 + 0.7) * 0.16;
    return [position * width, height - Math.max(3, height * envelope * signal)];
  });
}

function drawVisualizerPreview(preview, canvas, type) {
  if (!preview.isConnected) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const colour = getComputedStyle(preview).color || "#7c5cff";
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, colour);
  gradient.addColorStop(0.5, colour);
  gradient.addColorStop(1, colour);
  const points = previewPoints(width, height);
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (VISUALIZER_VARIANTS.includes(type)) {
    drawVisualizerVariant(context, type, points, width, height, 2.4, 1,
      { gradient, halo: colour, ridge: colour, history: colour }, () => colour);
    return;
  }
  context.strokeStyle = gradient;
  context.fillStyle = gradient;
  if (type === "glow") {
    context.save();
    context.filter = "blur(5px)";
    context.globalAlpha = 0.72;
    context.beginPath();
    context.moveTo(0, height);
    points.forEach(([x, y]) => context.lineTo(x, y));
    context.lineTo(width, height);
    context.closePath();
    context.fill();
    context.restore();
    return;
  }
  context.lineWidth = 2;
  context.beginPath();
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.stroke();
}

export function createBlendModePreview(mode) {
  const preview = createElement("span", "hub-blend-mode-preview");
  preview.dataset.blendMode = mode;
  preview.setAttribute("aria-hidden", "true");
  preview.append(createButtonIcon(BLEND_MODE_ICONS[mode] || BLEND_MODE_ICONS.normal));
  return preview;
}
