import { runtimeLive, runtimeState } from "./context.js";
import { asset, createElement, resolvedTrackPageUrl } from "../core.js";
import { openFullscreenVisualizer } from "./fullscreen-visualizer.js";
import { createPictureInPictureMenuAction } from "./picture-in-picture.js";

function deferNowPlayingShuffleRefresh(r) {
  if (runtimeState.activeTab !== "playlist" || runtimeState.playlistView !== "current" || !r.$nowPlayingShuffleInteractionActive) return false;
  r.$nowPlayingShuffleRefreshPending = true;
  return true;
}

// Kept atomic because rendering and scroll restoration share one DOM transaction.
// eslint-disable-next-line max-lines-per-function
export function registerLayoutCartRendering(r) {
r.$renderPlayerMoreActions = function renderPlayerMoreActions() {
      const track = r.$currentLiveTrack();
      const inPlaylist = runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track));
      const hideCart = r.$trackIsOwnedOnCollectionPage(track);
      const signature = runtimeLive.hasPlaybackStarted ? `${track.title}|${track.pageUrl}|${inPlaylist}|${hideCart}` : "";
      r.$playerMoreButton.disabled = !signature || !resolvedTrackPageUrl(track);
      const existingVisualizer = r.$playerMoreMenu.querySelector(".hub-visualizer-menu-action");
      if (existingVisualizer) existingVisualizer.disabled = !runtimeLive.isPlaying;
      if (signature === r.$playerActionSignature) return;
      r.$playerActionSignature = signature;
      if (r.$closePlayerMoreMenu) r.$closePlayerMoreMenu();
      else {
        r.$playerMoreMenu.hidden = true;
        r.$playerMoreButton.setAttribute("aria-expanded", "false");
      }
      r.$playerMoreMenu.replaceChildren();
      if (signature) r.$playerMoreMenu.append(r.$createTrackActionControls(track, { labeled: true, playlistsOnly: true, hideCart }));
      if (signature) {
        const visualize = document.createElement("button");
        visualize.type = "button";
        visualize.disabled = !runtimeLive.isPlaying;
        visualize.className = "hub-visualizer-menu-action";
        visualize.title = "Fullscreen visualizer";
        visualize.innerHTML = `<span class="hub-button-icon" style="--hub-icon:url('${asset("icon-image.svg")}')" aria-hidden="true"></span><span>Visualizer</span>`;
        visualize.addEventListener("click", () => openFullscreenVisualizer(r));
        r.$playerMoreMenu.append(visualize);
        createPictureInPictureMenuAction(r);
      }
    };
// The panel is rebuilt from whole state, so several playback messages in one
// burst produce identical output. Collapse them onto a single frame.
r.$schedulePanelRender = function schedulePanelRender() {
      if (r.$panelRenderFrame) return;
      r.$panelRenderFrame = window.requestAnimationFrame(() => r.$render());
    };
