import { createPlaylistArtwork } from "../components/playlist-artwork.js";
import { createPanelIconButton, createPanelMenuAction, createPanelOverflow, createPanelToolbarButton } from "../components/actions.js";
import { createPanelEmptyState, createPanelMediaCard, createPanelViewTabs, createSavedCollectionCard } from "../components/collections.js";
import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { createArt, createButtonIcon, createElement, createPanelBackButton, formatCartPrice, formatDuration } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { protectNowPlayingShuffleClick, syncNowPlayingShuffleButton } from "./interaction-guards.js";
export function playlistAlbumLabel(item) {
  const artist = String(item?.artist || "").trim();
  const title = String(item?.title || "").trim();
  let album = String(item?.album || "").trim();
  if (!album) return "";
  if (artist) {
    for (const suffix of [`, by ${artist}`, ` by ${artist}`]) {
      if (!album.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) continue;
      album = album.slice(0, -suffix.length).trim();
      break;
    }
    const separators = [" - ", " – ", " — ", " · ", " | ", ": "];
    for (const separator of separators) {
      const prefix = `${artist}${separator}`;
      const suffix = `${separator}${artist}`;
      if (album.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) {
        album = album.slice(prefix.length).trim();
        break;
      }
      if (album.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) {
        album = album.slice(0, -suffix.length).trim();
        break;
      }
    }
  }
  const normalizedAlbum = album.toLocaleLowerCase();
  if (!normalizedAlbum || normalizedAlbum === artist.toLocaleLowerCase() || normalizedAlbum === title.toLocaleLowerCase()) return "";
  return album;
}

