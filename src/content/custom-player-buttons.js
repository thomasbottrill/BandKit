import { normalizeCustomHandle } from "./custom-scrub-handle.js";

export const PLAYER_BUTTONS = Object.freeze([["play", "Play"], ["pause", "Pause"], ["previous", "Previous"], ["next", "Next"], ["chevron", "Panel button"]]);

export function normalizeCustomPlayerButtons(value) {
  return Object.fromEntries(PLAYER_BUTTONS.flatMap(([key]) => {
    const entry = value?.[key];
    if (!entry || typeof entry !== "object") return [];
    return [[key, { enabled: entry.enabled === true, retainColors: entry.retainColors !== false, artwork: normalizeCustomHandle(entry.artwork) }]];
  }));
}

const cache = new WeakMap();
export function applyPlayerButtonArtwork(icon, entry) {
  if (!icon) return;
  if (cache.has(icon) && cache.get(icon) === entry) return;
  cache.set(icon, entry);
  const safe = entry?.enabled ? normalizeCustomHandle(entry.artwork) : null;
  icon.classList.toggle("hub-custom-player-icon", !!safe);
  if (!safe) {
    icon.style.removeProperty("--hub-custom-button-image");
    icon.style.removeProperty("--hub-custom-button-mask");
    return;
  }
  const url = safe.png ? `url("${safe.png}")` : `url("data:image/svg+xml,${encodeURIComponent(safe.svg)}")`;
  icon.style.setProperty("--hub-custom-button-image", entry.retainColors !== false ? url : "none");
  icon.style.setProperty("--hub-custom-button-mask", entry.retainColors !== false ? "none" : url);
  icon.dataset.retainColors = String(entry.retainColors !== false);
}

export function syncCustomPlayerButtons(r, state, isPlaying) {
  const entries = state.customPlayerButtons || {};
  applyPlayerButtonArtwork(r.$playButton?.querySelector(".hub-button-icon"), entries[isPlaying ? "pause" : "play"]);
  applyPlayerButtonArtwork(r.$player.querySelector(".hub-previous-button .hub-skip-icon"), entries.previous);
  applyPlayerButtonArtwork(r.$player.querySelector(".hub-next-button .hub-skip-icon"), entries.next);
  applyPlayerButtonArtwork(r.$player.querySelector(".hub-compact-panel-chevron"), entries.chevron);
}
