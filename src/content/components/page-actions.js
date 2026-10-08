import { asset } from "../core.js";

// DOM construction only; page-specific state and actions belong to the caller.
export function createPageAddButton(tagName = "button") {
  const button = document.createElement(tagName);
  button.className = "bandcamp-hub-page-playlist";
  button.style.setProperty("--hub-plus-icon", `url('${asset("icon-plus.svg")}')`);
  button.style.fontFamily = 'var(--hub-font-family, "Helvetica Neue", Helvetica, Arial, sans-serif)';
  if (tagName === "button") button.type = "button";
  else {
    button.href = "#";
    button.setAttribute("role", "button");
  }
  return button;
}

export function createPageOverflowButton() {
  const button = document.createElement("button");
  button.className = "bandcamp-hub-page-overflow";
  button.type = "button";
  button.style.setProperty("--hub-more-icon", `url('${asset("icon-more.svg")}')`);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "More release actions");
  button.title = "More release actions";
  return button;
}

export function createPagePurchaseButton() {
  const button = document.createElement("button");
  button.className = "bandcamp-hub-page-cart";
  button.type = "button";
  button.style.setProperty("--hub-cart-icon", `url('${asset("icon-cart.svg")}')`);
  return button;
}

export function createPageDestinationMenu() {
  const menu = document.createElement("div");
  menu.className = "bandcamp-hub-page-playlist-menu";
  menu.setAttribute("role", "menu");
  return menu;
}

export function createPageMenuOption(label, action, disabled = false, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  const glyph = label.match(/^([＋✓←])\s+/);
  if (glyph) {
    const icon = document.createElement("span");
    icon.className = "bandkit-page-menu-icon";
    icon.textContent = glyph[1];
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label.slice(glyph[0].length);
    button.append(icon, text);
    button.setAttribute("aria-label", label);
  } else button.textContent = label;
  button.disabled = disabled;
  button.className = className;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}

export function createPageDjButton() {
  const button = document.createElement("button");
  button.className = "bandcamp-hub-page-dj";
  button.type = "button";
  button.style.setProperty("--hub-dj-icon", `url('${asset("icon-bpm.svg")}')`);
  button.setAttribute("aria-label", "Show BPM and tempo controls on this page");
  return button;
}

export function createPageTrackPurchaseButton() {
  const buyTrack = document.createElement("button");
  buyTrack.type = "button";
  buyTrack.className = "bandcamp-hub-page-buy bandkit-generated-track-buy";
  buyTrack.textContent = "Buy";
  return buyTrack;
}

export function createPageSearchPlayButton() {
  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "bandkit-search-play";
  return playButton;
}

export function createPagePriceForm({ currency, minimumPrice, suggested, onSubmit }) {
  // Bandcamp refuses a cart add priced at nothing — a free release goes through
  // its download flow instead — so the form never offers an amount it cannot buy.
  const floor = minimumPrice > 0 ? minimumPrice : 0.01;
  const form = document.createElement("form");
  form.className = "bandkit-page-price-form";
  const field = document.createElement("label");
  field.className = "bandkit-page-price-field";
  const symbol = document.createElement("span");
  symbol.className = "bandkit-page-price-currency";
  symbol.textContent = currency;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "bandkit-page-price-input";
  input.min = String(floor);
  input.step = "0.01";
  input.value = String(Math.max(floor, Number(suggested) || 0));
  input.setAttribute("aria-label", `Amount to pay in ${currency}`);
  field.append(symbol, input);
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "bandkit-page-price-submit is-prominent";
  submit.textContent = "Add to cart";
  form.append(field, submit);
  const syncSubmit = () => {
    const amount = Number(input.value);
    submit.disabled = !Number.isFinite(amount) || amount < floor;
  };
  input.addEventListener("input", syncSubmit);
  syncSubmit();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const amount = Number(input.value);
    if (!Number.isFinite(amount) || amount < floor) return;
    onSubmit(amount);
  });
  form.addEventListener("click", (event) => event.stopPropagation());
  return { form, input };
}