function registerCollectionViews1(r) {
r.$renderCartViewTabs = function renderCartViewTabs() {
      r.$content.append(createPanelViewTabs({
        views: [{ id: "current", label: "Cart" }, { id: "saved", label: "Saved" }],
        selected: runtimeState.cartView,
        onSelect: (id) => {
          runtimeState.cartView = id;
          runtimeState.selectedSavedCartId = null;
          runtimeSaveState(); r.$saveLayoutState();
          r.$render();
        }
      }));
    };
r.$renderPlaylistViewTabs = function renderPlaylistViewTabs() {
      r.$content.append(createPanelViewTabs({
        views: [{ id: "current", label: "Now Playing" }, { id: "saved", label: "Playlists" }],
        selected: runtimeState.playlistView,
        headerClass: "hub-playlist-view-header", tabsClass: "hub-playlist-view-tabs", buttonClass: "hub-playlist-view-tab",
        ariaLabel: "Now Playing and playlists views",
        onSelect: (id) => {
          runtimeState.playlistView = id;
          runtimeState.selectedSavedPlaylistId = null;
          runtimeSaveState(); r.$saveLayoutState();
          r.$render();
        }
      }));
    };
r.$cartTotalLabel = function cartTotalLabel(items, summary = null) {
      const officialTotal = Number.isFinite(Number(summary?.total)) ? Number(summary.total) : Number(summary?.subtotal);
      if (Number.isFinite(officialTotal) && summary?.currency) {
        return formatCartPrice(officialTotal, summary.currency);
      }
      const totals = new Map();
      for (const item of items || []) {
        const currency = /^[A-Z]{3}$/.test(item.currency || "") ? item.currency : "USD";
        totals.set(currency, (totals.get(currency) || 0) + (Number(item.price) || 0));
      }
      return [...totals].map(([currency, total]) => formatCartPrice(total, currency)).join(" + ") || formatCartPrice(0, "USD");
    };
r.$cartItemArt = function cartItemArt(item) {
      if (Number(item.restore?.art_id)) return `https://f4.bcbits.com/img/a${Number(item.restore.art_id)}_7.jpg`;
      if (Number(item.restore?.image_id)) return `https://f4.bcbits.com/img/${String(Number(item.restore.image_id)).padStart(10, "0")}_37.jpg`;
      return item.art;
    };
r.$renderCartItemCard = function renderCartItemCard(item, { removable = false, savedCart = null } = {}) {
      if (r.$isGenericCartArtist(item.artist)) r.$queueCartArtistResolution([item]);
      const card = createPanelMediaCard("hub-cart-item-card");
      card.classList.toggle("is-unavailable", item.unavailable === true);
      const main = createElement("div", "hub-product-main");
      const artLink = r.$createPageLink("", item.url, "hub-art-link");
      artLink.setAttribute("aria-label", `Open ${item.title}`);
      artLink.append(createArt(r.$cartItemArt(item)));
      main.append(artLink);
      const details = createElement("div", "hub-product-details");
      const row = createElement("div", "hub-row-title");
      row.append(r.$createPageLink(item.title, item.url, "hub-cart-title hub-inline-link"), createElement("span", "hub-price", formatCartPrice(item.price, item.currency)));
      details.append(row);
      if (!r.$isGenericCartArtist(item.artist)) {
        details.append(r.$createPageLink(item.artist, r.$artistUrlFromPageUrl(item.url) || item.url, "hub-track-artist hub-inline-link"));
      }
      const metaRow = createElement("div", "hub-row-title hub-product-meta-row");
      metaRow.append(createElement("span", "hub-meta", item.kind));
      if (item.unavailable === true) {
        metaRow.append(createElement("span", "hub-cart-item-status", "Unavailable"));
      }
      if (removable || savedCart) {
        const remove = createElement("button", "hub-playlist-icon-button hub-cart-remove-button");
        remove.type = "button";
        remove.title = savedCart
          ? `Remove ${item.title} from ${savedCart.name || "saved cart"}`
          : `Remove ${item.title} from cart`;
        remove.setAttribute("aria-label", remove.title);
        remove.append(createButtonIcon("icon-close.svg"));
        remove.addEventListener("click", async (event) => {
          event.stopPropagation();
          if (savedCart) {
            r.$removeSavedCartItem(savedCart, item);
            return;
          }
          remove.disabled = true;
          remove.title = `Removing ${item.title} from cart`;
          remove.setAttribute("aria-label", remove.title);
          const result = await r.$removeLiveCartItem(item);
          if (!result.removed) {
            remove.disabled = false;
            remove.title = `Remove ${item.title} from cart`;
            remove.setAttribute("aria-label", remove.title);
            r.$showToast(result.error || "Bandcamp could not remove this item.");
            return;
          }
          runtimeState.cart = runtimeState.cart.filter((entry) => entry.id !== item.id);
          runtimeState.cartSavedAt = Date.now();
          runtimeSaveState();
          r.$render();
          r.$showToast(`Removed “${item.title}” from your Bandcamp cart.`);
        });
        metaRow.append(remove);
      }
      details.append(metaRow);
      main.append(details);
      card.append(main);
      return card;
    };
r.$renderCurrentCart = function renderCurrentCart() {
      const backup = createElement("div", "hub-cart-backup");
      const itemCount = `${runtimeState.cart.length} item${runtimeState.cart.length === 1 ? "" : "s"}`;
      backup.append(createElement("div", "hub-cart-backup-time hub-panel-count-summary", itemCount));
      const backupActions = createElement("div", "hub-toolbar");
      const saveButton = r.$createPlaylistToolbarButton("Save cart", "icon-save.svg", r.$saveCartSnapshot);
      saveButton.disabled = !runtimeState.cart.length;
      const exportButton = r.$createToolbarMenuAction("Download cart", "icon-download-all.svg", () => r.$exportCart(), {
        disabled: !runtimeState.cart.length
      });
      const shareButton = r.$createToolbarMenuAction("Share cart", "icon-share.svg", () => void r.$shareCart(), {
        disabled: !runtimeState.cart.length
      });
      const importInput = document.createElement("input");
      importInput.type = "file";
      importInput.accept = ".html,.htm,.json,text/html,application/json";
      importInput.hidden = true;
      const importButton = r.$createToolbarMenuAction("Import cart", "icon-import.svg", () => importInput.click());
      importInput.addEventListener("change", () => {
        const file = importInput.files?.[0];
        importInput.value = "";
        void r.$importAndRestoreCart(file, importButton);
      });
      const moreActions = r.$createToolbarOverflow("More cart actions", [exportButton, shareButton, importButton], {
        menuLabel: "Cart actions",
        className: "hub-cart-overflow"
      });
      backupActions.append(saveButton, moreActions, importInput);
      backup.append(backupActions);
      r.$content.append(backup);
      const stack = createElement("div", "hub-stack hub-current-cart-list");
      for (const item of runtimeState.cart) {
        stack.append(r.$renderCartItemCard(item, { removable: true }));
      }
      if (!runtimeState.cart.length) stack.append(createPanelEmptyState("Your cart is empty. Bandkit will save items here when it finds them on a Bandcamp page."));
      r.$content.append(stack);
      const unavailableCount = runtimeState.cart.filter((item) => item.unavailable === true).length;
      let checkoutWarning = null;
      if (unavailableCount) {
        checkoutWarning = createElement(
          "div",
          "hub-cart-checkout-warning",
          `Remove ${unavailableCount} unavailable item${unavailableCount === 1 ? "" : "s"} to continue.`
        );
        checkoutWarning.id = "hub-cart-checkout-warning";
        checkoutWarning.setAttribute("role", "status");
        r.$content.append(checkoutWarning);
      }
      const checkout = createElement("button", "hub-primary-button hub-cart-checkout");
      checkout.type = "button";
      checkout.disabled = !runtimeState.cart.length || unavailableCount > 0;
      if (checkoutWarning) checkout.setAttribute("aria-describedby", checkoutWarning.id);
      checkout.append(createElement("span", "hub-cart-checkout-label", "Checkout"), createElement("span", "hub-cart-checkout-total", r.$cartTotalLabel(runtimeState.cart, runtimeState.cartSummary)));
      checkout.addEventListener("click", r.$openBandcampCheckout);
      r.$content.append(checkout);
    };
r.$openSavedCart = function openSavedCart(snapshot) {
      runtimeState.selectedSavedCartId = snapshot.id;
      runtimeSaveState(); r.$saveLayoutState();
      r.$render();
    };
}
function registerCollectionViews2(r) {
r.$createSavedCartActions = function createSavedCartActions(snapshot) {
      const actions = createElement("div", "hub-saved-playlist-icon-actions hub-saved-cart-icon-actions");
      actions.append(
        r.$createSavedItemActionButton(`Restore ${snapshot.name || "saved cart"}`, "icon-restore.svg", () => void r.$restoreSavedCart(snapshot.items || [])),
        r.$createSavedItemActionButton(`Rename ${snapshot.name || "saved cart"}`, "icon-edit.svg", () => r.$renameSavedCart(snapshot)),
        r.$createSavedItemActionButton(`Share ${snapshot.name || "saved cart"} as HTML`, "icon-share.svg", () => void r.$shareCart(snapshot.items || [], snapshot.name || "Bandcamp cart", snapshot.summary)),
        r.$createSavedItemActionButton(`Delete ${snapshot.name || "saved cart"}`, "icon-trash.svg", () => r.$deleteSavedCart(snapshot), "is-delete")
      );
      actions.firstElementChild.disabled = !snapshot.items?.length;
      return actions;
    };
r.$renderSavedCartList = function renderSavedCartList() {
      const createRow = createElement("div", "hub-cart-backup hub-playlist-import-row");
      createRow.append(createElement("div", "hub-cart-backup-time", "Create separate carts for releases you want to keep together"));
      const createButton = r.$createPlaylistToolbarButton("New cart", "icon-plus.svg", r.$createEmptySavedCart);
      createButton.classList.add("hub-create-cart-button");
      const createActions = createElement("div", "hub-toolbar");
      createActions.append(createButton);
      createRow.append(createActions);
      r.$content.append(createRow);
      if (!runtimeState.savedCarts.length) {
        r.$content.append(createPanelEmptyState("No saved carts yet. Create an empty cart now, or Bandkit will auto-save your current cart when it captures one."));
        return;
      }
      const stack = createElement("div", "hub-stack hub-saved-cart-stack");
      for (const snapshot of runtimeState.savedCarts) {
        const items = Array.isArray(snapshot.items) ? snapshot.items : [];
        const card = createSavedCollectionCard({
          title: snapshot.name || "Saved cart", total: r.$cartTotalLabel(items, snapshot.summary),
          summary: `${items.length} item${items.length === 1 ? "" : "s"}`,
          artwork: r.$createPlaylistArtworkMosaic(items.map((item) => ({ ...item, art: r.$cartItemArt(item) }))),
          ariaLabel: `Open saved cart ${snapshot.name || "Saved cart"}`,
          onOpen: () => r.$openSavedCart(snapshot)
        });
        stack.append(card);
      }
      r.$content.append(stack);
    };
r.$renderSavedCartDetail = function renderSavedCartDetail(snapshot) {
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const toolbar = createElement("div", "hub-saved-cart-detail-toolbar hub-saved-playlist-detail-toolbar");
      const returnToSavedCarts = (event) => {
        event.preventDefault();
        event.stopPropagation();
        runtimeState.selectedSavedCartId = null;
        runtimeSaveState();
        r.$render();
      };
      const back = createPanelBackButton("Back to saved carts", returnToSavedCarts, "hub-saved-playlist-back hub-saved-cart-back");
      back.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        returnToSavedCarts(event);
      }, true);
      toolbar.append(createElement("h2", "hub-saved-playlist-detail-title", snapshot.name || "Saved cart"));
      r.$content.append(toolbar);
      const actionRow = createElement("div", "hub-panel-secondary-nav hub-cart-backup hub-playlist-toolbar hub-saved-playlist-action-row hub-saved-cart-detail-action-row");
      const context = createElement("div", "hub-panel-back-context");
      context.append(back, createElement("div", "hub-cart-backup-time", `${items.length} item${items.length === 1 ? "" : "s"} · ${r.$cartTotalLabel(items, snapshot.summary)}`));
      actionRow.append(
        context,
        r.$createSavedCartActions(snapshot)
      );
      r.$content.append(actionRow);
      const stack = createElement("div", "hub-stack");
      for (const item of items) stack.append(r.$renderCartItemCard(item, {
        savedCart: r.$cartAutosave.isAutoSavedCart(snapshot) ? null : snapshot
      }));
      r.$content.append(stack);
      if (!items.length) r.$content.append(createPanelEmptyState("This saved cart has no items."));
    };
