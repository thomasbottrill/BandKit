import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { asset, createArt, createButtonIcon, createElement, formatCartPrice, formatDuration, resolveImage } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";

export function playlistAlbumLabel(item) {
  const artist = String(item?.artist || "").trim();
  const title = String(item?.title || "").trim();
  let album = String(item?.album || "").trim();
  if (!album) return "";
  if (artist) {
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
r.$renderCartViewTabs = function renderCartViewTabs(metaText) {
      const header = createElement("div", "hub-cart-view-header");
      const tabs = createElement("div", "hub-cart-view-tabs");
      tabs.setAttribute("role", "tablist");
      for (const tab of [
        { id: "current", label: "Cart" },
        { id: "saved", label: "Saved" }
      ]) {
        const button = createElement("button", `hub-cart-view-tab${runtimeState.cartView === tab.id ? " is-active" : ""}`);
        button.type = "button";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(runtimeState.cartView === tab.id));
        button.textContent = tab.label;
        button.addEventListener("click", () => {
          runtimeState.cartView = tab.id;
          runtimeState.selectedSavedCartId = null;
          runtimeSaveState();
          r.$render();
        });
        tabs.append(button);
      }
      header.append(tabs, createElement("span", "hub-cart-view-meta", metaText));
      r.$content.append(header);
    };
r.$renderPlaylistViewTabs = function renderPlaylistViewTabs(metaText) {
      const header = createElement("div", "hub-cart-view-header hub-playlist-view-header");
      const viewTabs = createElement("div", "hub-cart-view-tabs hub-playlist-view-tabs");
      viewTabs.setAttribute("role", "tablist");
      viewTabs.setAttribute("aria-label", "Now Playing and playlists views");
      for (const view of [
        { id: "current", label: "Now Playing" },
        { id: "saved", label: "Playlists" }
      ]) {
        const button = createElement("button", `hub-cart-view-tab hub-playlist-view-tab${runtimeState.playlistView === view.id ? " is-active" : ""}`);
        button.type = "button";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(runtimeState.playlistView === view.id));
        button.textContent = view.label;
        button.addEventListener("click", () => {
          runtimeState.playlistView = view.id;
          runtimeState.selectedSavedPlaylistId = null;
          runtimeSaveState();
          r.$render();
        });
        viewTabs.append(button);
      }
      header.append(viewTabs, createElement("span", "hub-cart-view-meta", metaText));
      r.$content.append(header);
    };
r.$cartTotalLabel = function cartTotalLabel(items, summary = null) {
      if (Number.isFinite(Number(summary?.subtotal)) && summary?.currency) {
        return formatCartPrice(summary.subtotal, summary.currency);
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
      const card = createElement("article", "hub-card");
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
      const metaRow = createElement("div", "hub-row-title");
      metaRow.style.marginTop = "8px";
      metaRow.append(createElement("span", "hub-meta", item.kind));
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
      const savedText = runtimeState.cartSavedAt
        ? `${itemCount} · Auto-saved ${new Date(runtimeState.cartSavedAt).toLocaleString()}`
        : `${itemCount} · Not captured yet`;
      backup.append(createElement("div", "hub-cart-backup-time", savedText));
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

      const stack = createElement("div", "hub-stack");
      for (const item of runtimeState.cart) {
        stack.append(r.$renderCartItemCard(item, { removable: true }));
      }
      r.$content.append(stack);
      if (!runtimeState.cart.length) r.$content.append(createElement("div", "hub-empty", "Your cart is empty. Bandkit will save items here when it finds them on a Bandcamp page."));

      const checkout = createElement("button", "hub-primary-button", "Checkout");
      checkout.type = "button";
      checkout.style.marginTop = "12px";
      checkout.disabled = !runtimeState.cart.length;
      checkout.addEventListener("click", r.$openBandcampCheckout);
      r.$content.append(checkout);
    };
r.$openSavedCart = function openSavedCart(snapshot) {
      runtimeState.selectedSavedCartId = snapshot.id;
      runtimeSaveState();
      r.$render();
    };
}

