import { createPlayerSettingRow, createSettingsRow, createSettingsRowCopy, createSettingsToggle } from "./components/settings.js";
import { runtimeSaveState, runtimeState } from "./runtime/context.js";
import { createElement, createPanelCaret } from "./core.js";
import { MUSIC_BAR_STYLES, MUSIC_BAR_VISUALIZER_TYPES, MUSIC_BAR_WIDTHS, PAPER_DEFAULTS, PLAYER_BLEND_MODES, VISUALIZER_BLEND_MODES, normalizeVisualizerType } from "./state.js";
import { createSettingsDisclosure } from "./settings-drawer.js";
import { createSettingsPicker } from "./settings-picker.js";
import { createCustomVisualizerColourSettings } from "./runtime/visualizer-settings.js";
import { syncVisualizerSurface } from "./runtime/visualizer-surface.js";
import { createPlayerColourOverride } from "./player-colour-overrides.js";
import { createBlendModePreview, createCornerStylePreview, createPlayerDesignPreview, createSurfacePreview, createVisualizerStylePreview } from "./settings-option-previews.js";

function blendModeLabel(value) {
  return value.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
}

export function createScrubbablePercentage({ ariaLabel, defaultValue, max, min, onChange, onInput, step, suffix = "%", value }) {
  const control = createElement("div", "hub-scrubbable-percentage");
  const input = createElement("input", "hub-scrubbable-percentage-input");
  input.type = "text";
  input.inputMode = "numeric";
  input.setAttribute("role", "spinbutton");
  input.setAttribute("aria-label", ariaLabel);
  input.setAttribute("aria-valuemin", String(min));
  input.setAttribute("aria-valuemax", String(max));
  const dragHandle = createElement("span", "hub-scrubbable-percentage-handle");
  dragHandle.dataset.settingsTooltip = "Drag horizontally to adjust";
  dragHandle.append(
    createPanelCaret("hub-scrubbable-percentage-chevron is-left"),
    createPanelCaret("hub-scrubbable-percentage-chevron is-right")
  );
  let currentValue = defaultValue;
  let dragStartX = 0;
  let dragStartValue = defaultValue;
  let dragMoved = false;
  let draggingPointerId = null;

  const normalize = (nextValue) => {
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) return currentValue;
    return Math.max(min, Math.min(max, Math.round(numeric / step) * step));
  };
  const setValue = (nextValue, emit = true) => {
    currentValue = normalize(nextValue);
    input.value = `${currentValue}${suffix}`;
    input.setAttribute("aria-valuenow", String(currentValue));
    input.setAttribute("aria-valuetext", `${currentValue}${suffix}`);
    if (emit) onInput?.(currentValue);
  };
  const commit = () => onChange?.(currentValue);
  const commitTypedValue = () => {
    const parsed = Number.parseFloat(input.value.replace(suffix, ""));
    setValue(Number.isFinite(parsed) ? parsed : currentValue);
    commit();
  };

  input.addEventListener("change", commitTypedValue);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTypedValue();
      input.select();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const direction = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
    setValue(currentValue + direction * step);
    commit();
  });
  input.addEventListener("focus", () => input.select());
  input.addEventListener("dblclick", () => {
    setValue(defaultValue);
    commit();
  });
  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStartX = event.clientX;
    dragStartValue = currentValue;
    dragMoved = false;
    draggingPointerId = event.pointerId;
    dragHandle.setPointerCapture(event.pointerId);
    control.classList.add("is-dragging");
  });
  dragHandle.addEventListener("pointermove", (event) => {
    if (draggingPointerId !== event.pointerId) return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) >= 3) dragMoved = true;
    setValue(dragStartValue + Math.round(delta / 5) * step);
  });
  const finishDrag = (event) => {
    if (draggingPointerId !== event.pointerId) return;
    if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
    draggingPointerId = null;
    control.classList.remove("is-dragging");
    if (dragMoved) commit();
  };
  dragHandle.addEventListener("pointerup", finishDrag);
  dragHandle.addEventListener("pointercancel", finishDrag);
  control.append(input, dragHandle);
  setValue(value, false);
  control.setValue = setValue;
  return control;
}

