import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { DOWNLOAD_FORMATS, downloadFormatLabel, normalizeDownloadFormat, redownloadItemKey } from "../../shared/download-formats.js";
import { createPageDestinationMenu, createPageMenuOption } from "../components/page-actions.js";
import { attachMenuKeyNavigation } from "../menu-keyboard.js";
import { createButtonIcon, createElement } from "../core.js";
import { runtimeSaveState, runtimeState } from "./context.js";

const OWNED_CARD_SELECTOR = '#collection-items .collection-grid[data-ismain="true"][data-iswish="false"] .collection-item-container';
const ART_SELECTOR = `${OWNED_CARD_SELECTOR} .collection-item-art-container`;

// Bandcamp's own page data lists the first batch of the collection with its
// download links, and the token for paging through the rest.
export function collectionDownloadPageData(blob) {
  const fan = blob?.fan_data;
  const collection = blob?.collection_data;
  if (!fan?.is_own_page || !collection) return null;
  const cache = blob.item_cache?.collection || {};
  const links = collection.redownload_urls || {};
  const items = [];
  for (const cacheKey of Array.isArray(collection.sequence) ? collection.sequence : Object.keys(cache)) {
    const entry = cache[cacheKey];
    const redownloadUrl = entry && links[`${entry.sale_item_type}${entry.sale_item_id}`];
    const key = redownloadItemKey(redownloadUrl);
    if (!key || entry.hidden) continue;
    items.push({
      key,
      redownloadUrl,
      title: String(entry.item_title || entry.album_title || ""),
      artist: String(entry.band_name || ""),
      art: Number(entry.item_art_id) ? `https://f4.bcbits.com/img/a${Number(entry.item_art_id)}_7.jpg` : "",
      pageUrl: String(entry.item_url || "")
    });
  }
  return {
    fanId: Number(fan.fan_id) || 0,
    lastToken: String(collection.last_token || ""),
    itemCount: Number(collection.item_count) || items.length,
    items
  };
}

// Shift-click selects every card between the last one toggled and this one,
// in the order the grid shows them.
export function selectionRange(keys, fromKey, toKey) {
  const from = keys.indexOf(fromKey);
  const to = keys.indexOf(toKey);
  if (from < 0 || to < 0) return [toKey];
  return keys.slice(Math.min(from, to), Math.max(from, to) + 1);
}

function cardDownloadItem(r, card) {
  const link = card.querySelector('.redownload-item a[href*="/download"]');
  const key = redownloadItemKey(link?.href);
  if (!key) return null;
  const track = r.$collectionTrackFromCard(card);
  return {
    key,
    redownloadUrl: link.href,
    title: card.dataset.title || track?.album || track?.title || "Untitled",
    artist: track?.artist || "",
    art: track?.art || "",
    pageUrl: track?.pageUrl || ""
  };
}

function libraryDownloadItem(item) {
  const key = item?.owned ? redownloadItemKey(item.redownloadUrl) : "";
  return key ? { key, redownloadUrl: item.redownloadUrl, title: item.title, artist: item.artist, art: item.art, pageUrl: item.pageUrl } : null;
}

function ownedCards() {
  return [...document.querySelectorAll(OWNED_CARD_SELECTOR)].filter((card) => card.querySelector('.redownload-item a[href*="/download"]'));
}

