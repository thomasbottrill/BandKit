import assert from "node:assert/strict";
import fs from "node:fs";
import { DOWNLOAD_FORMATS, normalizeDownloadFormat, redownloadItemKey } from "../src/shared/download-formats.js";
import { STORAGE_KEYS } from "../src/shared/contracts.js";
import {
  digitalDownloadFromPageData,
  isDownloadFileUrl,
  pageDataFromHtml,
  parseSizeMb,
  parseStatResponse,
  resolveDownload,
  statUrlFor
} from "../src/background/download-resolver.js";
import { createDownloadQueue, listCollectionDownloads } from "../src/background/collection-downloads.js";
import { collectionDownloadPageData, selectionRange } from "../src/content/runtime/collection-download-selection.js";
import { downloadStatusText, formatDownloadBytes } from "../src/content/runtime/downloads-view.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const redownload = (id) => `https://bandcamp.com/download?from=collection&payment_id=9&sig=abc${id}&sitem_id=${id}`;
const fileUrl = (format) => `https://popplers5.bandcamp.com/download/album?enc=${format}&id=1&sig=s`;

// Formats and keys.
assert.deepEqual(DOWNLOAD_FORMATS.map((format) => format.id),
  ["mp3-v0", "mp3-320", "flac", "aac-hi", "vorbis", "alac", "wav", "aiff-lossless"],
  "Formats must use Bandcamp's own encoding names");
assert.equal(normalizeDownloadFormat("wav"), "wav");
assert.equal(normalizeDownloadFormat("mp4"), "flac", "Unknown formats fall back to FLAC");
assert.equal(redownloadItemKey(redownload(289683291)), "289683291", "The sale item id is the download key");
assert.equal(redownloadItemKey("https://evil.example/download?sitem_id=1&sig=x"), "", "Only Bandcamp download pages are accepted");
assert.equal(redownloadItemKey("https://bandcamp.com/download?sitem_id=1"), "", "Unsigned download links are rejected");

// Download page parsing.
const blob = {
  identities: { fan: { verified: true } },
  digital_items: [{
    sale_item_id: 289683291,
    title: "Apophenia",
    artist: "Panopticum",
    art_id: 2034944049,
    downloads: {
      flac: { size_mb: "212.4MB", url: fileUrl("flac") },
      "mp3-320": { size_mb: "1.1GB", url: fileUrl("mp3-320") },
      wav: { size_mb: "1MB", url: "https://evil.example/download/album" }
    }
  }]
};
const encoded = JSON.stringify(blob).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const html = `<html><body><div id="pagedata" data-blob="${encoded}"></div></body></html>`;
assert.deepEqual(pageDataFromHtml(html), blob, "Entity-encoded page data must decode exactly");
assert.equal(pageDataFromHtml("<div id=\"other\" data-blob=\"{}\"></div>"), null);
assert.equal(parseSizeMb("212.4MB"), 212.4);
assert.equal(parseSizeMb("1.5GB"), 1536);
assert.equal(digitalDownloadFromPageData(blob, "flac", "289683291").url, fileUrl("flac"));
assert.equal(digitalDownloadFromPageData(blob, "aiff-lossless", "289683291").status, "format-missing");
assert.equal(digitalDownloadFromPageData(blob, "wav", "289683291").status, "format-missing", "Untrusted file hosts are never downloaded");
assert.equal(digitalDownloadFromPageData({ identities: { fan: { verified: false } }, digital_items: [{}] }, "flac").status, "unverified");
assert.equal(isDownloadFileUrl("https://p4.bcbits.com/download/track?x=1"), true);
assert.equal(isDownloadFileUrl("http://popplers5.bandcamp.com/download/track"), false);

const statUrl = new URL(statUrlFor(fileUrl("flac"), () => 0.5));
assert.equal(statUrl.pathname, "/statdownload/album");
assert.equal(statUrl.searchParams.get(".vrs"), "1");
assert.equal(statUrl.searchParams.get("enc"), "flac");
const freshUrl = "https://popplers5.bandcamp.com/download/album?enc=flac&fresh=1";
assert.deepEqual(parseStatResponse(`if ( window.Downloads ) { Downloads.statResult ( ${JSON.stringify({ result: "ok", download_url: freshUrl })} ) };`),
  { ready: true, downloadUrl: freshUrl });
assert.deepEqual(parseStatResponse(`statResult({"result":"err","errortype":"ExpiredFreeDownloadError"})`),
  { ready: false, errortype: "ExpiredFreeDownloadError" });
