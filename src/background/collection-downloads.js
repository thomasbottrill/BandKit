import { STORAGE_KEYS } from "../shared/contracts.js";
import { normalizeDownloadFormat, redownloadItemKey } from "../shared/download-formats.js";
import { resolveDownload } from "./download-resolver.js";
import { isBandcampUrl } from "./urls.js";

const MAX_ACTIVE_DOWNLOADS = 2;
const MAX_QUEUE_ITEMS = 2000;
const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 250;
const PREPARING_BACKOFF_MS = [15_000, 30_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000];
const RATE_LIMIT_BACKOFF_MS = [10_000, 15_000, 30_000, 60_000, 60_000, 60_000];
const ERROR_RETRIES = 3;
const DOWNLOADS_PERMISSION = { permissions: ["downloads"] };
export const ACTIVE_STATUSES = new Set(["resolving", "preparing", "downloading"]);
export const UNFINISHED_STATUSES = new Set(["queued", "resolving", "preparing", "downloading"]);
const INTERRUPT_MESSAGES = {
  USER_CANCELED: "Cancelled in Chrome.",
  NETWORK_FAILED: "The connection dropped.",
  NETWORK_TIMEOUT: "The connection timed out.",
  NETWORK_DISCONNECTED: "You went offline.",
  SERVER_FORBIDDEN: "Bandcamp's link expired. Retry to fetch a new one.",
  SERVER_UNAUTHORIZED: "Bandcamp's link expired. Retry to fetch a new one.",
  FILE_NO_SPACE: "Your disk is full.",
  FILE_ACCESS_DENIED: "Chrome could not write to your downloads folder."
};

function cleanText(value, limit = 300) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeArt(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname.endsWith(".bcbits.com") || isBandcampUrl(url.href)) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeIncomingItem(value, format) {
  const key = redownloadItemKey(value?.redownloadUrl);
  if (!key) return null;
  const pageUrl = isBandcampUrl(value?.pageUrl) ? new URL(value.pageUrl).href : "";
  return {
    id: `${key}:${format}`,
    key,
    format,
    title: cleanText(value.title) || "Untitled",
    artist: cleanText(value.artist),
    art: safeArt(value.art),
    pageUrl,
    redownloadUrl: new URL(value.redownloadUrl).href,
    status: "queued",
    downloadId: null,
    sizeMb: null,
    attempts: 0,
    retryAt: 0,
    error: "",
    filename: "",
    addedAt: 0,
    finishedAt: 0
  };
}

// Pages through the fan's whole collection so "Select all" does not depend on
// how far the page has been scrolled. Only purchases with a download link are
// returned; Bandcamp omits the link for physical-only items.
export async function listCollectionDownloads(message, { fetchImpl = fetch, maxPages = 50 } = {}) {
  const fanId = Number(message?.fanId);
  let token = String(message?.olderThanToken || "").slice(0, 200);
  if (!Number.isInteger(fanId) || fanId <= 0 || !token) return { ok: true, items: [] };
  const items = [];
  for (let page = 0; page < maxPages && token; page += 1) {
    const response = await fetchImpl("https://bandcamp.com/api/fancollection/1/collection_items", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fan_id: fanId, older_than_token: token, count: 100 })
    });
    if (!response.ok) throw new Error(`Bandcamp collection returned ${response.status}`);
    const data = await response.json();
    if (data?.error) throw new Error("Bandcamp collection could not be read");
    const links = data?.redownload_urls && typeof data.redownload_urls === "object" ? data.redownload_urls : {};
    for (const entry of Array.isArray(data?.items) ? data.items : []) {
      const redownloadUrl = links[`${entry?.sale_item_type}${entry?.sale_item_id}`];
      if (!redownloadItemKey(redownloadUrl) || entry?.hidden) continue;
      const artId = Number(entry.item_art_id);
      items.push({
        key: redownloadItemKey(redownloadUrl),
        redownloadUrl,
        title: cleanText(entry.item_title || entry.album_title),
        artist: cleanText(entry.band_name),
        art: artId ? `https://f4.bcbits.com/img/a${artId}_7.jpg` : "",
        pageUrl: isBandcampUrl(entry.item_url) ? entry.item_url : ""
      });
    }
    token = data?.more_available ? String(data.last_token || "") : "";
  }
  return { ok: true, items };
}

function backoff(steps, attempt, random) {
  const base = steps[Math.min(Math.max(attempt, 1), steps.length) - 1];
  return Math.round(base * (0.7 + random() * 0.6));
}

function basename(path) {
  return String(path || "").split(/[\\/]/).pop() || "";
}

// The queue's working state lives on one context object so each step below
// stays a plain function the smoke test can drive with a stubbed chrome.
function downloadsApi(q) {
  return q.chromeApi.downloads;
}

