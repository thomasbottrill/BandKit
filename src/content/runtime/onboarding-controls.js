import { attachMenuKeyNavigation, attachMenuTriggerKeyNavigation } from "../menu-keyboard.js";
import { runtimeSaveState, runtimeState } from "./context.js";
import { createElement, createPanelCaret } from "../core.js";
import { colorString, hexColor, luminance, parseColor, readableColor } from "../color.js";
import { BUILT_IN_THEMES, MUSIC_BAR_STYLES, SCRUBBER_HANDLE_SHAPES } from "../state.js";
import { scrubberHandleMask, setHandleImageStyles } from "../custom-scrub-handle.js";
import { applyMusicBarStylePreset } from "../music-bar-settings.js";
import { TIMELINE_STYLES, normalizeTimelineStyle, createTimelinePreview } from "../timeline-styles.js";
import { createPlayerDesignPreview, createSurfacePreview } from "../settings-option-previews.js";
import { applyVisualTheme, captureVisualTheme, DEFAULT_VISUAL_THEME, VISUAL_THEMES } from "../visual-themes.js";
import { createDynamicThemeInfo } from "../theme-option-markers.js";
import { DOWNLOAD_FORMATS, normalizeDownloadFormat } from "../../shared/download-formats.js";

import { createScaleSettings } from "./scale-settings.js";
import { applyScales } from "./scaling.js";

const HANDLE_LABELS = Object.freeze({
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
});

export const ONBOARDING_MENU_KEYS = Object.freeze([
  "$onboardingHandleMenu", "$onboardingTimelineMenu",
  "$onboardingPlayerStyleMenu", "$onboardingSurfaceMenu", "$onboardingThemeMenu", "$onboardingPaletteMenu",
  "$onboardingDownloadFormatMenu", "$onboardingPageScaleMenu", "$onboardingInterfaceScaleMenu"
]);

export function removeOnboardingMenus(r) {
  for (const key of ONBOARDING_MENU_KEYS) {
    r[key]?.remove();
    r[key] = null;
  }
  r.$visualizerPreviewType = null;
}

function positionOnboardingMenu(trigger, options, minimumWidth = 220) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.max(minimumWidth, rect.width);
  options.style.width = `${Math.round(width)}px`;
  options.style.left = `${Math.round(Math.max(12, Math.min(window.innerWidth - width - 12, rect.left)))}px`;
  options.style.top = "auto";
  options.style.bottom = `${Math.round(window.innerHeight - rect.top + 5)}px`;
  options.style.maxHeight = `${Math.min(320, Math.max(160, Math.floor(rect.top - 17)))}px`;
}

export function syncOnboardingContrast(r) {
  const playerStyle = getComputedStyle(r.$player);
  const fallbackPanel = { r: 255, g: 255, b: 255, a: 1 };
  const panelValue = playerStyle.getPropertyValue("--hub-panel").trim();
  const panel = parseColor(panelValue) || hexColor(panelValue, fallbackPanel);
  const lightCoachmark = luminance(panel) < 0.34;
  const surface = lightCoachmark
    ? { r: 250, g: 248, b: 243, a: 1 }
    : { r: 25, g: 27, b: 32, a: 1 };
  const ink = lightCoachmark
    ? { r: 24, g: 27, b: 31, a: 1 }
    : { r: 247, g: 247, b: 244, a: 1 };
  const muted = lightCoachmark
    ? { r: 88, g: 94, b: 101, a: 1 }
    : { r: 194, g: 199, b: 207, a: 1 };
  const accentValue = playerStyle.getPropertyValue("--hub-accent").trim();
  const accent = readableColor(parseColor(accentValue) || hexColor(accentValue, ink), [surface], 4.5).color;
  const onAccent = luminance(accent) < 0.34
    ? { r: 255, g: 255, b: 255, a: 1 }
    : { r: 17, g: 24, b: 39, a: 1 };
  const values = {
    "--hub-panel": colorString(surface),
    "--hub-card": colorString(surface),
    "--hub-ink": colorString(ink),
    "--hub-muted": colorString(muted),
    "--hub-faint": colorString(muted, 0.72),
    "--hub-line": colorString(ink, 0.22),
    "--hub-accent": colorString(accent),
    "--hub-card-accent": colorString(accent),
    "--hub-card-ink": colorString(ink),
    "--hub-card-muted": colorString(muted),
    "--hub-card-faint": colorString(muted, 0.72),
    "--hub-card-line": colorString(ink, 0.22),
    "--hub-card-on-accent": colorString(onAccent),
    "--hub-accent-soft": colorString(accent, 0.12),
    "--hub-card-accent-soft": colorString(accent, 0.12),
    "--hub-on-accent": colorString(onAccent),
    "--hub-onboarding-bandcamp": colorString(accent)
  };
  for (const [name, value] of Object.entries(values)) r.$onboardingLayer.style.setProperty(name, value);
  r.$onboardingLayer.dataset.scheme = lightCoachmark ? "light" : "dark";
}

