import { createArtworkUpload } from "./components/artwork-upload.js";
import { createPlayerSettingLabel, createSettingsToggle } from "./components/settings.js";
import { createElement, createButtonIcon } from "./core.js";
import { createSettingsPicker } from "./settings-picker.js";
import { importCustomHandle } from "./custom-scrub-handle.js";
import { PLAYER_BUTTONS, applyPlayerButtonArtwork, syncCustomPlayerButtons } from "./custom-player-buttons.js";
import { runtimeState, runtimeLive, runtimeSaveState } from "./runtime/context.js";

const PLAYER_BUTTON_TOOLTIPS = Object.freeze({
  play: "Artwork shown when playback is paused or ready to start.",
  pause: "Artwork shown while the current track is playing.",
  previous: "Artwork for the control that returns to the previous track.",
  next: "Artwork for the control that advances to the next track.",
  chevron: "Artwork for the button that opens and closes the player panel."
});

export function createPlayerButtonSettings(r) {
  const group = createElement("section", "hub-custom-button-settings");
  const save = (key, entry) => {
    runtimeState.customPlayerButtons = { ...runtimeState.customPlayerButtons, [key]: entry };
    syncCustomPlayerButtons(r, runtimeState, runtimeLive.isPlaying);
    runtimeSaveState(); r.$render();
  };
  for (const [key, label] of PLAYER_BUTTONS) {
    const entry = runtimeState.customPlayerButtons?.[key] || { enabled: false, retainColors: true, artwork: null };
    const row = createElement("div", "hub-player-setting-row");
    const tooltip = PLAYER_BUTTON_TOOLTIPS[key];
    const picker = createSettingsPicker({
      ariaLabel: `${label} artwork`, value: entry.enabled ? "custom" : "default",
      options: [{ value: "custom", label: "Custom" }, { value: "default", label: "Default" }],
      renderPreview: value => createButtonIcon(value === "custom" ? "icon-settings.svg" : key === "chevron" ? "icon-panel-caret.svg" : key === "previous" || key === "next" ? "icon-skip.svg" : `icon-${key}.svg`),
      onChange: value => save(key, { ...entry, enabled: value === "custom" })
    });
    const roleLabel = createPlayerSettingLabel(label, tooltip, { ariaLabel: `${label}. ${tooltip}` });
    row.append(roleLabel, picker.element); group.append(row);
    if (!entry.enabled) continue;
    const uploadRow = createElement("div", "hub-player-setting-row hub-settings-dependent-row");
    const hint = "Upload SVG (up to 128 KB) or PNG (up to 4 MB). Transparent PNGs are supported. Artwork fits within the existing button without stretching. Use a square canvas, ideally 128 × 128 pixels. For the panel button, draw its chevron pointing up; it rotates when the panel closes.";
    const uploadLabel = createPlayerSettingLabel("Custom", hint, { ariaLabel: `${label} custom artwork. ${hint}` });
    const actions = createElement("div", "hub-custom-timeline-controls");
    if (entry.artwork) {
      const preview = createButtonIcon("icon-play.svg");
      applyPlayerButtonArtwork(preview, entry);
      const name = createElement("span", "hub-custom-handle-name", entry.artwork.name);
      name.dataset.settingsTooltip = entry.artwork.name;
      name.tabIndex = 0;
      actions.append(preview, name);
    }
    const { button, input } = createArtworkUpload({
      ariaLabel: `Upload ${label.toLowerCase()} artwork`,
      accept: ".png,.svg,image/png,image/svg+xml",
      onFile: async (file) => save(key, { ...entry, artwork: await importCustomHandle(file) }),
      onError: (error) => r.$showToast(error.message || "Could not load button artwork")
    });
    actions.append(button, input); uploadRow.append(uploadLabel, actions); group.append(uploadRow);
    if (entry.artwork) {
      const colourRow = createElement("div", "hub-player-setting-row hub-settings-dependent-row");
      const toggle = createSettingsToggle({ checked: entry.retainColors, ariaLabel: `Retain ${label.toLowerCase()} colours` });
      toggle.addEventListener("click", () => save(key, { ...entry, retainColors: !entry.retainColors }));
      colourRow.append(createElement("span", "hub-player-setting-label", "Retain colours"), toggle); group.append(colourRow);
    }
  }
  return group;
}
