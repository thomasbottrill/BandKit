import { resolveDiscoverRelease } from "./discover-release.js";
import { fetchArtworkDataUrl } from "./artwork.js";
import { addItemsToCartRemotely, removeItemFromCartRemotely } from "./cart-delegate.js";
import { cartMinimumFor, loadCurrencyMinimums } from "./currency-minimums.js";
import { resolveFeedStreams } from "./feed-streams.js";
import { MESSAGES, STORAGE_KEYS } from "../shared/contracts.js";
import { nowPlayingQueueSignature } from "../shared/now-playing-session.js";
import { createVisualizerDelivery } from "./visualizer-delivery.js";

import { artistNameFromHtml, findDigitalOffer, jsonLdProperty, metadataImageFromHtml, stableTrackId, tralbumDataFromHtml } from "./metadata.js";
import { isBandcampUrl, isPublicReleaseUrl, isSupportedBandKitPage } from "./urls.js";

const OFFSCREEN_PATH = "offscreen.html";
const PLAYBACK_KEY = STORAGE_KEYS.PLAYBACK;
const NOW_PLAYING_KEY = STORAGE_KEYS.NOW_PLAYING;
const ENABLED_KEY = STORAGE_KEYS.ENABLED;
const RUNTIME_CONTEXT_READY_KEY = "bandkitRuntimeContextReady";
const BANDCAMP_MATCHES = ["https://bandcamp.com/*", "https://*.bandcamp.com/*"];
let creatingOffscreen = null;
let restoringOffscreen = null;
let playbackStateUpdates = Promise.resolve();
let playbackOperationVersion = 0;
let analysisStorageUpdates = Promise.resolve();
let bandcampTabLifecycleChecks = Promise.resolve();
let refreshingBandKitTabsForNewContext = null;
const canonicalReleaseCache = new Map();
const fanCollectionCache = new Map();
const FAN_COLLECTION_CACHE_MS = 60_000;
const VISUALIZER_BROADCAST_INTERVAL_MS = 32;
const VISUALIZER_TARGET_CACHE_MS = 1000;
let pendingVisualizerSignal = null;
let visualizerBroadcastTimer = 0;
let visualizerBroadcastRunning = false;
let visualizerBroadcastedAt = 0;
let visualizerTargetCache = { expiresAt: 0, ids: [] };
const deliverVisualizerFrame = createVisualizerDelivery((tabId, message) => chrome.tabs.sendMessage(tabId, message));



async function getBandKitEnabled() {
  const stored = await chrome.storage.local.get(ENABLED_KEY);
  return stored?.[ENABLED_KEY] !== false;
}

function isExtensionSender(sender) {
  return sender?.id === chrome.runtime.id
    || String(sender?.url || "").startsWith(chrome.runtime.getURL(""));
}

async function fanCollectionMatches(fanId, searchKey) {
  const cacheKey = `${fanId}:${searchKey.toLocaleLowerCase()}`;
  const cached = fanCollectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.index || cached.promise;

  const promise = (async () => {
    const response = await fetch("https://bandcamp.com/api/fancollection/1/search_items", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fan_id: fanId, search_key: searchKey, search_type: "collection" })
    });
    if (!response.ok) throw new Error(`Bandcamp collection lookup returned ${response.status}`);
    const data = await response.json();
    if (data?.error) throw new Error("Bandcamp collection lookup failed");
    return Array.isArray(data?.tralbums) ? data.tralbums : [];
  })();

  fanCollectionCache.set(cacheKey, { expiresAt: Date.now() + FAN_COLLECTION_CACHE_MS, promise });
  try {
    const index = await promise;
    fanCollectionCache.set(cacheKey, { expiresAt: Date.now() + FAN_COLLECTION_CACHE_MS, index });
    return index;
  } catch (error) {
    fanCollectionCache.delete(cacheKey);
    throw error;
  }
}

async function resolveCollectionMembership(message) {
  const fanId = Number(message?.fanId);
  const itemId = Number(message?.itemId);
  const albumId = Number(message?.albumId);
  const bandId = Number(message?.bandId);
  const searchKey = String(message?.searchKey || "").trim().slice(0, 300);
  const itemType = message?.itemType === "track" || message?.itemType === "t" ? "t"
    : message?.itemType === "album" || message?.itemType === "a" ? "a" : "";
  if (!Number.isInteger(fanId) || fanId <= 0 || !Number.isInteger(itemId) || itemId <= 0 || !itemType || !searchKey) {
    return { owned: false };
  }
  const matches = await fanCollectionMatches(fanId, searchKey);
  const owned = matches.some((item) => {
    if (Number.isInteger(bandId) && bandId > 0 && Number(item?.band_id) !== bandId) return false;
    const type = String(item?.tralbum_type || item?.item_type || "").charAt(0);
    const id = Number(item?.tralbum_id ?? item?.item_id);
    if (type === itemType && id === itemId) return true;
    if (itemType === "a") return Number(item?.album_id) === itemId;
    return Number.isInteger(albumId) && albumId > 0 && type === "a" && id === albumId;
  });
  return { owned };
}

