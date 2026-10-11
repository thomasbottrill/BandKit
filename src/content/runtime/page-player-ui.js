import { createPageWaveform, createPageTransportButton, createPagePlayhead } from "../components/page-playback.js";
import { createPageMenuOption, createPagePriceForm } from "../components/page-actions.js";
import { runtimeLive, runtimeSeamless, runtimeState } from "./context.js";
import { asset, formatDuration, safeBandcampUrl, setAttributeValue, setDatasetValue, setStyleProperty } from "../core.js";
import { accessibleScrubberPalette, colorString, hexColor, luminance, parseColor } from "../color.js";
import { applyTimelinePath, normalizeTimelineStyle } from "../timeline-styles.js";
import { MESSAGES } from "../../shared/contracts.js";
import { HANDLE_OUTLINE_CSS } from "../handle-outline-style.js";

function renderedStyleColour(element, property, pseudo = null) {
  if (!element) return "";
  const value = getComputedStyle(element, pseudo).getPropertyValue(property).trim();
  const parsed = parseColor(value);
  return value && value !== "none" && value !== "transparent" && parsed?.a !== 0 ? value : "";
}

function setCollectionPlaybackLabel(card, control, label) {
  control?.setAttribute("aria-label", label);
  card.querySelector(".item_link_play")?.setAttribute("aria-label", label);
}

function syncDiscoverPagePlaybackUi(r) {
  const controls = [...document.querySelectorAll([
    "#DiscoverApp .results-grid-item .image-container > .play-pause-button[data-bandkit-playback-state]",
    "#DiscoverApp .results-grid-item .image-container > .play-button[data-bandkit-playback-state]",
    "#DiscoverApp .results-grid-item .image-container > .play-pause-button[aria-label^='Pause' i]",
    "#DiscoverApp .results-grid-item .image-container > .play-button[aria-label^='Pause' i]"
  ].join(", "))];
  for (const control of controls) {
    const cardTrack = r.$discoverTrackFromCard?.(control.closest(".results-grid-item"));
    const isCurrent = Boolean(runtimeSeamless.enabled
      && runtimeSeamless.track
      && cardTrack
      && r.$matchingQueueTrack([cardTrack], runtimeSeamless.track));
    if (!isCurrent && !control.hasAttribute("data-bandkit-playback-state")) continue;
    if (!isCurrent) {
      control.removeAttribute("data-bandkit-playback-state");
      control.removeAttribute("aria-pressed");
      continue;
    }
    const isPlaying = Boolean(runtimeSeamless.isPlaying);
    setAttributeValue(control, "data-bandkit-playback-state", "true");
    setAttributeValue(control, "aria-label", isPlaying ? "Pause" : "Play");
    setAttributeValue(control, "aria-pressed", String(isPlaying));
    setDatasetValue(control, "bandkitLabel", isPlaying ? "Pause" : "Play");
  }
}

function syncDiscoverTracklistPlaybackUi(r) {
  const rows = [...document.querySelectorAll(":is(#DiscoverApp, .bandkit-collection-preview) .bandkit-discover-tracks .track_row_view")];
  if (!rows.length) return;
  const native = r.$getDiscoverPlayerState?.();
  const titleMatches = (row, track) => r.$normalizedTrackTitle(row.querySelector(".track-title")?.textContent)
    === r.$normalizedTrackTitle(track?.title);
  const rowFor = (track) => track && rows.find((row) => {
    const rowId = String(row.dataset.bandkitDiscoverTrackId || "");
    return (rowId && rowId === String(track.id || "")) || titleMatches(row, track);
  });
  // The native panel outranks the extension player only while it is genuinely
  // audible, which covers a different Bandcamp tab owning the shared player. Its
  // control keeps reading "Pause" for a track it already handed to Bandkit, so
  // trusting the label alone strands that row on the pause glyph while a
  // different row is playing. A silenced native row still marks the selection.
  const audibleNative = r.$audibleNativeDiscover?.(native) || null;
  const seamlessRow = runtimeSeamless.enabled && rowFor(runtimeSeamless.track);
  const pendingRow = rowFor(r.$discoverPendingTrack);
  const nativeRow = rowFor(native?.track);
  const activeRow = (audibleNative && nativeRow) || pendingRow || seamlessRow || nativeRow;
  const isPlaying = activeRow === nativeRow && audibleNative ? true : activeRow === seamlessRow
    ? Boolean(runtimeSeamless.isPlaying)
    : activeRow === nativeRow
      ? Boolean(audibleNative)
      : true;
  for (const row of rows) {
    const isCurrent = row === activeRow;
    row.classList.toggle("bandcamp-hub-current", isCurrent);
    row.classList.toggle("bandcamp-hub-is-playing", isCurrent && isPlaying);
    const control = row.querySelector(".play_status");
    const action = control?.closest("a, button, [role='button']") || control;
    if (action) {
      action.setAttribute("aria-label", isCurrent && isPlaying ? "Pause" : `Play ${row.querySelector(".track-title")?.textContent || "track"}`);
      action.setAttribute("aria-pressed", String(isCurrent && isPlaying));
    }
    if (control) {
      control.classList.toggle("playing", isCurrent && isPlaying);
      control.classList.toggle("paused", isCurrent && !isPlaying);
      if (isCurrent) control.setAttribute("data-bandkit-playback-state", "true");
      else control.removeAttribute("data-bandkit-playback-state");
    }
  }
}

// Feed rows are owned by this sync; the page-wide player loop skips them so it
// cannot clear their state (or pay for hundreds of rows on every scan).
let feedTracklistActiveRows = new Map();

function applyFeedRowPlaybackState(row, current, playing) {
  row.classList.toggle("bandcamp-hub-current", current);
  row.classList.toggle("bandcamp-hub-is-playing", current && playing);
  const control = row.querySelector(".play_status");
  const action = control?.closest("a, button, [role='button']") || control;
  if (action) {
    action.setAttribute("aria-label", current && playing ? "Pause" : `Play ${row.querySelector(".track-title")?.textContent || "track"}`);
    action.setAttribute("aria-pressed", String(current && playing));
  }
  if (control) {
    control.classList.toggle("playing", current && playing);
    control.classList.toggle("paused", current && !playing);
    if (current) control.setAttribute("data-bandkit-playback-state", "true");
    else control.removeAttribute("data-bandkit-playback-state");
  }
}

function syncFeedTracklistPlaybackUi(r) {
  const hosts = document.querySelectorAll(".bandkit-feed-album .bandkit-discover-tracklist");
  const targets = new Map();
  const addTarget = (track, playing) => {
    if (!track) return;
    for (const host of hosts) {
      const match = (r.$feedAlbumQueues?.get(host) || []).find((item) => r.$matchingQueueTrack([item], track)
        || (track.id && String(item.id) === String(track.id)));
      if (!match) continue;
      const row = host.querySelector(`.track_row_view[data-bandkit-discover-track-id="${CSS.escape(String(match.id))}"]`);
      if (row) targets.set(row, Boolean(playing));
      break;
    }
  };
  // The feed's own native control uses the story's featured track id, so the
  // same id match keeps a row highlighted during the native handoff too.
  if (runtimeSeamless.enabled && runtimeSeamless.track) addTarget(runtimeSeamless.track, runtimeSeamless.isPlaying);
  if (r.$feedAlbumPendingTrack) addTarget(r.$feedAlbumPendingTrack, true);
  else if (r.$pendingFeedTrackId) addTarget({ id: r.$pendingFeedTrackId }, false);
  for (const row of feedTracklistActiveRows.keys()) {
    if (!targets.has(row) && row.isConnected) applyFeedRowPlaybackState(row, false, false);
  }
  for (const [row, playing] of targets) applyFeedRowPlaybackState(row, true, playing);
  feedTracklistActiveRows = targets;
}