function registerSelectionState(r) {
  r.$downloadSelection = new Map();
  r.$downloadSelectMode = false;
  r.$downloadSelectAnchor = "";
  r.$collectionDownloadCatalog = null;
  r.$downloadSelectionMenu = null;

  r.$collectionDownloadsActive = function collectionDownloadsActive() {
    const collectionTab = document.querySelector('#grid-tabs > li[data-tab="collection"]');
    return r.$ownCollectionPage === true && r.$downloadsFeatureEnabled() && Boolean(collectionTab?.classList.contains("active"));
  };

  r.$setDownloadSelected = function setDownloadSelected(items, selected) {
    for (const item of items) {
      if (selected) r.$downloadSelection.set(item.key, item);
      else r.$downloadSelection.delete(item.key);
    }
    r.$syncCollectionDownloadSelection();
  };

  r.$toggleCardSelection = function toggleCardSelection(card, { range = false } = {}) {
    const item = cardDownloadItem(r, card);
    if (!item) return;
    const selected = !r.$downloadSelection.has(item.key);
    if (range && r.$downloadSelectAnchor) {
      const cards = ownedCards();
      const items = cards.map((candidate) => cardDownloadItem(r, candidate)).filter(Boolean);
      const keys = selectionRange(items.map((candidate) => candidate.key), r.$downloadSelectAnchor, item.key);
      r.$setDownloadSelected(items.filter((candidate) => keys.includes(candidate.key)), selected);
    } else {
      r.$setDownloadSelected([item], selected);
    }
    r.$downloadSelectAnchor = item.key;
  };

  r.$clearDownloadSelection = function clearDownloadSelection() {
    r.$downloadSelection.clear();
    r.$downloadSelectMode = false;
    r.$downloadSelectAnchor = "";
    r.$syncCollectionDownloadSelection();
  };

  // Everything in the collection, not just what has scrolled into view. The
  // first batch comes from the page; the rest is paged in by the background.
  r.$loadCollectionDownloadCatalog = async function loadCollectionDownloadCatalog() {
    if (r.$collectionDownloadCatalog) return r.$collectionDownloadCatalog;
    const pageData = collectionDownloadPageData(r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob"));
    const items = new Map((pageData?.items || []).map((item) => [item.key, item]));
    for (const card of ownedCards()) {
      const item = cardDownloadItem(r, card);
      if (item && !items.has(item.key)) items.set(item.key, item);
    }
    if (pageData?.fanId && pageData.lastToken && items.size < pageData.itemCount) {
      const response = await r.$runtimeMessage({
        type: MESSAGES.DOWNLOADS_LIST_COLLECTION,
        fanId: pageData.fanId,
        olderThanToken: pageData.lastToken
      });
      if (!response?.ok) throw new Error(response?.error || "Bandcamp could not list your collection.");
      for (const item of response.items || []) if (!items.has(item.key)) items.set(item.key, item);
    }
    r.$collectionDownloadCatalog = [...items.values()];
    return r.$collectionDownloadCatalog;
  };

  // While a search or filter replaces the grid, selecting all means the
  // releases it found rather than the whole collection.
  r.$selectCollectionDownloads = async function selectCollectionDownloads({ notDownloaded = false } = {}) {
    r.$downloadSelectBusy = true;
    r.$syncCollectionDownloadSelection();
    try {
      const shown = r.$libraryFilteredResults?.();
      const catalog = shown ? shown.map(libraryDownloadItem).filter(Boolean) : await r.$loadCollectionDownloadCatalog();
      const items = notDownloaded ? catalog.filter((item) => !r.$downloadHistory[item.key]) : catalog;
      r.$downloadSelectMode = true;
      r.$setDownloadSelected(items, true);
      r.$showToast(items.length
        ? `Selected ${items.length} release${items.length === 1 ? "" : "s"}`
        : "Everything in your collection has been downloaded.");
    } catch (error) {
      r.$showToast(error?.message || "Bandcamp could not list your collection.");
    } finally {
      r.$downloadSelectBusy = false;
      r.$syncCollectionDownloadSelection();
    }
  };

  r.$downloadSelectedReleases = async function downloadSelectedReleases() {
    const items = [...r.$downloadSelection.values()];
    if (!items.length) return;
    r.$downloadSelectBusy = true;
    r.$syncCollectionDownloadSelection();
    const response = await r.$runtimeMessage({
      type: MESSAGES.DOWNLOADS_ENQUEUE,
      items,
      format: runtimeState.downloadFormat
    }).catch(() => null);
    r.$downloadSelectBusy = false;
    if (!response?.ok) {
      r.$syncCollectionDownloadSelection();
      r.$showToast(response?.error || "Bandkit could not start these downloads.");
      return;
    }
    r.$downloadPermission = response.permission === true;
    r.$clearDownloadSelection();
    // Downloads only exists while its queue has something in it, so read the
    // queue now rather than waiting for the storage event to arrive.
    const stored = await chrome.storage.local.get(STORAGE_KEYS.DOWNLOADS).catch(() => null);
    if (stored?.[STORAGE_KEYS.DOWNLOADS]) r.$applyDownloadsState(stored[STORAGE_KEYS.DOWNLOADS]);
    runtimeState.open = true;
    runtimeState.activeTab = "downloads";
    runtimeState.musicBarRecentPanel = "downloads";
    runtimeSaveState();
    r.$saveLayoutState();
    r.$render();
    r.$showToast(response.added
      ? `Added ${response.added} release${response.added === 1 ? "" : "s"} to Downloads`
      : "Those releases are already in Downloads.");
  };
}

function closeSelectionMenu(r) {
  const menu = r.$downloadSelectionMenu;
  if (!menu) return;
  menu.anchor.setAttribute("aria-expanded", "false");
  menu.element.remove();
  document.removeEventListener("click", menu.dismiss, true);
  r.$downloadSelectionMenu = null;
}

function openSelectionMenu(r, anchor, label, options) {
  const reopening = r.$downloadSelectionMenu?.anchor === anchor;
  closeSelectionMenu(r);
  if (reopening) return;
  const element = createPageDestinationMenu();
  element.classList.add("bandkit-collection-download-menu");
  element.setAttribute("aria-label", label);
  r.$applyPageActionTheme(element);
  for (const option of options) {
    const button = createPageMenuOption(option.label, () => {
      closeSelectionMenu(r);
      anchor.focus();
      option.action();
    }, option.disabled === true);
    button.setAttribute("role", option.checked === undefined ? "menuitem" : "menuitemradio");
    if (option.checked !== undefined) button.setAttribute("aria-checked", String(option.checked));
    element.append(button);
  }
  attachMenuKeyNavigation(element, { onEscape: () => { closeSelectionMenu(r); anchor.focus(); } });
  document.body.append(element);
  const rect = anchor.getBoundingClientRect();
  element.style.left = `${Math.max(8, Math.min(window.innerWidth - element.offsetWidth - 8, rect.left + window.scrollX))}px`;
  element.style.top = `${rect.bottom + window.scrollY + 5}px`;
  const dismiss = (event) => {
    if (!element.contains(event.target) && !anchor.contains(event.target)) closeSelectionMenu(r);
  };
  r.$downloadSelectionMenu = { anchor, element, dismiss };
  document.addEventListener("click", dismiss, true);
  anchor.setAttribute("aria-expanded", "true");
  window.setTimeout(() => element.querySelector("button:not(:disabled)")?.focus(), 0);
}

function barButton(className, label, { icon = "", text = "", onClick, menu = false }) {
  const button = createElement("button", `bandkit-collection-download-control ${className}`);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  if (icon) button.append(createButtonIcon(icon));
  if (text) button.append(createElement("span", "bandkit-collection-download-text", text));
  if (menu) {
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}

function renderSelectionBar(r, bar) {
  const count = r.$downloadSelection.size;
  const busy = r.$downloadSelectBusy === true;
  const selecting = r.$downloadSelectMode || count > 0;
  bar.dataset.selecting = String(selecting);
  if (!selecting) {
    bar.replaceChildren(barButton("is-select", "Select releases to download", {
      icon: "icon-select.svg",
      onClick: () => {
        r.$downloadSelectMode = true;
        r.$syncCollectionDownloadSelection();
        document.querySelector(`${OWNED_CARD_SELECTOR} .bandkit-collection-select`)?.focus();
      }
    }));
    return;
  }
  // The count doubles as Deselect all: pointing at or focusing it swaps the
  // label in place, and clearing keeps select mode on.
  const status = barButton("is-count", count ? `Deselect all ${count} selected` : "Nothing selected", {
    onClick: () => {
      r.$downloadSelection.clear();
      r.$downloadSelectAnchor = "";
      r.$syncCollectionDownloadSelection();
    }
  });
  status.disabled = busy || !count;
  const labels = createElement("span", "bandkit-collection-download-count");
  labels.setAttribute("aria-hidden", "true");
  labels.append(createElement("span", "is-resting", busy && !count ? "Selecting…" : `${count} selected`), createElement("span", "is-hovered", "Deselect all"));
  status.append(labels);
  const live = createElement("span", "bandkit-collection-download-live", `${count} selected`);
  live.setAttribute("aria-live", "polite");
  status.append(live);
  const format = barButton("is-format", `Download format: ${downloadFormatLabel(runtimeState.downloadFormat)}`, {
    text: downloadFormatLabel(runtimeState.downloadFormat),
    icon: "icon-chevron.svg",
    menu: true,
    onClick: (anchor) => openSelectionMenu(r, anchor, "Download format", DOWNLOAD_FORMATS.map((option) => ({
      label: option.id === runtimeState.downloadFormat ? `✓ ${option.label}` : option.label,
      checked: option.id === runtimeState.downloadFormat,
      action: () => {
        runtimeState.downloadFormat = normalizeDownloadFormat(option.id);
        runtimeSaveState();
        r.$syncCollectionDownloadSelection();
      }
    })))
  });
  const download = barButton("is-download", count ? `Download ${count} release${count === 1 ? "" : "s"}` : "Select releases to download", {
    icon: "icon-downloads.svg",
    text: "Download",
    onClick: () => void r.$downloadSelectedReleases()
  });
  download.disabled = busy || !count;
  const shown = r.$libraryFilteredResults?.()?.map(libraryDownloadItem).filter(Boolean);
  const catalogSize = shown?.length ?? (r.$collectionDownloadCatalog?.length || collectionDownloadPageData(r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob"))?.itemCount || 0);
  const more = barButton("is-more", "More selection options", {
    icon: "icon-more.svg",
    menu: true,
    onClick: (anchor) => openSelectionMenu(r, anchor, "Selection options", [
      { label: catalogSize ? `Select all ${catalogSize}${shown ? " shown" : ""}` : "Select all", action: () => void r.$selectCollectionDownloads(), disabled: busy || shown?.length === 0 },
      { label: "Select not downloaded", action: () => void r.$selectCollectionDownloads({ notDownloaded: true }), disabled: busy }
    ])
  });
  const done = barButton("is-done", "Stop selecting", { icon: "icon-close.svg", onClick: () => r.$clearDownloadSelection() });
  bar.replaceChildren(status, format, download, more, done);
}

function syncCard(r, card, active, selecting) {
  const item = active ? cardDownloadItem(r, card) : null;
  const art = card.querySelector(".collection-item-art-container");
  let checkbox = art?.querySelector(":scope > .bandkit-collection-select");
  if (!item || !art) {
    checkbox?.remove();
    card.removeAttribute("data-bandkit-download-selected");
    card.removeAttribute("data-bandkit-downloaded");
    return;
  }
  if (!checkbox) {
    checkbox = createElement("button", "bandkit-collection-select");
    checkbox.type = "button";
    checkbox.setAttribute("role", "checkbox");
    checkbox.append(createButtonIcon("icon-check.svg"));
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      r.$toggleCardSelection(card, { range: event.shiftKey });
    });
    art.append(checkbox);
  }
  const selected = r.$downloadSelection.has(item.key);
  const downloaded = r.$downloadHistory[item.key];
  checkbox.setAttribute("aria-checked", String(selected));
  checkbox.setAttribute("aria-label", `Select ${item.title} for download`);
  checkbox.title = downloaded ? `Downloaded as ${downloadFormatLabel(downloaded.format)}` : "Select for download";
  card.toggleAttribute("data-bandkit-download-selected", selected);
  card.toggleAttribute("data-bandkit-downloaded", Boolean(downloaded));
  checkbox.tabIndex = selecting || selected ? 0 : -1;
}

function syncLibraryRow(r, row, active, selecting) {
  const checkbox = row.querySelector(".bandkit-library-art > .bandkit-collection-select");
  const key = row.dataset.downloadKey;
  if (!checkbox || !key) return;
  checkbox.hidden = !active;
  const selected = active && r.$downloadSelection.has(key);
  const downloaded = r.$downloadHistory[key];
  checkbox.setAttribute("aria-checked", String(selected));
  checkbox.title = downloaded ? `Downloaded as ${downloadFormatLabel(downloaded.format)}` : "Select for download";
  checkbox.tabIndex = selecting || selected ? 0 : -1;
  row.toggleAttribute("data-bandkit-download-selected", selected);
  row.toggleAttribute("data-bandkit-downloaded", Boolean(downloaded));
}

function registerSelectionUi(r) {
  // Search results stand in for Bandcamp's cards, so they take the same
  // checkbox, and artwork selects instead of opening while selecting.
  r.$decorateLibraryDownloadRow = function decorateLibraryDownloadRow(row, art, item) {
    const download = libraryDownloadItem(item);
    if (!download) return;
    row.dataset.downloadKey = download.key;
    const toggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const selected = !r.$downloadSelection.has(download.key);
      if (event.shiftKey && r.$downloadSelectAnchor) {
        const items = (r.$libraryFilteredResults?.() || []).map(libraryDownloadItem).filter(Boolean);
        const keys = selectionRange(items.map((candidate) => candidate.key), r.$downloadSelectAnchor, download.key);
        r.$setDownloadSelected(items.filter((candidate) => keys.includes(candidate.key)), selected);
      } else {
        r.$setDownloadSelected([download], selected);
      }
      r.$downloadSelectAnchor = download.key;
    };
    const checkbox = createElement("button", "bandkit-collection-select");
    checkbox.type = "button";
    checkbox.setAttribute("role", "checkbox");
    checkbox.setAttribute("aria-label", `Select ${item.title} for download`);
    checkbox.append(createButtonIcon("icon-check.svg"));
    checkbox.addEventListener("click", toggle);
    art.addEventListener("click", (event) => {
      if (document.documentElement.dataset.bandkitCollectionSelecting === "true") toggle(event);
    });
    art.append(checkbox);
    const active = r.$collectionDownloadsActive();
    syncLibraryRow(r, row, active, active && (r.$downloadSelectMode || r.$downloadSelection.size > 0));
  };

  r.$syncCollectionDownloadSelection = function syncCollectionDownloadSelection() {
    const active = r.$collectionDownloadsActive();
    if (!active && (r.$downloadSelection.size || r.$downloadSelectMode)) {
      r.$downloadSelection.clear();
      r.$downloadSelectMode = false;
    }
    const selecting = active && (r.$downloadSelectMode || r.$downloadSelection.size > 0);
    document.documentElement.dataset.bandkitCollectionDownloads = String(active);
    document.documentElement.dataset.bandkitCollectionSelecting = String(selecting);
    for (const card of document.querySelectorAll(OWNED_CARD_SELECTOR)) syncCard(r, card, active, selecting);
    for (const row of document.querySelectorAll(".bandkit-library-row[data-download-key]")) syncLibraryRow(r, row, active, selecting);
    const host = document.querySelector(".bandkit-library-search") || document.querySelector("#owner-controls.collection-controls");
    let bar = document.querySelector(".bandkit-collection-download-bar");
    if (!active || !host) {
      closeSelectionMenu(r);
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = createElement("div", "bandkit-collection-download-bar");
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "Collection downloads");
    }
    if (bar.parentElement !== host) {
      const more = host.querySelector(":scope > .bandkit-library-menu");
      if (more) host.insertBefore(bar, more);
      else host.append(bar);
    }
    r.$applyPageActionTheme(bar);
    const focusedControl = bar.contains(document.activeElement) ? [...bar.querySelectorAll("button")].indexOf(document.activeElement) : -1;
    const focusedClass = focusedControl >= 0 ? document.activeElement.classList[1] : "";
    renderSelectionBar(r, bar);
    if (focusedClass) (bar.querySelector(`.${focusedClass}`) || bar.querySelector("button"))?.focus();
  };
}