async function canonicalBandcampReleaseUrl(value) {
  if (isBandcampUrl(value)) return new URL(value).href;
  if (!isPublicReleaseUrl(value)) return "";
  const sourceUrl = new URL(value).href;
  if (canonicalReleaseCache.has(sourceUrl)) return canonicalReleaseCache.get(sourceUrl);
  let tabId = null;
  let canonicalUrl = "";
  try {
    const tab = await chrome.tabs.create({ url: sourceUrl, active: false });
    tabId = tab.id || null;
    for (let attempt = 0; tabId && attempt < 40; attempt += 1) {
      const current = await chrome.tabs.get(tabId);
      if (isBandcampUrl(current?.url)) {
        canonicalUrl = new URL(current.url).href;
        break;
      }
      if (current?.status === "complete" && attempt >= 8) break;
      await new Promise((resolve) => { setTimeout(resolve, 250); });
    }
  } catch {
    canonicalUrl = "";
  } finally {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
  }
  if (canonicalUrl) canonicalReleaseCache.set(sourceUrl, canonicalUrl);
  else canonicalReleaseCache.delete(sourceUrl);
  return canonicalUrl;
}

function sanitizeTrack(track) {
  if (!track || typeof track !== "object") return null;
  try {
    const stream = new URL(track.url);
    const isBcbits = stream.hostname === "bcbits.com" || stream.hostname.endsWith(".bcbits.com");
    const isBandcampRedirect = stream.hostname === "bandcamp.com" && stream.pathname === "/stream_redirect" && stream.searchParams.has("track_id");
    if (stream.protocol !== "https:" || (!isBcbits && !isBandcampRedirect)) return null;
    return {
      id: String(track.id || track.title || stream.href),
      playlistItemId: String(track.playlistItemId || "").slice(0, 500),
      title: String(track.title || "Untitled").slice(0, 500),
      artist: String(track.artist || "Bandcamp").slice(0, 500),
      album: String(track.album || "").slice(0, 500),
      art: typeof track.art === "string" ? track.art.slice(0, 4000) : "",
      pageUrl: isPublicReleaseUrl(track.pageUrl) ? track.pageUrl : "",
      releaseUrl: isPublicReleaseUrl(track.releaseUrl) ? track.releaseUrl : "",
      artistUrl: isBandcampUrl(track.artistUrl) || isPublicReleaseUrl(track.artistUrl) ? track.artistUrl : "",
      duration: Number.isFinite(Number(track.duration)) ? Math.max(0, Number(track.duration)) : 0,
      url: stream.href
    };
  } catch {
    return null;
  }
}


// Bandcamp will not accept a collection add below the per-currency minimum its
// own buy dialog enforces, so report those items rather than letting checkout
// fail on them later with a "price has changed" error.
async function resolveCartMinimums(items) {
  const minimums = await loadCurrencyMinimums();
  return (Array.isArray(items) ? items.slice(0, 200) : []).map((item) => {
    const floor = cartMinimumFor(minimums, item?.currency, item?.itemType);
    const unitPrice = Math.max(0, Number(item?.unitPrice) || 0);
    return Number.isFinite(floor) && floor > 0 && unitPrice < floor
      ? { id: String(item?.id || ""), minimum: floor }
      : null;
  }).filter(Boolean);
}