function createOnboardingPicker(r, rerender, {
  label, value, options: definitions, menuKey, className = "", renderPreview, renderTrailing, onPreview, onRestore, onChange
}) {
  let committedValue = value;
  let previewing = false;
  const selected = definitions.find((option) => option.value === value) || definitions[0];
  const trigger = createElement("button", `hub-onboarding-kit-picker-selection${className ? ` ${className}` : ""}`);
  trigger.type = "button";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", `${label}: ${selected.label}`);
  const copy = createElement("span", "hub-onboarding-kit-picker-selection-copy");
  const valueWrap = createElement("span", "hub-onboarding-kit-selection-value");
  if (renderPreview) valueWrap.append(renderPreview(selected.value));
  valueWrap.append(createElement("strong", "", selected.label));
  copy.append(createElement("span", "", label), valueWrap);
  trigger.append(copy, createPanelCaret("hub-theme-combobox-chevron"));

  const menu = createElement("div", "hub-onboarding-picker-options");
  menu.id = `hub-onboarding-${menuKey}-options`;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);
  const restore = () => {
    if (!previewing) return;
    previewing = false;
    onRestore?.(committedValue);
  };
  const preview = (nextValue) => {
    previewing = true;
    onPreview?.(nextValue, committedValue);
  };
  for (const definition of definitions) {
    const option = createElement("button", `hub-onboarding-picker-option${definition.value === value ? " is-selected" : ""}`);
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(definition.value === value));
    if (renderPreview) option.append(renderPreview(definition.value));
    option.append(createElement("span", "hub-onboarding-picker-option-label", definition.label));
    const trailing = renderTrailing?.(definition.value);
    if (trailing) {
      option.append(trailing);
      option.classList.add("has-option-trailing");
    }
    option.addEventListener("pointerenter", () => preview(definition.value));
    option.addEventListener("focus", () => preview(definition.value));
    option.addEventListener("pointerleave", restore);
    option.addEventListener("click", () => {
      restore();
      committedValue = definition.value;
      onChange(definition.value);
      menu.remove();
      r[menuKey] = null;
      rerender();
    });
    menu.append(option);
  }
  const close = () => {
    restore();
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
  };
  trigger.addEventListener("click", () => {
    if (!menu.hidden) { close(); return; }
    positionOnboardingMenu(trigger, menu);
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
  });
  const handleFocusOut = () => window.setTimeout(() => {
    const active = r.$shadow.activeElement;
    if (active !== trigger && !menu.contains(active)) close();
  }, 0);
  trigger.addEventListener("focusout", handleFocusOut);
  menu.addEventListener("focusout", handleFocusOut);
  attachMenuKeyNavigation(menu, { onEscape: () => { close(); trigger.focus(); } });
  attachMenuTriggerKeyNavigation(trigger, menu);
  r[menuKey]?.remove();
  r[menuKey] = menu;
  r.$onboardingLayer.append(menu);
  return trigger;
}