export function registerCollectionDownloadSelection(r) {
  registerSelectionState(r);
  registerSelectionUi(r);
}

export function setupCollectionDownloadSelection(r) {
  if (location.hostname !== "bandcamp.com") return;
  const grids = document.querySelector("#grids");
  const pageData = collectionDownloadPageData(r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob"));
  if (!grids || !pageData) return;
  r.$ownCollectionPage = true;
  r.$syncDisabledFeatureViews();

  // While selecting, the artwork selects instead of opening the preview. The
  // play control and the artwork's own actions keep working as usual.
  document.addEventListener("click", (event) => {
    if (document.documentElement.dataset.bandkitCollectionSelecting !== "true" || !(event.target instanceof Element)) return;
    const art = event.target.closest(ART_SELECTOR);
    if (!art || event.target.closest(".item_link_play, .bandkit-collection-overlay-action, .bandkit-collection-select")) return;
    const card = art.closest(".collection-item-container");
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    r.$toggleCardSelection(card, { range: event.shiftKey });
  }, true);
  document.addEventListener("keydown", (event) => {
    if (document.documentElement.dataset.bandkitCollectionSelecting !== "true" || !(event.target instanceof Element)) return;
    if (event.key === "Escape" && !r.$downloadSelectionMenu) {
      r.$clearDownloadSelection();
      return;
    }
    const target = event.target.closest(".bandkit-collection-preview-target");
    const card = target?.closest(OWNED_CARD_SELECTOR);
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    r.$toggleCardSelection(card, { range: event.shiftKey });
  }, true);

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      r.$syncCollectionDownloadSelection();
    });
  };
  new MutationObserver((mutations) => {
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node instanceof Element
      && !node.matches(".bandkit-collection-select, .bandkit-collection-download-bar, .bandkit-collection-download-bar *, .hub-button-icon")))) schedule();
  }).observe(grids, { childList: true, subtree: true });
  grids.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("#grid-tabs")) window.setTimeout(schedule, 0);
  }, true);
  r.$syncCollectionDownloadSelection();
}