assert.equal(parseStatResponse("<html>"), null);

function fetchStub(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const route = routes.find(([pattern]) => String(url).includes(pattern));
    const [status, body] = typeof route?.[1] === "function" ? route[1]() : route?.[1] || [404, ""];
    return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
  };
  return { impl, calls };
}
const item = { redownloadUrl: redownload(289683291), format: "flac" };
let stub = fetchStub([["bandcamp.com/download?", [200, html]], ["/statdownload/", [200, `statResult(${JSON.stringify({ result: "ok", download_url: freshUrl })})`]]]);
const resolved = await resolveDownload(item, { fetchImpl: stub.impl });
assert.equal(resolved.status, "ok");
assert.equal(resolved.url, freshUrl, "The stat endpoint's fresh link is preferred");
assert.equal(stub.calls[0].options.credentials, "include", "The download page is read with the fan's session");
stub = fetchStub([["bandcamp.com/download?", [200, html]], ["/statdownload/", [200, "statResult({\"result\":\"err\"})"]]]);
assert.equal((await resolveDownload(item, { fetchImpl: stub.impl })).status, "preparing");
stub = fetchStub([["bandcamp.com/download?", [429, ""]]]);
assert.equal((await resolveDownload(item, { fetchImpl: stub.impl })).status, "rate-limited");
assert.equal((await resolveDownload({ ...item, format: "alac" }, { fetchImpl: fetchStub([["bandcamp.com/download?", [200, html]]]).impl })).status, "unavailable");

// Collection paging for "Select all".
let page = 0;
stub = fetchStub([["collection_items", () => {
  page += 1;
  return [200, JSON.stringify({
    items: [{ sale_item_type: "p", sale_item_id: 10 + page, item_title: `Release ${page}`, band_name: "Artist", item_art_id: 5, item_url: "https://artist.bandcamp.com/album/x" },
      { sale_item_type: "p", sale_item_id: 99, item_title: "Vinyl only" }],
    redownload_urls: { [`p${10 + page}`]: redownload(10 + page) },
    more_available: page < 2,
    last_token: `token-${page}`
  })];
}]]);
const listed = await listCollectionDownloads({ fanId: 1795518, olderThanToken: "start" }, { fetchImpl: stub.impl });
assert.deepEqual(listed.items.map((entry) => entry.key), ["11", "12"], "Every page is read and items without a download link are skipped");
assert.equal(JSON.parse(stub.calls[1].options.body).older_than_token, "token-1", "Paging continues from Bandcamp's last token");
assert.equal(listed.items[0].art, "https://f4.bcbits.com/img/a5_7.jpg");

// Queue behaviour with a stubbed chrome.
function createChromeStub({ granted = true } = {}) {
  const local = {};
  const downloads = new Map();
  const listeners = [];
  const calls = { download: [], pause: [], resume: [], cancel: [], show: [] };
  let nextId = 1;
  const api = {
    storage: {
      local: {
        get: async (key) => (Array.isArray(key) ? Object.fromEntries(key.map((name) => [name, local[name]])) : { [key]: local[key] }),
        set: async (values) => { Object.assign(local, structuredClone(values)); }
      }
    },
    permissions: { contains: async () => granted },
    downloads: {
      download: async (options) => {
        const id = nextId++;
        calls.download.push(options);
        downloads.set(id, { id, state: "in_progress", bytesReceived: 50, totalBytes: 100, filename: `/Users/me/Downloads/file-${id}.zip` });
        return id;
      },
      search: async ({ id }) => (downloads.has(id) ? [downloads.get(id)] : []),
      pause: async (id) => { calls.pause.push(id); },
      resume: async (id) => { calls.resume.push(id); },
      cancel: async (id) => { calls.cancel.push(id); },
      show: (id) => { calls.show.push(id); },
      onChanged: { addListener: (listener) => listeners.push(listener) }
    }
  };
  return {
    api, local, downloads, calls,
    grant: () => { granted = true; },
    complete: (id) => {
      downloads.get(id).state = "complete";
      for (const listener of listeners) listener({ id, state: { current: "complete" } });
    }
  };
}

let clock = 1_000_000;
const timers = [];
const queueOptions = (chromeStub, resolve) => ({
  chromeApi: chromeStub.api,
  resolve,
  now: () => clock,
  random: () => 0.5,
  setTimer: (callback, delay) => { timers.push({ callback, at: clock + delay }); return timers.length; },
  clearTimer: () => {}
});
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const incoming = (id) => ({ redownloadUrl: redownload(id), title: `Release ${id}`, artist: "Artist", art: "https://f4.bcbits.com/img/a1_7.jpg", pageUrl: "https://artist.bandcamp.com/album/x" });
const okResolve = async (entry) => ({ status: "ok", url: fileUrl(entry.format), sizeMb: 10 });

