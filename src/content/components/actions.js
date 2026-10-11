import { attachMenuKeyNavigation, attachMenuTriggerKeyNavigation } from "../menu-keyboard.js";
import { asset, createButtonIcon, createElement } from "../core.js";

export function createPanelIconButton({ label, icon, onClick, className }) {
  const button = createElement("button", className);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createButtonIcon(icon));
  button.addEventListener("click", onClick);
  return button;
}

export function createPanelToolbarButton(label, icon, onClick, { addPage = false } = {}) {
  const button = createPanelIconButton({ label, icon, onClick, className: `hub-playlist-toolbar-icon${addPage ? " is-add-page" : ""}` });
  if (addPage) {
    const badge = createElement("span", "hub-add-page-badge");
    badge.style.setProperty("--hub-icon", `url('${asset("icon-plus.svg")}')`);
    button.append(badge);
  }
  return button;
}

export function createPanelMenuAction(label, icon, onClick, { disabled = false, danger = false } = {}) {
  const button = createPanelIconButton({ label, icon, onClick, className: `hub-toolbar-menu-action${danger ? " is-danger" : ""}` });
  button.disabled = disabled;
  button.setAttribute("role", "menuitem");
  button.append(createElement("span", "", label));
  return button;
}

export function createPanelOverflow(label, actionButtons, { menuLabel = label, className = "", activeElement } = {}) {
  const wrapper = createElement("div", `hub-toolbar-overflow${className ? ` ${className}` : ""}`);
  const menu = createElement("div", "hub-toolbar-actions-menu");
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", menuLabel);
  menu.append(...actionButtons);
  const closeMenu = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const trigger = createPanelToolbarButton(label, "icon-more.svg", () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    if (opening) window.setTimeout(() => menu.querySelector("button:not(:disabled):not([hidden])")?.focus(), 0);
  });
  trigger.classList.add("hub-toolbar-more-button");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.disabled = actionButtons.every((button) => button.disabled);
  menu.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button:not(:disabled)")) closeMenu();
  });
  wrapper.addEventListener("focusout", () => window.setTimeout(() => {
    if (!wrapper.contains(activeElement())) closeMenu();
  }, 0));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
    trigger.focus();
  });
  attachMenuKeyNavigation(menu);
  attachMenuTriggerKeyNavigation(trigger, menu);
  wrapper.append(trigger, menu);
  return wrapper;
}