function registerCollectionViews2(r) {
r.$createSavedCartOpenButton = function createSavedCartOpenButton(snapshot) {
      const button = createElement("button", "hub-saved-playlist-play-button hub-saved-cart-open-button");
      button.type = "button";
      button.title = `Open ${snapshot.name || "saved cart"}`;
      button.setAttribute("aria-label", button.title);
      button.append(createButtonIcon("icon-open.svg"), document.createTextNode("Open"));
      button.addEventListener("click", () => r.$openSavedCart(snapshot));
      return button;
    };
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
        r.$content.append(createElement("div", "hub-empty", "No saved carts yet. Create an empty cart now, or Bandkit will auto-save your current cart when it captures one."));
        return;
      }
      const stack = createElement("div", "hub-stack hub-saved-cart-stack");
      for (const snapshot of runtimeState.savedCarts) {
        const items = Array.isArray(snapshot.items) ? snapshot.items : [];
        const card = createElement("article", "hub-card hub-saved-cart-card hub-saved-playlist-card");
        const body = createElement("button", "hub-saved-cart-body hub-saved-playlist-open");
        body.type = "button";
        body.setAttribute("aria-label", `Open saved cart ${snapshot.name || "Saved cart"}`);
        body.addEventListener("click", () => r.$openSavedCart(snapshot));
        const titleRow = createElement("div", "hub-row-title");
        titleRow.append(createElement("strong", "", snapshot.name || "Saved cart"), createElement("span", "hub-saved-cart-total", r.$cartTotalLabel(items, snapshot.summary)));
        const savedAt = snapshot.savedAt ? new Date(snapshot.savedAt) : null;
        const validDate = savedAt && !Number.isNaN(savedAt.getTime());
        const bodyCopy = createElement("div", "hub-saved-playlist-card-copy");
        bodyCopy.append(
          titleRow,
          createElement("div", "hub-saved-cart-date", `${snapshot.autoSaved ? "Auto-saved · " : ""}${validDate ? savedAt.toLocaleString() : "Saved locally"}`),
          createElement("div", "hub-saved-cart-summary", `${items.length} item${items.length === 1 ? "" : "s"}${items.length ? ` · ${items.slice(0, 3).map((item) => item.title).join(", ")}${items.length > 3 ? ` +${items.length - 3} more` : ""}` : ""}`)
        );
        body.append(r.$createPlaylistArtworkMosaic(items.map((item) => ({ ...item, art: r.$cartItemArt(item) }))), bodyCopy);
        const footer = createElement("div", "hub-card-footer hub-saved-cart-actions");
        footer.append(r.$createSavedCartOpenButton(snapshot), r.$createSavedCartActions(snapshot));
        card.append(body, footer);
        stack.append(card);
      }
      r.$content.append(stack);
    };
r.$renderSavedCartDetail = function renderSavedCartDetail(snapshot) {
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const toolbar = createElement("div", "hub-saved-cart-detail-toolbar hub-saved-playlist-detail-toolbar");
      const back = createElement("button", "hub-saved-playlist-back hub-saved-cart-back");
      back.type = "button";
      back.title = "Back to saved carts";
      back.setAttribute("aria-label", "Back to saved carts");
      back.append(createButtonIcon("icon-back.svg"));
      const returnToSavedCarts = (event) => {
        event.preventDefault();
        event.stopPropagation();
        runtimeState.selectedSavedCartId = null;
        runtimeSaveState();
        r.$render();
      };
      back.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        returnToSavedCarts(event);
      }, true);
      back.addEventListener("click", returnToSavedCarts);
      toolbar.append(back, createElement("h2", "hub-saved-playlist-detail-title", snapshot.name || "Saved cart"));
      r.$content.append(toolbar);

      const actionRow = createElement("div", "hub-cart-backup hub-playlist-toolbar hub-saved-playlist-action-row hub-saved-cart-detail-action-row");
      actionRow.append(
        createElement("div", "hub-cart-backup-time", `${items.length} item${items.length === 1 ? "" : "s"} · ${r.$cartTotalLabel(items, snapshot.summary)}`),
        r.$createSavedCartActions(snapshot)
      );
      r.$content.append(actionRow);

      const stack = createElement("div", "hub-stack");
      for (const item of items) stack.append(r.$renderCartItemCard(item, {
        savedCart: r.$cartAutosave.isAutoSavedCart(snapshot) ? null : snapshot
      }));
      r.$content.append(stack);
      if (!items.length) r.$content.append(createElement("div", "hub-empty", "This saved cart has no items."));
    };