r.$renderCart = function renderCart() {
      if (!['current', 'saved'].includes(runtimeState.cartView)) runtimeState.cartView = "current";
      const snapshot = runtimeState.savedCarts.find((entry) => entry.id === runtimeState.selectedSavedCartId);
      if (!snapshot) runtimeState.selectedSavedCartId = null;
      if (snapshot && runtimeState.cartView === "saved") {
        r.$renderSavedCartDetail(snapshot);
        return;
      }
      r.$renderCartViewTabs();
      if (runtimeState.cartView === "current") r.$renderCurrentCart();
      else r.$renderSavedCartList();
    };
r.$movePlaylistItem = function movePlaylistItem(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= runtimeState.playlist.length || toIndex >= runtimeState.playlist.length) return;
      r.$resetPlaylistShuffle();
      const [item] = runtimeState.playlist.splice(fromIndex, 1);
      runtimeState.playlist.splice(toIndex, 0, item);
      runtimeState.playlistMode = "manual";
      runtimeSaveState();
      void r.$syncActivePlaylistQueue();
      r.$render();
    };
r.$moveSavedPlaylistItem = function moveSavedPlaylistItem(snapshot, fromIndex, toIndex) {
      if (!snapshot || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= snapshot.items.length || toIndex >= snapshot.items.length) return;
      const [item] = snapshot.items.splice(fromIndex, 1);
      snapshot.items.splice(toIndex, 0, item);
      snapshot.items = r.$normalizePlaylist(snapshot.items);
      snapshot.modifiedAt = new Date().toISOString();
      runtimeSaveState();
      r.$render();
    };
r.$removeSavedPlaylistItem = function removeSavedPlaylistItem(snapshot, item) {
      if (!snapshot || !item || !Array.isArray(snapshot.items)) return false;
      const index = snapshot.items.findIndex((entry) => entry.playlistItemId === item.playlistItemId
        || r.$playlistTracksMatch(entry, item));
      if (index < 0) return false;
      if (!window.confirm(`Remove “${item.title}” from “${snapshot.name}”?`)) return false;
      snapshot.items.splice(index, 1);
      snapshot.items = r.$normalizePlaylist(snapshot.items);
      snapshot.modifiedAt = new Date().toISOString();
      runtimeSaveState();
      r.$render();
      r.$showToast(`Removed “${item.title}” from “${snapshot.name}”`);
      return true;
    };
}
function registerCollectionViews3(r) {
r.$bindPlaylistCardReordering = function bindPlaylistCardReordering(card, item, index, items, moveItem) {
      card.draggable = true;
      card.tabIndex = 0;
      card.dataset.playlistItemId = item.playlistItemId;
      card.setAttribute("aria-label", `${item.title}, position ${index + 1} of ${items.length}. Drag or press Option/Alt plus Up or Down to reorder.`);
      card.addEventListener("pointerdown", (event) => {
        if (!(event.target instanceof Element) || !event.target.closest("a, button, input, select, textarea")) {
          card.draggable = true;
          return;
        }
        // A draggable ancestor can claim a slight pointer movement before its
        // button receives click. Suspend native dragging for this gesture so
        // card controls remain reliable physical click targets.
        card.draggable = false;
        const restoreDragging = () => {
          window.removeEventListener("pointerup", restoreDragging);
          window.removeEventListener("pointercancel", restoreDragging);
          window.setTimeout(() => { card.draggable = true; }, 0);
        };
        window.addEventListener("pointerup", restoreDragging);
        window.addEventListener("pointercancel", restoreDragging);
      }, true);
      card.addEventListener("dragstart", (event) => {
        if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) {
          event.preventDefault();
          return;
        }
        r.$draggingPlaylistId = item.playlistItemId;
        event.dataTransfer?.setData("text/plain", item.playlistItemId);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => {
        r.$draggingPlaylistId = "";
        r.$content.querySelectorAll(".hub-playlist-track").forEach((entry) => entry.classList.remove("is-dragging", "is-drag-target", "is-drop-before", "is-drop-after"));
      });
      card.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const after = event.clientY > card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2;
        card.classList.add("is-drag-target");
        card.classList.toggle("is-drop-before", !after);
        card.classList.toggle("is-drop-after", after);
      });
      card.addEventListener("dragleave", () => card.classList.remove("is-drag-target", "is-drop-before", "is-drop-after"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        const dropAfter = card.classList.contains("is-drop-after");
        card.classList.remove("is-drag-target", "is-drop-before", "is-drop-after");
        const sourceId = r.$draggingPlaylistId || event.dataTransfer?.getData("text/plain");
        const sourceIndex = items.findIndex((entry) => entry.playlistItemId === sourceId);
        const destinationIndex = sourceIndex < index
          ? index - (dropAfter ? 0 : 1)
          : index + (dropAfter ? 1 : 0);
        moveItem(sourceIndex, Math.max(0, Math.min(items.length - 1, destinationIndex)));
      });
      card.addEventListener("keydown", (event) => {
        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const destination = index + (event.key === "ArrowUp" ? -1 : 1);
        if (destination < 0 || destination >= items.length) return;
        moveItem(index, destination);
        requestAnimationFrame(() => r.$content.querySelector(`[data-playlist-item-id="${CSS.escape(item.playlistItemId)}"]`)?.focus());
      });
    };
