import { MESSAGES } from "../../shared/contracts.js";
import { nowPlayingQueueSignature } from "../../shared/now-playing-session.js";

export function nowPlayingSessionSignature(state) {
  return nowPlayingQueueSignature(state);
}

export function beginNowPlayingSessionRevision(r, state) {
  r.$nowPlayingRevision = Math.max(Date.now(), Number(r.$nowPlayingRevision || 0) + 1);
  r.$lastNowPlayingSignature = nowPlayingSessionSignature(state);
  return r.$nowPlayingRevision;
}

export function persistNowPlayingSession(r, state) {
  if (r.$storageDisabled) return Promise.resolve(false);
  const signature = nowPlayingSessionSignature(state);
  if (signature !== r.$lastNowPlayingSignature) beginNowPlayingSessionRevision(r, state);
  const message = {
    type: MESSAGES.SET_NOW_PLAYING,
    playlist: state.playlist,
    playlistMode: state.playlistMode,
    playlistShuffleEnabled: state.playlistShuffleEnabled === true,
    playlistShuffleOrder: state.playlistShuffleOrder,
    revision: Math.max(0, Number(r.$nowPlayingRevision) || 0),
    transitionTrackKey: String(r.$nowPlayingTransitionTrackKey || ""),
    transitionExpiresAt: Math.max(0, Number(r.$nowPlayingTransitionExpiresAt) || 0)
  };
  r.$nowPlayingPersistChain = r.$nowPlayingPersistChain.catch(() => {}).then(() => r.$runtimeMessage(message));
  return r.$nowPlayingPersistChain;
}
