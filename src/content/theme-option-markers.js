import { createButtonIcon } from "./core.js";

export const DYNAMIC_THEME_HELP = "Keeps artist pages intact; Bandkit colours adapt automatically.";

export function createDynamicThemeInfo() {
  const marker = createButtonIcon("icon-settings-about.svg");
  marker.classList.add("hub-theme-option-info");
  marker.dataset.settingsTooltip = DYNAMIC_THEME_HELP;
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", DYNAMIC_THEME_HELP);
  return marker;
}