async function resolveCartMetadata(items) {
  const requests = new Map();
  const readMetadata = (url) => {
    if (!requests.has(url)) {
      requests.set(url, fetch(url, { credentials: "omit", redirect: "follow" }).then(async (response) => {
        if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
        const html = await response.text();
        const tralbum = tralbumDataFromHtml(html);
        const current = tralbum?.current;
        const minimumPrice = Number(current?.minimum_price);
        const itemType = current?.type === "track" ? "track" : current?.type === "album" ? "album" : "";
        const hasDigitalOffer = /class=(['"])[^'"]*\bbuyItem\b[^'"]*\bdigital\b[^'"]*\1/i.test(html)
          || /class=(['"])[^'"]*\bdigital\b[^'"]*\bbuyItem\b[^'"]*\1/i.test(html);
        const isFree = Number(current?.download_pref) === Number(tralbum?.FREE);
        const isPreorder = tralbum?.is_preorder === true || tralbum?.album_is_preorder === true;
        const purchaseStatus = !hasDigitalOffer
          ? itemType === "track" && /buy\s+the\s+full\s+digital\s+album/i.test(html) ? "album-only" : "unavailable"
          : isFree ? "free"
            : isPreorder ? "preorder"
              : minimumPrice === 0 ? "name-your-price"
                : Number.isFinite(minimumPrice) && minimumPrice > 0 ? "priced"
                  : "buy";
        const bandCurrency = html.match(/\bdata-band-currency=(['"])([A-Z]{3})\1/i)?.[2] || "";
        const cartAttribute = html.match(/\bdata-cart=(['"])([\s\S]*?)\1/i)?.[2] || "";
        let currency = String(current?.currency || current?.currency_code || bandCurrency).toUpperCase();
        const minimums = await loadCurrencyMinimums();
        if (!currency && cartAttribute) {
          try {
            const cart = JSON.parse(cartAttribute
              .replace(/&quot;/gi, '"')
              .replace(/&#(?:0*39|x0*27);/gi, "'")
              .replace(/&amp;/gi, "&"));
            currency = String(cart?.currency || "").toUpperCase();
          } catch {
            // Price metadata is optional; retain the artist even if cart data is malformed.
          }
        }
        return {
          artist: artistNameFromHtml(html),
          itemType,
          minimumPrice: Number.isFinite(minimumPrice) && minimumPrice >= 0 ? minimumPrice : null,
          currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
          // Bandcamp's own floor for adding this release to a collection. A
          // name-your-price amount below it produces a cart that only fails
          // when the listener reaches checkout.
          cartMinimum: cartMinimumFor(minimums, currency, itemType),
          purchaseStatus,
          priceIsMinimum: current?.is_set_price !== 1
        };
      }));
    }
    return requests.get(url);
  };
  return Promise.all((Array.isArray(items) ? items : []).slice(0, 100).map(async (item) => {
    const url = isBandcampUrl(item?.url) ? item.url : "";
    if (!url) return { url: "", artist: "" };
    try {
      return { url, ...await readMetadata(url) };
    } catch {
      return { url, artist: "" };
    }
  }));
}

async function resolvePlaylistItems(items) {
  const sourceItems = Array.isArray(items) ? items.slice(0, 500) : [];
  const pageRequests = new Map();
  const readPage = (pageUrl) => {
    if (!pageRequests.has(pageUrl)) {
      pageRequests.set(pageUrl, (async () => {
        let lastError;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch(pageUrl, { credentials: "omit", redirect: "follow", signal: globalThis.AbortSignal.timeout(12_000) });
            if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
            const html = await response.text();
            return {
              tralbum: tralbumDataFromHtml(html),
              artist: artistNameFromHtml(html),
              art: metadataImageFromHtml(html)
            };
          } catch (error) {
            lastError = error;
            if (attempt === 0) await new Promise((resolve) => { setTimeout(resolve, 250); });
          }
        }
        throw lastError;
      })());
    }
    return pageRequests.get(pageUrl);
  };

  const resolved = [];
  for (let offset = 0; offset < sourceItems.length; offset += 6) {
    const batch = sourceItems.slice(offset, offset + 6).map(async (item) => {
      const pageUrl = await canonicalBandcampReleaseUrl(item?.pageUrl);
      if (!pageUrl) return { ...item, restoreError: "missing Bandcamp track page" };
      try {
        const page = await readPage(pageUrl);
        const tralbum = page.tralbum;
        const tracks = Array.isArray(tralbum?.trackinfo) ? tralbum.trackinfo : [];
        const expectedId = String(item.id || "");
        const expectedStableId = stableTrackId(expectedId);
        const expectedTitle = String(item.title || "").replace(/\s+/g, " ").trim().toLowerCase();
        const expectedAlbum = String(item.album || "").replace(/\s+/g, " ").trim().toLowerCase();
        const releaseTitle = String(tralbum?.current?.title || "").replace(/\s+/g, " ").trim().toLowerCase();
        const idMatch = expectedStableId
          ? tracks.find((track) => stableTrackId(track.track_id || track.id) === expectedStableId)
          : null;
        const titleMatch = !expectedStableId && expectedTitle
          ? tracks.find((track) => String(track.title || "").replace(/\s+/g, " ").trim().toLowerCase() === expectedTitle)
          : null;
        const allowReleaseFallback = !expectedStableId
          && (!expectedTitle || expectedTitle === expectedAlbum || expectedTitle === releaseTitle);
        const match = idMatch
          || titleMatch
          || (allowReleaseFallback
            ? tracks.find((track) => String(track.track_id || track.id || "") === String(tralbum?.current?.featured_track_id || ""))
              || tracks.find((track) => track?.file?.["mp3-128"])
            : null);
        const streamUrl = match?.file?.["mp3-128"];
        if (streamUrl) {
          const existingArtist = String(item.artist || "").trim();
          const resolvedArtist = String(match.artist || tralbum?.current?.artist || tralbum?.artist || page.artist || existingArtist || "Bandcamp");
          return {
            ...item,
            id: String(match.track_id || match.id || item.id || item.title),
            title: String(match.title || item.title || "Untitled"),
            artist: resolvedArtist,
            album: String(tralbum?.current?.title || item.album || ""),
            art: String(item.art || page.art || ""),
            pageUrl,
            artistUrl: item.artistUrl && isBandcampUrl(item.artistUrl) ? item.artistUrl : `${new URL(pageUrl).origin}/`,
            duration: Number(match.duration) || Number(item.duration) || 0,
            url: streamUrl,
            restoreError: ""
          };
        }
        if (sanitizeTrack(item)) return { ...item, restoreError: "" };
        return { ...item, restoreError: "track is not currently streamable" };
      } catch (error) {
        if (sanitizeTrack(item)) return { ...item, restoreError: "" };
        return { ...item, restoreError: error.message || "could not refresh the Bandcamp stream" };
      }
    });
    resolved.push(...await Promise.all(batch));
  }
  return resolved;
}


async function resolveSavedCartItem(item) {
  if (!isBandcampUrl(item?.url)) return { ...item, restoreError: "invalid Bandcamp link" };
  if (item.unavailable === true) return { ...item, restoreError: "no longer available" };
  if (item.restore?.item_id && item.restore?.item_type) return item;
  const response = await fetch(item.url, { credentials: "omit", redirect: "follow" });
  if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const json = JSON.parse(match[1]);
      const requestedItemType = ["a", "t"].includes(item.requestedItemType) ? item.requestedItemType : "";
      const offer = findDigitalOffer(json, item.url, requestedItemType, requestedItemType === "t" ? item.title : "");
      if (!offer) continue;
      const itemType = jsonLdProperty(offer, "item_type");
      const itemId = Number(jsonLdProperty(offer, "item_id"));
      const bandId = Number(jsonLdProperty(offer, "selling_band_id") || jsonLdProperty(json.publisher, "band_id"));
      if (!itemId || !bandId) continue;
      const offers = Array.isArray(offer.offers) ? offer.offers[0] : offer.offers;
      const resolvedUrl = isBandcampUrl(offer["@id"]) ? offer["@id"] : item.url;
      return {
        ...item,
        restore: {
          item_type: itemType,
          item_id: itemId,
          item_title: requestedItemType === "a" ? offer.name || item.album || "Bandcamp album" : item.title || offer.name || "Bandcamp track",
          item_title2: null,
          band_id: bandId,
          artist_name: item.artist || json.byArtist?.name || json.publisher?.name || "Bandcamp",
          unit_price: Math.max(0, Number(item.price) || Number(offers?.price) || 0),
          currency: offers?.priceCurrency || "USD",
          quantity: 1,
          option_id: null,
          option_name: null,
          discount_id: null,
          discount_type: null,
          url: resolvedUrl,
          art_id: Number(jsonLdProperty(offer, "art_id") || jsonLdProperty(json, "art_id")) || null,
          image_id: null,
          is_paypalable: true
        }
      };
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  }
  return { ...item, restoreError: "this legacy item is not an identifiable digital album or track" };
}

async function resolveSavedCartItems(items) {
  const resolved = [];
  for (const item of Array.isArray(items) ? items.slice(0, 100) : []) {
    try {
      resolved.push(await resolveSavedCartItem(item));
    } catch (error) {
      resolved.push({ ...item, restoreError: error.message || "could not read the Bandcamp page" });
    }
  }
  return resolved;
}

async function broadcastPlaybackState(state) {
  const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
  await Promise.allSettled(tabs
    .filter((tab) => tab.id)
    .map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.SEAMLESS_STATE, state })));
}

function invalidateVisualizerTargets() {
  visualizerTargetCache.expiresAt = 0;
}

async function activeVisualizerTargetIds() {
  if (visualizerTargetCache.expiresAt > Date.now()) return visualizerTargetCache.ids;
  const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES, active: true });
  const ids = tabs.map((tab) => tab.id).filter(Boolean);
  visualizerTargetCache = { expiresAt: Date.now() + VISUALIZER_TARGET_CACHE_MS, ids };
  return ids;
}

function scheduleVisualizerBroadcast() {
  if (visualizerBroadcastTimer || visualizerBroadcastRunning || !pendingVisualizerSignal) return;
  const elapsed = Date.now() - visualizerBroadcastedAt;
  const delay = Math.max(0, VISUALIZER_BROADCAST_INTERVAL_MS - elapsed);
  visualizerBroadcastTimer = setTimeout(() => {
    visualizerBroadcastTimer = 0;
    void flushVisualizerBroadcast();
  }, delay);
}

async function flushVisualizerBroadcast() {
  if (visualizerBroadcastRunning || !pendingVisualizerSignal) return;
  visualizerBroadcastRunning = true;
  try {
    const ids = await activeVisualizerTargetIds();
    // Tab lookup can yield while more FFT samples arrive. Dispatch the newest.
    const signal = pendingVisualizerSignal;
    pendingVisualizerSignal = null;
    // Do not await receiver acknowledgements: one delayed response must not
    // hold the global frame clock. Delivery bounds outstanding work per tab.
    visualizerBroadcastedAt = Date.now();
    for (const tabId of ids) deliverVisualizerFrame(tabId, { type: MESSAGES.VISUALIZER_STATE, signal });
  } finally {
    visualizerBroadcastRunning = false;
    scheduleVisualizerBroadcast();
  }
}

function queueVisualizerBroadcast(signal) {
  // Keep only the newest FFT frame. Old frames have no value once a newer
  // analyzer sample exists, and allowing them to queue is what caused bursts
  // after transient main-thread or extension-worker stalls.
  pendingVisualizerSignal = signal;
  scheduleVisualizerBroadcast();
}

async function broadcastPlaybackCleared() {
  const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
  await Promise.allSettled(tabs
    .filter((tab) => tab.id)
    .map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.PLAYBACK_CLEARED })));
}