function createOnboardingHandlePreview(shape) {
  const rounded = runtimeState.appearance.cornerStyle !== "square"
    && !(runtimeState.appearance.cornerStyle === "custom" && Number(runtimeState.appearance.customCornerRadius) <= 0);
  const preview = createElement("span", "hub-scrub-handle-preview");
  preview.dataset.shape = shape;
  setHandleImageStyles(preview.style, "--hub-scrub-handle-option", shape, runtimeState.customScrubberHandle, runtimeState.retainSvgHandleColors, runtimeState.retainPngHandleColors);
  preview.style.setProperty("--hub-scrub-handle-option-mask", scrubberHandleMask(shape, rounded, runtimeState.customScrubberHandle));
  preview.setAttribute("aria-hidden", "true");
  return preview;
}

function createOnboardingHandlePicker(r, rerender) {
  let selected = SCRUBBER_HANDLE_SHAPES.includes(runtimeState.scrubberHandleShape) && runtimeState.scrubberHandleShape !== "custom"
    ? runtimeState.scrubberHandleShape : "pill";
  const trigger = createElement("button", "hub-onboarding-kit-handle-selection");
  trigger.type = "button";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", `Handle: ${HANDLE_LABELS[selected]}`);
  const copy = createElement("span", "hub-onboarding-kit-handle-selection-copy");
  const valueWrap = createElement("span", "hub-onboarding-kit-selection-value");
  valueWrap.append(createOnboardingHandlePreview(selected), createElement("strong", "", HANDLE_LABELS[selected]));
  copy.append(createElement("span", "", "Handle"), valueWrap);
  trigger.append(copy, createPanelCaret("hub-theme-combobox-chevron"));

  const options = createElement("div", "hub-onboarding-handle-options");
  options.id = "hub-onboarding-handle-options";
  options.setAttribute("role", "listbox");
  options.hidden = true;
  trigger.setAttribute("aria-controls", options.id);
  for (const shape of SCRUBBER_HANDLE_SHAPES.filter((value) => value !== "custom")) {
    const option = createElement("button", `hub-onboarding-handle-option${shape === selected ? " is-selected" : ""}`);
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(shape === selected));
    option.append(
      createOnboardingHandlePreview(shape),
      createElement("span", "hub-onboarding-handle-option-label", HANDLE_LABELS[shape])
    );
    const preview = () => {
      runtimeState.scrubberHandleShape = shape;
      r.$syncScrubberStyles?.();
    };
    const restore = () => {
      runtimeState.scrubberHandleShape = selected;
      r.$syncScrubberStyles?.();
    };
    option.addEventListener("pointerenter", preview);
    option.addEventListener("focus", preview);
    option.addEventListener("pointerleave", restore);
    option.addEventListener("click", () => {
      selected = shape;
      runtimeState.scrubberHandleShape = shape;
      options.remove();
      r.$onboardingHandleMenu = null;
      rerender();
    });
    options.append(option);
  }
  const close = () => {
    runtimeState.scrubberHandleShape = selected;
    r.$syncScrubberStyles?.();
    options.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
  };
  trigger.addEventListener("click", () => {
    const opening = options.hidden;
    if (!opening) { close(); return; }
    positionOnboardingMenu(trigger, options);
    options.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
  });
  const handleFocusOut = () => window.setTimeout(() => {
    const active = r.$shadow.activeElement;
    if (active !== trigger && !options.contains(active)) close();
  }, 0);
  trigger.addEventListener("focusout", handleFocusOut);
  options.addEventListener("focusout", handleFocusOut);
  attachMenuKeyNavigation(options, { onEscape: () => { close(); trigger.focus(); } });
  attachMenuTriggerKeyNavigation(trigger, options);
  r.$onboardingHandleMenu?.remove();
  r.$onboardingHandleMenu = options;
  r.$onboardingLayer.append(options);
  return trigger;
}

