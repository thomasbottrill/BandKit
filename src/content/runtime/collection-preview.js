import { createButtonIcon, createElement, safeBandcampReleaseUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { runtimeSeamless, runtimeState } from "./context.js";

const COLLECTION_CARD_SELECTOR = [
  '#collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .collection-item-container',
  '#wishlist-items .collection-grid[data-iswish="true"] .collection-item-container'
].join(", ");
const COLLECTION_ART_SELECTOR = COLLECTION_CARD_SELECTOR.split(", ")
  .map((selector) => `${selector} .collection-item-art-container`).join(", ");
function releaseUrlFromCard(r, card) {
  return safeBandcampReleaseUrl(r.$collectionTrackFromCard(card)?.pageUrl);
}

function selectingDownloads() {
  return document.documentElement.dataset.bandkitCollectionSelecting === "true";
}

function collectionSection(card) {
  return card.closest("#collection-items, #wishlist-items");
}

function syncPreviewTop(panel) {
  if (!panel) return;
  const menuRect = document.querySelector(".menu-bar-wrapper")?.getBoundingClientRect();
  const menuBottom = menuRect && menuRect.top < window.innerHeight && menuRect.bottom > 0
    ? Math.ceil(menuRect.bottom)
    : 0;
  const tabsRect = document.querySelector("#grid-tabs-sticky")?.getBoundingClientRect();
  const tabsBottom = tabsRect && tabsRect.bottom > menuBottom && tabsRect.top <= menuBottom + 1
    ? Math.ceil(tabsRect.bottom)
    : 0;
  const stickyTop = Math.max(66, menuBottom ? menuBottom + 12 : 0, tabsBottom ? tabsBottom + 12 : 0);
  panel.style.setProperty("--bandkit-collection-preview-top", `${stickyTop}px`);
  const visibleTop = Math.max(stickyTop, Math.ceil(panel.getBoundingClientRect().top));
  panel.style.setProperty("--bandkit-collection-preview-visible-top", `${visibleTop}px`);
}

function createPreviewLayoutSync(getPanel) {
  let frame = 0;
  return () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncPreviewTop(getPanel());
    });
  };
}

function routePreviewWheel(panel, event) {
  if (event.deltaY <= 0) return;
  const stickyTop = Number.parseFloat(panel.style.getPropertyValue("--bandkit-collection-preview-top")) || 66;
  if (panel.getBoundingClientRect().top <= stickyTop + 1) return;
  event.preventDefault();
  window.scrollBy({ top: event.deltaY, behavior: "auto" });
}

function createPreviewShell(close) {
  const panel = createElement("aside", "bandkit-collection-preview focused-result");
  panel.tabIndex = 0;
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Selected release");
  const closeButton = createElement("button", "bandkit-collection-preview-close");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close release preview");
  closeButton.title = "Close release preview";
  closeButton.append(createButtonIcon("icon-close.svg"));
  closeButton.addEventListener("click", close);
  panel.addEventListener("wheel", (event) => routePreviewWheel(panel, event), { passive: false });
  const content = createElement("div", "bandkit-collection-preview-content tralbum-purchase-options-browser");
  panel.append(closeButton, content);
  return { panel, content };
}

function createPreviewDownload(card, release, track) {
  const source = card.querySelector(".bandkit-collection-download-action[href]");
  if (!source) return null;
  const download = createElement("a", "bandkit-collection-preview-download");
  download.href = source.href;
  download.setAttribute("aria-label", `Download ${release.album || track?.album || track?.title || "release"}`);
  download.title = download.getAttribute("aria-label");
  download.append(createButtonIcon("icon-downloads.svg"));
  return download;
}

async function playCollectionCard(r, card, selectedCard, preview, open) {
  const currentTrack = selectedCard === card
    ? r.$matchingPagePlaybackTrack?.(r.$discoverReleaseTracks, runtimeSeamless.track)
    : null;
  if (runtimeSeamless.enabled && currentTrack) {
    await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
    return;
  }
  // Opening resolves the complete release before playback. The selectedCard
  // argument describes the state before that await, so do not use it again or
  // the first play click will always stop here and require a second click.
  if (selectedCard !== card || !preview?.panel.isConnected) {
    const opened = await open(card);
    if (!opened) return;
  }
  const tracks = r.$discoverReleaseTracks || [];
  if (tracks.length) await r.$playDiscoverReleaseTrack(tracks[0], tracks);
}

function enhanceCollectionCards(r) {
  for (const card of document.querySelectorAll(COLLECTION_CARD_SELECTOR)) {
    if (card.dataset.bandkitPreviewBound === "true") continue;
    const art = card.querySelector(".collection-item-art-container");
    if (!art || !releaseUrlFromCard(r, card)) continue;
    card.dataset.bandkitPreviewBound = "true";
    const rememberWidth = () => card.style.setProperty("--bandkit-collection-card-width", `${card.getBoundingClientRect().width}px`);
    card.addEventListener("pointerdown", rememberWidth, { passive: true });
    card.addEventListener("dragstart", rememberWidth, { passive: true });
    let previewControl = art.querySelector(".bandkit-collection-preview-target");
    if (!previewControl) {
      previewControl = createElement("button", "bandkit-collection-preview-target over-image");
      previewControl.type = "button";
      art.append(previewControl);
    }
    previewControl.setAttribute("aria-label", `Preview ${card.dataset.title || "release"} tracks`);
    const nativePlay = art.querySelector(".item_link_play");
    if (!nativePlay) continue;
    nativePlay.setAttribute("role", "button"); nativePlay.setAttribute("aria-label", `Play ${card.dataset.title || "release"}`);
    nativePlay.title = "Play";
  }
}

