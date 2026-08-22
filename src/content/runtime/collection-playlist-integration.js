import { runtimeSaveState, runtimeState } from "./context.js";
import { asset, createElement, resolveImage } from "../core.js";

const COLLECTION_PLAYLIST_SECTION = "section.vue-collection-playlists-tab";
const BANDKIT_CARD_CLASS = "bandkit-collection-playlist-card";
const COLLECTION_PLAYLIST_STYLE = "bandkit-collection-playlists-style";

function collectionPlaylistDuration(items) {
  const seconds = Math.max(0, Math.round((items || []).reduce((total, item) => total + (Number(item?.duration) || 0), 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes || !hours) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
}

function collectionPlaylistSavedDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Saved locally"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function registerCollectionPlaylistIntegration1(r) {
r.$openCollectionSavedPlaylist = function openCollectionSavedPlaylist(playlistId) {
      const playlist = runtimeState.savedPlaylists.find((entry) => entry.id === playlistId);
      if (!playlist) return;
      runtimeState.open = true;
      runtimeState.activeTab = "playlist";
      runtimeState.playlistView = "saved";
      runtimeState.selectedSavedPlaylistId = playlist.id;
      runtimeSaveState();
      r.$saveLayoutState();
      r.$render();
    };
r.$createCollectionPlaylistArtwork = function createCollectionPlaylistArtwork(items) {
      const mosaic = createElement("span", "bandkit-collection-playlist-art");
      const artwork = [];
      const seen = new Set();
      for (const item of items || []) {
        const imageUrl = resolveImage(item?.art);
        if (!imageUrl || seen.has(imageUrl)) continue;
        seen.add(imageUrl);
        artwork.push(imageUrl);
        if (artwork.length === 4) break;
      }
      mosaic.dataset.count = String(artwork.length);
      if (!artwork.length) {
        const placeholder = document.createElement("img");
        placeholder.className = "bandkit-collection-playlist-placeholder";
        placeholder.src = asset("icon-playlist.svg");
        placeholder.alt = "";
        mosaic.append(placeholder);
        return mosaic;
      }
      for (const imageUrl of artwork) {
        const image = document.createElement("img");
        image.className = "bandkit-collection-playlist-artwork";
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        mosaic.append(image);
      }
      return mosaic;
    };
r.$createCollectionPlaylistCard = function createCollectionPlaylistCard(snapshot) {
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const card = createElement("li", `${BANDKIT_CARD_CLASS} card-item playlist-card`);
      card.dataset.bandkitPlaylistId = snapshot.id;

      const surface = createElement("article", "bandkit-collection-playlist-surface");
      const open = createElement("button", "bandkit-collection-playlist-open");
      open.type = "button";
      open.setAttribute("aria-label", `Open BandKit playlist ${snapshot.name}`);
      open.append(r.$createCollectionPlaylistArtwork(items));

      const copy = createElement("span", "bandkit-collection-playlist-copy");
      copy.append(
        createElement("span", "bandkit-collection-playlist-date", collectionPlaylistSavedDate(snapshot.savedAt)),
        createElement("strong", "bandkit-collection-playlist-title", snapshot.name || "Saved playlist"),
        createElement(
          "span",
          "bandkit-collection-playlist-subtitle",
          `${items.length} track${items.length === 1 ? "" : "s"}, ${collectionPlaylistDuration(items)}`
        )
      );
      open.append(copy);
      open.addEventListener("click", () => r.$openCollectionSavedPlaylist(snapshot.id));

      const footer = createElement("footer", "bandkit-collection-playlist-footer");
      const privateBadge = createElement("span", "bandkit-collection-private-badge");
      privateBadge.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8V5.8C6 3.7 7.8 2 10 2s4 1.7 4 3.8V8h1.5c.6 0 1 .4 1 1v8c0 .6-.4 1-1 1h-11c-.6 0-1-.4-1-1V9c0-.6.4-1 1-1H6Zm1-2.2V8h6V5.8C13 4.3 11.7 3 10 3S7 4.3 7 5.8Z"/></svg><span>Private</span>';
      const origin = createElement("span", "bandkit-collection-origin");
      origin.title = "BandKit playlist";
      origin.setAttribute("aria-label", "BandKit playlist");
      const originIcon = document.createElement("img");
      originIcon.src = asset("icon-bandkit.svg");
      originIcon.alt = "";
      origin.append(originIcon);
      footer.append(privateBadge, origin);
      surface.append(open, footer);
      card.append(surface);
      return card;
    };
r.$syncCollectionPlaylistCards = function syncCollectionPlaylistCards() {
      const host = document.querySelector("collection-playlists-tab");
      const root = host?.shadowRoot || document;
      if (root !== document && r.$collectionPlaylistObservedRoot !== root) {
        r.$collectionPlaylistShadowObserver?.disconnect();
        r.$collectionPlaylistObservedRoot = root;
        r.$collectionPlaylistShadowObserver = new MutationObserver(r.$scheduleCollectionPlaylistSync);
        r.$collectionPlaylistShadowObserver.observe(root, { childList: true, subtree: true });
      }
      if (root !== document && !root.querySelector(`link[data-bandkit-style="${COLLECTION_PLAYLIST_STYLE}"]`)) {
        const stylesheet = document.createElement("link");
        const stylesheetUrl = new URL(chrome.runtime.getURL("collection-playlists.css"));
        stylesheetUrl.searchParams.set("v", chrome.runtime.getManifest().version);
        stylesheet.rel = "stylesheet";
        stylesheet.href = stylesheetUrl.href;
        stylesheet.dataset.bandkitStyle = COLLECTION_PLAYLIST_STYLE;
        root.prepend(stylesheet);
      }
      const section = root.querySelector(COLLECTION_PLAYLIST_SECTION);
      const grid = section?.querySelector(":scope .results > ul.card-grid");
      if (!grid) return false;
      const playlists = Array.isArray(runtimeState.savedPlaylists) ? runtimeState.savedPlaylists : [];
      const fingerprint = JSON.stringify(playlists.map((snapshot) => [
        snapshot.id,
        snapshot.name,
        snapshot.savedAt,
        (snapshot.items || []).map((item) => [item.art, item.duration])
      ]));
      const currentCards = [...grid.querySelectorAll(`:scope > .${BANDKIT_CARD_CLASS}`)];
      if (grid.dataset.bandkitPlaylistFingerprint === fingerprint && currentCards.length === playlists.length) return true;
      currentCards.forEach((card) => card.remove());
      playlists.forEach((snapshot) => grid.append(r.$createCollectionPlaylistCard(snapshot)));
      grid.dataset.bandkitPlaylistFingerprint = fingerprint;
      section.classList.toggle("has-bandkit-playlists", playlists.length > 0);
      return true;
    };
r.$scheduleCollectionPlaylistSync = function scheduleCollectionPlaylistSync() {
      if (r.$collectionPlaylistFrame) return;
      r.$collectionPlaylistFrame = requestAnimationFrame(() => {
        r.$collectionPlaylistFrame = 0;
        r.$syncCollectionPlaylistCards();
      });
    };
}

function setupCollectionPlaylistIntegration1(r) {
  r.$collectionPlaylistFrame = 0;
  r.$collectionPlaylistObservedRoot = null;
  r.$collectionPlaylistShadowObserver = null;
  r.$collectionPlaylistObserver = new MutationObserver(r.$scheduleCollectionPlaylistSync);
  r.$collectionPlaylistObserver.observe(document.body, { childList: true, subtree: true });
  r.$scheduleCollectionPlaylistSync();
  for (const delay of [250, 1000, 2500]) window.setTimeout(r.$scheduleCollectionPlaylistSync, delay);
  r.$app.registerCleanup(() => {
    r.$collectionPlaylistObserver?.disconnect();
    r.$collectionPlaylistShadowObserver?.disconnect();
    window.cancelAnimationFrame(r.$collectionPlaylistFrame);
    (r.$collectionPlaylistObservedRoot || document).querySelectorAll(`.${BANDKIT_CARD_CLASS}`).forEach((card) => card.remove());
    r.$collectionPlaylistObservedRoot?.querySelector(`link[data-bandkit-style="${COLLECTION_PLAYLIST_STYLE}"]`)?.remove();
  });
}

export const registerCollectionPlaylistIntegration = [registerCollectionPlaylistIntegration1];
export const setupCollectionPlaylistIntegration = [setupCollectionPlaylistIntegration1];
