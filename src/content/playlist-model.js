export function createPlaylistModel({
  isReusableStreamUrl,
  maxItems,
  normalizedTrackTitle,
  portableBandcampUrl,
  resolveImage,
  resolvedTrackPageUrl,
  safeBandcampUrl
}) {
  function canonicalPlaylistPageUrl(track) {
    let pageUrl = resolvedTrackPageUrl(track);
    try {
      const canonical = new URL(pageUrl);
      canonical.hash = "";
      canonical.search = "";
      canonical.pathname = canonical.pathname.replace(/\/+$/, "") || "/";
      pageUrl = canonical.href;
    } catch {
      pageUrl = "";
    }
    return pageUrl;
  }

  function stablePlaylistTrackId(track) {
    const id = String(track?.id || "").trim();
    return /^(?:track-)?\d+$/i.test(id) ? id.replace(/^track-/i, "") : "";
  }

  function playlistTrackKey(track) {
    const stableId = stablePlaylistTrackId(track);
    if (stableId) return `id:${stableId}`;
    const pageUrl = canonicalPlaylistPageUrl(track);
    const title = normalizedTrackTitle(track?.title);
    const artist = normalizedTrackTitle(track?.artist);
    return `${pageUrl}|${title}|${artist}`;
  }

  function playlistTracksMatch(left, right) {
    if (!left || !right) return false;
    const leftStream = String(left.url || "");
    const rightStream = String(right.url || "");
    if (leftStream && rightStream && leftStream === rightStream) return true;
    const leftStableId = stablePlaylistTrackId(left);
    const rightStableId = stablePlaylistTrackId(right);
    if (leftStableId && rightStableId) return leftStableId === rightStableId;
    if (playlistTrackKey(left) === playlistTrackKey(right)) return true;
    const leftPage = canonicalPlaylistPageUrl(left);
    const rightPage = canonicalPlaylistPageUrl(right);
    const leftTitle = normalizedTrackTitle(left.title);
    const rightTitle = normalizedTrackTitle(right.title);
    const leftArtist = normalizedTrackTitle(left.artist);
    const rightArtist = normalizedTrackTitle(right.artist);
    return Boolean(leftPage && leftPage === rightPage
      && leftTitle && leftTitle === rightTitle
      && (!leftArtist || !rightArtist || leftArtist === "bandcamp" || rightArtist === "bandcamp" || leftArtist === rightArtist));
  }

  function normalizePlaylistBpm(value) {
    const bpm = Number(value);
    return Number.isFinite(bpm) && bpm >= 40 && bpm <= 300 ? Math.round(bpm * 10) / 10 : null;
  }

  function normalizePlaylistKey(value) {
    if (!value || typeof value !== "object") return null;
    const camelot = String(value.camelot || "").trim().slice(0, 12);
    const shortName = String(value.shortName || "").trim().slice(0, 32);
    const name = String(value.name || "").trim().slice(0, 80);
    return camelot || shortName || name ? { camelot, shortName, name } : null;
  }

  function normalizePlaylistItem(track, index = 0) {
    if (!track || typeof track !== "object" || !String(track.title || "").trim()) return null;
    const pageUrl = resolvedTrackPageUrl(track);
    if (!pageUrl) return null;
    const fallbackId = `${track.id || pageUrl}|${track.title}|${index}`;
    return {
      playlistItemId: String(track.playlistItemId || `playlist-${fallbackId}`).slice(0, 500),
      id: String(track.id || track.title).slice(0, 500),
      title: String(track.title || "Untitled").slice(0, 500),
      artist: String(track.artist || "Bandcamp").slice(0, 500),
      album: String(track.album || "").slice(0, 500),
      art: resolveImage(track.art).slice(0, 4000),
      pageUrl,
      artistUrl: safeBandcampUrl(track.artistUrl),
      duration: Math.max(0, Number(track.duration) || 0),
      url: isReusableStreamUrl(track.url) ? track.url : "",
      bpm: normalizePlaylistBpm(track.bpm ?? track.detectedBpm),
      key: normalizePlaylistKey(track.key ?? track.detectedKey),
      addedAt: String(track.addedAt || ""),
      restoreError: String(track.restoreError || "").slice(0, 500)
    };
  }

  function normalizePlaylist(items) {
    const normalized = [];
    const itemIds = new Set();
    for (const [index, source] of (Array.isArray(items) ? items : []).slice(0, maxItems).entries()) {
      const item = normalizePlaylistItem(source, index);
      if (!item) continue;
      if (itemIds.has(item.playlistItemId)) item.playlistItemId = `playlist-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      itemIds.add(item.playlistItemId);
      normalized.push(item);
    }
    return normalized;
  }

  function portablePlaylistItem(item) {
    if (!item || typeof item !== "object") return null;
    const {
      url: _streamUrl,
      restoreError: _restoreError,
      ...portable
    } = item;
    return {
      ...portable,
      pageUrl: portableBandcampUrl(portable.pageUrl, true),
      artistUrl: portableBandcampUrl(portable.artistUrl)
    };
  }

  function normalizeSavedPlaylists(savedPlaylists) {
    return (Array.isArray(savedPlaylists) ? savedPlaylists : []).map((snapshot, index) => ({
      id: String(snapshot?.id || `saved-playlist-${index}`).slice(0, 500),
      name: String(snapshot?.name || "Saved playlist").trim().slice(0, 120),
      savedAt: snapshot?.savedAt || new Date().toISOString(),
      sourcePage: portableBandcampUrl(snapshot?.sourcePage),
      items: normalizePlaylist(snapshot?.items)
    })).slice(0, 30);
  }

  function mergeHydratedPlaylist(currentItems, hydratedItems) {
    const hydrated = normalizePlaylist(hydratedItems);
    const byItemId = new Map(hydrated.map((item) => [item.playlistItemId, item]));
    return normalizePlaylist(normalizePlaylist(currentItems).map((current) => {
      const refreshed = byItemId.get(current.playlistItemId)
        || hydrated.find((item) => playlistTracksMatch(item, current));
      return refreshed ? {
        ...current,
        ...refreshed,
        playlistItemId: current.playlistItemId,
        addedAt: current.addedAt || refreshed.addedAt
      } : current;
    }));
  }

  return {
    canonicalPlaylistPageUrl,
    mergeHydratedPlaylist,
    normalizePlaylist,
    normalizePlaylistBpm,
    normalizePlaylistItem,
    normalizePlaylistKey,
    normalizeSavedPlaylists,
    playlistTrackKey,
    playlistTracksMatch,
    portablePlaylistItem,
    stablePlaylistTrackId
  };
}
