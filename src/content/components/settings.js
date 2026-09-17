import { createElement } from "../core.js";

// Presentation only: callers own state, persistence, previews and page effects.
export function createSettingsRowCopy(label, description) {
  const copy = createElement("div", "hub-settings-copy hub-settings-control-copy");
  const tooltip = description?.trim();
  copy.append(
    createPlayerSettingLabel(label, tooltip, { tag: "strong", className: "hub-settings-control-label" }),
    createElement("span", tooltip ? "hub-settings-control-description" : "", description)
  );
  return copy;
}

export function createPlayerSettingLabel(label, tooltip, { ariaLabel, tag = "span", className = "hub-player-setting-label" } = {}) {
  const element = createElement(tag, className, label);
  if (tooltip) {
    element.dataset.settingsTooltip = tooltip;
    element.tabIndex = 0;
    if (ariaLabel !== null) element.setAttribute("aria-label", ariaLabel || `${label}. ${tooltip}`);
  }
  return element;
}

export function createSettingsRow({ className = "", tag = "div", copy, control } = {}) {
  const row = createElement(tag, `hub-settings-row${className ? ` ${className}` : ""}`);
  if (copy) row.append(copy);
  if (control) row.append(control);
  return row;
}

export function createPlayerSettingRow(label, tooltip, control, className = "") {
  const row = createElement("div", `hub-player-setting-row${className ? ` ${className}` : ""}`);
  row.append(createPlayerSettingLabel(label, tooltip), control);
  return row;
}

export function createSettingsToggle({ checked, ariaLabel, className = "", controls, expanded }) {
  const button = createElement("button", `hub-settings-toggle${className ? ` ${className}` : ""}${checked ? " is-active" : ""}`);
  button.type = "button";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", ariaLabel);
  button.setAttribute("aria-checked", String(checked));
  if (controls) button.setAttribute("aria-controls", controls);
  if (expanded !== undefined) button.setAttribute("aria-expanded", String(expanded));
  button.append(createElement("span", "hub-settings-toggle-thumb"));
  return button;
}

export function createSettingsActions(className = "", ...buttons) {
  const actions = createElement("div", `hub-settings-feedback-actions${className ? ` ${className}` : ""}`);
  actions.append(...buttons);
  return actions;
}

export function createSettingsActionRow({ label, description, actions, className = "", tag = "div" }) {
  return createSettingsRow({
    tag,
    className: `hub-settings-text-actions${className ? ` ${className}` : ""}`,
    copy: createSettingsRowCopy(label, description),
    control: actions
  });
}

export function createSettingsAction(label, { className = "", tag = "button", type = "button", ariaLabel } = {}) {
  const action = createElement(tag, `hub-settings-action${className ? ` ${className}` : ""}`, label);
  if (tag === "button") action.type = type;
  if (ariaLabel) action.setAttribute("aria-label", ariaLabel);
  return action;
}
