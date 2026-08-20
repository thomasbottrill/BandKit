import { runtimeLive, runtimeSeamless, runtimeState } from "./context.js";
import { asset, formatDuration, safeBandcampUrl } from "../core.js";
import { accessibleScrubberPalette, colorString, hexColor, luminance, mixColor, parseColor } from "../color.js";
import { waveformPathData } from "../waveform.js";
import { MESSAGES } from "../../shared/contracts.js";

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
        player.classList.remove("bandcamp-hub-current", "bandcamp-hub-is-playing");
      }
      for (const control of document.querySelectorAll("[data-bandkit-playback-state]")) {
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
        const itemData = r.$parseJsonAttribute(card, "data-item-json") || {};
        const title = itemData.featured_track_title || r.$elementText(card, [".fav-track-title", ".fav-track-link", ".fav-track-static", ".collection-item-title", ".waypoint-item-title"]);
        if (control && card.classList.contains("paused")) control.setAttribute("aria-label", `Play ${title || "track"}`);
      }
      if (!runtimeSeamless.enabled || !runtimeSeamless.track) return;
      const activeId = String(runtimeSeamless.track.id || "");
      for (const card of feedCards) {
        if (String(card.dataset.trackid || "") !== activeId) continue;
        card.setAttribute("data-bandkit-feed-playback", runtimeSeamless.isPlaying ? "playing" : "paused");
        const control = card.querySelector(".track_play_auxiliary");
        control?.setAttribute("aria-label", runtimeSeamless.isPlaying ? `Pause ${runtimeSeamless.track.title || "track"}` : `Play ${runtimeSeamless.track.title || "track"}`);
      }
    };
}

