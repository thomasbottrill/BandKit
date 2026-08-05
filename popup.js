const status = document.querySelector("#status");
const statusTitle = document.querySelector("#status-title");
const statusCopy = document.querySelector("#status-copy");
const errorDetail = document.querySelector("#error-detail");
const primaryAction = document.querySelector("#primary-action");
const retryAction = document.querySelector("#retry-action");
const currentCart = document.querySelector("#current-cart");
const savedCarts = document.querySelector("#saved-carts");
const cartCount = document.querySelector("#cart-count");
const savedCount = document.querySelector("#saved-count");
const saveCartButton = document.querySelector("#save-cart");
const version = chrome.runtime.getManifest().version;
let activeTab = null;
const cartAutosave = globalThis.BandKitCartAutosave;

document.querySelector("#version").textContent = `Version ${version}`;

function isBandcampUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com"));
  } catch {
    return false;
  }
}

function setStatus(kind, title, copy, detail = "") {
  status.className = `status is-${kind}`;
  statusTitle.textContent = title;
  statusCopy.textContent = copy;
  errorDetail.hidden = !detail;
  errorDetail.textContent = detail;
}

function openBandcampPage(url) {
  if (isBandcampUrl(url)) chrome.tabs.create({ url });
}

function emptyCopy(message) {
  const copy = document.createElement("span");
  copy.className = "empty-copy";
  copy.textContent = message;
  return copy;
}

function formatCartPrice(value, currency = "USD") {
  const code = /^[A-Z]{3}$/.test(currency || "") ? currency : "USD";
  try {
    const formatted = new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).format(Number(value) || 0);
    return `${formatted} ${code}`;
  } catch {
    return `${code} ${(Number(value) || 0).toFixed(2)}`;
  }
}

async function renderCartLog() {
  const stored = await chrome.storage.local.get("bandcampHubState");
  const hubState = stored.bandcampHubState || {};
  const cart = Array.isArray(hubState.cart) ? hubState.cart : [];
  const snapshots = cartAutosave.normalizeSavedCarts(hubState.savedCarts);
  cartCount.textContent = String(cart.length);
  savedCount.textContent = String(snapshots.length);
  saveCartButton.disabled = !cart.length;
  currentCart.replaceChildren();
  savedCarts.replaceChildren();

  if (!cart.length) currentCart.append(emptyCopy("No cart has been captured yet."));
  for (const item of cart) {
    const row = document.createElement("div");
    row.className = "cart-item";
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = item.title || "Bandcamp item";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openBandcampPage(item.url);
    });
    const meta = document.createElement("span");
    meta.textContent = [item.artist, Number(item.price) ? formatCartPrice(item.price, item.currency) : ""].filter(Boolean).join(" · ");
    row.append(link, meta);
    currentCart.append(row);
  }

  if (!snapshots.length) savedCarts.append(emptyCopy("The current cart will appear here automatically once BandKit captures it."));
  for (const snapshot of snapshots) {
    const card = document.createElement("div");
    card.className = "saved-cart";
    const heading = document.createElement("div");
    heading.className = "saved-cart-heading";
    const name = document.createElement("strong");
    name.textContent = snapshot.name || "Saved cart";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      hubState.savedCarts = snapshots.filter((entry) => entry.id !== snapshot.id);
      await chrome.storage.local.set({ bandcampHubState: hubState });
      renderCartLog();
    });
    const actions = document.createElement("div");
    actions.className = "saved-cart-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "restore-cart";
    restore.textContent = "Restore";
    restore.addEventListener("click", async () => {
      restore.disabled = true;
      restore.textContent = "Restoring…";
      let result;
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id || !isBandcampUrl(tab.url)) throw new Error("Open a Bandcamp tab first.");
        result = await chrome.tabs.sendMessage(tab.id, { type: "BANDCAMP_HUB_RESTORE_CART", items: snapshot.items || [] });
        if (!result?.ok) throw new Error(result?.error || "Bandcamp could not restore this cart.");
        restore.textContent = "Restored";
        setStatus("ready", "Cart restore finished", result.summary || "The saved items were sent back to Bandcamp.");
      } catch (error) {
        restore.disabled = false;
        restore.textContent = "Retry restore";
        setStatus("error", "Cart restore failed", error.message || "Bandcamp did not accept the saved items.");
      }
    });
    actions.append(restore, remove);
    heading.append(name, actions);
    const meta = document.createElement("span");
    meta.className = "saved-cart-meta";
    meta.textContent = `${snapshot.autoSaved ? "Auto-saved · " : ""}${snapshot.items?.length || 0} items · ${snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString() : "saved locally"}`;
    const itemList = document.createElement("div");
    itemList.className = "saved-cart-items";
    for (const item of (snapshot.items || []).slice(0, 20)) {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = item.title || "Bandcamp item";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openBandcampPage(item.url);
      });
      itemList.append(link);
    }
    card.append(heading, meta, itemList);
    savedCarts.append(card);
  }
}