function registerPagePlayerUi1(r) {
r.$getGenericPageItem = function getGenericPageItem() {
      const feed = r.$getFeedPlayerState();
      if (feed?.track) return feed.track;
      const media = navigator.mediaSession?.metadata;
      if (media?.title) {
        return {
          title: media.title,
          artist: media.artist || media.album || "Bandcamp",
          art: media.artwork?.at(-1)?.src || runtimeLive.art,
          pageUrl: location.href,
          artistUrl: r.$artistUrlFromPageUrl(location.href)
        };
      }
      const modern = r.$getModernPlayerState();
      if (modern?.track) return modern.track;
      const active = document.querySelector("[data-trackid].playing, [data-audiourl].playing, .playing[data-track-id], .current-track, .now-playing");
      return r.$itemFromNode(active) || r.$lastPageItem;
    };
r.$normalizedTrackTitle = function normalizedTrackTitle(value) {
      return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    };
r.$matchingPagePlaybackTrack = function matchingPagePlaybackTrack(queue, requested = {}) {
      const tracks = Array.isArray(queue) ? queue : [];
      const requestedUrl = String(requested.url || "");
      if (requestedUrl) {
        const streamMatch = tracks.find((track) => String(track.url || "") === requestedUrl);
        if (streamMatch) return streamMatch;
      }
      const requestedId = String(requested.id || "");
      if (requestedId) {
        const idMatch = tracks.find((track) => String(track.id || "") === requestedId);
        if (idMatch) return idMatch;
      }
      const requestedPageUrl = safeBandcampUrl(requested.pageUrl);
      if (requestedPageUrl) {
        const pageMatch = tracks.find((track) => safeBandcampUrl(track.pageUrl) === requestedPageUrl);
        if (pageMatch) return pageMatch;
      }
      const requestedTitle = r.$normalizedTrackTitle(requested.title);
      const requestedArtist = r.$normalizedTrackTitle(requested.artist);
      if (!requestedTitle || !requestedArtist) return null;
      return tracks.find((track) => r.$normalizedTrackTitle(track.title) === requestedTitle
        && r.$normalizedTrackTitle(track.artist) === requestedArtist) || null;
    };
r.$classicTrackRowMatches = function classicTrackRowMatches(row, track, pageData) {
      if (!row?.matches(".track_row_view") || !track) return false;
      if (row.dataset.bandkitDiscoverTrackId) return row.dataset.bandkitDiscoverTrackId === String(track.id || "");
      const relation = row.getAttribute("rel") || "";
      const trackNumber = Number(relation.match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
      const pageTrack = trackNumber > 0 ? pageData?.tralbum?.trackinfo?.[trackNumber - 1] : null;
      const currentId = String(track.id || "");
      const pageTrackId = String(pageTrack?.track_id || pageTrack?.id || "");
      if (currentId && pageTrackId && currentId === pageTrackId) return true;
      const rowLink = safeBandcampUrl(row.querySelector(".track-title[href], a[href*='/track/']")?.href);
      const currentPageUrl = safeBandcampUrl(track.pageUrl);
      if (rowLink && currentPageUrl && rowLink === currentPageUrl) return true;
      const rowTitle = r.$normalizedTrackTitle(r.$elementText(row, [".track-title", ".title"]));
      const currentTitle = r.$normalizedTrackTitle(track.title);
      return Boolean(rowTitle && currentTitle && rowTitle === currentTitle);
    };
r.$clearBandKitPagePlaybackState = function clearBandKitPagePlaybackState() {
      for (const player of document.querySelectorAll(".inline_player, .track_row_view")) {
        if (!player.matches(".inline_player") && player.closest(".bandkit-feed-album")) continue;
        player.classList.remove("bandcamp-hub-current", "bandcamp-hub-is-playing");
      }
      for (const control of document.querySelectorAll("[data-bandkit-playback-state]")) {
        if (control.closest(".bandkit-feed-album")) continue;
        control.classList.remove("playing");
        control.classList.add("paused");
        control.removeAttribute("data-bandkit-playback-state");
        const action = control.closest("a, button, [role='button']") || control;
        action.setAttribute("aria-label", "Play");
        action.setAttribute("aria-pressed", "false");
      }
    };
r.$capturePagePlayerUi = function capturePagePlayerUi() {
      if (r.$pagePlayerSnapshot) return;
      const inlinePlayer = document.querySelector(".inline_player");
      const textElements = [
        inlinePlayer?.querySelector(".title"),
        inlinePlayer?.querySelector(".time_elapsed"),
        inlinePlayer?.querySelector(".time_total")
      ].filter(Boolean).map((element) => ({ element, text: element.textContent }));
      const visibilityElements = [
        inlinePlayer?.querySelector(".title-section"),
        inlinePlayer?.querySelector(".time"),
        inlinePlayer?.querySelector(".prevbutton"),
        inlinePlayer?.querySelector(".nextbutton")
      ].filter(Boolean).map((element) => ({ element, hidden: element.classList.contains("hiddenelem") }));
      const visualControls = [...document.querySelectorAll(".inline_player .playbutton, .inline_player .play_status, .track_row_view .playbutton, .track_row_view .play_status")]
        .filter((element) => !element.closest(".bandkit-feed-album"))
        .map((element) => ({
          element,
          playing: element.classList.contains("playing"),
          paused: element.classList.contains("paused"),
          playbackState: element.getAttribute("data-bandkit-playback-state")
        }));
      const actions = [...new Set(visualControls.map(({ element }) => element.closest("a, button, [role='button']") || element))]
        .map((element) => ({
          element,
          ariaLabel: element.getAttribute("aria-label"),
          ariaPressed: element.getAttribute("aria-pressed")
        }));
      const fill = inlinePlayer?.querySelector(".progbar_fill");
      const thumb = inlinePlayer?.querySelector(".thumb");
      const modernTimeline = document.querySelector("section.floating-player.has-track input[type='range']");
      r.$pagePlayerSnapshot = {
        textElements,
        visibilityElements,
        visualControls,
        actions,
        fill: fill ? { element: fill, value: fill.style.getPropertyValue("width"), priority: fill.style.getPropertyPriority("width") } : null,
        thumb: thumb ? { element: thumb, value: thumb.style.getPropertyValue("left"), priority: thumb.style.getPropertyPriority("left") } : null,
        modernTimeline: modernTimeline ? {
          element: modernTimeline,
          max: modernTimeline.getAttribute("max"),
          value: modernTimeline.value
        } : null
      };
    };
r.$restorePagePlayerUi = function restorePagePlayerUi() {
      r.$clearBandKitPagePlaybackState();
      if (!r.$pagePlayerSnapshot) return;
      for (const { element, text } of r.$pagePlayerSnapshot.textElements) {
        if (element.isConnected) element.textContent = text;
      }
      for (const { element, hidden } of r.$pagePlayerSnapshot.visibilityElements) {
        if (element.isConnected) element.classList.toggle("hiddenelem", hidden);
      }
      for (const { element, playing, paused, playbackState } of r.$pagePlayerSnapshot.visualControls) {
        if (!element.isConnected) continue;
        element.classList.toggle("playing", playing);
        element.classList.toggle("paused", paused);
        if (playbackState === null) element.removeAttribute("data-bandkit-playback-state");
        else element.setAttribute("data-bandkit-playback-state", playbackState);
      }
      for (const { element, ariaLabel, ariaPressed } of r.$pagePlayerSnapshot.actions) {
        if (!element.isConnected) continue;
        if (ariaLabel === null) element.removeAttribute("aria-label");
        else element.setAttribute("aria-label", ariaLabel);
        if (ariaPressed === null) element.removeAttribute("aria-pressed");
        else element.setAttribute("aria-pressed", ariaPressed);
      }
      for (const snapshot of [r.$pagePlayerSnapshot.fill, r.$pagePlayerSnapshot.thumb]) {
        if (!snapshot?.element.isConnected) continue;
        const property = snapshot === r.$pagePlayerSnapshot.fill ? "width" : "left";
        if (snapshot.value) snapshot.element.style.setProperty(property, snapshot.value, snapshot.priority);
        else snapshot.element.style.removeProperty(property);
      }
      const timeline = r.$pagePlayerSnapshot.modernTimeline;
      if (timeline?.element.isConnected) {
        if (timeline.max === null) timeline.element.removeAttribute("max");
        else timeline.element.setAttribute("max", timeline.max);
        timeline.element.value = timeline.value;
      }
      r.$pagePlayerSnapshot = null;
    };
r.$syncFeedPagePlaybackUi = function syncFeedPagePlaybackUi() {
      const feedCards = [...document.querySelectorAll(".collection-item-container[data-trackid]")];
      for (const card of feedCards) {
        card.removeAttribute("data-bandkit-feed-playback");
        const control = card.querySelector(".track_play_auxiliary");
        const isCollectionCard = Boolean(card.closest("#collection-items, #wishlist-items"));
        if (isCollectionCard && runtimeSeamless.enabled) card.removeAttribute("data-bandkit-native-collection-playing");
        control?.removeAttribute("aria-busy");
        const itemData = r.$parseJsonAttribute(card, "data-item-json") || {};
        const title = itemData.featured_track_title || r.$elementText(card, [".fav-track-title", ".fav-track-link", ".fav-track-static", ".collection-item-title", ".waypoint-item-title"]);
        if (card.classList.contains("paused") || (isCollectionCard && runtimeSeamless.enabled)) {
          setCollectionPlaybackLabel(card, control, `Play ${title || "track"}`);
        }
      }
      if (runtimeSeamless.enabled && runtimeSeamless.track) {
        const activeId = String(runtimeSeamless.track.id || "");
        for (const card of feedCards) {
          const collectionTrack = card.closest("#collection-items, #wishlist-items") ? r.$collectionTrackFromCard?.(card) : null;
          const matchesActive = collectionTrack
            ? r.$matchingQueueTrack([collectionTrack], runtimeSeamless.track)
            : String(card.dataset.trackid || "") === activeId;
          if (!matchesActive) continue;
          card.setAttribute("data-bandkit-feed-playback", runtimeSeamless.isPlaying ? "playing" : "paused");
          const control = card.querySelector(".track_play_auxiliary");
          setCollectionPlaybackLabel(card, control, runtimeSeamless.isPlaying ? `Pause ${runtimeSeamless.track.title || "track"}` : `Play ${runtimeSeamless.track.title || "track"}`);
        }
      }
      const pendingId = String(r.$pendingFeedTrackId || "");
      if (!pendingId) return;
      for (const card of feedCards) {
        if (String(card.dataset.trackid || "") !== pendingId) continue;
        const control = card.querySelector(".track_play_auxiliary");
        const itemData = r.$parseJsonAttribute(card, "data-item-json") || {};
        const title = itemData.featured_track_title || r.$elementText(card, [".fav-track-title", ".fav-track-link", ".fav-track-static", ".collection-item-title", ".waypoint-item-title"]);
        card.setAttribute("data-bandkit-feed-playback", "loading");
        control?.setAttribute("aria-busy", "true");
        control?.setAttribute("aria-label", `Loading ${title || "track"}`);
      }
    };
r.$syncFeedTracklistPlaybackUi = () => syncFeedTracklistPlaybackUi(r);
r.$syncDiscoverPagePlaybackUi = () => syncDiscoverPagePlaybackUi(r);
}

function registerPagePlayerUi2(r) {
r.$syncPagePlayerUi = function syncPagePlayerUi() {
      r.$syncFeedPagePlaybackUi();
      r.$syncFeedTracklistPlaybackUi();
      r.$syncDiscoverPagePlaybackUi();
      r.$syncHomeSalesPlaybackUi?.();
      if (!runtimeSeamless.enabled) {
        document.body.classList.remove("bandcamp-hub-remote-playing");
        r.$restorePagePlayerUi();
        syncDiscoverTracklistPlaybackUi(r);
        return;
      }
      r.$ensurePageStyles();
      const pageData = r.$getBandcampPageData();
      const inlineTitle = document.querySelector(".inline_player .title");
      const currentPageTrack = r.$matchingPagePlaybackTrack(r.$buildSeamlessQueue(), runtimeSeamless.track || {});
      if (!currentPageTrack) {
        document.body.classList.remove("bandcamp-hub-remote-playing");
        r.$restorePagePlayerUi();
        syncDiscoverTracklistPlaybackUi(r);
        return;
      }
      r.$capturePagePlayerUi();
      document.body.classList.toggle("bandcamp-hub-remote-playing", Boolean(runtimeSeamless.isPlaying));
      if (inlineTitle && runtimeSeamless.track?.title) inlineTitle.textContent = runtimeSeamless.track.title;
      for (const player of document.querySelectorAll(".inline_player, .track_row_view")) {
        // Generated feed rows are kept in step by the feed tracklist sync.
        if (!player.matches(".inline_player") && player.closest(".bandkit-feed-album")) continue;
        const isInlinePlayer = player.matches(".inline_player");
        const isCurrent = isInlinePlayer || r.$classicTrackRowMatches(player, runtimeSeamless.track, pageData);
        player.classList.toggle("bandcamp-hub-current", isCurrent);
        player.classList.toggle("bandcamp-hub-is-playing", isCurrent && runtimeSeamless.isPlaying);
        const control = player.querySelector(".playbutton, .play_status, .play_cell a, [aria-label*='Play'], [aria-label*='Pause']");
        if (control && isCurrent) {
          const action = control.closest("a, button, [role='button']") || control;
          action.setAttribute("aria-label", runtimeSeamless.isPlaying ? "Pause" : "Play");
          action.setAttribute("aria-pressed", String(Boolean(runtimeSeamless.isPlaying)));
        }
        const visualControls = [...player.querySelectorAll(".playbutton, .play_status")];
        if (!visualControls.length && control) visualControls.push(control);
        const wasBandKitCurrent = visualControls.some((visualControl) => visualControl.hasAttribute("data-bandkit-playback-state"));
        if (control && !isCurrent && wasBandKitCurrent) {
          const action = control.closest("a, button, [role='button']") || control;
          action.setAttribute("aria-label", "Play");
          action.setAttribute("aria-pressed", "false");
        }
        for (const visualControl of visualControls) {
          if (isCurrent) visualControl.setAttribute("data-bandkit-playback-state", "true");
          else visualControl.removeAttribute("data-bandkit-playback-state");
          visualControl.classList.toggle("playing", isCurrent && Boolean(runtimeSeamless.isPlaying));
          visualControl.classList.toggle("paused", isCurrent && !runtimeSeamless.isPlaying);
        }
      }
      const inlinePlayer = document.querySelector(".inline_player");
      inlinePlayer?.querySelector(".title-section")?.classList.remove("hiddenelem");
      inlinePlayer?.querySelector(".time")?.classList.remove("hiddenelem");
      inlinePlayer?.querySelector(".prevbutton")?.classList.remove("hiddenelem");
      inlinePlayer?.querySelector(".nextbutton")?.classList.remove("hiddenelem");
      const elapsed = inlinePlayer?.querySelector(".time_elapsed");
      const total = inlinePlayer?.querySelector(".time_total");
      if (elapsed) elapsed.textContent = formatDuration(runtimeSeamless.currentTime);
      if (total) total.textContent = formatDuration(runtimeSeamless.duration);
      const fill = inlinePlayer?.querySelector(".progbar_fill");
      const thumb = inlinePlayer?.querySelector(".thumb");
      const percent = `${Math.max(0, Math.min(100, Number(runtimeSeamless.progress) * 100 || 0))}%`;
      if (fill) fill.style.width = percent;
      if (thumb) thumb.style.left = percent;

      const modernPlayer = document.querySelector("section.floating-player.has-track");
      const modernTimeline = modernPlayer?.querySelector("input[type='range']");
      if (modernTimeline && !modernTimeline.closest(".bandkit-page-scrub-control")?.classList.contains("is-scrubbing")) {
        modernTimeline.max = String(Math.max(0, Number(runtimeSeamless.duration) || 0));
        modernTimeline.value = String(Math.max(0, Number(runtimeSeamless.currentTime) || 0));
      }
      syncDiscoverTracklistPlaybackUi(r);
      r.$ensurePagePlayerWaveforms();
    };
r.$populatePageWaveform = function populatePageWaveform(control, signature, width = 0) {
      const svg = control.querySelector(":scope > .bandkit-page-scrub-waveform");
      if (!svg) return;
      const pixelWidth = Math.max(80, Math.round(width || control.getBoundingClientRect().width || 320));
      if (runtimeState.scrubberStyle !== "custom" && control.dataset.bandkitWaveformSignature === signature
        && control.dataset.bandkitTimelineStyle === normalizeTimelineStyle(runtimeState.scrubberStyle)
        && Math.abs(Number(control.dataset.bandkitWaveformWidth) - pixelWidth) < 4) return;
      const waveform = applyTimelinePath(svg, signature, pixelWidth, runtimeState.scrubberStyle, runtimeState.customTimeline, runtimeState.retainTimelineColors);
      control.dataset.bandkitTimelineStyle = normalizeTimelineStyle(runtimeState.scrubberStyle);
      control.dataset.bandkitWaveformSignature = signature;
      control.dataset.bandkitWaveformWidth = String(waveform.pixelWidth);
    };
r.$pageWaveformSvg = createPageWaveform;
r.$pageScrubDuration = function pageScrubDuration(control) {
      const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
      const minimum = Number(timeline?.min) || 0;
      const maximum = Number(timeline?.max) || 0;
      if (timeline && maximum > minimum) return maximum - minimum;
      if (runtimeSeamless.enabled && Number(runtimeSeamless.duration) > 0) return Number(runtimeSeamless.duration);
      const audio = r.$getAudio();
      if (Number(audio?.duration) > 0) return Number(audio.duration);
      if (Number(r.$bridgedMedia?.duration) > 0) return Number(r.$bridgedMedia.duration);
      return Number(runtimeLive.duration) || 0;
    };
r.$previewPageScrub = function previewPageScrub(control, clientX) {
      const rect = control.getBoundingClientRect();
      const pointerX = Number(clientX);
      const fraction = rect.width && Number.isFinite(pointerX)
        ? Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width))
        : Number(control.dataset.bandkitScrubFraction) || 0;
      control.dataset.bandkitScrubFraction = String(fraction);
      control.style.setProperty("--bandkit-page-scrub-progress", `${(fraction * 100).toFixed(2)}%`);
      const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
      if (timeline) {
        const minimum = Number(timeline.min) || 0;
        const maximum = Number(timeline.max) || 1;
        timeline.value = String(minimum + (maximum - minimum) * fraction);
        timeline.setAttribute("aria-valuetext", `${formatDuration(r.$pageScrubDuration(control) * fraction)} of ${formatDuration(r.$pageScrubDuration(control))}`);
      }
      const elapsed = control.closest(".inline_player")?.querySelector(".time_elapsed");
      if (elapsed) elapsed.textContent = formatDuration(r.$pageScrubDuration(control) * fraction);
      return fraction;
    };
