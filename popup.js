const status = document.querySelector("#status");
const toggle = document.querySelector("#toggle");
let activeTab = null;
let isOpen = false;

function isBandcampUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com"));
  } catch {
    return false;
  }
}

function render(open) {
  isOpen = open;
  status.classList.remove("is-error");
  status.textContent = open ? "Active on this tab" : "Inactive on this tab";
  toggle.textContent = open ? "Deactivate" : "Activate";
  toggle.classList.toggle("is-active", open);
  toggle.disabled = false;
}

async function ping(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "BANDCAMP_HUB_PING" });
}

async function ensureBandKit(tabId) {
  try {
    return await ping(tabId);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["cart-autosave.js", "content.js"] });
    await new Promise((resolve) => setTimeout(resolve, 250));
    return ping(tabId);
  }
}

async function initialise() {
  [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.id || !isBandcampUrl(activeTab.url)) {
    status.textContent = "Open a Bandcamp tab to use BandKit";
    status.classList.add("is-error");
    toggle.disabled = true;
    return;
  }

  try {
    const response = await ensureBandKit(activeTab.id);
    if (!response?.ready) throw new Error(response?.error || "BandKit is still loading.");
    render(Boolean(response.open));
  } catch (error) {
    status.textContent = error.message || "BandKit could not start on this tab";
    status.classList.add("is-error");
    toggle.disabled = true;
  }
}

toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: isOpen ? "BANDCAMP_HUB_TOGGLE" : "BANDCAMP_HUB_OPEN" });
    render(!isOpen);
  } catch (error) {
    status.textContent = error.message || "BandKit could not be updated";
    status.classList.add("is-error");
    toggle.disabled = false;
  }
});

initialise();