function registerPagePlayerUi2(r) {
r.$syncPagePlayerUi = function syncPagePlayerUi() {
      r.$syncFeedPagePlaybackUi();
      if (!runtimeSeamless.enabled) {
        document.body.classList.remove("bandcamp-hub-remote-playing");
        r.$restorePagePlayerUi();
        return;
      }
      r.$ensurePageStyles();
      const pageData = r.$getBandcampPageData();
      const inlineTitle = document.querySelector(".inline_player .title");
      const currentPageTrack = r.$matchingPagePlaybackTrack(r.$buildSeamlessQueue(), runtimeSeamless.track || {});
      if (!currentPageTrack) {
        document.body.classList.remove("bandcamp-hub-remote-playing");
        r.$restorePagePlayerUi();
        return;
      }
      r.$capturePagePlayerUi();
      document.body.classList.toggle("bandcamp-hub-remote-playing", Boolean(runtimeSeamless.isPlaying));
      if (inlineTitle && runtimeSeamless.track?.title) inlineTitle.textContent = runtimeSeamless.track.title;
      for (const player of document.querySelectorAll(".inline_player, .track_row_view")) {
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
      r.$ensurePagePlayerWaveforms();
    };
r.$populatePageWaveform = function populatePageWaveform(control, signature, width = 0) {
      const svg = control.querySelector(":scope > .bandkit-page-scrub-waveform");
      if (!svg) return;
      const pixelWidth = Math.max(80, Math.round(width || control.getBoundingClientRect().width || 320));
      if (control.dataset.bandkitWaveformSignature === signature
        && Math.abs(Number(control.dataset.bandkitWaveformWidth) - pixelWidth) < 4) return;
      const waveform = waveformPathData(signature, pixelWidth);
      svg.setAttribute("viewBox", `0 0 ${waveform.pixelWidth} 24`);
      for (const path of svg.querySelectorAll("path")) path.setAttribute("d", waveform.pathData);
      control.dataset.bandkitWaveformSignature = signature;
      control.dataset.bandkitWaveformWidth = String(waveform.pixelWidth);
    };
r.$pageWaveformSvg = function pageWaveformSvg() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "bandkit-page-scrub-waveform");
      svg.setAttribute("viewBox", "0 0 320 24");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      for (const className of ["bandkit-page-waveform-remaining", "bandkit-page-waveform-played"]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", className);
        svg.append(path);
      }
      return svg;
    };
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
      const fraction = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
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
      const timeline = control.querySelector(":scope > .bandkit-page-scrub-slider");
      if (timeline) {
        timeline.dispatchEvent(new Event("input", { bubbles: true }));
        timeline.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      const duration = r.$pageScrubDuration(control);
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
        const fraction = cancelled ? drag.fraction : r.$previewPageScrub(control, event.clientX);
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
        if (event.button !== 0 || !r.$pageScrubDuration(control)) return;
        drag = { pointerId: event.pointerId, fraction: r.$previewPageScrub(control, event.clientX) };
        control.classList.add("is-scrubbing");
        try { control.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      }, true);
      control.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.fraction = r.$previewPageScrub(control, event.clientX);
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
        const playhead = document.createElement("span");
        playhead.className = "bandkit-page-scrub-playhead";
        playhead.setAttribute("aria-hidden", "true");
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
        const sourceCell = control.closest(".prev_cell, .next_cell");
        if (sourceCell) sourceCell.classList.add("bandkit-page-transport-cell-empty");
        if (!control.hasAttribute("aria-label")) control.setAttribute("aria-label", index ? "Next track" : "Previous track");
        control.classList.add("bandkit-page-skip-control", index ? "is-next" : "is-previous");
        r.$setPageActionLabel(control, "");
        if (control.parentElement !== row) row.append(control);
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
      const playerStyles = getComputedStyle(r.$host);
      const sharedAccentValue = playerStyles.getPropertyValue("--hub-scrub-accent").trim();
      const sharedRemainingValue = playerStyles.getPropertyValue("--hub-scrub-remaining").trim();
      const sharedPlayerAccent = parseColor(sharedAccentValue) || hexColor(sharedAccentValue, null);
      const preferredAccent = sharedPlayerAccent || parseColor(
        styles.getPropertyValue("--hub-scrub-accent")
        || styles.getPropertyValue("--hub-accent")
        || styles.getPropertyValue("--bandkit-page-accent")
        || styles.getPropertyValue("--link-color")
      ) || r.$firstComputedColor(["a.primaryText", ".download-link", ".buy-link", "a"], "color") || { r: 29, g: 160, b: 195, a: 1 };
      const palette = accessibleScrubberPalette(preferredAccent, surface);
      control.style.setProperty("--bandkit-scrub-accent", colorString(palette.accent));
      control.style.setProperty("--bandkit-scrub-remaining", sharedRemainingValue || colorString(mixColor(surface, palette.halo, 0.22)));
      control.style.setProperty("--bandkit-scrub-surface", colorString(palette.surface));
      control.style.setProperty("--bandkit-scrub-halo", colorString(palette.halo, 0.62));
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
      document.documentElement.style.setProperty("--bandkit-play-icon", `url('${asset("icon-play.svg")}')`);
      document.documentElement.style.setProperty("--bandkit-pause-icon", `url('${asset("icon-pause.svg")}')`);
      document.documentElement.style.setProperty("--bandkit-skip-icon", `url('${asset("icon-skip.svg")}')`);
      document.documentElement.style.setProperty("--bandkit-close-icon", `url('${asset("icon-close.svg")}')`);
      if (!document.querySelector("#bandcamp-hub-page-style")) {
        const pageStyle = document.createElement("style");
        pageStyle.id = "bandcamp-hub-page-style";
        pageStyle.textContent = `.bandcamp-hub-page-dj{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:flex;height:32px;justify-content:center;margin:8px 0 0;padding:0;width:32px}.bandcamp-hub-page-dj::before{background:currentColor;content:"";height:18px;mask:var(--hub-dj-icon) center/contain no-repeat;-webkit-mask:var(--hub-dj-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-dj:hover,.bandcamp-hub-page-dj:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-dj.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-dj-host{box-sizing:border-box;display:block;margin-top:8px;min-width:0;width:100%}.bandcamp-hub-page-dj-host[hidden]{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline>svg{display:none!important}body.bandcamp-hub-remote-playing section.floating-player .play-pause-button.outline::after{background:currentColor;content:"";display:block;height:18px;mask:var(--bandkit-pause-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-pause-icon) center/contain no-repeat;width:18px}`;
        pageStyle.textContent += `.bandkit-page-scrub-control{--bandkit-page-scrub-progress:0%;--bandkit-scrub-accent:#087f9e;--bandkit-scrub-remaining:#cbd0d5;--bandkit-scrub-surface:#fff;--bandkit-scrub-halo:rgba(17,24,39,.62);align-items:center;box-sizing:border-box;display:flex;height:28px;min-width:0;position:relative;touch-action:none;width:100%}.bandkit-page-scrub-control.is-modern{flex:1 1 240px;grid-column:1/-1}.bandkit-page-scrub-slider{appearance:none!important;background:transparent!important;cursor:pointer;height:28px!important;inset:0;margin:0!important;opacity:0;position:absolute!important;width:100%!important;z-index:3}.bandkit-page-scrub-waveform{display:block;height:24px;overflow:visible;pointer-events:none;width:100%}.bandkit-page-scrub-waveform path{fill:none;stroke-linecap:round;stroke-width:2.4}.bandkit-page-waveform-remaining{stroke:var(--bandkit-scrub-remaining)}.bandkit-page-waveform-played{clip-path:inset(0 calc(100% - var(--bandkit-page-scrub-progress)) 0 0);stroke:var(--bandkit-scrub-accent)}.bandkit-page-scrub-playhead{background:var(--bandkit-scrub-surface);border:2px solid var(--bandkit-scrub-accent);border-radius:999px;box-shadow:0 0 0 1px var(--bandkit-scrub-halo),0 1px 4px rgba(0,0,0,.22);height:8px;left:var(--bandkit-page-scrub-progress);opacity:0;pointer-events:none;position:absolute;top:50%;transform:translate(-50%,-50%) scale(.75);transition:opacity 120ms ease,transform 120ms ease;width:8px;z-index:2}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{opacity:1;transform:translate(-50%,-50%) scale(1)}.inline_player .progbar.bandkit-page-scrub-control{height:28px!important;overflow:visible!important}.inline_player .progbar.bandkit-page-scrub-control :is(.progbar_empty,.progbar_fill,.thumb){background:transparent!important}.inline_player .progbar.bandkit-page-scrub-control>.progbar_empty{height:28px!important;inset:0;opacity:0!important;position:absolute;width:100%;z-index:3}.inline_player .progbar.bandkit-page-scrub-control .progbar_fill,.inline_player .progbar.bandkit-page-scrub-control .thumb{opacity:0!important}`;
        pageStyle.textContent += `.bandkit-page-scrub-control.is-traditional::before,.bandkit-page-scrub-control.is-traditional::after{border-radius:999px;content:"";height:4px;left:0;pointer-events:none;position:absolute;top:50%;transform:translateY(-50%)}.bandkit-page-scrub-control.is-traditional::before{background:var(--bandkit-scrub-remaining);right:0}.bandkit-page-scrub-control.is-traditional::after{background:var(--bandkit-scrub-accent);width:var(--bandkit-page-scrub-progress)}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-waveform{opacity:0}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-playhead{box-sizing:border-box;height:12px;opacity:1;transform:translate(-50%,-50%) scale(1);width:12px}.bandkit-page-scrub-control.is-traditional:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{transform:translate(-50%,-50%) scale(1.08)}`;
        pageStyle.textContent += `.bandkit-page-scrub-playhead{background:var(--bandkit-scrub-accent);border:2px solid var(--bandkit-scrub-surface);height:18px;transition:box-shadow 140ms ease,height 140ms ease,opacity 120ms ease,transform 140ms ease,width 140ms ease;width:7px}.bandkit-page-scrub-control:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{box-shadow:0 0 0 1px var(--bandkit-scrub-halo),0 2px 7px color-mix(in srgb,var(--bandkit-scrub-accent) 38%,transparent);height:22px;opacity:1;transform:translate(-50%,-50%) scale(1);width:9px}.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-playhead{height:18px;transform:translate(-50%,-50%) scale(1);width:7px}.bandkit-page-scrub-control.is-traditional:hover>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional.is-scrubbing>.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:focus-visible~.bandkit-page-scrub-playhead,.bandkit-page-scrub-control.is-traditional>.bandkit-page-scrub-slider:active~.bandkit-page-scrub-playhead{height:22px;opacity:1;transform:translate(-50%,-50%) scale(1);width:9px}`;
        pageStyle.textContent += `.bandkit-page-transport-row{align-items:center;display:flex;gap:10px;margin-left:auto;margin-right:-8px;min-height:32px}.bandkit-page-transport-row>:is(a,button,[role="button"],.prevbutton,.nextbutton){align-items:center;display:inline-flex!important;height:32px;justify-content:center;margin:0!important;min-width:32px;top:auto!important}.bandkit-page-skip-control{background:transparent!important;border:1px solid transparent!important;border-radius:4px!important;color:var(--hub-accent,var(--bandkit-release-accent,var(--link-color,#1da0c3)))!important;font-size:0!important}.bandkit-page-skip-control>*{display:none!important}.bandkit-page-skip-control::before{background:currentColor;content:"";display:block;height:20px;mask:var(--bandkit-skip-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-skip-icon) center/contain no-repeat;width:20px}.bandkit-page-skip-control:is(:hover,:focus-visible){background:var(--hub-accent-soft,var(--bandkit-release-accent-soft,rgba(29,160,195,.12)))!important;border-color:var(--hub-accent,var(--bandkit-release-accent,var(--link-color,#1da0c3)))!important;box-shadow:none!important;outline:0!important;transform:none!important}.bandkit-page-skip-control.is-previous::before{transform:rotate(180deg)}.bandkit-page-transport-cell-empty{display:none!important}`;
        pageStyle.textContent += `[data-bandkit-extension-stacking]{z-index:2147483646!important}`;
        pageStyle.textContent += `#DiscoverApp .focused-result{scroll-padding-bottom:calc(var(--bandkit-player-reserved-height,84px) + 16px)}`;
        pageStyle.textContent += `html[data-bandkit-hide-bandcamp-player="true"] :is(.discover-player,section.floating-player){display:none!important}html[data-bandkit-feed-page="true"] :is(#track_play_waypoint,.track_play_waypoint){display:none!important}`;
        pageStyle.textContent += `html[data-bandkit-hide-page-cart="true"] #sidecart{display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,.menubar-cart-icon,#cart-link,#cart-control){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) :is(a,button,[role="button"],li):has(use[href$="#menubar-cart-icon"],use[xlink\\:href$="#menubar-cart-icon"],svg.menubar-cart-icon){display:none!important}html[data-bandkit-hide-header-cart="true"] :is(header,#menubar-wrapper,#user-nav,ul[role="menubar"].menu-items) li:has(> :is(a[href*="/cart"],a[href*="bandcamp.com/cart"],[aria-label*="cart" i],[title*="cart" i],[data-testid*="cart" i],.cart-link,.cart-wrapper,.cart-wrapper-corp-lo,#cart-link,#cart-control)){display:none!important}`;
        pageStyle.textContent += `.bandcamp-hub-page-tools{align-items:center;box-sizing:border-box;display:flex;flex-wrap:nowrap;gap:8px;margin:12px 0 0;max-width:100%;min-width:0;white-space:nowrap;width:100%}.bandcamp-hub-page-tools>:not(.bandkit-page-transport-row){flex:0 0 auto}.bandcamp-hub-page-tools .bandcamp-hub-page-dj{margin:0}.bandcamp-hub-page-playlist{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-size:0;height:32px;justify-content:center;line-height:0;margin:8px 0 0;padding:0;text-decoration:none!important;vertical-align:middle;width:32px}.bandcamp-hub-page-playlist::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-plus-icon) center/contain no-repeat;-webkit-mask:var(--hub-plus-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-playlist:hover,.bandcamp-hub-page-playlist:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandcamp-hub-page-playlist.is-added{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-playlist.is-player-control{margin:0}.bandcamp-hub-page-playlist.is-track-action{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-line,rgba(127,127,127,.35))!important;color:var(--hub-accent,var(--link-color,#1da0c3))!important;height:24px;margin:0 8px 0 0!important;opacity:0;pointer-events:none;text-decoration:none!important;width:24px}.bandcamp-hub-page-playlist.is-track-action::before{height:14px;width:14px}.bandcamp-hub-page-playlist.is-track-action:hover,.bandcamp-hub-page-playlist.is-track-action:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;text-decoration:none!important}.bandcamp-hub-page-playlist.is-track-action.is-added{background:var(--hub-accent,var(--link-color,#1da0c3))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;color:var(--hub-on-accent,#fff)!important}.track_row_view:hover .bandcamp-hub-page-playlist.is-track-action,.track_row_view:focus-within .bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-playlist.is-track-action:focus-visible{opacity:1;pointer-events:auto}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to{appearance:none;background:transparent!important;border:0!important;border-radius:0!important;color:var(--link-color,#0687f5)!important;font:inherit!important;font-weight:700!important;height:auto!important;line-height:inherit!important;margin:0 10px 0 0!important;padding:0!important;width:auto!important}html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to::before{display:none!important}html[data-bandkit-feed-page="true"] .bandcamp-hub-page-playlist.is-feed-add-to.is-added{background:transparent!important;color:var(--link-color,#0687f5)!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions>li{align-items:center!important;display:flex!important;gap:4px!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-sidebar-actions>li::before{display:none!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-action .wishlist-msg,.bandkit-feed-wishlist-action .wishlisted-msg>span:first-child){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;height:28px!important;justify-content:center!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action):hover,html[data-bandkit-feed-page="true"] .collection-grid :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action):focus-visible,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child):hover,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child):focus-visible{background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandcamp-hub-page-playlist.is-feed-sidebar-action{font-size:0!important}html[data-bandkit-feed-page="true"] .collection-grid .bandcamp-hub-page-playlist.is-feed-sidebar-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action){font-size:0!important}html[data-bandkit-feed-page="true"] .collection-grid :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .wishlist-msg>span,html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .wishlisted-msg>span:first-child>span{display:none!important}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action :is(.wishlist-msg,.wishlisted-msg>span:first-child)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .collection-grid .bandkit-feed-wishlist-action .text{clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;height:1px!important;overflow:hidden!important;position:absolute!important;white-space:nowrap!important;width:1px!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .bandkit-feed-action-row{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row>li{align-items:center!important;display:flex!important;gap:4px!important;margin:0!important;padding:0!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row>li::before{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;font-size:0!important;height:28px!important;justify-content:center!important;line-height:0!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action,.bandkit-feed-wishlist-control):is(:hover,:focus-visible){background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandcamp-hub-page-playlist.is-feed-compact-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row :is(.bandkit-feed-purchase-action,.bandkit-feed-hear-more-action)::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandkit-feed-wishlist-control>*{display:none!important}html[data-bandkit-feed-page="true"] .bandkit-feed-action-row .bandkit-feed-wishlist-control::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-wishlist-icon) center/contain no-repeat;width:16px}`;
        pageStyle.textContent += `html[data-bandkit-collection-page="true"] .bandkit-collection-action-row{align-items:center!important;display:flex!important;gap:4px!important;margin-top:8px!important}html[data-bandkit-collection-page="true"] .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action){align-items:center!important;appearance:none;background:transparent!important;border:1px solid rgba(127,127,127,.35)!important;border-radius:4px!important;box-sizing:border-box!important;color:var(--link-color,#0687f5)!important;cursor:pointer!important;display:inline-flex!important;font-size:0!important;height:28px!important;justify-content:center!important;line-height:0!important;margin:0!important;padding:0!important;text-decoration:none!important;width:28px!important}html[data-bandkit-collection-page="true"] .bandkit-collection-action-row :is(.bandcamp-hub-page-playlist.is-feed-compact-action,.bandkit-collection-download-action):is(:hover,:focus-visible){background:rgba(6,135,245,.1)!important;border-color:currentColor!important;outline:0!important}html[data-bandkit-collection-page="true"] .bandkit-collection-action-row .bandcamp-hub-page-playlist.is-feed-compact-action::before{display:block!important;height:16px!important;width:16px!important}html[data-bandkit-collection-page="true"] .bandkit-collection-download-action::before{background:currentColor;content:"";display:block;height:16px;mask:var(--bandkit-feed-action-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-feed-action-icon) center/contain no-repeat;width:16px}html[data-bandkit-collection-page="true"] #collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .bottom-owner-controls .redownload-item{display:none!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .story-innards>.story-body{padding-bottom:6px!important}html[data-bandkit-feed-page="true"] .story-innards>.tralbum-wrapper-collect-controls{margin-bottom:18px!important}html[data-bandkit-feed-page="true"] .story-innards>.tralbum-wrapper-collect-controls .bandkit-feed-action-row{margin-top:4px!important}`;
        pageStyle.textContent += `html[data-bandkit-feed-page="true"] .collection-item-container .play-icon{background:currentColor!important;border:0!important;color:#fff!important;height:24px!important;margin:13px!important;mask:var(--bandkit-play-icon) center/contain no-repeat!important;-webkit-mask:var(--bandkit-play-icon) center/contain no-repeat!important;width:24px!important}html[data-bandkit-feed-page="true"] .collection-item-container[data-bandkit-feed-playback="playing"] .play-icon{background:linear-gradient(90deg,currentColor 0 35%,transparent 35% 65%,currentColor 65% 100%)!important;height:24px!important;mask:none!important;-webkit-mask:none!important;width:18px!important}`;
        pageStyle.textContent += `#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button,.bandcamp-hub-page-playlist.is-discover-add-to){align-items:center!important;appearance:none!important;background:var(--bandkit-page-card,var(--hub-card,#fff))!important;border:1px solid var(--bandkit-page-border,var(--hub-line,rgba(127,127,127,.35)))!important;border-radius:8px!important;box-shadow:0 1px 2px rgba(0,0,0,.12)!important;box-sizing:border-box!important;color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;display:inline-flex!important;filter:none!important;height:36px!important;justify-content:center!important;margin:0!important;width:36px!important}#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button,.bandcamp-hub-page-playlist.is-discover-add-to):is(:hover,:focus-visible){background:var(--bandkit-page-card,var(--hub-card,#fff))!important;background:color-mix(in srgb,var(--bandkit-page-accent,var(--hub-accent,#1da0c3)) 16%,var(--bandkit-page-card,var(--hub-card,#fff)))!important;border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;filter:none!important;opacity:1!important;outline:0!important}#DiscoverApp :is(.results-grid-item .image-container>.play-pause-button,.results-grid-item .image-container>.play-button,.focused-result>.artwork-play-button,.focused-result>.play-pause-button,.focused-result>.play-button,.discover-detail>.play-pause-button,.discover-detail>.play-button):is(:hover,:focus-visible)>*{opacity:1!important}#DiscoverApp .results-grid-item .image-container>:is(.play-pause-button,.play-button){bottom:8px!important;left:8px!important;position:absolute!important}#DiscoverApp .results-grid-item .image-container>.bandcamp-hub-page-playlist.is-discover-add-to{bottom:8px!important;left:50px!important;right:auto!important;top:auto!important}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to{position:absolute!important;z-index:8}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to::before{height:16px!important;width:16px!important}#DiscoverApp .bandcamp-hub-page-playlist.is-discover-add-to.is-added{background:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;border-color:var(--bandkit-page-accent,var(--hub-accent,var(--link-color,#1da0c3)))!important;color:var(--bandkit-page-on-accent,var(--hub-on-accent,#fff))!important}`;
        pageStyle.textContent += `.results-grid-item .bandcamp-hub-page-playlist.is-discover-add-to{opacity:0;pointer-events:none;transition:opacity .12s ease}.results-grid-item:hover .bandcamp-hub-page-playlist.is-discover-add-to,.results-grid-item:focus-within .bandcamp-hub-page-playlist.is-discover-add-to,.results-grid-item .bandcamp-hub-page-playlist.is-discover-add-to:focus-visible{opacity:1;pointer-events:auto}`;
        pageStyle.textContent += `#recommendations_container .recommended-album .album-art-container{position:relative}#recommendations_container .recommended-album .bandcamp-hub-page-playlist.is-recommendation-add-to{bottom:10px!important;left:52px!important;opacity:0;pointer-events:none;position:absolute!important;top:auto!important;transition:opacity .12s ease;z-index:3}#recommendations_container .recommended-album:is(:hover,:focus-within,.bandkit-recommendation-current) .bandcamp-hub-page-playlist.is-recommendation-add-to,#recommendations_container .recommended-album .bandcamp-hub-page-playlist.is-recommendation-add-to:focus-visible{opacity:1;pointer-events:auto}#recommendations_container .recommended-album.bandkit-recommendation-current .play-button{opacity:1!important}`;
        pageStyle.textContent += `:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Play" i],:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Resume" i],:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Pause" i]{font-size:0!important}:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label] > :is(svg,.play-icon){display:none!important}:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Play" i]::after,:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Resume" i]::after,:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Pause" i]::after{background:currentColor!important;content:""!important;display:block!important;flex:0 0 18px!important;height:18px!important;mask:var(--bandkit-play-icon) center/contain no-repeat!important;-webkit-mask:var(--bandkit-play-icon) center/contain no-repeat!important;width:18px!important}:is(section.floating-player,#DiscoverApp,#HomepageApp,#PlaylistPage,#recommendations_container) :is(.play-pause-button,.play-button,.artwork-play-button)[aria-label^="Pause" i]::after{mask-image:var(--bandkit-pause-icon)!important;-webkit-mask-image:var(--bandkit-pause-icon)!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-release="false"] body.tralbum-page .inline_player .playbutton{background:none!important;position:relative}html[data-bandkit-modern-release="false"] body.tralbum-page .inline_player .playbutton::before{background:currentColor;border:0;content:"";height:24px;left:50%;mask:var(--bandkit-play-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-play-icon) center/contain no-repeat;position:absolute;top:50%;transform:translate(-50%,-50%);width:24px}html[data-bandkit-modern-release="false"] body.tralbum-page .inline_player .playbutton.playing::before{mask-image:var(--bandkit-pause-icon);-webkit-mask-image:var(--bandkit-pause-icon)}html[data-bandkit-modern-release="false"] body.tralbum-page #track_table .play_status{background:none!important;position:relative}html[data-bandkit-modern-release="false"] body.tralbum-page #track_table .play_status::before{background:currentColor;border:0;content:"";height:14px;left:50%;mask:var(--bandkit-play-icon) center/contain no-repeat;-webkit-mask:var(--bandkit-play-icon) center/contain no-repeat;position:absolute;top:50%;transform:translate(-50%,-50%);width:14px}html[data-bandkit-modern-release="false"] body.tralbum-page #track_table .play_status.playing::before,html[data-bandkit-modern-release="false"] body.tralbum-page #track_table .track_row_view.bandcamp-hub-is-playing .play_status::before{mask-image:var(--bandkit-pause-icon);-webkit-mask-image:var(--bandkit-pause-icon)}`;
        pageStyle.textContent += `.bandcamp-hub-page-cart{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12));border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:999px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;height:32px;justify-content:center;margin:0;padding:0;width:32px}.bandcamp-hub-page-cart::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-cart-icon) center/contain no-repeat;-webkit-mask:var(--hub-cart-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-cart:hover,.bandcamp-hub-page-cart:focus-visible{border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-cart.is-active{background:var(--hub-accent,var(--link-color,#1da0c3));border-color:var(--hub-accent,var(--link-color,#1da0c3));color:var(--hub-on-accent,#fff)}.bandcamp-hub-page-cart:disabled{cursor:not-allowed;opacity:.45}`;
        pageStyle.textContent += `.bandcamp-hub-page-cart.has-price{gap:5px;padding:0 9px 0 7px;touch-action:manipulation;width:auto}.bandcamp-hub-page-cart>*{pointer-events:none}.bandcamp-hub-page-cart.has-price::before{height:16px;width:16px}.bandcamp-hub-page-cart-price{font-family:inherit;font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1;white-space:nowrap}.bandcamp-hub-page-overflow{align-items:center;appearance:none;background:transparent;border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:4px;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3));cursor:pointer;display:inline-flex;font-family:inherit;font-size:0;height:32px;justify-content:center;line-height:0;margin:0;min-height:32px;padding:0;text-decoration:none!important;width:32px}.bandcamp-hub-page-overflow::before{background:currentColor;content:"";display:block;height:18px;mask:var(--hub-more-icon) center/contain no-repeat;-webkit-mask:var(--hub-more-icon) center/contain no-repeat;width:18px}.bandcamp-hub-page-overflow:is(:hover,:focus-visible,.is-active){background:var(--hub-accent-soft,rgba(29,160,195,.12));border-color:var(--hub-accent,var(--link-color,#1da0c3));outline:0;text-decoration:none!important}.bandkit-track-analysis{color:var(--bandkit-release-muted,var(--hub-faint,#6b7280));font-size:11px;font-weight:600;margin-left:8px;white-space:nowrap}.bandkit-track-analysis:is(.is-analyzing,.is-unavailable){font-weight:400;opacity:.75}`;
        pageStyle.textContent += `.bandkit-track-analysis{align-items:center;column-gap:6px;display:inline-grid;grid-template-columns:72px 28px minmax(48px,auto);margin-left:0;min-width:0;width:160px}.bandkit-track-analysis-bpm{text-align:right}.bandkit-track-analysis-camelot{text-align:center}.bandkit-track-analysis-key{text-align:left}.bandkit-track-analysis-pending{grid-column:1/-1;text-align:right}html[data-bandkit-show-track-keys="false"] .bandkit-track-analysis{grid-template-columns:72px;width:72px}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{align-items:center;column-gap:10px;display:grid!important;grid-template-columns:minmax(0,1fr) 52px 160px;white-space:nowrap;width:100%!important}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis>a{display:block;min-width:0;overflow:hidden;width:100%}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis .track-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis>.time{margin-left:0!important;text-align:right}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 52px 72px}html[data-bandkit-modern-release="true"] body.tralbum-page .inline_player .bandkit-track-analysis.is-inline{margin-left:12px}@media(max-width:700px){html[data-bandkit-modern-release="true"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{column-gap:6px;grid-template-columns:minmax(0,1fr) 48px 142px}.bandkit-track-analysis{column-gap:4px;font-size:10px;grid-template-columns:64px 26px minmax(44px,auto);width:142px}html[data-bandkit-modern-release="true"][data-bandkit-show-track-keys="false"] body.tralbum-page #track_table .title-col .title.bandkit-has-track-analysis{grid-template-columns:minmax(0,1fr) 48px 64px}html[data-bandkit-show-track-keys="false"] .bandkit-track-analysis{grid-template-columns:64px;width:64px}}`;
        pageStyle.textContent += `.bandcamp-hub-page-buy{align-items:center;background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:999px!important;box-sizing:border-box;color:var(--hub-accent,var(--link-color,#1da0c3))!important;display:inline-flex!important;flex:0 0 24px;font-size:0!important;height:24px;justify-content:center;line-height:0!important;margin:0!important;overflow:hidden;padding:0!important;text-decoration:none!important;vertical-align:middle;width:24px!important}.bandcamp-hub-page-buy::before{background:currentColor;content:"";display:block;height:14px;mask:var(--hub-buy-icon) center/contain no-repeat;-webkit-mask:var(--hub-buy-icon) center/contain no-repeat;width:14px}.bandcamp-hub-page-buy:hover,.bandcamp-hub-page-buy:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0;text-decoration:none!important}`;
        pageStyle.textContent += `.track_row_view .bandkit-generated-track-buy{opacity:0;pointer-events:none}.track_row_view:hover .bandkit-generated-track-buy,.track_row_view:focus-within .bandkit-generated-track-buy,.bandkit-generated-track-buy:focus-visible{opacity:1;pointer-events:auto}`;
        pageStyle.textContent += `.bandcamp-hub-page-playlist-menu{background:var(--hub-card,#fff);border:1px solid var(--hub-line,rgba(127,127,127,.35));border-radius:5px;box-shadow:0 8px 24px rgba(0,0,0,.22);box-sizing:border-box;color:var(--hub-ink,#111);font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif);min-width:180px;padding:4px;position:absolute;z-index:2147483647}.bandcamp-hub-page-playlist-menu button{background:transparent;border:0;border-radius:3px;color:inherit;cursor:pointer;display:block;font-family:inherit;font-size:11px;line-height:1.3;padding:8px;text-align:left;width:100%}.bandcamp-hub-page-playlist-menu button:hover:not(:disabled),.bandcamp-hub-page-playlist-menu button:focus-visible{background:var(--hub-accent-soft,rgba(29,160,195,.12));color:var(--hub-accent,var(--link-color,#1da0c3));outline:0}.bandcamp-hub-page-playlist-menu button:disabled{color:var(--hub-faint,#9ca3af);cursor:default}.bandcamp-hub-page-playlist-menu .is-back{border-bottom:1px solid var(--hub-line,rgba(127,127,127,.35));color:var(--hub-muted,var(--hub-ink,#111));margin-bottom:3px}.bandcamp-hub-page-playlist-menu-empty{color:var(--hub-faint,#9ca3af);font-family:inherit;font-size:10px;line-height:1.3;padding:8px}`;
        pageStyle.textContent += `.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow),.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy{border-radius:4px!important;box-shadow:none!important;transform:none!important}.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow):not(.is-active):not(.is-added){background:transparent!important;border-color:transparent!important}.bandcamp-hub-page-tools :is(.bandcamp-hub-page-playlist,.bandcamp-hub-page-cart,.bandcamp-hub-page-dj,.bandcamp-hub-page-overflow):is(:hover,:focus-visible){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;box-shadow:none!important;transform:none!important}`;
        pageStyle.textContent += `section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action{align-self:center!important;background:transparent!important;border:1px solid var(--hub-line,rgba(127,127,127,.35))!important;border-radius:4px!important;box-shadow:none!important;flex:0 0 24px!important;height:24px!important;margin:0 0 0 auto!important;min-height:24px!important;opacity:1!important;padding:0!important;pointer-events:auto!important;position:static!important;width:24px!important}section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action::before{height:14px!important;width:14px!important}section.floating-player .player-dialog .meta-wrapper-wide .track-meta>.bandcamp-hub-page-playlist.is-modern-player-track-action:is(:hover,:focus-visible,.is-active,.is-added){background:var(--hub-accent-soft,rgba(29,160,195,.12))!important;border-color:var(--hub-accent,var(--link-color,#1da0c3))!important;outline:0!important}`;
        pageStyle.textContent += `.bandkit-page-action-label{display:none!important;pointer-events:none!important}.bandkit-page-action-label::after{content:attr(data-bandkit-label-text)}html[data-bandkit-page-action-labels="true"] [data-bandkit-label]>.bandkit-page-action-label{display:inline-block!important;font-family:var(--hub-font-family,"Helvetica Neue",Helvetica,Arial,sans-serif)!important;font-size:11px!important;font-weight:700!important;line-height:1.15!important;order:1;white-space:nowrap}html[data-bandkit-page-action-labels="true"] :is(.bandcamp-hub-page-tools,.track_row_view,section.floating-player) [data-bandkit-label]{gap:6px!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-page-action-labels="true"] .bandcamp-hub-page-cart-price{order:2}html[data-bandkit-page-action-labels="true"] #DiscoverApp [data-bandkit-label]{gap:6px!important;padding-left:9px!important;padding-right:9px!important;width:auto!important}html[data-bandkit-page-action-labels="true"] #recommendations_container .recommended-album [data-bandkit-label]{align-items:center!important;display:inline-flex!important;gap:6px!important;justify-content:center!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-page-action-labels="true"][data-bandkit-feed-page="true"] :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions) [data-bandkit-label],html[data-bandkit-page-action-labels="true"][data-bandkit-collection-page="true"] .bandkit-collection-action-row [data-bandkit-label]{gap:6px!important;padding-left:8px!important;padding-right:8px!important;width:auto!important}html[data-bandkit-page-action-labels="true"][data-bandkit-feed-page="true"] :is(.bandkit-feed-action-row,.bandkit-feed-sidebar-actions,.collection-grid) [data-bandkit-label]>.bandkit-page-action-label{display:inline-block!important}`;
        pageStyle.textContent += `html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col{min-width:136px!important;width:136px!important}html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col .dl_link{align-items:center!important;display:flex!important;flex-wrap:nowrap!important;gap:4px!important;justify-content:flex-end!important;white-space:nowrap!important;width:100%!important}html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col :is(.bandcamp-hub-page-playlist.is-track-action,.bandcamp-hub-page-buy){flex:0 0 auto!important}html[data-bandkit-modern-release="false"][data-bandkit-page-action-labels="true"] body.tralbum-page #track_table .download-col .bandcamp-hub-page-buy{min-width:max-content!important;overflow:visible!important;width:auto!important}`;
        document.head.append(pageStyle);
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
      button.setAttribute("aria-label", button._bandkitOwned
        ? `Add ${track.title} to Now Playing or a playlist`
        : `Add ${track.title} to Now Playing, a playlist, or a cart`);
      button.title = button.getAttribute("aria-label");
      r.$applyPageActionTheme(button);
    };
}