export function setupCollectionPreview(r) {
  if (location.hostname !== "bandcamp.com") return;
  const grids = document.querySelector("#grids"); if (!grids) return;

  const cache = new Map(); let selectedCard = null, preview = null;
  let request = 0; const syncLayout = createPreviewLayoutSync(() => preview?.panel);
  const close = () => {
    request += 1; selectedCard?.removeAttribute("data-bandkit-preview-selected");
    selectedCard = null; preview?.panel.remove(); preview = null;
    for (const section of document.querySelectorAll("#collection-items, #wishlist-items")) section.classList.remove("bandkit-collection-preview-open");
    r.$discoverReleaseTracks = [];
    r.$discoverRelease = null;
    r.$pageTrackAnalysisRequest += 1;
    r.$pageTrackAnalysisStatus = "idle";
    r.$pageTrackAnalysisSignature = "";
  };
  const renderRelease = (release, card) => {
    if (!preview) return;
    const track = release.tracks[0] || r.$collectionTrackFromCard(card);
    const art = release.tracks[0]?.art || card.querySelector(".collection-item-art")?.src || "";
    const artist = release.tracks[0]?.artist || track?.artist || "Bandcamp";
    const artWrap = createElement("div", "bandkit-collection-preview-art images");
    const image = document.createElement("img");
    image.className = "cover";
    image.src = art;
    image.alt = release.album ? `${release.album} cover art` : "Release cover art";
    artWrap.append(image);

    const heading = createElement("h2", "bandkit-collection-preview-heading bandkit-discover-album-title");
    const title = createElement("a", "bandkit-collection-preview-title", release.album || track?.album || track?.title || "Bandcamp release");
    title.href = release.pageUrl;
    title.target = "_blank";
    heading.append(title);

    const bandMeta = createElement("div", "bandkit-collection-preview-band-meta band-meta");
    const profile = createElement("div", "profile");
    const meta = createElement("div", "meta");
    const artistLink = createElement("a", "bandkit-collection-preview-artist", artist);
    artistLink.href = track?.artistUrl || new URL(release.pageUrl).origin;
    artistLink.target = "_blank";
    meta.append(artistLink);
    profile.append(meta);
    bandMeta.append(profile);

    const actions = createElement("div", "bandkit-collection-preview-actions release-buttons");
    const buy = createElement("a", "buy-button", "Go to album");
    buy.href = release.pageUrl;
    buy.target = "_blank";
    const add = r.$createPagePlaylistButton();
    r.$applyDiscoverReleaseAddButton(add, track);
    const download = createPreviewDownload(card, release, track);
    const wishlist = createElement("button", "wishlist-button");
    wishlist.type = "button";
    let wishlisted = Boolean(card.closest("#wishlist-items"))
      || (runtimeState.wishlistTrackKeys || []).includes(r.$wishlistTrackKey(track));
    const syncWishlist = () => {
      wishlist.replaceChildren(createButtonIcon(wishlisted ? "icon-wishlist-filled.svg" : "icon-wishlist.svg"));
      wishlist.setAttribute("aria-pressed", String(wishlisted));
      wishlist.setAttribute("aria-label", wishlisted ? `Remove ${release.album} from your wishlist` : `Add ${release.album} to your wishlist`);
      wishlist.title = wishlist.getAttribute("aria-label");
    };
    syncWishlist();
    wishlist.addEventListener("click", async () => {
      const active = !wishlisted;
      const target = new URL(release.pageUrl);
      target.hash = "bandkit-wishlist";
      const key = r.$wishlistTrackKey(track);
      target.searchParams.set("bandkit_wishlist_key", key);
      target.searchParams.set("bandkit_wishlist_active", active ? "1" : "0");
      const response = await r.$runtimeMessage({ type: MESSAGES.OPEN_BACKGROUND_TAB, url: target.href });
      if (!response?.ok) {
        r.$showToast(response?.error || "Bandcamp could not open the wishlist action.");
        return;
      }
      wishlisted = active;
      r.$markWishlistTrack(track, active);
      syncWishlist();
      r.$showToast(active ? `Adding “${release.album}” to your Bandcamp wishlist.` : `Removing “${release.album}” from your Bandcamp wishlist.`);
    });
    actions.append(buy, add, wishlist, ...(download ? [download] : []));

    const seconds = release.tracks.reduce((total, item) => total + (Number(item.duration) || 0), 0);
    const summary = createElement("div", "bandkit-collection-preview-summary release-summary");
    const summaryText = createElement("p", "length", `${Math.max(1, Math.round(seconds / 60))} minutes`);
    summary.append(summaryText);

    const tracklist = createElement("section", "bandkit-discover-tracklist");
    tracklist.setAttribute("aria-label", `${release.album || "Release"} tracks`); tracklist.tabIndex = 0;
    tracklist.append(r.$createDiscoverTrackList(release));
    if (!release.tracks.length) tracklist.append(createElement("p", "bandkit-discover-tracklist-status", "No tracks available."));
    preview.content.replaceChildren(artWrap, actions, summary, bandMeta, heading, tracklist);
    preview.panel.scrollTop = 0;
    r.$ensurePageStyles(); r.$schedulePlaylistButtons?.();
    r.$maybeAnalyzePageTracks(); r.$syncPagePlayerUi();
  };
  const open = async (card, focusPanel = false) => {
    const section = collectionSection(card);
    const url = releaseUrlFromCard(r, card);
    if (!section || !url) return false;
    const version = request += 1;
    selectedCard?.removeAttribute("data-bandkit-preview-selected");
    selectedCard = card;
    card.setAttribute("data-bandkit-preview-selected", "true");
    if (preview?.panel.parentElement !== section) {
      preview?.panel.remove();
      preview = createPreviewShell(close);
      section.append(preview.panel);
    }
    for (const candidate of document.querySelectorAll("#collection-items, #wishlist-items")) {
      candidate.classList.toggle("bandkit-collection-preview-open", candidate === section);
    }
    syncLayout();
    preview.panel.setAttribute("aria-busy", "true"); preview.panel.scrollTop = 0;
    preview.content.replaceChildren(createElement("p", "bandkit-discover-tracklist-status", "Loading tracks…"));
    if (focusPanel) preview.panel.focus({ preventScroll: true });
    try {
      let release = cache.get(url);
      if (!release || release.expires <= Date.now()) {
        const response = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl: url });
        if (!response?.ok) throw new Error(response?.error || "Could not load tracks.");
        release = { ...response.release, expires: Date.now() + 5 * 60_000 };
        cache.set(url, release);
        if (cache.size > 24) cache.delete(cache.keys().next().value);
      }
      if (version !== request || !preview?.panel.isConnected) return false;
      r.$discoverReleaseTracks = release.tracks.filter((item) => r.$isReusableStreamUrl(item.url));
      r.$discoverRelease = release;
      renderRelease(release, card);
      preview.panel.setAttribute("aria-busy", "false");
      return true;
    } catch {
      if (version !== request || !preview?.panel.isConnected) return false;
      const status = createElement("p", "bandkit-discover-tracklist-status", "Could not load tracks. ");
      const retry = createElement("button", "", "Retry");
      retry.type = "button";
      retry.addEventListener("click", () => void open(card));
      status.append(retry);
      preview.content.replaceChildren(status);
      preview.panel.setAttribute("aria-busy", "false");
      return false;
    }
  };
  const toggle = (card, focusPanel = false) => selectedCard === card && preview?.panel.isConnected
    ? close()
    : void open(card, focusPanel);

  const enhanceCards = () => enhanceCollectionCards(r);

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest(".bandkit-collection-preview .bandkit-discover-tracks .track_row_view");
    if (row && !event.target.closest(".bandkit-discover-track-actions, .bandkit-track-analysis")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const track = r.$discoverReleaseTracks.find((item) => item.id === row.dataset.bandkitDiscoverTrackId);
      if (track) void r.$playDiscoverReleaseTrack(track);
      return;
    }
    const art = event.target.closest(COLLECTION_ART_SELECTOR);
    // Selecting releases for download owns artwork clicks until it ends.
    if (!art || (selectingDownloads() && !event.target.closest(".item_link_play"))) return;
    if (event.target.closest(".item_link_play")) {
      const card = art.closest(".collection-item-container");
      if (!card) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void playCollectionCard(r, card, selectedCard, preview, open);
      return;
    }
    if (event.target.closest(".bandkit-collection-overlay-action")) return;
    if (!event.target.closest(".bandkit-collection-preview-target") && event.target.closest("button, a")) return;
    const card = art.closest(".collection-item-container");
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle(card);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof Element)) return;
    const trackControl = event.target.closest(".bandkit-collection-preview .bandkit-discover-tracks .play-col a");
    if (trackControl) {
      event.preventDefault();
      event.stopImmediatePropagation();
      trackControl.click();
      return;
    }
    const control = event.target.closest(".bandkit-collection-preview-target");
    if (!control || selectingDownloads()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = control.closest(".collection-item-container");
    if (card) toggle(card, true);
  }, true);

  grids.addEventListener("click", (event) => {
    if (event.target.closest("#grid-tabs")) window.setTimeout(() => { close(); enhanceCards(); }, 0);
  }, true);
  window.addEventListener("scroll", syncLayout, { passive: true }); window.addEventListener("resize", syncLayout, { passive: true });
  new MutationObserver(() => { enhanceCards(); syncLayout(); }).observe(grids, { childList: true, subtree: true });
  enhanceCards();
}
