import { runtimeSaveState, runtimeState } from "./context.js";
import { createPlaylistArtwork } from "../components/playlist-artwork.js";
import { createBandkitPlaylistOrigin, createPagePlaylistCard } from "../components/page-cards.js";

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
    : date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

function collectionPlaylistSubtitle(items) {
  return `${items.length} track${items.length === 1 ? "" : "s"}, ${collectionPlaylistDuration(items)}`;
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
r.$createCollectionPlaylistArtwork = items => createPlaylistArtwork(items, "page");
r.$createCollectionPlaylistCard = function createCollectionPlaylistCard(snapshot, nativeTemplate = null) {
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      if (nativeTemplate) {
        const card = nativeTemplate.cloneNode(true);
        card.classList.add(BANDKIT_CARD_CLASS, "is-native-layout");
        card.dataset.bandkitPlaylistId = snapshot.id;
        card.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));

        const imageContainer = card.querySelector(".image-container");
        if (imageContainer) {
          const artwork = r.$createCollectionPlaylistArtwork(items);
          artwork.classList.add("image");
          imageContainer.replaceChildren(artwork);
        }

        const open = card.querySelector(".stretch-link");
        if (open) {
          open.href = "#";
          open.setAttribute("aria-label", `Open BandKit playlist ${snapshot.name}`);
          const date = open.querySelector(".date");
          const title = open.querySelector(".title");
          const subtitle = open.querySelector(".subtitle");
          if (date) date.textContent = collectionPlaylistSavedDate(snapshot.savedAt);
          if (title) title.textContent = snapshot.name || "Saved playlist";
          if (subtitle) subtitle.textContent = collectionPlaylistSubtitle(items);
          open.addEventListener("click", (event) => {
            event.preventDefault();
            r.$openCollectionSavedPlaylist(snapshot.id);
          });
        }

        const contextButton = card.querySelector(".context-menu-trigger");
        if (contextButton) {
          for (const attribute of ["aria-controls", "aria-expanded", "aria-haspopup"]) {
            contextButton.removeAttribute(attribute);
          }
          contextButton.setAttribute("aria-label", "Open BandKit playlist actions");
          contextButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            r.$openCollectionSavedPlaylist(snapshot.id);
          });
        }

        card.querySelector(".footer")?.append(createBandkitPlaylistOrigin());
        return card;
      }

      return createPagePlaylistCard({
        id: snapshot.id,
        ariaLabel: `Open BandKit playlist ${snapshot.name}`,
        artwork: r.$createCollectionPlaylistArtwork(items),
        date: collectionPlaylistSavedDate(snapshot.savedAt),
        title: snapshot.name || "Saved playlist",
        subtitle: collectionPlaylistSubtitle(items),
        onOpen: () => r.$openCollectionSavedPlaylist(snapshot.id)
      });
    };
r.$syncCollectionPlaylistCards = function syncCollectionPlaylistCards() {
      const host = document.querySelector("collection-playlists-tab");
      r.$applyCollectionPlaylistsTheme?.();
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
      const nativeTemplate = grid.querySelector(`:scope > .playlist-card:not(.${BANDKIT_CARD_CLASS})`);
      const cardsUseCurrentLayout = currentCards.every((card) =>
        card.classList.contains("is-native-layout") === Boolean(nativeTemplate)
      );
      if (
        grid.dataset.bandkitPlaylistFingerprint === fingerprint
        && currentCards.length === playlists.length
        && cardsUseCurrentLayout
      ) return true;
      currentCards.forEach((card) => card.remove());
      playlists.forEach((snapshot) => grid.append(r.$createCollectionPlaylistCard(snapshot, nativeTemplate)));
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
