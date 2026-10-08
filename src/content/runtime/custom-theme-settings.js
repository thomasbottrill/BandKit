import { createColourField } from "../components/colour-field.js";
import { createSettingsAction, createSettingsRow, createSettingsRowCopy } from "../components/settings.js";
import { createButtonIcon, createElement } from "../core.js";
import { hexColor, hexString, luminance, mixColor } from "../color.js";
import { createSettingsPicker } from "../settings-picker.js";
import { closeSettingsPopover, openSettingsPopover, settingsPopoverContainsFocus } from "../settings-popover.js";
import { customVisualizerColourDefaults } from "../visualizer-theme.js";
import { runtimeSaveState, runtimeState } from "./context.js";

function simpleSecondaryText() {
  const surface = hexColor(runtimeState.appearance.customPageSurface, { r: 255, g: 255, b: 255, a: 1 });
  const text = hexColor(runtimeState.appearance.customText, { r: 17, g: 24, b: 39, a: 1 });
  return hexString(mixColor(text, surface, luminance(surface) < 0.34 ? 0.35 : 0.42));
}

function applySimpleColour(key, value) {
  runtimeState.appearance[key] = value;
  if (key === "customAccent") {
    Object.assign(runtimeState.appearance, {
      customScrubAccent: null,
      visualizerColourSource: "theme",
      customVisualizerColor1: null,
      customVisualizerColor2: null,
      customVisualizerColor3: null
    });
  }
  if (key === "customPageSurface") {
    Object.assign(runtimeState.appearance, {
      customNavbar: value,
      customCard: value,
      customContentLinked: true,
      customSurface: value,
      customPanelLinked: true,
      customSecondaryText: simpleSecondaryText()
    });
  }
  if (key === "customText") runtimeState.appearance.customSecondaryText = simpleSecondaryText();
}

function appendSimpleColourFields(r, panel) {
  const colours = createElement("div", "hub-custom-colours hub-custom-colours-simple");
  for (const [key, label, help] of [
    ["customAccent", "Accent", "Buttons, links, timelines and visualiser colours."],
    ["customPageBackground", "Page background", "The colour behind the main page content."],
    ["customPageSurface", "Content surface", "Page content, navigation, cards and Bandkit panels."],
    ["customText", "Text", "Primary text; secondary text is derived automatically."]
  ]) {
    const { field, input } = createColourField({
      label, tooltip: help, ariaLabel: null, id: `bandkit-theme-simple-colour-${key}`,
      value: runtimeState.appearance[key]
    });
    input.dataset.themeSimpleColour = key;
    r.$containThemeColourPointer(input);
    input.addEventListener("input", () => {
      applySimpleColour(key, input.value);
      r.$spectrumColourCache = null;
      r.$scheduleCustomThemePreview();
    });
    input.addEventListener("change", r.$commitCustomThemeColour);
    colours.append(field);
  }
  panel.append(colours);
}

export function appendCustomThemeEditor(r, panel) {
  const mode = runtimeState.appearance.customThemeEditorMode === "advanced" ? "advanced" : "simple";
  const row = createSettingsRow({ className: "hub-custom-theme-mode-row" });
  const copy = createSettingsRowCopy("Colour detail", "Use four core colours or tune every surface individually.");
  const picker = createSettingsPicker({
    ariaLabel: "Custom colour detail",
    options: [{ value: "simple", label: "Simple" }, { value: "advanced", label: "Advanced" }],
    value: mode,
    onChange: (nextMode) => {
      runtimeState.appearance.customThemeEditorMode = nextMode === "advanced" ? "advanced" : "simple";
      runtimeSaveState();
      r.$render();
    }
  });
  row.append(copy, picker.element);
  panel.append(row);
  if (mode === "simple") appendSimpleColourFields(r, panel);
  return mode;
}

export function createCustomThemeSaveAction(r) {
  return createNamedSaveAction({ noun: "palette", onSave: (name) => saveCustomPalette(r, name) });
}

export function createNamedSaveAction({ noun, name = "", onSave }) {
  const control = createElement("div", "hub-theme-save-control");
  const trigger = createElement("button", "hub-playlist-toolbar-icon hub-theme-sharing-action hub-theme-save-trigger");
  const form = createElement("form", "hub-theme-save-popover");
  const input = createElement("input", "hub-theme-name");
  const confirm = createSettingsAction("Save", { tag: "button", className: "hub-save-theme", type: "submit" });
  trigger.type = "button"; trigger.dataset.settingsTooltip = `Save ${noun}`;
  trigger.setAttribute("aria-label", `Save ${noun}`); trigger.setAttribute("aria-expanded", "false");
  trigger.append(createButtonIcon("icon-save.svg"));
  input.type = "text"; input.maxLength = 28; input.value = name;
  input.placeholder = `${noun === "theme" ? "Theme" : "Palette"} name`; input.setAttribute("aria-label", input.placeholder);
  confirm.type = "submit"; form.hidden = true; form.append(input, confirm); control.append(trigger, form);
  const setOpen = (open) => {
    if (open) openSettingsPopover(trigger, form); else closeSettingsPopover(form);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) window.requestAnimationFrame(() => input.focus());
  };
  trigger.addEventListener("click", () => setOpen(form.hidden));
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); setOpen(false); trigger.focus();
  });
  form.addEventListener("focusout", () => window.setTimeout(() => {
    if (!settingsPopoverContainsFocus(trigger, form)) setOpen(false);
  }, 0));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (onSave(input.value.trim()) !== false) setOpen(false);
  });
  return control;
}

function saveCustomPalette(r, name) {
    if (!r.$hasSavedThemeCapacity()) return;
    const appearance = runtimeState.appearance;
    const number = (appearance.savedThemes || []).length + 1;
    const label = name || `Custom ${number}`;
    const savedTheme = {
      id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: label.slice(0, 28),
      accent: appearance.customAccent, scrubAccent: appearance.customScrubAccent || appearance.customAccent,
      visualizerColors: [appearance.customVisualizerColor1, appearance.customVisualizerColor2, appearance.customVisualizerColor3]
        .map((colour, index) => colour || customVisualizerColourDefaults(appearance)[index]),
      surface: appearance.customPanelLinked === false ? appearance.customSurface
        : appearance.customContentLinked === false ? appearance.customCard : appearance.customPageSurface,
      card: appearance.customContentLinked === false ? appearance.customCard : appearance.customPageSurface,
      background: appearance.customPageBackground, pageSurface: appearance.customPageSurface,
      navbar: appearance.customNavbar, text: appearance.customText, secondaryText: appearance.customSecondaryText
    };
    appearance.savedThemes = [...(appearance.savedThemes || []), savedTheme]; appearance.preset = savedTheme.id;
    runtimeSaveState(); r.$render(); r.$showToast(`Saved palette “${savedTheme.label}”`);
}
