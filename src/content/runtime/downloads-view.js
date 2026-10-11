import { MESSAGES, STORAGE_KEYS } from "../../shared/contracts.js";
import { DOWNLOAD_FORMATS, downloadFormatLabel } from "../../shared/download-formats.js";
import { createPanelEmptyState, createPanelMediaCard } from "../components/collections.js";
import { createPanelIconButton } from "../components/actions.js";
import { createArt, createElement, createSectionHeading, safeBandcampReleaseUrl } from "../core.js";
import { runtimeState } from "./context.js";

const POLL_MS = 1000;
const UNFINISHED = new Set(["queued", "resolving", "preparing", "downloading"]);

export function formatDownloadBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function downloadStatusText(item, progress, now = Date.now()) {
  if (item.status === "queued") return item.retryAt > now ? "Waiting for Bandcamp" : "Queued";
  if (item.status === "resolving") return "Preparing";
  if (item.status === "preparing") return `Bandcamp is preparing ${downloadFormatLabel(item.format)}`;
  if (item.status === "downloading") {
    if (progress?.paused) return "Paused";
    if (!progress?.total) return "Downloading";
    return `${Math.floor((progress.received / progress.total) * 100)}% of ${formatDownloadBytes(progress.total)}`;
  }
  if (item.status === "done") return "Downloaded";
  return item.error || (item.status === "unavailable" ? "Not available" : "Failed");
}

function downloadsCommand(r, action, extra = {}) {
  return r.$runtimeMessage({ type: MESSAGES.DOWNLOADS_COMMAND, action, ...extra }).then((response) => {
    if (!response?.ok) r.$showToast(response?.error || "Bandkit could not update your downloads.");
    return response;
  }).catch(() => r.$showToast("Bandkit could not update your downloads."));
}

// Finished releases leave the list, so it only ever counts what is left.
function summaryText(items, paused, permission) {
  const unfinished = items.filter((item) => UNFINISHED.has(item.status)).length;
  const failed = items.length - unfinished;
  if (unfinished && permission === false) return "Waiting for your permission";
  const parts = unfinished ? [`${paused ? "Paused · " : ""}${unfinished} left`] : [];
  if (failed) parts.push(`${failed} not downloaded`);
  return parts.join(" · ");
}
const visibleDownloads = (queue) => queue.items.filter((item) => item.status !== "done");

// The Allow button has to be one of Bandkit's own pages for Chrome to accept
// the click as a permission request, so it is framed into the panel. The frame
// cannot inherit the panel's styles, so it is handed the colours and type a
// settings text action uses.
function permissionFrame(r) {
  const styles = getComputedStyle(r.$content);
  const params = new URLSearchParams({
    muted: styles.getPropertyValue("--hub-muted").trim(),
    accent: styles.getPropertyValue("--hub-accent").trim(),
    font: styles.fontFamily
  });
  const frame = createElement("iframe", "hub-downloads-permission-frame");
  frame.src = `${chrome.runtime.getURL("downloads-permission.html")}?${params}`;
  frame.title = "Allow Bandkit to save downloads";
  return frame;
}

function rowAction(r, item, label, icon, onClick, className = "") {
  const button = createPanelIconButton({
    label: `${label} ${item.title}`,
    icon,
    onClick: (event) => {
      event.stopPropagation();
      onClick();
    },
    className: `hub-playlist-icon-button hub-cart-remove-button${className ? ` ${className}` : ""}`
  });
  return button;
}

function queuedRowMenu(r, card, item) {
  const formatOptions = DOWNLOAD_FORMATS.map((format) => {
    const option = r.$createToolbarMenuAction(`Download as ${format.label}`, format.id === item.format ? "icon-check.svg" : "icon-downloads.svg",
      () => void downloadsCommand(r, "set-format", { id: item.id, format: format.id }));
    option.setAttribute("role", "menuitemradio");
    option.setAttribute("aria-checked", String(format.id === item.format));
    option.classList.toggle("is-active", format.id === item.format);
    return option;
  });
  const remove = r.$createToolbarMenuAction("Remove from downloads", "icon-close.svg",
    () => void downloadsCommand(r, "remove", { id: item.id }));
  const overflow = r.$createToolbarOverflow(`More actions for ${item.title}`, [...formatOptions, remove], {
    menuLabel: `Actions for ${item.title}`,
    className: "hub-downloads-row-overflow"
  });
  const syncOpen = () => window.setTimeout(() => {
    card.classList.toggle("has-open-menu", overflow.querySelector(".hub-toolbar-actions-menu")?.hidden === false);
  }, 0);
  overflow.addEventListener("click", syncOpen);
  overflow.addEventListener("keydown", syncOpen);
  overflow.addEventListener("focusout", syncOpen);
  return overflow;
}

