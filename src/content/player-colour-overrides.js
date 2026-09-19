import { hexString } from "./color.js";
import { createColourField } from "./components/colour-field.js";
import { runtimeSaveState, runtimeState } from "./runtime/context.js";

function themeColour(r, source) {
  const theme = r.$accessibleAppearanceTheme();
  const colour = source === "surface" ? theme.panel : theme.panelAccent;
  return hexString(colour);
}

export function createPlayerColourOverride(r, {
  className = "",
  key,
  label,
  displayLabel = label,
  source = "accent",
  tooltip,
  sync
}) {
  const resolvedThemeColour = () => themeColour(r, source);
  const { field, input, reset, setOverridden } = createColourField({
    label: displayLabel, tooltip, ariaLabel: `${label} colour. ${tooltip}`, inputLabel: `${label} colour`, id: `bandkit-player-colour-${key}`,
    value: runtimeState[key] || resolvedThemeColour(),
    className: `hub-colour-field hub-player-setting-row hub-theme-colour-row is-linked-colour${className ? ` ${className}` : ""}`,
    sourceLabel: "Theme", resetLabel: "Reset", overridden: Boolean(runtimeState[key])
  });
  const apply = (value) => {
    runtimeState[key] = value;
    input.value = value || resolvedThemeColour();
    setOverridden(Boolean(value));
    sync();
  };

  r.$containThemeColourPointer?.(input);

  input.addEventListener("input", () => apply(input.value));
  input.addEventListener("change", () => {
    runtimeSaveState();
    r.$showToast(`${label} colour updated`);
  });
  reset.addEventListener("click", () => {
    apply(null);
    runtimeSaveState();
    r.$showToast(`${label} colour reset to theme`);
  });

  return field;
}

export function createControlsColourOverrides(r) {
  const syncScrubber = () => { r.$syncScrubberStyles(); r.$ensurePagePlayerWaveforms(); };
  return {
    timeline: createPlayerColourOverride(r, {
      key: "musicBarTimelineColor",
      label: "Timeline",
      displayLabel: "Colour",
      tooltip: "Override the played timeline colour in the page player and music bar, or reset it to the active theme.",
      sync: syncScrubber
    }),
    handle: createPlayerColourOverride(r, {
      key: "musicBarHandleColor",
      label: "Handle",
      displayLabel: "Colour",
      tooltip: "Override the timeline handle colour in the page player, music bar and Settings previews, or reset it to the active theme.",
      sync: syncScrubber
    }),
    playback: createPlayerColourOverride(r, {
      key: "musicBarControlsColor",
      label: "Playback controls",
      displayLabel: "Colour",
      tooltip: "Override the music bar playback-control colour, or reset it to the active theme.",
      sync: () => r.$syncMusicBarStyle()
    })
  };
}