async function hasPermission(q) {
  try {
    return Boolean(await q.chromeApi.permissions.contains(DOWNLOADS_PERMISSION)) && Boolean(downloadsApi(q)?.download);
  } catch {
    return false;
  }
}

async function loadQueue(q) {
  if (q.state) return q.state;
  q.loading ||= q.chromeApi.storage.local.get(STORAGE_KEYS.DOWNLOADS).then((stored) => {
    const saved = stored?.[STORAGE_KEYS.DOWNLOADS];
    const items = Array.isArray(saved?.items) ? saved.items.filter((item) => item?.id && item.key).slice(0, MAX_QUEUE_ITEMS) : [];
    q.state ||= { paused: saved?.paused === true, holdUntil: Number(saved?.holdUntil) || 0, items };
    return q.state;
  }).finally(() => { q.loading = null; });
  return q.loading;
}

function persistQueue(q) {
  q.clearTimer(q.saveTimer);
  q.saveTimer = 0;
  if (!q.state) return Promise.resolve();
  return q.chromeApi.storage.local.set({ [STORAGE_KEYS.DOWNLOADS]: q.state }).catch(() => {});
}

// Bursts of progress through a long queue would otherwise rewrite the whole
// list for every step. Tabs only need the settled state.
function updateItem(q, item, changes) {
  Object.assign(item, changes);
  if (q.saveTimer) return;
  q.saveTimer = q.setTimer(() => { void persistQueue(q); }, SAVE_DELAY_MS);
}

function requeue(q, item) {
  updateItem(q, item, { status: "queued", attempts: 0, retryAt: 0, error: "", downloadId: null, finishedAt: 0 });
}

async function recordHistory(q, item) {
  const stored = await q.chromeApi.storage.local.get(STORAGE_KEYS.DOWNLOAD_HISTORY).catch(() => ({}));
  const saved = stored?.[STORAGE_KEYS.DOWNLOAD_HISTORY];
  const history = saved && typeof saved === "object" ? saved : {};
  history[item.key] = { format: item.format, at: q.now() };
  await q.chromeApi.storage.local.set({ [STORAGE_KEYS.DOWNLOAD_HISTORY]: history }).catch(() => {});
}

// A finished release leaves the queue straight away; the history remembers
// it, so the collection still marks it as downloaded.
function finishItem(q, item, delta) {
  const result = delta.state?.current;
  if (result === "complete") {
    q.state.items = q.state.items.filter((candidate) => candidate !== item);
    updateItem(q, item, { status: "done", error: "", finishedAt: q.now(), retryAt: 0 });
    void recordHistory(q, item);
  } else if (result === "interrupted") {
    updateItem(q, item, {
      status: "failed",
      error: INTERRUPT_MESSAGES[delta.error?.current || ""] || "The download stopped before it finished.",
      finishedAt: q.now()
    });
  }
}

function handleDownloadChanged(q, delta) {
  if (!q.state || !delta?.id) return;
  const item = q.state.items.find((candidate) => candidate.downloadId === delta.id && candidate.status === "downloading");
  if (!item) return;
  if (delta.filename?.current) updateItem(q, item, { filename: basename(delta.filename.current) });
  if (!["complete", "interrupted"].includes(delta.state?.current)) return;
  finishItem(q, item, delta);
  void pumpQueue(q);
}

// Must run in the worker's first turn when the permission already exists, or
// Chrome cannot wake the worker for a finished download.
function listenForDownloads(q) {
  if (q.listening || !downloadsApi(q)?.onChanged) return;
  q.listening = true;
  downloadsApi(q).onChanged.addListener((delta) => {
    void loadQueue(q).then(() => handleDownloadChanged(q, delta));
  });
}

// Waits are checked at least every 20 seconds. Each check makes an extension
// call, which keeps Chrome from suspending a worker that still has releases
// waiting on Bandcamp.
function schedulePump(q, delay) {
  q.clearTimer(q.pumpTimer);
  q.pumpTimer = q.setTimer(() => { q.pumpTimer = 0; void pumpQueue(q); }, Math.min(20_000, Math.max(250, delay)));
}

async function startDownload(q, item, resolved) {
  try {
    const downloadId = await downloadsApi(q).download({ url: resolved.url, conflictAction: "uniquify", saveAs: false });
    updateItem(q, item, { status: "downloading", downloadId, sizeMb: resolved.sizeMb ?? item.sizeMb, error: "", retryAt: 0 });
  } catch (error) {
    updateItem(q, item, { status: "failed", error: cleanText(error?.message) || "Chrome would not start this download.", finishedAt: q.now() });
  }
}