r.$activePlaylistItemId = function activePlaylistItemId() {
      if (r.$pendingPlaylistItemId) return r.$pendingPlaylistItemId;
      if (!runtimeSeamless.enabled || !runtimeSeamless.track) return "";
      const activeItem = runtimeState.playlist.find((item) => r.$playlistItemMatchesActiveTrack(item));
      return activeItem?.playlistItemId || runtimeSeamless.track.playlistItemId || "";
    };
r.$playlistItemMatchesActiveTrack = function playlistItemMatchesActiveTrack(item) {
      if (!item || !runtimeSeamless.enabled || !runtimeSeamless.track) return false;
      return Boolean(
        (item.playlistItemId && runtimeSeamless.track.playlistItemId === item.playlistItemId)
        || r.$matchingQueueTrack([runtimeSeamless.track], item)
      );
    };
r.$syncCurrentPlaylistPlaybackUi = function syncCurrentPlaylistPlaybackUi() {
      const activeId = r.$activePlaylistItemId();
      const activeIsPlaying = !r.$pendingPlaylistItemId && Boolean(runtimeSeamless.isPlaying);
      for (const card of r.$content.querySelectorAll(".hub-playlist-track[data-playlist-item-id]")) {
        const isCurrent = Boolean(activeId && card.dataset.playlistItemId === activeId);
        const isPlaying = isCurrent && activeIsPlaying;
        card.classList.toggle("is-playing", isCurrent);
        card.classList.toggle("is-actively-playing", isPlaying);
        card.setAttribute("aria-current", isCurrent ? "true" : "false");
        const toggle = card.querySelector(".hub-playlist-media-toggle");
        if (!toggle) continue;
        const item = runtimeState.playlist.find((track) => track.playlistItemId === card.dataset.playlistItemId);
        const activeTrackMatch = r.$playlistItemMatchesActiveTrack(item);
        const isActuallyLoading = Boolean(r.$pendingPlaylistItemId && isCurrent && !activeTrackMatch);
        const label = isActuallyLoading
          ? `Loading ${item?.title || "track"}`
          : isCurrent
            ? isPlaying ? `Pause ${item?.title || "track"}` : `Resume ${item?.title || "track"}`
          : `Play ${item?.title || "track"}`;
        toggle.title = label;
        toggle.setAttribute("aria-label", label);
        // Keep this control physically clickable even while a prior playback
        // request is settling. A second click can then recover/retry instead of
        // leaving the user with a permanently disabled Now Playing card.
        toggle.disabled = false;
        toggle.setAttribute("aria-busy", String(isActuallyLoading));
        const icon = toggle.querySelector(".hub-playlist-media-icon");
        icon?.replaceChildren(createButtonIcon(isPlaying ? "icon-pause.svg" : "icon-play.svg"));
      }
    };
r.$formatPlaylistBpm = function formatPlaylistBpm(value, uncertain = false) { const bpm = r.$normalizePlaylistBpm(value);
      return bpm ? `${Number.isInteger(bpm) ? bpm : bpm.toFixed(1)}${uncertain ? "?" : ""} BPM` : ""; };