async function broadcastNowPlayingState(state, sourceTabId = null) {
  const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
  await Promise.allSettled(tabs
    .filter((tab) => tab.id && tab.id !== sourceTabId)
    .map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.NOW_PLAYING_STATE, ...state })));
}

async function reloadBandKitTabs() {
  const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
  await Promise.allSettled(tabs
    .filter((tab) => tab.id && isSupportedBandKitPage(tab.url))
    .map((tab) => chrome.tabs.reload(tab.id)));
}

async function refreshBandKitTabsForNewContext() {
  if (refreshingBandKitTabsForNewContext) return refreshingBandKitTabsForNewContext;
  refreshingBandKitTabsForNewContext = (async () => {
    const stored = await chrome.storage.session.get(RUNTIME_CONTEXT_READY_KEY);
    if (stored?.[RUNTIME_CONTEXT_READY_KEY] === true) return false;
    await chrome.storage.session.set({ [RUNTIME_CONTEXT_READY_KEY]: true });
    await reloadBandKitTabs();
    return true;
  })();
  try {
    return await refreshingBandKitTabsForNewContext;
  } finally {
    refreshingBandKitTabsForNewContext = null;
  }
}

async function stopBandKitPlayback() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length) {
    try {
      await chrome.runtime.sendMessage({ target: "offscreen", type: MESSAGES.OFFSCREEN_DISABLE });
    } catch {
      // The offscreen document may not be ready while playback is stopping.
    }
  }
  await playbackStateUpdates.catch(() => {});
  await chrome.storage.session.set({
    [PLAYBACK_KEY]: { enabled: false, status: "idle", isPlaying: false, queue: [], index: -1, track: null }
  });
  await broadcastPlaybackCleared();
}