function registerPagePlayerUi5(r) {
r.$closePagePlaylistMenu = function closePagePlaylistMenu() {
      r.$pagePlaylistMenu?.remove();
      r.$pagePlaylistMenu = null;
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
      const isBatch = selection?.type === "bandkit-track-batch" && Array.isArray(selection.tracks);
      const isOwned = selection?.type === "bandkit-owned-track";
      const source = isBatch ? selection.tracks : [isOwned ? selection.track : selection];
      return {
        isBatch,
        isOwned,
        tracks: r.$normalizePlaylist(source.filter(Boolean).map(r.$capturePlaylistAnalysis))
      };
    };
r.$renderPagePlaylistMenu = function renderPagePlaylistMenu(selection, view = "destinations") {
      if (!r.$pagePlaylistMenu) return;
      const { tracks, isBatch, isOwned } = r.$pagePlaylistSelection(selection);
      const firstTrack = tracks[0];
      if (!firstTrack) {
        r.$closePagePlaylistMenu();
        return;
      }
      const option = (label, action, disabled = false, className = "") => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        button.className = className;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          action();
        });
        return button;
      };
      r.$pagePlaylistMenu.replaceChildren();
      if (view === "playlists") {
        const rootView = r.$pagePlaylistMenuRootView || "destinations";
        r.$pagePlaylistMenu.append(option(rootView === "release-actions" ? "← More actions" : "← Add destination", () => r.$renderPagePlaylistMenu(selection, rootView), false, "is-back"));
        if (rootView === "release-actions") {
          const inPlaying = tracks.every((track) => runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track)));
          r.$pagePlaylistMenu.append(option(inPlaying ? "✓ All in Now Playing" : "＋ Add all to Now Playing", () => {
            r.$closePagePlaylistMenu();
            r.$addTracksToPlaylist(tracks);
          }, inPlaying));
        }
        r.$pagePlaylistMenu.append(option("＋ New playlist", () => {
          r.$closePagePlaylistMenu();
          r.$createSavedPlaylistWithTracks(tracks, isBatch
            ? firstTrack.album || `${firstTrack.artist || "Bandcamp"} playlist`
            : `${firstTrack.artist || "Bandcamp"} playlist`);
        }));
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
          option(rootView === "release-actions" ? "← More actions" : "← Add destination", () => r.$renderPagePlaylistMenu(selection, rootView), false, "is-back"),
          option(isBatch ? "＋ Add all to current cart" : "＋ Add to current cart", () => {
            r.$closePagePlaylistMenu();
            void r.$addTracksToCurrentCart(tracks);
          })
        );
        for (const snapshot of savedCarts) {
          r.$pagePlaylistMenu.append(option(`＋ ${snapshot.name}`, () => {
            r.$closePagePlaylistMenu();
            void r.$addTracksToSavedCart(tracks, snapshot.id);
          }));
        }
        if (!savedCarts.length) {
          const empty = document.createElement("div");
          empty.className = "bandcamp-hub-page-playlist-menu-empty";
          empty.textContent = "No saved carts yet";
          r.$pagePlaylistMenu.append(empty);
        }
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
        actions.push(
          option("Add all to playlist…", () => r.$renderPagePlaylistMenu(selection, "playlists")),
          option("Add all to cart…", () => r.$renderPagePlaylistMenu(selection, "carts"))
        );
        if (runtimeState.autoAnalyzeTracks === false) {
          const analyzing = r.$pageTrackAnalysisStatus === "analyzing";
          actions.push(option(analyzing ? "Analyzing tracks…" : "Analyze tracks", () => {
            r.$closePagePlaylistMenu();
            void r.$analyzePageTracks({ manual: true, force: true });
          }, analyzing));
        }
        r.$pagePlaylistMenu.append(...actions);
      } else {
        const inPlaying = tracks.every((track) => runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track)));
        const destinations = [
          option(inPlaying
            ? isBatch ? "✓ All in Now Playing" : "✓ In Now Playing"
            : isBatch ? "＋ Add all to Now Playing" : "＋ Add to Now Playing", () => {
            r.$closePagePlaylistMenu();
            r.$addTracksToPlaylist(tracks);
          }, inPlaying),
          option(isBatch ? "＋ Add all to Playlist…" : "＋ Add to Playlist…", () => r.$renderPagePlaylistMenu(selection, "playlists"))
        ];
        if (!isOwned) {
          destinations.push(option(isBatch ? "＋ Add all to Cart…" : "＋ Add to Cart…", () => r.$renderPagePlaylistMenu(selection, "carts")));
        }
        r.$pagePlaylistMenu.append(...destinations);
      }
      r.$positionPagePlaylistMenu();
    };
}

export const registerPagePlayerUi = [registerPagePlayerUi1, registerPagePlayerUi2, registerPagePlayerUi3, registerPagePlayerUi4, registerPagePlayerUi5];

export const setupPagePlayerUi = [];