r.$createPlaylistAnalysisMeta = function createPlaylistAnalysisMeta(item) {
      if (runtimeState.djToolsEnabled === false || runtimeState.recordPlaylistMetadata === false) return null;
      const directPageAnalysis = r.$pageTrackAnalysis?.get(r.$pageAnalysisTrackKey?.(item));
      const matchingPageAnalysis = directPageAnalysis || [...(r.$pageTrackAnalysis?.values?.() || [])].find((result) => (
        String(result?.id || "") && String(result.id) === String(item.id || "")
      ) || (String(result?.url || "") && String(result.url) === String(item.url || "")));
      const bpmValue = item.bpm || matchingPageAnalysis?.bpm;
      const bpmEstimateUncertain = Boolean(bpmValue && (item.bpm ? item.bpmUncertain : matchingPageAnalysis?.bpmUncertain));
      const bpm = r.$formatPlaylistBpm(bpmValue, bpmEstimateUncertain); const key = r.$normalizePlaylistKey(item.key || matchingPageAnalysis?.key);
      const showMusicalKey = runtimeState.showTrackKeys !== false; const showCamelot = runtimeState.showCamelotNotation === true;
      const bpmUnavailable = Boolean(matchingPageAnalysis && !bpm); const keyUncertain = Boolean(key?.uncertain || (matchingPageAnalysis && !key && (showMusicalKey || showCamelot)));
      if (!bpm && !(key && (showMusicalKey || showCamelot)) && !bpmUnavailable && !keyUncertain) return null;
      const meta = createElement("div", "hub-playlist-analysis");
      const visibleParts = []; const accessibleParts = [];
      if (bpm) { visibleParts.push(bpm); accessibleParts.push(bpmEstimateUncertain ? `${bpm} estimated` : bpm); }
      if (bpmUnavailable) { visibleParts.push("BPM?"); accessibleParts.push("BPM unavailable"); }
      if (key) {
        const keyLabel = [showCamelot && key.camelot ? `${key.camelot}${keyUncertain ? "?" : ""}` : "", showMusicalKey && key.shortName ? `${key.shortName}${keyUncertain ? "?" : ""}` : ""].filter(Boolean).join(" · ") || (showMusicalKey ? `${key.name}${keyUncertain ? "?" : ""}` : "");
        if (keyLabel) visibleParts.push(keyLabel);
        if (keyLabel) accessibleParts.push(showMusicalKey ? key.name || keyLabel : keyLabel);
      }
      if (keyUncertain) { if (!key) visibleParts.push("Key?"); accessibleParts.push("musical key uncertain"); }
      const text = createElement("span", "hub-playlist-analysis-text", visibleParts.join(" · "));
      if (key?.name && showMusicalKey) text.title = keyUncertain ? `Best-effort musical key estimate: ${key.name}${r.$keyAlternativeDescription?.(key) ? `. ${r.$keyAlternativeDescription(key)}` : ""}` : key.name;
      else if (bpmEstimateUncertain || bpmUnavailable || keyUncertain) text.title = [bpmEstimateUncertain ? "Best-effort BPM estimate" : bpmUnavailable ? "BPM could not be detected confidently" : "", keyUncertain ? "Musical key could not be detected confidently" : ""].filter(Boolean).join(" · ");
      meta.append(text); meta.setAttribute("aria-label", `Track analysis: ${accessibleParts.join(", ")}`); return meta;
    };
r.$syncCurrentPlaylistAnalysisUi = function syncCurrentPlaylistAnalysisUi() {
      for (const card of r.$content.querySelectorAll(".hub-playlist-track[data-playlist-item-id]")) {
        const item = runtimeState.playlist.find((track) => track.playlistItemId === card.dataset.playlistItemId);
        const current = card.querySelector(".hub-playlist-analysis");
        const next = item ? r.$createPlaylistAnalysisMeta(item) : null;
        if (!next) {
          current?.remove();
          continue;
        }
        if (current?.textContent === next.textContent && current.getAttribute("aria-label") === next.getAttribute("aria-label")) continue;
        if (current) current.replaceWith(next);
        else (card.querySelector(".hub-playlist-detail-row") || card.querySelector(".hub-track-copy"))?.append(next);
      }
    };
}
function registerCollectionViews4(r) {
r.$renderPlaylistTrack = function renderPlaylistTrack(item, index, options = {}) {
      const isTransient = options.transient === true;
      const isCurrentPlaylistTrack = isTransient
        ? options.active === true
        : r.$activePlaylistItemId() === item.playlistItemId;
      const isCurrentLoading = isCurrentPlaylistTrack
        && !isTransient
        && r.$pendingPlaylistItemId === item.playlistItemId
        && !r.$playlistItemMatchesActiveTrack(item);
      const isCurrentPlaying = isCurrentPlaylistTrack
        && !isCurrentLoading
        && Boolean(isTransient ? (runtimeSeamless.isPlaying || runtimeLive.isPlaying) : runtimeSeamless.isPlaying);
      const card = createPanelMediaCard(`hub-playlist-track${isTransient && options.pageQueue !== false ? " is-page-queue-track" : ""}${isCurrentPlaylistTrack ? " is-playing" : ""}${isCurrentPlaying ? " is-actively-playing" : ""}`);
      if (!isTransient) r.$bindPlaylistCardReordering(card, item, index, runtimeState.playlist, r.$movePlaylistItem);
      card.setAttribute("aria-current", isCurrentPlaylistTrack ? "true" : "false");
      const mediaToggle = createElement("button", "hub-playlist-media-toggle");
      mediaToggle.type = "button";
      mediaToggle.title = isCurrentLoading
        ? `Loading ${item.title}`
        : isCurrentPlaylistTrack
        ? isCurrentPlaying ? `Pause ${item.title}` : `Resume ${item.title}`
        : `Play ${item.title}`;
      mediaToggle.setAttribute("aria-label", mediaToggle.title);
      mediaToggle.disabled = false;
      mediaToggle.setAttribute("aria-busy", String(isCurrentLoading));
      const artwork = createElement("span", "hub-playlist-media-art");
      artwork.append(createArt(item.art, true));
      if (options.position != null) {
        const position = createElement("span", "hub-playlist-position-badge", String(options.position));
        position.setAttribute("aria-hidden", "true");
        artwork.append(position);
      }
      const mediaIcon = createElement("span", "hub-playlist-media-icon");
      mediaIcon.append(createButtonIcon(isCurrentPlaying ? "icon-pause.svg" : "icon-play.svg"));
      mediaToggle.append(artwork, mediaIcon);
      const activateMediaPlayback = () => {
        if (options.onActivate) {
          options.onActivate();
          return;
        }
        if (r.$playlistItemMatchesActiveTrack(item)) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
        else {
          // A preceding selection may have consumed rows since this card was
          // rendered. Resolve the current position by stable item identity so
          // a stale closure can never select a later track.
          const currentIndex = runtimeState.playlist.findIndex((track) => track.playlistItemId === item.playlistItemId);
          if (currentIndex >= 0) void r.$playPlaylistAt(currentIndex);
        }
      };
      mediaToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
      mediaToggle.addEventListener("mousedown", (event) => event.stopPropagation());
      mediaToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        activateMediaPlayback();
      });
      const copy = createElement("div", "hub-track-copy");
      copy.append(
        r.$createPageLink(item.title, item.pageUrl, "hub-track-title hub-inline-link"),
        r.$createPageLink(item.artist, item.artistUrl || item.pageUrl, "hub-track-artist hub-inline-link")
      );
      const detailRow = createElement("div", "hub-playlist-detail-row");
      const album = playlistAlbumLabel(item), meta = createElement("span", `hub-playlist-meta${item.restoreError ? " is-error" : ""}`);
      if (album) meta.append(r.$createPageLink(album, item.releaseUrl || r.$matchingQueueTrack(r.$buildSeamlessQueue(), item)?.releaseUrl || item.pageUrl, "hub-playlist-album-link hub-inline-link"));
      for (const detail of [item.duration ? formatDuration(item.duration) : "", item.restoreError].filter(Boolean)) meta.append(document.createTextNode(`${meta.childNodes.length ? " · " : ""}${detail}`));
      if (meta.childNodes.length) detailRow.append(meta);
      const analysisMeta = r.$createPlaylistAnalysisMeta(item);
      if (analysisMeta) detailRow.append(analysisMeta);
      if (detailRow.childElementCount) copy.append(detailRow);
      const actions = options.createActions?.(card, item) || r.$createNowPlayingTrackActions(card, item, {
        includeRemove: options.includeRemove, onRemove: options.onRemove
      });
      card.append(mediaToggle, copy, actions);
      return card;
    };
