import { MESSAGES } from "../../shared/contracts.js";
import { createElement, formatDuration, safeBandcampReleaseUrl } from "../core.js";
import { runtimeSeamless, runtimeState } from "./context.js";
import { startPreparedPageTrack } from "./page-track-playback.js";

function releaseUrl(value) {
  const safe = safeBandcampReleaseUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  url.search = ""; url.hash = "";
  return url.href;
}

export function registerDiscoverTracks(r) {
  r.$discoverReleaseTracks = [];
  r.$discoverRelease = null;
  r.$discoverTrackPlaybackActive = false;
  r.$discoverPlaybackRequest = 0;
  r.$discoverPendingTrack = null;
  // The feed's album stories reuse the exact same compact track list markup.
  r.$createDiscoverTrackList = (release) => createTrackList(r, release);
  r.$playDiscoverReleaseTrack = async (track) => {
    r.$collectionHandoffRequest += 1;
    if (r.$pauseNativeDiscover?.(track)) return;
    r.$discoverTrackPlaybackActive = true;
    r.$silenceNativePagePlayback();
    if (!r.$discoverPendingTrack && runtimeSeamless.enabled && runtimeSeamless.status !== "error" && String(runtimeSeamless.track?.id) === track.id) {
      r.$playlistPlayRequest += 1;
      await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return;
    }
    const selection = ++r.$discoverPlaybackRequest;
    r.$discoverPendingTrack = track;
    r.$renderPlayer?.();
    try {
      const prepared = await r.$prepareExternalNowPlaying(track, r.$discoverReleaseTracks, { trustProvidedStreams: true });
      if (prepared.cancelled || prepared.request !== r.$playlistPlayRequest) return;
      if (prepared.index < 0) throw new Error(prepared.error || "This track is unavailable.");
      r.$silenceNativePagePlayback();
      const state = await startPreparedPageTrack(r, prepared, runtimeState.dj);
      if (state) r.$applySeamlessState(state);
    } catch (error) {
      if (selection === r.$discoverPlaybackRequest) r.$showToast(error.message || "Could not play this track.");
    } finally {
      if (selection === r.$discoverPlaybackRequest) {
        r.$discoverPendingTrack = null;
        r.$renderPlayer?.();
      }
    }
  };
}

function createTrackList(r, release) {
  const table = createElement("table", "bandkit-discover-tracks");
  table.setAttribute("aria-label", `${release.album} tracks`);
  const body = document.createElement("tbody");
  for (const track of release.tracks) {
    const row = createElement("tr", `track_row_view${track.url ? "" : " bandkit-modern-track-unplayable"}`);
    row.dataset.bandkitDiscoverTrackId = track.id;
    const play = createElement("td", "play-col");
    play.dataset.bandkitTrackNumber = String(track.number);
    if (track.url) {
      const button = createElement("a", "");
      button.href = track.pageUrl;
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", `Play ${track.title}`);
      button.append(createElement("span", "play_status"));
      play.append(button);
    } else play.setAttribute("aria-label", `Track ${track.number}, preview unavailable`);
    const titleCell = createElement("td", "title-col");
    const title = createElement("div", "title");
    const name = createElement("span", "track-title", track.title);
    name.title = track.title;
    title.append(name, createElement("span", "time", formatDuration(track.duration)));
    const actions = createElement("span", "download-col bandkit-discover-track-actions");
    const buy = createElement("a", "bandcamp-hub-page-buy", "Buy");
    buy.href = track.pageUrl;
    buy.setAttribute("aria-label", `Buy ${track.title}`);
    // Discover rows carry the album page's per-track controls, so a single track
    // can reach Now Playing, a playlist or a cart without leaving the panel.
    const add = r.$createPagePlaylistButton();
    add.classList.add("is-track-action");
    r.$updatePagePlaylistButton(add, track);
    actions.append(buy, add);
    title.append(actions);
    titleCell.append(title);
    row.append(play, titleCell);
    body.append(row);
  }
  table.append(body);
  return table;
}

