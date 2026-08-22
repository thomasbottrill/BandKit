import { MESSAGES, STORAGE_KEYS } from "../shared/contracts.js";

import { artistNameFromHtml, findDigitalOffer, jsonLdProperty, metadataImageFromHtml, stableTrackId, tralbumDataFromHtml } from "./metadata.js";
import { isBandcampUrl, isPublicReleaseUrl, isSupportedBandKitPage } from "./urls.js";

const OFFSCREEN_PATH = "offscreen.html";
const PLAYBACK_KEY = STORAGE_KEYS.PLAYBACK;
const NOW_PLAYING_KEY = STORAGE_KEYS.NOW_PLAYING;
const ENABLED_KEY = STORAGE_KEYS.ENABLED;
const RUNTIME_CONTEXT_READY_KEY = "bandkitRuntimeContextReady";
const BANDCAMP_MATCHES = ["https://bandcamp.com/*", "https://*.bandcamp.com/*"];
let creatingOffscreen = null;
let playbackStateUpdates = Promise.resolve();
let analysisStorageUpdates = Promise.resolve();
let bandcampTabLifecycleChecks = Promise.resolve();
let refreshingBandKitTabsForNewContext = null;
const canonicalReleaseCache = new Map();



async function getBandKitEnabled() {
  const stored = await chrome.storage.local.get(ENABLED_KEY);
  return stored?.[ENABLED_KEY] !== false;
}

function isExtensionSender(sender) {
  return sender?.id === chrome.runtime.id
    || String(sender?.url || "").startsWith(chrome.runtime.getURL(""));
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
      artistUrl: isBandcampUrl(track.artistUrl) || isPublicReleaseUrl(track.artistUrl) ? track.artistUrl : "",
      duration: Number.isFinite(Number(track.duration)) ? Math.max(0, Number(track.duration)) : 0,
      url: stream.href
    };
  } catch {
    return null;
  }
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
      pageRequests.set(pageUrl, fetch(pageUrl, { credentials: "omit", redirect: "follow" }).then(async (response) => {
        if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
        const html = await response.text();
        return {
          tralbum: tralbumDataFromHtml(html),
          artist: artistNameFromHtml(html),
          art: metadataImageFromHtml(html)
        };
      }));
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

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length) return;

  if (!creatingOffscreen) {
    creatingOffscreen = (async () => {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["BLOBS"],
        justification: "Create Blob-backed Bandcamp playback streams without a visible tab."
      });
      const stored = await chrome.storage.session.get(PLAYBACK_KEY);
      if (stored[PLAYBACK_KEY]?.enabled) {
        await chrome.runtime.sendMessage({
          target: "offscreen",
          type: MESSAGES.OFFSCREEN_RESTORE,
          state: stored[PLAYBACK_KEY]
        });
      }
    })().finally(() => {
      creatingOffscreen = null;
    });
  }
  await creatingOffscreen;
}

async function sendOffscreen(message) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
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

async function handlePlaybackRequest(message, sender) {
  if (!isBandcampUrl(sender.url)) throw new Error("Playback requests are only accepted from Bandcamp pages.");

  if (message.type === MESSAGES.DELETE_ALL_DATA) {
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    if (contexts.length) {
      try {
        await chrome.runtime.sendMessage({ target: "offscreen", type: MESSAGES.OFFSCREEN_DISABLE });
        await chrome.offscreen.closeDocument();
      } catch {
        // The offscreen document may be closing while data is cleared.
      }
    }
    await playbackStateUpdates.catch(() => {});
    await Promise.all([
      chrome.storage.local.clear(),
      chrome.storage.session.clear()
    ]);
    await broadcastPlaybackCleared();
    return { ok: true };
  }

  if (message.type === MESSAGES.RESOLVE_CART_ITEMS) {
    return { ok: true, items: await resolveSavedCartItems(message.items) };
  }

  if (message.type === MESSAGES.RESOLVE_CART_METADATA) {
    return { ok: true, items: await resolveCartMetadata(message.items) };
  }

  if (message.type === MESSAGES.RESOLVE_PLAYLIST_ITEMS) {
    return { ok: true, items: await resolvePlaylistItems(message.items) };
  }

  if (message.type === MESSAGES.ANALYZE_TRACKS) {
    const tracks = Array.isArray(message.tracks)
      ? message.tracks.slice(0, 100).map(sanitizeTrack).filter(Boolean)
      : [];
    if (!tracks.length) return { ok: true, results: [] };
    return sendOffscreen({ type: MESSAGES.OFFSCREEN_ANALYZE_TRACKS, tracks, force: message.force === true });
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
      .map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.WISHLIST_UPDATED, key, success: message.success !== false })));
    if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id).catch(() => {});
    return { ok: true };
  }

  if (message.type === MESSAGES.GET_NOW_PLAYING) {
    const stored = await chrome.storage.session.get(NOW_PLAYING_KEY);
    const session = stored[NOW_PLAYING_KEY] || {};
    return {
      ok: true,
      playlist: Array.isArray(session.playlist) ? session.playlist.slice(0, 500) : [],
      playlistMode: session.playlistMode === "manual" ? "manual" : "browse"
    };
  }

  if (message.type === MESSAGES.SET_NOW_PLAYING) {
    const session = {
      playlist: Array.isArray(message.playlist) ? message.playlist.slice(0, 500) : [],
      playlistMode: message.playlistMode === "manual" ? "manual" : "browse"
    };
    const stored = await chrome.storage.session.get(NOW_PLAYING_KEY);
    if (JSON.stringify(stored[NOW_PLAYING_KEY] || {}) === JSON.stringify(session)) return { ok: true };
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
    const response = await sendOffscreen({ type: MESSAGES.OFFSCREEN_DISABLE });
    await broadcastPlaybackCleared();
    return response;
  }

  if (message.type === MESSAGES.SEAMLESS_ENABLE) {
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
    });
  }

  if (message.type === MESSAGES.SEAMLESS_UPDATE_QUEUE) {
    const queue = Array.isArray(message.queue) ? message.queue.slice(0, 500).map(sanitizeTrack).filter(Boolean) : [];
    return sendOffscreen({
      type: MESSAGES.OFFSCREEN_UPDATE_QUEUE,
      queue,
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
    filterValue: Math.max(-1, Math.min(1, Number(message.filterValue) || 0)),
    gainDb: Math.max(-30, Math.min(6, Number(message.gainDb) || 0)),
    eqLowDb: Math.max(-12, Math.min(12, Number(message.eqLowDb) || 0)),
    eqMidDb: Math.max(-12, Math.min(12, Number(message.eqMidDb) || 0)),
    eqHighDb: Math.max(-12, Math.min(12, Number(message.eqHighDb) || 0)),
    active: message.active !== false,
    multiplier: Math.max(0.5, Math.min(1.5, Number(message.multiplier) || 1)),
    beats: [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8].includes(Number(message.beats)) ? Number(message.beats) : 0,
    bpm: Math.max(40, Math.min(300, Number(message.bpm) || 120))
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

chrome.tabs.onRemoved.addListener(() => scheduleBandcampTabLifecycleCheck());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (typeof changeInfo.url === "string") return scheduleBandcampTabLifecycleCheck();
  return undefined;
});
void scheduleBandcampTabLifecycleCheck();
void refreshBandKitTabsForNewContext();