r.$renderCart = function renderCart() {
      if (!['current', 'saved'].includes(runtimeState.cartView)) runtimeState.cartView = "current";
      const snapshot = runtimeState.savedCarts.find((entry) => entry.id === runtimeState.selectedSavedCartId);
      if (!snapshot) runtimeState.selectedSavedCartId = null;
      if (snapshot && runtimeState.cartView === "saved") {
        r.$renderSavedCartDetail(snapshot);
        return;
      }
      const total = runtimeState.cartView === "current" ? r.$cartTotalLabel(runtimeState.cart, runtimeState.cartSummary) : runtimeState.savedCarts.length;
      r.$renderCartViewTabs(runtimeState.cartView === "current" ? `Total: ${total}` : `${total} saved`);
      if (runtimeState.cartView === "current") r.$renderCurrentCart();
      else r.$renderSavedCartList();
    };
r.$movePlaylistItem = function movePlaylistItem(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= runtimeState.playlist.length || toIndex >= runtimeState.playlist.length) return;
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
r.$formatPlaylistBpm = function formatPlaylistBpm(value) {
      const bpm = r.$normalizePlaylistBpm(value);
      return bpm ? `${Number.isInteger(bpm) ? bpm : bpm.toFixed(1)} BPM` : "";
    };
r.$createPlaylistAnalysisMeta = function createPlaylistAnalysisMeta(item) {
      if (runtimeState.recordPlaylistMetadata === false) return null;
      const bpm = r.$formatPlaylistBpm(item.bpm);
      const key = r.$normalizePlaylistKey(item.key);
      if (!bpm && !key) return null;
      const meta = createElement("div", "hub-playlist-analysis");
      const accessibleParts = [];
      if (bpm) {
        meta.append(createElement("span", "hub-playlist-analysis-chip is-bpm", bpm));
        accessibleParts.push(bpm);
      }
      if (key) {
        const keyLabel = [key.camelot, key.shortName].filter(Boolean).join(" · ") || key.name;
        const chip = createElement("span", "hub-playlist-analysis-chip is-key", keyLabel);
        if (key.name) chip.title = key.name;
        meta.append(chip);
        accessibleParts.push(key.name || keyLabel);
      }
      meta.setAttribute("aria-label", `Track analysis: ${accessibleParts.join(", ")}`);
      return meta;
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
r.$renderPlaylistTrack = function renderPlaylistTrack(item, index) {
      const isCurrentPlaylistTrack = r.$activePlaylistItemId() === item.playlistItemId;
      const isCurrentLoading = isCurrentPlaylistTrack
        && r.$pendingPlaylistItemId === item.playlistItemId
        && !r.$playlistItemMatchesActiveTrack(item);
      const isCurrentPlaying = isCurrentPlaylistTrack && !isCurrentLoading && Boolean(runtimeSeamless.isPlaying);
      const card = createElement("article", `hub-card hub-playlist-track${isCurrentPlaylistTrack ? " is-playing" : ""}${isCurrentPlaying ? " is-actively-playing" : ""}`);
      r.$bindPlaylistCardReordering(card, item, index, runtimeState.playlist, r.$movePlaylistItem);
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
      const mediaIcon = createElement("span", "hub-playlist-media-icon");
      mediaIcon.append(createButtonIcon(isCurrentPlaying ? "icon-pause.svg" : "icon-play.svg"));
      mediaToggle.append(artwork, mediaIcon);
      const activateMediaPlayback = () => {
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
      const details = [playlistAlbumLabel(item), item.duration ? formatDuration(item.duration) : "", item.restoreError].filter(Boolean).join(" · ");
      if (details) detailRow.append(createElement("span", `hub-playlist-meta${item.restoreError ? " is-error" : ""}`, details));
      const analysisMeta = r.$createPlaylistAnalysisMeta(item);
      if (analysisMeta) detailRow.append(analysisMeta);
      if (detailRow.childElementCount) copy.append(detailRow);

      const actions = r.$createNowPlayingTrackActions(card, item);
      card.append(mediaToggle, copy, actions);
      return card;
    };
r.$createPlaylistToolbarButton = function createPlaylistToolbarButton(label, icon, onClick, { addPage = false } = {}) {
      const button = createElement("button", `hub-playlist-toolbar-icon${addPage ? " is-add-page" : ""}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      const iconElement = createElement("span", "hub-button-icon");
      iconElement.style.setProperty("--hub-icon", `url('${asset(icon)}')`);
      button.append(iconElement);
      if (addPage) {
        const badge = createElement("span", "hub-add-page-badge");
        badge.style.setProperty("--hub-icon", `url('${asset("icon-plus.svg")}')`);
        button.append(badge);
      }
      button.addEventListener("click", onClick);
      return button;
    };
r.$createToolbarMenuAction = function createToolbarMenuAction(label, icon, onClick, { disabled = false, danger = false } = {}) {
      const button = createElement("button", `hub-toolbar-menu-action${danger ? " is-danger" : ""}`);
      button.type = "button";
      button.disabled = disabled;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("role", "menuitem");
      button.append(createButtonIcon(icon), createElement("span", "", label));
      button.addEventListener("click", onClick);
      return button;
    };
r.$createToolbarOverflow = function createToolbarOverflow(label, actionButtons, { menuLabel = label, className = "" } = {}) {
      const wrapper = createElement("div", `hub-toolbar-overflow${className ? ` ${className}` : ""}`);
      const menu = createElement("div", "hub-toolbar-actions-menu");
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", menuLabel);
      menu.append(...actionButtons);

      const closeMenu = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      };
      const trigger = r.$createPlaylistToolbarButton(label, "icon-more.svg", () => {
        const opening = menu.hidden;
        menu.hidden = !opening;
        trigger.setAttribute("aria-expanded", String(opening));
        if (opening) window.setTimeout(() => menu.querySelector("button:not(:disabled)")?.focus(), 0);
      });
      trigger.classList.add("hub-toolbar-more-button");
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.disabled = actionButtons.every((button) => button.disabled);

      menu.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button:not(:disabled)")) closeMenu();
      });
      wrapper.addEventListener("focusout", () => window.setTimeout(() => {
        if (!wrapper.contains(r.$shadow.activeElement)) closeMenu();
      }, 0));
      wrapper.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        closeMenu();
        trigger.focus();
      });
      wrapper.append(trigger, menu);
      return wrapper;
    };
}

function registerCollectionViews5(r) {
r.$renderPageQueueFallback = function renderPageQueueFallback() {
      const pageQueueSignature = `${runtimeLive.pageUrl}|${runtimeLive.title}`;
      if (r.$clearedPageQueueSignature && r.$clearedPageQueueSignature === pageQueueSignature) {
        r.$content.append(createElement("div", "hub-empty", "Now Playing is clear. Use the ＋ buttons to add tracks."));
        return;
      }
      if (!runtimeLive.hasPlaybackStarted || !runtimeLive.title) {
        r.$content.append(createElement("div", "hub-empty", "Play a Bandcamp track or use the ＋ buttons to build your queue."));
        return;
      }
      const activeTrack = runtimeSeamless.enabled && runtimeSeamless.track ? runtimeSeamless.track : null;
      const queue = [activeTrack, ...runtimeLive.tracks]
        .filter(Boolean)
        .filter((track, index, items) => items.findIndex((candidate) => Boolean(r.$matchingQueueTrack([candidate], track))) === index)
        .slice(0, 20);
      if (!queue.length) {
        r.$content.append(createElement("div", "hub-empty", runtimeLive.available ? "Nothing else in the current page queue." : "Play something on this page to connect the queue."));
        return;
      }
      const list = createElement("div", "hub-queue-list hub-playlist-page-queue");
      queue.forEach((track, index) => {
        const item = createElement("div", "hub-card hub-queue-item");
        const isActiveTrack = Boolean(activeTrack && r.$matchingQueueTrack([activeTrack], track));
        const number = createElement("div", "hub-queue-number", isActiveTrack ? "" : String(index + 1));
        if (isActiveTrack) {
          const playingIcon = createButtonIcon(runtimeSeamless.isPlaying ? "icon-pause.svg" : "icon-play.svg");
          playingIcon.classList.add("hub-playing-icon");
          number.append(playingIcon);
        }
        item.append(number);
        const artLink = r.$createPageLink("", track.pageUrl, "hub-art-link hub-queue-art-link");
        artLink.setAttribute("aria-label", `Open ${track.title}`);
        if (track.art) artLink.append(createArt(track.art, true));
        else {
          const placeholder = createElement("span", "hub-queue-art-placeholder");
          placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
          artLink.append(placeholder);
        }
        const copy = createElement("div", "hub-track-copy");
        copy.append(
          r.$createPageLink(track.title, track.pageUrl, "hub-track-title hub-inline-link"),
          r.$createPageLink(track.artist, track.artistUrl || track.pageUrl, "hub-track-artist hub-inline-link")
        );
        const trackActions = r.$createTrackActionControls(track);
        if (isActiveTrack) {
          const toggle = createElement("button", "hub-queue-action hub-current-track-toggle");
          toggle.type = "button";
          toggle.title = runtimeSeamless.isPlaying ? `Pause ${track.title}` : `Resume ${track.title}`;
          toggle.setAttribute("aria-label", toggle.title);
          toggle.append(createButtonIcon(runtimeSeamless.isPlaying ? "icon-pause.svg" : "icon-play.svg"));
          toggle.addEventListener("click", () => void r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_PAUSE));
          trackActions.prepend(toggle);
        }
        item.append(artLink, copy, trackActions);
        list.append(item);
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
        "hub-cart-backup-time",
        `${songCount} song${songCount === 1 ? "" : "s"} in Now Playing`
      ));
      const actions = createElement("div", "hub-toolbar");
      const addPage = r.$createPlaylistToolbarButton("Add page to queue", "icon-queue.svg", () => {
        if (!pageTracks.length) r.$showToast("This page does not expose a streamable track list.");
        else r.$addTracksToPlaylist(pageTracks);
      }, { addPage: true });
      addPage.hidden = !pageTracks.length;

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
        if (!window.confirm("Clear Now Playing? Your saved playlists will not be affected.")) return;
        await r.$clearNowPlayingPlayback();
      }, {
        disabled: !runtimeState.playlist.length && !toolbarItems.length && !runtimeLive.hasPlaybackStarted,
        danger: true
      });
      const moreWrap = r.$createToolbarOverflow("More Now Playing actions", [save, download, share, clear], {
        menuLabel: "Now Playing actions",
        className: "hub-now-playing-overflow"
      });
      actions.append(addPage, moreWrap);
      actions.hidden = addPage.hidden && moreWrap.querySelector(".hub-toolbar-more-button")?.disabled;
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
      const button = createElement("button", `hub-saved-playlist-icon-button${className ? ` ${className}` : ""}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      const glyph = createElement("span", "hub-button-icon");
      glyph.style.setProperty("--hub-icon", `url('${asset(icon)}')`);
      button.append(glyph);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void onClick();
      });
      return button;
    };
r.$createSavedPlaylistActions = function createSavedPlaylistActions(snapshot, { includeDownload = false, includePlay = true, includeRestoreCart = false } = {}) {
      const actions = createElement("div", "hub-saved-playlist-icon-actions");
      if (includePlay) {
        const play = r.$createSavedItemActionButton(`Play ${snapshot.name}`, "icon-play.svg", () => {
          r.$restoreSavedPlaylist(snapshot, "replace", { syncPlayback: false });
          void r.$playPlaylistAt(0, { forceRefresh: true });
        });
        play.disabled = !snapshot.items.length;
        actions.append(play);
      }
      const addToPlaying = r.$createSavedItemActionButton(`Add ${snapshot.name} to Now Playing`, "icon-plus.svg", () => r.$restoreSavedPlaylist(snapshot, "append"));
      addToPlaying.disabled = !snapshot.items.length;
      actions.append(
        addToPlaying,
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
r.$createSavedPlaylistPlayButton = function createSavedPlaylistPlayButton(snapshot) {
      const button = createElement("button", "hub-saved-playlist-play-button");
      button.type = "button";
      button.title = `Play ${snapshot.name}`;
      button.setAttribute("aria-label", button.title);
      button.disabled = !snapshot.items.length;
      button.append(createButtonIcon("icon-play.svg"), document.createTextNode("Play"));
      button.addEventListener("click", () => {
        r.$restoreSavedPlaylist(snapshot, "replace", { syncPlayback: false });
        void r.$playPlaylistAt(0, { forceRefresh: true });
      });
      return button;
    };
}

function registerCollectionViews6(r) {
r.$createPlaylistArtworkMosaic = function createPlaylistArtworkMosaic(items) {
      const mosaic = createElement("div", "hub-playlist-mosaic");
      const artwork = [];
      const seen = new Set();
      for (const item of items || []) {
        const imageUrl = resolveImage(item.art);
        if (!imageUrl || seen.has(imageUrl)) continue;
        seen.add(imageUrl);
        artwork.push(imageUrl);
        if (artwork.length === 4) break;
      }
      mosaic.classList.add(`has-${artwork.length || 0}`);
      if (!artwork.length) {
        const placeholder = createElement("span", "hub-playlist-mosaic-placeholder");
        placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
        mosaic.append(placeholder);
        return mosaic;
      }
      for (const imageUrl of artwork) {
        const image = createElement("img", "hub-playlist-mosaic-image");
        image.src = imageUrl;
        image.alt = "";
        mosaic.append(image);
      }
      return mosaic;
    };
r.$renderSavedPlaylistDetail = function renderSavedPlaylistDetail(snapshot) {
      const toolbar = createElement("div", "hub-saved-cart-detail-toolbar hub-saved-playlist-detail-toolbar");
      const back = createElement("button", "hub-saved-playlist-back");
      back.type = "button";
      back.title = "Back to playlists";
      back.setAttribute("aria-label", "Back to playlists");
      const backIcon = createElement("span", "hub-button-icon");
      backIcon.style.setProperty("--hub-icon", `url('${asset("icon-back.svg")}')`);
      back.append(backIcon);
      const returnToSavedPlaylists = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!runtimeState.selectedSavedPlaylistId) return;
        runtimeState.selectedSavedPlaylistId = "";
        runtimeState.playlistView = "saved";
        runtimeSaveState();
        r.$render();
      };
      back.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        returnToSavedPlaylists(event);
      }, true);
      back.addEventListener("click", returnToSavedPlaylists);
      const title = createElement("h2", "hub-saved-playlist-detail-title", snapshot.name);
      toolbar.append(back, title);
      r.$content.append(toolbar);

      const actionRow = createElement("div", "hub-cart-backup hub-playlist-toolbar hub-saved-playlist-action-row");
      const duration = snapshot.items.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
      actionRow.append(
        createElement(
          "div",
          "hub-cart-backup-time",
          `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"} · ${formatDuration(duration)}`
        ),
        r.$createSavedPlaylistActions(snapshot, { includeDownload: true })
      );
      r.$content.append(actionRow);

      const list = createElement("div", "hub-stack hub-saved-playlist-track-list");
      snapshot.items.forEach((item, index) => {
        const row = createElement("article", "hub-card hub-queue-item hub-playlist-track hub-saved-playlist-track");
        r.$bindPlaylistCardReordering(row, item, index, snapshot.items, (fromIndex, toIndex) => r.$moveSavedPlaylistItem(snapshot, fromIndex, toIndex));
        row.append(createElement("div", "hub-queue-number", String(index + 1)));
        const artwork = createElement("div", "hub-art-link hub-queue-art-link hub-playlist-drag-art");
        if (item.art) artwork.append(createArt(item.art, true));
        else {
          const placeholder = createElement("span", "hub-queue-art-placeholder");
          placeholder.style.setProperty("--hub-icon", `url('${asset("icon-queue.svg")}')`);
          artwork.append(placeholder);
        }
        const trackCopy = createElement("div", "hub-track-copy");
        trackCopy.append(
          r.$createPageLink(item.title, item.pageUrl, "hub-track-title hub-inline-link"),
          r.$createPageLink(item.artist, item.artistUrl || item.pageUrl, "hub-track-artist hub-inline-link")
        );
        const analysisMeta = r.$createPlaylistAnalysisMeta(item);
        if (analysisMeta) trackCopy.append(analysisMeta);
        const trackActions = r.$createTrackActionControls(item);
        const remove = createElement("button", "hub-queue-action hub-saved-playlist-track-remove");
        remove.type = "button";
        remove.title = `Remove ${item.title} from ${snapshot.name}`;
        remove.setAttribute("aria-label", remove.title);
        remove.append(createButtonIcon("icon-close.svg"));
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          r.$removeSavedPlaylistItem(snapshot, item);
        });
        trackActions.append(remove);
        row.append(artwork, trackCopy, trackActions);
        list.append(row);
      });
      r.$content.append(list);
      if (!snapshot.items.length) r.$content.append(createElement("div", "hub-empty", "This playlist is empty. Use any ＋ menu to add tracks to it."));
    };
