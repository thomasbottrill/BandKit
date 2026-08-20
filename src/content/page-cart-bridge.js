export function installCartBridge() {
  let lastCartSignature = "";
  const cartFields = [
    "id", "local_id", "item_type", "item_id", "item_title", "item_title2", "releases", "band_id",
    "artist_name", "unit_price", "currency", "quantity", "option_id", "option_name",
    "discount_id", "discount_type", "url", "art_id", "image_id",
    "album_art_id", "item_art_id", "item_art_url", "art_url", "band_name", "band_title",
    "selling_band_name", "artist", "artist_title", "album_title",
    "license_id", "associated_license_id", "is_paypalable"
  ];
  const releaseFields = [
    "item_type", "item_id", "title", "item_title", "album_title", "artist", "artist_name",
    "band_name", "band_title", "selling_band_name", "artist_title", "url", "art_id", "image_id",
    "album_art_id", "item_art_id", "item_art_url", "art_url"
  ];

  function releaseData(releases) {
    const source = Array.isArray(releases)
      ? releases
      : releases && typeof releases === "object" ? Object.values(releases) : [];
    return source.flatMap((release) => Array.isArray(release) ? release : [release]).slice(0, 25).map((release) => {
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
      if (field === "releases") data.releases = releaseData(value);
      else if (["string", "number", "boolean"].includes(typeof value) || value === null) data[field] = value;
    }
    return data;
  }

  function emitCart(force = false) {
    if (!window.Sidecart || !Array.isArray(window.Sidecart.cart_items)) return;
    const nativeItemList = document.querySelector?.("#sidecart #item_list");
    const renderedItemCount = nativeItemList?.querySelectorAll?.(":scope > .item").length;
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

  function waitForCartChange(check, timeout = 10000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const poll = () => {
        if (check()) return resolve(true);
        if (Date.now() - startedAt >= timeout) return resolve(false);
        window.setTimeout(poll, 120);
      };
      poll();
    });
  }

  function waitForCartApi(timeout = 4000) {
    return waitForCartChange(() => (
      typeof window.Sidecart?.add_to_cart === "function"
      && Array.isArray(window.Sidecart.cart_items)
    ), timeout);
  }

  async function removeCartItem(request) {
    const result = { requestId: request.requestId, removed: false };
    const requestedItem = request.item;
    if (!window.Sidecart?.delete_from_cart || !Array.isArray(window.Sidecart.cart_items)) {
      result.error = "Bandcamp's cart is not available on this page yet.";
    } else {
      const match = requestedItem && window.Sidecart.cart_items.find((candidate) => (
        requestedItem.local_id != null ? candidate.local_id === requestedItem.local_id : cartItemKey(candidate) === cartItemKey(requestedItem)
      ));
      if (!match) {
        result.removed = true;
        result.alreadyAbsent = true;
      } else {
        try {
          window.Sidecart.delete_from_cart(match);
          result.removed = await waitForCartChange(() => !window.Sidecart?.cart_items?.some((candidate) => (
            match.local_id != null ? candidate.local_id === match.local_id : cartItemKey(candidate) === cartItemKey(match)
          )));
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
    if (!await waitForCartApi()) {
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
          const added = await waitForCartChange(() => window.Sidecart?.cart_items?.some((candidate) => (
            cartItemKey(candidate) === key && !previousLocalIds.has(candidate.local_id) && candidate.id
          )));
          if (added) result.added += 1;
          else result.failed.push({ title: entry.title || item.item_title || "Bandcamp item", reason: "Bandcamp did not confirm the add" });
        } catch (error) {
          result.failed.push({ title: entry.title || item.item_title || "Bandcamp item", reason: error?.message || "add failed" });
        }
      }
      emitCart(true);
    }
    document.dispatchEvent(new CustomEvent("bandkit:cart-restore-result", { detail: result }));
  }

  document.addEventListener("bandkit:cart-command", (event) => {
    if (event.detail?.action === "restore") void restoreCart(event.detail);
    if (event.detail?.action === "remove") void removeCartItem(event.detail);
    if (event.detail?.action === "getState") emitCart(true);
  });
  window.setInterval(emitCart, 800);
}