r.$createPlaylistToolbarButton = function createPlaylistToolbarButton(label, icon, onClick, { addPage = false } = {}) {
      return createPanelToolbarButton(label, icon, onClick, { addPage });
    };
r.$createToolbarMenuAction = function createToolbarMenuAction(label, icon, onClick, options = {}) {
      return createPanelMenuAction(label, icon, onClick, options);
    };
r.$createToolbarOverflow = function createToolbarOverflow(label, actionButtons, options = {}) {
      return createPanelOverflow(label, actionButtons, { ...options, activeElement: () => r.$shadow.activeElement });
    };
}
function registerCollectionViews5(r) {
r.$renderPageQueueFallback = function renderPageQueueFallback() {
      const pageQueueSignature = `${runtimeLive.pageUrl}|${runtimeLive.title}`;
      if (r.$clearedPageQueueSignature && r.$clearedPageQueueSignature === pageQueueSignature) {
        r.$content.append(createPanelEmptyState("Now Playing is clear. Use the ＋ buttons to add tracks."));
        return;
      }
      if (!runtimeLive.hasPlaybackStarted || !runtimeLive.title) {
        r.$content.append(createPanelEmptyState("Play a Bandcamp track or use the ＋ buttons to build your queue."));
        return;
      }
      const activeTrack = runtimeSeamless.enabled && runtimeSeamless.track ? runtimeSeamless.track : null;
      const queue = [activeTrack, ...runtimeLive.tracks]
        .filter(Boolean)
        .filter((track, index, items) => items.findIndex((candidate) => Boolean(r.$matchingQueueTrack([candidate], track))) === index)
        .slice(0, 20);
      if (!queue.length) {
        r.$content.append(createPanelEmptyState(runtimeLive.available ? "Nothing else in the current page queue." : "Play something on this page to connect the queue."));
        return;
      }
      const list = createElement("div", "hub-stack hub-playlist-stack hub-playlist-page-queue");
      queue.forEach((track, index) => {
        const isActiveTrack = activeTrack
          ? Boolean(r.$matchingQueueTrack([activeTrack], track))
          : index === 0;
        list.append(r.$renderPlaylistTrack(track, index, {
          active: isActiveTrack,
          includeRemove: false,
          onActivate: () => {
            if (isActiveTrack) {
              if (runtimeSeamless.enabled) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
              else r.$pageMediaCommand(runtimeLive.isPlaying ? "pause" : "play");
              return;
            }
            r.$addTracksToPlaylist(queue, { quiet: true });
            const playlistIndex = runtimeState.playlist.findIndex((item) => r.$playlistTracksMatch(item, track));
            if (playlistIndex >= 0) void r.$playPlaylistAt(playlistIndex);
          },
          transient: true
        }));
      });
      r.$content.append(list);
    };
r.$renderCurrentPlaylist = function renderCurrentPlaylist() {
      const pageTracks = r.$buildSeamlessQueue();
      const toolbarItems = runtimeState.playlist.length
        ? runtimeState.playlist
        : runtimeLive.hasPlaybackStarted
        ? pageTracks
        : [];
      const toolbar = createElement("div", "hub-cart-backup hub-playlist-toolbar hub-now-playing-toolbar");
      const songCount = toolbarItems.length;
      r.$content.classList.toggle("is-empty-now-playing", songCount === 0);
      toolbar.append(createElement(
        "div",
        "hub-cart-backup-time hub-panel-count-summary",
        `${songCount} track${songCount === 1 ? "" : "s"}`
      ));
      const actions = createElement("div", "hub-toolbar");
      const addPage = r.$createPlaylistToolbarButton("Add page to queue", "icon-queue.svg", () => {
        if (!pageTracks.length) r.$showToast("This page does not expose a streamable track list.");
        else r.$addTracksToPlaylist(pageTracks);
      }, { addPage: true });
      addPage.hidden = !pageTracks.length;
      const shuffleActive = runtimeState.playlistShuffleEnabled === true;
      const shuffle = r.$createPlaylistToolbarButton(shuffleActive ? "Turn shuffle off" : "Turn shuffle on", "icon-shuffle.svg", () => {
        r.$togglePlaylistShuffle();
        syncNowPlayingShuffleButton(shuffle, runtimeState.playlistShuffleEnabled === true);
      });
      shuffle.classList.add("hub-now-playing-shuffle");
      shuffle.classList.toggle("is-active", shuffleActive); shuffle.setAttribute("aria-pressed", String(shuffleActive));
      protectNowPlayingShuffleClick(r, shuffle);
      shuffle.hidden = songCount < 2;
      const save = r.$createToolbarMenuAction("Save as playlist", "icon-save.svg", () => r.$savePlaylistSnapshot(toolbarItems), {
        disabled: !toolbarItems.length
      });
      const download = r.$createToolbarMenuAction("Download queue", "icon-download-all.svg", () => r.$exportPlaylist(toolbarItems), {
        disabled: !toolbarItems.length
      });
      const share = r.$createToolbarMenuAction("Share queue", "icon-share.svg", () => void r.$sharePlaylist(toolbarItems, "Now Playing"), {
        disabled: !toolbarItems.length
      });
      const clear = r.$createToolbarMenuAction("Clear Now Playing", "icon-clear.svg", async () => {
        await r.$clearNowPlayingPlayback();
      }, {
        disabled: !runtimeState.playlist.length && !toolbarItems.length && !runtimeLive.hasPlaybackStarted,
        danger: true
      });
      const moreWrap = r.$createToolbarOverflow("More Now Playing actions", [save, download, share, clear], {
        menuLabel: "Now Playing actions",
        className: "hub-now-playing-overflow"
      });
      actions.append(addPage, shuffle, moreWrap);
      actions.hidden = addPage.hidden && shuffle.hidden && moreWrap.querySelector(".hub-toolbar-more-button")?.disabled;
      toolbar.append(actions);
      r.$content.append(toolbar);
      if (!runtimeState.playlist.length) {
        r.$renderPageQueueFallback();
        return;
      }
      const stack = createElement("div", "hub-stack hub-playlist-stack");
      runtimeState.playlist.forEach((item, index) => stack.append(r.$renderPlaylistTrack(item, index)));
      r.$content.append(stack);
    };
r.$renameSavedPlaylist = function renameSavedPlaylist(snapshot) {
      const name = window.prompt("Rename this playlist", snapshot.name)?.trim();
      if (!name) return;
      snapshot.name = name.slice(0, 120);
      snapshot.modifiedAt = new Date().toISOString();
      runtimeSaveState();
      r.$render();
    };
r.$deleteSavedPlaylist = function deleteSavedPlaylist(snapshot) {
      if (!window.confirm(`Delete the playlist “${snapshot.name}”?`)) return;
      runtimeState.savedPlaylists = runtimeState.savedPlaylists.filter((entry) => entry.id !== snapshot.id);
      if (runtimeState.selectedSavedPlaylistId === snapshot.id) runtimeState.selectedSavedPlaylistId = null;
      runtimeSaveState();
      r.$render();
    };
r.$createSavedItemActionButton = function createSavedItemActionButton(label, icon, onClick, className = "") {
      return createPanelIconButton({
        label, icon, className: `hub-saved-playlist-icon-button${className ? ` ${className}` : ""}`,
        onClick: (event) => {
          event.stopPropagation();
          void onClick();
        }
      });
    };
r.$createSavedPlaylistActions = function createSavedPlaylistActions(snapshot, {
  includeDownload = false, includePlay = true, includeShufflePlay = false,
  includeAdd = true, includeRestoreCart = false
} = {}) {
      const actions = createElement("div", "hub-saved-playlist-icon-actions");
      if (includePlay) {
        const play = r.$createSavedItemActionButton(
          `Play ${snapshot.name}`,
          "icon-play.svg",
          () => r.$playSavedPlaylist(snapshot)
        );
        play.disabled = !snapshot.items.length;
        actions.append(play);
      }
      if (includeShufflePlay) {
        const shuffle = r.$createSavedItemActionButton(
          `Play ${snapshot.name} shuffled`,
          "icon-shuffle.svg",
          () => r.$playSavedPlaylist(snapshot, { shuffle: true })
        );
        shuffle.disabled = snapshot.items.length < 2; actions.append(shuffle);
      }
      if (includeAdd) {
        const add = r.$createSavedItemActionButton(`Add ${snapshot.name} to Now Playing`, "icon-plus.svg", () => r.$restoreSavedPlaylist(snapshot, "append"));
        add.disabled = !snapshot.items.length; actions.append(add);
      }
      actions.append(
        r.$createSavedItemActionButton(`Rename ${snapshot.name}`, "icon-edit.svg", () => r.$renameSavedPlaylist(snapshot)),
        r.$createSavedItemActionButton(`Share ${snapshot.name} as HTML`, "icon-share.svg", () => void r.$sharePlaylist(snapshot.items, snapshot.name))
      );
      if (includeDownload) {
        actions.append(r.$createSavedItemActionButton(`Download ${snapshot.name}`, "icon-download-all.svg", () => r.$exportPlaylist(snapshot.items, snapshot.name)));
      }
      if (includeRestoreCart) {
        const restoreCart = r.$createSavedItemActionButton(`Restore ${snapshot.name} to cart`, "icon-cart.svg", () => void r.$restoreSavedCart(snapshot.items));
        restoreCart.disabled = !snapshot.items.length;
        actions.append(restoreCart);
      }
      actions.append(r.$createSavedItemActionButton(`Delete ${snapshot.name}`, "icon-trash.svg", () => r.$deleteSavedPlaylist(snapshot), "is-delete"));
      return actions;
    };
}
function registerCollectionViews6(r) {
r.$savedPlaylistMatchesCurrentQueue = function savedPlaylistMatchesCurrentQueue(snapshot) {
  return Boolean(snapshot?.items?.length
    && runtimeState.playlist.length === snapshot.items.length
    && snapshot.items.every((item, index) => r.$playlistTracksMatch(item, runtimeState.playlist[index])));
};
r.$syncSavedPlaylistCardPlaybackUi = function syncSavedPlaylistCardPlaybackUi() {
      for (const card of r.$content.querySelectorAll(".hub-saved-playlist-card[data-saved-playlist-id]")) {
        const snapshot = runtimeState.savedPlaylists.find((entry) => entry.id === card.dataset.savedPlaylistId);
        const active = r.$savedPlaylistMatchesCurrentQueue(snapshot); const playing = active && runtimeSeamless.isPlaying;
        card.classList.toggle("is-playing", playing);
        const action = card.querySelector(".hub-saved-playlist-art-action"); if (!action || !snapshot) continue;
        action.title = playing ? `Pause ${snapshot.name}` : `Play ${snapshot.name}`; action.setAttribute("aria-label", action.title);
        action.replaceChildren(createButtonIcon(playing ? "icon-pause.svg" : "icon-play.svg"));
      }
    };
r.$createPlaylistArtworkMosaic = items => createPlaylistArtwork(items);
r.$renderSavedPlaylistDetail = function renderSavedPlaylistDetail(snapshot) {
      const toolbar = createElement("div", "hub-saved-cart-detail-toolbar hub-saved-playlist-detail-toolbar");
      const returnToSavedPlaylists = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!runtimeState.selectedSavedPlaylistId) return;
        runtimeState.selectedSavedPlaylistId = "";
        runtimeState.playlistView = "saved";
        runtimeSaveState();
        r.$render();
      };
      const back = createPanelBackButton("Back to playlists", returnToSavedPlaylists, "hub-saved-playlist-back");
      back.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        returnToSavedPlaylists(event);
      }, true);
      const title = createElement("h2", "hub-saved-playlist-detail-title", snapshot.name);
      toolbar.append(title);
      r.$content.append(toolbar);

      const actionRow = createElement("div", "hub-panel-secondary-nav hub-cart-backup hub-playlist-toolbar hub-saved-playlist-action-row");
      const duration = snapshot.items.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
      const context = createElement("div", "hub-panel-back-context");
      context.append(
        back,
        createElement(
          "div",
          "hub-cart-backup-time",
          `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"} · ${formatDuration(duration)}`
        )
      );
      actionRow.append(
        context,
        r.$createSavedPlaylistActions(snapshot, { includeDownload: true, includeShufflePlay: true, includeAdd: false })
      );
      r.$content.append(actionRow);

      const list = createElement("div", "hub-stack hub-saved-playlist-track-list");
      snapshot.items.forEach((item, index) => {
        const row = r.$renderPlaylistTrack(item, index, {
          transient: true, pageQueue: false, position: index + 1,
          onActivate: () => r.$playSavedPlaylist(snapshot, { startIndex: index }),
          createActions: (card) => r.$createNowPlayingTrackActions(card, item, {
            includeRemove: true,
            menuView: "saved-playlist",
            onRemove: () => r.$removeSavedPlaylistItem(snapshot, item)
          })
        });
        row.classList.add("hub-queue-item", "hub-saved-playlist-track");
        r.$bindPlaylistCardReordering(row, item, index, snapshot.items, (fromIndex, toIndex) => r.$moveSavedPlaylistItem(snapshot, fromIndex, toIndex));
        list.append(row);
      });
      r.$content.append(list);
      if (!snapshot.items.length) r.$content.append(createPanelEmptyState("This playlist is empty. Use any ＋ menu to add tracks to it."));
    };