r.$commitPageScrub = async function commitPageScrub(control, fraction) {
      const duration = r.$pageScrubDuration(control);
      if (r.$pendingFeedTrackId) {
        r.$pendingFeedSeekFraction = Math.max(0, Math.min(1, Number(fraction) || 0));
        r.$pendingFeedSeekTrackId = r.$pendingFeedTrackId;
        r.$pendingFeedSeekRevision += 1;
        if (!duration) return;
        const currentTime = duration * fraction;
        r.$pendingFeedSeekTime = currentTime;
        if (runtimeSeamless.enabled && String(runtimeSeamless.track?.id || "") === r.$pendingFeedTrackId) {
          await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime });
          return;
        }
        const feedAudio = r.$getAudio();
        if (Number(feedAudio?.duration) > 0
          && r.$feedStreamTrackId(feedAudio.currentSrc || feedAudio.src) === r.$pendingFeedTrackId) {
          feedAudio.currentTime = currentTime;
        }
        return;
      }
      if (r.$queueClassicPageSeek?.(fraction)) return;
      const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
      if (timeline) {
        timeline.dispatchEvent(new Event("input", { bubbles: true }));
        timeline.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (!duration) return;
      const currentTime = duration * fraction;
      if (runtimeSeamless.enabled) {
        await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime });
        return;
      }
      const audio = r.$getAudio();
      if (Number(audio?.duration) > 0) {
        audio.currentTime = currentTime;
        return;
      }
      if (Number(r.$bridgedMedia?.duration) > 0) r.$pageMediaCommand("seek", { currentTime });
    };
}

function registerPagePlayerUi3(r) {
r.$bindPageScrubDrag = function bindPageScrubDrag(control) {
      if (control.dataset.bandkitScrubDragBound === "true") return;
      control.dataset.bandkitScrubDragBound = "true";
      let drag = null;
      const finish = async (event, cancelled = false) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const fraction = drag.fraction;
        drag = null;
        try { control.releasePointerCapture(event.pointerId); } catch {}
        try {
          if (!cancelled) await r.$commitPageScrub(control, fraction);
        } finally {
          control.classList.remove("is-scrubbing");
          r.$ensurePagePlayerWaveforms();
        }
      };
      control.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !Number.isFinite(Number(event.clientX)) || !r.$pageScrubDuration(control)) return;
        drag = { pointerId: event.pointerId, fraction: r.$previewPageScrub(control, event.clientX) };
        control.classList.add("is-scrubbing");
        try { control.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      }, true);
      control.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (Number.isFinite(Number(event.clientX))) drag.fraction = r.$previewPageScrub(control, event.clientX);
        event.preventDefault();
        event.stopPropagation();
      }, true);
      control.addEventListener("pointerup", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        void finish(event);
      }, true);
      control.addEventListener("pointercancel", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        void finish(event, true);
      }, true);
    };
r.$finishPageWaveformControl = function finishPageWaveformControl(control) {
      if (!control.querySelector(":scope > .bandkit-page-scrub-waveform")) control.append(r.$pageWaveformSvg());
      if (!control.querySelector(":scope > .bandkit-page-scrub-playhead")) {
        const playhead = createPagePlayhead();
        control.append(playhead);
      }
      r.$bindPageScrubDrag(control);
    };
r.$ensureClassicTransportRow = function ensureClassicTransportRow(inlinePlayer) {
      const transportControls = [
        inlinePlayer.querySelector(".prevbutton"),
        inlinePlayer.querySelector(".nextbutton")
      ].filter(Boolean).map((control) => control.closest("a, button, [role='button']") || control);
      if (!transportControls.length) return;
      let tools = inlinePlayer.querySelector(":scope > .bandcamp-hub-page-tools");
      if (!tools) {
        tools = document.createElement("div");
        tools.className = "bandcamp-hub-page-tools";
        inlinePlayer.append(tools);
      }
      r.$applyPageActionTheme(tools);
      let row = tools.querySelector(":scope > .bandkit-page-transport-row");
      if (!row) {
        row = document.createElement("div");
        row.className = "bandkit-page-transport-row";
        row.setAttribute("aria-label", "Track navigation");
        tools.append(row);
      }
      transportControls.forEach((control, index) => {
        const direction = index ? "next" : "previous";
        const sourceCell = control.closest(".prev_cell, .next_cell");
        if (sourceCell) sourceCell.classList.add("bandkit-page-transport-cell-empty");
        let proxy = row.querySelector(`[data-bandkit-track-navigation="${direction}"]`);
        if (!proxy) {
          proxy = createPageTransportButton(direction);
          proxy.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (runtimeSeamless.enabled) {
              const pageQueue = r.$buildSeamlessQueue();
              const currentTitle = inlinePlayer.querySelector(".title")?.textContent?.trim() || "";
              const currentIndex = pageQueue.findIndex((track) => track.title === currentTitle);
              const target = pageQueue[currentIndex + (index ? 1 : -1)];
              if (target) void r.$handoffPageAudio(null, target.title);
              return;
            }
            const nativeControl = proxy._bandkitNativeTransportControl;
            if (typeof nativeControl?.click === "function") nativeControl.click();
            else nativeControl?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
          });
          row.append(proxy);
        }
        proxy._bandkitNativeTransportControl = control;
        proxy.disabled = control.matches("[disabled], .disabled, [aria-disabled='true']");
        r.$applyPageActionTheme(proxy);
        r.$setPageActionLabel(proxy, "");
      });
    };
r.$syncPageScrubberContrast = function syncPageScrubberContrast(control) {
      let surface = null;
      for (let element = control; element && !surface; element = element.parentElement) {
        const candidate = parseColor(getComputedStyle(element).backgroundColor);
        if (candidate && candidate.a > 0.5) surface = candidate;
      }
      surface ||= luminance(parseColor(getComputedStyle(document.body).color) || { r: 17, g: 24, b: 39, a: 1 }) > 0.5
        ? { r: 17, g: 24, b: 39, a: 1 }
        : { r: 255, g: 255, b: 255, a: 1 };
      const styles = getComputedStyle(control);
      const traditional = r.$usesTraditionalScrubber();
      const sharedAccentValue = getComputedStyle(r.$scrubControl).getPropertyValue("--hub-scrub-accent").trim()
        || (traditional
          ? renderedStyleColour(r.$scrubControl, "background-color", "::after")
          : renderedStyleColour(r.$scrubWaveformPlayed, "stroke"));
      const sharedRemainingValue = traditional
        ? renderedStyleColour(r.$scrubControl, "background-color", "::before")
        : renderedStyleColour(r.$scrubWaveformRemaining, "stroke");
      const sharedSurfaceValue = renderedStyleColour(
        r.$player?.querySelector(".hub-scrub-playhead"), "background-color", "::before"
      );
      const sharedPlayerAccent = parseColor(sharedAccentValue) || hexColor(sharedAccentValue, null);
      const preferredAccent = sharedPlayerAccent || parseColor(
        styles.getPropertyValue("--hub-scrub-accent")
        || styles.getPropertyValue("--hub-accent")
        || styles.getPropertyValue("--bandkit-page-accent")
        || styles.getPropertyValue("--link-color")
      ) || r.$firstComputedColor(["a.primaryText", ".download-link", ".buy-link", "a"], "color") || { r: 29, g: 160, b: 195, a: 1 };
      const palette = accessibleScrubberPalette(preferredAccent, surface);
      // These writes normally resolve to the colours already applied. Re-setting
      // them re-dirties style, so the computed reads at the top of the next call
      // pay for a full page recalculation.
      setStyleProperty(control.style, "--bandkit-scrub-accent", sharedPlayerAccent ? sharedAccentValue : colorString(palette.accent));
      setStyleProperty(control.style, "--bandkit-scrub-remaining", parseColor(sharedRemainingValue) || hexColor(sharedRemainingValue, null) ? sharedRemainingValue : colorString(palette.remaining));
      setStyleProperty(control.style, "--bandkit-scrub-surface", sharedSurfaceValue || colorString(palette.surface));
      setStyleProperty(control.style, "--bandkit-scrub-halo", colorString(palette.halo, 0.62));
    };
