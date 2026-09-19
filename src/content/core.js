export const asset = (name) => chrome.runtime.getURL("assets/" + name);

export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function enableRangeReset(input, defaultValue) {
  const resetValue = String(defaultValue);
  input.dataset.defaultValue = resetValue;
  input.addEventListener("dblclick", (event) => {
    event.preventDefault();
    input.value = resetValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return input;
}

export function createShapedRange(input, { vertical = false } = {}) {
  const range = createElement("span", `hub-shaped-range${vertical ? " is-vertical" : ""}`);
  const handle = createElement("span", "hub-shaped-range-handle");
  handle.setAttribute("aria-hidden", "true");

  const sync = () => {
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    const value = Number(input.value);
    const ratio = maximum > minimum
      ? Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)))
      : 0;
    const offset = 10 - ratio * 20;
    range.style.setProperty("--hub-shaped-range-position", `calc(${(ratio * 100).toFixed(3)}% + ${offset.toFixed(3)}px)`);
  };

  input.addEventListener("input", sync);
  input.addEventListener("change", sync);
  range.append(input, handle);
  sync();
  return { element: range, sync };
}

export function createButtonIcon(icon) {
  const glyph = createElement("span", "hub-button-icon");
  glyph.style.setProperty("--hub-icon", `url('${asset(icon)}')`);
  return glyph;
}

export function createPanelBackButton(label, onBack, className = "") {
  const button = createElement("button", `hub-panel-back-button${className ? ` ${className}` : ""}`);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.append(
    createButtonIcon("icon-arrow-left.svg"),
    createElement("span", "hub-panel-back-label", "Back")
  );
  button.addEventListener("click", onBack);
  return button;
}

export function createPanelCaret(className = "") {
  const caret = createElement("span", `hub-panel-caret${className ? ` ${className}` : ""}`);
  caret.style.setProperty("--hub-icon", `url('${asset("icon-panel-caret.svg")}')`);
  caret.setAttribute("aria-hidden", "true");
  return caret;
}

export function resolveImage(source) {
  try {
    const sourceValue = String(source || "").trim();
    if (!sourceValue) return "";
    const value = sourceValue.startsWith("//") ? `https:${sourceValue}` : sourceValue;
    const url = new URL(value, location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function createArt(source, small = false) {
  const image = createElement("img", `hub-art${small ? " is-small" : ""}`);
  const imageUrl = resolveImage(source);
  if (imageUrl) image.src = imageUrl;
  else image.classList.add("is-empty");
  image.alt = "";
  return image;
}

export function createSectionHeading(label) {
  const heading = createElement("h2", "hub-section-heading");
  heading.append(createElement("span", "hub-section-heading-label", label));
  return heading;
}


export function formatCartPrice(value, currency = "USD") {
  const amount = Number(value) || 0;
  const code = /^[A-Z]{3}$/.test(currency || "") ? currency : "USD";
  try {
    const formatted = new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).format(amount);
    return `${formatted} ${code}`;
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function parseClock(value) {
  return String(value || "").trim().split(":").reduce((total, part) => total * 60 + (Number(part) || 0), 0);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function safeBandcampUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com")) ? url.href : "";
  } catch {
    return "";
  }
}

export function safeBandcampReleaseUrl(value) {
  const bandcampUrl = safeBandcampUrl(value);
  if (bandcampUrl) return bandcampUrl;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
    const privateIpv4 = ipv4 && (ipv4.some((part) => part > 255)
      || ipv4[0] === 10
      || ipv4[0] === 127
      || (ipv4[0] === 169 && ipv4[1] === 254)
      || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
      || (ipv4[0] === 192 && ipv4[1] === 168));
    const publicHost = hostname
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && !hostname.endsWith(".local")
      && !hostname.includes(":")
      && !privateIpv4;
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && publicHost
      && /^\/(?:album|track)\/[^/]+/.test(url.pathname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function portableBandcampUrl(value, releaseOnly = false) {
  const safeUrl = releaseOnly ? safeBandcampReleaseUrl(value) : safeBandcampUrl(value);
  if (!safeUrl) return "";
  try {
    const url = new URL(safeUrl);
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return "";
  }
}

export function resolvedTrackPageUrl(track) {
  try {
    const rawValue = track?.title_link || track?.pageUrl || location.href;
    const value = String(rawValue).startsWith("//") ? `https:${rawValue}` : rawValue;
    const url = new URL(value, location.href);
    return safeBandcampReleaseUrl(url.href);
  } catch {
    return "";
  }
}

export function resolvedCartItemPageUrl(track, requestedItemType = "t") {
  const trackUrl = resolvedTrackPageUrl(track);
  if (requestedItemType !== "a") return trackUrl;
  const releaseUrl = safeBandcampReleaseUrl(track?.releaseUrl);
  if (releaseUrl) return releaseUrl;
  try {
    return new URL(trackUrl).pathname.includes("/album/") ? trackUrl : "";
  } catch {
    return "";
  }
}
