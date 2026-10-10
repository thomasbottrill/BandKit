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
  const nativeRow = [item?.local_id, item?.id]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => document.getElementById(`sidecart_item_${value}`))
    .find(Boolean);
  data.unavailable = Boolean(
    item?.unavailable
    || item?.is_unavailable
    || /no longer available/i.test(nativeRow?.textContent || "")
  );
  return data;
}

export function installCartBridge() {
  let lastCartSignature = "";

  function checkoutCurrency() {
    const savedCard = window.Sidecart?.saved_card || {};
    const savedCurrency = [savedCard.currency, savedCard.billing_currency, savedCard.default_currency]
      .find((value) => /^[A-Z]{3}$/.test(value || ""));
    if (savedCurrency) return savedCurrency;
    const savedCountry = savedCard.country_code || savedCard.country || savedCard.billing_country;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const country = String(savedCountry || (timezone.startsWith("Australia/") ? "AU" : window.ClientPrefs?.country) || "").toUpperCase();
    if (country === "AU") return "AUD";
    if (country === "CA") return "CAD";
    if (country === "GB") return "GBP";
    if (country === "JP") return "JPY";
    if (new Set(["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]).has(country)) return "EUR";
    return typeof window.ClientPrefs?.currency === "string" ? window.ClientPrefs.currency : null;
  }

  let lastCartAvailable = "";

  function cartIsReady() {
    // Bandcamp fills cart_items asynchronously and flags the wait with
    // `initing`. The empty array it starts with is not an empty cart.
    return typeof window.Sidecart?.add_to_cart === "function"
      && Array.isArray(window.Sidecart?.cart_items)
      && window.Sidecart.initing !== true;
  }

  function emitCartAvailability() {
    // Bandcamp only ships its cart bundle on release pages, so pages like the
    // feed have no cart API at all. Say so once rather than letting every cart
    // action discover it by failing. "present but not ready" is its own answer:
    // the page has a cart worth waiting for, so nothing should read the markup
    // underneath it in the meantime.
    const available = cartIsReady();
    const present = typeof window.Sidecart === "object" && window.Sidecart !== null;
    const signature = `${available}:${present}`;
    if (signature === lastCartAvailable) return;
    lastCartAvailable = signature;
    document.dispatchEvent(new CustomEvent("bandkit:cart-availability", { detail: { available, present } }));
  }

  function emitCart(force = false) {
    emitCartAvailability();
    // Reporting a cart that has not loaded would tell Bandkit every item had
    // just been removed, and Bandkit saves what it is told.
    if (!cartIsReady()) return;
    const items = window.Sidecart.cart_items.map(cartItemData);
    const subtotal = items.length === 0 ? 0 : Number(window.Sidecart.subtotal);
    const additionalContribution = window.Sidecart.has_additional_contribution ? Number(window.Sidecart.additional_contribution_total) : 0;
    const shipping = window.Sidecart.has_shipping ? Number(window.Sidecart.shipping) : 0;
    const tax = window.Sidecart.has_tax ? Number(window.Sidecart.tax) : 0;
    const totalParts = [subtotal, additionalContribution, shipping, tax];
    const sourceCurrency = typeof window.ClientPrefs?.currency === "string" ? window.ClientPrefs.currency : null;
    const currency = checkoutCurrency();
    const sourceRate = Number(window.CurrencyData?.rates?.[sourceCurrency]);
    const checkoutRate = Number(window.CurrencyData?.rates?.[currency]);
    const rawTotal = totalParts.every(Number.isFinite) ? totalParts.reduce((sum, value) => sum + value, 0) : null;
    const convertedTotal = Number.isFinite(rawTotal) && Number.isFinite(sourceRate) && Number.isFinite(checkoutRate) && checkoutRate > 0
      ? rawTotal * sourceRate / checkoutRate : rawTotal;
    const places = Math.max(0, Math.min(4, Number(window.CurrencyData?.info?.[currency]?.places) || 2));
    const total = Number.isFinite(convertedTotal) ? Math.round(convertedTotal * (10 ** places)) / (10 ** places) : null;
    const summary = {
      subtotal: Number.isFinite(subtotal) ? subtotal : null,
      total,
      currency
    };
    const signature = JSON.stringify({ items, summary });
    if (!force && signature === lastCartSignature) return;
    lastCartSignature = signature;
    document.dispatchEvent(new CustomEvent("bandkit:cart-state", { detail: { items, summary } }));
  }

  function cartItemKey(item) {
    return [item.item_type, item.item_id, item.option_id ?? "", item.discount_id ?? ""].join(":");
  }

  // Bandcamp refuses a collection add below the per-currency minimum it shows
  // in its own buy dialog, and a cart item under it only surfaces as a "price
  // has changed" failure at checkout. This is the last gate before the add, so
  // every path through Bandkit is covered, not just the ones that prompt.
  function cartMinimum(item) {
    if (!["a", "t"].includes(item?.item_type)) return 0;
    const info = window.CurrencyData?.info?.[item?.currency];
    const minimum = item.item_type === "t" ? Number(info?.small_min_price) : Number(info?.medium_min_price);
    return Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
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

  async function clearCart(request) {
    const result = { requestId: request.requestId, removed: false, cleared: 0 };
    if (!window.Sidecart?.delete_from_cart || !Array.isArray(window.Sidecart.cart_items)) {
      result.error = "Bandcamp's cart is not available on this page yet.";
    } else {
      // One at a time: Bandcamp updates cart_items after each request, and two
      // deletes in flight can leave one of them unapplied.
      for (const item of [...window.Sidecart.cart_items]) {
        const key = item.local_id != null ? `local:${item.local_id}` : cartItemKey(item);
        const keyOf = (candidate) => (candidate.local_id != null ? `local:${candidate.local_id}` : cartItemKey(candidate));
        try {
          window.Sidecart.delete_from_cart(item);
          if (await waitForCartChange(() => !window.Sidecart?.cart_items?.some((candidate) => keyOf(candidate) === key))) result.cleared += 1;
        } catch {
          // Carry on: one item Bandcamp refuses should not keep the rest.
        }
      }
      result.removed = window.Sidecart.cart_items.length === 0;
      if (!result.removed) result.error = `Bandcamp kept ${window.Sidecart.cart_items.length} item${window.Sidecart.cart_items.length === 1 ? "" : "s"} in the cart.`;
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
        if (entry?.unavailable || entry?.restoreError) {
          result.failed.push({
            title: entry?.title || item?.item_title || "Bandcamp item",
            reason: entry?.restoreError || "no longer available"
          });
          continue;
        }
        if (!item || !["a", "t", "b", "p"].includes(item.item_type) || !Number.isFinite(Number(item.item_id))) {
          result.failed.push({ title: entry?.title || "Bandcamp item", reason: "missing exact product metadata" });
          continue;
        }
        const minimum = cartMinimum(item);
        if (minimum > 0 && Math.max(0, Number(item.unit_price) || 0) < minimum) {
          result.failed.push({
            title: entry?.title || item.item_title || "Bandcamp item",
            reason: `Bandcamp's minimum for this item is ${minimum} ${item.currency || ""}`.trim()
          });
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
    if (event.detail?.action === "clear") void clearCart(event.detail);
    if (event.detail?.action === "getState") emitCart(true);
    if (event.detail?.action === "getAvailability") {
      lastCartAvailable = null;
      emitCartAvailability();
    }
  });
  window.setInterval(emitCart, 800);
}