r.$render = function render() {
      if (r.$panelRenderFrame) {
        window.cancelAnimationFrame(r.$panelRenderFrame);
        r.$panelRenderFrame = 0;
      }
      r.$restoreVisualThemePreview?.();
      const panelHidden = !runtimeState.open;
      if (!panelHidden) r.$cancelCompactPanelFocusRelease?.();
      if (panelHidden && r.$panel.contains(r.$shadow.activeElement)) {
        const activeSectionControl = r.$player.dataset.panelButtons === "compact"
          ? r.$compactPanelButton
          : runtimeState.activeTab === "playlist"
          ? r.$nowPlayingButton
          : r.$headerShortcuts.querySelector(`[data-tab="${runtimeState.activeTab}"]`);
        r.$restorePanelFocus?.([activeSectionControl, r.$launcher, r.$nowPlayingButton]);
      }
      r.$panel.classList.toggle("is-hidden", panelHidden);
      r.$panel.setAttribute("aria-hidden", String(panelHidden));
      r.$panel.toggleAttribute("inert", panelHidden);
      r.$launcher.classList.toggle("is-active", runtimeState.open);
      r.$launcher.setAttribute("aria-expanded", String(runtimeState.open));
      r.$syncDockedControls();
      const labels = {
        playlist: "Now Playing & Playlists",
        cart: "Cart",
        activity: "Activity",
        settings: "Settings"
      };
      const availablePanelHeight = Math.max(220, window.innerHeight - 160);
      const sectionPanelHeight = Math.max(220, Math.min(availablePanelHeight, Number(runtimeState.sectionPanelHeight) || Math.round(window.innerHeight * 0.72)));
      r.$panel.style.setProperty("--hub-section-panel-height", `${sectionPanelHeight}px`);
      r.$panelTitle.textContent = labels[runtimeState.activeTab] || "Bandkit";
      r.$panel.setAttribute("aria-label", `${r.$panelTitle.textContent} panel`);
      r.$panelHeader.setAttribute("aria-label", `${r.$panelTitle.textContent} panel header`);
      const queuedTrackCount = runtimeState.playlist.length || (runtimeLive.hasPlaybackStarted ? 1 + (Array.isArray(runtimeLive.tracks) ? runtimeLive.tracks.length : 0) : 0);
      const panelDestinationState = (tabId) => {
        if (tabId === "playlist") {
          const saved = runtimeState.playlistView === "saved";
          const count = saved ? 0 : queuedTrackCount;
          return {
            count,
            icon: saved ? "icon-playlist.svg" : "icon-now-playing.svg",
            label: saved ? "Playlists" : `Now Playing, ${count} song${count === 1 ? "" : "s"}`
          };
        }
        if (tabId === "cart") {
          const saved = runtimeState.cartView === "saved";
          const count = saved ? 0 : runtimeState.cart.length;
          return {
            count,
            icon: saved ? "icon-saved-cart.svg" : "icon-cart.svg",
            label: saved ? "Saved carts" : `Cart, ${count} item${count === 1 ? "" : "s"}`
          };
        }
        const tab = r.$tabs.find((item) => item.id === tabId);
        return { count: 0, icon: tab?.icon || "icon-now-playing.svg", label: tab?.label || "Bandkit" };
      };
      const destinationButtons = [
        ...r.$headerShortcuts.querySelectorAll(".hub-header-shortcut"),
        ...r.$panelShortcuts.querySelectorAll(".hub-panel-shortcut")
      ];
      for (const button of destinationButtons) {
        const active = runtimeState.open && button.dataset.tab === runtimeState.activeTab;
        const destination = panelDestinationState(button.dataset.tab);
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("has-dot", destination.count > 0);
        const counter = button.querySelector(".hub-header-shortcut-count, .hub-panel-shortcut-count");
        if (counter) counter.textContent = destination.count > 99 ? "99+" : String(destination.count);
        button.querySelector(".hub-header-shortcut-icon, .hub-panel-shortcut-icon")?.style.setProperty("--hub-icon", `url('${asset(destination.icon)}')`);
        button.setAttribute("aria-label", destination.label);
        button.title = destination.label;
      }
      const recentPanel = ["playlist", "cart", "activity", "settings"].includes(runtimeState.musicBarRecentPanel)
        ? runtimeState.musicBarRecentPanel : "playlist";
      const recentDestination = panelDestinationState(recentPanel);
      r.$compactPanelButton.dataset.tab = recentPanel;
      r.$compactPanelButton.classList.toggle("is-active", runtimeState.open);
      r.$compactPanelButton.classList.remove("has-count");
      const compactDestinationLabel = recentPanel === "playlist" ? runtimeState.playlistView === "saved" ? "Playlists" : "Now Playing"
        : recentPanel === "cart" ? runtimeState.cartView === "saved" ? "Saved carts" : "Cart"
        : recentDestination.label;
      r.$compactPanelButton.setAttribute("aria-label", `Open ${compactDestinationLabel} panel`);
      r.$compactPanelButton.setAttribute("aria-expanded", String(runtimeState.open));
      r.$compactPanelButton.title = r.$compactPanelButton.getAttribute("aria-label");
      for (const button of r.$tabBar.querySelectorAll(".hub-tab")) {
        const active = button.dataset.tab === runtimeState.activeTab;
        const count = button.dataset.tab === "cart"
          ? runtimeState.cart.length
          : button.dataset.tab === "playlist" ? queuedTrackCount : 0;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
        button.classList.toggle("has-dot", count > 0);
        const counter = button.querySelector(".hub-tab-dot");
        if (counter) counter.textContent = count > 99 ? "99+" : String(count);
        if (button.dataset.tab === "playlist") {
          button.setAttribute("aria-label", count ? `Now Playing and Playlists, ${count} song${count === 1 ? "" : "s"} in Now Playing` : "Now Playing and Playlists");
          button.title = button.getAttribute("aria-label");
        }
      }
      r.$syncDestinationNotices?.();
      r.$renderPanelContent();
      r.$renderDjTools();
      r.$renderPlayer();
      r.$schedulePlayerSectionGeometry();
      r.$renderOnboarding();
    };
