import { createElement, createButtonIcon } from "../content/core.js";
import { BUILT_IN_THEMES } from "../content/state.js";
import { hexColor, hexString, colorString, readableColor } from "../content/color.js";
import { createSettingsAction, createSettingsActionRow, createSettingsActions, createSettingsToggle, createPlayerSettingRow } from "../content/components/settings.js";
import { createColourField } from "../content/components/colour-field.js";
import { createArtworkUpload } from "../content/components/artwork-upload.js";
import { createPanelMenuAction, createPanelOverflow } from "../content/components/actions.js";
import { createPanelViewTabs, createSavedCollectionCard, createPanelEmptyState } from "../content/components/collections.js";
import { createPlaylistArtwork } from "../content/components/playlist-artwork.js";
import { createPagePlaylistCard } from "../content/components/page-cards.js";
import { createSettingsPicker } from "../content/settings-picker.js";
import { createSettingsDisclosure, resetSettingsDisclosures } from "../content/settings-drawer.js";

// Deliberately no runtime context, storage, messaging, or application controllers.
// Direct extension URL only; this page is absent from normal panel navigation.
const reference = document.querySelector("#reference");
const themeSelect = document.querySelector("#theme");
const status = document.querySelector("#status");
const themes = BUILT_IN_THEMES.filter(theme => theme.surface && theme.text);
for (const theme of themes) {
  const option = createElement("option", "", theme.label);
  option.value = theme.id;
  themeSelect.append(option);
}
let sampleAccent = "#a598ff";
const announce = message => { status.textContent = message; };

function sample(title) {
  const host = createElement("section", "reference-host");
  const root = host.attachShadow({ mode: "open" });
  const stylesheet = createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("hub.css");
  const layout = createElement("style");
  // Only the reference's outer frame is styled here. Components use hub.css.
  layout.textContent = ":host{position:relative} .reference-frame{background:var(--hub-panel);color:var(--hub-ink);border-radius:8px;padding:16px 0} .reference-title{font:700 14px/20px Arial;margin:0 24px 12px} .reference-body{display:grid;gap:12px} .reference-collections{padding:0 24px}";
  const frame = createElement("div", "reference-frame");
  const body = createElement("div", "hub-settings-detail reference-body");
  frame.append(createElement("h2", "reference-title", title), body);
  root.append(stylesheet, layout, frame);
  reference.append(host);
  return { root, body };
}

function settingsSample() {
  const { body } = sample("Settings rows and actions");
  const toggle = createSettingsToggle({ checked: true, ariaLabel: "Sample toggle" });
  toggle.addEventListener("click", () => {
    const checked = toggle.getAttribute("aria-checked") !== "true";
    toggle.setAttribute("aria-checked", String(checked));
    toggle.classList.toggle("is-active", checked);
  });
  body.append(createPlayerSettingRow("Enabled", "A shared switch with a keyboard-accessible label.", toggle));
  const picker = createSettingsPicker({
    ariaLabel: "Sample source", value: "theme",
    options: [{ value: "dynamic", label: "Dynamic" }, { value: "theme", label: "Curated" }, { value: "custom", label: "Custom" }],
    onChange: (_, label) => announce(`Sample source: ${label}`)
  });
  body.append(createPlayerSettingRow("Source", "Open the picker, then use the arrow keys and Escape.", picker.element));
  const rename = createSettingsAction("Rename");
  const remove = createSettingsAction("Delete");
  rename.addEventListener("click", () => {
    const name = window.prompt("Rename sample theme", "Sample");
    if (name?.trim()) announce(`Sample renamed to ${name.trim()}`);
  });
  remove.addEventListener("click", () => {
    if (window.confirm("Delete this sample theme?")) announce("Sample deleted. Reset samples to start again.");
  });
  body.append(createSettingsActionRow({ label: "Saved theme", description: "Rename or delete this saved theme.", actions: createSettingsActions("", rename, remove) }));
}

function colourSample() {
  const { body } = sample("Colour inheritance and upload");
  const colour = createColourField({
    label: "Timeline colour", tooltip: "Override this sample colour or reset it to the theme.",
    id: "reference-colour", value: sampleAccent,
    className: "hub-colour-field hub-player-setting-row hub-theme-colour-row is-linked-colour",
    sourceLabel: "Theme colour", resetLabel: "Reset to theme"
  });
  colour.input.addEventListener("input", () => colour.setOverridden(true));
  colour.reset.addEventListener("click", () => { colour.input.value = sampleAccent; colour.setOverridden(false); });
  body.append(colour.field);
  const controls = createElement("div", "hub-custom-handle-controls");
  const upload = createArtworkUpload({
    ariaLabel: "Upload sample artwork",
    onFile: file => announce(`Selected ${file.name}. Sample only; no artwork was saved.`),
    onError: error => announce(error.message)
  });
  controls.append(upload.button, upload.input);
  body.append(createPlayerSettingRow("Custom", "Select SVG or PNG artwork to exercise the shared upload control.", controls));
  const disclosure = createSettingsDisclosure("Advanced", "", "reference-advanced");
  disclosure.content.append(createPlayerSettingRow("Expanded row", "This is the real disclosure component.", createSettingsToggle({ checked: false, ariaLabel: "Expanded sample toggle" })));
  body.append(disclosure.group);
}