function applyResolveFailure(q, item, result, attempts) {
  if (result.status === "preparing") {
    if (attempts > PREPARING_BACKOFF_MS.length) {
      updateItem(q, item, { status: "failed", attempts, error: "Bandcamp is still preparing this format. Retry later.", finishedAt: q.now() });
      return;
    }
    updateItem(q, item, { status: "preparing", attempts, retryAt: q.now() + backoff(PREPARING_BACKOFF_MS, attempts, q.random) });
    return;
  }
  if (result.status === "rate-limited") {
    // Bandcamp throttles the account, not the release, so everything waits.
    q.state.holdUntil = q.now() + backoff(RATE_LIMIT_BACKOFF_MS, attempts, q.random);
    if (attempts > RATE_LIMIT_BACKOFF_MS.length) {
      updateItem(q, item, { status: "failed", attempts, error: "Bandcamp is limiting downloads. Retry in a few minutes.", finishedAt: q.now() });
      return;
    }
    updateItem(q, item, { status: "queued", attempts, retryAt: q.state.holdUntil });
    return;
  }
  if (result.status === "unavailable") {
    updateItem(q, item, { status: "unavailable", attempts, error: result.error, finishedAt: q.now() });
    return;
  }
  if (result.status === "error" && attempts <= ERROR_RETRIES) {
    updateItem(q, item, { status: "queued", attempts, retryAt: q.now() + backoff(RATE_LIMIT_BACKOFF_MS, attempts, q.random), error: result.error });
    return;
  }
  updateItem(q, item, { status: "failed", attempts, error: result.error || "This download could not be prepared.", finishedAt: q.now() });
}

async function resolveNext(q, item) {
  updateItem(q, item, { status: "resolving", error: "" });
  let result;
  try {
    result = await q.resolve(item);
  } catch {
    result = { status: "error", error: "Bandcamp's download page could not be read." };
  }
  // Removed, cancelled or paused while Bandcamp was answering.
  if (!q.state.items.includes(item) || item.status !== "resolving") return;
  if (result.status !== "ok") {
    applyResolveFailure(q, item, result, item.attempts + 1);
  } else if (q.state.paused) {
    updateItem(q, item, { status: "queued", attempts: 0 });
  } else {
    await startDownload(q, item, result);
  }
}

function isWaiting(item) {
  return item.status === "queued" || item.status === "preparing";
}

// One release is resolved at a time and at most two files transfer at once,
// which keeps Bandcamp's rate limits from tripping on a large selection.
async function pumpQueue(q) {
  if (q.pumping) {
    q.pumpAgain = true;
    return;
  }
  q.pumping = true;
  try {
    do {
      q.pumpAgain = false;
      await loadQueue(q);
      if (q.state.paused || !await hasPermission(q)) break;
      listenForDownloads(q);
      const time = q.now();
      if (q.state.holdUntil > time) {
        schedulePump(q, q.state.holdUntil - time);
        break;
      }
      const busy = q.state.items.filter((item) => item.status === "resolving" || item.status === "downloading").length;
      if (busy >= MAX_ACTIVE_DOWNLOADS) break;
      const next = q.state.items.find((item) => isWaiting(item) && item.retryAt <= time);
      if (next) {
        await resolveNext(q, next);
        q.pumpAgain = true;
        continue;
      }
      const waiting = q.state.items.filter(isWaiting).map((item) => item.retryAt);
      if (waiting.length) schedulePump(q, Math.min(...waiting) - time);
    } while (q.pumpAgain);
  } finally {
    q.pumping = false;
    await persistQueue(q);
  }
}

// A restarted worker has lost its timers and any fetch in flight. Downloads
// Chrome finished meanwhile are read back so nothing stays "downloading".
async function resumeQueue(q) {
  await loadQueue(q);
  const time = q.now();
  q.state.items = q.state.items.filter((item) => item.status !== "done" && (UNFINISHED_STATUSES.has(item.status)
    || !item.finishedAt || time - item.finishedAt < FINISHED_RETENTION_MS));
  for (const item of q.state.items.filter((candidate) => candidate.status === "resolving")) updateItem(q, item, { status: "queued" });
  if (await hasPermission(q)) {
    listenForDownloads(q);
    for (const item of q.state.items.filter((candidate) => candidate.status === "downloading")) {
      const [download] = await downloadsApi(q).search({ id: item.downloadId }).catch(() => []);
      if (!download) {
        updateItem(q, item, { status: "failed", error: "Chrome lost track of this download.", finishedAt: q.now() });
      } else if (download.state !== "in_progress") {
        if (download.filename) updateItem(q, item, { filename: basename(download.filename) });
        finishItem(q, item, { state: { current: download.state }, error: { current: download.error } });
      }
    }
  }
  await persistQueue(q);
  await pumpQueue(q);
}