function createScrubbableDimension({ ariaLabel, autoValue, max, min, onChange, onInput, step, value }) {
  const control = createElement("div", "hub-scrubbable-percentage hub-scrubbable-dimension");
  const input = createElement("input", "hub-scrubbable-percentage-input hub-scrubbable-dimension-input");
  input.type = "text";
  input.inputMode = "numeric";
  input.setAttribute("role", "spinbutton");
  input.setAttribute("aria-label", `${ariaLabel}. Double-click to reset to Auto.`);
  input.setAttribute("aria-valuemin", String(min));
  input.setAttribute("aria-valuemax", String(max));
  input.dataset.settingsTooltip = "Enter pixels or double-click to reset to Auto";
  const dragHandle = createElement("span", "hub-scrubbable-percentage-handle");
  dragHandle.dataset.settingsTooltip = "Drag horizontally to adjust";
  dragHandle.append(
    createPanelCaret("hub-scrubbable-percentage-chevron is-left"),
    createPanelCaret("hub-scrubbable-percentage-chevron is-right")
  );
  let currentValue = value === "auto" ? "auto" : Number(value);
  let dragStartX = 0;
  let dragStartValue = min;
  let dragMoved = false;
  let draggingPointerId = null;

  const normalize = (nextValue) => {
    if (nextValue === "auto") return "auto";
    const numeric = Number(nextValue);
    if (!Number.isFinite(numeric)) return currentValue;
    return Math.round(Math.max(min, Math.min(max, numeric)) / step) * step;
  };
  const renderValue = () => {
    const automatic = currentValue === "auto";
    input.value = automatic ? "Auto" : `${currentValue}px`;
    input.classList.toggle("is-auto", automatic);
    input.setAttribute("aria-valuetext", automatic ? "Auto" : `${currentValue} pixels`);
    if (automatic) input.removeAttribute("aria-valuenow");
    else input.setAttribute("aria-valuenow", String(currentValue));
  };
  const setValue = (nextValue, emit = true) => {
    currentValue = normalize(nextValue);
    renderValue();
    if (emit) onInput?.(currentValue);
  };
  const commit = () => onChange?.(currentValue);
  const automaticPixels = () => Math.round(Math.max(min, Math.min(max, Number(autoValue?.()) || min)) / step) * step;
  const commitTypedValue = () => {
    const typed = input.value.trim().toLowerCase();
    const parsed = Number.parseFloat(typed.replace("px", ""));
    setValue(typed === "auto" || typed === "" ? "auto" : Number.isFinite(parsed) ? parsed : currentValue);
    commit();
  };

  input.addEventListener("change", commitTypedValue);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTypedValue();
      input.select();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const direction = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
    setValue((currentValue === "auto" ? automaticPixels() : currentValue) + direction * step);
    commit();
  });
  input.addEventListener("focus", () => input.select());
  input.addEventListener("dblclick", () => {
    setValue("auto");
    commit();
    input.select();
  });
  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragStartX = event.clientX;
    dragStartValue = currentValue === "auto" ? automaticPixels() : currentValue;
    dragMoved = false;
    draggingPointerId = event.pointerId;
    dragHandle.setPointerCapture(event.pointerId);
    control.classList.add("is-dragging");
  });
  dragHandle.addEventListener("pointermove", (event) => {
    if (draggingPointerId !== event.pointerId) return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) >= 3) dragMoved = true;
    setValue(dragStartValue + Math.round(delta / 5) * step);
  });
  const finishDrag = (event) => {
    if (draggingPointerId !== event.pointerId) return;
    if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
    draggingPointerId = null;
    control.classList.remove("is-dragging");
    if (dragMoved) commit();
  };
  dragHandle.addEventListener("pointerup", finishDrag);
  dragHandle.addEventListener("pointercancel", finishDrag);
  control.append(input, dragHandle);
  setValue(value, false);
  return control;
}

export function applyMusicBarStylePreset(r, value) {
  const style = value === "floating" ? "rounded" : MUSIC_BAR_STYLES.includes(value) ? value : "docked";
  runtimeState.musicBarStyle = style;
  runtimeState.musicBarPanelButtons = "compact";
  r.$syncMusicBarStyle();
  r.$syncMusicBarPanelButtons();
}