r.$ensurePagePlayerWaveforms = function ensurePagePlayerWaveforms() {
      r.$ensurePageStyles();

      const modernPlayer = document.querySelector("section.floating-player.has-track");
      const modernTimeline = modernPlayer?.querySelector("input[type='range']");
      if (modernTimeline) {
        let control = modernTimeline.closest(".bandkit-page-scrub-control");
        if (!control) {
          control = document.createElement("div");
          control.className = "bandkit-page-scrub-control is-modern";
          modernTimeline.before(control);
          control.append(modernTimeline);
        }
        modernTimeline.classList.add("bandkit-page-scrub-slider");
        if (!modernTimeline.hasAttribute("aria-label")) modernTimeline.setAttribute("aria-label", "Playback position");
        r.$finishPageWaveformControl(control);
        control.classList.toggle("is-traditional", r.$usesTraditionalScrubber());
        r.$syncPageScrubberContrast(control);
        const modernState = r.$getModernPlayerState();
        const signature = `${modernState?.track?.title || ""}\u0000${modernState?.track?.artist || ""}\u0000${modernState?.track?.pageUrl || "modern-player"}`;
        const maximum = Number(modernTimeline.max) || modernState?.duration || 1;
        const progress = Math.max(0, Math.min(1, (Number(modernTimeline.value) || 0) / maximum));
        if (!control.classList.contains("is-scrubbing")) control.style.setProperty("--bandkit-page-scrub-progress", `${(progress * 100).toFixed(2)}%`);
        r.$populatePageWaveform(control, signature);
      }

      const inlinePlayer = document.querySelector(".inline_player");
      const classicControl = inlinePlayer?.querySelector(".progbar");
      if (classicControl) {
        r.$applyPageActionTheme(inlinePlayer.querySelector(".play_cell > a"));
        classicControl.classList.add("bandkit-page-scrub-control", "is-classic");
        r.$finishPageWaveformControl(classicControl);
        r.$ensureClassicTransportRow(inlinePlayer);
        classicControl.classList.toggle("is-traditional", r.$usesTraditionalScrubber());
        r.$syncPageScrubberContrast(classicControl);
        const track = r.$currentInlinePlaylistTrack();
        const signature = `${track?.title || r.$elementText(inlinePlayer, [".title", ".track-title"])}\u0000${track?.artist || ""}\u0000${track?.pageUrl || location.href}`;
        const fill = classicControl.querySelector(".progbar_fill");
        const inlineProgress = fill?.style.width.endsWith("%") ? Number.parseFloat(fill.style.width) : NaN;
        const controlWidth = classicControl.getBoundingClientRect().width;
        const measuredProgress = controlWidth ? (fill?.getBoundingClientRect().width || 0) / controlWidth * 100 : 0;
        const progress = Math.max(0, Math.min(100, Number.isFinite(inlineProgress) ? inlineProgress : measuredProgress));
        if (!classicControl.classList.contains("is-scrubbing")) classicControl.style.setProperty("--bandkit-page-scrub-progress", `${progress.toFixed(2)}%`);
        r.$populatePageWaveform(classicControl, signature);
      }
    };
}

