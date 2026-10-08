import { MESSAGES } from "../../shared/contracts.js";

// A completed runtime message is not necessarily successful audio playback.
// Refresh an expired/failed stream once, but never revive a replaced selection.
export async function startPreparedPageTrack(r, prepared, options) {
  const isCurrent = () => prepared.request === r.$playlistPlayRequest;
  let queue = prepared.queue;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!isCurrent()) return null;
    const response = await r.$runtimeMessage({
      ...options, type: MESSAGES.SEAMLESS_ENABLE, queue, index: prepared.index,
      currentTime: 0, autoplay: true
    });
    if (!isCurrent()) return null;
    if (response?.stale) return null;
    if (response?.ok && response.state && response.state.status !== "error") return response.state;
    const error = response?.state?.error || response?.error || "Could not play this track.";
    if (attempt || response?.transient) throw new Error(error);
    const selected = queue[prepared.index];
    const refreshed = await r.$runtimeMessage({
      type: MESSAGES.RESOLVE_PLAYLIST_ITEMS,
      // Do not allow the resolver's offline fallback to reuse the broken URL.
      items: [{ ...selected, url: "" }]
    });
    if (!isCurrent()) return null;
    const freshTrack = refreshed?.items?.[0];
    if (!refreshed?.ok || !r.$isReusableStreamUrl(freshTrack?.url)) throw new Error(error);
    queue = queue.map((track, index) => index === prepared.index ? { ...selected, ...freshTrack } : track);
  }
  return null;
}