async function readLastDiagnostic() {
  const stored = await chrome.storage.local.get("bandcampHubDiagnostic");
  return stored.bandcampHubDiagnostic || null;
}

async function pingHub(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "BANDCAMP_HUB_PING" });
}

async function waitForHubReady(tabId) {
  let response = await pingHub(tabId);
  if (response?.error) throw new Error(response.error);
  if (!response?.ready) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    response = await pingHub(tabId);
  }
  if (response?.error) throw new Error(response.error);
  if (!response?.ready) throw new Error("The BandKit content script loaded but did not finish starting.");
  return response;
}

async function injectHub(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["cart-autosave.js", "content.js"] });
  return waitForHubReady(tabId);
}

async function openHub() {
  if (!activeTab?.id || !isBandcampUrl(activeTab.url)) return;
  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: "BANDCAMP_HUB_OPEN" });
    setStatus("ready", "BandKit opened", "BandKit should now be visible on this Bandcamp tab.");
  } catch (error) {
    const diagnostic = await readLastDiagnostic();
    setStatus(
      "error",
      "BandKit could not open",
      "Chrome could not reach the page script.",
      diagnostic?.error || error.message
    );
  }
}

async function checkCurrentTab() {
  primaryAction.disabled = true;
  primaryAction.textContent = "Open BandKit";
  setStatus("loading", "Checking this tab…", "Connecting to BandKit.");
  [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!activeTab || !isBandcampUrl(activeTab.url)) {
    setStatus("error", "This is not a Bandcamp tab", "Open a bandcamp.com page, then click the extension icon again.");
    primaryAction.disabled = false;
    primaryAction.textContent = "Open Bandcamp";
    primaryAction.onclick = () => chrome.tabs.create({ url: "https://bandcamp.com/" });
    return;
  }

  try {
    let response;
    try {
      response = await waitForHubReady(activeTab.id);
    } catch {
      response = await injectHub(activeTab.id);
    }
    if (!response?.ok) throw new Error("The BandKit script did not answer its startup check.");
    setStatus("ready", "BandKit is ready", `Connected to content script ${response.version || version}.`);
    primaryAction.disabled = false;
    primaryAction.onclick = openHub;
    await openHub();
  } catch (error) {
    const diagnostic = await readLastDiagnostic();
    setStatus(
      "error",
      "BandKit startup failed",
      "Reload this extension and the Bandcamp tab. If it still fails, this is the exact error to share:",
      diagnostic?.error || error.stack || error.message
    );
    primaryAction.disabled = false;
    primaryAction.textContent = "Try injection again";
    primaryAction.onclick = checkCurrentTab;
  }
}

retryAction.addEventListener("click", checkCurrentTab);
saveCartButton.addEventListener("click", async () => {
  const stored = await chrome.storage.local.get("bandcampHubState");
  const hubState = stored.bandcampHubState || {};
  const cart = Array.isArray(hubState.cart) ? hubState.cart : [];
  if (!cart.length) return;
  const suggested = `Cart — ${new Date().toLocaleString()}`;
  const name = window.prompt("Name this saved cart", suggested)?.trim();
  if (!name) return;
  hubState.savedCarts = cartAutosave.saveNamedCart(hubState.savedCarts, cart, name, {
    savedAt: new Date().toISOString(),
    summary: hubState.cartSummary
  }).savedCarts;
  await chrome.storage.local.set({ bandcampHubState: hubState });
  renderCartLog();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.bandcampHubState) renderCartLog();
});
renderCartLog();
checkCurrentTab();