export function createMusicBarAnalysisSetting(r) {
  const row = createSettingsRow({ className: "hub-analysis-option-row hub-music-bar-analysis-row" });
  const copy = createSettingsRowCopy("Show in music bar", "Add BPM and key beside DJ tools.");
  const shown = runtimeState.showMusicBarAnalysis !== false;
  const toggle = createSettingsToggle({ checked: shown, ariaLabel: "Show BPM and key in music bar", className: "hub-music-bar-analysis-toggle" });
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

export function createPersistentMusicBarAnalysisSetting(r) {
  const row = createSettingsRow({ className: "hub-analysis-option-row hub-persistent-analysis-row" });
  const copy = createSettingsRowCopy("Keep BPM and key visible", "Show track analysis while the rest of the music bar controls stay hidden.");
  const active = runtimeState.keepMusicBarAnalysisVisible === true;
  const toggle = createSettingsToggle({ checked: active, ariaLabel: "Keep BPM and key visible in music bar", className: "hub-persistent-analysis-toggle" });
  toggle.addEventListener("click", () => {
    runtimeState.keepMusicBarAnalysisVisible = runtimeState.keepMusicBarAnalysisVisible !== true;
    r.$syncMusicBarPanelButtons();
    runtimeSaveState();
    r.$renderPlayer();
    r.$showToast(runtimeState.keepMusicBarAnalysisVisible ? "Music bar BPM and key kept visible" : "Music bar BPM and key shown on hover");
  });
  row.append(copy, toggle);
  row.hidden = runtimeState.showMusicBarAnalysis === false;
  return row;
}

export function createVisualizerSettings(r, { standalone = false } = {}) {
  const disclosure = createSettingsDisclosure("Visualiser", "", "player-visualiser");
  const section = disclosure.group;
  section.classList.add("hub-visualizer-settings");
  const selectedType = normalizeVisualizerType(runtimeState.musicBarVisualizerType, runtimeState.musicBarVisualizer);
  runtimeState.musicBarVisualizerType = selectedType;
  const enabled = runtimeState.musicBarVisualizer !== "off";
  const toggle = createSettingsToggle({ checked: enabled, ariaLabel: "Enable music bar visualizer", className: "hub-visualizer-toggle" });
  const enabledControl = createPlayerSettingRow(
    "Enabled",
    "Show a sound-reactive light effect behind the music bar controls.",
    toggle,
    "hub-visualizer-enabled-control"
  );
  const options = disclosure.content;
  options.classList.add("hub-visualizer-options");
  const enabledOptions = createElement("div", "hub-visualizer-enabled-options hub-settings-dependent-options");
  enabledOptions.hidden = !enabled;
  const type = createSettingsPicker({
    ariaLabel: "Visualizer style",
    className: "hub-visualizer-type",
    renderPreview: createVisualizerStylePreview,
    options: [
      { value: "glow", label: "Ambient" }, { value: "spectrum", label: "Spectrum" },
      { value: "grass", label: "Grass" }, { value: "embers", label: "Embers" },
      { value: "contours", label: "Contours" }, { value: "firefly", label: "Firefly" },
      { value: "pixels", label: "Pixels" }, { value: "scanlines", label: "Scanlines" },
      { value: "cross-stitch", label: "Cross-stitch" }, { value: "weave", label: "Weave" },
      { value: "rain", label: "Rain" },
      { value: "constellation", label: "Constellation" }, { value: "terrain", label: "Terrain" },
      { value: "matrix", label: "Matrix" }, { value: "fog", label: "Fog" },
      { value: "warp", label: "Warp" }, { value: "dna", label: "DNA" },
      { value: "glitch", label: "Glitch" }
    ],
    value: selectedType,
    onPreview: (previewType) => {
      // Presentation-only override: hovering must never save a style change.
      r.$visualizerPreviewType = MUSIC_BAR_VISUALIZER_TYPES.includes(previewType) ? previewType : null;
      r.$syncMusicBarVisualizer();
      syncVisualizerSurface(r);
    },
    onChange: (nextType) => {
      runtimeState.musicBarVisualizerType = MUSIC_BAR_VISUALIZER_TYPES.includes(nextType) ? nextType : "glow";
      if (runtimeState.musicBarVisualizer !== "off") runtimeState.musicBarVisualizer = runtimeState.musicBarVisualizerType;
      r.$syncMusicBarVisualizer();
      runtimeSaveState();
      const name = runtimeState.musicBarVisualizerType === "glow" ? "Ambient"
        : runtimeState.musicBarVisualizerType[0].toUpperCase() + runtimeState.musicBarVisualizerType.slice(1);
      r.$showToast(`${name} visualizer selected`);
    }
  });
  const typeControl = createPlayerSettingRow(
    "Style",
    "Choose the visual effect shown behind the music bar controls.",
    type.element,
    "hub-visualizer-type-control"
  );
  const opacity = createScrubbablePercentage({
    ariaLabel: "Visualizer opacity",
    defaultValue: 100,
    max: 400,
    min: 10,
    step: 5,
    value: Number(runtimeState.musicBarVisualizerOpacity) || 100,
    onInput: (nextOpacity) => {
      runtimeState.musicBarVisualizerOpacity = nextOpacity;
      r.$syncMusicBarVisualizer();
    },
    onChange: (nextOpacity) => {
      runtimeSaveState();
      r.$showToast(`Visualizer opacity set to ${nextOpacity}%`);
    }
  });
  const opacityControl = createPlayerSettingRow(
    "Opacity",
    "Set the strength of the visualiser effect, up to 400%. Higher values intensify the light without changing its height.",
    opacity,
    "hub-visualizer-opacity-control"
  );
  const width = createScrubbableDimension({
    ariaLabel: "Visualizer width",
    autoValue: () => r.$playerVisualizer?.getBoundingClientRect().width,
    max: 3200,
    min: 240,
    step: 10,
    value: runtimeState.musicBarVisualizerWidth ?? "auto",
    onInput: (nextWidth) => {
      runtimeState.musicBarVisualizerWidth = nextWidth;
      r.$syncMusicBarVisualizer();
    },
    onChange: (nextWidth) => {
      runtimeSaveState();
      r.$showToast(nextWidth === "auto" ? "Visualizer width reset to Auto" : `Visualizer width set to ${nextWidth}px`);
    }
  });
  const height = createScrubbableDimension({
    ariaLabel: "Visualizer height",
    autoValue: () => r.$playerVisualizer?.getBoundingClientRect().height,
    max: 240,
    min: 24,
    step: 2,
    value: runtimeState.musicBarVisualizerHeight ?? "auto",
    onInput: (nextHeight) => {
      runtimeState.musicBarVisualizerHeight = nextHeight;
      r.$syncMusicBarVisualizer();
    },
    onChange: (nextHeight) => {
      runtimeSaveState();
      r.$showToast(nextHeight === "auto" ? "Visualizer height reset to Auto" : `Visualizer height set to ${nextHeight}px`);
    }
  });
  const widthControl = createPlayerSettingRow(
    "Width",
    "Set the visualiser width in pixels. Double-click the value to return to automatic sizing.",
    width,
    "hub-visualizer-width-control"
  );
  const heightControl = createPlayerSettingRow(
    "Height",
    "Set the visualiser height in pixels. Double-click the value to return to automatic sizing.",
    height,
    "hub-visualizer-height-control"
  );
  const blendModeOptions = VISUALIZER_BLEND_MODES.map((value) => ({
    value,
    label: blendModeLabel(value)
  }));
  const blendMode = createSettingsPicker({
    ariaLabel: "Visualizer blend mode",
    className: "hub-visualizer-blend-mode",
    renderPreview: createBlendModePreview,
    onPreview: (previewMode) => {
      // Temporary presentation only: never change the saved selection.
      for (const property of ["--hub-visualizer-blend-mode", "--hub-spectrum-blend-mode"]) {
        if (VISUALIZER_BLEND_MODES.includes(previewMode)) r.$playerVisualizer?.style.setProperty(property, previewMode);
        else r.$playerVisualizer?.style.removeProperty(property);
      }
      syncVisualizerSurface(r);
    },
    options: blendModeOptions,
    value: VISUALIZER_BLEND_MODES.includes(runtimeState.musicBarVisualizerBlendMode)
      ? runtimeState.musicBarVisualizerBlendMode : "normal",
    onChange: (nextBlendMode, label) => {
      runtimeState.musicBarVisualizerBlendMode = VISUALIZER_BLEND_MODES.includes(nextBlendMode) ? nextBlendMode : "normal";
      r.$syncMusicBarVisualizer();
      runtimeSaveState();
      r.$showToast(`Visualizer blend mode set to ${label}`);
    }
  });
  const blendModeControl = createPlayerSettingRow(
    "Blend mode",
    "Choose how the visualiser colours blend with the page behind the music bar.",
    blendMode.element,
    "hub-visualizer-blend-mode-control"
  );
  const visualizerColours = createCustomVisualizerColourSettings(r, { variant: "player" });
  const colourDescription = visualizerColours.source === "custom"
    ? "Custom"
    : runtimeState.appearance.pageAware ? "Dynamic · follows page" : "Follows theme";
  const colourDisclosure = createSettingsDisclosure("Colour", colourDescription, "player-visualiser-colours");
  colourDisclosure.group.classList.add("hub-visualizer-colour-disclosure", "hub-settings-dependent-row");
  colourDisclosure.content.append(visualizerColours.group);
  enabledOptions.append(
    typeControl,
    colourDisclosure.group,
    opacityControl,
    widthControl,
    heightControl,
    blendModeControl
  );
  options.append(enabledControl, enabledOptions);
  toggle.addEventListener("click", () => {
    const active = runtimeState.musicBarVisualizer === "off";
    runtimeState.musicBarVisualizer = active ? runtimeState.musicBarVisualizerType : "off";
    enabledOptions.hidden = !active;
    toggle.classList.toggle("is-active", active);
    toggle.setAttribute("aria-checked", String(active));
    r.$syncMusicBarVisualizer();
    runtimeSaveState();
    r.$showToast(active ? `${type.label || "Music bar visualizer"} enabled` : "Music bar visualizer disabled");
  });
  if (standalone) {
    options.hidden = false;
    options.removeAttribute("id");
    section.replaceChildren(options);
    section.classList.add("is-standalone");
  }
  return section;
}

function createDynamicColorSetting(r, playerColourRow) {
  const setting = createElement("section", "hub-dynamic-color-setting");
  const options = createElement("div", "hub-dynamic-color-options hub-settings-dependent-options");
  const apply = (message) => {
    r.$syncMusicBarStyle();
    r.$schedulePlayerSectionGeometry();
    runtimeSaveState();
    r.$showToast(message);
  };
  const createToggle = ({ ariaLabel, enabled, onToggle }) => {
    const button = createSettingsToggle({ checked: enabled(), ariaLabel: ariaLabel });
    button.addEventListener("click", () => {
      onToggle();
      button.classList.toggle("is-active", enabled());
      button.setAttribute("aria-checked", String(enabled()));
    });
    return button;
  };
  const masterToggle = createToggle({
    ariaLabel: "Dynamically match player and panel colors to the page",
    enabled: () => runtimeState.musicBarDynamicColor !== false,
    onToggle: () => {
      runtimeState.musicBarDynamicColor = runtimeState.musicBarDynamicColor === false;
      if (runtimeState.musicBarDynamicColor) {
        runtimeState.musicBarPlayerDynamicColor = true;
        runtimeState.musicBarPanelDynamicColor = true;
        for (const toggle of [playerToggle, panelToggle]) {
          toggle.classList.add("is-active");
          toggle.setAttribute("aria-checked", "true");
        }
      }
      options.hidden = runtimeState.musicBarDynamicColor === false;
      playerColourRow.hidden = runtimeState.musicBarDynamicColor !== false;
      apply(runtimeState.musicBarDynamicColor ? "Dynamic color enabled" : "Theme colors enabled");
    }
  });
  masterToggle.classList.add("hub-music-bar-dynamic-color");
  const playerToggle = createToggle({
    ariaLabel: "Dynamically match the player color to the page",
    enabled: () => runtimeState.musicBarPlayerDynamicColor !== false,
    onToggle: () => {
      runtimeState.musicBarPlayerDynamicColor = runtimeState.musicBarPlayerDynamicColor === false;
      apply(runtimeState.musicBarPlayerDynamicColor ? "Dynamic player color enabled" : "Theme player color enabled");
    }
  });
  const panelToggle = createToggle({
    ariaLabel: "Dynamically match the panel color to the page",
    enabled: () => runtimeState.musicBarPanelDynamicColor !== false,
    onToggle: () => {
      runtimeState.musicBarPanelDynamicColor = runtimeState.musicBarPanelDynamicColor === false;
      apply(runtimeState.musicBarPanelDynamicColor ? "Dynamic panel color enabled" : "Theme panel color enabled");
    }
  });
  options.hidden = runtimeState.musicBarDynamicColor === false;
  options.append(
    createPlayerSettingRow("Player", "Match the music bar surface to the Bandcamp section beneath it.", playerToggle),
    createPlayerSettingRow("Panel", "Match the open panel to the player with a readability-safe shade offset.", panelToggle)
  );
  setting.append(createPlayerSettingRow(
    "Dynamic color",
    "Match Bandkit surfaces to the Bandcamp section beneath the music bar.",
    masterToggle,
    "hub-music-bar-dynamic-color-row"
  ), options);
  return setting;
}

function createPlayerBlendModeSetting(r) {
  const picker = createSettingsPicker({
    ariaLabel: "Player blend mode",
    className: "hub-player-blend-mode",
    renderPreview: createBlendModePreview,
    options: PLAYER_BLEND_MODES.map((value) => ({ value, label: blendModeLabel(value) })),
    value: PLAYER_BLEND_MODES.includes(runtimeState.musicBarBlendMode)
      ? runtimeState.musicBarBlendMode : "normal",
    onChange: (nextBlendMode, label) => {
      runtimeState.musicBarBlendMode = PLAYER_BLEND_MODES.includes(nextBlendMode) ? nextBlendMode : "normal";
      r.$syncMusicBarStyle();
      runtimeSaveState();
      r.$showToast(`Player blend mode set to ${label}`);
    }
  });
  return createPlayerSettingRow("Blend mode", "Choose how the complete music bar surface blends with the Bandcamp page.", picker.element, "hub-player-blend-mode-control");
}

export function createFrostedGlassSetting(r, { showBlendMode = false } = {}) {
  const setting = createElement("section", "hub-glass-settings hub-settings-group");
  const row = createSettingsRow({ className: "hub-glass-row" });
  const copy = createSettingsRowCopy("Surface", "Choose Solid, translucent Glass, or opaque textured Paper for the music bar and panels.");
  const enabled = runtimeState.appearance.frostedGlass === true;
  const blendMode = showBlendMode ? createPlayerBlendModeSetting(r) : null;
  if (blendMode) blendMode.hidden = !enabled;
  const appearanceMode = createSettingsPicker({
    ariaLabel: "Music bar and panel surface",
    className: "hub-surface-picker",
    renderPreview: createSurfacePreview,
    options: [{ value: "solid", label: "Solid" }, { value: "glass", label: "Glass" }, { value: "paper", label: "Paper" }],
    value: enabled ? "glass" : runtimeState.appearance.paperTexture ? "paper" : "solid",
    onChange: (mode) => setAppearanceMode(mode)
  });

  const controls = createElement("div", "hub-glass-controls hub-settings-dependent-options");
  controls.hidden = !enabled;
  const transparency = createScrubbablePercentage({
    ariaLabel: "Frosted glass transparency",
    defaultValue: 20,
    max: 70,
    min: 0,
    step: 5,
    value: runtimeState.appearance.glassTransparency,
    onInput: (nextValue) => {
      runtimeState.appearance.glassTransparency = nextValue;
      r.$syncFrostedGlass();
    },
    onChange: (nextValue) => {
      runtimeSaveState();
      r.$showToast(`Glass transparency set to ${nextValue}%`);
    }
  });
  const blur = createScrubbablePercentage({
    ariaLabel: "Frosted glass blur",
    defaultValue: 20,
    max: 30,
    min: 0,
    step: 1,
    suffix: "px",
    value: runtimeState.appearance.glassBlur,
    onInput: (nextValue) => {
      runtimeState.appearance.glassBlur = nextValue;
      r.$syncFrostedGlass();
    },
    onChange: (nextValue) => {
      runtimeSaveState();
      r.$showToast(`Glass blur set to ${nextValue}px`);
    }
  });
  controls.append(
    createPlayerSettingRow("Transparency", "Set how much of the page shows through glass surfaces. Double-click to reset.", transparency),
    createPlayerSettingRow("Blur", "Set the softness behind glass surfaces. Double-click to reset.", blur)
  );

  const setAppearanceMode = (mode) => {
    const active = mode === "glass";
    runtimeState.appearance.frostedGlass = active;
    runtimeState.appearance.paperTexture = mode === "paper";
    paperControls.hidden = mode !== "paper";
    controls.hidden = !active;
    if (blendMode) blendMode.hidden = !active;
    r.$syncFrostedGlass();
    runtimeSaveState();
    r.$schedulePlayerSectionGeometry();
    r.$showToast(`${mode === "paper" ? "Paper" : active ? "Glass" : "Solid"} surfaces enabled`);
  };
  const paperStrength = (key, ariaLabel) => createScrubbablePercentage({
    ariaLabel, min: 0, max: 100, step: 5, defaultValue: PAPER_DEFAULTS[key],
    value: runtimeState.appearance[key] ?? runtimeState.appearance.paperTextureStrength ?? PAPER_DEFAULTS[key],
    onInput: value => {
      // Preserve legacy combined settings before changing the grain value.
      runtimeState.appearance.paperFibreStrength ??= runtimeState.appearance.paperTextureStrength ?? PAPER_DEFAULTS.paperFibreStrength;
      runtimeState.appearance.paperMottleStrength ??= runtimeState.appearance.paperTextureStrength ?? PAPER_DEFAULTS.paperMottleStrength;
      runtimeState.appearance[key] = value;
      r.$syncFrostedGlass();
      r.$schedulePlayerSectionGeometry();
    },
    onChange: () => runtimeSaveState()
  });
  const grainSize = createScrubbablePercentage({
    ariaLabel: "Paper grain size", min: 25, max: 400, step: 5, defaultValue: PAPER_DEFAULTS.paperGrainSize,
    value: runtimeState.appearance.paperGrainSize ?? PAPER_DEFAULTS.paperGrainSize,
    onInput: value => { runtimeState.appearance.paperGrainSize = value; r.$syncFrostedGlass(); r.$schedulePlayerSectionGeometry(); },
    onChange: () => runtimeSaveState()
  });
  const paperControls = createElement("div", "hub-paper-controls hub-settings-dependent-options");
  paperControls.append(
    createPlayerSettingRow("Grain", "Adjust the fine surface grain. Set to 0% to remove it. Double-click to reset.", paperStrength("paperTextureStrength", "Paper grain strength")),
    createPlayerSettingRow("Fibres", "Adjust the small paper fibres and their subtle relief. Set to 0% to remove them. Double-click to reset.", paperStrength("paperFibreStrength", "Paper fibre strength")),
    createPlayerSettingRow("Mottling", "Adjust the broad, soft variations in the paper. Set to 0% to remove them. Double-click to reset.", paperStrength("paperMottleStrength", "Paper mottling strength")),
    createPlayerSettingRow("Grain size", "Scale the paper fibres and mottling while keeping fine surface detail crisp. Double-click to reset to 240%.", grainSize)
  );
  paperControls.hidden = enabled || !runtimeState.appearance.paperTexture;
  row.append(copy, appearanceMode.element);
  setting.append(row, controls, paperControls);
  if (blendMode) setting.append(blendMode);
  return setting;
}

export function createCornerStyleSetting(r) {
  const setting = createElement("section", "hub-corner-settings hub-settings-group");
  const row = createSettingsRow({ className: "hub-corner-style-row" });
  const copy = createSettingsRowCopy("Corners", "Set the rounding used across Bandkit’s pages, music bar and panels.");
  const currentStyle = ["rounded", "square", "custom"].includes(runtimeState.appearance.cornerStyle)
    ? runtimeState.appearance.cornerStyle
    : "rounded";
  const styleLabels = { rounded: "Rounded", square: "Square", custom: "Custom" };
  const styleControl = createSettingsPicker({
    ariaLabel: "Bandkit interface corner style",
    className: "hub-corner-style-picker",
    renderPreview: createCornerStylePreview,
    options: Object.entries(styleLabels).map(([value, label]) => ({ value, label })),
    value: currentStyle,
    onChange: (mode) => setCornerStyle(mode)
  });
  row.append(copy, styleControl.element);

  const controls = createElement("div", "hub-corner-controls hub-settings-dependent-options");
  controls.hidden = currentStyle !== "custom";
  const radius = createScrubbablePercentage({
    ariaLabel: "Custom corner radius",
    defaultValue: 12,
    max: 32,
    min: 0,
    step: 1,
    suffix: "px",
    value: Math.max(0, Math.min(32, Number(runtimeState.appearance.customCornerRadius) || 0)),
    onInput: (nextRadius) => {
      runtimeState.appearance.customCornerRadius = nextRadius;
      r.$syncCornerStyle();
      r.$syncScrubberStyles();
    },
    onChange: (nextRadius) => {
      runtimeSaveState();
      r.$showToast(`Custom corner radius set to ${nextRadius}px`);
    }
  });
  controls.append(createPlayerSettingRow(
    "Corner radius",
    "Set interface rounding in pixels. Double-click to reset to 12 px.",
    radius,
    "hub-corner-radius-control"
  ));

  const setCornerStyle = (mode) => {
    runtimeState.appearance.cornerStyle = ["square", "custom"].includes(mode) ? mode : "rounded";
    controls.hidden = runtimeState.appearance.cornerStyle !== "custom";
    r.$syncCornerStyle();
    r.$syncScrubberStyles();
    runtimeSaveState();
    r.$showToast(`${styleLabels[runtimeState.appearance.cornerStyle]} corners enabled`);
  };
  setting.append(row, controls);
  return setting;
}

export function createMusicBarSettings(r) {
  const styleSettings = createElement("div", "hub-player-settings-fields hub-music-bar-style-settings");
  const sizeSettings = createElement("div", "hub-player-settings-fields hub-music-bar-size-settings");
  const musicBarStyle = createSettingsPicker({
    ariaLabel: "Music bar style",
    className: "hub-player-design-picker",
    renderPreview: createPlayerDesignPreview,
    options: [{ value: "docked", label: "Dock" }, { value: "zune", label: "Fade" }, { value: "rounded", label: "Float" }],
    value: runtimeState.musicBarStyle,
    onChange: (nextStyle, label) => {
      applyMusicBarStylePreset(r, nextStyle);
      r.$renderPlayer();
      runtimeSaveState();
      r.$showToast(`${label} music bar enabled`);
    }
  });

  const musicBarSize = createSettingsPicker({
    ariaLabel: "Music bar size",
    options: [{ value: "compact", label: "Compact" }, { value: "standard", label: "Standard" }],
    value: runtimeState.musicBarSize,
    onChange: (nextSize, label) => {
      runtimeState.musicBarSize = nextSize === "compact" ? "compact" : "standard";
      r.$syncMusicBarSize();
      r.$renderPlayer();
      runtimeSaveState();
      r.$showToast(`${label} music bar enabled`);
    }
  });

  const musicBarWidth = createSettingsPicker({
    ariaLabel: "Music bar width",
    options: [
      { value: "default", label: "Default (800 px)" },
      { value: "tight", label: "Tight (640 px)" },
      { value: "wide", label: "Wide (1120 px)" },
      { value: "full", label: "Full width" },
      { value: "custom", label: "Custom" }
    ],
    value: runtimeState.musicBarWidth,
    onChange: (nextWidth, label) => {
      runtimeState.musicBarWidth = MUSIC_BAR_WIDTHS.includes(nextWidth) ? nextWidth : "default";
      syncCustomWidthVisibility();
      r.$syncMusicBarWidth();
      r.$renderPlayer();
      runtimeSaveState();
      r.$showToast(`${label} music bar width enabled`);
    }
  });
  const customMusicBarWidth = createScrubbablePercentage({
    ariaLabel: "Custom music bar width",
    defaultValue: 800,
    max: 2000,
    min: 480,
    step: 10,
    suffix: "px",
    value: runtimeState.musicBarCustomWidth,
    onInput: (nextWidth) => {
      runtimeState.musicBarCustomWidth = nextWidth;
      r.$syncMusicBarWidth();
    },
    onChange: (nextWidth) => {
      runtimeSaveState();
      r.$showToast(`Custom music bar width set to ${nextWidth}px`);
    }
  });
  const customMusicBarWidthRow = createPlayerSettingRow(
    "Custom",
    "Set the music bar width in pixels. Double-click to reset to 800 px.",
    customMusicBarWidth,
    "hub-music-bar-custom-width-row hub-settings-dependent-row"
  );
  const syncCustomWidthVisibility = () => {
    const custom = musicBarWidth.value === "custom";
    customMusicBarWidthRow.hidden = !custom;
  };
  syncCustomWidthVisibility();
  // Dragging the music bar's edge handles switches the width to Custom. Keep
  // the open settings page showing that, so its Custom row is available rather
  // than staying hidden behind a stale Default.
  r.$syncMusicBarWidthSetting = () => {
    musicBarWidth.setValue(runtimeState.musicBarWidth, false);
    customMusicBarWidth.setValue?.(runtimeState.musicBarCustomWidth, false);
    syncCustomWidthVisibility();
  };

  const playerHeight = createScrubbablePercentage({
    ariaLabel: "Player height above the bottom of the page",
    defaultValue: 0,
    max: 160,
    min: 0,
    step: 4,
    suffix: "px",
    value: runtimeState.musicBarBottomOffset,
    onInput: (nextValue) => {
      runtimeState.musicBarBottomOffset = nextValue;
      r.$syncMusicBarSize();
    },
    onChange: (nextValue) => {
      runtimeSaveState();
      r.$showToast(nextValue ? `Player raised ${nextValue}px` : "Player height reset");
    }
  });

  const playerColourRow = createPlayerColourOverride(r, {
    className: "hub-music-bar-player-colour-row",
    key: "musicBarPlayerColor",
    label: "Player colour",
    source: "surface",
    tooltip: "Override the music bar surface while dynamic colour is off, or reset it to the active theme.",
    sync: () => r.$syncMusicBarStyle()
  });
  playerColourRow.hidden = runtimeState.musicBarDynamicColor !== false;
  playerColourRow.classList.add("hub-settings-dependent-row");

  styleSettings.append(
    createPlayerSettingRow("Style", "Choose the overall music bar layout.", musicBarStyle.element),
    createDynamicColorSetting(r, playerColourRow),
    playerColourRow
  );
  sizeSettings.append(
    createPlayerSettingRow("Size", "Choose the music bar's vertical size.", musicBarSize.element),
    createPlayerSettingRow("Width", "Choose how much horizontal space the music bar uses.", musicBarWidth.element),
    customMusicBarWidthRow,
    createPlayerSettingRow("Height", "Set how far the player sits above the bottom of the page. Double-click to reset.", playerHeight)
  );
  return { styleSettings, sizeSettings };
}