function registerPagePlayerUi4(r) {
r.$ensurePageStyles = function ensurePageStyles() {
      for (const [name, icon] of [["play", "icon-play.svg"], ["pause", "icon-pause.svg"], ["skip", "icon-skip.svg"], ["close", "icon-close.svg"]]) {
        setStyleProperty(document.documentElement.style, `--bandkit-${name}-icon`, `url('${asset(icon)}')`);
      }
      if (!document.querySelector("#bandcamp-hub-page-style")) {
        const pageStyle = document.createElement("style");
        pageStyle.id = "bandcamp-hub-page-style";
        pageStyle.textContent = `.bandcamp-hub-page-dj{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:flex;height:32px;justify-content:center;margin:8px 0 0;padding:0;width:32px}.bandcamp-hub-page-dj[hidden]{display:none!important}.bandcamp-hub-page-dj::before{background:currentColor;content:"";height:18px;mask:var(--hub-dj-icon) center/contain no-repeat;-webkit-mask:var(--hub-dj-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-dj:hover,.bandcamp-hub-page-dj:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-dj.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-dj-host{box-sizing:border-box;display:block;margin-top:8px;min-width:0;width:100%}.bandcamp-hub-page-dj-host[hidden]{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline>svg{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline::after{background:currentColor;content:"";display:block;height:18px;mask:var(--bandkit-pause-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-pause-icon) center/contain no-repeat;width:18px}`;
        pageStyle.textContent += `.bandkit-page-scrub-control{--bandkit-page-scrub-progress:0%;--bandkit-scrub-accent:#087f9e;--bandkit-scrub-remaining:#cbd0d5;--bandkit-scrub-surface:#fff;align-items:center;box-sizing:border-box;display:flex;height:28px;min-width:0;position:relative;touch-action:none;width:100%}.bandkit-page-scrub-control.is-modern{flex:1 1 240px;grid-column:1/-1}.bandkit-page-scrub-slider{appearance:none!important;background:transparent!important;cursor:pointer;height:28px!important;inset:0;margin:0!important;opacity:0;position:absolute!important;width:100%!important;z-index:3}.bandkit-page-scrub-waveform{display:block;height:24px;overflow:visible;pointer-events:none;width:100%}.bandkit-page-scrub-waveform path{fill:none;stroke-linecap:round;stroke-width:2.4}.bandkit-page-waveform-remaining{stroke:var(--bandkit-scrub-remaining)}.bandkit-page-waveform-played{clip-path:inset(0 calc(100% - var(--bandkit-page-scrub-progress)) 0 0);stroke:var(--bandkit-timeline-color,var(--bandkit-scrub-accent))}.bandkit-page-scrub-playhead{background:var(--bandkit-scrub-surface);border:2px solid var(--bandkit-handle-color,var(--bandkit-scrub-accent));border-radius:999px;box-shadow:none;height:8px;left:var(--bandkit-page-scrub-progress);opacity:0;pointer-events:none;position:absolute;top:50%;transform:translate(-50%,-50%) scale(.75);transition:opacity 120ms ease,transform 120ms ease;width:8px;z-index:2}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{opacity:1;transform:translate(-50%,-50%) scale(1)}.inline_player .progbar.bandkit-page-scrub-control{height:28px!important;overflow:visible!important}.inline_player .progbar.bandkit-page-scrub-control :is(.progbar_empty,.progbar_fill,.thumb){background:transparent!important}.inline_player .progbar.bandkit-page-scrub-control>.progbar_empty{height:28px!important;inset:0;opacity:0!important;position:absolute;width:100%;z-index:3}.inline_player .progbar.bandkit-page-scrub-control .progbar_fill,.inline_player .progbar.bandkit-page-scrub-control .thumb{opacity:0!important}`;
        pageStyle.textContent += `.bandkit-page-scrub-control.is-traditional::before,.bandkit-page-scrub-control.is-traditional::after{border-radius:999px;content:"";height:4px;left:0;pointer-events:none;position:absolute;top:50%;transform:translateY(-50%)}.bandkit-page-scrub-control.is-traditional::before{background:var(--bandkit-scrub-remaining);right:0}.bandkit-page-scrub-control.is-traditional::after{background:var(--bandkit-timeline-color,var(--bandkit-scrub-accent));width:var(--bandkit-page-scrub-progress)}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-waveform{opacity:0}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-playhead{box-sizing:border-box;height:12px;opacity:1;transform:translate(-50%,-50%) scale(1);width:12px}.bandkit-page-scrub-control.is-traditional:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{transform:translate(-50%,-50%) scale(1.08)}`;
        pageStyle.textContent += `.bandkit-page-scrub-playhead{background:var(--bandkit-scrub-accent);border:2px solid var(--bandkit-scrub-surface);height:18px;transition:height 140ms ease,opacity 120ms ease,transform 140ms ease,width 140ms ease;width:7px}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{box-shadow:none;height:22px;opacity:1;transform:translate(-50%,-50%) scale(1);width:9px}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-playhead{height:18px;transform:translate(-50%,-50%) scale(1);width:7px}.bandkit-page-scrub-control.is-traditional:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{height:22px;opacity:1;transform:translate(-50%,-50%) scale(1);width:9px}`;
        pageStyle.textContent += `.bandkit-page-scrub-playhead{background:transparent!important;border:0!important;box-shadow:none!important;filter:none;height:22px!important;transition:opacity 120ms ease,transform 140ms ease;width:22px!important}.bandkit-page-scrub-playhead::before,.bandkit-page-scrub-playhead::after{content:"";inset:0;mask:var(--bandkit-scrub-handle-mask) center/contain no-repeat;position:absolute;-webkit-mask:var(--bandkit-scrub-handle-mask) center/contain no-repeat}.bandkit-page-scrub-playhead::before{background:var(--bandkit-scrub-surface)}.bandkit-page-scrub-playhead::after{background:var(--bandkit-handle-color,var(--bandkit-scrub-accent));inset:4px}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{filter:none}`;
        pageStyle.textContent += `.bandkit-page-transport-row{align-items:center;display:flex;gap:8px;margin-left:auto;margin-right:-8px;min-height:32px}.bandkit-page-transport-row>:is(a,button,[role="button"],.prevbutton,.nextbutton){align-items:center;box-sizing:border-box;display:inline-flex!important;height:32px;justify-content:center;margin:0!important;min-width:32px;padding:0!important;top:auto!important;width:32px}.bandkit-page-skip-control{appearance:none!important;background:transparent!important;border:1px solid transparent!important;border-radius:4px!important;color:var(--hub-accent,var(--bandkit-release-accent,var(--link-color,#1da0c3)))!important;cursor:pointer;font-size:0!important}.bandkit-page-skip-control>*{display:none!important}.bandkit-page-skip-control::before{background:currentColor;content:"";display:block;height:13px;mask:var(--bandkit-skip-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-skip-icon) center/contain no-repeat;width:13px}.bandkit-page-skip-control:is(:hover,:focus-visible){background:var(--hub-accent-soft,var(--bandkit-release-accent-soft,rgba(29,160,195,.12)))!important;border-color:var(--hub-accent,var(--bandkit-release-accent,var(--link-color,#1da0c3)))!important;box-shadow:none!important;outline:0!important;transform:none!important}.bandkit-page-skip-control.is-previous::before{transform:rotate(180deg)}.bandkit-page-transport-cell-empty{display:none!important}`;
        pageStyle.textContent += `@media(max-width:380px){.bandcamp-hub-page-tools{column-gap:6px!important;flex-wrap:wrap!important}.bandkit-page-transport-row{margin-left:auto}}`;
        pageStyle.textContent += `[data-bandkit-extension-stacking]{z-index:2147483646!important}`;
        pageStyle.textContent += `#DiscoverApp .focused-result{scroll-padding-bottom:calc(var(--bandkit-player-reserved-height,84px) + 16px)}`;
        pageStyle.textContent += `html[data-bandkit-hide-bandcamp-player="true"] :is(.discover-player,section.floating-player){display:none!important}html[data-bandkit-feed-page="true"] :is(#track_play_waypoint,.track_play_waypoint){display:none!important}`;
        pageStyle.textContent += `html[data-bandkit-cart-disabled="true"] .bandcamp-hub-page-cart{display:none!important}html[data-bandkit-hide-page-cart="true"] #sidecart{display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,.menubar-cart-icon,#cart-link,#cart-control){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a,button,[role="button"],li):has(use[href$="#menubar-cart-icon"],use[xlink\\:href$="#menubar-cart-icon"],svg.menubar-cart-icon){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) li:has(> :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,#cart-link,#cart-control)){display:none!important}`;
        pageStyle.textContent += `.bandcamp-hub-page-tools{align-items:center;box-sizing:border-box;display:flex;flex-wrap:nowrap;gap:8px;margin:12px 0 0;max-width:100%;min-width:0;white-space:nowrap;width:100%}.bandcamp-hub-page-tools>:not(.bandkit-page-transport-row){flex:0 0 auto}.bandcamp-hub-page-tools .bandcamp-hub-page-dj{margin:0}.bandcamp-hub-page-playlist{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-size:0;height:32px;justify-content:center;line-height:0;margin:8px 0 0;padding:0;text-decoration:none!important;vertical-align:middle;width:32px}.bandcamp-hub-page-playlist::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-plus-icon) center/contain no-repeat;-webkit-mask:var(--hub-plus-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-playlist:hover,.bandcamp-hub-page-playlist:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandcamp-hub-page-playlist.is-added{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-playlist.is-player-control{margin:0}.bandcamp-hub-page-playlist.is-track-action{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-line,rgba(127,127,127,.35))!important;color:var(--hub-accent,var(--link-color,#1da0c3))!important;height:24px;margin:0 8px 0 0!important;opacity:0;pointer-events:none;text-decoration:none!important;width:24px}.bandcamp-hub-page-playlist.is-track-action::before{height:14px;width:14px}.bandcamp-hub-page-playlist.is-track-action:hover,.bandcamp-hub-page-playlist.is-track-action:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;text-decoration:none!important}.bandcamp-hub-page-playlist.is-track-action.is-added{background:var(--hub-accent,var(--link-color,#1da0c3))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;color:var(--hub-on-accent,#fff)!important}.track_row_view:hover .bandcamp-hub-page-playlist.is-track-action,.track_row_view:focus-within .bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-playlist.is-track-action:focus-visible{opacity:1;pointer-events:auto}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to{appearance:none;background:transparent!important;border:0!important;border-radius:0!important;color:var(--link-color,#0687f5)!important;font:inherit!important;font-weight:700!important;height:auto!important;line-height:inherit!important;margin:0 10px 0 0!important;padding:0!important;width:auto!important}html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to::before{display:none!important}html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to.is-added{background:transparent!important;color:var(--link-color,#0687f5)!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions>li{align-items:center!important;display:flex!important;gap:4px!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions>li::before{display:none!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-action .wishlist-msg,.bandkit-feed-wishlist-action .wishlisted-msg>span:first-child){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;height:28px!important;justify-content:center!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action):hover,html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action):focus-visible,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child):hover,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child):focus-visible{background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandcamp-hub-page-playlist.is-feed-sidebar-action{font-size:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandcamp-hub-page-playlist.is-feed-sidebar-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action){font-size:0!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .wishlist-msg>span,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .wishlisted-msg>span:first-child>span{display:none!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .text{clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;height:1px!important;overflow:hidden!important;position:absolute!important;white-space:nowrap!important;width:1px!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .bandkit-feed-action-row{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row>li{align-items:center!important;display:flex!important;gap:4px!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row>li::before{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;font-size:0!important;height:28px!important;justify-content:center!important;line-height:0!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control):is(:hover,:focus-visible){background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandcamp-hub-page-playlist.is-feed-compact-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandkit-feed-wishlist-control>*{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandkit-feed-wishlist-control::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;width:16px}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlist-msg.bandkit-feed-wishlist-control{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-wishlist-action{flex:0 0 auto!important;margin-left:4px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-wishlist-action .wishlisted-msg{align-items:center!important;display:none!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg{display:flex!important}html[data-bandkit-feed-page="true"] .bandkit-feed-wishlist-action :is(.wishlist-msg.bandkit-feed-wishlist-control,.wishlisted-msg>.bandkit-feed-wishlist-control){background:transparent!important;border-color:transparent!important}html[data-bandkit-feed-page="true"] .bandkit-feed-wishlist-action .wishlisted-msg>.view{display:none!important}html[data-bandkit-feed-page="true"] :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control{background:transparent!important;border-color:transparent!important;color:#ff9c00!important}html[data-bandkit-feed-page="true"] :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control::before{mask-image:var(--bandkit-feed-wishlist-filled-icon)!important;-webkit-mask-image:var(--bandkit-feed-wishlist-filled-icon)!important}html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control:is(:hover,:focus-visible){background:color-mix(in srgb,#ff9c00 14%,transparent)!important;border-color:#ff9c00!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control){background:transparent!important;border-color:transparent!important}html[data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control):is(:hover,:focus-visible){background:rgba(6,135,245,.1)!important;border-color:currentColor!important}html[data-bandkit-feed-page="true"] body.feed .story-innards .tralbum-wrapper-collect-controls .bandkit-feed-action-row{opacity:0!important;pointer-events:none!important;transition:opacity 120ms ease}html[data-bandkit-feed-page="true"] body.feed .story-innards:is(:hover,:focus-within) .tralbum-wrapper-collect-controls .bandkit-feed-action-row{opacity:1!important;pointer-events:auto!important}html[data-bandkit-feed-page="true"] body.feed .story-innards:is(:hover,:focus-within) .bandkit-feed-action-row [data-bandkit-label]{gap:6px!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-feed-page="true"] body.feed .story-innards:is(:hover,:focus-within) .bandkit-feed-action-row [data-bandkit-label]>.bandkit-page-action-label{display:inline-block!important;font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif)!important;font-size:11px!important;font-weight:700!important;line-height:1.15!important;order:1;white-space:nowrap}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] .bandkit-collection-action-row{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action){align-items:center!important;appearance:none;background:transparent!important;border:1px solid var(--bandkit-page-border,rgba(127,127,127,.35))!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--bandkit-page-accent,var(--link-color,#0687f5))!important;cursor:pointer!important;display:inline-flex!important;font-size:0!important;height:28px!important;justify-content:center!important;line-height:0!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):is(:hover,:focus-visible){background:var(--bandkit-page-accent-soft,rgba(6,135,245,.1))!important;border-color:var(--bandkit-page-accent,currentColor)!important;outline:0!important}html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] .bandkit-collection-action-row .bandcamp-hub-page-playlist.is-feed-compact-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] .bandkit-collection-download-action::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] #collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .bottom-owner-controls .redownload-item{display:none!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .story-innards>.story-body{padding-bottom:6px!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .story-innards .tralbum-wrapper-collect-controls{margin-bottom:18px!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .story-innards .tralbum-wrapper-collect-controls .bandkit-feed-action-row{margin-top:4px!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .collection-item-container .play-icon{background:currentColor!important;border:0!important;color:#fff!important;height:24px!important;margin:13px!important;mask:var(--bandkit-play-icon) center/contain no-repeat!important;-webkit-mask:var(--bandkit-play-icon) center/contain no-repeat!important;width:24px!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .collection-item-container[data-bandkit-feed-playback="playing"] .play-icon{background:linear-gradient(90deg,currentColor 0 35%,transparent 35% 65%,currentColor 65% 100%)!important;height:24px!important;mask:none!important;-webkit-mask:none!important;width:18px!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .collection-item-container[data-bandkit-feed-playback="loading"] .play-icon{animation:bandkit-feed-loading-spin 700ms linear infinite!important;background:transparent!important;border:2px solid rgba(255,255,255,.4)!important;border-radius:50%!important;border-top-color:currentColor!important;box-sizing:border-box!important;height:20px!important;margin:15px!important;mask:none!important;-webkit-mask:none!important;width:20px!important}@media(prefers-reduced-motion:reduce){html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] .collection-item-container[data-bandkit-feed-playback="loading"] .play-icon{animation:none!important;border-color:currentColor!important;opacity:.7}}`;
        pageStyle.textContent += `#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button,.bandcamp-hub-page-playlist.is-discover-add-to){align-items:center!important;appearance:none!important;background:var(--bandkit-page-card,var(--hub-card,#fff))!important;border:1px solid var(--bandkit-page-border,var(--hub-line,rgba(127,127,127,.35)))!important;border-radius:8px!important;box-shadow:0 1px 2px rgba(0,0,0,.12)!important;box-sizing:border-box!important;color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;display:inline-flex!important;filter:none!important;height:36px!important;justify-content:center!important;margin:0!important;width:36px!important}#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button,.bandcamp-hub-page-playlist.is-discover-add-to):is(:hover,:focus-visible){background:var(--bandkit-page-card,var(--hub-card,#fff))!important;background:color-mix(in srgb,var(--bandkit-page-accent,var(--hub-accent,#1da0c3)) 16%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;filter:none!important;opacity:1!important;outline:0!important}#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button):is(:hover,:focus-visible)>*{opacity:1!important}#DiscoverApp .results-grid-item .image-container>:is(.play-pause-button,.play-button){bottom:8px!important;left:8px!important;position:absolute!important}#DiscoverApp .results-grid-item .image-container>.bandcamp-hub-page-playlist.is-discover-add-to{bottom:8px!important;left:50px!important;right:auto!important;top:auto!important}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to{position:absolute!important;z-index:8}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to::before{height:16px!important;width:16px!important}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to.is-added{background:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;color:var(--bandkit-page-on-accent,var(--hub-on-accent,#fff))!important}`;
        pageStyle.textContent += `.results-grid-item .bandcamp-hub-page-playlist.is-discover-add-to{opacity:0;pointer-events:none;transition:opacity .12s ease}.results-grid-item:hover .bandcamp-hub-page-playlist.is-discover-add-to,.results-grid-item:focus-within .bandcamp-hub-page-playlist.is-discover-add-to,.results-grid-item .bandcamp-hub-page-playlist.is-discover-add-to:focus-visible{opacity:1;pointer-events:auto}`;
        pageStyle.textContent += `#recommendations_container .recommended-album .album-art-container{position:relative}#recommendations_container .recommended-album .bandcamp-hub-page-playlist.is-recommendation-add-to{bottom:10px!important;left:52px!important;opacity:0;pointer-events:none;position:absolute!important;top:auto!important;transition:opacity .12s ease;z-index:3}#recommendations_container .recommended-album:is(:hover,:focus-within,.bandkit-recommendation-current) .bandcamp-hub-page-playlist.is-recommendation-add-to,#recommendations_container .recommended-album .bandcamp-hub-page-playlist.is-recommendation-add-to:focus-visible{opacity:1;pointer-events:auto}#recommendations_container .recommended-album.bandkit-recommendation-current .play-button{opacity:1!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Play" i],html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Resume" i],html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Pause" i]{font-size:0!important}html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label] > :is(svg,.play-icon){display:none!important}html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Play" i]::after,html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Resume" i]::after,html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Pause" i]::after{background:currentColor!important;content:""!important;display:block!important;flex:0 0 18px!important;height:18px!important;mask:var(--bandkit-play-icon) center/contain no-repeat!important;-webkit-mask:var(--bandkit-play-icon) center/contain no-repeat!important;width:18px!important}html[data-bandkit-modern-styling="true"] :is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Pause" i]::after{mask-image:var(--bandkit-pause-icon)!important;-webkit-mask-image:var(--bandkit-pause-icon)!important}`;
        pageStyle.textContent += `.bandcamp-hub-page-cart{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;height:32px;justify-content:center;margin:0;padding:0;width:32px}.bandcamp-hub-page-cart::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-cart-icon) center/contain no-repeat;-webkit-mask:var(--hub-cart-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-cart:hover,.bandcamp-hub-page-cart:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-cart.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-cart:disabled{cursor:not-allowed;opacity:.45}`;
        pageStyle.textContent += `.bandcamp-hub-page-cart.has-price{gap:5px;padding:0 9px 0 7px;touch-action:manipulation;width:auto}.bandcamp-hub-page-cart>*{pointer-events:none}.bandcamp-hub-page-cart.has-price::before{height:16px;width:16px}.bandcamp-hub-page-cart-price{font-family:inherit;font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1;white-space:nowrap}.bandcamp-hub-page-overflow{align-items:center;appearance:none;background:transparent;border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:4px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-family:inherit;font-size:0;height:32px;justify-content:center;line-height:0;margin:0;min-height:32px;padding:0;text-decoration:none!important;width:32px}.bandcamp-hub-page-overflow::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-more-icon) center/contain no-repeat;-webkit-mask:var(--hub-more-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-overflow:is(:hover,:focus-visible,.is-active){background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandkit-track-analysis{color:var(--bandkit-release-muted,var(--hub-faint,#6b7280));font-size:11px;font-weight:600;margin-left:8px;white-space:nowrap}.bandkit-track-analysis.is-analyzing,.bandkit-track-analysis>:is(.is-uncertain,.is-unavailable){font-weight:400;opacity:.75}`;
        pageStyle.textContent += `.bandkit-track-analysis{align-items:center;column-gap:6px;display:inline-grid;font-variant-numeric:tabular-nums;grid-template-columns:72px 28px minmax(48px,auto);margin-left:0;min-width:0;width:160px}.bandkit-track-analysis-bpm,.bandkit-track-analysis-camelot,.bandkit-track-analysis-key{text-align:left}.bandkit-track-analysis-pending{grid-column:1/-1;text-align:left}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] .bandkit-track-analysis{grid-template-columns:72px 28px;width:106px}html[data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] .bandkit-track-analysis{grid-template-columns:72px minmax(48px,auto);width:126px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] .bandkit-track-analysis{grid-template-columns:72px;width:72px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{align-items:center;column-gap:10px;display:grid!important;grid-template-columns:minmax(0,1fr) 52px 160px;white-space:nowrap;width:100%!important}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis>a{display:block;min-width:0;overflow:hidden;width:100%}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis .track-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis>.time{margin-left:0!important;text-align:right}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 52px 106px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 52px 126px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 52px 72px}html[data-bandkit-modern-release="true"] body.tralbum-page .inline_player .bandkit-track-analysis.is-inline{margin-left:12px}@media(max-width:700px){html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{column-gap:6px;grid-template-columns:minmax(0,1fr) 48px 142px}.bandkit-track-analysis{column-gap:4px;font-size:10px;grid-template-columns:64px 26px minmax(44px,auto);width:142px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] .bandkit-track-analysis{grid-template-columns:64px 26px;width:94px}html[data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] .bandkit-track-analysis{grid-template-columns:64px minmax(44px,auto);width:112px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] .bandkit-track-analysis{grid-template-columns:64px;width:64px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 48px 94px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 48px 112px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 48px 64px}}`;
        pageStyle.textContent += `.bandcamp-hub-page-buy{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:999px!important;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3))!important;display:inline-flex!important;flex:0 0 24px;font-size:0!important;height:24px;justify-content:center;line-height:0!important;margin:0!important;overflow:hidden;padding:0!important;text-decoration:none!important;vertical-align:middle;width:24px!important}.bandcamp-hub-page-buy::before{background:currentColor;content:"";display:block;height:14px;mask:var(--hub-buy-icon) center/contain no-repeat;-webkit-mask:var(--hub-buy-icon) center/contain no-repeat;width:14px}.bandcamp-hub-page-buy:hover,.bandcamp-hub-page-buy:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0;text-decoration:none!important}`;
        pageStyle.textContent += `.track_row_view .bandkit-generated-track-buy{opacity:0;pointer-events:none}.track_row_view:hover .bandkit-generated-track-buy,.track_row_view:focus-within .bandkit-generated-track-buy,.bandkit-generated-track-buy:focus-visible{opacity:1;pointer-events:auto}`;
        pageStyle.textContent += `.bandcamp-hub-page-playlist-menu{background:var(--hub-card,#fff);border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.22);box-sizing:border-box;color:var(--hub-ink,#111);font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif);min-width:180px;padding:4px;position:absolute;z-index:2147483647}.bandcamp-hub-page-playlist-menu button{align-items:center;background:transparent;border:0;border-radius:3px;color:inherit;cursor:pointer;display:flex;font-family:inherit;font-size:11px;gap:7px;line-height:1.3;padding:8px;text-align:left;text-decoration:none!important;width:100%}.bandcamp-hub-page-playlist-menu button:hover:not(:disabled),.bandcamp-hub-page-playlist-menu button:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandcamp-hub-page-playlist-menu button:disabled{color:var(--hub-faint,#9ca3af);cursor:default}.bandcamp-hub-page-playlist-menu .is-back{border-bottom:1px solid var(--hub-line,rgba(127,127,127,.35));color:var(--hub-muted,var(--hub-ink,#111));margin-bottom:3px}.bandcamp-hub-page-playlist-menu .bandkit-page-menu-icon{align-items:center;display:inline-flex;flex:0 0 14px;font-size:14px;height:14px;justify-content:center;line-height:14px;width:14px}.bandcamp-hub-page-playlist-menu .is-wishlist::before{background:currentColor;content:"";display:block;flex:0 0 14px;height:14px;mask:var(--bandkit-wishlist-option-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-wishlist-option-icon) center/contain no-repeat;width:14px}.bandcamp-hub-page-playlist-menu .is-wishlist.is-active,.bandcamp-hub-page-playlist-menu .is-wishlist.is-active:is(:hover,:focus-visible){color:#ff9c00}.bandcamp-hub-page-playlist-menu-empty{color:var(--hub-faint,#9ca3af);font-family:inherit;font-size:10px;line-height:1.3;padding:8px}.bandcamp-hub-page-playlist-menu-heading{color:var(--hub-muted,var(--hub-ink,#111));font-family:inherit;font-size:10px;font-weight:700;line-height:1.3;padding:8px 8px 4px}.bandkit-page-price-form{display:flex;flex-direction:column;gap:6px;padding:0 4px 4px}.bandkit-page-price-field{align-items:center;background:var(--hub-surface,var(--hub-card,#fff));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:3px;display:flex;gap:6px;padding:0 8px}.bandkit-page-price-currency{color:var(--hub-faint,#9ca3af);font-family:inherit;font-size:11px;font-weight:700}.bandkit-page-price-input{appearance:textfield;background:transparent;border:0;color:inherit;font-family:inherit;font-size:12px;font-weight:700;min-width:0;padding:8px 0;width:100%}.bandcamp-hub-page-playlist-menu .bandkit-page-price-form .bandkit-page-price-input:is(:focus,:focus-visible){box-shadow:none!important;outline:none!important}.bandkit-page-price-field:focus-within{border-color:var(--hub-line,rgba(127,127,127,.35))}.bandcamp-hub-page-playlist-menu .bandkit-page-price-submit{background:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff);font-weight:700;justify-content:center}.bandcamp-hub-page-playlist-menu .bandkit-page-price-submit:is(:hover,:focus-visible){background:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff);filter:brightness(1.08)}.bandcamp-hub-page-playlist-menu .bandkit-page-price-submit:disabled{cursor:default;filter:none;opacity:.45}`;
        pageStyle.textContent += `.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow,.bandkit-page-skip-control),.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy{border-radius:4px!important;box-shadow:none!important;transform:none!important}.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow,.bandkit-page-skip-control):not(.is-active):not(.is-added){background:transparent!important;border-color:transparent!important}.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow,.bandkit-page-skip-control):is(:hover,:focus-visible){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;box-shadow:none!important;transform:none!important}`;
        pageStyle.textContent += `section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action{align-self:center!important;background:transparent!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:4px!important;box-shadow:none!important;flex:0 0 24px!important;height:24px!important;margin:0 0 0 auto!important;min-height:24px!important;opacity:1!important;padding:0!important;pointer-events:auto!important;position:static!important;width:24px!important}section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action::before{height:14px!important;width:14px!important}section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action:is(:hover,:focus-visible,.is-active,.is-added){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0!important}`;
        pageStyle.textContent += `.bandkit-page-action-label{display:none!important;pointer-events:none!important}.bandkit-page-action-label::after{content:attr(data-bandkit-label-text)}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="false"] .bandcamp-hub-page-tools{align-items:center!important;display:inline-flex!important;gap:8px!important;margin:8px 0 0!important;max-width:none!important;width:auto!important}html[data-bandkit-modern-styling="false"] .bandcamp-hub-page-tools>:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-dj),html[data-bandkit-modern-styling="false"] .bandkit-collection-download-action,html[data-bandkit-modern-styling="false"] .bandkit-generated-track-buy{display:none!important}html[data-bandkit-modern-styling="false"] :is(.bandcamp-hub-page-playlist:not(.is-feed-add-to),.bandcamp-hub-page-tools>.bandcamp-hub-page-dj){appearance:none!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:inherit!important;font:inherit!important;font-size:0!important;height:auto!important;line-height:0!important;margin:0!important;min-height:0!important;padding:0!important;text-decoration:none!important;transform:none!important;width:auto!important}html[data-bandkit-modern-styling="false"] :is(.bandcamp-hub-page-playlist:not(.is-feed-add-to),.bandcamp-hub-page-tools>.bandcamp-hub-page-dj)::before{background:currentColor!important;height:16px!important;width:16px!important}html[data-bandkit-modern-styling="false"] :is(.bandcamp-hub-page-playlist:not(.is-feed-add-to),.bandcamp-hub-page-tools>.bandcamp-hub-page-dj):is(:hover,:focus-visible,.is-active,.is-added){background:transparent!important;border-color:transparent!important;color:inherit!important;outline:revert!important}html[data-bandkit-modern-styling="false"] .bandkit-page-action-label{display:none!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="false"] .track_row_view .bandcamp-hub-page-playlist.is-track-action{margin-left:10px!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="false"] [data-bandkit-label]>.bandkit-page-action-label{display:none!important}`;
        pageStyle.textContent += `html .searchresult .bandcamp-hub-page-playlist.is-search-add-to{align-items:center!important;appearance:none!important;background:transparent!important;border:1px solid transparent!important;border-radius:7px!important;box-shadow:none!important;box-sizing:border-box!important;color:var(--hub-accent,var(--link-color,#1da0c3))!important;display:inline-flex!important;font-size:0!important;height:30px!important;justify-content:center!important;line-height:0!important;margin:8px 0 0!important;padding:0!important;text-decoration:none!important;transform:none!important;width:30px!important}html .searchresult .bandcamp-hub-page-playlist.is-search-add-to::before{background:currentColor!important;display:block!important;height:15px!important;width:15px!important}html .searchresult .bandcamp-hub-page-playlist.is-search-add-to:is(:hover,:focus-visible,.is-active){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0!important}html .searchresult .bandcamp-hub-page-playlist.is-search-add-to.is-added{background:var(--hub-accent,var(--link-color,#1da0c3))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;color:var(--hub-on-accent,#fff)!important}html .searchresult .art{position:relative}html .searchresult .bandkit-search-play{align-items:center;appearance:none;background:var(--hub-card,rgba(255,255,255,.94))!important;border:1px solid transparent!important;border-radius:8px;bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,.18);box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3))!important;cursor:pointer;display:flex;height:34px;justify-content:center;left:8px;opacity:0;padding:0;pointer-events:none;position:absolute;transition:opacity 120ms ease;width:34px;z-index:2}html .searchresult .bandkit-search-play::before{background:currentColor;content:"";display:block;height:17px;mask:var(--bandkit-search-play-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-search-play-icon) center/contain no-repeat;width:17px}html .searchresult .art:is(:hover,:focus-within)>.bandkit-search-play,html .searchresult .bandkit-search-play:focus-visible,html .searchresult .bandkit-search-play[aria-pressed="true"]{opacity:1;pointer-events:auto}html .searchresult .bandkit-search-play:is(:hover,:focus-visible){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-tools .bandcamp-hub-page-playlist,.bandcamp-hub-page-tools .bandcamp-hub-page-cart,.bandcamp-hub-page-tools .bandcamp-hub-page-dj,.bandcamp-hub-page-tools .bandcamp-hub-page-overflow,.bandcamp-hub-page-tools .bandkit-page-skip-control,.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy,.bandcamp-hub-page-playlist.is-search-add-to,.bandkit-search-play):not(.is-active):not(.is-added):not([aria-pressed="true"]){background:color-mix(in srgb,var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3))) 5%,var(--hub-card,var(--bandkit-page-card,#fff)))!important;border-color:transparent!important}html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-tools .bandcamp-hub-page-playlist,.bandcamp-hub-page-tools .bandcamp-hub-page-cart,.bandcamp-hub-page-tools .bandcamp-hub-page-dj,.bandcamp-hub-page-tools .bandcamp-hub-page-overflow,.bandcamp-hub-page-tools .bandkit-page-skip-control,.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy,.bandcamp-hub-page-playlist.is-search-add-to,.bandkit-search-play):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]){background:color-mix(in srgb,var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3))) 9%,var(--hub-card,var(--bandkit-page-card,#fff)))!important;border-color:transparent!important;outline:0!important}html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow,.bandkit-search-play):is(.is-active,.is-added,[aria-pressed="true"]),html[data-bandkit-modern-release="true"] body.tralbum-page .inline_player .play_cell>a:has(:is(.playbutton,.play_status).playing),html[data-bandkit-modern-release="true"] body.tralbum-page #recommendations_container :is(.play-button,.play-pause-button,.playbutton)[aria-pressed="true"]{border-color:var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3)))!important}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table :is(.play-col>a:has(:is(.playbutton,.play_status).playing),.track_row_view.bandcamp-hub-is-playing .play-col>a){border-color:transparent!important}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table :is(.play-col>a:has(:is(.playbutton,.play_status).playing),.track_row_view.bandcamp-hub-is-playing .play-col>a):is(:hover,:focus-visible){border-color:var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3)))!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control,.wishlist-msg,.wishlisted-msg>span:first-child):not(.is-active):not(.is-added):not([aria-pressed="true"]),html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] body .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):not(.is-active):not(.is-added):not([aria-pressed="true"]){background:color-mix(in srgb,var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3))) 5%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:transparent!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control,.wishlist-msg,.wishlisted-msg>span:first-child):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]),html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] body .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]){background:color-mix(in srgb,var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3))) 9%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:transparent!important;outline:0!important}html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-wishlist-control):is(.is-active,.is-added,[aria-pressed="true"]){border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important}html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control{background:color-mix(in srgb,#ff9c00 7%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:#ff9c00!important}html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control:is(:hover,:focus-visible){background:color-mix(in srgb,#ff9c00 12%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:#ff9c00!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-tools .bandcamp-hub-page-playlist,.bandcamp-hub-page-tools .bandcamp-hub-page-cart,.bandcamp-hub-page-tools .bandcamp-hub-page-dj,.bandcamp-hub-page-tools .bandcamp-hub-page-overflow,.bandcamp-hub-page-tools .bandkit-page-skip-control,.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy,.bandcamp-hub-page-playlist.is-search-add-to,.bandkit-search-play):not(.is-active):not(.is-added):not([aria-pressed="true"]):not([aria-expanded="true"]){background:transparent!important;border-color:transparent!important}html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-tools .bandcamp-hub-page-playlist,.bandcamp-hub-page-tools .bandcamp-hub-page-cart,.bandcamp-hub-page-tools .bandcamp-hub-page-dj,.bandcamp-hub-page-tools .bandcamp-hub-page-overflow,.bandcamp-hub-page-tools .bandkit-page-skip-control,.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy,.bandcamp-hub-page-playlist.is-search-add-to,.bandkit-search-play):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]):not([aria-expanded="true"]){background:color-mix(in srgb,var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3))) 8%,var(--hub-card,var(--bandkit-page-card,#fff)))!important;border-color:transparent!important;outline:0!important}html[data-bandkit-modern-styling="true"] body :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow,.bandkit-search-play):is(.is-active,.is-added,[aria-pressed="true"],[aria-expanded="true"]){background:transparent!important;border-color:var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3)))!important;color:var(--hub-accent,var(--bandkit-page-accent,var(--link-color,#1da0c3)))!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control,.wishlist-msg,.wishlisted-msg>span:first-child):not(.is-active):not(.is-added):not([aria-pressed="true"]),html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] body .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):not(.is-active):not(.is-added):not([aria-pressed="true"]){background:transparent!important;border-color:transparent!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control,.wishlist-msg,.wishlisted-msg>span:first-child):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]),html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] body .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]){background:color-mix(in srgb,var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3))) 8%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:transparent!important;outline:0!important}html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control{background:transparent!important;border-color:#ff9c00!important}html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control:is(:hover,:focus-visible){background:color-mix(in srgb,#ff9c00 10%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:#ff9c00!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"][data-bandkit-modern-release="true"] body.tralbum-page .bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow):is(.is-active,.is-added,[aria-pressed="true"],[aria-expanded="true"]){background:transparent!important;border-color:var(--hub-accent,var(--bandkit-release-accent,var(--link-color,#1da0c3)))!important;color:var(--hub-accent,var(--bandkit-release-accent,var(--link-color,#1da0c3)))!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control,.wishlist-msg,.wishlisted-msg>span:first-child):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]):not([aria-expanded="true"]){background:color-mix(in srgb,var(--bandkit-feed-accent,var(--bandkit-page-card-accent,var(--link-color,#1da0c3))) 8%,var(--bandkit-feed-card,var(--bandkit-page-card,#fff)))!important;border-color:transparent!important}html[data-bandkit-modern-styling="true"][data-bandkit-feed-page="true"] body.feed :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-wishlist-control):is(.is-active,.is-added,[aria-pressed="true"],[aria-expanded="true"]){background:transparent!important;border-color:var(--bandkit-feed-accent,var(--bandkit-page-card-accent,var(--link-color,#1da0c3)))!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] body .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):is(:hover,:focus-visible):not(.is-active):not(.is-added):not([aria-pressed="true"]):not([aria-expanded="true"]){background:color-mix(in srgb,var(--bandkit-page-accent,currentColor) 8%,var(--bandkit-page-card,#fff))!important;border-color:transparent!important}html[data-bandkit-modern-styling="true"][data-bandkit-collection-page="true"] body .bandkit-collection-action-row .bandcamp-hub-page-playlist.is-feed-compact-action:is(.is-active,.is-added,[aria-pressed="true"],[aria-expanded="true"]){background:transparent!important;border-color:var(--bandkit-page-accent,currentColor)!important}html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control,html[data-bandkit-feed-page="true"] body.feed :is(.collect-item.wishlisted .bandkit-feed-wishlist-action,.bandkit-feed-wishlist-action.wishlisted) .wishlisted-msg>.bandkit-feed-wishlist-control:is(:hover,:focus-visible){border-color:transparent!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-styling="true"][data-bandkit-modern-release="true"] body.tralbum-page .bandcamp-hub-page-tools .bandcamp-hub-page-cart.has-price,html[data-bandkit-modern-styling="true"][data-bandkit-modern-release="true"] body.tralbum-page .bandcamp-hub-page-tools .bandcamp-hub-page-cart.has-price:is(:hover,:focus-visible,.is-active,[aria-expanded="true"]){border-color:transparent!important;outline:0!important}`;
        pageStyle.textContent += `.bandcamp-hub-page-playlist-menu .is-prominent{font-weight:600}`;
        pageStyle.textContent += `html[data-bandkit-hide-bandcamp-player="false"] body :is(.bandkit-sales-feed-actions,.bandkit-search-play,.bandkit-discover-tracks .play-col,.bandcamp-hub-page-playlist):not(#bandkit-native-player-control){display:none!important;pointer-events:none!important}`;
        pageStyle.textContent += HANDLE_OUTLINE_CSS;
        document.head.append(pageStyle);
      }
      if (!document.querySelector("#bandkit-deep-analysis-style")) {
        const deepStyle = document.createElement("style"); deepStyle.id = "bandkit-deep-analysis-style";
        deepStyle.textContent = `@keyframes bandkit-deep-analysis-spin{to{transform:rotate(360deg)}}.bandkit-deep-analysis{align-items:center;appearance:none;background:transparent;border:0;border-radius:50%;color:inherit;cursor:pointer;display:inline-flex;height:18px;justify-content:center;opacity:0;padding:0;pointer-events:none;transition:background-color 120ms ease,color 120ms ease,opacity 120ms ease;width:18px}.bandkit-deep-analysis::before{background:currentColor;content:"";display:block;height:14px;mask:var(--bandkit-deep-analysis-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-deep-analysis-icon) center/contain no-repeat;width:14px}.bandkit-deep-analysis:is(:focus-visible,.is-analyzing),.track_row_view:is(:hover,:focus-within) .bandkit-deep-analysis,.inline_player:is(:hover,:focus-within) .bandkit-deep-analysis{opacity:1;pointer-events:auto}.bandkit-deep-analysis:is(:hover,:focus-visible,.is-analyzing){background:transparent;color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandkit-deep-analysis.is-analyzing::before{animation:bandkit-deep-analysis-spin 850ms linear infinite}.bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px 28px minmax(48px,auto) 18px;width:184px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px 28px 18px;width:130px}html[data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px minmax(48px,auto) 18px;width:150px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px 18px;width:96px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 52px 184px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 52px 130px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 52px 150px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 52px 96px}@media(max-width:700px){.bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px 26px minmax(44px,auto) 18px;width:164px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px 26px 18px;width:116px}html[data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px minmax(44px,auto) 18px;width:134px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px 18px;width:86px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 48px 164px}}`;
        deepStyle.textContent += `.bandkit-deep-analysis.is-analyzing::before{transform-origin:center;will-change:transform}.bandkit-deep-analysis:disabled:not(.is-analyzing){cursor:not-allowed;pointer-events:none}.track_row_view:is(:hover,:focus-within) .bandkit-deep-analysis:disabled:not(.is-analyzing),.inline_player:is(:hover,:focus-within) .bandkit-deep-analysis:disabled:not(.is-analyzing){opacity:.3}.bandkit-track-analysis.is-deep-analyzing>:not(.bandkit-deep-analysis){opacity:.42;transition:opacity 160ms ease}`;
        deepStyle.textContent += `@keyframes bandkit-deep-analysis-dot{0%,20%{opacity:.2;transform:translateY(0)}45%{opacity:1;transform:translateY(-1px)}70%,100%{opacity:.2;transform:translateY(0)}}.bandkit-track-analysis:has(.bandkit-deep-analysis){position:relative}.bandkit-track-analysis .bandkit-deep-analysis{border-radius:0;font-size:inherit;font-weight:700;height:100%;inset:0;letter-spacing:.01em;opacity:0!important;pointer-events:none!important;position:absolute;transition:color 120ms ease,opacity 140ms ease;width:100%;z-index:2}.bandkit-deep-analysis::before{content:none!important;display:none!important}.bandkit-deep-analysis-label{display:inline}.bandkit-deep-analysis-progress{align-items:center;display:none;font-size:16px;gap:1px;height:18px;justify-content:center;line-height:1}.bandkit-deep-analysis-progress i{animation:bandkit-deep-analysis-dot 900ms ease-in-out infinite;font-style:normal}.bandkit-deep-analysis-progress i:nth-child(2){animation-delay:120ms}.bandkit-deep-analysis-progress i:nth-child(3){animation-delay:240ms}.bandkit-track-analysis>:not(.bandkit-deep-analysis){transition:opacity 140ms ease}.bandkit-track-analysis:is(:hover,:focus-within,.is-deep-analyzing)>:not(.bandkit-deep-analysis){opacity:0}.bandkit-track-analysis:is(:hover,:focus-within,.is-deep-analyzing) .bandkit-deep-analysis,.bandkit-deep-analysis:is(:focus-visible,.is-analyzing){opacity:1!important;pointer-events:auto!important}.bandkit-deep-analysis.is-analyzing .bandkit-deep-analysis-label{display:none}.bandkit-deep-analysis.is-analyzing .bandkit-deep-analysis-progress{display:inline-flex}.bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px 28px minmax(48px,auto);width:160px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px 28px;width:106px}html[data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px minmax(48px,auto);width:126px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:72px;width:72px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 52px 160px}@media(max-width:700px){.bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px 26px minmax(44px,auto);width:142px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="true"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px 26px;width:94px}html[data-bandkit-show-track-keys="true"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px minmax(44px,auto);width:112px}html[data-bandkit-show-track-keys="false"][data-bandkit-show-camelot="false"] .bandkit-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:64px;width:64px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis:has(.bandkit-deep-analysis){grid-template-columns:minmax(0,1fr) 48px 142px}}`;
        deepStyle.textContent += `.bandkit-track-analysis .bandkit-deep-analysis,.bandkit-track-analysis .bandkit-deep-analysis:is(:hover,:focus-visible,.is-analyzing){background:transparent!important;background-color:transparent!important;box-shadow:none!important}`;
        deepStyle.textContent += `.bandkit-track-analysis.is-deep-analysis-result>:not(.bandkit-deep-analysis){opacity:1!important}.bandkit-track-analysis.is-deep-analysis-result .bandkit-deep-analysis{opacity:0!important;pointer-events:none!important}`;
        document.head.append(deepStyle);
      }
    };
r.$updatePagePlaylistButton = function updatePagePlaylistButton(button, track) {
      button._bandkitTrack = track || null;
      button.hidden = !track;
      if (!track) return;
      const isFeedAddTo = button.classList.contains("is-feed-add-to");
      const nativeLabel = isFeedAddTo ? "add to..." : "";
      const directTextNodes = [...button.childNodes].filter((node) => node.nodeType === 3);
      const directText = directTextNodes.map((node) => node.textContent || "").join("");
      if (directText !== nativeLabel) {
        directTextNodes.forEach((node) => node.remove());
        if (nativeLabel) button.prepend(document.createTextNode(nativeLabel));
      }
      if (!isFeedAddTo) r.$setPageActionLabel(button, "Add");
      button.classList.remove("is-added");
      button.removeAttribute("aria-pressed");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", r.$pagePlaylistMenuAnchor === button ? "true" : "false");
      button.setAttribute("aria-label", button._bandkitRelease
        ? `Add ${button._bandkitReleaseTitle || "this album"} to Now Playing, a playlist, a cart, or your wishlist`
        : button._bandkitOwned
          ? `Add ${track.title} to Now Playing or a playlist`
          : `Add ${track.title} to Now Playing, a playlist, or a cart`);
      button.title = button.getAttribute("aria-label");
      r.$applyPageActionTheme(button);
    };
r.$syncPageCartButtonUi = function syncPageCartButtonUi() {
      const active = runtimeState.open && runtimeState.activeTab === "cart";
      for (const button of document.querySelectorAll(".bandcamp-hub-page-cart")) {
        button.classList.toggle("is-active", active); button.setAttribute("aria-expanded", String(active));
      }
    };
}