function createOnboardingTimelinePicker(r, rerender) {
  const selected = normalizeTimelineStyle(runtimeState.scrubberStyle);
  return createOnboardingPicker(r, rerender, {
    label: "Timeline",
    value: selected,
    options: TIMELINE_STYLES,
    menuKey: "$onboardingTimelineMenu",
    className: "hub-onboarding-kit-timeline-selection",
    renderPreview: createTimelinePreview,
    onPreview: (value) => { runtimeState.scrubberStyle = value; r.$syncScrubberStyles?.(); },
    onRestore: (value) => { runtimeState.scrubberStyle = value; r.$syncScrubberStyles?.(); },
    onChange: (value) => { runtimeState.scrubberStyle = value; r.$syncScrubberStyles?.(); }
  });
}

function createOnboardingPlayerStylePicker(r, rerender) {
  const selected = runtimeState.musicBarStyle === "floating" ? "rounded"
    : MUSIC_BAR_STYLES.includes(runtimeState.musicBarStyle) ? runtimeState.musicBarStyle : "zune";
  return createOnboardingPicker(r, rerender, {
    label: "Style",
    value: selected,
    options: [
      { value: "docked", label: "Dock" },
      { value: "zune", label: "Fade" },
      { value: "rounded", label: "Float" }
    ],
    menuKey: "$onboardingPlayerStyleMenu",
    className: "hub-onboarding-kit-player-style-selection",
    renderPreview: createPlayerDesignPreview,
    onPreview: (value) => { applyMusicBarStylePreset(r, value); r.$renderPlayer?.(); },
    onRestore: (value) => { applyMusicBarStylePreset(r, value); r.$renderPlayer?.(); },
    onChange: (value) => { applyMusicBarStylePreset(r, value); r.$renderPlayer?.(); }
  });
}

function createOnboardingSurfacePicker(r, rerender) {
  const committed = runtimeState.appearance.frostedGlass === true ? "glass" : runtimeState.appearance.paperTexture ? "paper" : "solid";
  const apply = (value) => {
    runtimeState.appearance.frostedGlass = value === "glass";
    runtimeState.appearance.paperTexture = value === "paper";
    r.$syncFrostedGlass?.();
  };
  return createOnboardingPicker(r, rerender, {
    label: "Surface",
    value: committed,
    options: [{ value: "solid", label: "Solid" }, { value: "glass", label: "Glass" }, { value: "paper", label: "Paper" }],
    menuKey: "$onboardingSurfaceMenu",
    className: "hub-onboarding-kit-surface-selection",
    renderPreview: createSurfacePreview,
    onPreview: apply,
    onRestore: apply,
    onChange: apply
  });
}

function syncOnboardingVisualTheme(r) {
  r.$spectrumColourCache = null;
  r.$applyAppearance?.();
  r.$syncScrubberStyles?.();
  r.$syncMusicBarStyle?.();
  r.$syncMusicBarPanelButtons?.();
  r.$syncMusicBarSize?.();
  r.$syncMusicBarVisualizer?.();
  r.$syncMusicBarWidth?.();
  r.$syncFrostedGlass?.();
  r.$syncCornerStyle?.();
  r.$refreshScrubWaveform?.(true);
  r.$renderPlayer?.();
  syncOnboardingContrast(r);
}

function createOnboardingThemePreview(theme) {
  const palette = createElement("span", "hub-theme-option-palette hub-onboarding-theme-palette");
  palette.setAttribute("aria-hidden", "true");
  for (const key of ["customAccent", "customPageBackground", "customPageSurface", "customText"]) {
    const swatch = createElement("span", "hub-theme-option-swatch");
    swatch.style.backgroundColor = theme?.appearance?.[key] || "transparent";
    palette.append(swatch);
  }
  return palette;
}