function collectionSample() {
  const { root, body } = sample("Collections and menus");
  body.classList.add("reference-collections");
  let selected = "current";
  const renderTabs = () => createPanelViewTabs({
    views: [{ id: "current", label: "Playlist" }, { id: "saved", label: "Saved" }], selected,
    onSelect: value => { selected = value; tabs.replaceWith(tabs = renderTabs()); }
  });
  let tabs = renderTabs();
  body.append(tabs);
  const card = createSavedCollectionCard({
    title: "Sample playlist", total: "12:34", summary: "3 tracks", artwork: createButtonIcon("icon-play.svg"),
    ariaLabel: "Open sample playlist", onOpen: () => announce("Sample playlist opened")
  });
  const overflow = createPanelOverflow("Sample playlist actions", [
    createPanelMenuAction("Rename", "icon-settings.svg", () => announce("Sample rename selected")),
    createPanelMenuAction("Unavailable", "icon-play.svg", () => {}, { disabled: true })
  ], { activeElement: () => root.activeElement });
  card.append(overflow);
  body.append(card, createPanelEmptyState("No items in this sample."));
}

function pageCardSample() {
  const { root, body } = sample("Playlist cards and artwork");
  body.classList.add("reference-collections");
  const stylesheet = createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("collection-playlists.css");
  root.prepend(stylesheet);
  const label = createElement("label", "", "Artwork count ");
  const count = createElement("select");
  count.setAttribute("aria-label", "Sample artwork count");
  for (const value of [0, 1, 2, 4, 5]) {
    const option = createElement("option", "", String(value));
    option.value = String(value);
    count.append(option);
  }
  count.value = "5";
  label.append(count);
  const cards = createElement("div", "reference-body");
  const renderCards = () => {
    // Local, inert artwork samples; no catalogue requests or saved data.
    const items = Array.from({ length: Number(count.value) }, (_, index) => ({ art: `https://bandkit.invalid/sample-${index}.png` }));
    const artwork = variant => {
      const mosaic = createPlaylistArtwork(items, variant);
      for (const [index, image] of [...mosaic.querySelectorAll("img")].entries()) {
        image.src = chrome.runtime.getURL(["assets/icon-playlist.svg", "assets/icon-cart.svg", "assets/icon-queue.svg", "assets/icon-settings.svg", "assets/icon-bandkit.svg"][index % 5]);
      }
      return mosaic;
    };
    const pageList = createElement("ul");
    pageList.style.cssText = "list-style:none;margin:0;padding:0";
    pageList.append(createPagePlaylistCard({
      id: "reference-page", title: "Sample saved playlist", date: "September 6, 2026",
      subtitle: "5 tracks, 24 minutes", ariaLabel: "Open sample page playlist",
      artwork: artwork("page"), onOpen: () => announce("Sample page playlist opened")
    }));
    cards.replaceChildren(pageList, createSavedCollectionCard({
      title: "Sample saved playlist", total: "24:00", summary: "5 tracks", artwork: artwork("panel"),
      ariaLabel: "Open sample panel playlist", onOpen: () => announce("Sample panel playlist opened")
    }));
    if (document.querySelector("#disabled").checked) for (const button of cards.querySelectorAll("button")) button.disabled = true;
  };
  count.addEventListener("change", renderCards);
  body.append(label, cards);
  renderCards();
}

function applyTheme() {
  const theme = themes.find(item => item.id === themeSelect.value) || themes[0];
  const panel = hexColor(theme.surface), ink = readableColor(hexColor(theme.text), [panel], 7).color;
  const accent = readableColor(hexColor(theme.accent), [panel], 4.5).color;
  const muted = readableColor(hexColor(theme.secondaryText || theme.text), [panel], 4.5).color;
  sampleAccent = hexString(accent);
  const palette = { panel: colorString(panel), ink: colorString(ink), accent: colorString(accent), muted: colorString(muted), card: theme.card, line: colorString(muted) };
  for (const host of reference.children) {
    for (const [name, value] of Object.entries(palette)) host.style.setProperty(`--hub-${name}`, value);
    for (const [name, value] of Object.entries({ text: palette.ink, muted: palette.muted, accent: palette.accent, "accent-soft": colorString(accent, 0.12) })) host.style.setProperty(`--bandkit-page-${name}`, value);
    for (const surface of ["panel", "card", "card-footer"]) {
      const background = surface === "panel" ? panel : hexColor(theme.card);
      for (const [name, preferred] of [["ink", theme.text], ["muted", theme.secondaryText || theme.text], ["faint", theme.secondaryText || theme.text], ["accent", theme.accent], ["line", theme.secondaryText || theme.text]]) {
        host.style.setProperty(`--hub-${surface}-${name}`, colorString(readableColor(hexColor(preferred), [background], 4.5).color));
      }
      host.style.setProperty(`--hub-${surface}-accent-soft`, colorString(accent, 0.12));
      host.style.setProperty(`--hub-${surface}-on-accent`, colorString(readableColor(ink, [accent], 4.5).color));
    }
    host.style.setProperty("--hub-tab-foreground", colorString(ink));
    host.style.setProperty("--hub-settings-control-font-size", "13px");
    const colour = host.shadowRoot.querySelector("#reference-colour");
    if (colour && !colour.closest(".hub-colour-field").querySelector(".hub-colour-source").hidden) colour.value = sampleAccent;
  }
}
function render() {
  reference.replaceChildren();
  settingsSample(); colourSample(); collectionSample(); pageCardSample(); applyTheme();
  const disabled = document.querySelector("#disabled").checked;
  if (disabled) for (const host of reference.children) {
    for (const control of host.shadowRoot.querySelectorAll("button,input")) control.disabled = true;
  }
}
themeSelect.addEventListener("change", applyTheme);
document.querySelector("#width").addEventListener("change", event => reference.style.setProperty("--reference-width", `${event.target.value}px`));
document.querySelector("#disabled").addEventListener("change", render);
document.querySelector("#reset").addEventListener("click", () => {
  document.querySelector("#disabled").checked = false;
  resetSettingsDisclosures();
  render(); announce("Samples reset. Your Bandkit data is unchanged.");
});
render();