r.$renderSavedPlaylists = function renderSavedPlaylists() {
      if (!runtimeState.savedPlaylists.length) {
        r.$content.append(createElement("div", "hub-empty", "Create a playlist from any track’s ＋ menu, or save the current Now Playing list."));
        return;
      }
      const stack = createElement("div", "hub-stack hub-saved-playlist-stack");
      for (const snapshot of runtimeState.savedPlaylists) {
        const duration = snapshot.items.reduce((total, item) => total + (Number(item.duration) || 0), 0);
        const card = createElement("article", "hub-card hub-saved-cart-card hub-saved-playlist-card");
        const body = createElement("button", "hub-saved-cart-body hub-saved-playlist-open");
        body.type = "button";
        body.setAttribute("aria-label", `Open playlist ${snapshot.name}`);
        body.addEventListener("click", () => {
          runtimeState.selectedSavedPlaylistId = snapshot.id;
          runtimeSaveState();
          r.$render();
        });
        const titleRow = createElement("div", "hub-row-title");
        titleRow.append(createElement("strong", "", snapshot.name), createElement("span", "hub-saved-cart-total", formatDuration(duration)));
        const savedAt = new Date(snapshot.savedAt);
        const bodyCopy = createElement("div", "hub-saved-playlist-card-copy");
        bodyCopy.append(
          titleRow,
          createElement("div", "hub-saved-cart-date", Number.isNaN(savedAt.getTime()) ? "Saved locally" : savedAt.toLocaleString()),
          createElement("div", "hub-saved-cart-summary", `${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"}${snapshot.items.length ? ` · ${snapshot.items.slice(0, 3).map((item) => item.title).join(", ")}${snapshot.items.length > 3 ? ` +${snapshot.items.length - 3} more` : ""}` : ""}`)
        );
        body.append(r.$createPlaylistArtworkMosaic(snapshot.items), bodyCopy);
        const footer = createElement("div", "hub-card-footer hub-saved-cart-actions");
        footer.append(
          r.$createSavedPlaylistPlayButton(snapshot),
          r.$createSavedPlaylistActions(snapshot, { includePlay: false, includeRestoreCart: true })
        );
        card.append(body, footer);
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
      const currentCount = runtimeState.playlist.length
        || (runtimeLive.hasPlaybackStarted ? r.$buildSeamlessQueue().length : 0);
      r.$renderPlaylistViewTabs(runtimeState.playlistView === "current"
        ? `${currentCount} song${currentCount === 1 ? "" : "s"}`
        : `${runtimeState.savedPlaylists.length} saved`);
      if (runtimeState.playlistView === "current") {
        r.$renderCurrentPlaylist();
      } else {
        const importRow = createElement("div", "hub-cart-backup hub-playlist-import-row");
        importRow.append(createElement("div", "hub-cart-backup-time", "Import a downloaded Bandkit playlist"));
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

export const setupCollectionViews = [];
