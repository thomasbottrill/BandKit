import { createElement, formatDuration } from "../core.js";
import { createSettingsRow, createSettingsRowCopy } from "../components/settings.js";
import { createSettingsDisclosure, isSettingsDisclosureOpen, openSettingsDisclosure, resetSettingsDisclosures } from "../settings-drawer.js";
import { runtimeSaveState, runtimeState } from "./context.js";

// The keyboard drives the music bar the way Bandcamp Enhancement Suite drives
// Bandcamp's own player. Every key acts on keydown and goes straight to the
// bar's own controls, so a key lands as fast as a click.
export const SEEK_STEP_SECONDS = 10;
export const LONG_SEEK_STEP_SECONDS = 30;
export const SHORTCUTS_DISCLOSURE = "keyboard-shortcuts";
export const PLAYBACK_SHORTCUTS = Object.freeze([
  ["Play or pause", "Space"],
  ["Next or previous track", "↓ ↑"],
  ["Skip 10 seconds", "← →"],
  ["Skip 30 seconds", "Shift ← →"],
  ["Jump through the track", "0–9"],
  ["Show these shortcuts", "?"]
]);
const TRACK_STEPS = { ArrowUp: -1, ArrowDown: 1 };
const SEEK_STEPS = { ArrowLeft: -1, ArrowRight: 1 };
// Anything that already gives these keys a meaning keeps them.
const KEY_OWNERS = [
  "input", "textarea", "select", "audio", "video",
  "[role='textbox']", "[role='searchbox']", "[role='combobox']", "[role='spinbutton']", "[role='slider']",
  "[role='listbox']", "[role='option']", "[role='menu']", "[role='menubar']", "[role='menuitem']",
  "[role='menuitemradio']", "[role='menuitemcheckbox']", "[role='radiogroup']", "[role='radio']",
  "[role='tablist']", "[role='tab']", "[role='grid']", "[role='treegrid']", "[role='tree']"
].join(", ");
// Space also presses whatever button has focus.
const SPACE_OWNERS = `${KEY_OWNERS}, button, summary, [role='button'], [role='checkbox'], [role='switch']`;

function shortcutFor(event) {
  const { key, shiftKey } = event;
  if (key === "?") return { action: "help", owners: KEY_OWNERS, anytime: true };
  if (key === " " && !shiftKey) return { action: "playPause", owners: SPACE_OWNERS };
  if (/^[0-9]$/.test(key) && !shiftKey) return { action: "jump", value: Number(key) / 10, owners: KEY_OWNERS };
  if (TRACK_STEPS[key] && !shiftKey) return { action: "track", value: TRACK_STEPS[key], owners: KEY_OWNERS };
  if (SEEK_STEPS[key]) {
    return { action: "seek", value: SEEK_STEPS[key] * (shiftKey ? LONG_SEEK_STEP_SECONDS : SEEK_STEP_SECONDS), owners: KEY_OWNERS, repeats: true };
  }
  return null;
}

export function createPlaybackShortcuts({ isEnabled, hasTrack, playPause, changeTrack, seekBy, seekToFraction, showHelp }) {
  return (event) => {
    const shortcut = shortcutFor(event);
    if (!shortcut || event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.composedPath().some((node) => node.isContentEditable || node.matches?.(shortcut.owners))) return;
    if (!isEnabled() || (!shortcut.anytime && !hasTrack())) return;
    event.preventDefault();
    // Holding left or right scans through the track. Any other held key would
    // fire once per repeat, so it acts once.
    if (event.repeat && !shortcut.repeats) return;
    if (shortcut.action === "help") showHelp();
    if (shortcut.action === "playPause") playPause();
    if (shortcut.action === "track") changeTrack(shortcut.value);
    if (shortcut.action === "seek") seekBy(shortcut.value);
    if (shortcut.action === "jump") seekToFraction(shortcut.value);
  };
}

// Settings › Help lists the keys in a row-sized drawer that opens in place;
// ? opens Help with it expanded.
export function createPlaybackShortcutsHelp() {
  const drawer = createSettingsDisclosure("Keyboard shortcuts", "", SHORTCUTS_DISCLOSURE);
  drawer.group.classList.add("hub-visualizer-colour-disclosure", "hub-keyboard-shortcuts");
  if (runtimeState.keyboardShortcutsEnabled === false) {
    drawer.content.append(createSettingsRow({ copy: createSettingsRowCopy("Turned off", "Switch Keyboard shortcuts back on in Features.") }));
  }
  for (const [label, keys] of PLAYBACK_SHORTCUTS) {
    drawer.content.append(createSettingsRow({ copy: createSettingsRowCopy(label, ""), control: createElement("span", "hub-settings-row-value", keys) }));
  }
  return drawer.group;
}

export function setupPlaybackShortcuts(r) {
  let pendingSeek = null;
  const seekTo = (time, duration) => {
    const seek = { time: Math.max(0, Math.min(duration, time)) };
    pendingSeek = seek;
    r.$beginScrub(true);
    r.$scrubSlider.value = String(Math.round((seek.time / duration) * 1000));
    r.$currentTimeLabel.textContent = formatDuration(seek.time);
    r.$durationLabel.textContent = `−${formatDuration(duration - seek.time)}`;
    r.$syncScrubVisual();
    void r.$finishScrub(seek.time).finally(() => {
      if (pendingSeek === seek) pendingSeek = null;
    });
  };
  const showHelp = () => {
    if (runtimeState.open && runtimeState.activeTab === "settings" && runtimeState.settingsView === "onboarding"
      && isSettingsDisclosureOpen(SHORTCUTS_DISCLOSURE)) {
      r.$setOpen(false);
      return;
    }
    resetSettingsDisclosures();
    openSettingsDisclosure(SHORTCUTS_DISCLOSURE);
    Object.assign(runtimeState, { open: true, activeTab: "settings", musicBarRecentPanel: "settings", settingsView: "onboarding", settingsSubView: "index" });
    runtimeSaveState(); r.$saveLayoutState();
    r.$render();
  };
  const handleKeydown = createPlaybackShortcuts({
    isEnabled: () => runtimeState.keyboardShortcutsEnabled !== false && !r.$onboardingActive,
    hasTrack: () => !r.$player.classList.contains("is-empty"),
    playPause: () => r.$playButton.click(),
    changeTrack: (step) => {
      pendingSeek = null;
      r.$player.querySelector(step < 0 ? ".hub-previous-button" : ".hub-next-button").click();
    },
    // Playback state trails a seek by a message round trip, so presses made
    // while one is still landing build on its target rather than the old time.
    seekBy: (seconds) => {
      const duration = Number(r.$scrubDuration) || 0;
      if (duration) seekTo((pendingSeek ? pendingSeek.time : Number(r.$scrubCurrentTime) || 0) + seconds, duration);
    },
    seekToFraction: (fraction) => {
      const duration = Number(r.$scrubDuration) || 0;
      if (duration) seekTo(fraction * duration, duration);
    },
    showHelp
  });
  document.addEventListener("keydown", handleKeydown);
  r.$app.registerCleanup(() => document.removeEventListener("keydown", handleKeydown));
}
