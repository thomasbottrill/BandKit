import { MESSAGES } from "../shared/contracts.js";

export function createStateSender(stateSnapshot) {
  let lastSentAt = 0;
  let timer = null;
  function sendState(force = false) {
    window.clearTimeout(timer);
    const elapsed = Date.now() - lastSentAt;
    if (!force && elapsed < 500) {
      timer = window.setTimeout(() => sendState(true), 500 - elapsed);
      return;
    }
    lastSentAt = Date.now();
    chrome.runtime.sendMessage({
      target: "background",
      type: MESSAGES.OFFSCREEN_STATE,
      state: stateSnapshot()
    }).catch(() => {});
  }
  return sendState;
}

export function updateMediaSessionState(audio, track) {
  if (!("mediaSession" in navigator)) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.art ? [{ src: track.art }] : []
  });
  navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
}
