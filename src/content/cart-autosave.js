(() => {
  const AUTO_SAVED_CART_ID = "cart-autosave";
  const MAX_SAVED_CARTS = 30;

  function clone(value) {
    return value == null ? value : structuredClone(value);
  }

  function isAutoSavedCart(snapshot) {
    const normalizedName = String(snapshot?.name || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
    return Boolean(snapshot?.autoSaved)
      || snapshot?.id === AUTO_SAVED_CART_ID
      || normalizedName === "auto saved cart"
      || normalizedName === "autosaved cart";
  }

  function itemSignature(item) {
    const restore = item?.restore;
    return JSON.stringify(restore ? {
      itemType: restore.item_type,
      itemId: restore.item_id,
      optionId: restore.option_id ?? "",
      discountId: restore.discount_id ?? "",
      quantity: Math.max(1, Number(restore.quantity) || 1),
      unitPrice: Math.max(0, Number(restore.unit_price) || 0),
      currency: restore.currency || item.currency || ""
    } : {
      url: item?.url || "",
      title: item?.title || "",
      artist: item?.artist || "",
      kind: item?.kind || "",
      price: Math.max(0, Number(item?.price) || 0),
      currency: item?.currency || ""
    });
  }

  function cartSignature(items) {
    return (Array.isArray(items) ? items : []).map(itemSignature).sort().join("\n");
  }

  function summarySignature(summary) {
    return JSON.stringify(summary && typeof summary === "object" ? {
      subtotal: Number.isFinite(Number(summary.subtotal)) ? Number(summary.subtotal) : null,
      currency: summary.currency || null
    } : null);
  }

  function normalizeSavedCarts(savedCarts) {
    const candidates = (Array.isArray(savedCarts) ? savedCarts : [])
      .filter((snapshot) => snapshot
        && Array.isArray(snapshot.items)
        && (snapshot.items.length || !isAutoSavedCart(snapshot)));
    const autoSaves = candidates.filter(isAutoSavedCart);
    const newestAutoSave = autoSaves.reduce((newest, snapshot) => {
      const timestamp = Date.parse(snapshot.savedAt || snapshot.createdAt || "") || 0;
      const newestTimestamp = Date.parse(newest?.savedAt || newest?.createdAt || "") || 0;
      return !newest || timestamp > newestTimestamp ? snapshot : newest;
    }, null);
    const canonicalAutoSave = newestAutoSave ? {
      ...newestAutoSave,
      id: AUTO_SAVED_CART_ID,
      name: "Auto-saved cart",
      autoSaved: true
    } : null;
    const normalized = [];
    let hasAutoSave = false;
    for (const snapshot of candidates) {
      if (isAutoSavedCart(snapshot)) {
        if (hasAutoSave) continue;
        hasAutoSave = true;
        normalized.push(canonicalAutoSave);
      } else {
        normalized.push(snapshot);
      }
      if (normalized.length === MAX_SAVED_CARTS) break;
    }
    return normalized;
  }

  function sameSavedCarts(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function upsertAutoSavedCart(savedCarts, items, options = {}) {
    const original = Array.isArray(savedCarts) ? savedCarts : [];
    let next = normalizeSavedCarts(original);
    const cartItems = Array.isArray(items) ? items : [];
    if (!cartItems.length) return { savedCarts: next, changed: !sameSavedCarts(original, next) };

    const signature = cartSignature(cartItems);
    const matchingNamedCart = next.some((snapshot) => !isAutoSavedCart(snapshot) && cartSignature(snapshot.items) === signature);
    if (matchingNamedCart) {
      next = next.filter((snapshot) => !isAutoSavedCart(snapshot));
      return { savedCarts: next, changed: !sameSavedCarts(original, next) };
    }

    const existingIndex = next.findIndex(isAutoSavedCart);
    const existing = existingIndex >= 0 ? next[existingIndex] : null;
    if (existing
      && cartSignature(existing.items) === signature
      && summarySignature(existing.summary) === summarySignature(options.summary)) {
      return { savedCarts: next, changed: !sameSavedCarts(original, next) };
    }

    const savedAt = options.savedAt || new Date().toISOString();
    const snapshot = {
      id: AUTO_SAVED_CART_ID,
      name: "Auto-saved cart",
      autoSaved: true,
      createdAt: existing?.createdAt || savedAt,
      savedAt,
      sourcePage: options.sourcePage || existing?.sourcePage || "",
      summary: options.summary ? clone(options.summary) : null,
      items: clone(cartItems)
    };
    if (existingIndex >= 0) next.splice(existingIndex, 1, snapshot);
    else next.unshift(snapshot);
    next = normalizeSavedCarts(next);
    return { savedCarts: next, changed: !sameSavedCarts(original, next) };
  }

  function saveNamedCart(savedCarts, items, name, options = {}) {
    const cartItems = Array.isArray(items) ? items : [];
    const normalizedName = String(name || "").trim().slice(0, 120);
    let next = normalizeSavedCarts(savedCarts);
    if ((!cartItems.length && !options.allowEmpty) || !normalizedName) return { savedCarts: next, snapshot: null };

    const signature = cartSignature(cartItems);
    const autoIndex = next.findIndex((snapshot) => isAutoSavedCart(snapshot) && cartSignature(snapshot.items) === signature);
    const autoSnapshot = autoIndex >= 0 ? next.splice(autoIndex, 1)[0] : null;
    const savedAt = options.savedAt || new Date().toISOString();
    const snapshot = {
      ...(autoSnapshot || {}),
      id: options.id || `cart-${Date.now()}`,
      name: normalizedName,
      autoSaved: false,
      savedAt,
      sourcePage: options.sourcePage || autoSnapshot?.sourcePage || "",
      summary: options.summary ? clone(options.summary) : null,
      items: clone(cartItems)
    };
    delete snapshot.createdAt;
    next.unshift(snapshot);
    next = normalizeSavedCarts(next);
    return { savedCarts: next, snapshot };
  }

  globalThis.BandKitCartAutosave = Object.freeze({
    AUTO_SAVED_CART_ID,
    MAX_SAVED_CARTS,
    cartSignature,
    isAutoSavedCart,
    normalizeSavedCarts,
    saveNamedCart,
    upsertAutoSavedCart
  });
})();