r.$renderSavedPlaylists = function renderSavedPlaylists() {
      if (!runtimeState.savedPlaylists.length) {
        r.$content.append(createPanelEmptyState("Create a playlist from any track’s ＋ menu, or save the current Now Playing list."));
        return;
      }
      const stack = createElement("div", "hub-stack hub-saved-playlist-stack");
      for (const snapshot of runtimeState.savedPlaylists) {
        const duration = snapshot.items.reduce((total, item) => total + (Number(item.duration) || 0), 0);
        const isActivePlaylist = r.$savedPlaylistMatchesCurrentQueue(snapshot);
        const isPlayingPlaylist = isActivePlaylist && runtimeSeamless.isPlaying;
        const card = createSavedCollectionCard({
          title: snapshot.name, total: formatDuration(duration),
          summary: `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"}`,
          artwork: r.$createPlaylistArtworkMosaic(snapshot.items),
          ariaLabel: `Open playlist ${snapshot.name}`, playing: isPlayingPlaylist,
          onOpen: () => {
            runtimeState.selectedSavedPlaylistId = snapshot.id;
            runtimeSaveState(); r.$saveLayoutState();
            r.$render();
          }
        });
        card.dataset.savedPlaylistId = snapshot.id;
        const play = createElement("button", "hub-saved-playlist-art-action");
        play.type = "button";
        play.title = isPlayingPlaylist ? `Pause ${snapshot.name}` : `Play ${snapshot.name}`;
        play.setAttribute("aria-label", play.title);
        play.disabled = !snapshot.items.length;
        play.append(createButtonIcon(isPlayingPlaylist ? "icon-pause.svg" : "icon-play.svg"));
        play.addEventListener("click", (event) => {
          event.stopPropagation();
          if (r.$savedPlaylistMatchesCurrentQueue(snapshot)) void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE);
          else void r.$playSavedPlaylist(snapshot);
        });
        card.append(play);
        stack.append(card);
      }
      r.$content.append(stack);
    };