async function setBandKitEnabled(enabled) {
  const nextEnabled = enabled !== false;
  await chrome.storage.local.set({ [ENABLED_KEY]: nextEnabled });
  if (!nextEnabled) await stopBandKitPlayback();
  await reloadBandKitTabs();
  return nextEnabled;
}

async function ensureOffscreenDocument(replacePlayback = false, restoreOperation = playbackOperationVersion) {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length) {
    await creatingOffscreen;
    if (!replacePlayback) await restoringOffscreen;
    return;
  }

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["BLOBS", "WORKERS"],
      justification: "Play Blob-backed Bandcamp streams and analyse audio in a worker without blocking playback or visualizer sampling."
    }).finally(() => { creatingOffscreen = null; });
    const restoration = creatingOffscreen.then(async () => {
      if (replacePlayback || restoreOperation !== playbackOperationVersion) return;
      const stored = await chrome.storage.session.get(PLAYBACK_KEY);
      if (stored[PLAYBACK_KEY]?.enabled && restoreOperation === playbackOperationVersion) {
        await chrome.runtime.sendMessage({
          target: "offscreen",
          type: MESSAGES.OFFSCREEN_RESTORE,
          state: stored[PLAYBACK_KEY]
        });
      }
    }).finally(() => {
      if (restoringOffscreen === restoration) restoringOffscreen = null;
    });
    restoringOffscreen = restoration;
    void restoration.catch(() => {});
  }
  await creatingOffscreen;
  if (!replacePlayback) await restoringOffscreen;
}

async function sendOffscreen(message, expectedPlaybackOperation = 0) {
  const operation = expectedPlaybackOperation || playbackOperationVersion;
  await ensureOffscreenDocument(Boolean(expectedPlaybackOperation));
  if (operation !== playbackOperationVersion) {
    return { ok: true, stale: true };
  }
  return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
}

async function clearOffscreenPlayback(operation) {
  const idleState = { enabled: false, status: "idle", isPlaying: false, queue: [], index: -1, track: null };
  let timer = 0;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 1500);
  });
  const response = await Promise.race([
    sendOffscreen({ type: MESSAGES.OFFSCREEN_DISABLE }).catch(() => null),
    timeout
  ]);
  clearTimeout(timer);
  if (response?.ok) return response;
  if (operation !== playbackOperationVersion) return { ok: true, stale: true };

  // Chrome can retain an offscreen document across an unpacked-extension
  // reload while its message listener is no longer responsive. Dispose that
  // stale context so the next playback request creates a clean audio runtime.
  await Promise.race([
    chrome.offscreen.closeDocument().catch(() => {}),
    new Promise((resolve) => { setTimeout(resolve, 1000); })
  ]);
  await chrome.storage.session.set({ [PLAYBACK_KEY]: idleState });
  return { ok: true, state: idleState, recovered: true };
}

async function pausePlaybackWithoutBandcampTabs() {
  const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
  if (tabs.some((tab) => tab.id)) return false;
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (!contexts.length) return false;
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: MESSAGES.OFFSCREEN_PAUSE
  });
  if (response?.ok && response.state) {
    await playbackStateUpdates.catch(() => {});
    await chrome.storage.session.set({ [PLAYBACK_KEY]: response.state });
  }
  return true;
}

function scheduleBandcampTabLifecycleCheck() {
  const check = bandcampTabLifecycleChecks.then(pausePlaybackWithoutBandcampTabs);
  bandcampTabLifecycleChecks = check.catch(() => {});
  return check;
}

async function closeOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });
  if (!contexts.length) return;
  try {
    await chrome.runtime.sendMessage({ target: "offscreen", type: MESSAGES.OFFSCREEN_DISABLE });
    await chrome.offscreen.closeDocument();
  } catch {
    // The offscreen document may already be closing.
  }
}

