import { MESSAGES } from "../shared/contracts.js";

export function installOffscreenEvents({
  audio,
  handleCommand,
  nextTrack,
  previousTrack,
  seekToTime,
  sendState,
  setAutoplayRequested,
  setPlaybackError,
  setStatus,
  shouldUpdatePausedStatus,
  stateSnapshot,
  updateMediaSession
}) {
  audio.addEventListener("play", () => {
    setAutoplayRequested(true);
    setStatus("playing");
    updateMediaSession();
    sendState(true);
  });
  audio.addEventListener("pause", () => {
    if (shouldUpdatePausedStatus()) {
      setAutoplayRequested(false);
      setStatus("paused");
    }
    updateMediaSession();
    sendState(true);
  });
  audio.addEventListener("timeupdate", () => sendState());
  audio.addEventListener("durationchange", () => sendState(true));
  audio.addEventListener("ratechange", () => sendState(true));
  audio.addEventListener("ended", () => {
    nextTrack().catch((error) => {
      setStatus("error");
      setPlaybackError(error.message);
      sendState(true);
    });
  });
  audio.addEventListener("error", () => {
    if (!audio.src) return;
    setAutoplayRequested(false);
    setStatus("error");
    setPlaybackError(`Bandcamp stream error ${audio.error?.code || "unknown"}`);
    sendState(true);
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => {
      setAutoplayRequested(true);
      return audio.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      setAutoplayRequested(false);
      audio.pause();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
    navigator.mediaSession.setActionHandler("previoustrack", () => previousTrack());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (Number.isFinite(details.seekTime)) {
        void seekToTime(details.seekTime).catch((error) => {
          setPlaybackError(error.message);
          sendState(true);
        });
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "offscreen") return false;
    handleCommand(message)
      .then((result) => sendResponse(message.type === MESSAGES.OFFSCREEN_ANALYZE_TRACKS
        ? { ok: true, results: result }
        : { ok: true, state: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message, state: stateSnapshot() }));
    return true;
  });
}
