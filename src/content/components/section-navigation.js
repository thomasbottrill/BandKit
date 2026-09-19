import { asset } from "../core.js";

export function createMusicBarPanelButton() {
  const button = document.createElement("button");
  button.className = "hub-compact-panel-button";
  button.type = "button";
  button.innerHTML = `
  <span class="hub-compact-panel-glyphs" aria-hidden="true">
    <span class="hub-compact-panel-chevron" style="--hub-icon:url('${asset("icon-panel-caret.svg")}')"></span>
    <span class="hub-compact-panel-icon"></span>
  </span>
`;
  return button;
}
function createDestinationButton(tab, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.tab = tab.id;
  button.title = tab.label;
  button.setAttribute("aria-label", tab.label);
  return button;
}

export function createSectionTab(tab) {
  const button = createDestinationButton(tab, "hub-tab");
  button.innerHTML = `<span class="hub-tab-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span><span class="hub-tab-dot" aria-hidden="true"></span>`;
  return button;
}

export function createPanelShortcut(tab) {
  const panelShortcut = createDestinationButton(tab, "hub-panel-shortcut");
  const panelShortcutLabel = tab.id === "playlist" ? "play" : tab.label.toLowerCase();
  panelShortcut.innerHTML = `<span class="hub-panel-shortcut-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span><span class="hub-panel-shortcut-label">${panelShortcutLabel}</span><span class="hub-panel-shortcut-count" aria-hidden="true"></span>`;
  return panelShortcut;
}

export function createMusicBarShortcut(tab) {
  const shortcut = createDestinationButton(tab, "hub-header-shortcut");
  const shortcutCounter = tab.id === "cart"
    ? '<span class="hub-header-shortcut-count hub-cart-shortcut-count" aria-hidden="true">0</span>'
    : '<span class="hub-header-shortcut-dot" aria-hidden="true"></span>';
  shortcut.innerHTML = `<span class="hub-header-shortcut-icon" style="--hub-icon:url('${asset(tab.icon)}')"></span><span class="hub-header-shortcut-label">${tab.label}</span>${shortcutCounter}`;
  return shortcut;
}