async function handlePlaybackRequest(message, sender) {
  if (!isBandcampUrl(sender.url)) throw new Error("Playback requests are only accepted from Bandcamp pages.");

  if (message.type === MESSAGES.DELETE_ALL_DATA) {
    await closeOffscreenDocument();
    await playbackStateUpdates.catch(() => {});
    await Promise.all([
      chrome.storage.local.clear(),
      chrome.storage.session.clear()
    ]);
    await broadcastPlaybackCleared();
    return { ok: true };
  }

  if (message.type === MESSAGES.FETCH_ARTWORK) return { ok: true, dataUrl: await fetchArtworkDataUrl(message.url) };

  if (message.type === MESSAGES.RESOLVE_CART_ITEMS) {
    return { ok: true, items: await resolveSavedCartItems(message.items) };
  }

  if (message.type === MESSAGES.RESOLVE_CART_METADATA) {
    return { ok: true, items: await resolveCartMetadata(message.items) };
  }

  if (message.type === MESSAGES.RESOLVE_CART_MINIMUMS) {
    return { ok: true, belowMinimum: await resolveCartMinimums(message.items) };
  }

  if (message.type === MESSAGES.RESOLVE_COLLECTION_MEMBERSHIP) {
    return { ok: true, ...await resolveCollectionMembership(message) };
  }

  if (message.type === MESSAGES.RESOLVE_DISCOVER_RELEASE) {
    return { ok: true, release: await resolveDiscoverRelease(message.pageUrl) };
  }

  if (message.type === MESSAGES.CART_ADD_REMOTE) return addItemsToCartRemotely(message);

  if (message.type === MESSAGES.CART_REMOVE_REMOTE) return removeItemFromCartRemotely(message);

  if (message.type === MESSAGES.RESOLVE_FEED_STREAMS) return { ok: true, streams: await resolveFeedStreams(message.items) };

  if (message.type === MESSAGES.RESOLVE_PLAYLIST_ITEMS) {
    return { ok: true, items: await resolvePlaylistItems(message.items) };
  }

  if (message.type === MESSAGES.ANALYZE_TRACKS) {
    const tracks = Array.isArray(message.tracks)
      ? message.tracks.slice(0, 100).map(sanitizeTrack).filter(Boolean)
      : [];
    if (!tracks.length) return { ok: true, results: [] };
    return sendOffscreen({ type: MESSAGES.OFFSCREEN_ANALYZE_TRACKS, tracks, force: message.force === true, deep: message.deep === true });
  }

  if (message.type === MESSAGES.OPEN_COMPONENT_REFERENCE) {
    if (!isExtensionSender(sender)) throw new Error("Only Bandkit can open the component reference.");
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("component-reference.html"), active: true });
    return { ok: true, tabId: tab.id };
  }

  if (message.type === MESSAGES.OPEN_BACKGROUND_TAB) {
    if (!isBandcampUrl(message.url)) throw new Error("Only Bandcamp action pages can be opened.");
    const target = new URL(message.url);
    if (!["#bandkit-wishlist", "#bandkit-cart"].includes(target.hash)) throw new Error("Invalid Bandcamp action.");
    const tab = await chrome.tabs.create({ url: target.href, active: target.hash !== "#bandkit-wishlist" });
    return { ok: true, tabId: tab.id };
  }

  if (message.type === MESSAGES.WISHLIST_RESULT) {
    const key = String(message.key || "").slice(0, 5000);
    const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
    await Promise.allSettled(tabs
      .filter((tab) => tab.id && tab.id !== sender.tab?.id)
      .map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.WISHLIST_UPDATED, key, active: message.active !== false, success: message.success !== false })));
    if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id).catch(() => {});
    return { ok: true };
  }

  if (message.type === MESSAGES.GET_NOW_PLAYING) {
    const stored = await chrome.storage.session.get(NOW_PLAYING_KEY);
    const session = stored[NOW_PLAYING_KEY] || {};
    return {
      ok: true,
      playlist: Array.isArray(session.playlist) ? session.playlist.slice(0, 500) : [],
      playlistMode: session.playlistMode === "manual" ? "manual" : "browse",
      playlistShuffleEnabled: session.playlistShuffleEnabled === true,
      playlistShuffleOrder: Array.isArray(session.playlistShuffleOrder) ? session.playlistShuffleOrder.slice(0, 500) : [],
      revision: Math.max(0, Number(session.revision) || 0),
      transitionTrackKey: String(session.transitionTrackKey || "").slice(0, 2000),
      transitionExpiresAt: Math.max(0, Number(session.transitionExpiresAt) || 0)
    };
  }

  if (message.type === MESSAGES.SET_NOW_PLAYING) {
    const session = {
      playlist: Array.isArray(message.playlist) ? message.playlist.slice(0, 500) : [],
      playlistMode: message.playlistMode === "manual" ? "manual" : "browse",
      playlistShuffleEnabled: message.playlistShuffleEnabled === true,
      playlistShuffleOrder: Array.isArray(message.playlistShuffleOrder) ? message.playlistShuffleOrder.slice(0, 500) : [],
      revision: Math.max(0, Number(message.revision) || 0),
      transitionTrackKey: String(message.transitionTrackKey || "").slice(0, 2000),
      transitionExpiresAt: Math.max(0, Number(message.transitionExpiresAt) || 0)
    };
    const stored = await chrome.storage.session.get(NOW_PLAYING_KEY);
    const current = stored[NOW_PLAYING_KEY] || {};
    const currentRevision = Math.max(0, Number(current.revision) || 0);
    if (session.revision < currentRevision) return { ok: true, stale: true };
    if (session.revision === currentRevision && currentRevision > 0) {
      if (nowPlayingQueueSignature(session) !== nowPlayingQueueSignature(current)) return { ok: true, stale: true };
      if (!current.transitionTrackKey && session.transitionTrackKey) return { ok: true, stale: true };
    }
    if (JSON.stringify(current) === JSON.stringify(session)) return { ok: true };
    await chrome.storage.session.set({ [NOW_PLAYING_KEY]: session });
    await broadcastNowPlayingState(session, sender.tab?.id || null);
    return { ok: true };
  }

  if (message.type === MESSAGES.GET_SEAMLESS_STATE) {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    if (contexts.length) {
      try {
        const live = await chrome.runtime.sendMessage({
          target: "offscreen",
          type: MESSAGES.OFFSCREEN_GET_STATE
        });
        if (live?.ok && live.state) return live;
      } catch {
        // Fall back to the last session snapshot while the offscreen player reconnects.
      }
    }
    const stored = await chrome.storage.session.get(PLAYBACK_KEY);
    return { ok: true, state: stored[PLAYBACK_KEY] || { enabled: false, status: "idle" } };
  }

  if (message.type === MESSAGES.CLEAR_PLAYBACK) {
    const operation = ++playbackOperationVersion;
    const response = await clearOffscreenPlayback(operation);
    if (operation !== playbackOperationVersion) return { ok: true, stale: true };
    await broadcastPlaybackCleared();
    return response;
  }

  if (message.type === MESSAGES.SEAMLESS_ENABLE) {
    const operation = ++playbackOperationVersion;
    const queue = Array.isArray(message.queue) ? message.queue.slice(0, 500).map(sanitizeTrack).filter(Boolean) : [];
    if (!queue.length) throw new Error("This page does not expose a playable Bandcamp stream queue.");
    const index = Math.max(0, Math.min(queue.length - 1, Number(message.index) || 0));
    return sendOffscreen({
      type: MESSAGES.OFFSCREEN_ENABLE,
      queue,
      index,
      currentTime: Math.max(0, Number(message.currentTime) || 0),
      handoffStartedAt: Math.max(0, Number(message.handoffStartedAt) || 0),
      autoplay: Boolean(message.autoplay),
      rate: Math.max(0.35, Math.min(2, Number(message.rate) || 1)),
      preservePitch: message.preservePitch !== false,
      filterValue: Math.max(-1, Math.min(1, Number(message.filterValue) || 0)),
      gainDb: Math.max(-30, Math.min(6, Number(message.gainDb) || 0)),
      eqLowDb: Math.max(-12, Math.min(12, Number(message.eqLowDb) || 0)),
      eqMidDb: Math.max(-12, Math.min(12, Number(message.eqMidDb) || 0)),
      eqHighDb: Math.max(-12, Math.min(12, Number(message.eqHighDb) || 0))
    }, operation);
  }

  if (message.type === MESSAGES.SEAMLESS_UPDATE_QUEUE) {
    const queue = Array.isArray(message.queue) ? message.queue.slice(0, 500).map(sanitizeTrack).filter(Boolean) : [];
    return sendOffscreen({
      type: MESSAGES.OFFSCREEN_UPDATE_QUEUE,
      queue,
      expectedTrack: sanitizeTrack(message.expectedTrack),
      selectedPlaylistItemId: String(message.selectedPlaylistItemId || "").slice(0, 500),
      autoplay: message.autoplay !== false
    });
  }

  if (message.type === MESSAGES.SEAMLESS_PLAY_INDEX) {
    return sendOffscreen({
      type: MESSAGES.OFFSCREEN_PLAY_INDEX,
      index: Math.max(0, Number(message.index) || 0),
      autoplay: message.autoplay !== false
    });
  }

  const allowedCommands = new Set([
    MESSAGES.SEAMLESS_DISABLE,
    MESSAGES.SEAMLESS_PLAY_PAUSE,
    MESSAGES.SEAMLESS_NEXT,
    MESSAGES.SEAMLESS_PREVIOUS,
    MESSAGES.SEAMLESS_SEEK,
    MESSAGES.SEAMLESS_SET_RATE,
    MESSAGES.SEAMLESS_SET_MUTED,
    MESSAGES.SEAMLESS_SET_DJ,
    MESSAGES.SEAMLESS_SCRATCH,
    MESSAGES.SEAMLESS_SET_LOOP,
    MESSAGES.SEAMLESS_SET_BPM,
    MESSAGES.SEAMLESS_RESET_BPM,
    MESSAGES.SEAMLESS_ANALYZE_BPM
  ]);
  if (!allowedCommands.has(message.type)) return null;

  const command = {
    type: message.type.replace(MESSAGES.SEAMLESS_PREFIX, MESSAGES.OFFSCREEN_PREFIX),
    currentTime: Math.max(0, Number(message.currentTime) || 0),
    rate: Math.max(0.35, Math.min(2, Number(message.rate) || 1)),
    preservePitch: message.preservePitch !== false,
    muted: message.muted === true,
    filterValue: Math.max(-1, Math.min(1, Number(message.filterValue) || 0)),
    gainDb: Math.max(-30, Math.min(6, Number(message.gainDb) || 0)),
    eqLowDb: Math.max(-12, Math.min(12, Number(message.eqLowDb) || 0)),
    eqMidDb: Math.max(-12, Math.min(12, Number(message.eqMidDb) || 0)),
    eqHighDb: Math.max(-12, Math.min(12, Number(message.eqHighDb) || 0)),
    active: message.active !== false,
    multiplier: Math.max(0.5, Math.min(1.5, Number(message.multiplier) || 1)),
    beats: [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8].includes(Number(message.beats)) ? Number(message.beats) : 0,
    bpm: Math.max(40, Math.min(300, Number(message.bpm) || 120)),
    deep: message.deep === true
  };
  return sendOffscreen(command);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === "offscreen") return false;

  if (message.type === MESSAGES.OFFSCREEN_GET_ANALYSIS_STORAGE
    || message.type === MESSAGES.OFFSCREEN_SET_ANALYSIS_STORAGE) {
    if (sender.url !== chrome.runtime.getURL(OFFSCREEN_PATH)) {
      sendResponse({ ok: false, error: "Analysis storage is only available to the offscreen player." });
      return true;
    }
    const request = message.type === MESSAGES.OFFSCREEN_GET_ANALYSIS_STORAGE
      ? analysisStorageUpdates.then(() => Promise.all([
        chrome.storage.local.get(STORAGE_KEYS.BPM_CORRECTIONS),
        chrome.storage.session.get(STORAGE_KEYS.TRACK_ANALYSIS_CACHE)
      ])).then(([local, session]) => ({
        ok: true,
        bpmCorrections: local[STORAGE_KEYS.BPM_CORRECTIONS] || {},
        trackAnalysisCache: session[STORAGE_KEYS.TRACK_ANALYSIS_CACHE] || {}
      }))
      : analysisStorageUpdates.then(() => Promise.all([
          Object.hasOwn(message, "bpmCorrections")
            ? chrome.storage.local.set({ [STORAGE_KEYS.BPM_CORRECTIONS]: message.bpmCorrections || {} })
            : Promise.resolve(),
          Object.hasOwn(message, "trackAnalysisCache")
            ? chrome.storage.session.set({ [STORAGE_KEYS.TRACK_ANALYSIS_CACHE]: message.trackAnalysisCache || {} })
            : Promise.resolve()
        ])).then(() => ({ ok: true }));
    if (message.type === MESSAGES.OFFSCREEN_SET_ANALYSIS_STORAGE) {
      analysisStorageUpdates = request.catch(() => {});
    }
    request
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGES.GET_ENABLED || message.type === MESSAGES.SET_ENABLED) {
    if (!isExtensionSender(sender)) {
      sendResponse({ ok: false, error: "Activation can only be changed from Bandkit." });
      return false;
    }
    const request = message.type === MESSAGES.GET_ENABLED
      ? getBandKitEnabled()
      : setBandKitEnabled(message.enabled);
    request
      .then((enabled) => sendResponse({ ok: true, enabled }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGES.OFFSCREEN_STATE) {
    if (sender.url !== chrome.runtime.getURL(OFFSCREEN_PATH)) return false;
    const update = playbackStateUpdates.then(async () => {
      await chrome.storage.session.set({ [PLAYBACK_KEY]: message.state });
      await broadcastPlaybackState(message.state);
    });
    playbackStateUpdates = update.catch(() => {});
    update
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === MESSAGES.OFFSCREEN_VISUALIZER) {
    if (sender.url !== chrome.runtime.getURL(OFFSCREEN_PATH)) return false;
    queueVisualizerBroadcast(message.signal || {});
    sendResponse({ ok: true });
    return false;
  }

  if (!String(message.type || "").startsWith("BANDCAMP_HUB_")) return false;
  getBandKitEnabled()
    .then((enabled) => {
      if (!enabled) return { ok: false, error: "Bandkit is deactivated." };
      return handlePlaybackRequest(message, sender);
    })
    .then((response) => sendResponse(response || { ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function toggleBandKitInTab(tab) {
  if (!tab.id || !isSupportedBandKitPage(tab.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.TOGGLE });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["cart-autosave.js", "content.js"] });
      await new Promise((resolve) => { setTimeout(resolve, 250); });
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.OPEN });
    } catch (error) {
      console.warn("Bandkit could not start on this tab.", error);
    }
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-bandkit") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await toggleBandKitInTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  void refreshBandKitTabsForNewContext();
});

chrome.tabs.onRemoved.addListener(() => {
  invalidateVisualizerTargets();
  return scheduleBandcampTabLifecycleCheck();
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (typeof changeInfo.url === "string") {
    invalidateVisualizerTargets();
    return scheduleBandcampTabLifecycleCheck();
  }
  return undefined;
});
chrome.tabs.onActivated?.addListener(invalidateVisualizerTargets);
chrome.windows.onFocusChanged?.addListener(invalidateVisualizerTargets);
void scheduleBandcampTabLifecycleCheck();
void refreshBandKitTabsForNewContext();
