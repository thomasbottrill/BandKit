(() => {
  // src/shared/contracts.js
  var STORAGE_KEYS = Object.freeze({
    BPM_CORRECTIONS: "bandcampHubBpmCorrections",
    ENABLED: "bandcampHubEnabled",
    LAYOUT: "bandcampHubLayout",
    PLAYBACK: "bandcampHubPlayback",
    STATE: "bandcampHubState"
  });
  var MESSAGES = Object.freeze({
    CLEAR_PLAYBACK: "BANDCAMP_HUB_CLEAR_PLAYBACK",
    DELETE_ALL_DATA: "BANDCAMP_HUB_DELETE_ALL_DATA",
    GET_ENABLED: "BANDCAMP_HUB_GET_ENABLED",
    GET_SEAMLESS_STATE: "BANDCAMP_HUB_GET_SEAMLESS_STATE",
    OFFSCREEN_PREFIX: "BANDCAMP_HUB_OFFSCREEN_",
    OFFSCREEN_ANALYZE_TRACKS: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_TRACKS",
    OFFSCREEN_ANALYZE_BPM: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM",
    OFFSCREEN_DISABLE: "BANDCAMP_HUB_OFFSCREEN_DISABLE",
    OFFSCREEN_ENABLE: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
    OFFSCREEN_GET_STATE: "BANDCAMP_HUB_OFFSCREEN_GET_STATE",
    OFFSCREEN_NEXT: "BANDCAMP_HUB_OFFSCREEN_NEXT",
    OFFSCREEN_PLAY_INDEX: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX",
    OFFSCREEN_PLAY_PAUSE: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE",
    OFFSCREEN_PREVIOUS: "BANDCAMP_HUB_OFFSCREEN_PREVIOUS",
    OFFSCREEN_RESET_BPM: "BANDCAMP_HUB_OFFSCREEN_RESET_BPM",
    OFFSCREEN_RESTORE: "BANDCAMP_HUB_OFFSCREEN_RESTORE",
    OFFSCREEN_SCRATCH: "BANDCAMP_HUB_OFFSCREEN_SCRATCH",
    OFFSCREEN_SEEK: "BANDCAMP_HUB_OFFSCREEN_SEEK",
    OFFSCREEN_SET_BPM: "BANDCAMP_HUB_OFFSCREEN_SET_BPM",
    OFFSCREEN_SET_DJ: "BANDCAMP_HUB_OFFSCREEN_SET_DJ",
    OFFSCREEN_SET_LOOP: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP",
    OFFSCREEN_SET_RATE: "BANDCAMP_HUB_OFFSCREEN_SET_RATE",
    OFFSCREEN_STATE: "BANDCAMP_HUB_OFFSCREEN_STATE",
    OFFSCREEN_UPDATE_QUEUE: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
    OPEN: "BANDCAMP_HUB_OPEN",
    OPEN_BACKGROUND_TAB: "BANDCAMP_HUB_OPEN_BACKGROUND_TAB",
    PING: "BANDCAMP_HUB_PING",
    PLAYBACK_CLEARED: "BANDCAMP_HUB_PLAYBACK_CLEARED",
    RESOLVE_CART_ITEMS: "BANDCAMP_HUB_RESOLVE_CART_ITEMS",
    RESOLVE_CART_METADATA: "BANDCAMP_HUB_RESOLVE_CART_METADATA",
    RESOLVE_PLAYLIST_ITEMS: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
    RESTORE_CART: "BANDCAMP_HUB_RESTORE_CART",
    SEAMLESS_PREFIX: "BANDCAMP_HUB_SEAMLESS_",
    ANALYZE_TRACKS: "BANDCAMP_HUB_ANALYZE_TRACKS",
    SEAMLESS_ANALYZE_BPM: "BANDCAMP_HUB_SEAMLESS_ANALYZE_BPM",
    SEAMLESS_DISABLE: "BANDCAMP_HUB_SEAMLESS_DISABLE",
    SEAMLESS_ENABLE: "BANDCAMP_HUB_SEAMLESS_ENABLE",
    SEAMLESS_NEXT: "BANDCAMP_HUB_SEAMLESS_NEXT",
    SEAMLESS_PLAY_INDEX: "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX",
    SEAMLESS_PLAY_PAUSE: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE",
    SEAMLESS_PREVIOUS: "BANDCAMP_HUB_SEAMLESS_PREVIOUS",
    SEAMLESS_RESET_BPM: "BANDCAMP_HUB_SEAMLESS_RESET_BPM",
    SEAMLESS_SCRATCH: "BANDCAMP_HUB_SEAMLESS_SCRATCH",
    SEAMLESS_SEEK: "BANDCAMP_HUB_SEAMLESS_SEEK",
    SEAMLESS_SET_BPM: "BANDCAMP_HUB_SEAMLESS_SET_BPM",
    SEAMLESS_SET_DJ: "BANDCAMP_HUB_SEAMLESS_SET_DJ",
    SEAMLESS_SET_LOOP: "BANDCAMP_HUB_SEAMLESS_SET_LOOP",
    SEAMLESS_SET_RATE: "BANDCAMP_HUB_SEAMLESS_SET_RATE",
    SEAMLESS_STATE: "BANDCAMP_HUB_SEAMLESS_STATE",
    SEAMLESS_UPDATE_QUEUE: "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE",
    SET_ENABLED: "BANDCAMP_HUB_SET_ENABLED",
    TOGGLE: "BANDCAMP_HUB_TOGGLE",
    WISHLIST_RESULT: "BANDCAMP_HUB_WISHLIST_RESULT",
    WISHLIST_UPDATED: "BANDCAMP_HUB_WISHLIST_UPDATED"
  });

  // src/background/metadata.js
  function stableTrackId(value) {
    const match = String(value || "").trim().match(/^(?:track-)?(\d+)$/i);
    return match ? match[1].replace(/^0+(?=\d)/, "") : "";
  }
  function decodeHtmlAttribute(value) {
    return String(value || "").replace(/&quot;/gi, '"').replace(/&#(?:0*39|x0*27);/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
  }
  function tralbumDataFromHtml(html) {
    const match = String(html || "").match(/<script[^>]+data-tralbum=(['"])([\s\S]*?)\1[^>]*>/i);
    if (!match) return null;
    try {
      return JSON.parse(decodeHtmlAttribute(match[2]));
    } catch {
      return null;
    }
  }
  function artistNameFromHtml(html) {
    const tralbumArtist = String(tralbumDataFromHtml(html)?.artist || "").trim();
    if (tralbumArtist) return tralbumArtist;
    const scripts = [...String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of scripts) {
      try {
        const json = JSON.parse(match[1]);
        const candidates = Array.isArray(json) ? json : [json];
        for (const candidate of candidates) {
          const artist = candidate?.byArtist?.name || candidate?.publisher?.name || candidate?.brand?.name;
          if (String(artist || "").trim()) return String(artist).trim();
        }
      } catch {
      }
    }
    return "";
  }
  function metadataImageFromHtml(html) {
    for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
      const property = tag.match(/\b(?:property|name)\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase();
      if (!["og:image", "twitter:image"].includes(property)) continue;
      const content = decodeHtmlAttribute(tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || "");
      try {
        const url = new URL(content.startsWith("//") ? `https:${content}` : content);
        if (url.protocol === "https:") return url.href;
      } catch {
      }
    }
    return "";
  }
  function jsonLdProperty(object, name) {
    return object?.additionalProperty?.find((property) => property?.name === name)?.value;
  }
  function findDigitalOffer(json, itemUrl, requestedItemType = "", requestedTitle = "") {
    const candidates = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(visit);
      const itemType = jsonLdProperty(value, "item_type");
      if ((itemType === "a" || itemType === "t") && value.offers) candidates.push(value);
      for (const child of Object.values(value)) visit(child);
    };
    visit(json);
    const expectedType = ["a", "t"].includes(requestedItemType) ? requestedItemType : new URL(itemUrl).pathname.includes("/track/") ? "t" : "a";
    const typedCandidates = candidates.filter((candidate) => jsonLdProperty(candidate, "item_type") === expectedType);
    const normalizedTitle = String(requestedTitle || "").replace(/\s+/g, " ").trim().toLowerCase();
    const titleMatch = normalizedTitle && typedCandidates.find((candidate) => String(candidate.name || "").replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle);
    return titleMatch || new URL(itemUrl).pathname.includes(`/${expectedType === "t" ? "track" : "album"}/`) && typedCandidates.find((candidate) => candidate["@id"] === itemUrl) || !normalizedTitle && typedCandidates[0] || !requestedItemType && candidates.find((candidate) => candidate["@id"] === itemUrl) || !requestedItemType && candidates[0] || null;
  }

  // src/background/urls.js
  function isBandcampUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com"));
    } catch {
      return false;
    }
  }
  function isSupportedBandKitPage(value) {
    try {
      const url = new URL(value);
      if (!isBandcampUrl(url.href)) return false;
      if (["blog.bandcamp.com", "daily.bandcamp.com", "get.bandcamp.com", "help.bandcamp.com", "www.bandcamp.com"].includes(url.hostname)) return false;
      return url.hostname !== "bandcamp.com" || !/^\/(?:about|buttons|copyright|developer|help|privacy|terms_of_use)(?:\/|$)/.test(url.pathname);
    } catch {
      return false;
    }
  }
  function isPublicReleaseUrl(value) {
    if (isBandcampUrl(value)) return true;
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
      const privateIpv4 = ipv4 && (ipv4.some((part) => part > 255) || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 169 && ipv4[1] === 254 || ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31 || ipv4[0] === 192 && ipv4[1] === 168);
      return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && hostname && hostname !== "localhost" && !hostname.endsWith(".localhost") && !hostname.endsWith(".local") && !hostname.includes(":") && !privateIpv4 && /^\/(?:album|track)\/[^/]+/.test(url.pathname);
    } catch {
      return false;
    }
  }

  // src/background/index.js
  var OFFSCREEN_PATH = "offscreen.html";
  var PLAYBACK_KEY = STORAGE_KEYS.PLAYBACK;
  var ENABLED_KEY = STORAGE_KEYS.ENABLED;
  var BANDCAMP_MATCHES = ["https://bandcamp.com/*", "https://*.bandcamp.com/*"];
  var creatingOffscreen = null;
  var playbackStateUpdates = Promise.resolve();
  var canonicalReleaseCache = /* @__PURE__ */ new Map();
  async function getBandKitEnabled() {
    const stored = await chrome.storage.local.get(ENABLED_KEY);
    return stored?.[ENABLED_KEY] !== false;
  }
  function isExtensionSender(sender) {
    return sender?.id === chrome.runtime.id || String(sender?.url || "").startsWith(chrome.runtime.getURL(""));
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
        await new Promise((resolve) => {
          setTimeout(resolve, 250);
        });
      }
    } catch {
      canonicalUrl = "";
    } finally {
      if (tabId) await chrome.tabs.remove(tabId).catch(() => {
      });
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
      if (stream.protocol !== "https:" || !isBcbits && !isBandcampRedirect) return null;
      return {
        id: String(track.id || track.title || stream.href),
        playlistItemId: String(track.playlistItemId || "").slice(0, 500),
        title: String(track.title || "Untitled").slice(0, 500),
        artist: String(track.artist || "Bandcamp").slice(0, 500),
        album: String(track.album || "").slice(0, 500),
        art: typeof track.art === "string" ? track.art.slice(0, 4e3) : "",
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
    const requests = /* @__PURE__ */ new Map();
    const readMetadata = (url) => {
      if (!requests.has(url)) {
        requests.set(url, fetch(url, { credentials: "omit", redirect: "follow" }).then(async (response) => {
          if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
          const html = await response.text();
          const tralbum = tralbumDataFromHtml(html);
          const current = tralbum?.current;
          const minimumPrice = Number(current?.minimum_price);
          const cartAttribute = html.match(/\bdata-cart=(['"])([\s\S]*?)\1/i)?.[2] || "";
          let currency = String(current?.currency || current?.currency_code || "").toUpperCase();
          if (!currency && cartAttribute) {
            try {
              const cart = JSON.parse(cartAttribute.replace(/&quot;/gi, '"').replace(/&#(?:0*39|x0*27);/gi, "'").replace(/&amp;/gi, "&"));
              currency = String(cart?.currency || "").toUpperCase();
            } catch {
            }
          }
          return {
            artist: artistNameFromHtml(html),
            itemType: current?.type === "track" ? "track" : current?.type === "album" ? "album" : "",
            minimumPrice: Number.isFinite(minimumPrice) && minimumPrice >= 0 ? minimumPrice : null,
            currency: /^[A-Z]{3}$/.test(currency) ? currency : ""
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
    const pageRequests = /* @__PURE__ */ new Map();
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
          const idMatch = expectedStableId ? tracks.find((track) => stableTrackId(track.track_id || track.id) === expectedStableId) : null;
          const titleMatch = !expectedStableId && expectedTitle ? tracks.find((track) => String(track.title || "").replace(/\s+/g, " ").trim().toLowerCase() === expectedTitle) : null;
          const allowReleaseFallback = !expectedStableId && (!expectedTitle || expectedTitle === expectedAlbum || expectedTitle === releaseTitle);
          const match = idMatch || titleMatch || (allowReleaseFallback ? tracks.find((track) => String(track.track_id || track.id || "") === String(tralbum?.current?.featured_track_id || "")) || tracks.find((track) => track?.file?.["mp3-128"]) : null);
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
    await Promise.allSettled(tabs.filter((tab) => tab.id).map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.SEAMLESS_STATE, state })));
  }
  async function broadcastPlaybackCleared() {
    const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
    await Promise.allSettled(tabs.filter((tab) => tab.id).map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.PLAYBACK_CLEARED })));
  }
  async function reloadBandKitTabs() {
    const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
    await Promise.allSettled(tabs.filter((tab) => tab.id && isSupportedBandKitPage(tab.url)).map((tab) => chrome.tabs.reload(tab.id)));
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
        await chrome.offscreen.closeDocument();
      } catch {
      }
    }
    await playbackStateUpdates.catch(() => {
    });
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
          reasons: ["AUDIO_PLAYBACK"],
          justification: "Keep user-initiated Bandcamp playback running while the user navigates between Bandcamp pages."
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
        }
      }
      await playbackStateUpdates.catch(() => {
      });
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
      const tracks = Array.isArray(message.tracks) ? message.tracks.slice(0, 100).map(sanitizeTrack).filter(Boolean) : [];
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
      const key = String(message.key || "").slice(0, 5e3);
      const tabs = await chrome.tabs.query({ url: BANDCAMP_MATCHES });
      await Promise.allSettled(tabs.filter((tab) => tab.id && tab.id !== sender.tab?.id).map((tab) => chrome.tabs.sendMessage(tab.id, { type: MESSAGES.WISHLIST_UPDATED, key, success: message.success !== false })));
      if (sender.tab?.id) await chrome.tabs.remove(sender.tab.id).catch(() => {
      });
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
      return sendOffscreen({ type: MESSAGES.OFFSCREEN_UPDATE_QUEUE, queue });
    }
    if (message.type === MESSAGES.SEAMLESS_PLAY_INDEX) {
      return sendOffscreen({
        type: MESSAGES.OFFSCREEN_PLAY_INDEX,
        index: Math.max(0, Number(message.index) || 0),
        autoplay: message.autoplay !== false
      });
    }
    const allowedCommands = /* @__PURE__ */ new Set([
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
    if (message.type === MESSAGES.GET_ENABLED || message.type === MESSAGES.SET_ENABLED) {
      if (!isExtensionSender(sender)) {
        sendResponse({ ok: false, error: "Activation can only be changed from Bandkit." });
        return false;
      }
      const request = message.type === MESSAGES.GET_ENABLED ? getBandKitEnabled() : setBandKitEnabled(message.enabled);
      request.then((enabled) => sendResponse({ ok: true, enabled })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === MESSAGES.OFFSCREEN_STATE) {
      if (sender.url !== chrome.runtime.getURL(OFFSCREEN_PATH)) return false;
      const update = playbackStateUpdates.then(async () => {
        await chrome.storage.session.set({ [PLAYBACK_KEY]: message.state });
        await broadcastPlaybackState(message.state);
      });
      playbackStateUpdates = update.catch(() => {
      });
      update.then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (!String(message.type || "").startsWith("BANDCAMP_HUB_")) return false;
    getBandKitEnabled().then((enabled) => {
      if (!enabled) return { ok: false, error: "Bandkit is deactivated." };
      return handlePlaybackRequest(message, sender);
    }).then((response) => sendResponse(response || { ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
  async function toggleBandKitInTab(tab) {
    if (!tab.id || !isSupportedBandKitPage(tab.url)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MESSAGES.TOGGLE });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["cart-autosave.js", "content.js"] });
        await new Promise((resolve) => {
          setTimeout(resolve, 250);
        });
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
})();