function registerPagePlayerUi5(r) {
r.$closePagePlaylistMenu = function closePagePlaylistMenu() {
      r.$pagePlaylistMenu?.remove();
      r.$pagePlaylistMenu = null;
      r.$panel.classList.remove("has-page-action-menu");
      r.$pagePlaylistMenuAnchor?.setAttribute("aria-expanded", "false");
      r.$pagePlaylistMenuAnchor?.classList.remove("is-active");
      r.$pagePlaylistMenuAnchor = null;
      r.$pagePlaylistMenuRootView = null;
    };
r.$positionPagePlaylistMenu = function positionPagePlaylistMenu() {
      if (!r.$pagePlaylistMenu || !r.$pagePlaylistMenuAnchor?.isConnected) return;
      const rect = r.$pagePlaylistMenuAnchor.getBoundingClientRect();
      r.$pagePlaylistMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - r.$pagePlaylistMenu.offsetWidth - 8, rect.left + window.scrollX))}px`;
      r.$pagePlaylistMenu.style.top = `${rect.bottom + window.scrollY + 5}px`;
    };
r.$pagePlaylistSelection = function pagePlaylistSelection(selection) {
      const isRelease = selection?.type === "bandkit-release" && Array.isArray(selection.tracks);
      const isBatch = (isRelease || selection?.type === "bandkit-track-batch") && Array.isArray(selection.tracks);
      const isOwned = selection?.type === "bandkit-owned-track";
      const source = isBatch ? selection.tracks : [isOwned ? selection.track : selection];
      return {
        isBatch,
        isRelease,
        isOwned,
        tracks: r.$normalizePlaylist(source.filter(Boolean).map(r.$capturePlaylistAnalysis))
      };
    };
r.$renderPagePlaylistMenu = function renderPagePlaylistMenu(selection, view = "destinations") {
      if (!r.$pagePlaylistMenu) return;
      const { tracks, isBatch, isRelease, isOwned } = r.$pagePlaylistSelection(selection);
      const firstTrack = tracks[0];
      if (!firstTrack) {
        r.$closePagePlaylistMenu();
        return;
      }
      const albumTrack = isRelease ? {
        ...firstTrack,
        title: firstTrack.album || firstTrack.title,
        pageUrl: firstTrack.releaseUrl || location.href,
        releaseUrl: firstTrack.releaseUrl || location.href
      } : null;
      const cartTracks = albumTrack ? [albumTrack] : tracks;
      const option = createPageMenuOption;
      r.$pagePlaylistMenu.replaceChildren();
      if (view === "playlists") {
        const rootView = r.$pagePlaylistMenuRootView || "destinations";
        r.$pagePlaylistMenu.append(option(rootView === "release-actions" ? "← More actions" : isRelease ? "← Add album" : "← Add destination", () => r.$renderPagePlaylistMenu(selection, rootView), false, "is-back"));
        r.$pagePlaylistMenu.append(option("＋ New playlist", () => {
          r.$closePagePlaylistMenu();
          r.$createSavedPlaylistWithTracks(tracks, isBatch
            ? firstTrack.album || `${firstTrack.artist || "Bandcamp"} playlist`
            : `${firstTrack.artist || "Bandcamp"} playlist`);
        }, false, "is-prominent"));
        for (const snapshot of runtimeState.savedPlaylists) {
          const alreadyAdded = tracks.every((track) => snapshot.items.some((item) => r.$playlistTracksMatch(item, track)));
          r.$pagePlaylistMenu.append(option(`${alreadyAdded ? "✓" : "＋"} ${snapshot.name}`, () => {
            r.$closePagePlaylistMenu();
            r.$addTracksToSavedPlaylist(tracks, snapshot.id);
          }, alreadyAdded));
        }
        if (!runtimeState.savedPlaylists.length) {
          const empty = document.createElement("div");
          empty.className = "bandcamp-hub-page-playlist-menu-empty";
          empty.textContent = "No playlists yet";
          r.$pagePlaylistMenu.append(empty);
        }
      } else if (view === "carts") {
        const savedCarts = runtimeState.savedCarts.filter((snapshot) => !r.$cartAutosave.isAutoSavedCart(snapshot));
        const rootView = r.$pagePlaylistMenuRootView || "destinations";
        r.$pagePlaylistMenu.append(
          option(rootView === "release-actions" ? "← More actions" : isRelease ? "← Add album" : "← Add destination", () => r.$renderPagePlaylistMenu(selection, rootView), false, "is-back"),
          option(isRelease ? "＋ Add album to current cart" : isBatch ? "＋ Add all to current cart" : "＋ Add to current cart", () => {
            const anchor = r.$pagePlaylistMenuAnchor;
            r.$closePagePlaylistMenu();
            // A release whose price the buyer sets must ask for an amount here
            // rather than silently committing to Bandcamp's minimum.
            if (isRelease && albumTrack) void r.$requestReleaseCartAdd(anchor, albumTrack);
            else void r.$addTracksToCurrentCart(cartTracks, "t");
          }, false, "is-prominent")
        );
        for (const snapshot of savedCarts) {
          r.$pagePlaylistMenu.append(option(`＋ ${snapshot.name}`, () => {
            r.$closePagePlaylistMenu();
            void r.$addTracksToSavedCart(cartTracks, snapshot.id, isRelease ? "a" : "t");
          }));
        }
        if (!savedCarts.length) {
          const empty = document.createElement("div");
          empty.className = "bandcamp-hub-page-playlist-menu-empty";
          empty.textContent = "No saved carts yet";
          r.$pagePlaylistMenu.append(empty);
        }
      } else if (view === "name-your-price") {
        const request = r.$pagePriceRequest || {};
        const minimumPrice = Math.max(0, Number(request.minimumPrice) || 0);
        const heading = document.createElement("div");
        heading.className = "bandcamp-hub-page-playlist-menu-heading";
        heading.textContent = minimumPrice > 0
          ? `Name your price · ${r.$compactPagePrice(minimumPrice, request.currency, false)} minimum`
          : "Name your price · any amount above zero";
        const { form, input } = createPagePriceForm({
          currency: request.currency || "USD",
          minimumPrice,
          suggested: minimumPrice,
          onSubmit: (amount) => {
            r.$closePagePlaylistMenu();
            void r.$addReleaseToCart(request.track || firstTrack, amount);
          }
        });
        r.$pagePlaylistMenu.append(heading, form);
        window.setTimeout(() => input.focus(), 0);
      } else if (view === "release-actions") {
        const actions = [];
        if (r.$nativeGiftControl()) {
          actions.push(option("Gift", () => {
            r.$closePagePlaylistMenu();
            const control = r.$nativeGiftControl();
            if (control) control.click();
            else r.$showToast("Bandcamp's gift option is not available for this album.");
          }));
        }
        if (runtimeState.autoAnalyzeTracks === false) {
          const analyzing = r.$pageTrackAnalysisStatus === "analyzing";
          actions.push(option(analyzing ? "Re-analysing BPM & key…" : "Re-analyse BPM & key for all tracks", () => {
            r.$closePagePlaylistMenu();
            void r.$analyzePageTracks({ manual: true, force: true });
          }, analyzing));
        }
        r.$pagePlaylistMenu.append(...actions);
      } else {
        const inPlaying = tracks.every((track) => runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track)));
        const destinations = [
          option(inPlaying
            ? isRelease ? "✓ Album in Now Playing" : isBatch ? "✓ All in Now Playing" : "✓ In Now Playing"
            : isRelease ? "＋ Add album to Now Playing" : isBatch ? "＋ Add all to Now Playing" : "＋ Add to Now Playing", () => {
            r.$closePagePlaylistMenu();
            r.$addTracksToPlaylist(tracks);
          }, inPlaying),
          r.$playlistsFeatureEnabled() ? option(isRelease ? "＋ Add album to Playlist…" : isBatch ? "＋ Add all to Playlist…" : "＋ Add to Playlist…", () => r.$renderPagePlaylistMenu(selection, "playlists")) : null
        ].filter(Boolean);
        if (!isOwned && r.$cartFeaturesEnabled()) {
          destinations.push(option(isRelease ? "＋ Add album to Cart…" : isBatch ? "＋ Add all to Cart…" : "＋ Add to Cart…", () => r.$renderPagePlaylistMenu(selection, "carts")));
        }
        if (!isBatch || isRelease) {
          const wishlistTrack = albumTrack || firstTrack;
          const nativeReleaseWishlisted = isRelease && Boolean(document.querySelector("#collect-item.wishlisted"));
          const wishlisted = nativeReleaseWishlisted || (runtimeState.wishlistTrackKeys || []).includes(r.$wishlistTrackKey(wishlistTrack));
          const wishlistOption = option(wishlisted ? isRelease ? "Album in Wishlist" : "In Wishlist" : isRelease ? "Add album to Wishlist" : "Add to Wishlist", () => {
            r.$closePagePlaylistMenu();
            if (isRelease && r.$activateNativeTrackAction("wishlist", !wishlisted)) {
              r.$markWishlistTrack(wishlistTrack, !wishlisted);
              r.$showToast(wishlisted ? "Removed album from your Bandcamp wishlist" : "Added album to your Bandcamp wishlist");
              return;
            }
            void r.$openTrackAction(wishlistTrack, "wishlist", { active: !wishlisted });
          }, false, `is-wishlist${wishlisted ? " is-active" : ""}`);
          wishlistOption.style.setProperty("--bandkit-wishlist-option-icon", `url('${asset(wishlisted ? "icon-wishlist-filled.svg" : "icon-wishlist.svg")}')`);
          wishlistOption.setAttribute("aria-pressed", String(wishlisted));
          destinations.push(wishlistOption);
        }
        r.$pagePlaylistMenu.append(...destinations);
      }
      r.$positionPagePlaylistMenu();
    };
}

export const registerPagePlayerUi = [registerPagePlayerUi1, registerPagePlayerUi2, registerPagePlayerUi3, registerPagePlayerUi4, registerPagePlayerUi5];
