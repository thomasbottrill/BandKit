import { createArtworkUpload } from "./components/artwork-upload.js";
import { createPlayerSettingLabel, createSettingsToggle } from "./components/settings.js";
import { createButtonIcon, createElement } from "./core.js";
import { SCRUBBER_HANDLE_SHAPES, normalizeHandleSize } from "./state.js";
import { importCustomHandle, scrubberHandleMask, setHandleImageStyles } from "./custom-scrub-handle.js";
import { runtimeSaveState, runtimeState } from "./runtime/context.js";
import { createSettingsPicker } from "./settings-picker.js";
import { createScrubbablePercentage } from "./music-bar-settings.js";

export const HANDLE_LABELS = Object.freeze({
  pill: "Pill",
  circle: "Circle",
  diamond: "Diamond",
  "star-4": "Four-point star",
  "star-5": "Five-point star",
  "star-6": "Six-point star",
  butterfly: "Butterfly",
  lightning: "Lightning bolt",
  "space-invader": "Space invader",
  cat: "Cat",
  custom: "Custom"
});

function usesRoundedHandleIcons() {
  return runtimeState.appearance.cornerStyle !== "square"
    && !(runtimeState.appearance.cornerStyle === "custom" && Number(runtimeState.appearance.customCornerRadius) <= 0);
}

export function createHandlePreview(shape) {
  const preview = createElement("span", "hub-scrub-handle-preview");
  preview.dataset.shape = shape;
  setHandleImageStyles(preview.style, "--hub-scrub-handle-option", shape, runtimeState.customScrubberHandle, runtimeState.retainSvgHandleColors, runtimeState.retainPngHandleColors);
  preview.style.setProperty(
    "--hub-scrub-handle-option-mask",
    scrubberHandleMask(shape, usesRoundedHandleIcons(), runtimeState.customScrubberHandle)
  );
  preview.setAttribute("aria-hidden", "true");
  return preview;
}

export function createScrubberHandleSetting(r) {
  const group = createElement("div", "hub-handle-settings");
  const row = createElement("div", "hub-player-setting-row hub-music-bar-scrubber-handle-row");
  const label = createPlayerSettingLabel("Style", "Choose the two-layer handle shape used for every slider.", { ariaLabel: "Handle style. Choose the two-layer shape used for every slider." });
  const selectedHandle = SCRUBBER_HANDLE_SHAPES.includes(runtimeState.scrubberHandleShape)
    ? runtimeState.scrubberHandleShape : "pill";
  const customRow = createCustomHandleRow(r);
  const svgColorsRow = createSvgColorsRow(r);
  const handleSize = createHandleSizeRow(r, selectedHandle);
  svgColorsRow.hidden = selectedHandle !== "custom" || !runtimeState.customScrubberHandle;
  customRow.hidden = selectedHandle !== "custom";
  const picker = createSettingsPicker({
    ariaLabel: "Scrub handle shape",
    className: "hub-scrub-handle-picker",
    options: ["custom", ...SCRUBBER_HANDLE_SHAPES.filter((shape) => shape !== "custom")].map((shape) => ({ value: shape, label: HANDLE_LABELS[shape] })),
    renderPreview: (shape) => shape === "custom" ? createButtonIcon("icon-settings.svg") : createHandlePreview(shape),
    value: selectedHandle,
    onChange: (shape) => {
      runtimeState.scrubberHandleShape = SCRUBBER_HANDLE_SHAPES.includes(shape) ? shape : "pill";
      handleSize.setShape(runtimeState.scrubberHandleShape);
      customRow.hidden = shape !== "custom";
      svgColorsRow.hidden = shape !== "custom" || !runtimeState.customScrubberHandle;
      r.$syncScrubberStyles();
      r.$ensurePagePlayerWaveforms();
      runtimeSaveState();
      r.$showToast(`${HANDLE_LABELS[runtimeState.scrubberHandleShape]} scrub handle enabled`);
    }
  });
  row.append(label, picker.element);
  group.append(row, customRow, svgColorsRow, handleSize.row);
  return group;
}

function createHandleSizeRow(r, initialShape) {
  const row = createElement("div", "hub-player-setting-row hub-handle-size-row");
  const controls = createElement("div", "hub-handle-size-controls");
  const previewSlot = createElement("span", "hub-handle-size-preview");
  const renderPreview = (shape = runtimeState.scrubberHandleShape) => {
    previewSlot.replaceChildren(createHandlePreview(shape));
    previewSlot.style.setProperty("--hub-handle-size-preview-scale", String(normalizeHandleSize(runtimeState.scrubberHandleSize) / 100));
  };
  const update = (nextSize) => {
    runtimeState.scrubberHandleSize = normalizeHandleSize(nextSize);
    previewSlot.style.setProperty("--hub-handle-size-preview-scale", String(runtimeState.scrubberHandleSize / 100));
    r.$syncScrubberStyles();
  };
  const size = createScrubbablePercentage({
    ariaLabel: "Handle size. Double-click to reset to 100%.",
    defaultValue: 100,
    min: 50,
    max: 200,
    step: 5,
    value: normalizeHandleSize(runtimeState.scrubberHandleSize),
    onInput: update,
    onChange: (nextSize) => { update(nextSize); runtimeSaveState(); }
  });
  renderPreview(initialShape);
  controls.append(previewSlot, size);
  const label = createElement("span", "hub-player-setting-label", "Size");
  label.setAttribute("aria-label", "Handle size");
  row.append(label, controls);
  return { row, setShape: renderPreview };
}

function createSvgColorsRow(r) {
  const row = createElement("div", "hub-player-setting-row hub-svg-colors-row hub-settings-dependent-row");
  const key = runtimeState.customScrubberHandle?.png ? "retainPngHandleColors" : "retainSvgHandleColors";
  const enabled = key === "retainPngHandleColors" ? runtimeState[key] !== false : runtimeState[key] === true;
  const toggle = createSettingsToggle({ checked: enabled, ariaLabel: "Retain handle colours" });
  toggle.addEventListener("click", () => {
    runtimeState[key] = !enabled;
    r.$syncScrubberStyles();
    runtimeSaveState();
    r.$render();
  });
  row.append(createElement("span", "hub-player-setting-label", "Retain colours"), toggle);
  return row;
}

function createCustomHandleRow(r) {
  const row = createElement("div", "hub-player-setting-row hub-custom-handle-row hub-settings-dependent-row");
  const label = createElement("span", "hub-player-setting-label", "Artwork");
  label.setAttribute("aria-label", "Custom handle artwork");
  row.append(label);
  const controls = createElement("div", "hub-custom-handle-controls");
  const saved = runtimeState.customScrubberHandle;
  if (saved) {
    const name = createElement("span", "hub-custom-handle-name", saved.name);
    name.dataset.settingsTooltip = saved.name;
    name.tabIndex = 0;
    controls.append(createHandlePreview("custom"), name);
  }
  const { button: upload, input } = createArtworkUpload({
    ariaLabel: "Upload custom SVG or PNG handle",
    title: "Upload an SVG or PNG. Transparent PNGs use the visible icon as the handle shape.",
    onFile: async (file) => {
      runtimeState.customScrubberHandle = await importCustomHandle(file);
      runtimeState.scrubberHandleShape = "custom";
      r.$syncScrubberStyles();
      r.$ensurePagePlayerWaveforms();
      runtimeSaveState();
      r.$render();
      r.$showToast("Custom handle uploaded");
    },
    onError: (error) => r.$showToast(error.message || "Could not load that image.")
  });
  controls.append(upload, input);
  row.append(controls);
  return row;
}
