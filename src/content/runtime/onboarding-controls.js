import { attachMenuKeyNavigation, attachMenuTriggerKeyNavigation } from "../menu-keyboard.js";
import { runtimeSaveState, runtimeState } from "./context.js";
import { createButtonIcon, createElement, createPanelCaret } from "../core.js";
import { colorString, hexColor, luminance, parseColor, readableColor } from "../color.js";
import { MUSIC_BAR_STYLES, PLAYER_BLEND_MODES, SCRUBBER_HANDLE_SHAPES } from "../state.js";
import { scrubberHandleMask, setHandleImageStyles } from "../custom-scrub-handle.js";
import { applyMusicBarStylePreset } from "../music-bar-settings.js";
import { TIMELINE_STYLES, normalizeTimelineStyle, createTimelinePreview } from "../timeline-styles.js";
import { createBlendModePreview, createPlayerDesignPreview, createSurfacePreview } from "../settings-option-previews.js";

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
  "$onboardingHandleMenu", "$onboardingTimelineMenu", "$onboardingPlayerBlendMenu",
  "$onboardingPlayerStyleMenu", "$onboardingSurfaceMenu"
]);

function blendModeLabel(value) {
  return value.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
}

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
  label, value, options: definitions, menuKey, className = "", renderPreview, onPreview, onRestore, onChange
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

function createOnboardingBlendPicker(r, rerender) {
  const committed = PLAYER_BLEND_MODES.includes(runtimeState.musicBarBlendMode) ? runtimeState.musicBarBlendMode : "normal";
  const sync = () => r.$syncMusicBarStyle?.();
  return createOnboardingPicker(r, rerender, {
    label: "Glass blend",
    value: committed,
    options: PLAYER_BLEND_MODES.map((value) => ({ value, label: blendModeLabel(value) })),
    menuKey: "$onboardingPlayerBlendMenu",
    className: "hub-onboarding-kit-player-blend-selection",
    renderPreview: createBlendModePreview,
    onPreview: (value) => { runtimeState.musicBarBlendMode = value; sync(); },
    onRestore: () => { runtimeState.musicBarBlendMode = committed; sync(); },
    onChange: (value) => { runtimeState.musicBarBlendMode = value; sync(); }
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

export function createKitControls(r) {
  const config = createElement("div", "hub-onboarding-kit-config");
  const grid = createElement("div", "hub-onboarding-kit-controls");
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
  const withSettings = (control, kind, label) => {
    const group = createElement("div", "hub-onboarding-kit-control-group");
    const settings = createElement("button", "hub-onboarding-kit-settings-button");
    settings.type = "button";
    settings.setAttribute("aria-label", `${label} settings`);
    settings.title = `${label} settings`;
    settings.append(createButtonIcon("icon-settings.svg"));
    settings.addEventListener("click", () => {
      r.$onboardingKitSettings = kind;
      r.$render();
    });
    group.append(control, settings);
    return group;
  };
  // The tour tunes the player only. Palette, corners and visualiser are whole-kit
  // appearance choices and stay in Settings, where the full controls live.
  grid.append(
    createOnboardingPlayerStylePicker(r, rerender),
    withSettings(createOnboardingSurfacePicker(r, rerender), "surface", "Surface"),
    toggle("DJ tools", runtimeState.djToolsEnabled !== false, () => r.$setDjToolsEnabled(runtimeState.djToolsEnabled === false)),
    createOnboardingTimelinePicker(r, rerender),
    createOnboardingHandlePicker(r, rerender)
  );
  config.append(grid);
  if (r.$onboardingKitSettings) {
    const titles = { surface: "Surface" };
    const modal = createElement("section", "hub-onboarding-kit-settings-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", `${titles[r.$onboardingKitSettings]} settings`);
    const header = createElement("header", "hub-onboarding-kit-settings-header");
    header.append(createElement("h3", "", titles[r.$onboardingKitSettings]));
    const close = createElement("button", "hub-onboarding-kit-settings-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close settings");
    close.addEventListener("click", () => { r.$onboardingKitSettings = null; r.$render(); });
    header.append(close);
    const body = createElement("div", "hub-onboarding-kit-settings-body");
    if (r.$onboardingKitSettings === "surface") {
      body.append(
        toggle("Dynamic colour", runtimeState.musicBarDynamicColor !== false, () => {
          runtimeState.musicBarDynamicColor = runtimeState.musicBarDynamicColor === false;
          if (runtimeState.musicBarDynamicColor) {
            runtimeState.musicBarPlayerDynamicColor = true;
            runtimeState.musicBarPanelDynamicColor = true;
          }
        }),
        createOnboardingBlendPicker(r, rerender)
      );
    }
    modal.append(header, body);
    config.append(modal);
    window.requestAnimationFrame(() => close.focus({ preventScroll: true }));
  }
  return config;
}