r.$renderPlaylist = function renderPlaylist() {
      if (!["current", "saved"].includes(runtimeState.playlistView)) runtimeState.playlistView = "current";
      const selected = runtimeState.savedPlaylists.find((entry) => entry.id === runtimeState.selectedSavedPlaylistId);
      if (!selected) runtimeState.selectedSavedPlaylistId = null;
      if (selected && runtimeState.playlistView === "saved") {
        r.$renderSavedPlaylistDetail(selected);
        r.$mountPanelClose();
        return;
      }
      r.$renderPlaylistViewTabs();
      if (runtimeState.playlistView === "current") {
        r.$renderCurrentPlaylist();
      } else {
        const importRow = createElement("div", "hub-cart-backup hub-playlist-import-row");
        const playlistCount = runtimeState.savedPlaylists.length;
        importRow.append(createElement(
          "div",
          "hub-cart-backup-time hub-panel-count-summary",
          `${playlistCount} playlist${playlistCount === 1 ? "" : "s"}`
        ));
        const actions = createElement("div", "hub-toolbar");
        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = ".html,.htm,.json,text/html,application/json";
        importInput.hidden = true;
        const importButton = r.$createPlaylistToolbarButton("Import playlist", "icon-import.svg", () => importInput.click());
        importButton.classList.add("hub-playlist-import-button");
        importInput.addEventListener("change", () => {
          const file = importInput.files?.[0];
          importInput.value = "";
          void r.$importPlaylist(file, importButton);
        });
        const createButton = r.$createPlaylistToolbarButton("New playlist", "icon-plus.svg", r.$createEmptySavedPlaylist);
        createButton.classList.add("hub-create-playlist-button");
        actions.append(createButton, importButton, importInput);
        importRow.append(actions);
        r.$content.append(importRow);
        r.$renderSavedPlaylists();
      }
      r.$mountPanelClose();
    };
}
export const registerCollectionViews = [registerCollectionViews1, registerCollectionViews2, registerCollectionViews3, registerCollectionViews4, registerCollectionViews5, registerCollectionViews6];
