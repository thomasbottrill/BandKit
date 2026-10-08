import { runtimeLive, runtimeSeamless, runtimeState } from "./context.js";
import { resolvedTrackPageUrl, safeBandcampReleaseUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";

function registerClassicPageSeekState(r) {
  r.$clearClassicPagePendingSeek = function clearClassicPagePendingSeek(expectedRequest = 0) {
    if (expectedRequest && r.$classicPagePendingSeekRequest !== expectedRequest) return;
    r.$classicPagePendingSeekFraction = null;
    r.$classicPagePendingSeekRequest = 0;
    r.$classicPagePendingSeekTrackKey = "";
  };

  r.$queueClassicPageSeek = function queueClassicPageSeek(fraction) {
    const request = Number(r.$classicPageHandoffRequest) || 0;
    const trackKey = String(r.$classicPageHandoffTrackKey || "");
    if (!request || !trackKey) return false;
    r.$classicPagePendingSeekFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
    r.$classicPagePendingSeekRequest = request;
    r.$classicPagePendingSeekTrackKey = trackKey;
    r.$classicPagePendingSeekRevision += 1;
    r.$renderPlayer?.();
    return true;
  };
}

function resetClassicPageHandoff(r, expectedRequest = 0) {
  r.$classicPageHandoffTrackKey = "";
  r.$classicPageHandoffTrack = null;
  r.$clearClassicPagePendingSeek(expectedRequest);
  r.$renderPlayer?.();
}

function requestedPageQueue(queue, buildQueue) {
  return Array.isArray(queue) && queue.length ? queue : buildQueue();
}

export function classicPageReleaseMetadata(data, pageUrl = "", pageTitle = "") {
  const tralbum = data?.tralbum || {};
  const embed = data?.embed || {};
  const albumEmbed = embed.album_embed_data || {};
  const isTrackPage = tralbum.current?.type === "track" || tralbum.item_type === "track";
  const albumPath = albumEmbed.linkback || tralbum.album_url || tralbum.album_upsell_url || "";
  const currentPageUrl = pageUrl || location.href;
  let linkedAlbumUrl = "";
  if (albumPath) {
    try {
      linkedAlbumUrl = safeBandcampReleaseUrl(new URL(albumPath, currentPageUrl).href);
    } catch {
      linkedAlbumUrl = "";
    }
  }
  const fallbackTitle = pageTitle || document.querySelector('meta[property="og:title"]')?.content || document.title;
  return {
    album: String(albumEmbed.album_title || embed.album_title || (isTrackPage ? "" : fallbackTitle) || "").trim(),
    releaseUrl: isTrackPage && linkedAlbumUrl ? linkedAlbumUrl : currentPageUrl
  };
}

export function registerDjHandoff(r) {
  registerClassicPageSeekState(r);
  r.$resetClassicPageHandoff = (expectedRequest = 0) => resetClassicPageHandoff(r, expectedRequest);
  r.$buildSeamlessQueue = function buildSeamlessQueue() {
    if (document.querySelector("#DiscoverApp, .bandkit-collection-preview")) return r.$discoverReleaseTracks || []; const daily = r.$getDailyPlayerState(); if (daily?.queue.length) return daily.queue;
    const modern = r.$getModernPlayerState();
    if (modern?.queue.length) return modern.queue;
    const data = r.$getBandcampPageData();
    const art = document.querySelector('meta[property="og:image"]')?.content
      || document.querySelector("#tralbumArt img")?.src || runtimeLive.art;
    const { album, releaseUrl } = classicPageReleaseMetadata(data);
    if (data?.tralbum?.trackinfo) {
      return data.tralbum.trackinfo.map((track) => ({
        id: String(track.track_id || track.id || track.title),
        title: track.title,
        artist: track.artist || data.tralbum.artist || data.embed?.artist || "Bandcamp",
        album,
        art,
        pageUrl: r.$individualTrackPageUrl(track) || resolvedTrackPageUrl(track) || location.href,
        releaseUrl,
        artistUrl: r.$artistUrlFromPageUrl(location.href),
        duration: Number(track.duration) || 0,
        url: track.file?.["mp3-128"]
      })).filter((track) => r.$isReusableStreamUrl(track.url));
    }
    const generic = r.$getGenericPageItem() || runtimeLive;
    return [...document.querySelectorAll("audio")].map((pageAudio, index) => ({
      id: `${location.href}|${generic.title}|${index}`,
      title: generic.title || `Bandcamp track ${index + 1}`,
      artist: generic.artist || "Bandcamp",
      album,
      art: generic.art || art,
      pageUrl: generic.pageUrl || location.href,
      releaseUrl,
      artistUrl: generic.artistUrl || r.$artistUrlFromPageUrl(generic.pageUrl || location.href),
      duration: Number(pageAudio.duration) || 0,
      url: pageAudio.currentSrc || pageAudio.src
    })).filter((track) => r.$isReusableStreamUrl(track.url));
  };

  r.$matchingQueueTrack = function matchingQueueTrack(queue, requested = {}) {
    const tracks = Array.isArray(queue) ? queue : [];
    const requestedPlaylistItemId = String(requested.playlistItemId || "");
    if (requestedPlaylistItemId) {
      const playlistItemMatch = tracks.find((track) => String(track.playlistItemId || "") === requestedPlaylistItemId);
      if (playlistItemMatch) return playlistItemMatch;
    }
    const requestedUrl = String(requested.url || "");
    if (requestedUrl) {
      const urlMatch = tracks.find((track) => String(track.url || "") === requestedUrl);
      if (urlMatch) return urlMatch;
    }
    const requestedId = String(requested.id || "");
    if (/^(?:track-)?\d+$/i.test(requestedId)) {
      const stableId = requestedId.replace(/^track-/i, "");
      const idMatch = tracks.find((track) => String(track.id || "").replace(/^track-/i, "") === stableId);
      if (idMatch) return idMatch;
    }
    const identityMatch = tracks.find((track) => r.$playlistTracksMatch(track, requested));
    if (identityMatch) return identityMatch;
    const requestedPageUrl = resolvedTrackPageUrl(requested);
    const requestedTitle = r.$normalizedTrackTitle(requested.title);
    if (requestedPageUrl) {
      const requestedKeyUrl = r.$canonicalPlaylistPageUrl(requested);
      const pageMatch = tracks.find((track) => r.$canonicalPlaylistPageUrl(track) === requestedKeyUrl
        && (!requestedTitle || r.$normalizedTrackTitle(track.title) === requestedTitle));
      // A canonical release URL is a stronger identity than a display title.
      // Search results often share titles, so falling through here could make
      // a different release toggle the currently playing track instead.
      return pageMatch || null;
    }
    return requestedTitle
      ? tracks.find((track) => r.$normalizedTrackTitle(track.title) === requestedTitle) || null
      : null;
  };

  r.$classicPageTrackForControl = function classicPageTrackForControl(control) {
    const daily = r.$getDailyPlayerState(control); if (daily?.track) return daily.track;
    const queue = r.$buildSeamlessQueue();
    const pageData = r.$getBandcampPageData();
    const trackForRow = (row) => {
      if (!row) return null;
      const trackNumber = Number((row.getAttribute("rel") || "").match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
      const sourceTrack = trackNumber > 0 ? pageData?.tralbum?.trackinfo?.[trackNumber - 1] : null;
      const pageUrl = row.querySelector(".track-title[href], a[href*='/track/']")?.href || "";
      return r.$matchingQueueTrack(queue, {
        id: sourceTrack?.track_id || sourceTrack?.id,
        url: sourceTrack?.file?.["mp3-128"],
        pageUrl,
        title: sourceTrack?.title || r.$elementText(row, [".track-title", ".title"]),
        artist: sourceTrack?.artist
      }) || null;
    };
    const row = control?.closest(".track_row_view");
    if (row) return trackForRow(row);
    const currentRow = document.querySelector(".track_row_view.current_track, .track_row_view.current, .track_row_view.bandcamp-hub-current");
    const currentTrack = trackForRow(currentRow);
    if (currentTrack) return currentTrack;
    const title = r.$elementText(control?.closest(".inline_player"), [".title", ".track-title"]);
    return r.$matchingQueueTrack(queue, { title }) || queue[0] || null;
  };

  r.$handoffPageAudio = async function handoffPageAudio(pageAudio, requestedTrack = null, requestedQueue = null) {
    const handoffRequest = ++r.$classicPageHandoffRequest;
    r.$clearClassicPagePendingSeek();
    const pageQueue = requestedPageQueue(requestedQueue, r.$buildSeamlessQueue);
    if (!pageQueue.length) return false;
    const requested = typeof requestedTrack === "string"
      ? { title: requestedTrack }
      : requestedTrack || r.$getDailyPlayerState()?.track || r.$classicPageTrackForControl(
        document.querySelector(".track_row_view.current_track .play-col > a, .track_row_view.current .play-col > a, .track_row_view.bandcamp-hub-current .play-col > a")
      ) || { title: document.querySelector(".inline_player .title")?.textContent?.trim() || runtimeLive.title };
    const matchedTrack = r.$matchingQueueTrack(pageQueue, requested);
    const pageIndex = matchedTrack ? pageQueue.indexOf(matchedTrack) : -1;
    if (pageIndex < 0) return false;
    const handoffTrackKey = r.$playlistTrackKey(pageQueue[pageIndex]);
    r.$classicPageHandoffTrackKey = handoffTrackKey;
    r.$classicPageHandoffTrack = pageQueue[pageIndex];
    r.$renderPlayer?.();
    try {
      const prepared = await r.$prepareExternalNowPlaying(pageQueue[pageIndex], pageQueue, { trustProvidedStreams: true });
      if (handoffRequest !== r.$classicPageHandoffRequest
        || prepared.request !== r.$playlistPlayRequest
        || prepared.index < 0) return false;
      const preparedDuration = Number(prepared.queue[prepared.index]?.duration) || 0;
      const pendingSeekAtSend = r.$classicPagePendingSeekRequest === handoffRequest
        && r.$classicPagePendingSeekTrackKey === handoffTrackKey
        ? r.$classicPagePendingSeekFraction : null;
      const pendingSeekRevisionAtSend = r.$classicPagePendingSeekRevision;
      const handoffCurrentTime = pendingSeekAtSend === null
        ? Number(pageAudio?.currentTime) || 0
        : preparedDuration * pendingSeekAtSend;
      const response = await r.$runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE,
        queue: prepared.queue,
        index: prepared.index,
        currentTime: handoffCurrentTime,
        handoffStartedAt: Date.now(),
        autoplay: true,
        rate: runtimeState.dj.rate,
        preservePitch: runtimeState.dj.preservePitch,
        filterValue: runtimeState.dj.filterValue,
        gainDb: runtimeState.dj.gainDb,
        eqLowDb: runtimeState.dj.eqLowDb,
        eqMidDb: runtimeState.dj.eqMidDb,
        eqHighDb: runtimeState.dj.eqHighDb
      });
      if (!response?.ok
        || handoffRequest !== r.$classicPageHandoffRequest
        || prepared.request !== r.$playlistPlayRequest) return false;
      if (pageAudio && !pageAudio.paused) pageAudio.pause();
      r.$applySeamlessState(response.state);
      const pendingSeekAfterResponse = r.$classicPagePendingSeekRequest === handoffRequest
        && r.$classicPagePendingSeekTrackKey === handoffTrackKey
        ? r.$classicPagePendingSeekFraction : null;
      const responseDuration = Number(response.state?.duration)
        || Number(response.state?.track?.duration)
        || preparedDuration;
      const pendingSeekTime = pendingSeekAfterResponse === null ? null : responseDuration * pendingSeekAfterResponse;
      if (pendingSeekTime !== null && responseDuration > 0
        && (r.$classicPagePendingSeekRevision !== pendingSeekRevisionAtSend
          || pendingSeekAtSend === null
          || !preparedDuration
          || Math.abs(pendingSeekTime - handoffCurrentTime) > 0.05)) {
        await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: pendingSeekTime });
      }
      return true;
    } finally {
      if (handoffRequest === r.$classicPageHandoffRequest) {
        r.$resetClassicPageHandoff(handoffRequest);
      }
    }
  };

  r.$requestClassicPagePlayback = function requestClassicPagePlayback(control) {
    const daily = r.$getDailyPlayerState(control); const requestedTrack = daily?.track || r.$classicPageTrackForControl(control);
    if (!requestedTrack) return false;
    const requestedKey = r.$playlistTrackKey(requestedTrack);
    if (requestedKey && requestedKey === r.$classicPageHandoffTrackKey) {
      r.$classicPageHandoffRequest += 1;
      r.$playlistPlayRequest += 1;
      r.$resetClassicPageHandoff();
      void r.$seamlessCommand(MESSAGES.SEAMLESS_DISABLE);
      return true;
    }
    const controlsCurrentTrack = Boolean(runtimeSeamless.enabled
      && r.$matchingQueueTrack([requestedTrack], runtimeSeamless.track || {}));
    if (controlsCurrentTrack) {
      r.$classicPageHandoffRequest += 1;
      r.$resetClassicPageHandoff();
      void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return true;
    }
    void r.$handoffPageAudio(null, requestedTrack, daily?.queue);
    return true;
  };

  r.$seamlessCommand = async function seamlessCommand(type, details = {}) {
    const response = await r.$runtimeMessage({ type, ...details });
    if (!response?.ok) {
      if (response?.transient) return null;
      r.$showToast(response?.error || "Seamless playback command failed.");
      return null;
    }
    if (response.state) r.$applySeamlessState(response.state);
    return response.state;
  };
}