r.$renderPanelContent = function renderPanelContent() {
      if (r.$onboardingUsesDemoPanel?.() && r.$content.dataset.onboardingDemo) return;
      const forcePlaylistRefresh = r.$forcePlaylistPanelRefresh === true;
      if (!forcePlaylistRefresh && deferNowPlayingShuffleRefresh(r)) return;
      const interactingPlaylistTrack = !forcePlaylistRefresh && runtimeState.activeTab === "playlist"
        ? r.$content.querySelector(".hub-playlist-track:hover, .hub-playlist-track:focus-within") : null;
      if (interactingPlaylistTrack) {
        r.$playlistPanelRefreshPending = true; if (interactingPlaylistTrack.dataset.bandkitRefreshDeferred !== "true") {
          interactingPlaylistTrack.dataset.bandkitRefreshDeferred = "true";
          const finishInteraction = () => window.requestAnimationFrame(() => {
            if (interactingPlaylistTrack.isConnected && interactingPlaylistTrack.matches(":hover, :focus-within")) return;
            if (!r.$playlistPanelRefreshPending) return;
            r.$playlistPanelRefreshPending = false; r.$renderPanelContent();
          });
          interactingPlaylistTrack.addEventListener("pointerleave", finishInteraction, { once: true }); interactingPlaylistTrack.addEventListener("focusout", finishInteraction, { once: true });
        }
        return;
      }
      r.$playlistPanelRefreshPending = false;
      if (runtimeState.activeTab === "activity"
        && r.$content.querySelector(".hub-activity-date-menu:not([hidden])")) return;
      const panelKey = [runtimeState.activeTab,
        runtimeState.activeTab === "cart" ? `${runtimeState.cartView}:${runtimeState.selectedSavedCartId || ""}` : "",
        runtimeState.activeTab === "playlist" ? `${runtimeState.playlistView}:${runtimeState.selectedSavedPlaylistId || ""}` : "", runtimeState.activeTab === "settings" ? `${runtimeState.settingsView || "index"}:${runtimeState.settingsSubView || "index"}` : ""
      ].join(":"); const preserveScroll = r.$renderedPanelKey === panelKey;
      const scrollPositions = preserveScroll
        ? [...r.$content.querySelectorAll(".hub-content-scroll, .hub-current-cart-list")].map((element) => element.scrollTop)
        : [];
      // Every panel refresh must finish by restoring the pinned header and
      // scrolling body. Playback updates use this same path so they can never
      // leave raw children inside an inset-free section layout.
      r.$content.classList.remove("is-section-layout", "is-empty-now-playing");
      r.$content.replaceChildren();
      if (runtimeState.activeTab === "playlist") r.$renderPlaylist();
      if (runtimeState.activeTab === "cart") r.$renderCart();
      if (runtimeState.activeTab === "activity") r.$renderActivity();
      if (runtimeState.activeTab === "settings") r.$renderSettings();
      const backupPrompt = r.$renderBackupReminder();
      if (backupPrompt) {
        const heading = r.$content.querySelector(
          ".hub-cart-view-header, .hub-saved-cart-detail-toolbar, .hub-section-heading"
        );
        if (heading) heading.after(backupPrompt);
        else r.$content.prepend(backupPrompt);
      }
      r.$mountPanelClose();
      r.$organizePanelContentScrolling();
      if (preserveScroll) {
        [...r.$content.querySelectorAll(".hub-content-scroll, .hub-current-cart-list")]
          .forEach((element, index) => { element.scrollTop = scrollPositions[index] || 0; });
      }
      r.$renderedPanelKey = panelKey;
    };
r.$organizePanelContentScrolling = function organizePanelContentScrolling() {
      r.$panelScrollResizeObserver?.disconnect();
      r.$panelScrollResizeObserver = null;
      const children = [...r.$content.children];
      const primaryHeaderIndex = children.findIndex((element) => element.matches(
        ".hub-cart-view-header, .hub-saved-cart-detail-toolbar, .hub-section-heading"
      ));
      if (primaryHeaderIndex < 0) {
        r.$content.classList.remove("is-section-layout");
        return;
      }
      let pinnedEnd = primaryHeaderIndex;
      for (let index = primaryHeaderIndex + 1; index < children.length; index += 1) {
        if (!children[index].matches(".hub-cart-backup, .hub-panel-secondary-nav")) break;
        pinnedEnd = index;
      }
      const pinned = createElement("div", "hub-content-pinned");
      const scrollBody = createElement("div", "hub-content-scroll");
      pinned.append(...children.slice(0, pinnedEnd + 1));
      scrollBody.append(...children.slice(pinnedEnd + 1));
      scrollBody.classList.toggle("is-current-cart", Boolean(scrollBody.querySelector(".hub-cart-checkout")));
      const settingsScroll = runtimeState.activeTab === "settings";
      scrollBody.classList.toggle("is-settings-scroll", settingsScroll);
      r.$content.replaceChildren(pinned, scrollBody);
      r.$content.classList.add("is-section-layout");
      if (settingsScroll) {
        const syncSettingsScrollbar = () => {
          const scrollbarWidth = Math.max(0, Math.min(12, scrollBody.offsetWidth - scrollBody.clientWidth));
          scrollBody.style.setProperty("--hub-settings-scrollbar-width", `${scrollbarWidth}px`);
        };
        syncSettingsScrollbar();
        r.$panelScrollResizeObserver = new ResizeObserver(syncSettingsScrollbar);
        r.$panelScrollResizeObserver.observe(scrollBody);
        window.requestAnimationFrame(syncSettingsScrollbar);
      }
    };
r.$mountPanelClose = function mountPanelClose() {
      const anchor = runtimeState.activeTab === "cart"
        ? r.$content.querySelector(".hub-saved-cart-detail-toolbar, .hub-cart-view-header")
        : runtimeState.activeTab === "playlist"
          ? r.$content.querySelector(".hub-saved-cart-detail-toolbar, .hub-playlist-view-header")
            : r.$content.querySelector(".hub-section-heading");
      if (!anchor) return;
      anchor.classList.add("hub-panel-content-header");
      anchor.append(r.$headerCloseButton);
    };
}
