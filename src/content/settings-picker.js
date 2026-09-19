import { createElement, createPanelCaret } from "./core.js";
import { closeSettingsPopover, openSettingsPopover, settingsPopoverContainsFocus } from "./settings-popover.js";

let settingsPickerId = 0;

function pickerActiveElement(picker) {
  const root = picker.getRootNode();
  return root?.activeElement || document.activeElement;
}

export function createSettingsPicker({
  ariaLabel,
  className = "",
  menuClassName = "",
  onChange,
  onPreview,
  optionClassName = "",
  optionLabelClassName = "",
  options,
  groups,
  renderPreview,
  renderTrailing,
  value
}) {
  settingsPickerId += 1;
  const picker = createElement("div", `hub-settings-picker${renderPreview ? " has-preview" : ""}${className ? ` ${className}` : ""}`);
  const listboxId = `hub-settings-picker-options-${settingsPickerId}`;
  const trigger = createElement("button", "hub-settings-combobox");
  trigger.type = "button";
  trigger.setAttribute("role", "combobox");
  trigger.setAttribute("aria-label", ariaLabel);
  trigger.setAttribute("aria-controls", listboxId);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const triggerPreview = createElement("span", "hub-settings-combobox-preview");
  const triggerLabel = createElement("span", "hub-settings-combobox-label");
  const menu = createElement("div", "hub-settings-picker-options");
  if (menuClassName) menu.classList.add(...menuClassName.split(/\s+/).filter(Boolean));
  menu.classList.toggle("has-trailing", !!renderTrailing);
  // The menu is portalled outside its picker; carry its layout state with it.
  menu.classList.toggle("has-preview", !!renderPreview);
  if (className) {
    for (const pickerClass of className.split(/\s+/).filter(Boolean)) {
      menu.classList.add(`${pickerClass}-options`);
    }
  }
  menu.id = listboxId;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  const optionButtons = new Map();
  let selectedValue = options.some((option) => option.value === value) ? value : options[0]?.value;

  const selectedOption = () => options.find((option) => option.value === selectedValue) || options[0];
  const renderTriggerPreview = () => {
    triggerPreview.replaceChildren();
    if (!renderPreview) return;
    const preview = renderPreview(selectedValue, "trigger");
    if (preview) triggerPreview.append(preview);
  };
  const syncSelection = () => {
    const option = selectedOption();
    triggerLabel.textContent = option?.label || "";
    renderTriggerPreview();
    for (const [optionValue, button] of optionButtons) {
      const selected = optionValue === selectedValue;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-selected", String(selected));
    }
  };
  const setOpen = (open, focusSelected = false) => {
    if (open) openSettingsPopover(trigger, menu);
    else closeSettingsPopover(menu);
    trigger.setAttribute("aria-expanded", String(open));
    picker.classList.toggle("is-open", open);
    if (!open) onPreview?.(null);
    if (open && focusSelected) optionButtons.get(selectedValue)?.focus();
  };
  const setValue = (nextValue, notify = false) => {
    if (!options.some((option) => option.value === nextValue)) return;
    const changed = selectedValue !== nextValue;
    selectedValue = nextValue;
    syncSelection();
    if (notify && changed) onChange?.(selectedValue, selectedOption()?.label || "");
  };

  const buildOption = (option) => {
    const button = createElement("button", `hub-settings-picker-option${optionClassName ? ` ${optionClassName}` : ""}`);
    button.type = "button";
    button.setAttribute("role", "option");
    button.dataset.value = option.value;
    const previewSlot = createElement("span", "hub-settings-picker-option-preview");
    if (renderPreview) {
      const preview = renderPreview(option.value, "option");
      button.classList.toggle("has-option-preview", !!preview);
      button.classList.toggle("has-no-option-preview", !preview);
      if (preview) previewSlot.append(preview);
    }
    button.append(
      previewSlot,
      createElement("span", `hub-settings-picker-option-label${optionLabelClassName ? ` ${optionLabelClassName}` : ""}`, option.label)
    );
    // An optional end-of-row marker, used to tell an option's provenance apart
    // from the rest of the list without adding a control inside the option.
    const trailing = renderTrailing?.(option.value);
    if (trailing) {
      const trailingSlot = createElement("span", "hub-settings-picker-option-trailing");
      trailingSlot.append(trailing);
      button.append(trailingSlot);
      button.classList.add("has-option-trailing");
    }
    button.addEventListener("click", () => {
      setValue(option.value, true);
      setOpen(false);
      trigger.focus();
    });
    button.addEventListener("pointerenter", () => { if (!menu.hidden) onPreview?.(option.value); });
    button.addEventListener("focus", () => { if (!menu.hidden) onPreview?.(option.value); });
    optionButtons.set(option.value, button);
    return button;
  };

  // Grouped menus reuse the palette picker's section markup, so a heading line
  // and its divider look identical wherever options are grouped.
  if (groups?.length) {
    for (const [key, label] of groups) {
      const grouped = options.filter(option => option.group === key);
      if (!grouped.length) continue;
      const section = createElement("div", "hub-theme-option-group");
      section.dataset.themeGroup = key;
      section.setAttribute("role", "group");
      if (label) {
        const heading = createElement("div", "hub-theme-option-group-label", label);
        heading.id = `${listboxId}-group-${key}`;
        section.setAttribute("aria-labelledby", heading.id);
        section.append(heading);
      }
      for (const option of grouped) section.append(buildOption(option));
      menu.append(section);
    }
  } else for (const option of options) menu.append(buildOption(option));

  trigger.append(triggerPreview, triggerLabel, createPanelCaret("hub-settings-combobox-chevron"));
  trigger.addEventListener("click", () => setOpen(menu.hidden));
  trigger.addEventListener("keydown", (event) => {
    if (!menu.hidden || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setOpen(true, true);
  });
  const handleKeydown = (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      setOpen(false);
      trigger.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key) || menu.hidden) return;
    const buttons = [...optionButtons.values()];
    if (!buttons.length) return;
    event.preventDefault();
    // Opening with the mouse leaves focus on the trigger, not on an option. That
    // used to end the handler, so the arrow keys did nothing until an option had
    // been focused some other way; step into the list instead.
    const current = buttons.indexOf(pickerActiveElement(picker));
    const next = current < 0
      ? (event.key === "ArrowDown" ? 0 : buttons.length - 1)
      : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  };
  picker.addEventListener("keydown", handleKeydown);
  menu.addEventListener("keydown", handleKeydown);
  const handleFocusout = () => {
    window.setTimeout(() => {
      if (!settingsPopoverContainsFocus(picker, menu)) setOpen(false);
    }, 0);
  };
  picker.addEventListener("focusout", handleFocusout);
  menu.addEventListener("focusout", handleFocusout);
  menu.addEventListener("pointerleave", () => onPreview?.(null));
  picker.append(trigger, menu);
  syncSelection();

  return {
    element: picker,
    get label() { return selectedOption()?.label || ""; },
    get value() { return selectedValue; },
    setValue
  };
}
