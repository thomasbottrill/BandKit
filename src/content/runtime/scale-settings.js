import { createElement } from "../core.js";
import { createSettingsAction, createSettingsActionRow, createSettingsActions, createSettingsRow, createSettingsRowCopy, createSettingsToggle } from "../components/settings.js";
import { createScrubbablePercentage } from "../music-bar-settings.js";
import { createSettingsDisclosure } from "../settings-drawer.js";
import { createSettingsPicker } from "../settings-picker.js";
import { INTERFACE_SCALE_OPTIONS, PAGE_SCALE_GROUPS, PAGE_SCALE_OPTIONS, SCALE_MAX, SCALE_MIN, normalizeScale } from "../scale.js";
import { runtimeSaveState, runtimeState } from "./context.js";
import { applyScales } from "./scaling.js";

function scaleControl(r, label, value, onInput, description = "") {
  const control = createScrubbablePercentage({
    ariaLabel: label, defaultValue: 100, min: SCALE_MIN, max: SCALE_MAX, step: 1, value,
    onInput: percent => { onInput(percent); applyScales(r); },
    onChange: () => runtimeSaveState()
  });
  const row = createSettingsRow({ copy: createSettingsRowCopy(label, description), control, className: "hub-scale-control-row" });
  row.setValue = control.setValue;
  row.setDisabled = (disabled) => {
    control.setDisabled(disabled);
    row.classList.toggle("is-disabled", Boolean(disabled));
  };
  return row;
}

function appendPageOverrides(r, content, getScale, controls, defaultControl) {
  const options = createElement("div", "hub-scale-page-types");
  options.hidden = !getScale().adjustByPage;
  for (const { value: key, label } of PAGE_SCALE_GROUPS) {
    const slider = scaleControl(r, `${label} scale`, getScale().overrides[key] ?? getScale().custom, percent => {
      getScale().overrides[key] = percent;
    });
    controls.set(key, slider);
    options.append(slider);
  }
  const reset = createSettingsAction("Reset", { className: "hub-scale-page-reset", ariaLabel: "Reset page type scales to default" });
  reset.addEventListener("click", () => {
    for (const { value: key } of PAGE_SCALE_GROUPS) {
      getScale().overrides[key] = null;
      controls.get(key)?.setValue(getScale().custom, false);
    }
    applyScales(r); runtimeSaveState();
  });
  options.append(createSettingsActionRow({
    label: "Page scales",
    actions: createSettingsActions("hub-scale-page-actions", reset)
  }));
  const toggle = createSettingsToggle({ checked: getScale().adjustByPage, ariaLabel: "Adjust scale by page type" });
  toggle.addEventListener("click", () => {
    const on = !getScale().adjustByPage;
    getScale().adjustByPage = on;
    options.hidden = !on;
    defaultControl.setDisabled(on);
    toggle.classList.toggle("is-active", on);
    toggle.setAttribute("aria-checked", String(on));
    applyScales(r); runtimeSaveState();
  });
  content.append(createSettingsRow({
    copy: createSettingsRowCopy("Adjust by page type", "Set a different scale for specific Bandcamp pages."),
    control: toggle
  }), options);
}

// The tour passes `picker` to show its own dropdown in place of the Settings
// picker; it receives the label, options, value and onChange.
export function createScaleSettings(r, { pages = true, onboarding = false, picker: createPicker = null } = {}) {
  const key = pages ? "pageScale" : "interfaceScale";
  const scale = normalizeScale(runtimeState.appearance[key], pages);
  runtimeState.appearance[key] = scale;
  const getScale = () => runtimeState.appearance[key];
  const pageControls = new Map();
  const group = createElement("div", "hub-scale-settings");
  const details = createElement("div", "hub-scale-custom");
  details.hidden = scale.preset !== "custom";
  const label = pages ? "Page scale" : "Interface scale";
  const options = pages ? PAGE_SCALE_OPTIONS : INTERFACE_SCALE_OPTIONS;
  const onChange = preset => {
    getScale().preset = preset; details.hidden = preset !== "custom";
    applyScales(r); runtimeSaveState(); r.$scheduleOnboardingPosition?.();
  };
  if (createPicker) group.append(createPicker({ label, options, value: scale.preset, onChange }));
  else group.append(createSettingsRow({
    copy: createSettingsRowCopy(label, pages ? "Bandcamp pages only. Player and panels stay the same." : "Size of the Bandkit player and panels."),
    control: createSettingsPicker({ ariaLabel: label, options, value: scale.preset, onChange }).element
  }));
  const defaultControl = scaleControl(r, pages ? "Default scale" : "Interface size", scale.custom, percent => {
    getScale().custom = percent;
  }, pages ? "Changes every supported page." : "");
  defaultControl.setDisabled(pages && scale.adjustByPage);
  details.append(defaultControl);
  if (pages) appendPageOverrides(r, details, getScale, pageControls, defaultControl);
  group.append(details);
  if (onboarding) {
    group.classList.add("hub-onboarding-scale");
    group.addEventListener("click", () => r.$scheduleOnboardingPosition?.());
  }
  return group;
}

export function createScaleSettingsSection(r) {
  const disclosure = createSettingsDisclosure("Scale", "", "scale");
  disclosure.content.append(createScaleSettings(r), createScaleSettings(r, { pages: false }));
  return disclosure.group;
}
