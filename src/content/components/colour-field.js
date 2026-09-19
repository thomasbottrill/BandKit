import { createElement } from "../core.js";
import { createPlayerSettingLabel } from "./settings.js";

// Resolved lazily: this module is also imported outside a DOM by the repo's
// source checks, where HTMLInputElement does not exist.
let nativeValue = null;
const nativeValueDescriptor = () => (nativeValue ??= Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"));

// Accepts what people actually type: with or without the hash, three or six
// digits, any case. Anything else leaves the committed colour alone.
export function parseHexColour(text) {
  const digits = String(text ?? "").trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(digits)) return null;
  const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits;
  return `#${full.toLowerCase()}`;
}

// A colour input and its optional inheritance/reset affordance. Theme resolution,
// linked-colour propagation, previews and persistence belong to the caller.
export function createColourField({
  label, tooltip, ariaLabel, inputLabel = `${label} colour`, id, value,
  className = "hub-colour-field hub-player-setting-row hub-theme-colour-row",
  controlClassName = "hub-theme-colour-control", sourceLabel, resetLabel, overridden = false
}) {
  const field = createElement("div", className);
  const copy = createElement("div", "hub-colour-copy");
  const labelElement = createPlayerSettingLabel(label, tooltip, {
    tag: "label", className: "hub-colour-label hub-player-setting-label", ariaLabel
  });
  const input = createElement("input");
  input.type = "color";
  input.id = id;
  input.value = value;
  input.setAttribute("aria-label", inputLabel);
  labelElement.htmlFor = id;
  const hex = createElement("input", "hub-colour-hex");
  hex.type = "text";
  hex.id = `${id}-hex`;
  hex.value = input.value;
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.autocomplete = "off";
  hex.setAttribute("aria-label", `${inputLabel} hex value`);
  // The swatch opens the operating system picker, which is the only place a hex
  // value could be typed before. This field commits one directly, and mirrors
  // the swatch both ways so callers keep listening to the colour input alone.
  const syncHex = () => { if (document.activeElement !== hex) hex.value = nativeValueDescriptor().get.call(input); };
  Object.defineProperty(input, "value", {
    configurable: true,
    get() { return nativeValueDescriptor().get.call(this); },
    set(next) { nativeValueDescriptor().set.call(this, next); syncHex(); }
  });
  input.addEventListener("input", syncHex);
  const commitHex = () => {
    const parsed = parseHexColour(hex.value);
    if (!parsed || parsed === nativeValueDescriptor().get.call(input)) { hex.value = nativeValueDescriptor().get.call(input); return; }
    nativeValueDescriptor().set.call(input, parsed);
    hex.value = nativeValueDescriptor().get.call(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  hex.addEventListener("change", commitHex);
  hex.addEventListener("blur", commitHex);
  hex.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    hex.value = nativeValueDescriptor().get.call(input);
    hex.blur();
  });
  const control = createElement("div", controlClassName);
  let source = null, reset = null;
  const setOverridden = (next) => {
    if (source) source.hidden = next;
    if (reset) reset.hidden = !next;
  };
  if (sourceLabel !== undefined) {
    const linkState = createElement("div", "hub-colour-link-state");
    source = createElement("span", "hub-colour-source", sourceLabel);
    reset = createElement("button", "hub-colour-link", resetLabel);
    reset.type = "button";
    linkState.append(source, reset);
    control.append(linkState);
    setOverridden(overridden);
  }
  copy.append(labelElement);
  control.append(hex, input);
  field.append(copy, control);
  return { field, input, hex, label: labelElement, source, reset, setOverridden };
}