async function enqueueItems(q, items, formatValue) {
  await loadQueue(q);
  const format = normalizeDownloadFormat(formatValue);
  const time = q.now();
  let added = 0;
  for (const value of Array.isArray(items) ? items.slice(0, MAX_QUEUE_ITEMS) : []) {
    const incoming = normalizeIncomingItem(value, format);
    if (!incoming) continue;
    const existing = q.state.items.find((item) => item.id === incoming.id);
    if (existing && UNFINISHED_STATUSES.has(existing.status)) continue;
    // A finished copy is replaced, and a release still waiting in another
    // format switches to this one.
    q.state.items = q.state.items.filter((item) => item.id !== incoming.id
      && !(item.key === incoming.key && item.status === "queued"));
    q.state.items.push({ ...incoming, addedAt: time });
    added += 1;
  }
  if (q.state.items.length > MAX_QUEUE_ITEMS) {
    q.state.items = q.state.items.filter((item) => UNFINISHED_STATUSES.has(item.status)).slice(-MAX_QUEUE_ITEMS);
  }
  await persistQueue(q);
  void pumpQueue(q);
  return { ok: true, added, permission: await hasPermission(q) };
}

async function queueProgress(q) {
  await loadQueue(q);
  const permission = await hasPermission(q);
  const progress = {};
  if (permission) {
    for (const item of q.state.items.filter((candidate) => candidate.status === "downloading")) {
      const [download] = await downloadsApi(q).search({ id: item.downloadId }).catch(() => []);
      if (download) progress[item.id] = { received: download.bytesReceived || 0, total: download.totalBytes || 0, paused: download.paused === true };
    }
  }
  // Every visible Downloads tab polls here, which also keeps a waiting queue
  // moving after the worker was suspended.
  void pumpQueue(q);
  return { ok: true, permission, progress };
}

async function setQueuePaused(q, paused, api) {
  q.state.paused = paused;
  if (!paused) q.state.holdUntil = 0;
  for (const active of q.state.items.filter((candidate) => candidate.status === "downloading")) {
    await (paused ? api?.pause(active.downloadId) : api?.resume(active.downloadId))?.catch?.(() => {});
  }
}

async function cancelActive(q, items, api) {
  for (const active of items.filter((candidate) => candidate.status === "downloading")) {
    await api?.cancel(active.downloadId)?.catch?.(() => {});
  }
}

async function runQueueCommand(q, message) {
  await loadQueue(q);
  const action = String(message?.action || "");
  const item = q.state.items.find((candidate) => candidate.id === message?.id);
  const api = await hasPermission(q) ? downloadsApi(q) : null;
  if (action === "pause" || action === "resume") {
    await setQueuePaused(q, action === "pause", api);
  } else if (action === "retry" && item && ["failed", "unavailable"].includes(item.status)) {
    requeue(q, item);
  } else if (action === "retry-failed") {
    for (const failed of q.state.items.filter((candidate) => candidate.status === "failed")) requeue(q, failed);
  } else if (action === "remove" && item) {
    await cancelActive(q, [item], api);
    q.state.items = q.state.items.filter((candidate) => candidate !== item);
  } else if (action === "set-format" && item?.status === "queued") {
    const format = normalizeDownloadFormat(message.format);
    const id = `${item.key}:${format}`;
    if (!q.state.items.some((candidate) => candidate.id === id)) updateItem(q, item, { id, format, attempts: 0, retryAt: 0, error: "" });
  } else if (action === "clear-finished") {
    q.state.items = q.state.items.filter((candidate) => UNFINISHED_STATUSES.has(candidate.status));
  } else if (action === "cancel-all") {
    await cancelActive(q, q.state.items, api);
    q.state.items = q.state.items.filter((candidate) => !UNFINISHED_STATUSES.has(candidate.status));
    q.state.paused = false;
  } else {
    return { ok: false, error: "Unknown download action." };
  }
  await persistQueue(q);
  void pumpQueue(q);
  return { ok: true };
}

export function createDownloadQueue({
  chromeApi = globalThis.chrome,
  resolve = resolveDownload,
  now = () => Date.now(),
  random = Math.random,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer)
} = {}) {
  const q = {
    chromeApi, resolve, now, random, setTimer, clearTimer,
    state: null, loading: null, saveTimer: 0, pumpTimer: 0, pumping: false, pumpAgain: false, listening: false
  };
  return {
    command: (message) => runQueueCommand(q, message),
    enqueue: (items, format) => enqueueItems(q, items, format),
    handleDownloadChanged: (delta) => handleDownloadChanged(q, delta),
    listen: () => listenForDownloads(q),
    progress: () => queueProgress(q),
    pump: () => pumpQueue(q),
    reset() {
      q.clearTimer(q.saveTimer);
      q.clearTimer(q.pumpTimer);
      q.saveTimer = 0;
      q.pumpTimer = 0;
      q.state = { paused: false, holdUntil: 0, items: [] };
    },
    resume: () => resumeQueue(q),
    snapshot: () => q.state
  };
}