function createOnboardingThemePicker(r, rerender) {
  const themes = [DEFAULT_VISUAL_THEME, ...VISUAL_THEMES];
  const selectedId = themes.some(theme => theme.id === runtimeState.appearance.visualThemeId)
    ? runtimeState.appearance.visualThemeId : "dynamic";
  let previewSnapshot = null;
  const apply = (id) => {
    const theme = themes.find(item => item.id === id) || DEFAULT_VISUAL_THEME;
    applyVisualTheme(runtimeState, theme);
    syncOnboardingVisualTheme(r);
  };
  const restore = () => {
    if (!previewSnapshot) return;
    applyVisualTheme(runtimeState, previewSnapshot);
    previewSnapshot = null;
    syncOnboardingVisualTheme(r);
  };
  return createOnboardingPicker(r, rerender, {
    label: "Theme",
    value: selectedId,
    options: themes.map(theme => ({ value: theme.id, label: theme.label })),
    menuKey: "$onboardingThemeMenu",
    className: "hub-onboarding-kit-theme-selection",
    renderPreview: id => createOnboardingThemePreview(themes.find(theme => theme.id === id)),
    renderTrailing: id => id === "dynamic" ? createDynamicThemeInfo() : null,
    onPreview: (id) => {
      previewSnapshot ??= captureVisualTheme(runtimeState);
      apply(id);
    },
    onRestore: restore,
    onChange: (id) => {
      previewSnapshot = null;
      apply(id);
      runtimeState.appearance.visualThemeId = id;
    }
  });
}

function onboardingPaletteValues(palette) {
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

function currentOnboardingPalette() {
  const appearance = runtimeState.appearance;
  return {
    id: "current",
    label: "Current",
    accent: appearance.customAccent,
    scrubAccent: appearance.customScrubAccent,
    surface: appearance.customSurface,
    card: appearance.customCard,
    background: appearance.customPageBackground,
    pageSurface: appearance.customPageSurface,
    navbar: appearance.customNavbar,
    text: appearance.customText,
    secondaryText: appearance.customSecondaryText,
    visualizerColors: [appearance.customVisualizerColor1, appearance.customVisualizerColor2, appearance.customVisualizerColor3]
  };
}

function createOnboardingPalettePicker(r, rerender) {
  const appearance = runtimeState.appearance;
  const palettes = [...BUILT_IN_THEMES, ...(appearance.savedThemes || [])];
  const current = currentOnboardingPalette();
  const hasPreset = palettes.some(palette => palette.id === appearance.preset);
  const selectedId = appearance.pageAware ? "dynamic" : hasPreset ? appearance.preset : "current";
  const definitions = [
    { value: "dynamic", label: "Dynamic" },
    ...(selectedId === "current" ? [{ value: "current", label: "Current" }] : []),
    ...palettes.map(palette => ({ value: palette.id, label: palette.label }))
  ];
  let previewSnapshot = null;
  const paletteFor = id => id === "current" ? current : palettes.find(palette => palette.id === id);
  const apply = (id) => {
    if (id === "dynamic") Object.assign(appearance, { pageAware: true, applyToPage: false });
    else {
      const palette = paletteFor(id);
      if (!palette) return;
      Object.assign(appearance, {
        pageAware: false,
        applyToPage: true,
        preset: id === "current" ? "custom" : id,
        visualizerColourSource: "theme"
      }, onboardingPaletteValues(palette));
    }
    syncOnboardingVisualTheme(r);
  };
  const restore = () => {
    if (!previewSnapshot) return;
    Object.assign(appearance, previewSnapshot);
    previewSnapshot = null;
    syncOnboardingVisualTheme(r);
  };
  return createOnboardingPicker(r, rerender, {
    label: "Palette",
    value: selectedId,
    options: definitions,
    menuKey: "$onboardingPaletteMenu",
    className: "hub-onboarding-kit-palette-selection",
    renderPreview: id => id === "dynamic"
      ? createOnboardingThemePreview(DEFAULT_VISUAL_THEME)
      : createOnboardingThemePreview({ appearance: onboardingPaletteValues(paletteFor(id) || current) }),
    renderTrailing: id => id === "dynamic" ? createDynamicThemeInfo() : null,
    onPreview: (id) => {
      previewSnapshot ??= structuredClone(appearance);
      apply(id);
    },
    onRestore: restore,
    onChange: (id) => {
      previewSnapshot = null;
      apply(id);
    }
  });
}

function createOnboardingModeSwitch(r, mode) {
  const tabs = createElement("div", "hub-onboarding-kit-mode");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Appearance setup");
  for (const [value, label] of [["theme", "Theme"], ["custom", "Custom"]]) {
    const tab = createElement("button", `hub-onboarding-kit-mode-option${mode === value ? " is-selected" : ""}`, label);
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(mode === value));
    tab.addEventListener("click", () => {
      if (r.$onboardingKitMode === value) return;
      removeOnboardingMenus(r);
      r.$onboardingKitMode = value;
      r.$render();
    });
    tabs.append(tab);
  }
  return tabs;
}

