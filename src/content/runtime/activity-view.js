import { attachMenuKeyNavigation, attachMenuTriggerKeyNavigation } from "../menu-keyboard.js";
import { createPanelEmptyState, createPanelMediaCard } from "../components/collections.js";
import { runtimeState } from "./context.js";
import { asset, createArt, createElement, createSectionHeading } from "../core.js";

function activityDateKey(item) {
  const date = new Date(item.createdAt || item.time || 0);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function activityDateFilter(r, selectedDate, activityItems) {
  const control = createElement("div", "hub-activity-date-filter");
  control.append(createElement("span", "hub-activity-date-label", "Date"));
  const displayDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString();
  const field = createElement("span", "hub-activity-date-field");
  const opener = createElement("button", "hub-activity-date-opener");
  opener.type = "button";
  opener.setAttribute("aria-label", `Choose activity date, currently ${displayDate}`);
  opener.setAttribute("aria-haspopup", "menu");
  opener.setAttribute("aria-expanded", "false");
  const calendarIcon = createElement("span", "hub-activity-date-icon");
  calendarIcon.style.setProperty("--hub-activity-date-icon", `url('${asset("icon-calendar.svg")}')`);
  calendarIcon.setAttribute("aria-hidden", "true");
  const today = activityDateKey({ createdAt: new Date().toISOString() });
  const yesterdayValue = new Date(`${today}T12:00:00`);
  yesterdayValue.setDate(yesterdayValue.getDate() - 1);
  const yesterday = activityDateKey({ createdAt: yesterdayValue.toISOString() });
  const recentDates = [...new Set((Array.isArray(activityItems) ? activityItems : [])
    .map(activityDateKey)
    .filter(Boolean))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 7);
  const menu = createElement("div", "hub-activity-date-menu");
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Choose activity date");
  menu.append(createElement("strong", "hub-activity-date-menu-title", "Choose date"));
  for (const date of recentDates) {
    const label = date === today
      ? "Today"
      : date === yesterday
        ? "Yesterday"
        : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const option = createElement("button", "hub-activity-date-option", label);
    option.type = "button";
    option.setAttribute("role", "menuitemradio");
    option.setAttribute("aria-checked", String(date === selectedDate));
    option.classList.toggle("is-active", date === selectedDate);
    option.addEventListener("click", () => {
      menu.hidden = true;
      opener.setAttribute("aria-expanded", "false");
      r.$activityDateFilter = date;
      r.$render();
    });
    menu.append(option);
  }
  attachMenuKeyNavigation(menu);
  attachMenuTriggerKeyNavigation(opener, menu);
  const customDate = createElement("label", "hub-activity-date-custom");
  const customIcon = createElement("span", "hub-activity-date-custom-icon");
  customIcon.style.setProperty("--hub-activity-date-icon", `url('${asset("icon-calendar.svg")}')`);
  customIcon.setAttribute("aria-hidden", "true");
  const customInput = createElement("input", "hub-activity-date-custom-input");
  customInput.type = "date";
  customInput.value = selectedDate;
  customInput.setAttribute("aria-label", "Choose another activity date");
  customInput.addEventListener("change", () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customInput.value)) return;
    menu.hidden = true;
    opener.setAttribute("aria-expanded", "false");
    r.$activityDateFilter = customInput.value;
    r.$render();
  });
  customDate.append(customIcon, createElement("span", "", "Choose date…"), customInput);
  menu.append(customDate);
  opener.append(calendarIcon);
  opener.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector(".is-active, .hub-activity-date-option")?.focus();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    menu.hidden = true;
    opener.setAttribute("aria-expanded", "false");
    opener.focus();
  });
  const trigger = createElement("span", "hub-activity-date-trigger");
  trigger.append(opener, menu);
  field.append(createElement("span", "hub-activity-date-value", displayDate), trigger);
  control.append(field);
  return control;
}