let chromeStub = createChromeStub();
let queue = createDownloadQueue(queueOptions(chromeStub, okResolve));
queue.listen();
let result = await queue.enqueue([incoming(1), incoming(2), incoming(3), { redownloadUrl: "https://evil.example/" }], "wav");
await settle();
await queue.pump();
assert.equal(result.added, 3, "Invalid items are dropped");
assert.equal(chromeStub.calls.download.length, 2, "At most two files transfer at once");
assert.equal(chromeStub.calls.download[0].conflictAction, "uniquify");
assert.deepEqual(queue.snapshot().items.map((entry) => entry.status), ["downloading", "downloading", "queued"]);
assert.equal(queue.snapshot().items[0].id, "1:wav");
const progress = await queue.progress();
assert.equal(progress.permission, true);
assert.deepEqual(progress.progress["1:wav"], { received: 50, total: 100, paused: false });
chromeStub.complete(1);
await settle();
await queue.pump();
assert.deepEqual(queue.snapshot().items.map((entry) => entry.id), ["2:wav", "3:wav"], "A finished download leaves the queue");
assert.equal(queue.snapshot().items[1].status, "downloading", "A finished download frees a slot for the next release");
await settle();
assert.equal(chromeStub.local[STORAGE_KEYS.DOWNLOAD_HISTORY]["1"].format, "wav", "Completed releases are remembered");

result = await queue.enqueue([incoming(2)], "wav");
assert.equal(result.added, 0, "A release already downloading is not queued twice");
await queue.command({ action: "pause" });
assert.equal(queue.snapshot().paused, true);
assert.ok(chromeStub.local[STORAGE_KEYS.DOWNLOADS].items.length === 2, "The queue is persisted for every Bandcamp tab");
assert.deepEqual(chromeStub.calls.pause.sort(), [2, 3]);
await queue.command({ action: "resume" });
assert.equal(queue.snapshot().paused, false);
await queue.command({ action: "remove", id: "3:wav" });
assert.deepEqual(chromeStub.calls.cancel, [3], "Removing an active download cancels it in Chrome");
await queue.command({ action: "clear-finished" });
assert.deepEqual(queue.snapshot().items.map((entry) => entry.id), ["2:wav"]);

// Bandcamp still encoding, then rate limiting.
chromeStub = createChromeStub();
let attempts = 0;
queue = createDownloadQueue(queueOptions(chromeStub, async (entry) => {
  attempts += 1;
  return attempts === 1 ? { status: "preparing" } : attempts === 2 ? { status: "rate-limited" } : okResolve(entry);
}));
await queue.enqueue([incoming(7)], "aiff-lossless");
await settle();
await queue.pump();
let entry = queue.snapshot().items[0];
assert.equal(entry.status, "preparing");
assert.equal(entry.retryAt, clock + 15_000, "Preparing formats are checked again after a back-off");
clock += 15_000;
await queue.pump();
assert.equal(queue.snapshot().items[0].status, "queued");
assert.ok(queue.snapshot().holdUntil > clock, "A rate limit holds the whole queue");
await queue.pump();
assert.equal(chromeStub.calls.download.length, 0, "Nothing starts while Bandcamp is limiting downloads");
clock = queue.snapshot().holdUntil + 1;
await queue.pump();
assert.equal(queue.snapshot().items[0].status, "downloading");
await queue.command({ action: "set-format", id: queue.snapshot().items[0].id, format: "flac" });
assert.equal(queue.snapshot().items[0].format, "aiff-lossless", "Only waiting releases can change format");

// Permission is asked for on first use; the queue waits for it.
chromeStub = createChromeStub({ granted: false });
queue = createDownloadQueue(queueOptions(chromeStub, okResolve));
result = await queue.enqueue([incoming(8)], "flac");
await settle();
assert.equal(result.permission, false);
assert.equal(queue.snapshot().items[0].status, "queued");
await queue.command({ action: "set-format", id: "8:flac", format: "mp3-320" });
assert.equal(queue.snapshot().items[0].id, "8:mp3-320", "A waiting release can switch format");
chromeStub.grant();
await queue.resume();
assert.equal(queue.snapshot().items[0].status, "downloading", "Granting the permission starts the queue");

