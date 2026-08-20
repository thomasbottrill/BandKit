import { runtimeLive, runtimeState } from "./context.js";
import { resolvedTrackPageUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";

export function registerDjHandoff(r) {
  r.$buildSeamlessQueue = function buildSeamlessQueue() {
    const modern = r.$getModernPlayerState();
    if (modern?.queue.length) return modern.queue;
    const data = r.$getBandcampPageData();
    const art = document.querySelector('meta[property="og:image"]')?.content
      || document.querySelector("#tralbumArt img")?.src || runtimeLive.art;
    const album = document.querySelector('meta[property="og:title"]')?.content || document.title;
    if (data?.tralbum?.trackinfo) {
      return data.tralbum.trackinfo.map((track) => ({
        id: String(track.track_id || track.id || track.title),
        title: track.title,
        artist: track.artist || data.tralbum.artist || data.embed?.artist || "Bandcamp",
        album,
        art,
        pageUrl: r.$individualTrackPageUrl(track) || resolvedTrackPageUrl(track) || location.href,
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
      artistUrl: generic.artistUrl || r.$artistUrlFromPageUrl(generic.pageUrl || location.href),
      duration: Number(pageAudio.duration) || 0,
      url: pageAudio.currentSrc || pageAudio.src
    })).filter((track) => r.$isReusableStreamUrl(track.url));
  };

  r.$matchingQueueTrack = function matchingQueueTrack(queue, requested = {}) {
    const tracks = Array.isArray(queue) ? queue : [];
    const requestedUrl = String(requested.url || "");
    if (requestedUrl) {
      const urlMatch = tracks.find((track) => String(track.url || "") === requestedUrl);
      if (urlMatch) return urlMatch;
    }
    const requestedId = String(requested.id || "");
    if (requestedId) {
      const idMatch = tracks.find((track) => String(track.id || "") === requestedId);
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
      if (pageMatch) return pageMatch;
    }
    return requestedTitle
      ? tracks.find((track) => r.$normalizedTrackTitle(track.title) === requestedTitle) || null
      : null;
  };

  r.$classicPageTrackForControl = function classicPageTrackForControl(control) {
    const queue = r.$buildSeamlessQueue();
    const row = control?.closest(".track_row_view");
    const title = row
      ? r.$elementText(row, [".track-title", ".title"])
      : r.$elementText(control?.closest(".inline_player"), [".title", ".track-title"]);
    return r.$matchingQueueTrack(queue, { title }) || (!row ? queue[0] : null);
  };

  r.$handoffPageAudio = async function handoffPageAudio(pageAudio, requestedTitle = "") {
    const pageQueue = r.$buildSeamlessQueue();
    if (!pageQueue.length) return false;
    const currentTitle = requestedTitle
      || document.querySelector(".inline_player .title")?.textContent?.trim() || runtimeLive.title;
    const matchedIndex = pageQueue.findIndex((track) => track.title === currentTitle);
    const pageIndex = matchedIndex >= 0 ? matchedIndex : currentTitle ? -1 : 0;
    if (pageIndex < 0) return false;
    const prepared = await r.$prepareExternalNowPlaying(pageQueue[pageIndex], pageQueue, { trustProvidedStreams: true });
    if (prepared.index < 0) return false;
    const response = await r.$runtimeMessage({
      type: MESSAGES.SEAMLESS_ENABLE,
      queue: prepared.queue,
      index: prepared.index,
      currentTime: Number(pageAudio?.currentTime) || 0,
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
    if (!response?.ok || prepared.request !== r.$playlistPlayRequest) return false;
    if (pageAudio && !pageAudio.paused) pageAudio.pause();
    r.$applySeamlessState(response.state);
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
