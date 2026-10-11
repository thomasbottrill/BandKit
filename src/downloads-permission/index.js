// Chrome only shows a permission prompt for a click inside one of Bandkit's
// own pages, so the Downloads tab embeds this page as its "Allow downloads"
// button. The same page opens as a small window if the embedded click is
// refused.
const PERMISSION = { permissions: ["downloads"] };
const params = new URLSearchParams(location.search);
const standalone = params.get("window") === "1";
const button = document.querySelector("#allow");
const status = document.querySelector("#status");
const root = document.documentElement;

root.dataset.mode = standalone ? "window" : "frame";
for (const [param, property] of [["muted", "--muted"], ["accent", "--accent"], ["font", "--font"]]) {
  const value = params.get(param) || "";
  const valid = property === "--font" ? /^[\w\s"',.-]{1,200}$/.test(value) : CSS.supports("color", value);
  if (valid) root.style.setProperty(property, value);
}

async function render() {
  const granted = await chrome.permissions.contains(PERMISSION).catch(() => false);
  button.textContent = granted ? "Downloads allowed" : "Allow downloads";
  button.disabled = granted;
  if (granted && standalone) {
    status.textContent = "You can close this window.";
    window.setTimeout(() => window.close(), 900);
  }
}

button.addEventListener("click", async () => {
  try {
    const granted = await chrome.permissions.request(PERMISSION);
    if (!granted && standalone) status.textContent = "Downloads stay paused until you allow them.";
  } catch {
    if (!standalone) {
      await chrome.windows.create({
        url: chrome.runtime.getURL("downloads-permission.html?window=1"),
        type: "popup",
        width: 380,
        height: 260,
        focused: true
      }).catch(() => {});
    }
  }
  await render();
});

chrome.permissions.onAdded.addListener(() => { void render(); });
chrome.permissions.onRemoved.addListener(() => { void render(); });
void render();