const ACTIVITY_ACTIONS = {
  "added-to-cart": { chip: "added to cart", verb: "added", suffix: "to your cart", icon: "icon-cart.svg" },
  "added-to-playlist": { chip: "added to playlist", verb: "added", suffix: "to playlist", icon: "icon-playlist.svg" },
  "backed-up": { chip: "backup", verb: "backed up", suffix: "", icon: "icon-download-all.svg" },
  listened: { chip: "listened", verb: "listened to", suffix: "", icon: "icon-now-playing.svg" },
  wishlisted: { chip: "wishlisted", verb: "wishlisted", suffix: "", icon: "icon-wishlist-filled.svg" }
};

function activityVisual(r, item, action) {
  if (item.art && item.url) {
    const link = r.$createPageLink("", item.url, "hub-art-link hub-activity-art");
    link.setAttribute("aria-label", `Open ${item.title}`);
    link.append(createArt(item.art, true));
    return link;
  }
  const icon = createElement("div", "hub-activity-icon");
  icon.style.setProperty("--hub-activity-icon", `url('${asset(action.icon)}')`);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function activityRow(r, item) {
  const action = ACTIVITY_ACTIONS[item.action]
    || { chip: item.action || "activity", verb: item.action || "updated", suffix: "", icon: "icon-activity.svg" };
  const row = createPanelMediaCard("hub-activity-item", { surface: false });
  row.append(activityVisual(r, item, action));
  const details = createElement("div", "hub-activity-details");
  const copy = createElement("div", "hub-activity-copy");
  if (item.url) copy.append(r.$createPageLink(item.title, item.url, "hub-inline-link"));
  else copy.append(createElement("strong", "", item.title));
  if (item.artist) {
    copy.append(document.createTextNode(" · "));
    copy.append(r.$createPageLink(item.artist, item.artistUrl || item.url, "hub-inline-link"));
  }
  copy.title = [item.title, item.artist].filter(Boolean).join(" · ");
  const meta = createElement("div", "hub-activity-meta");
  const time = item.createdAt ? new Date(item.createdAt).toLocaleString() : item.time || "Recorded locally";
  const chip = createElement("span", `hub-event-chip ${item.action}`);
  const chipIcon = createElement("span", "hub-event-chip-icon");
  chipIcon.style.setProperty("--hub-event-chip-icon", `url('${asset(action.icon)}')`);
  chip.append(chipIcon, createElement("span", "hub-event-chip-label", action.chip));
  meta.append(chip, createElement("span", "hub-meta", time));
  details.append(copy, meta);
  row.append(details);
  return row;
}

export function registerActivityView(r) {
  r.$renderActivity = function renderActivity() {
    const today = activityDateKey({ createdAt: new Date().toISOString() });
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(r.$activityDateFilter || "") ? r.$activityDateFilter : today;
    const filtered = runtimeState.activity.filter((item) => activityDateKey(item) === selectedDate);
    r.$content.append(createSectionHeading("Activity"));
    const toolbar = createElement("div", "hub-cart-backup hub-activity-backup");
    toolbar.append(activityDateFilter(r, selectedDate, runtimeState.activity));
    const actions = createElement("div", "hub-toolbar");
    const download = r.$createPlaylistToolbarButton("Download activity", "icon-download-all.svg", r.$exportActivity);
    download.classList.add("hub-activity-download");
    actions.append(download);
    toolbar.append(actions);
    r.$content.append(toolbar);
    const list = createElement("div", "hub-activity-list");
    for (const item of filtered.slice(0, 500)) list.append(activityRow(r, item));
    r.$content.append(list);
    if (!runtimeState.activity.length) {
      r.$content.append(createPanelEmptyState("Nothing recorded yet. Listening, playlist, cart, wishlist and backup activity will appear here."));
    } else if (!filtered.length) {
      r.$content.append(createPanelEmptyState("No activity was recorded on this date."));
    }
  };
}
