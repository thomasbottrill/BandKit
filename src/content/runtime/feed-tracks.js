import { MESSAGES } from "../../shared/contracts.js";
import { asset, createElement, safeBandcampReleaseUrl } from "../core.js";
import { runtimeSeamless, runtimeState } from "./context.js";

const FEED_ALBUM_CLASS = "bandkit-feed-album";
const TRACKLIST_SELECTOR = ".bandkit-discover-tracklist";

function releaseUrl(value) {
  const safe = safeBandcampReleaseUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  url.search = ""; url.hash = "";
  return url.href;
}

function storyRelease(story) {
  // The release link is the stronger signal: pre-orders and track purchases can
  // point at an album, and that album still has a list to expand.
  const url = releaseUrl(story.querySelector("a.item-link[href]")?.href);
  if (/\/album\/|\/track\//.test(url)) return { url };
  // Stories whose release link has not hydrated yet keep a feed placeholder;
  // only a real release URL can be expanded into a track list.
  const itemType = String(story.dataset.itemtype || story.dataset.tralbumtype || "").toLowerCase();
  if (!itemType || itemType === "a" || itemType === "album" || itemType === "t" || itemType === "track") return { url: "" };
  return null;
}

// The album-level manual analysis control joins the story's icon row; the feed
// never starts BPM and key analysis on its own.
function updateFeedAnalyzeButton(r, host) {
  const story = host.closest(`.${FEED_ALBUM_CLASS}`);
  const row = story?.querySelector(".bandkit-feed-action-row, .tralbum-wrapper-collect-controls ul");
  const tracks = r.$feedAlbumQueues.get(host) || [];
  let item = row?.querySelector(":scope > .bandkit-feed-analyze-item");
  if (runtimeState.djToolsEnabled === false || !tracks.length || !row) {
    item?.remove();
    return;
  }
  let button = item?.querySelector(":scope > .bandkit-feed-analyze-tracks");
  if (!item) {
    item = createElement("li", "bandkit-feed-analyze-item");
    // Sit with the other icons; the chevron's auto margin keeps it trailing.
    const chevronItem = row.querySelector(":scope > .bandkit-feed-chevron-item");
    if (chevronItem) row.insertBefore(item, chevronItem);
    else row.append(item);
  }
  if (!button) {
    button = createElement("button", "bandkit-feed-analyze-tracks");
    button.type = "button";
    button.style.setProperty("--bandkit-feed-analyze-icon", `url('${asset("icon-bpm.svg")}')`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void r.$analyzeFeedAlbumTracks(host);
    });
    item.append(button);
  }
  const analyzing = host.dataset.bandkitAnalysisStatus === "analyzing";
  const hasResults = tracks.some((track) => r.$pageTrackAnalysis?.get(r.$pageAnalysisTrackKey(track)));
  button.disabled = analyzing;
  button.classList.toggle("is-analyzing", analyzing);
  const noun = /\/album\//.test(host.dataset.bandkitFeedAlbumUrl || "") ? "album" : "track";
  const label = analyzing
    ? `Analyzing BPM & key for this ${noun}…`
    : `${hasResults ? "Re-analyze" : "Analyze"} BPM & key for this ${noun}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-busy", String(analyzing));
}

function syncFeedTrackAnalysisUi(r) {
  if (runtimeState.djToolsEnabled === false) {
    document.querySelectorAll(`.${FEED_ALBUM_CLASS} .bandkit-track-analysis, .${FEED_ALBUM_CLASS} .bandkit-feed-track-analyze`).forEach((label) => label.remove());
    document.querySelectorAll(".bandkit-feed-analyze-item, .bandkit-feed-chevron-item").forEach((item) => item.remove());
    document.querySelectorAll(`.${FEED_ALBUM_CLASS} ${TRACKLIST_SELECTOR}`).forEach((host) => delete host.dataset.bandkitAnalysisUiSignature);
    return;
  }
  const settings = `${runtimeState.showTrackKeys !== false}|${runtimeState.showCamelotNotation === true}`;
  for (const host of document.querySelectorAll(`.${FEED_ALBUM_CLASS} ${TRACKLIST_SELECTOR}`)) {
    const tracks = r.$feedAlbumQueues.get(host) || [];
    const analyzing = host.dataset.bandkitAnalysisStatus === "analyzing";
    const rows = host.querySelectorAll(".track_row_view");
    // Re-rendering every row on every playback update is what made long feed
    // pages hitch; only a real analysis change can alter these labels.
    const signature = `${rows.length}|${analyzing ? 1 : 0}|${settings}|${tracks.map((track) => {
      const key = r.$pageAnalysisTrackKey(track);
      const result = r.$pageTrackAnalysis?.get(key);
      const pending = r.$feedTrackAnalysisPending?.has(key);
      return `${key}:${pending ? "p" : ""}${result ? `${result.bpm ?? ""}/${result.key?.shortName ?? ""}/${result.error ? "e" : ""}` : ""}`;
    }).join(",")}`;
    if (host.dataset.bandkitAnalysisUiSignature === signature) continue;
    host.dataset.bandkitAnalysisUiSignature = signature;
    for (const row of rows) {
      const track = tracks.find((item) => String(item.id) === String(row.dataset.bandkitDiscoverTrackId));
      const trackKey = track ? r.$pageAnalysisTrackKey(track) : "";
      const result = track ? r.$pageTrackAnalysis?.get(trackKey) : null;
      const pending = Boolean(trackKey && r.$feedTrackAnalysisPending?.has(trackKey));
      const text = r.$pageAnalysisLabel(result) || (track && !pending && analyzing ? "Analyzing…" : "");
      const title = row.querySelector(".title-col .title");
      let label = row.querySelector(".bandkit-track-analysis");
      if (!text) {
        label?.remove();
        title?.classList.remove("bandkit-has-track-analysis");
      } else {
        if (!label) {
          label = createElement("span", "bandkit-track-analysis");
          const duration = row.querySelector(".title-col .time, .title .time, .time");
          if (duration) duration.after(label);
          else title?.append(label);
        }
        title?.classList.add("bandkit-has-track-analysis");
        r.$renderPageAnalysisLabel(label, result, !result, track);
      }
      // Un-analysed rows carry their own analyze control so one track can be
      // picked without expanding the whole album.
      let button = row.querySelector(".bandkit-feed-track-analyze");
      if (!track || text) {
        button?.remove();
        continue;
      }
      if (!button) {
        button = createElement("button", "bandkit-feed-track-analyze");
        button.type = "button";
        button.style.setProperty("--bandkit-feed-analyze-icon", `url('${asset("icon-bpm.svg")}')`);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const trackRow = button.closest(".track_row_view");
          const trackHost = button.closest(TRACKLIST_SELECTOR);
          const picked = (r.$feedAlbumQueues.get(trackHost) || [])
            .find((item) => String(item.id) === String(trackRow?.dataset.bandkitDiscoverTrackId));
          if (picked) void r.$analyzeFeedTrack(trackHost, picked);
        });
        const duration = row.querySelector(".title-col .time, .title .time, .time");
        if (duration) duration.after(button);
        else title?.append(button);
      }
      button.disabled = pending;
      button.classList.toggle("is-analyzing", pending);
      button.setAttribute("aria-busy", String(pending));
      const actionLabel = pending
        ? `Analyzing ${track.title}…`
        : `Analyze BPM & key for ${track.title}`;
      button.title = actionLabel;
      button.setAttribute("aria-label", actionLabel);
    }
    updateFeedAnalyzeButton(r, host);
  }
}

const narrowFeedLayout = window.matchMedia("(max-width: 1180px)");

// A flick carries many cards through the observer margin at once; mounting their
// lists mid-flick rebuilds the page layout and drops frames. The gate reports a
// fast scroll and asks for one sync once the scroll slows down again.
function createScrollGate(schedule) {
  const IDLE_MS = 160;
  const FAST_PX = 600;
  const samples = [];
  let timer = 0;
  const note = () => {
    const now = performance.now();
    samples.push({ t: now, y: document.scrollingElement?.scrollTop ?? window.scrollY ?? 0 });
    while (samples.length > 2 && now - samples[0].t > IDLE_MS * 2) samples.shift();
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      schedule();
    }, IDLE_MS);
  };
  document.addEventListener("scroll", note, { capture: true, passive: true });
  return () => {
    const now = performance.now();
    const recent = samples.filter((sample) => now - sample.t <= IDLE_MS * 2);
    if (recent.length < 2 || now - recent[recent.length - 1].t > IDLE_MS) return false;
    return Math.abs(recent[recent.length - 1].y - recent[0].y) > FAST_PX;
  };
}

function createTracklistHost(r, story) {
  const details = story.querySelector(".tralbum-details");
  if (!details) return null;
  let host = details.querySelector(`:scope > ${TRACKLIST_SELECTOR}`);
  if (host) return host;
  host = createElement("section", "bandkit-discover-tracklist");
  r.$applyPageActionTheme?.(host);
  host.setAttribute("aria-label", "Album tracks");
  host.setAttribute("aria-busy", "true");
  const status = createElement("p", "bandkit-discover-tracklist-status", "Loading tracks…");
  status.setAttribute("role", "status");
  host.append(status);
  // Appending keeps Vue's indexed children untouched; the featured track is
  // already the last native child, so the list starts directly beneath it.
  details.append(host);
  return host;
}

// Release stories put the release name, icon row and generated list in the main
// column, with the artwork, featured track and owners strip in the side column.
function ensureLayout(story) {
  const wrapper = story.querySelector(".tralbum-wrapper");
  const col1 = wrapper?.querySelector(":scope > .tralbum-wrapper-col1");
  const details = col1?.querySelector(":scope > .tralbum-details");
  if (!wrapper || !col1 || !details) return false;
  let side = wrapper.querySelector(":scope > .bandkit-feed-album-side");
  if (!side) {
    side = createElement("div", "bandkit-feed-album-side");
    wrapper.append(side);
  }
  const art = col1.querySelector(":scope > .tralbum-art-container");
  if (art && art.parentElement !== side) side.append(art);
  const owners = wrapper.querySelector(":scope > .tralbum-wrapper-col2");
  if (owners && owners.parentElement !== side) side.append(owners);
  const controls = story.querySelector(":scope > .tralbum-wrapper-collect-controls");
  if (controls && controls.parentElement !== details) details.append(controls);
  // The featured track sits under the artwork on the wide layout and returns
  // to its native place in the details column once the grid collapses.
  const favTrack = story.querySelector(".collection-item-fav-track");
  if (favTrack) {
    if (narrowFeedLayout.matches) {
      const itemLink = details.querySelector(":scope > .item-link");
      if (itemLink && favTrack.previousElementSibling !== itemLink) itemLink.after(favTrack);
    } else if (favTrack.parentElement !== side) {
      if (art) art.after(favTrack);
      else side.prepend(favTrack);
    }
  }
  return true;
}

function restoreLayout(story) {
  const wrapper = story.querySelector(".tralbum-wrapper");
  const side = wrapper?.querySelector(":scope > .bandkit-feed-album-side");
  const details = wrapper?.querySelector(".tralbum-wrapper-col1 > .tralbum-details");
  const controls = story.querySelector(".tralbum-wrapper-collect-controls");
  if (controls && controls.parentElement !== story) {
    const footer = story.querySelector(":scope > .story-footer");
    if (footer) story.insertBefore(controls, footer);
    else story.append(controls);
  }
  story.querySelectorAll(".bandkit-feed-chevron-item, .bandkit-feed-analyze-item").forEach((item) => item.remove());
  const favTrack = story.querySelector(".collection-item-fav-track");
  if (favTrack && details && favTrack.parentElement !== details) {
    const itemLink = details.querySelector(":scope > .item-link");
    if (itemLink) itemLink.after(favTrack);
    else details.prepend(favTrack);
  }
  if (!side) return;
  const col1 = wrapper.querySelector(":scope > .tralbum-wrapper-col1");
  const art = side.querySelector(":scope > .tralbum-art-container");
  const owners = side.querySelector(":scope > .tralbum-wrapper-col2");
  if (art && col1 && art.parentElement !== col1) col1.prepend(art);
  if (owners && owners.parentElement !== wrapper) wrapper.append(owners);
  side.remove();
}

export function registerFeedTracks(r) {
  r.$feedAlbumQueues = new WeakMap();
  r.$feedAlbumPendingTrack = null;
  r.$feedAlbumPlaybackRequest = 0;
  // Feed album rows share the Discover player path so the expanded album becomes
  // the queue and next/previous keep working across its tracks.
  r.$playFeedAlbumTrack = async (track, host) => {
    if (!track) return;
    const queue = (host && r.$feedAlbumQueues.get(host)) || [];
    const selection = ++r.$feedAlbumPlaybackRequest;
    // A row click supersedes any native featured-track handoff still settling.
    r.$feedHandoffRequest += 1;
    r.$pendingFeedTrackId = "";
    clearTimeout(r.$feedHandoffTimer);
    r.$restoreFeedAudioMute?.();
    r.$silenceNativePagePlayback();
    if (!r.$feedAlbumPendingTrack && runtimeSeamless.enabled && String(runtimeSeamless.track?.id) === String(track.id)) {
      await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return;
    }
    r.$feedAlbumPendingTrack = track;
    r.$renderPlayer?.();
    try {
      const prepared = await r.$prepareExternalNowPlaying(track, queue, { trustProvidedStreams: true });
      if (prepared.cancelled || prepared.request !== r.$playlistPlayRequest) return;
      if (prepared.index < 0) throw new Error(prepared.error || "This track is unavailable.");
      r.$silenceNativePagePlayback();
      const response = await r.$runtimeMessage({
        type: MESSAGES.SEAMLESS_ENABLE, queue: prepared.queue, index: prepared.index,
        currentTime: 0, autoplay: true, ...runtimeState.dj
      });
      if (!response?.ok) throw new Error(response?.error || "Could not play this track.");
      if (prepared.request === r.$playlistPlayRequest) r.$applySeamlessState(response.state);
    } catch (error) {
      if (selection === r.$feedAlbumPlaybackRequest) r.$showToast(error.message || "Could not play this track.");
    } finally {
      if (selection === r.$feedAlbumPlaybackRequest) {
        r.$feedAlbumPendingTrack = null;
        r.$renderPlayer?.();
      }
    }
  };
  r.$feedAlbumAnalysisRequest = 0;
  r.$feedTrackAnalysisPending = new Set();
  // A single row can be analysed on its own, so an album does not have to be
  // expanded just to check one track.
  r.$analyzeFeedTrack = async (host, track) => {
    if (runtimeState.djToolsEnabled === false || !host?.isConnected || !track?.url) return;
    const key = r.$pageAnalysisTrackKey(track);
    if (r.$feedTrackAnalysisPending.has(key)) return;
    r.$feedTrackAnalysisPending.add(key);
    r.$syncFeedTrackAnalysisUi?.();
    try {
      const response = await r.$runtimeMessage({ type: MESSAGES.ANALYZE_TRACKS, tracks: [track] });
      if (!host.isConnected) return;
      const result = response?.ok
        ? response.results?.[0]
        : { id: track.id, url: track.url, error: response?.error || "Track analysis failed." };
      r.$pageTrackAnalysis.set(key, result || {
        id: track.id,
        url: track.url,
        error: "Track analysis returned no result."
      });
    } catch (error) {
      if (host.isConnected) r.$showToast(error.message || "Track analysis failed.");
    } finally {
      r.$feedTrackAnalysisPending.delete(key);
      r.$syncFeedTrackAnalysisUi?.();
    }
  };
  r.$feedAlbumTrackForSeamless = (track) => {
    if (!track) return null;
    for (const host of document.querySelectorAll(`.${FEED_ALBUM_CLASS} ${TRACKLIST_SELECTOR}`)) {
      const match = (r.$feedAlbumQueues.get(host) || []).find((item) => r.$matchingQueueTrack([item], track));
      if (match) return match;
    }
    return null;
  };
  r.$feedAlbumQueueForTrack = (track) => {
    if (!track) return [];
    for (const host of document.querySelectorAll(`.${FEED_ALBUM_CLASS} ${TRACKLIST_SELECTOR}`)) {
      const queue = r.$feedAlbumQueues.get(host) || [];
      if (queue.some((item) => r.$matchingQueueTrack([item], track))) return queue;
    }
    return [];
  };
  // The feed never starts automatic analysis; an album is only expanded when
  // the listener asks for it, one track at a time with bounded concurrency.
  r.$analyzeFeedAlbumTracks = async (host, { force = false } = {}) => {
    if (runtimeState.djToolsEnabled === false || !host?.isConnected) return;
    if (host.dataset.bandkitAnalysisStatus === "analyzing") return;
    const tracks = r.$feedAlbumQueues.get(host) || [];
    if (!tracks.length) return;
    const hasResults = tracks.some((track) => r.$pageTrackAnalysis?.get(r.$pageAnalysisTrackKey(track)));
    host.dataset.bandkitAnalysisStatus = "analyzing";
    const request = ++r.$feedAlbumAnalysisRequest;
    r.$syncFeedTrackAnalysisUi?.();
    r.$showToast(`Analyzing ${tracks.length} track${tracks.length === 1 ? "" : "s"}…`);
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < tracks.length) {
          const track = tracks[cursor];
          cursor += 1;
          const response = await r.$runtimeMessage({ type: MESSAGES.ANALYZE_TRACKS, tracks: [track], force: force || hasResults });
          if (request !== r.$feedAlbumAnalysisRequest || !host.isConnected) return;
          const result = response?.ok
            ? response.results?.[0]
            : { id: track.id, url: track.url, error: response?.error || "Track analysis failed." };
          r.$pageTrackAnalysis.set(r.$pageAnalysisTrackKey(track), result || {
            id: track.id,
            url: track.url,
            error: "Track analysis returned no result."
          });
          r.$syncFeedTrackAnalysisUi?.();
        }
      };
      const concurrency = Math.min(r.$PAGE_TRACK_ANALYSIS_CONCURRENCY || 1, tracks.length);
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (request !== r.$feedAlbumAnalysisRequest || !host.isConnected) return;
      host.dataset.bandkitAnalysisStatus = "ready";
      const completed = tracks.filter((track) => !r.$pageTrackAnalysis.get(r.$pageAnalysisTrackKey(track))?.error).length;
      r.$showToast(`Analyzed ${completed} of ${tracks.length} track${tracks.length === 1 ? "" : "s"}`);
    } catch (error) {
      if (request !== r.$feedAlbumAnalysisRequest) return;
      host.dataset.bandkitAnalysisStatus = "error";
      r.$showToast(error.message || "Track analysis failed.");
    }
    r.$syncFeedTrackAnalysisUi?.();
  };
}

export function setupFeedTracks(r) {
  if (!document.body.classList.contains("feed") && !/\/feed\/?$/.test(location.pathname)) return;
  const cache = new Map();
  const jobs = [];
  let active = 0;
  let scheduled = false;
  const MAX_CONCURRENT = 3;
  // Mounting a list rebuilds the card's height, so one task never mounts them all.
  const MAX_MOUNTS_PER_SYNC = 2;
  const scrollingFast = createScrollGate(() => schedule());
  narrowFeedLayout.addEventListener("change", () => schedule());

  const renderRelease = (story, host, release) => {
    r.$feedAlbumQueues.set(host, release.tracks.filter((track) => r.$isReusableStreamUrl(track.url)));
    host.replaceChildren(r.$createDiscoverTrackList(release));
    host.setAttribute("aria-busy", "false");
    host.setAttribute("aria-label", /\/album\//.test(release.pageUrl || "") ? "Album tracks" : "Track");
    if (!release.tracks.length) host.append(createElement("p", "bandkit-discover-tracklist-status", "No tracks available."));
    ensureToggle(story, host, release.tracks.length > 1);
    updateFeedAnalyzeButton(r, host);
    syncFeedTrackAnalysisUi(r);
  };

  const toggleLabel = (host) => host.classList.contains("is-collapsed") ? "Expand album tracks" : "Collapse album tracks";
  // The chevron joins the story's icon row, pinned to its trailing edge.
  const ensureToggle = (story, host, visible) => {
    const row = story.querySelector(".bandkit-feed-action-row, .tralbum-wrapper-collect-controls ul");
    let item = row?.querySelector(":scope > .bandkit-feed-chevron-item");
    if (!visible || !row) {
      item?.remove();
      return;
    }
    let toggle = item?.querySelector(":scope > .bandkit-feed-tracklist-toggle");
    if (!item) {
      item = createElement("li", "bandkit-feed-chevron-item");
      row.append(item);
    }
    if (!toggle) {
      toggle = createElement("button", "bandkit-feed-tracklist-toggle");
      toggle.type = "button";
      toggle.style.setProperty("--bandkit-tracklist-chevron", `url('${asset("icon-chevron.svg")}')`);
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.classList.toggle("is-collapsed");
        toggle.setAttribute("aria-expanded", String(!host.classList.contains("is-collapsed")));
        toggle.setAttribute("aria-label", toggleLabel(host));
        toggle.title = toggle.getAttribute("aria-label");
      });
      item.append(toggle);
    }
    toggle.setAttribute("aria-expanded", String(!host.classList.contains("is-collapsed")));
    toggle.setAttribute("aria-label", toggleLabel(host));
    toggle.title = toggle.getAttribute("aria-label");
  };

  r.$syncFeedTrackAnalysisUi = () => syncFeedTrackAnalysisUi(r);

  const showError = (host) => {
    host.closest(".story-innards")?.querySelector(".bandkit-feed-chevron-item")?.remove();
    host.closest(".story-innards")?.querySelector(".bandkit-feed-analyze-item")?.remove();
    host.replaceChildren();
    const status = createElement("p", "bandkit-discover-tracklist-status", "Could not load tracks. ");
    const retry = createElement("button", "", "Retry");
    retry.type = "button";
    retry.addEventListener("click", () => {
      host.remove();
      schedule();
    });
    status.append(retry);
    host.append(status);
    host.setAttribute("aria-busy", "false");
  };

  const load = async (story, host, url, attempt = 0) => {
    try {
      let release = cache.get(url);
      if (!release || release.expires < Date.now()) {
        const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl: url });
        if (!response?.ok) throw new Error(response?.error || "Could not load tracks.");
        release = { ...response.release, expires: Date.now() + 5 * 60_000 };
        cache.set(url, release);
        if (cache.size > 60) cache.delete(cache.keys().next().value);
      }
      if (!host.isConnected) return;
      renderRelease(story, host, release);
      r.$syncPagePlayerUi?.();
    } catch {
      if (!host.isConnected) return;
      // A cold service worker or a rate-limited burst can fail the first try;
      // one quiet requeue keeps the list from looking broken.
      if (attempt === 0) {
        window.setTimeout(() => {
          if (!host.isConnected || host.dataset.bandkitFeedAlbumUrl !== url) return;
          jobs.push({ story, host, url, attempt: 1 });
          pump();
        }, 900);
        return;
      }
      delete host.dataset.bandkitFeedAlbumUrl;
      showError(host);
    }
  };

  const pump = () => {
    while (active < MAX_CONCURRENT && jobs.length) {
      const job = jobs.shift();
      // Drop work for cards that scrolled away before it ran; otherwise a fast
      // scroll starves the card the reader is actually looking at.
      if (!job.host.isConnected) continue;
      active += 1;
      void load(job.story, job.host, job.url, job.attempt || 0).finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  // Only stories near the viewport keep a generated list. The feed can hold
  // hundreds of stories after scrolling; leaving every list mounted makes the
  // page session replay and the page sweeps scale with the page size.
  const tracklistObserver = new IntersectionObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const story = entry.target;
      if (entry.isIntersecting) {
        if (story.dataset.bandkitFeedTracklistVisible !== "true") {
          story.dataset.bandkitFeedTracklistVisible = "true";
          changed = true;
        }
      } else if (story.dataset.bandkitFeedTracklistVisible === "true") {
        delete story.dataset.bandkitFeedTracklistVisible;
        changed = true;
      }
    }
    if (changed) schedule();
  }, { rootMargin: "1200px 0px" });

  const sync = () => {
    scheduled = false;
    const frozen = scrollingFast();
    let mounted = 0;
    let deferred = false;
    for (const story of document.querySelectorAll("#story-list .story-innards.collection-item-container")) {
      const release = storyRelease(story);
      const existing = story.querySelector(TRACKLIST_SELECTOR);
      if (!release) {
        restoreLayout(story);
        existing?.remove();
        story.querySelector(".bandkit-feed-chevron-item")?.remove();
        story.querySelector(".bandkit-feed-analyze-item")?.remove();
        story.classList.remove(FEED_ALBUM_CLASS);
        continue;
      }
      story.classList.add(FEED_ALBUM_CLASS);
      if (!story.dataset.bandkitFeedTracklistObserved) {
        story.dataset.bandkitFeedTracklistObserved = "true";
        tracklistObserver.observe(story);
      }
      // Every release card keeps the same layout, even before its link or list
      // resolves; only the generated list is virtualised, so a fast scroll
      // never leaves a half-restructured card.
      if (!ensureLayout(story)) continue;
      // A flick or a batch of loaded results touches no lists; the settle sync
      // reconciles them as soon as the reader slows down.
      if (frozen) continue;
      if (!release.url || story.dataset.bandkitFeedTracklistVisible !== "true") {
        existing?.remove();
        story.querySelector(".bandkit-feed-chevron-item")?.remove();
        story.querySelector(".bandkit-feed-analyze-item")?.remove();
        continue;
      }
      if (mounted >= MAX_MOUNTS_PER_SYNC) {
        deferred = true;
        continue;
      }
      const host = createTracklistHost(r, story);
      if (!host || host.dataset.bandkitFeedAlbumUrl === release.url) continue;
      host.dataset.bandkitFeedAlbumUrl = release.url;
      mounted += 1;
      jobs.push({ story, host, url: release.url });
    }
    if (deferred) schedule();
    pump();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(sync, 0);
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest(".bandkit-discover-track-actions, .bandkit-feed-track-analyze")) return;
    const row = event.target.closest(`.${FEED_ALBUM_CLASS} .bandkit-discover-tracks .track_row_view`);
    if (!row || event.target.closest(".bandkit-track-analysis")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const host = row.closest(TRACKLIST_SELECTOR);
    const track = (r.$feedAlbumQueues.get(host) || []).find((item) => String(item.id) === String(row.dataset.bandkitDiscoverTrackId));
    if (track) void r.$playFeedAlbumTrack(track, host);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    const control = event.target.closest(`.${FEED_ALBUM_CLASS} .bandkit-discover-tracks .play-col a`);
    if (control) { event.preventDefault(); control.click(); }
  });
  // Native story changes, including a late-hydrated release link, retrigger;
  // the injected list is inert.
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !record.target.closest?.(TRACKLIST_SELECTOR))) schedule();
  });
  const start = () => {
    const list = document.querySelector("#story-list");
    if (!list) return false;
    observer.observe(list, { attributes: true, attributeFilter: ["href"], childList: true, subtree: true });
    schedule();
    return true;
  };
  if (!start()) {
    const boot = new MutationObserver(() => {
      if (start()) boot.disconnect();
    });
    boot.observe(document.body, { childList: true, subtree: true });
  }
}