// A restarted worker reconciles what Chrome finished meanwhile.
chromeStub = createChromeStub();
chromeStub.downloads.set(41, { id: 41, state: "complete", filename: "/tmp/Artist - Release.zip" });
chromeStub.local[STORAGE_KEYS.DOWNLOADS] = {
  paused: false,
  holdUntil: 0,
  items: [
    { ...incoming(41), id: "41:flac", key: "41", format: "flac", status: "downloading", downloadId: 41, attempts: 0, retryAt: 0, finishedAt: 0 },
    { ...incoming(42), id: "42:flac", key: "42", format: "flac", status: "resolving", downloadId: null, attempts: 0, retryAt: 0, finishedAt: 0 },
    { ...incoming(43), id: "43:flac", key: "43", format: "flac", status: "done", downloadId: 1, attempts: 0, retryAt: 0, finishedAt: clock - 8 * 24 * 60 * 60 * 1000 }
  ]
};
queue = createDownloadQueue(queueOptions(chromeStub, okResolve));
await queue.resume();
assert.deepEqual(queue.snapshot().items.map((candidate) => [candidate.id, candidate.status]), [["42:flac", "downloading"]],
  "Downloads Chrome finished meanwhile leave the queue, interrupted lookups restart and old finished rows are pruned");
await settle();
assert.equal(chromeStub.local[STORAGE_KEYS.DOWNLOAD_HISTORY]["41"].format, "flac", "A download finished while the worker slept is remembered");

// Collection page helpers.
const pageData = collectionDownloadPageData({
  fan_data: { fan_id: 1795518, is_own_page: true },
  collection_data: {
    item_count: 103,
    last_token: "1715945728:755813864:a::",
    sequence: ["a755813864", "t2599626959"],
    redownload_urls: { p289683291: redownload(289683291) }
  },
  item_cache: { collection: {
    a755813864: { sale_item_type: "p", sale_item_id: 289683291, item_title: "Apophenia", band_name: "Panopticum", item_art_id: 2034944049, item_url: "https://nenormalizm.bandcamp.com/album/apophenia" },
    t2599626959: { sale_item_type: "p", sale_item_id: 1, item_title: "No link" }
  } }
});
assert.equal(pageData.fanId, 1795518);
assert.equal(pageData.itemCount, 103);
assert.deepEqual(pageData.items.map((candidate) => candidate.key), ["289683291"]);
assert.equal(collectionDownloadPageData({ fan_data: { is_own_page: false }, collection_data: {} }), null, "Other fans' collections are never selectable");
assert.deepEqual(selectionRange(["a", "b", "c", "d"], "d", "b"), ["b", "c", "d"]);
assert.deepEqual(selectionRange(["a", "b"], "missing", "b"), ["b"]);
assert.equal(formatDownloadBytes(1.5 * 1024 ** 3), "1.5 GB");
assert.equal(downloadStatusText({ status: "downloading", format: "flac" }, { received: 25, total: 100 }), "25% of 1 KB");
assert.equal(downloadStatusText({ status: "preparing", format: "aiff-lossless" }), "Bandcamp is preparing AIFF");
assert.equal(downloadStatusText({ status: "queued", retryAt: 10 }, null, 5), "Waiting for Bandcamp");

// Source contracts.
const manifest = JSON.parse(read("manifest.json"));
assert.deepEqual(manifest.optional_permissions, ["downloads"], "Downloads must be asked for on first use");
assert.ok(!manifest.permissions.includes("downloads"), "Existing installs must not be disabled by a new required permission");
assert.ok(manifest.web_accessible_resources[0].resources.includes("downloads-permission.html"));
assert.match(read("src/content/runtime/runtime-dom-shell.js"), /id: "downloads", label: "Downloads", icon: "icon-downloads\.svg"/);
assert.match(read("src/styles/hub/navigation.css"), /html:not\(\[data-bandkit-downloads-available="true"\]\)\) :is\([^)]*\.hub-tab\[data-tab="downloads"\]/s,
  "The Downloads tab only appears where it has something to show");
assert.match(read("src/content/runtime/collection-preview.js"), /selectingDownloads\(\) && !event\.target\.closest\("\.item_link_play"\)/,
  "Artwork clicks select releases instead of opening the preview while selecting");
assert.match(read("src/downloads-permission/index.js"), /chrome\.permissions\.request\(PERMISSION\)/);

console.log("Collection downloads: resolver, queue, permission, paging and selection checks passed.");
