import { createElement } from "../core.js";

export function createPanelViewTabs({ views, selected, onSelect, headerClass = "", tabsClass = "", buttonClass = "", ariaLabel }) {
  const header = createElement("div", `hub-cart-view-header${headerClass ? ` ${headerClass}` : ""}`);
  const tabs = createElement("div", `hub-cart-view-tabs${tabsClass ? ` ${tabsClass}` : ""}`);
  tabs.setAttribute("role", "tablist");
  if (ariaLabel) tabs.setAttribute("aria-label", ariaLabel);
  for (const view of views) {
    const button = createElement("button", `hub-cart-view-tab${buttonClass ? ` ${buttonClass}` : ""}${selected === view.id ? " is-active" : ""}`, view.label);
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(selected === view.id));
    button.addEventListener("click", () => onSelect(view.id));
    tabs.append(button);
  }
  header.append(tabs);
  return header;
}

export function createPanelMediaCard(className, { surface = true } = {}) {
  return createElement("article", `${surface ? "hub-card " : ""}hub-panel-card hub-compact-media-card ${className}`);
}

export function createSavedCollectionCard({ title, total, summary, artwork, ariaLabel, onOpen, playing = false }) {
  const card = createPanelMediaCard(`hub-saved-cart-card hub-saved-playlist-card${playing ? " is-playing" : ""}`);
  const body = createElement("button", "hub-saved-cart-body hub-saved-playlist-open");
  body.type = "button";
  body.setAttribute("aria-label", ariaLabel);
  body.addEventListener("click", onOpen);
  const titleRow = createElement("div", "hub-row-title");
  titleRow.append(createElement("strong", "hub-saved-collection-title", title), createElement("span", "hub-saved-cart-total", total));
  const copy = createElement("div", "hub-saved-playlist-card-copy");
  copy.append(titleRow, createElement("div", "hub-saved-cart-summary", summary));
  body.append(artwork, copy);
  card.append(body);
  return card;
}

export function createPanelEmptyState(message) {
  return createElement("div", "hub-empty", message);
}