export function createDownloadFormatControl(r) {
  return createOnboardingPicker(r, () => r.$render(), {
    label: "Download format",
    value: normalizeDownloadFormat(runtimeState.downloadFormat),
    options: DOWNLOAD_FORMATS.map((format) => ({ value: format.id, label: format.label })),
    menuKey: "$onboardingDownloadFormatMenu",
    onChange: (value) => {
      runtimeState.downloadFormat = normalizeDownloadFormat(value);
      runtimeSaveState();
    }
  });
}

// Page and interface scale with the tour's dropdown. Pointing at an option
// previews it on the real page and player, like the theme picker.
export function createOnboardingScaleSettings(r, { pages = true } = {}) {
  const key = pages ? "pageScale" : "interfaceScale";
  return createScaleSettings(r, {
    pages,
    onboarding: true,
    picker: ({ label, options, value, onChange }) => createOnboardingPicker(r, () => r.$render(), {
      label,
      value,
      options,
      menuKey: pages ? "$onboardingPageScaleMenu" : "$onboardingInterfaceScaleMenu",
      onPreview: (preset) => { runtimeState.appearance[key].preset = preset; applyScales(r); },
      onRestore: (preset) => { runtimeState.appearance[key].preset = preset; applyScales(r); },
      onChange
    })
  });
}

export function createKitControls(r) {
  const config = createElement("div", "hub-onboarding-kit-config");
  const mode = r.$onboardingKitMode === "custom" ? "custom" : "theme";
  const content = createElement("div", "hub-onboarding-kit-mode-content");
  content.setAttribute("role", "tabpanel");
  const rerender = () => {
    r.$applyAppearance?.();
    runtimeSaveState();
    r.$render();
  };
  const choice = (label, value, onClick) => {
    const button = createElement("button", "hub-onboarding-kit-choice");
    button.type = "button";
    button.setAttribute("aria-label", `${label}: ${value}`);
    const copy = createElement("span", "hub-onboarding-kit-choice-copy");
    copy.append(createElement("span", "", label), createElement("strong", "", value));
    button.append(copy);
    button.addEventListener("click", () => { onClick(); rerender(); });
    return button;
  };
  const toggle = (label, enabled, onClick) => {
    const button = choice(label, enabled ? "On" : "Off", onClick);
    button.classList.toggle("is-active", enabled);
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", String(enabled));
    return button;
  };
  if (mode === "theme") {
    content.classList.add("is-theme");
    content.append(createOnboardingThemePicker(r, rerender));
  } else {
    const grid = createElement("div", "hub-onboarding-kit-controls");
    grid.append(
      createOnboardingPlayerStylePicker(r, rerender),
      createOnboardingSurfacePicker(r, rerender),
      toggle("DJ tools", runtimeState.djToolsEnabled !== false, () => r.$setDjToolsEnabled(runtimeState.djToolsEnabled === false)),
      createOnboardingTimelinePicker(r, rerender),
      createOnboardingHandlePicker(r, rerender),
      createOnboardingPalettePicker(r, rerender)
    );
    content.append(grid);
  }
  config.append(createOnboardingModeSwitch(r, mode), content, createOnboardingScaleSettings(r));
  return config;
}
