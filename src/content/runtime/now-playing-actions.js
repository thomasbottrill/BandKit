import { runtimeSaveState, runtimeState } from "./context.js";
import { createButtonIcon, createElement, resolvedTrackPageUrl } from "../core.js";

function registerNowPlayingActions1(r) {
r.$populatePlaylistDestinationMenu = function populatePlaylistDestinationMenu(menu, trigger, track, view = "destinations", context = {}) {
      const menuContext = context.onRemove ? context : (menu._bandkitDestinationContext || context);
      menu._bandkitDestinationContext = menuContext;
      const close = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      };
      const showView = (nextView) => {
        r.$populatePlaylistDestinationMenu(menu, trigger, track, nextView);
        r.$positionPlaylistDestinationMenu(menu);
        menu.querySelector(".hub-playlist-menu-option")?.focus();
      };
      menu.replaceChildren();
      if (["playlists", "playlists-only", "now-playing-playlists"].includes(view)) {
        if (view !== "playlists-only") {
          const backView = view === "now-playing-playlists" ? "now-playing" : "destinations";
          menu.append(r.$createPlaylistMenuOption("← Add destination", () => showView(backView), { back: true }));
        }
        menu.append(r.$createPlaylistMenuOption("＋ New playlist", () => {
          close();
          r.$createSavedPlaylistWithTracks([track], `${track.artist || "Bandcamp"} playlist`);
        }));
        for (const snapshot of runtimeState.savedPlaylists) {
          const alreadyAdded = snapshot.items.some((item) => r.$playlistTracksMatch(item, track));
          menu.append(r.$createPlaylistMenuOption(`${alreadyAdded ? "✓" : "＋"} ${snapshot.name}`, () => {
            close();
            r.$addTrackToSavedPlaylist(track, snapshot.id);
          }, { disabled: alreadyAdded }));
        }
        if (!runtimeState.savedPlaylists.length) menu.append(createElement("div", "hub-playlist-menu-empty", "No playlists yet"));
        return;
      }
      if (view === "carts" || view === "now-playing-carts") {
        const savedCarts = runtimeState.savedCarts.filter((snapshot) => !r.$cartAutosave.isAutoSavedCart(snapshot));
        const backView = view === "now-playing-carts" ? "now-playing" : "destinations";
        menu.append(
          r.$createPlaylistMenuOption("← Add destination", () => showView(backView), { back: true }),
          r.$createPlaylistMenuOption("＋ Current Bandcamp cart", () => {
            close();
            void r.$addTracksToCurrentCart([track]);
          })
        );
        for (const snapshot of savedCarts) {
          menu.append(r.$createPlaylistMenuOption(`＋ ${snapshot.name}`, () => {
            close();
            void r.$addTracksToSavedCart([track], snapshot.id);
          }));
        }
        if (!savedCarts.length) menu.append(createElement("div", "hub-playlist-menu-empty", "No saved carts yet"));
        return;
      }
      if (view === "now-playing") {
        const wishlisted = (runtimeState.wishlistTrackKeys || []).includes(r.$wishlistTrackKey(track));
        menu.append(
          r.$createPlaylistMenuOption("＋ Add to playlist…", () => showView("now-playing-playlists")),
          r.$createPlaylistMenuOption("＋ Add to cart…", () => showView("now-playing-carts"), {
            disabled: !resolvedTrackPageUrl(track)
          }),
          r.$createPlaylistMenuOption(wishlisted ? "✓ Wishlisted" : "♡ Add to wishlist", () => {
            close();
            void r.$openTrackAction(track, "wishlist");
          }, { disabled: wishlisted }),
          r.$createPlaylistMenuOption("Remove from Now Playing", () => {
            close();
            menuContext.onRemove?.();
          })
        );
        return;
      }
      const inPlaying = runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track));
      menu.append(
        r.$createPlaylistMenuOption(inPlaying ? "✓ In Now Playing" : "＋ Add to Now Playing", () => {
          close();
          r.$addTrackToPlaylist(track);
        }, { disabled: inPlaying }),
        r.$createPlaylistMenuOption("＋ Add to Playlist…", () => showView("playlists")),
        r.$createPlaylistMenuOption("＋ Add to Cart…", () => showView("carts"))
      );
    };
r.$createNowPlayingTrackActions = function createNowPlayingTrackActions(card, item) {
      const removeFromNowPlaying = () => {
        const currentIndex = runtimeState.playlist.findIndex((track) => track.playlistItemId === item.playlistItemId);
        if (currentIndex < 0) return;
        r.$suppressRemovedFeedTrack(item);
        if (r.$pendingPlaylistItemId === item.playlistItemId) {
          r.$playlistPlayRequest += 1;
          r.$playlistPlaybackStartingRequest = 0;
          r.$playlistPlaybackStarting = false;
          r.$pendingPlaylistItemId = "";
        }
        runtimeState.playlist.splice(currentIndex, 1);
        if (!runtimeState.playlist.length) {
          void r.$clearNowPlayingPlayback();
          return;
        }
        runtimeSaveState();
        void r.$syncActivePlaylistQueue();
        r.$render();
        r.$injectPlaylistButtons();
      };
      const actions = createElement("div", "hub-playlist-track-actions");
      const wrapper = createElement("div", "hub-playlist-destination hub-playlist-track-overflow");
      const trigger = createElement("button", "hub-playlist-icon-button hub-playlist-track-more");
      trigger.type = "button";
      trigger.title = `More actions for ${item.title}`;
      trigger.setAttribute("aria-label", trigger.title);
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.append(createButtonIcon("icon-more.svg"));
      const menu = createElement("div", "hub-playlist-destination-menu hub-playlist-track-menu");
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `Actions for ${item.title}`);
      const closeMenu = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      };
      const openMenu = () => {
        r.$closeSiblingDestinationMenus(wrapper, menu);
        r.$populatePlaylistDestinationMenu(menu, trigger, item, "now-playing", { onRemove: removeFromNowPlaying });
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        window.setTimeout(() => menu.querySelector(".hub-playlist-menu-option:not(:disabled)")?.focus(), 0);
      };
      trigger.addEventListener("click", () => {
        if (menu.hidden) openMenu();
        else closeMenu();
      });
      card.addEventListener("contextmenu", (event) => {
        if (event.target instanceof Element && event.target.closest(".hub-playlist-track-menu")) return;
        event.preventDefault();
        openMenu();
      });
      wrapper.addEventListener("focusout", () => window.setTimeout(() => {
        if (!wrapper.contains(r.$shadow.activeElement)) closeMenu();
      }, 50));
      wrapper.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeMenu();
        trigger.focus();
      });
      wrapper.append(trigger, menu);
      actions.append(wrapper);
      return actions;
    };
}

export const registerNowPlayingActions = [registerNowPlayingActions1];

export const setupNowPlayingActions = [];
