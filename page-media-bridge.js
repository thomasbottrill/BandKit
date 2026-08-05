(() => {
  if (window.__bandkitMediaBridgeInstalled) return;
  window.__bandkitMediaBridgeInstalled = true;

  const tracked = new Set();
  let activeMedia = null;
  let lastEmit = 0;
  let lastCartSignature = "";

  const cartFields = [
    "id", "local_id", "item_type", "item_id", "item_title", "item_title2", "releases", "band_id",
    "artist_name", "unit_price", "currency", "quantity", "option_id", "option_name",
    "discount_id", "discount_type", "url", "art_id", "image_id", "purchase_note",
    "album_art_id", "item_art_id", "item_art_url", "art_url", "band_name", "band_title",
    "selling_band_name", "artist", "artist_title", "album_title",
    "notify_me", "notify_me_label", "license_id", "associated_license_id", "is_paypalable"
  ];

  const releaseFields = [
    "item_type", "item_id", "title", "item_title", "album_title", "artist", "artist_name",
    "band_name", "band_title", "selling_band_name", "artist_title", "url", "art_id", "image_id", "album_art_id", "item_art_id", "item_art_url", "art_url"
  ];

  function releaseData(releases) {
    const source = Array.isArray(releases)
      ? releases
      : releases && typeof releases === "object"
        ? Object.values(releases)
        : [];
    const candidates = source.flatMap((release) => Array.isArray(release) ? release : [release]);
    return candidates.slice(0, 25).map((release) => {
      const data = {};
      for (const field of releaseFields) {
        const value = release?.[field];
        if (["string", "number", "boolean"].includes(typeof value) || value === null) data[field] = value;
      }
      return data;
    }).filter((release) => Object.keys(release).length);
  }

  function cartItemData(item) {
    const data = {};
    for (const field of cartFields) {
      const value = item?.[field];
      if (field === "releases") {
        data.releases = releaseData(value);
        continue;
      }
      if (["string", "number", "boolean"].includes(typeof value) || value === null) data[field] = value;
    }
    return data;
  }

  function emitCart(force = false) {
    if (!window.Sidecart || !Array.isArray(window.Sidecart.cart_items)) return;
    const nativeItemList = document.querySelector?.("#sidecart #item_list");
    const renderedItemCount = nativeItemList?.querySelectorAll?.(":scope > .item").length;
    // Bandcamp can leave the final deleted item in Sidecart.cart_items even after
    // its rendered cart is empty. The rendered native cart is authoritative here.
    const nativeItems = nativeItemList && renderedItemCount === 0 ? [] : window.Sidecart.cart_items;
    const items = nativeItems.map(cartItemData);
    const summary = {
      subtotal: items.length === 0 ? 0 : Number.isFinite(Number(window.Sidecart.subtotal)) ? Number(window.Sidecart.subtotal) : null,
      currency: typeof window.ClientPrefs?.currency === "string" ? window.ClientPrefs.currency : null
    };
    const signature = JSON.stringify({ items, summary });
    if (!force && signature === lastCartSignature) return;
    lastCartSignature = signature;
    document.dispatchEvent(new CustomEvent("bandkit:cart-state", { detail: { items, summary } }));
  }

  function cartItemKey(item) {
    return [item.item_type, item.item_id, item.option_id ?? "", item.discount_id ?? ""].join(":");
  }

  function waitForCartItem(key, previousLocalIds, timeout = 10000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        const match = window.Sidecart?.cart_items?.find((item) => cartItemKey(item) === key && !previousLocalIds.has(item.local_id));
        if (match?.id) return resolve(true);
        if (Date.now() - startedAt >= timeout) return resolve(false);
        window.setTimeout(check, 120);
      };
      check();
    });
  }

  function waitForCartItemRemoval(item, timeout = 10000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        const stillPresent = window.Sidecart?.cart_items?.some((candidate) => (
          item.local_id != null
            ? candidate.local_id === item.local_id
            : cartItemKey(candidate) === cartItemKey(item)
        ));
        if (!stillPresent) return resolve(true);
        if (Date.now() - startedAt >= timeout) return resolve(false);
        window.setTimeout(check, 120);
      };
      check();
    });
  }

  async function removeCartItem(request) {
    const result = { requestId: request.requestId, removed: false };
    if (!window.Sidecart?.delete_from_cart || !Array.isArray(window.Sidecart.cart_items)) {
      result.error = "Bandcamp's cart is not available on this page yet.";
    } else {
      const requestedItem = request.item;
      const match = requestedItem && window.Sidecart.cart_items.find((candidate) => (
        requestedItem.local_id != null && candidate.local_id === requestedItem.local_id
      )) || (requestedItem && window.Sidecart.cart_items.find((candidate) => (
        cartItemKey(candidate) === cartItemKey(requestedItem)
      )));
      if (!match) {
        result.removed = true;
        result.alreadyAbsent = true;
      } else {
        try {
          window.Sidecart.delete_from_cart(match);
          result.removed = await waitForCartItemRemoval(match);
          if (!result.removed) result.error = "Bandcamp did not confirm the removal.";
        } catch (error) {
          result.error = error?.message || "Bandcamp could not remove this item.";
        }
      }
      emitCart(true);
    }
    document.dispatchEvent(new CustomEvent("bandkit:cart-remove-result", { detail: result }));
  }

  async function restoreCart(request) {
    const result = { requestId: request.requestId, added: 0, alreadyPresent: 0, failed: [] };
    if (!window.Sidecart?.add_to_cart || !Array.isArray(window.Sidecart.cart_items)) {
      result.error = "Bandcamp's cart is not available on this page yet.";
    } else {
      for (const entry of Array.isArray(request.items) ? request.items.slice(0, 100) : []) {
        const item = entry?.restore;
        const key = item && cartItemKey(item);
        if (!item || !["a", "t", "b", "p"].includes(item.item_type) || !Number.isFinite(Number(item.item_id))) {
          result.failed.push({ title: entry?.title || "Bandcamp item", reason: "missing exact product metadata" });
          continue;
        }
        if (window.Sidecart.cart_items.some((candidate) => cartItemKey(candidate) === key)) {
          result.alreadyPresent += 1;
          continue;
        }
        const previousLocalIds = new Set(window.Sidecart.cart_items.map((candidate) => candidate.local_id));
        try {
          window.Sidecart.add_to_cart({
            ...item,
            item_id: Number(item.item_id),
            band_id: Number(item.band_id) || null,
            unit_price: Math.max(0, Number(item.unit_price) || 0),
            quantity: Math.max(1, Number(item.quantity) || 1),
            associated_license_id: item.associated_license_id ?? item.license_id ?? null,
            checkout_now: false,
            is_gift: false
          });
          if (await waitForCartItem(key, previousLocalIds)) result.added += 1;
          else result.failed.push({ title: entry.title || item.item_title || "Bandcamp item", reason: "Bandcamp did not confirm the add" });
        } catch (error) {
          result.failed.push({ title: entry.title || item.item_title || "Bandcamp item", reason: error?.message || "add failed" });
        }
      }
      emitCart(true);
    }
    document.dispatchEvent(new CustomEvent("bandkit:cart-restore-result", { detail: result }));
  }

  function stateFor(media) {
    if (!media) return null;
    return {
      src: media.currentSrc || media.src || "",
      paused: Boolean(media.paused),
      ended: Boolean(media.ended),
      currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      playbackRate: Number.isFinite(media.playbackRate) ? media.playbackRate : 1,
      volume: Number.isFinite(media.volume) ? media.volume : 1
    };
  }

  function emit(media = activeMedia, force = false) {
    if (!media) return;
    const now = Date.now();
    if (!force && now - lastEmit < 180) return;
    lastEmit = now;
    document.dispatchEvent(new CustomEvent("bandkit:media-state", { detail: stateFor(media) }));
  }

  function track(media) {
    if (!(media instanceof HTMLMediaElement) || tracked.has(media)) return media;
    tracked.add(media);
    for (const type of ["play", "playing", "pause", "ended", "loadedmetadata", "durationchange", "ratechange", "volumechange", "seeked"]) {
      media.addEventListener(type, () => {
        activeMedia = media;
        emit(media, true);
      });
    }
    media.addEventListener("timeupdate", () => {
      activeMedia = media;
      emit(media);
    });
    return media;
  }

  const NativeAudio = window.Audio;
  function BandKitAudio(...args) {
    return track(new NativeAudio(...args));
  }
  BandKitAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(BandKitAudio, NativeAudio);
  window.Audio = BandKitAudio;

  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    activeMedia = track(this);
    const result = nativePlay.apply(this, args);
    emit(this, true);
    return result;
  };

  document.addEventListener("bandkit:media-command", (event) => {
    const command = event.detail || {};
    const media = activeMedia || [...tracked].find((candidate) => candidate.currentSrc || candidate.src);
    if (!media) return;
    activeMedia = media;
    if (command.action === "getState") {
      emit(media, true);
      return;
    }
    if (command.action === "play") void media.play().catch(() => {});
    if (command.action === "pause") media.pause();
    if (command.action === "playPause") {
      if (media.paused) void media.play().catch(() => {});
      else media.pause();
    }
    if (command.action === "seek" && Number.isFinite(Number(command.currentTime))) {
      const duration = Number.isFinite(media.duration) ? media.duration : Infinity;
      media.currentTime = Math.max(0, Math.min(duration, Number(command.currentTime)));
    }
    if (command.action === "setDj") {
      const rate = Math.max(0.5, Math.min(1.5, Number(command.rate) || 1));
      media.defaultPlaybackRate = rate;
      media.playbackRate = rate;
      if ("preservesPitch" in media) media.preservesPitch = command.preservePitch !== false;
      if ("webkitPreservesPitch" in media) media.webkitPreservesPitch = command.preservePitch !== false;
      const gainDb = Math.max(-30, Math.min(6, Number(command.gainDb) || 0));
      media.volume = gainDb <= -30 ? 0 : Math.min(1, Math.pow(10, gainDb / 20));
    }
    emit(media, true);
  });

  document.addEventListener("bandkit:cart-command", (event) => {
    if (event.detail?.action === "restore") void restoreCart(event.detail);
    if (event.detail?.action === "remove") void removeCartItem(event.detail);
    if (event.detail?.action === "getState") emitCart(true);
  });

  window.setInterval(emitCart, 800);
})();
