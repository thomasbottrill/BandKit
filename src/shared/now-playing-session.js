export function nowPlayingQueueSignature(state) {
  const playlist = (Array.isArray(state?.playlist) ? state.playlist : []).map((item) => ({
    identity: String(item?.playlistItemId || item?.id || [item?.pageUrl, item?.title, item?.artist].join("|")),
    pageUrl: String(item?.pageUrl || ""),
    title: String(item?.title || ""),
    artist: String(item?.artist || "")
  }));
  return JSON.stringify({
    playlist,
    playlistMode: state?.playlistMode === "manual" ? "manual" : "browse",
    playlistShuffleEnabled: state?.playlistShuffleEnabled === true,
    playlistShuffleOrder: Array.isArray(state?.playlistShuffleOrder) ? state.playlistShuffleOrder : []
  });
}