function rowActions(r, card, item) {
  const actions = createElement("div", "hub-downloads-row-actions");
  if (item.status === "queued") {
    actions.append(queuedRowMenu(r, card, item));
  } else if (["resolving", "preparing", "downloading"].includes(item.status)) {
    actions.append(rowAction(r, item, "Cancel", "icon-close.svg", () => void downloadsCommand(r, "remove", { id: item.id })));
  } else {
    if (item.status === "failed") actions.append(rowAction(r, item, "Retry", "icon-retry.svg", () => void downloadsCommand(r, "retry", { id: item.id }), "is-persistent"));
    actions.append(rowAction(r, item, "Remove from list:", "icon-close.svg", () => void downloadsCommand(r, "remove", { id: item.id })));
  }
  return actions;
}

function syncRowProgress(row, item, progress) {
  const status = row.querySelector(".hub-downloads-status");
  if (status) status.textContent = `${downloadFormatLabel(item.format)} · ${downloadStatusText(item, progress)}`;
  const bar = row.querySelector(".hub-downloads-progress-value");
  const ratio = progress?.total ? Math.min(1, progress.received / progress.total) : 0;
  if (bar) bar.style.setProperty("--hub-downloads-progress", String(ratio));
}

function downloadRow(r, item) {
  const card = createPanelMediaCard(`hub-cart-item-card hub-downloads-row is-${item.status}`);
  card.dataset.downloadId = item.id;
  const main = createElement("div", "hub-product-main");
  // Downloaded releases play from their artwork, like cart items do.
  const releaseUrl = safeBandcampReleaseUrl(item.pageUrl);
  let artLink;
  if (releaseUrl) {
    artLink = r.$createReleasePlayToggle({ url: releaseUrl, title: item.title, art: item.art });
  } else {
    artLink = r.$createPageLink("", item.pageUrl, "hub-art-link");
    artLink.setAttribute("aria-label", `Open ${item.title}`);
    artLink.append(createArt(item.art));
  }
  const details = createElement("div", "hub-product-details");
  const titleRow = createElement("div", "hub-row-title");
  titleRow.append(r.$createPageLink(item.title, item.pageUrl, "hub-cart-title hub-inline-link"), rowActions(r, card, item));
  const meta = createElement("div", "hub-row-title hub-product-meta-row");
  meta.append(createElement("span", "hub-meta hub-downloads-status"));
  if (item.status === "downloading") {
    const progress = createElement("span", "hub-downloads-progress");
    progress.setAttribute("aria-hidden", "true");
    progress.append(createElement("span", "hub-downloads-progress-value"));
    meta.append(progress);
  }
  details.append(titleRow, createElement("span", "hub-track-artist", item.artist || "Bandcamp"), meta);
  main.append(artLink, details);
  card.append(main);
  syncRowProgress(card, item, r.$downloadProgress[item.id]);
  return card;
}

function renderToolbar(r, items) {
  const toolbar = createElement("div", "hub-cart-backup hub-downloads-toolbar");
  toolbar.append(createElement("span", "hub-panel-count-summary hub-downloads-summary", summaryText(items, r.$downloadsQueue.paused, r.$downloadPermission)));
  const actions = createElement("div", "hub-toolbar");
  const unfinished = items.some((item) => UNFINISHED.has(item.status));
  if (unfinished) {
    const paused = r.$downloadsQueue.paused;
    actions.append(r.$createPlaylistToolbarButton(paused ? "Resume downloads" : "Pause downloads", paused ? "icon-play.svg" : "icon-pause.svg",
      () => void downloadsCommand(r, paused ? "resume" : "pause")));
  }
  const retryFailed = r.$createToolbarMenuAction("Retry failed", "icon-retry.svg", () => void downloadsCommand(r, "retry-failed"),
    { disabled: !items.some((item) => item.status === "failed") });
  const clearFinished = r.$createToolbarMenuAction("Clear failed", "icon-clear.svg", () => void downloadsCommand(r, "clear-finished"),
    { disabled: !items.some((item) => !UNFINISHED.has(item.status)) });
  const cancelAll = r.$createToolbarMenuAction("Cancel all", "icon-close.svg", () => void downloadsCommand(r, "cancel-all"),
    { disabled: !unfinished, danger: true });
  actions.append(r.$createToolbarOverflow("More download actions", [retryFailed, clearFinished, cancelAll]));
  toolbar.append(actions);
  return toolbar;
}

