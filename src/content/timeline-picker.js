import { createArtworkUpload } from "./components/artwork-upload.js";
import { createPlayerSettingLabel, createSettingsToggle } from "./components/settings.js";
import { TIMELINE_STYLES, normalizeTimelineStyle, createTimelinePreview, applyTimelinePath } from "./timeline-styles.js";
import { createSettingsPicker } from "./settings-picker.js";
import { runtimeState, runtimeSaveState } from "./runtime/context.js";
import { createElement, createButtonIcon } from "./core.js";
import { importCustomTimeline, TIMELINE_ARTWORK_HELP } from "./custom-timeline.js";

export function createTimelinePicker(r) {
  const customRows = createElement("div", "hub-custom-timeline-settings hub-settings-dependent-options");
  customRows.hidden = runtimeState.scrubberStyle !== "custom";
  const update = () => {
    r.$syncScrubberStyles(); r.$ensurePagePlayerWaveforms(); runtimeSaveState();
  };
  const row = createElement("div", "hub-player-setting-row");
  const label = createPlayerSettingLabel("Artwork", TIMELINE_ARTWORK_HELP, { ariaLabel: `Custom timeline artwork. ${TIMELINE_ARTWORK_HELP}` });
  const controls = createElement("div", "hub-custom-timeline-controls");
  const saved = runtimeState.customTimeline;
  if (saved) {
    const preview = createTimelinePreview("waveform");
    applyTimelinePath(preview, "preview", 100, "custom", saved, runtimeState.retainTimelineColors);
    const name = createElement("span", "hub-custom-handle-name", saved.name);
    name.dataset.settingsTooltip = saved.name;
    name.tabIndex = 0;
    controls.append(preview, name);
  }
  const { button: upload, input } = createArtworkUpload({
    ariaLabel: "Upload custom timeline SVG or PNG",
    onFile: async (file) => {
      runtimeState.customTimeline = await importCustomTimeline(file);
      runtimeState.scrubberStyle = "custom";
      update(); r.$render(); r.$showToast("Custom timeline uploaded");
    },
    onError: (error) => r.$showToast(error.message || "Could not load timeline artwork")
  });
  controls.append(upload, input); row.append(label, controls); customRows.append(row);
  if (saved) {
    const colorRow = createElement("div", "hub-player-setting-row");
    const enabled = runtimeState.retainTimelineColors !== false;
    const toggle = createSettingsToggle({ checked: enabled, ariaLabel: "Retain timeline colours" });
    toggle.addEventListener("click", () => {
      runtimeState.retainTimelineColors = !enabled; update(); r.$render();
    });
    colorRow.append(createElement("span", "hub-player-setting-label", "Retain colours"), toggle);
    customRows.append(colorRow);
  }
  const picker = createSettingsPicker({
    ariaLabel: "Timeline style",
    options: [{ value: "custom", label: "Custom" }, ...TIMELINE_STYLES],
    className: "hub-timeline-picker",
    renderPreview: (style) => style === "custom" ? createButtonIcon("icon-settings.svg") : createTimelinePreview(style),
    value: runtimeState.scrubberStyle,
    onChange: (nextStyle, label) => {
      runtimeState.scrubberStyle = normalizeTimelineStyle(nextStyle);
      customRows.hidden = nextStyle !== "custom";
      r.$syncScrubberStyles();
      r.$ensurePagePlayerWaveforms();
      runtimeSaveState();
      r.$showToast(`${label} timelines enabled`);
    }
  });
  return { ...picker, customRows };
}
