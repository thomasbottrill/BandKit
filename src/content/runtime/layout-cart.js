import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { asset, createButtonIcon, createElement, escapeHtml, formatCartPrice, portableBandcampUrl, resolvedTrackPageUrl, safeBandcampUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { parseCartBackup, portableCartItem } from "../cart-model.js";

function registerLayoutCart1(r) {
r.$applyAppearance = function applyAppearance() {
      if (!r.$modernReleasePalette && r.$modernBandcampPageType()) {
        r.$modernReleasePalette = r.$captureModernReleasePalette();
      }
      r.$applyBandcampPageTheme();
      r.$applyShadowHeaderTheme();
      r.$applyModernReleaseLayout();
      if (runtimeState.appearance.pageAware) r.$updateThemeFromPage();
      else r.$applySelectedTheme();
      r.$applyNativeCartVisibility();
      r.$applyNativePlayerVisibility();
      r.$ensurePagePlayerWaveforms();
    };
r.$applyNativeCartVisibility = function applyNativeCartVisibility() {
      r.$ensurePageStyles();
      const hidePageCart = Boolean(runtimeState.appearance.hidePageCart);
      const hideHeaderCart = Boolean(runtimeState.appearance.hideHeaderCart);
      document.documentElement.dataset.bandkitHidePageCart = String(hidePageCart);
      document.documentElement.dataset.bandkitHideHeaderCart = String(hideHeaderCart);
      for (const nativeCart of document.querySelectorAll("[data-bandkit-native-cart]")) {
        nativeCart.toggleAttribute("hidden", hideHeaderCart);
      }
      for (const wrapper of document.querySelectorAll("[data-bandkit-native-cart-wrapper]")) {
        wrapper.toggleAttribute("hidden", hideHeaderCart);
      }
      r.$applyShadowHeaderCartVisibility(hideHeaderCart);
    };
r.$setShadowCartElementVisibility = function setShadowCartElementVisibility(element, hidden) {
      if (!element) return;
      if (!element.hasAttribute("data-bandkit-display-captured")) {
        element.setAttribute("data-bandkit-display-captured", "true");
        element.dataset.bandkitDisplayValue = element.style.getPropertyValue("display");
        element.dataset.bandkitDisplayPriority = element.style.getPropertyPriority("display");
      }
      element.toggleAttribute("hidden", hidden);
      if (hidden) {
        element.style.setProperty("display", "none", "important");
        return;
      }
      const value = element.dataset.bandkitDisplayValue || "";
      const priority = element.dataset.bandkitDisplayPriority || "";
      if (value) element.style.setProperty("display", value, priority);
      else element.style.removeProperty("display");
    };
r.$applyShadowHeaderCartVisibility = function applyShadowHeaderCartVisibility(hidden) {
      const menuShadow = document.querySelector("menu-bar")?.shadowRoot;
      if (!menuShadow) return;
      let visibilityStyle = menuShadow.querySelector("#bandkit-native-header-cart-style");
      if (!visibilityStyle) {
        visibilityStyle = document.createElement("style");
        visibilityStyle.id = "bandkit-native-header-cart-style";
        menuShadow.append(visibilityStyle);
      }
      visibilityStyle.textContent = hidden
        ? `li.cart,li[data-bandkit-native-cart-wrapper],button[aria-label="Cart"],button[data-bandkit-native-cart]{display:none!important}`
        : "";
      const candidates = menuShadow.querySelectorAll('li.cart, li[data-bandkit-native-cart-wrapper], button[aria-label="Cart"], button[data-bandkit-native-cart]');
      for (const candidate of candidates) r.$setShadowCartElementVisibility(candidate, hidden);
    };
r.$applyNativePlayerVisibility = function applyNativePlayerVisibility() {
      r.$ensurePageStyles();
      document.documentElement.dataset.bandkitHideBandcampPlayer = String(Boolean(runtimeState.appearance.hideBandcampPlayer));
    };
r.$applyLauncherPosition = function applyLauncherPosition() {
      if (r.$launcher.classList.contains("is-header")) {
        r.$launcher.classList.remove("is-floating");
        r.$launcher.style.removeProperty("left");
        r.$launcher.style.removeProperty("right");
        r.$launcher.style.removeProperty("top");
        return;
      }
      r.$launcher.classList.add("is-floating");
      if (!runtimeState.launcherPosition) {
        r.$launcher.style.removeProperty("left");
        r.$launcher.style.removeProperty("right");
        r.$launcher.style.removeProperty("top");
        return;
      }
      const left = Math.max(8, Math.min(window.innerWidth - 50, Number(runtimeState.launcherPosition.left) || 8));
      const top = Math.max(8, Math.min(window.innerHeight - 48, Number(runtimeState.launcherPosition.top) || 8));
      runtimeState.launcherPosition = { left: Math.round(left), top: Math.round(top) };
      r.$launcher.style.left = `${left}px`;
      r.$launcher.style.right = "auto";
      r.$launcher.style.top = `${top}px`;
    };
r.$clearPanelInlineLayout = function clearPanelInlineLayout() {
      for (const property of ["left", "right", "top", "bottom", "width", "height"]) r.$panel.style.removeProperty(property);
    };
r.$applyLayoutMode = function applyLayoutMode() {
      const docked = runtimeState.layoutMode === "docked";
      const dockSide = runtimeState.dockSide === "left" ? "left" : "right";
      r.$panel.classList.toggle("is-docked", docked);
      r.$panel.classList.toggle("is-dock-left", docked && dockSide === "left");
      r.$panel.classList.toggle("is-dock-right", docked && dockSide === "right");
      r.$panelHeader.setAttribute("aria-label", docked ? `Bandkit docked to the ${dockSide}` : "Drag to move Bandkit");
      r.$layoutToggleButton.classList.toggle("is-docked", docked);
      r.$layoutToggleButton.querySelector("img").src = asset(docked ? "icon-floating.svg" : "icon-dock.svg");
      r.$layoutToggleButton.setAttribute("aria-label", docked ? "Return Bandkit to floating mode" : `Dock Bandkit to the ${dockSide}`);
      r.$layoutToggleButton.title = docked ? "Return Bandkit to floating mode" : `Dock Bandkit to the ${dockSide}`;
      r.$syncDockedControls();
      r.$applyLauncherPosition();
      r.$applySavedLayout();
      r.$schedulePlayerSectionGeometry();
    };
r.$toggleLayoutMode = function toggleLayoutMode() {
      runtimeState.layoutMode = runtimeState.layoutMode === "docked" ? "floating" : "docked";
      r.$applyLayoutMode();
      runtimeSaveState();
      r.$saveLayoutState();
      if (runtimeState.activeTab === "settings") r.$render();
      r.$showToast(runtimeState.layoutMode === "docked" ? `Bandkit docked to the ${runtimeState.dockSide}` : "Bandkit returned to floating mode");
    };
r.$applySavedLayout = function applySavedLayout() {
      r.$applyingLayout = true;
      if (r.$panel.classList.contains("is-contextual")) {
        r.$clearPanelInlineLayout();
        requestAnimationFrame(() => {
          r.$applyingLayout = false;
        });
        return;
      }
      if (runtimeState.layoutMode === "docked") {
        r.$clearPanelInlineLayout();
        const dockedWidth = Math.min(Math.max(320, Number(runtimeState.dockedWidth) || 420), Math.max(320, window.innerWidth));
        r.$panel.style.width = `${dockedWidth}px`;
      } else if (!runtimeState.layout) {
        r.$clearPanelInlineLayout();
      } else {
        const width = Math.min(Math.max(320, runtimeState.layout.width), window.innerWidth - 16);
        const height = Math.min(Math.max(520, runtimeState.layout.height), window.innerHeight - 16);
        const left = Math.min(Math.max(8, runtimeState.layout.left), window.innerWidth - width - 8);
        const top = Math.min(Math.max(8, runtimeState.layout.top), window.innerHeight - height - 8);
        r.$panel.style.left = `${left}px`;
        r.$panel.style.right = "auto";
        r.$panel.style.top = `${top}px`;
        r.$panel.style.bottom = "auto";
        r.$panel.style.width = `${width}px`;
        r.$panel.style.height = `${height}px`;
      }
      requestAnimationFrame(() => {
        r.$applyingLayout = false;
      });
    };
r.$capturePanelLayout = function capturePanelLayout() {
      if (r.$applyingLayout || r.$dragging || r.$panel.classList.contains("is-contextual")) return;
      if (runtimeState.layoutMode === "docked") {
        const rect = r.$panel.getBoundingClientRect();
        if (!rect.width) return;
        runtimeState.dockedWidth = Math.round(rect.width);
        window.clearTimeout(r.$layoutSaveTimer);
        r.$layoutSaveTimer = window.setTimeout(() => {
          runtimeSaveState();
          r.$saveLayoutState();
        }, 180);
        return;
      }
      if (!runtimeState.layout && !r.$panel.style.width) return;
      const rect = r.$panel.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      runtimeState.layout = { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
      window.clearTimeout(r.$layoutSaveTimer);
      r.$layoutSaveTimer = window.setTimeout(() => {
        runtimeSaveState();
        r.$saveLayoutState();
      }, 180);
    };
r.$resetPanelLayout = function resetPanelLayout() {
      runtimeState.layout = null;
      runtimeState.dockedWidth = 420;
      runtimeState.launcherPosition = null;
      r.$applyLayoutMode();
      runtimeSaveState();
      r.$saveLayoutState();
      r.$showToast("Bandkit panel and launcher positions reset");
    };
}

function registerLayoutCart2(r) {
r.$syncDockedControls = function syncDockedControls() {
      const docked = runtimeState.layoutMode === "docked";
      const dockSide = runtimeState.dockSide === "left" ? "left" : "right";
      r.$launcher.classList.toggle("is-panel-open", runtimeState.open);
      r.$headerResetButton.classList.toggle("is-dock-close", docked);
      const resetSymbol = r.$headerResetButton.querySelector(".hub-reset-symbol");
      resetSymbol.style.setProperty("--hub-reset-icon", `url('${asset(docked ? "icon-chevron.svg" : "icon-reset.svg")}')`);
      resetSymbol.style.setProperty("--hub-reset-rotation", docked ? (dockSide === "left" ? "90deg" : "-90deg") : "0deg");
      const label = docked ? `Close Bandkit to the ${dockSide}` : "Reset size and position";
      r.$headerResetButton.setAttribute("aria-label", label);
      r.$headerResetButton.title = label;
    };
r.$createCartDocument = function createCartDocument(items = runtimeState.cart, cartName = "Bandcamp cart", summary = runtimeState.cartSummary, { includeRestore = true } = {}) {
      const cartItems = Array.isArray(items) ? items : [];
      const exportedAt = new Date();
      const safeName = String(cartName || "Bandcamp cart").trim().slice(0, 120) || "Bandcamp cart";
      const payload = {
        format: includeRestore ? "bandkit-cart" : "bandkit-cart-share",
        version: 1,
        exportedAt: exportedAt.toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        summary: summary && typeof summary === "object" ? {
          subtotal: Number.isFinite(Number(summary.subtotal)) ? Number(summary.subtotal) : null,
          currency: /^[A-Z]{3}$/.test(summary.currency || "") ? summary.currency : null
        } : null,
        items: cartItems.map((item) => portableCartItem(item, { includeRestore })).filter(Boolean)
      };
      const serializedPayload = JSON.stringify(payload).replaceAll("<", "\\u003c");
      const rows = cartItems.map((item) => {
        const itemUrl = portableBandcampUrl(item.url, true);
        const artistUrl = r.$artistUrlFromPageUrl(itemUrl) || itemUrl;
        const title = itemUrl ? `<a href="${escapeHtml(itemUrl)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
        const artist = item.artist
          ? artistUrl ? `<a href="${escapeHtml(artistUrl)}">${escapeHtml(item.artist)}</a>` : escapeHtml(item.artist)
          : "Unknown artist";
        const chips = [
          item.kind,
          Number(item.price) ? formatCartPrice(item.price, item.currency) : ""
        ].filter(Boolean).map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("");
        return `<article class="item">${r.$collectionArtwork(r.$cartItemArt(item), item.title, itemUrl)}<div><div class="kind">${escapeHtml(item.kind || "Bandcamp release")}</div><h2>${title}</h2><p class="byline">by ${artist}</p>${item.album && item.album !== item.title ? `<p class="album"><strong>Album:</strong> ${escapeHtml(item.album)}</p>` : ""}${chips ? `<div class="chips">${chips}</div>` : ""}</div></article>`;
      }).join("");
      return {
        count: cartItems.length,
        filename: `${r.$shareFileName(safeName, "bandcamp-cart")}.html`,
        title: safeName,
        text: `${cartItems.length} item${cartItems.length === 1 ? "" : "s"} shared from Bandkit`,
        html: r.$sharedCollectionDocument({
          title: safeName,
          eyebrow: "Shared Bandcamp cart",
          summary: `${cartItems.length} item${cartItems.length === 1 ? "" : "s"} · ${r.$cartTotalLabel(cartItems, summary)} · Shared ${exportedAt.toLocaleString()}`,
          rows,
          embeddedPayload: includeRestore ? serializedPayload : "",
          embeddedId: includeRestore ? "bandkit-cart-data" : ""
        })
      };
    };
r.$exportCart = function exportCart(items = runtimeState.cart, cartName = "Bandcamp cart", summary = runtimeState.cartSummary) {
      const documentData = r.$createCartDocument(items, cartName, summary);
      r.$downloadHtmlDocument(documentData, `Downloaded an importable backup with ${documentData.count} item${documentData.count === 1 ? "" : "s"}`);
    };
r.$shareCart = function shareCart(items = runtimeState.cart, cartName = "Bandcamp cart", summary = runtimeState.cartSummary) {
      const documentData = r.$createCartDocument(items, cartName, summary, { includeRestore: false });
      return r.$shareHtmlDocument(documentData, `“${documentData.title}”`);
    };
r.$importAndRestoreCart = async function importAndRestoreCart(file, button) {
      if (!file) return;
      if (!r.$requireDataHome()) return;
      button.disabled = true;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("Cart backups must be smaller than 5 MB.");
        const imported = parseCartBackup(await file.text());
        const fallbackName = String(file.name || "Imported cart").replace(/\.(?:html?|json)$/i, "").replace(/^bandcamp-cart-?/i, "Cart ").trim();
        const saved = r.$cartAutosave.saveNamedCart(runtimeState.savedCarts, imported.items, fallbackName || "Imported cart", {
          id: `cart-import-${Date.now()}`,
          savedAt: imported.savedAt,
          sourcePage: imported.sourcePage,
          summary: imported.summary
        });
        if (!saved.snapshot) {
          if (saved.atCapacity) throw new Error(`You can save up to ${r.$cartAutosave.MAX_SAVED_CARTS} carts. Delete one before importing another.`);
          throw new Error("The imported cart could not be saved.");
        }
        runtimeState.savedCarts = saved.savedCarts;
        runtimeSaveState();
        r.$showToast(`Imported ${imported.items.length} item${imported.items.length === 1 ? "" : "s"}; restoring through Bandcamp…`);
        await r.$restoreSavedCart(imported.items);
      } catch (error) {
        r.$showToast(error?.message || "The cart backup could not be imported.");
      } finally {
        button.disabled = false;
      }
    };
r.$exportActivity = function exportActivity() {
      const exportedAt = new Date();
      const rows = runtimeState.activity.map((item) => {
        const trackUrl = safeBandcampUrl(item.url);
        const artistUrl = safeBandcampUrl(item.artistUrl) || r.$artistUrlFromPageUrl(trackUrl);
        const createdAt = item.createdAt ? new Date(item.createdAt) : null;
        const timestamp = createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.toLocaleString()
          : item.time || "Recorded locally";
        const track = trackUrl
          ? `<a href="${escapeHtml(trackUrl)}" target="_blank" rel="noopener">${escapeHtml(item.title || "Untitled track")}</a>`
          : `<strong>${escapeHtml(item.title || "Untitled track")}</strong>`;
        const artist = artistUrl
          ? `<a href="${escapeHtml(artistUrl)}" target="_blank" rel="noopener">${escapeHtml(item.artist || "Unknown artist")}</a>`
          : escapeHtml(item.artist || "Unknown artist");
        return `
        <li>
          <div class="entry"><span class="action">${escapeHtml(item.action || "activity")}</span> ${track} by ${artist}</div>
          <time${createdAt && !Number.isNaN(createdAt.getTime()) ? ` datetime="${escapeHtml(createdAt.toISOString())}"` : ""}>${escapeHtml(timestamp)}</time>
          ${trackUrl ? `<div class="url"><a href="${escapeHtml(trackUrl)}" target="_blank" rel="noopener">${escapeHtml(trackUrl)}</a></div>` : ""}
        </li>`;
      }).join("");
      const documentText = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bandcamp activity log</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:48px auto;padding:0 24px;color:#17202a;background:#fff}h1{margin-bottom:4px}ol{padding-left:24px}li{margin:0 0 22px;padding-left:6px}.entry{font-size:17px}.action{display:inline-block;border-radius:4px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:700;padding:2px 6px;text-transform:capitalize}time,.url{display:block;color:#64748b;font-size:13px;margin-top:4px}.url a{font-size:12px}a{color:#1687a7;overflow-wrap:anywhere}</style></head><body><h1>Bandcamp activity log</h1><p>Exported by Bandkit on ${escapeHtml(exportedAt.toLocaleString())}. ${runtimeState.activity.length} entr${runtimeState.activity.length === 1 ? "y" : "ies"}.</p><ol>${rows || "<li>No activity had been recorded when this file was created.</li>"}</ol></body></html>`;
      const blobUrl = URL.createObjectURL(new Blob([documentText], { type: "text/html" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `bandcamp-activity-${exportedAt.toISOString().slice(0, 10)}.html`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      r.$showToast(`Downloaded an activity log with ${runtimeState.activity.length} entr${runtimeState.activity.length === 1 ? "y" : "ies"}`);
    };
r.$saveCartSnapshot = function saveCartSnapshot() {
      if (!runtimeState.cart.length) {
        r.$showToast("There is no cart to save yet.");
        return;
      }
      if (!r.$requireDataHome()) return;
      const now = new Date();
      const suggestedName = `Cart — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const name = window.prompt("Name this saved cart", suggestedName)?.trim();
      if (!name) return;
      const result = r.$cartAutosave.saveNamedCart(runtimeState.savedCarts, runtimeState.cart, name, {
        savedAt: now.toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        summary: runtimeState.cartSummary
      });
      if (!result.snapshot) {
        if (result.atCapacity) r.$showToast(`You can save up to ${r.$cartAutosave.MAX_SAVED_CARTS} carts. Delete one before creating another.`);
        return;
      }
      runtimeState.savedCarts = result.savedCarts;
      runtimeSaveState();
      r.$render();
      r.$showToast(`Saved “${name}”`);
    };
r.$createEmptySavedCart = function createEmptySavedCart() {
      if (!r.$requireDataHome()) return null;
      const suggestedName = `Cart ${runtimeState.savedCarts.filter((snapshot) => !r.$cartAutosave.isAutoSavedCart(snapshot)).length + 1}`;
      const name = window.prompt("Name this saved cart", suggestedName)?.trim();
      if (!name) return null;
      const result = r.$cartAutosave.saveNamedCart(runtimeState.savedCarts, [], name, {
        id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        allowEmpty: true
      });
      if (!result.snapshot) {
        if (result.atCapacity) r.$showToast(`You can save up to ${r.$cartAutosave.MAX_SAVED_CARTS} carts. Delete one before creating another.`);
        return null;
      }
      runtimeState.savedCarts = result.savedCarts;
      runtimeState.cartView = "saved";
      runtimeSaveState();
      r.$render();
      r.$showToast(`Created “${result.snapshot.name}”`);
      return result.snapshot;
    };
r.$restoreSavedCart = async function restoreSavedCart(items, { fallbackTrack = null } = {}) {
      const sourceItems = Array.isArray(items) ? items.slice(0, 100) : [];
      if (!sourceItems.length) return { ok: false, error: "This saved cart is empty." };
      const result = await r.$addResolvedItemsToCart(sourceItems);
      if (result.error && fallbackTrack && /cart is not available/i.test(result.error)) {
        await r.$openTrackAction(fallbackTrack, "cart");
        return { ok: true, openedPurchase: true };
      }
      runtimeState.open = true;
      runtimeState.activeTab = "cart";
      runtimeState.cartView = "current";
      runtimeState.selectedSavedCartId = null;
      runtimeSaveState();
      r.$render();
      const failed = result.failed?.length || 0;
      const summary = result.error
        ? result.error
        : `Restored ${result.added || 0}; ${result.alreadyPresent || 0} already present${failed ? `; ${failed} could not be restored` : ""}.`;
      r.$showToast(summary);
      return { ok: !result.error, ...result, summary };
    };
}

function registerLayoutCart3(r) {
r.$addResolvedItemsToCart = async function addResolvedItemsToCart(sourceItems) {
      const resolved = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_CART_ITEMS, items: sourceItems });
      if (!resolved?.ok) return { ok: false, error: resolved?.error || "Could not inspect the saved cart items." };
      const requestId = `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          document.removeEventListener("bandkit:cart-restore-result", onResult);
          resolve({ requestId, error: "Bandcamp did not finish restoring the cart in time.", added: 0, alreadyPresent: 0, failed: [] });
        }, Math.max(15000, resolved.items.length * 11000));
        const onResult = (event) => {
          if (event.detail?.requestId !== requestId) return;
          window.clearTimeout(timeout);
          document.removeEventListener("bandkit:cart-restore-result", onResult);
          resolve(event.detail);
        };
        document.addEventListener("bandkit:cart-restore-result", onResult);
        document.dispatchEvent(new CustomEvent("bandkit:cart-command", {
          detail: { action: "restore", requestId, items: resolved.items }
        }));
      });
      return result;
    };
r.$cartItemsForTracks = async function cartItemsForTracks(tracks, requestedItemType = "t") {
      const sourceTracks = r.$normalizePlaylist(Array.isArray(tracks) ? tracks : []);
      if (!sourceTracks.length) return [];
      const resolved = await r.$runtimeMessage({
        type: MESSAGES.RESOLVE_CART_ITEMS,
        items: sourceTracks.map((track) => ({
          title: track.title,
          album: track.album,
          artist: track.artist,
          art: track.art,
          url: resolvedTrackPageUrl(track),
          requestedItemType
        }))
      });
      if (!resolved?.ok) {
        r.$showToast(resolved?.error || "Bandcamp could not identify these cart items.");
        return [];
      }
      return (resolved.items || []).map((item, index) => {
        const source = sourceTracks[index] || {};
        const restore = item?.restore;
        return portableCartItem({
          id: `saved-cart-item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          title: restore?.item_title || item?.title || source.title,
          artist: restore?.artist_name || item?.artist || source.artist,
          album: item?.album || source.album,
          kind: requestedItemType === "a" ? "Digital album" : "Digital track",
          price: Math.max(0, Number(restore?.unit_price) || 0),
          currency: restore?.currency || "USD",
          art: item?.art || source.art,
          url: restore?.url || item?.url || source.pageUrl,
          restore
        });
      }).filter(Boolean);
    };
r.$addTracksToSavedCart = async function addTracksToSavedCart(tracks, snapshotId) {
      if (!r.$requireDataHome()) return 0;
      const snapshot = runtimeState.savedCarts.find((entry) => entry.id === snapshotId && !r.$cartAutosave.isAutoSavedCart(entry));
      if (!snapshot) return 0;
      const items = await r.$cartItemsForTracks(tracks, "t");
      if (!items.length) return 0;
      const existing = new Set((snapshot.items || []).map((item) => r.$cartAutosave.cartSignature([item])));
      const additions = items.filter((item) => {
        const signature = r.$cartAutosave.cartSignature([item]);
        if (existing.has(signature)) return false;
        existing.add(signature);
        return true;
      });
      if (!additions.length) {
        r.$showToast(`Already in “${snapshot.name}”`);
        return 0;
      }
      const available = Math.max(0, 100 - (snapshot.items || []).length);
      const accepted = additions.slice(0, available);
      if (!accepted.length) {
        r.$showToast(`“${snapshot.name}” can hold up to 100 items.`);
        return 0;
      }
      snapshot.items = [...(snapshot.items || []), ...accepted];
      snapshot.summary = null;
      snapshot.modifiedAt = new Date().toISOString();
      runtimeState.savedCarts = r.$cartAutosave.normalizeSavedCarts(runtimeState.savedCarts);
      runtimeSaveState();
      if (runtimeState.activeTab === "cart" && runtimeState.cartView === "saved") r.$render();
      const limitSuffix = accepted.length < additions.length ? " · 100-item limit reached" : "";
      r.$showToast(`Added ${accepted.length} item${accepted.length === 1 ? "" : "s"} to “${snapshot.name}”${limitSuffix}`);
      return accepted.length;
    };
r.$addTracksToCurrentCart = async function addTracksToCurrentCart(tracks) {
      const items = await r.$cartItemsForTracks(tracks, "t");
      if (!items.length) return;
      const fallbackTrack = Array.isArray(tracks) && tracks.length === 1 ? tracks[0] : null;
      await r.$restoreSavedCart(items, { fallbackTrack });
    };
r.$removeLiveCartItem = async function removeLiveCartItem(item) {
      const requestId = `remove-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          document.removeEventListener("bandkit:cart-remove-result", onResult);
          resolve({ requestId, removed: false, error: "Bandcamp did not finish removing the item in time." });
        }, 12000);
        const onResult = (event) => {
          if (event.detail?.requestId !== requestId) return;
          window.clearTimeout(timeout);
          document.removeEventListener("bandkit:cart-remove-result", onResult);
          resolve(event.detail);
        };
        document.addEventListener("bandkit:cart-remove-result", onResult);
        document.dispatchEvent(new CustomEvent("bandkit:cart-command", {
          detail: { action: "remove", requestId, item: item.restore || item }
        }));
      });
    };
r.$addQueuedItemToCart = async function addQueuedItemToCart(track, requestedItemType, button) {
      const pageUrl = resolvedTrackPageUrl(track);
      if (!pageUrl) {
        r.$showToast("This track does not expose an individual Bandcamp page.");
        return;
      }
      const label = requestedItemType === "a" ? "album" : "track";
      button.disabled = true;
      r.$showToast(`Opening the ${label} on Bandcamp…`);
      try {
        const resolved = await r.$runtimeMessage({ type: MESSAGES.RESOLVE_CART_ITEMS, items: [{
          title: track.title,
          album: track.album,
          artist: track.artist,
          url: pageUrl,
          requestedItemType
        }] });
        const actionUrl = safeBandcampUrl(resolved?.items?.[0]?.restore?.url) || pageUrl;
        const target = new URL(actionUrl);
        target.hash = "bandkit-cart";
        const response = await r.$runtimeMessage({ type: MESSAGES.OPEN_BACKGROUND_TAB, url: target.href });
        if (!response?.ok) r.$showToast(response?.error || `Bandcamp could not open this ${label}.`);
        else r.$showToast(`Opened the ${label} on Bandcamp for purchase.`);
      } finally {
        button.disabled = false;
      }
    };
r.$createPlaylistMenuOption = function createPlaylistMenuOption(label, onClick, { disabled = false, back = false } = {}) {
      const option = createElement("button", `hub-playlist-menu-option${back ? " is-back" : ""}`, label);
      option.type = "button";
      option.disabled = disabled;
      option.setAttribute("role", "menuitem");
      option.addEventListener("click", onClick);
      return option;
    };
}

function registerLayoutCart4(r) {
r.$positionPlaylistDestinationMenu = function positionPlaylistDestinationMenu(menu) {
      menu.classList.remove("opens-left");
      const parentMenu = menu.closest(".hub-player-more-menu");
      if (!parentMenu) return;
      const parentBounds = parentMenu.getBoundingClientRect();
      const submenuWidth = Math.max(160, menu.scrollWidth);
      const availableRight = window.innerWidth - parentBounds.right;
      menu.classList.toggle("opens-left", availableRight < submenuWidth + 14);
    };
r.$populatePlaylistDestinationMenu = function populatePlaylistDestinationMenu(menu, trigger, track, view = "destinations") {
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
      if (view === "playlists" || view === "playlists-only") {
        if (view !== "playlists-only") {
          menu.append(r.$createPlaylistMenuOption("← Add destination", () => showView("destinations"), { back: true }));
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
      } else if (view === "carts") {
        const savedCarts = runtimeState.savedCarts.filter((snapshot) => !r.$cartAutosave.isAutoSavedCart(snapshot));
        menu.append(
          r.$createPlaylistMenuOption("← Add destination", () => r.$populatePlaylistDestinationMenu(menu, trigger, track), { back: true }),
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
      } else {
        const inPlaying = runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track));
        menu.append(
          r.$createPlaylistMenuOption(inPlaying ? "✓ In Now Playing" : "＋ Add to Now Playing", () => {
            close();
            r.$addTrackToPlaylist(track);
          }, { disabled: inPlaying }),
          r.$createPlaylistMenuOption("＋ Add to Playlist…", () => {
            showView("playlists");
          }),
          r.$createPlaylistMenuOption("＋ Add to Cart…", () => {
            showView("carts");
          })
        );
      }
    };
r.$closeSiblingDestinationMenus = function closeSiblingDestinationMenus(wrapper, keepMenu) {
      const actions = wrapper.closest(".hub-queue-actions");
      for (const menu of actions?.querySelectorAll(".hub-playlist-destination-menu") || []) {
        if (menu === keepMenu) continue;
        menu.hidden = true;
        menu.parentElement?.querySelector('[aria-haspopup="menu"]')?.setAttribute("aria-expanded", "false");
      }
    };
r.$createPlaylistDestinationControl = function createPlaylistDestinationControl(track, { labeled = false, playlistsOnly = false } = {}) {
      const wrapper = createElement("div", `hub-playlist-destination${labeled ? " is-labeled" : ""}`);
      const trackPageUrl = resolvedTrackPageUrl(track);
      const trigger = createElement("button", `hub-queue-action hub-playlist-action${labeled ? " is-labeled" : ""}`);
      trigger.type = "button";
      trigger.disabled = !trackPageUrl;
      trigger.title = playlistsOnly
        ? `Add ${track.title} to a playlist`
        : `Add ${track.title} to Now Playing, a playlist, or a cart`;
      trigger.setAttribute("aria-label", trigger.title);
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.append(createButtonIcon("icon-plus.svg"));
      if (labeled) trigger.append(document.createTextNode(playlistsOnly ? "Add to playlist" : "Add"));
      const menu = createElement("div", "hub-playlist-destination-menu");
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      trigger.addEventListener("click", () => {
        const opening = menu.hidden;
        if (opening) r.$closeSiblingDestinationMenus(wrapper, menu);
        if (opening) r.$populatePlaylistDestinationMenu(menu, trigger, track, playlistsOnly ? "playlists-only" : "destinations");
        menu.hidden = !opening;
        if (opening) r.$positionPlaylistDestinationMenu(menu);
        trigger.setAttribute("aria-expanded", String(opening));
      });
      wrapper.addEventListener("focusout", () => window.setTimeout(() => {
        if (!wrapper.contains(r.$shadow.activeElement)) {
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
        }
      }, 50));
      wrapper.append(trigger, menu);
      return wrapper;
    };
r.$createCartDestinationControl = function createCartDestinationControl(track, { labeled = false } = {}) {
      const wrapper = createElement("div", `hub-playlist-destination hub-cart-destination${labeled ? " is-labeled" : ""}`);
      const trackPageUrl = resolvedTrackPageUrl(track);
      const trigger = createElement("button", `hub-queue-action hub-queue-cart${labeled ? " is-labeled" : ""}`);
      trigger.type = "button";
      trigger.disabled = !trackPageUrl;
      trigger.title = trackPageUrl ? `Add ${track.title} to cart` : "No individual Bandcamp track page is available";
      trigger.setAttribute("aria-label", trigger.title);
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      const cartIcon = createElement("span", "hub-button-icon hub-queue-cart-icon");
      cartIcon.style.setProperty("--hub-icon", `url('${asset("icon-cart.svg")}')`);
      trigger.append(cartIcon);
      if (labeled) trigger.append(document.createTextNode(" Add to cart"));

      const menu = createElement("div", "hub-playlist-destination-menu hub-cart-destination-menu");
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      const close = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      };
      const addTrack = r.$createPlaylistMenuOption("Add track", async () => {
        close();
        await r.$addQueuedItemToCart(track, "t", addTrack);
      });
      const addAlbum = r.$createPlaylistMenuOption("Add album", async () => {
        close();
        await r.$addQueuedItemToCart(track, "a", addAlbum);
      });
      menu.append(addTrack, addAlbum);
      trigger.addEventListener("click", () => {
        const opening = menu.hidden;
        if (opening) r.$closeSiblingDestinationMenus(wrapper, menu);
        menu.hidden = !opening;
        trigger.setAttribute("aria-expanded", String(opening));
      });
      wrapper.addEventListener("focusout", () => window.setTimeout(() => {
        if (!wrapper.contains(r.$shadow.activeElement)) close();
      }, 50));
      wrapper.append(trigger, menu);
      return wrapper;
    };
r.$createTrackActionControls = function createTrackActionControls(track, { labeled = false, playlistsOnly = false, hideCart = false } = {}) {
      const actions = createElement("div", `hub-queue-actions${labeled ? " is-labeled" : ""}`);
      const trackPageUrl = resolvedTrackPageUrl(track);
      const playlist = r.$createPlaylistDestinationControl(track, { labeled, playlistsOnly });
      const wishlisted = (runtimeState.wishlistTrackKeys || []).includes(r.$wishlistTrackKey(track));
      const wishlist = createElement("button", `hub-queue-action hub-wishlist-action${labeled ? " is-labeled" : ""}${wishlisted ? " is-active" : ""}`);
      wishlist.type = "button";
      wishlist.disabled = !trackPageUrl;
      wishlist.title = wishlisted ? `${track.title} is in your Bandcamp wishlist` : trackPageUrl ? `Add ${track.title} to your Bandcamp wishlist` : "No individual Bandcamp track page is available";
      wishlist.setAttribute("aria-label", wishlisted ? `${track.title} is wishlisted` : `Add ${track.title} to wishlist`);
      wishlist.setAttribute("aria-pressed", String(wishlisted));
      wishlist.append(createButtonIcon("icon-wishlist.svg"));
      if (labeled) wishlist.append(document.createTextNode(wishlisted ? "Wishlisted" : "Wishlist"));
      wishlist.addEventListener("click", () => {
        if (wishlisted) r.$showToast(`“${track.title}” is already in your Bandcamp wishlist.`);
        else void r.$openTrackAction(track, "wishlist");
      });

      const cart = r.$createCartDestinationControl(track, { labeled });
      actions.append(playlist, wishlist);
      if (!hideCart) actions.append(cart);
      return actions;
    };
r.$trackIsOwnedOnCollectionPage = function trackIsOwnedOnCollectionPage(track) {
      for (const card of document.querySelectorAll('#collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .collection-item-container')) {
        const ownedTrack = r.$collectionTrackFromCard?.(card);
        if (ownedTrack && r.$playlistTracksMatch(ownedTrack, track)) return true;
      }
      return false;
    };
r.$currentLiveTrack = function currentLiveTrack() {
      return {
        title: runtimeLive.title,
        artist: runtimeLive.artist,
        album: runtimeSeamless.track?.album || "",
        id: runtimeSeamless.track?.id || `${runtimeLive.pageUrl}|${runtimeLive.title}`,
        pageUrl: r.$individualTrackPageUrl(runtimeSeamless.track) || r.$individualTrackPageUrl(runtimeLive) || runtimeLive.pageUrl,
        artistUrl: runtimeLive.artistUrl,
        art: runtimeLive.art,
        duration: runtimeSeamless.duration || runtimeLive.duration,
        url: runtimeSeamless.track?.url || r.$getAudio()?.currentSrc || r.$getAudio()?.src || ""
      };
    };
}

function registerLayoutCart5(r) {
r.$renderPlayerMoreActions = function renderPlayerMoreActions() {
      const track = r.$currentLiveTrack();
      const inPlaylist = runtimeState.playlist.some((item) => r.$playlistTracksMatch(item, track));
      const hideCart = r.$trackIsOwnedOnCollectionPage(track);
      const signature = runtimeLive.hasPlaybackStarted ? `${track.title}|${track.pageUrl}|${inPlaylist}|${hideCart}` : "";
      r.$playerMoreButton.disabled = !signature || !resolvedTrackPageUrl(track);
      if (signature === r.$playerActionSignature) return;
      r.$playerActionSignature = signature;
      r.$playerMoreMenu.hidden = true;
      r.$playerMoreButton.setAttribute("aria-expanded", "false");
      r.$playerMoreMenu.replaceChildren();
      if (signature) r.$playerMoreMenu.append(r.$createTrackActionControls(track, { labeled: true, playlistsOnly: true, hideCart }));
    };
r.$render = function render() {
      const panelHidden = !runtimeState.open;
      if (panelHidden && r.$panel.contains(r.$shadow.activeElement)) {
        const activeSectionControl = runtimeState.activeTab === "playlist"
          ? r.$nowPlayingButton
          : r.$headerShortcuts.querySelector(`[data-tab="${runtimeState.activeTab}"]`);
        [activeSectionControl, r.$launcher, r.$nowPlayingButton]
          .find((control) => control && !control.disabled && control.getClientRects().length)
          ?.focus();
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
      const sectionPanelHeight = Math.max(220, Math.min(availablePanelHeight, Number(runtimeState.sectionPanelHeight) || availablePanelHeight));
      r.$panel.style.setProperty("--hub-section-panel-height", `${sectionPanelHeight}px`);
      r.$panelTitle.textContent = labels[runtimeState.activeTab] || "Bandkit";
      r.$panel.setAttribute("aria-label", `${r.$panelTitle.textContent} panel`);
      r.$panelHeader.setAttribute("aria-label", `${r.$panelTitle.textContent} panel header`);
      for (const button of r.$headerShortcuts.querySelectorAll(".hub-header-shortcut")) {
        const active = runtimeState.open && button.dataset.tab === runtimeState.activeTab;
        const showingSavedCarts = button.dataset.tab === "cart" && runtimeState.cartView === "saved";
        const count = button.dataset.tab === "cart"
          ? showingSavedCarts ? runtimeState.savedCarts.length : runtimeState.cart.length
          : 0;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("has-dot", count > 0);
        const counter = button.querySelector(".hub-header-shortcut-count");
        if (counter) counter.textContent = count > 99 ? "99+" : String(count);
        if (button.dataset.tab === "cart") {
          const cartLabel = showingSavedCarts ? "Saved carts" : "Cart";
          const countLabel = showingSavedCarts
            ? `${count} saved`
            : `${count} item${count === 1 ? "" : "s"}`;
          button.dataset.view = showingSavedCarts ? "saved" : "current";
          button.querySelector(".hub-header-shortcut-icon")?.style.setProperty(
            "--hub-icon",
            `url('${asset(showingSavedCarts ? "icon-saved-cart.svg" : "icon-cart.svg")}')`
          );
          button.setAttribute("aria-label", `${cartLabel}, ${countLabel}`);
          button.title = button.getAttribute("aria-label");
        }
      }
      for (const button of r.$tabBar.querySelectorAll(".hub-tab")) {
        const active = button.dataset.tab === runtimeState.activeTab;
        const count = button.dataset.tab === "cart"
          ? runtimeState.cart.length
          : button.dataset.tab === "playlist" ? runtimeState.savedPlaylists.length : 0;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
        button.classList.toggle("has-dot", count > 0);
        const counter = button.querySelector(".hub-tab-dot");
        if (counter) counter.textContent = count > 99 ? "99+" : String(count);
        if (button.dataset.tab === "playlist") {
          button.setAttribute("aria-label", count ? `Now Playing and Playlists, ${count} saved` : "Now Playing and Playlists");
          button.title = button.getAttribute("aria-label");
        }
      }

      r.$renderPanelContent();
      r.$renderDjTools();
      r.$renderPlayer();
      r.$schedulePlayerSectionGeometry();
    };
r.$renderPanelContent = function renderPanelContent() {
      // Every panel refresh must finish by restoring the pinned header and
      // scrolling body. Playback updates use this same path so they can never
      // leave raw children inside an inset-free section layout.
      r.$content.classList.remove("is-section-layout", "is-empty-now-playing");
      r.$content.replaceChildren();
      if (!r.$dataHomeReady) r.$renderDataHomeGate();
      else {
        if (runtimeState.activeTab === "playlist") r.$renderPlaylist();
        if (runtimeState.activeTab === "cart") r.$renderCart();
        if (runtimeState.activeTab === "activity") r.$renderActivity();
        if (runtimeState.activeTab === "settings") r.$renderSettings();
        const dataHomeWarning = r.$renderDataHomePermissionWarning();
        r.$placeDataHomePermissionWarning(dataHomeWarning);
      }
      r.$mountPanelClose();
      r.$organizePanelContentScrolling();
    };
r.$organizePanelContentScrolling = function organizePanelContentScrolling() {
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
        if (!children[index].matches(".hub-cart-backup")) break;
        pinnedEnd = index;
      }
      const pinned = createElement("div", "hub-content-pinned");
      const scrollBody = createElement("div", "hub-content-scroll");
      pinned.append(...children.slice(0, pinnedEnd + 1));
      scrollBody.append(...children.slice(pinnedEnd + 1));
      r.$content.replaceChildren(pinned, scrollBody);
      r.$content.classList.add("is-section-layout");
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

function registerLayoutCart6(r) {
r.$deleteSavedCart = function deleteSavedCart(snapshot) {
      if (!window.confirm(`Delete the saved cart “${snapshot.name || "Saved cart"}”?`)) return false;
      runtimeState.savedCarts = runtimeState.savedCarts.filter((entry) => entry.id !== snapshot.id);
      if (runtimeState.selectedSavedCartId === snapshot.id) runtimeState.selectedSavedCartId = null;
      runtimeSaveState();
      r.$render();
      r.$showToast(`Deleted “${snapshot.name || "Saved cart"}”`);
      return true;
    };
r.$renameSavedCart = function renameSavedCart(snapshot) {
      const name = window.prompt("Rename this saved cart", snapshot.name || "Saved cart")?.trim();
      if (!name) return false;
      const normalizedName = name.slice(0, 120);
      if (r.$cartAutosave.isAutoSavedCart(snapshot)) {
        const result = r.$cartAutosave.saveNamedCart(runtimeState.savedCarts, snapshot.items || [], normalizedName, {
          id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          savedAt: new Date().toISOString(),
          sourcePage: snapshot.sourcePage,
          summary: snapshot.summary,
          allowEmpty: true
        });
        if (!result.snapshot) return false;
        runtimeState.savedCarts = result.savedCarts;
        if (runtimeState.selectedSavedCartId === snapshot.id) runtimeState.selectedSavedCartId = result.snapshot.id;
      } else {
        snapshot.name = normalizedName;
        snapshot.modifiedAt = new Date().toISOString();
      }
      runtimeSaveState();
      r.$render();
      r.$showToast(`Renamed cart to “${normalizedName}”`);
      return true;
    };
r.$removeSavedCartItem = function removeSavedCartItem(snapshot, item) {
      if (!snapshot || !item || !Array.isArray(snapshot.items) || r.$cartAutosave.isAutoSavedCart(snapshot)) return false;
      const signature = r.$cartAutosave.cartSignature([item]);
      const index = snapshot.items.findIndex((entry) => entry === item || r.$cartAutosave.cartSignature([entry]) === signature);
      if (index < 0) return false;
      if (!window.confirm(`Remove “${item.title}” from “${snapshot.name}”?`)) return false;
      snapshot.items.splice(index, 1);
      snapshot.summary = null;
      snapshot.modifiedAt = new Date().toISOString();
      runtimeState.savedCarts = r.$cartAutosave.normalizeSavedCarts(runtimeState.savedCarts);
      runtimeSaveState();
      r.$render();
      r.$showToast(`Removed “${item.title}” from “${snapshot.name}”`);
      return true;
    };
}

export const registerLayoutCart = [registerLayoutCart1, registerLayoutCart2, registerLayoutCart3, registerLayoutCart4, registerLayoutCart5, registerLayoutCart6];

export const setupLayoutCart = [];