export function registerDownloadsView(r) {
  r.$downloadsQueue = { paused: false, items: [] };
  r.$downloadHistory = {};
  r.$downloadProgress = {};
  r.$downloadPermission = null;
  r.$downloadsPollTimer = 0;

  // Downloads only appears while something is waiting, downloading or needs
  // a retry; once everything has finished it goes away again.
  r.$downloadsAvailable = function downloadsAvailable() {
    return r.$downloadsFeatureEnabled() && visibleDownloads(r.$downloadsQueue).length > 0;
  };
  r.$unfinishedDownloadCount = function unfinishedDownloadCount() {
    return r.$downloadsQueue.items.filter((item) => UNFINISHED.has(item.status)).length;
  };

  r.$renderDownloads = function renderDownloads() {
    const items = visibleDownloads(r.$downloadsQueue);
    r.$content.append(createSectionHeading("Downloads"));
    if (items.length) r.$content.append(renderToolbar(r, items));
    if (r.$downloadPermission === false && items.some((item) => UNFINISHED.has(item.status))) {
      const notice = createElement("div", "hub-cart-backup hub-downloads-permission");
      notice.append(createElement("span", "hub-downloads-permission-copy", "Chrome needs your permission to save these files."), permissionFrame(r));
      r.$content.append(notice);
    }
    const list = createElement("div", "hub-downloads-list");
    for (const item of items) list.append(downloadRow(r, item));
    r.$content.append(list);
    if (!items.length) r.$content.append(createPanelEmptyState("Every download has finished."));
    // A tab opened in the background still needs to know whether to show
    // the Allow button, even though progress polling waits for it to show.
    if (r.$downloadPermission === null) void r.$pollDownloads();
    r.$syncDownloadsPolling();
  };

  // Progress is read from Chrome only while someone is looking at it. Rows
  // are updated in place so an open menu or hover state survives each tick.
  r.$pollDownloads = async function pollDownloads() {
    const response = await r.$runtimeMessage({ type: MESSAGES.DOWNLOADS_STATUS }).catch(() => null);
    if (!response?.ok) return;
    const permissionChanged = response.permission !== r.$downloadPermission;
    r.$downloadPermission = response.permission;
    r.$downloadProgress = response.progress || {};
    if (permissionChanged && runtimeState.activeTab === "downloads") {
      r.$render();
      return;
    }
    for (const item of r.$downloadsQueue.items.filter((candidate) => candidate.status === "downloading")) {
      const row = r.$content.querySelector(`.hub-downloads-row[data-download-id="${CSS.escape(item.id)}"]`);
      if (row) syncRowProgress(row, item, r.$downloadProgress[item.id]);
    }
  };

  r.$syncDownloadsPolling = function syncDownloadsPolling() {
    const watching = runtimeState.open && runtimeState.activeTab === "downloads" && !document.hidden && r.$downloadsAvailable();
    if (!watching) {
      window.clearInterval(r.$downloadsPollTimer);
      r.$downloadsPollTimer = 0;
      return;
    }
    if (r.$downloadsPollTimer) return;
    void r.$pollDownloads();
    r.$downloadsPollTimer = window.setInterval(() => {
      if (!(runtimeState.open && runtimeState.activeTab === "downloads" && !document.hidden)) r.$syncDownloadsPolling();
      else void r.$pollDownloads();
    }, POLL_MS);
  };

  r.$applyDownloadsState = function applyDownloadsState(queue, history) {
    const before = `${r.$downloadsAvailable()}|${r.$unfinishedDownloadCount()}`;
    const wasDownloading = r.$unfinishedDownloadCount() > 0;
    if (queue !== undefined) {
      r.$downloadsQueue = { paused: queue?.paused === true, items: Array.isArray(queue?.items) ? queue.items : [] };
    }
    if (history !== undefined) r.$downloadHistory = history && typeof history === "object" ? history : {};
    const wasActive = runtimeState.activeTab;
    r.$syncDisabledFeatureViews();
    r.$syncCollectionDownloadSelection?.();
    // The list closes itself when the last release lands, so say so once,
    // in the tab someone is looking at.
    if (wasDownloading && !r.$downloadsAvailable() && !document.hidden) r.$showToast("Downloads finished");
    const menuOpen = r.$content.querySelector(".hub-downloads-list .hub-toolbar-actions-menu:not([hidden]), .hub-downloads-toolbar .hub-toolbar-actions-menu:not([hidden])");
    if (runtimeState.activeTab === "downloads" && menuOpen) return;
    // Other views only show the Downloads destination and its count, so they
    // are redrawn only when those change, not on every step of a transfer.
    const changed = before !== `${r.$downloadsAvailable()}|${r.$unfinishedDownloadCount()}`;
    if (wasActive === "downloads" || runtimeState.activeTab === "downloads" || changed) r.$render();
  };
}

export function setupDownloadsView(r) {
  chrome.storage.local.get([STORAGE_KEYS.DOWNLOADS, STORAGE_KEYS.DOWNLOAD_HISTORY], (stored) => {
    r.$applyDownloadsState(stored?.[STORAGE_KEYS.DOWNLOADS] || null, stored?.[STORAGE_KEYS.DOWNLOAD_HISTORY] || {});
  });
  const onChanged = (changes, area) => {
    if (area !== "local") return;
    const queue = changes[STORAGE_KEYS.DOWNLOADS];
    const history = changes[STORAGE_KEYS.DOWNLOAD_HISTORY];
    if (!queue && !history) return;
    r.$applyDownloadsState(queue ? queue.newValue || null : undefined, history ? history.newValue || {} : undefined);
  };
  chrome.storage.onChanged.addListener(onChanged);
  r.$app.registerCleanup(() => chrome.storage.onChanged.removeListener(onChanged));
  document.addEventListener("visibilitychange", () => r.$syncDownloadsPolling());
}
