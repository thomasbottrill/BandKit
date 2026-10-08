// Feed stories never publish a playable stream in their markup. Bandcamp keeps
// the signed stream URLs its own player uses in a page-world track list, and
// those signatures cannot be rebuilt from the DOM, so mirror the list into the
// extension world instead of refetching each release page to rediscover a
// stream the page was already handed.
export function installFeedBridge() {
  const streamUrl = (entry) => {
    const source = entry?.file || entry?.streaming_url;
    const url = typeof source === "string" ? source : source?.["mp3-128"];
    return typeof url === "string" ? url : "";
  };

  const feedTracks = () => {
    const list = window.track_list;
    const entries = Array.isArray(list) ? list : list && typeof list === "object" ? Object.values(list) : [];
    const tracks = [];
    for (const entry of entries) {
      const trackId = String(entry?.track_id ?? entry?.id ?? "");
      const url = streamUrl(entry);
      if (!trackId || !url || entry?.is_streamable === false) continue;
      tracks.push({ trackId, url, duration: Number(entry?.duration) || 0 });
    }
    return tracks;
  };

  document.addEventListener("bandkit:feed-track-command", (event) => {
    if (event.detail?.action !== "list") return;
    document.dispatchEvent(new CustomEvent("bandkit:feed-track-state", { detail: { tracks: feedTracks() } }));
  });
}
