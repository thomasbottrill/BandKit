import { MESSAGES } from "../../shared/contracts.js";

// A feed story never publishes a playable stream in its markup, and the signed
// redirect Bandcamp hands its own player costs an extra round trip on every
// load. Mirror that list out of the page world, then resolve the redirect once
// so a story starts from the same kind of final media URL a release page uses.
export function registerFeedStreams(r) {
  r.$refreshFeedStreams = function refreshFeedStreams() {
    // The page world answers synchronously, so a miss can be retried straight
    // after this call rather than waiting for the next scan. A story Bandcamp
    // never listed would otherwise re-serialise the whole list on every pointer
    // move, so repeat misses wait for the list to have had a chance to grow.
    const now = Date.now();
    if (now - r.$feedStreamsRefreshedAt < 750) return;
    r.$feedStreamsRefreshedAt = now;
    document.dispatchEvent(new CustomEvent("bandkit:feed-track-command", { detail: { action: "list" } }));
  };

  r.$feedStreamUrl = function feedStreamUrl(trackId) {
    const id = String(trackId || "");
    if (!id) return "";
    if (!r.$feedStreams.has(id)) r.$refreshFeedStreams();
    const known = r.$feedStreams.get(id);
    return known?.resolvedUrl || known?.url || "";
  };

  r.$prefetchFeedStream = async function prefetchFeedStream(trackId) {
    // Hovering or focusing a story is the earliest reliable sign it is about to
    // be played, so the redirect is followed while the pointer is still moving.
    const id = String(trackId || "");
    if (!id) return;
    if (!r.$feedStreams.has(id)) r.$refreshFeedStreams();
    const known = r.$feedStreams.get(id);
    if (!known?.url || known.resolvedUrl || r.$feedStreamPrefetches.has(id)) return;
    r.$feedStreamPrefetches.add(id);
    try {
      const response = await r.$runtimeMessage({
        type: MESSAGES.RESOLVE_FEED_STREAMS,
        items: [{ trackId: id, url: known.url }]
      });
      const resolvedUrl = String(response?.streams?.[0]?.url || "");
      const current = r.$feedStreams.get(id);
      if (!resolvedUrl || current?.url !== known.url) return;
      r.$feedStreams.set(id, { ...current, resolvedUrl });
    } finally {
      r.$feedStreamPrefetches.delete(id);
    }
  };
}