export function setupDiscoverTracks(r) {
  if (location.hostname !== "bandcamp.com" || !/^\/discover(?:\/|$)/.test(location.pathname)) return;
  // The release add control follows the resolved tracks. Discover rebuilds its
  // release actions around a selection, so sync the control directly and stage the
  // repeats the way the native player handoff already does.
  const refreshReleaseActions = () => {
    r.$syncDiscoverReleaseAddControl?.();
    for (const delay of [0, 80, 240]) {
      window.setTimeout(() => {
        r.$syncDiscoverReleaseAddControl?.();
        r.$schedulePlaylistButtons?.();
      }, delay);
    }
  };
  let selectedUrl = "";
  let renderedUrl = "";
  let host = null;
  let request = 0;
  let scheduled = false;
  const cache = new Map();
  const clear = () => {
    request += 1;
    host?.remove(); host = null; renderedUrl = "";
    r.$discoverReleaseTracks = [];
    r.$discoverRelease = null;
    refreshReleaseActions();
    r.$pageTrackAnalysisRequest += 1;
    r.$pageTrackAnalysisStatus = "idle";
    r.$pageTrackAnalysisSignature = "";
  };
  const sync = async () => {
    scheduled = false;
    for (const target of document.querySelectorAll("#DiscoverApp .results-grid-item .focus-target:not([data-bandkit-discover-select])")) {
      const card = target.closest(".results-grid-item");
      target.dataset.bandkitDiscoverSelect = "true";
      target.removeAttribute("aria-hidden");
      target.setAttribute("role", "button");
      target.tabIndex = 0;
      target.setAttribute("aria-label", `Preview ${card.querySelector(".title")?.textContent || "album"} tracks`);
    }
    const focused = document.querySelector("#DiscoverApp .focused-result");
    // Discover initially selects a release without dispatching an artwork click.
    // Seed from that displayed release once; later clicks remain authoritative.
    if (!selectedUrl && focused) {
      selectedUrl = releaseUrl(focused.querySelector(".release-buttons a.buy-button[href]")?.href);
    }
    // The clicked card is authoritative; native preview links can lag selection.
    const url = selectedUrl;
    if (!url || !focused) {
      if (host) clear();
      return;
    }
    if (renderedUrl === url && host?.isConnected) return;
    clear();
    renderedUrl = url;
    const version = ++request;
    host = createElement("section", "bandkit-discover-tracklist");
    r.$applyPageActionTheme(host);
    host.setAttribute("aria-label", "Album tracks");
    host.setAttribute("aria-busy", "true");
    const status = createElement("p", "bandkit-discover-tracklist-status", "Loading tracks…");
    status.setAttribute("role", "status");
    host.append(status);
    // Append after Vue-owned children so its indexed updates keep their positions.
    const container = focused.querySelector(".tralbum-purchase-options-browser") || focused;
    container.append(host);
    try {
      let release = cache.get(url);
      if (!release || release.expires < Date.now()) {
        const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl: url });
        if (!response?.ok) throw new Error(response?.error || "Could not load tracks.");
        release = { ...response.release, expires: Date.now() + 5 * 60_000 };
        cache.set(url, release);
        if (cache.size > 24) cache.delete(cache.keys().next().value);
      }
      if (version !== request || !host?.isConnected) return;
      r.$discoverReleaseTracks = release.tracks.filter((track) => r.$isReusableStreamUrl(track.url));
      r.$discoverRelease = release;
      host.replaceChildren(createTrackList(r, release));
      host.setAttribute("aria-busy", "false");
      if (!release.tracks.length) host.append(createElement("p", "bandkit-discover-tracklist-status", "No tracks available."));
      r.$ensurePageStyles();
      refreshReleaseActions();
      r.$maybeAnalyzePageTracks();
      r.$syncPagePlayerUi();
    } catch {
      if (version !== request || !host?.isConnected) return;
      status.textContent = "Could not load tracks. ";
      const retry = createElement("button", "", "Retry");
      retry.type = "button";
      retry.addEventListener("click", () => { clear(); schedule(); });
      status.append(retry);
      host.setAttribute("aria-busy", "false");
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => { void sync(); }, 0);
  };
  document.addEventListener("click", (event) => {
    if (event.target.closest(".bandkit-discover-track-actions")) return;
    const row = event.target.closest("#DiscoverApp .bandkit-discover-tracks .track_row_view");
    if (row && !event.target.closest(".bandkit-track-analysis")) {
      event.preventDefault(); event.stopImmediatePropagation();
      const track = r.$discoverReleaseTracks.find((item) => item.id === row.dataset.bandkitDiscoverTrackId);
      if (track) void r.$playDiscoverReleaseTrack(track);
      return;
    }
    const art = event.target.closest(".results-grid-item .image-container");
    const nativePlay = event.target.closest(".play-pause-button, .play-button");
    if (!art || (!nativePlay && event.target.closest("button, a"))) return;
    if (r.$discoverTrackPlaybackActive || r.$discoverHandoffBusy) r.$playlistPlayRequest += 1;
    if (r.$discoverHandoffBusy) r.$discoverHandoffPending = true;
    r.$discoverTrackPlaybackActive = false;
    r.$discoverPlaybackRequest += 1;
    r.$discoverPendingTrack = null;
    selectedUrl = releaseUrl(art.closest(".results-grid-item").querySelector(".content a.stretch-link[href], a.stretch-link[href], a[href]")?.href);
    schedule();
    // Discover updates its preview button after the click has propagated. Keep
    // the generated list in step with that native state during the handoff.
    for (const delay of [0, 80, 240]) {
      window.setTimeout(() => r.$syncPagePlayerUi?.(), delay);
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    const control = event.target.closest("#DiscoverApp .bandkit-discover-tracks .play-col a, [data-bandkit-discover-select]");
    if (control) { event.preventDefault(); control.click(); }
  });
  // Watch only native selection changes; ignore our own analysis/playback mutations.
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !record.target.closest?.(".bandkit-discover-tracklist")
      && (record.type === "childList" || record.attributeName === "href"))) schedule();
  });
  const start = () => {
    const app = document.querySelector("#DiscoverApp");
    if (!app) return;
    observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  };
  start();
  schedule();
}
