import { createButtonIcon, createElement, createPanelBackButton, createPanelCaret } from "./core.js";

let settingsDisclosureId = 0;
const openSettingsDisclosures = new Set();

const SETTINGS_DESTINATION_ICONS = Object.freeze({
  player: "icon-settings-player.svg",
  tools: "icon-settings-tools.svg",
  appearance: "icon-settings-appearance.svg",
  browsing: "icon-settings-browsing.svg",
  onboarding: "icon-settings-help.svg",
  privacy: "icon-settings-privacy.svg",
  about: "icon-settings-about.svg",
  design: "icon-settings-design.svg",
  size: "icon-settings-effects.svg",
  timeline: "icon-settings-controls.svg",
  visualiser: "icon-image.svg",
  dj: "icon-dj.svg",
  analysis: "icon-settings-analysis.svg",
  theme: "icon-theme-curated.svg",
  themes: "icon-theme-curated.svg",
  colours: "icon-theme-custom.svg",
  finish: "icon-settings-finish.svg",
  scale: "icon-settings-effects.svg",
  page: "icon-settings-page.svg"
});

export function resetSettingsDisclosures() {
  openSettingsDisclosures.clear();
}

// Lets a shortcut land on a drawer that is already open.
export function openSettingsDisclosure(disclosureKey) {
  openSettingsDisclosures.add(disclosureKey);
}

export function isSettingsDisclosureOpen(disclosureKey) {
  return openSettingsDisclosures.has(disclosureKey);
}

export function createSettingsDisclosure(title, description = "", disclosureKey = title.toLowerCase()) {
  settingsDisclosureId += 1;
  const contentId = `hub-settings-disclosure-${settingsDisclosureId}`;
  const open = openSettingsDisclosures.has(disclosureKey);
  const group = createElement("section", "hub-settings-group hub-settings-disclosure hub-settings-disclosure--quiet");
  group.dataset.settingsDisclosure = disclosureKey;
  group.classList.toggle("is-open", open);
  const trigger = createElement("button", "hub-settings-disclosure-trigger");
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", String(open));
  trigger.setAttribute("aria-controls", contentId);
  const copy = createElement("span", "hub-settings-disclosure-copy");
  copy.append(createElement("strong", "hub-settings-disclosure-title", title));
  if (description) copy.append(createElement("span", "hub-settings-disclosure-description", description));
  const chevron = createPanelCaret("hub-settings-disclosure-chevron");
  trigger.append(copy, chevron);

  const content = createElement("div", "hub-settings-disclosure-content");
  content.id = contentId;
  content.hidden = !open;
  trigger.addEventListener("click", () => {
    const nextOpen = content.hidden;
    content.hidden = !nextOpen;
    trigger.setAttribute("aria-expanded", String(nextOpen));
    group.classList.toggle("is-open", nextOpen);
    if (nextOpen) openSettingsDisclosures.add(disclosureKey);
    else openSettingsDisclosures.delete(disclosureKey);
  });
  group.append(trigger, content);
  return { group, content };
}

export function appendSettingsDisclosureSections(content, ...sections) {
  for (const section of sections) {
    section.classList.remove("hub-settings-group", "hub-settings-subrow");
    section.classList.add("hub-settings-subsection");
    content.append(section);
  }
  return content;
}

export function createSettingsOverviewCard({ id, title, onOpen }) {
  const trigger = createElement("button", "hub-settings-overview-trigger");
  trigger.type = "button";
  trigger.dataset.settingsSection = id;
  trigger.setAttribute("aria-label", `Open ${title} settings`);
  const icon = createButtonIcon(SETTINGS_DESTINATION_ICONS[id] || "icon-settings.svg");
  icon.classList.add("hub-settings-overview-icon");
  icon.setAttribute("aria-hidden", "true");
  trigger.append(createElement("span", "hub-settings-overview-title", title), icon);
  trigger.addEventListener("click", onOpen);
  return trigger;
}

export function createSettingsDetailHeader(title) {
  const header = createElement("div", "hub-section-heading hub-settings-detail-toolbar");
  const detailTitle = createElement("h2", "hub-settings-detail-title");
  detailTitle.append(createElement("span", "", title));
  header.append(detailTitle);
  return header;
}

export function createSettingsBackRow(label, onBack, actions = null) {
  const row = createElement("div", "hub-panel-secondary-nav hub-settings-back-row");
  row.append(createPanelBackButton(label, onBack, "hub-settings-detail-back"));
  if (actions) {
    actions.classList.add("hub-settings-back-actions");
    row.append(actions);
  }
  return row;
}

export function prepareSettingsDetail(section) {
  section.querySelector(":scope > .hub-settings-heading")?.remove();
  section.classList.remove("hub-card", "hub-settings-card", "hub-settings-group");
  section.classList.add("hub-settings-detail");
  return section;
}
