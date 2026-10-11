import { MESSAGES } from "../../shared/contracts.js";
import { createArt, createButtonIcon, createElement } from "../core.js";
import { runtimeSeamless, runtimeState } from "./context.js";

// Artwork that plays the album or track it shows, the same control as a Now
// Playing row: artwork at rest, play on hover or focus. Cart items and
// Activity entries both use it to preview a release before going to it.
export function comparableReleaseUrl(value) {
  try {
    const url = new URL(value);
    if (!/^\/(album|track)\/[^/]+\/?$/.test(url.pathname)) return "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function syncReleasePlayToggle(r, toggle) {
  const url = toggle.dataset.releaseUrl;
  const title = toggle.dataset.releaseTitle || "release";
  const loading = r.$releasePreviewPendingUrl === url;
  const active = !loading && r.$releasePreviewIsActive(url);
  const playing = active && Boolean(runtimeSeamless.isPlaying);
  const label = loading ? `Loading ${title}` : playing ? `Pause ${title}` : active ? `Resume ${title}` : `Play ${title}`;
  toggle.title = label;
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("aria-busy", String(loading));
  toggle.closest(".hub-compact-media-card")?.classList.toggle("is-actively-playing", playing);
  toggle.querySelector(".hub-playlist-media-icon")?.replaceChildren(createButtonIcon(playing ? "icon-pause.svg" : "icon-play.svg"));
}

export function registerReleasePreview(r) {
  r.$releasePreviewIsActive = function releasePreviewIsActive(url) {
    const track = runtimeSeamless.track;
    return Boolean(url && track && [track.releaseUrl, track.pageUrl].some((value) => comparableReleaseUrl(value) === url));
  };
  r.$playReleasePreview = async function playReleasePreview(url, title = "this release") {
    if (!url || runtimeState.appearance?.hideBandcampPlayer === false) return;
    if (r.$releasePreviewIsActive(url) && !r.$releasePreviewPendingUrl) {
      await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
      return;
    }
    const request = r.$releasePreviewPendingUrl = url;
    r.$syncReleasePreviewUi();
    try {
      const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl: url });
      if (!response?.ok) throw new Error(response?.error || `Could not load “${title}”.`);
      const tracks = response.release.tracks.filter((track) => r.$isReusableStreamUrl(track.url));
      if (!tracks.length) throw new Error(`“${title}” has no tracks to preview.`);
      if (request !== r.$releasePreviewPendingUrl) return;
      // An album plays from its first previewable track, with the rest queued.
      await r.$playDiscoverReleaseTrack(tracks[0], tracks);
    } catch (error) {
      if (request === r.$releasePreviewPendingUrl) r.$showToast(error.message || `Could not play “${title}”.`);
    } finally {
      if (request === r.$releasePreviewPendingUrl) r.$releasePreviewPendingUrl = null;
      r.$syncReleasePreviewUi();
    }
  };
  r.$createReleasePlayToggle = function createReleasePlayToggle({ url, title, art, className = "" }) {
    if (runtimeState.appearance?.hideBandcampPlayer === false) {
      const link = r.$createPageLink("", url, `hub-art-link${className ? ` ${className}` : ""}`);
      link.setAttribute("aria-label", `Open ${title || "release"}`);
      link.append(createArt(art));
      return link;
    }
    const toggle = createElement("button", `hub-playlist-media-toggle hub-release-media-toggle${className ? ` ${className}` : ""}`);
    toggle.type = "button";
    toggle.dataset.releaseUrl = url;
    toggle.dataset.releaseTitle = title || "";
    const artwork = createElement("span", "hub-playlist-media-art");
    artwork.append(createArt(art));
    toggle.append(artwork, createElement("span", "hub-playlist-media-icon"));
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      void r.$playReleasePreview(url, title);
    });
    syncReleasePlayToggle(r, toggle);
    return toggle;
  };
  r.$syncReleasePreviewUi = function syncReleasePreviewUi() {
    for (const toggle of r.$content.querySelectorAll(".hub-release-media-toggle[data-release-url]")) syncReleasePlayToggle(r, toggle);
  };
}
