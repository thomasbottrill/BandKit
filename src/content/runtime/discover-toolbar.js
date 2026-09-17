import { discoverGenrePalette } from "../discover-colours.js";
import { colorString, mixColor, luminance } from "../color.js";
import { asset, createElement } from "../core.js";


function syncGenreColours(banner, chips) {
  const style = getComputedStyle(banner);
  const genre = banner.getAttribute("style")?.match(/var\(--genre-(.+?)-secondary-color\)/)?.[1];
  banner.toggleAttribute("data-bandkit-genre-colours", Boolean(genre));
  const foreground = (colour) => {
    const hex = colour.trim().replace("#", "");
    if (!/^[\da-f]{6}$/i.test(hex)) return "#fff";
    const channels = [0, 2, 4].map((i) => {
      const value = parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? "#222" : "#fff";
  };
  if (genre) {
    for (const [name, suffix] of [["primary", "primary-color"], ["secondary", "secondary-color"], ["gradient", "gradient"]]) {
      banner.style.setProperty(`--bandkit-genre-${name}`, style.getPropertyValue(`--genre-${genre}-${suffix}`));
    }
    banner.style.setProperty("--bandkit-genre-on-primary", foreground(style.getPropertyValue(`--genre-${genre}-primary-color`)));
    banner.style.setProperty("--bandkit-genre-on-secondary", foreground(style.getPropertyValue(`--genre-${genre}-secondary-color`)));
  }
  for (const option of banner.querySelectorAll('.genre-filter [role="option"]')) {
    const name = option.getAttribute("name");
    const primary = style.getPropertyValue(`--genre-${name}-primary-color`).trim();
    if (primary) {
      option.style.setProperty("--bandkit-option-colour", primary);
      option.style.setProperty("--bandkit-option-text", foreground(primary));
    }
  }
  for (const copy of chips.querySelectorAll(".selected-tag")) {
    const native = [...banner.querySelectorAll(".selected-tags .selected-tag")].find((node) => !chips.contains(node) && node.textContent.trim() === copy.textContent.trim());
    if (!native) continue;
    const nativeStyle = getComputedStyle(native);
    for (const property of nativeStyle) {
      if (property.startsWith("--v")) copy.style.setProperty(property, nativeStyle.getPropertyValue(property));
    }
  }
  const nativeGroup = banner.querySelector(".subgenre-filter .subgenres");
  const copiedGroup = chips.querySelector(".bandkit-discover-native-subgenres");
  if (nativeGroup && copiedGroup) {
    const nativeStyle = getComputedStyle(nativeGroup);
    for (const property of nativeStyle) {
      if (property.startsWith("--v")) copiedGroup.style.setProperty(property, nativeStyle.getPropertyValue(property));
    }
  }
  chips.setAttribute("aria-label", "Selected genres and subgenres");
}

function syncDiscoverSurfaces(r) {
    const genrePalette = discoverGenrePalette();
    const app = document.querySelector("#DiscoverApp");
    app?.toggleAttribute("data-bandkit-discover-genre", Boolean(genrePalette));
    if (app && genrePalette) {
      const { background, text, accent } = genrePalette;
      app.style.setProperty("--bandkit-discover-surface", colorString(mixColor(background, text, .07)));
      app.style.setProperty("--bandkit-discover-ink", colorString(text));
      app.style.setProperty("--bandkit-discover-muted", colorString(mixColor(text, background, .25)));
      app.style.setProperty("--bandkit-discover-line", colorString(mixColor(background, text, .3)));
      app.style.setProperty("--bandkit-discover-accent", colorString(luminance(accent) < .15 ? text : accent));
    }
    r.$syncPageAwareTheme?.();
}

function syncFormatIcon(banner, button) {
  const selected = banner.querySelector('.category-filter [aria-checked="true"]');
  const key = selected?.getAttribute("name");
  const nativeIcon = selected?.querySelector("svg");
  if (!nativeIcon || button.dataset.formatIcon === key) return;
  const icon = nativeIcon.cloneNode(true);
  icon.classList.add("bandkit-format-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.removeAttribute("id");
  button.firstElementChild.replaceWith(icon);
  button.dataset.formatIcon = key;
}

function copySubgenreOptions(banner, selected, pending, schedule) {
  const nativeGroup = banner.querySelector(".subgenre-filter .subgenres");
  if (!nativeGroup) return null;
  const group = nativeGroup.cloneNode(true);
  group.classList.add("bandkit-discover-native-subgenres");
  group.removeAttribute("id");
  group.querySelector(".list-box-label")?.remove();
  const list = group.querySelector("ul");
  list?.removeAttribute("aria-labelledby");
  list?.removeAttribute("aria-activedescendant");
  list?.setAttribute("aria-label", "Subgenres");
  for (const node of group.querySelectorAll("[id]")) node.removeAttribute("id");
  for (const option of group.querySelectorAll('[role="option"]')) {
    const name = option.getAttribute("name");
    const title = option.textContent.trim();
    if (selected.some((node) => node.textContent.trim() === title)) { option.remove(); continue; }
    option.tabIndex = 0;
    if (pending.has(title)) {
      option.setAttribute("aria-selected", "true");
      option.setAttribute("aria-busy", "true");
      option.classList.add("active");
    }
    const select = () => {
      if (pending.has(title)) return;
      const native = [...banner.querySelectorAll('.subgenre-filter [role="option"]')].find((node) => node.getAttribute("name") === name);
      if (!native) return;
      pending.set(title, Date.now());
      option.setAttribute("aria-selected", "true");
      option.setAttribute("aria-busy", "true");
      option.classList.add("active");
      native.click();
      schedule();
      window.setTimeout(schedule, 15050);
    };
    option.addEventListener("click", select);
    option.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
    });
  }
  return group;
}

export function setupDiscoverToolbar(r) {
  if (location.hostname !== "bandcamp.com" || !/^\/discover(?:\/|$)/.test(location.pathname)) return;
  let banner;
  let toolbar;
  let chips;
  let chipRow;
  let nextChips;
  let add;
  let formats;
  let filters;
  let clear;
  let follow;
  let results;
  let opener;
  let mode = "";
  let chipSignature = "";
  let selectedSignature = "";
  let scheduled = false;
  const pendingSubgenres = new Map();
  const setText = (node, text) => {
    const label = node.querySelector(".bandkit-filter-label") || node;
    if (label.textContent !== text) label.textContent = text;
  };
  const show = (next, trigger) => {
    mode = mode === next ? "" : next;
    opener = trigger || opener;
    banner.dataset.bandkitFilterPanel = mode;
    for (const [button, value] of [[add, "tags"], [formats, "formats"], [filters, "advanced"]]) {
      button.setAttribute("aria-expanded", String(mode === value));
    }
    if (mode === "formats") banner.querySelector('.category-filter [aria-checked="true"]')?.focus();
  };
  const button = (label, action, icon, disclosure = false) => {
    const node = createElement("button", "filter-button g-button sm outline icon-left bandkit-discover-filter-button");
    const glyph = (name) => {
      const span = createElement("span", "bandkit-filter-icon");
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--bandkit-filter-icon", `url("${asset(name)}")`);
      return span;
    };
    if (icon) node.append(glyph(icon));
    node.append(createElement("span", "bandkit-filter-label", label));
    if (disclosure) node.append(glyph("icon-chevron.svg"));
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  const mount = () => {
    const next = document.querySelector("#DiscoverApp .filters-banner");
    if (!next?.querySelector(".more-filters-row .sort-filter-dropdown")) return;
    if (next === banner && toolbar?.isConnected) {
      if (!banner.classList.contains("bandkit-compact-filters")) banner.classList.add("bandkit-compact-filters");
      return;
    }
    banner = next;
    mode = ""; chipSignature = ""; selectedSignature = "";
    toolbar = createElement("div", "bandkit-discover-toolbar");
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Discover filters");
    chipRow = createElement("div", "bandkit-discover-chip-row");
    chips = createElement("div", "bandkit-discover-filter-chips");
    nextChips = button("", () => chips.scrollBy({ left: Math.max(180, chips.clientWidth * .75), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }), "icon-chevron.svg");
    nextChips.classList.add("bandkit-discover-chips-next");
    nextChips.setAttribute("aria-label", "Show more subgenres");
    nextChips.title = "Show more subgenres";
    chips.addEventListener("scroll", syncChipArrow, { passive: true });
    new ResizeObserver(syncChipArrow).observe(chips);
    chipRow.append(chips, nextChips);
    add = button("Add filter", () => show("tags", add), "icon-plus.svg", true);
    formats = button("All formats", () => show("formats", formats), "icon-now-playing.svg", true);
    filters = button("Filters", () => show("advanced", filters), "icon-filter.svg", true);
    filters.classList.add("bandkit-discover-advanced-filter");
    clear = button("Clear", () => banner.querySelector(".reset-filters")?.click());
    follow = button("Follow", () => banner.querySelector(".tag-search-wrapper .follow-button")?.click());
    for (const node of [add, formats, filters]) node.setAttribute("aria-expanded", "false");
    results = createElement("span", "bandkit-discover-result-count");
    results.setAttribute("role", "status");
    results.setAttribute("aria-live", "polite");
    results.setAttribute("aria-atomic", "true");
    toolbar.append(add, formats, filters, clear, results, follow, chipRow);
    // Append to preserve Vue's existing native child order.
    banner.append(toolbar);
    banner.classList.add("bandkit-compact-filters");
    banner.dataset.bandkitFilterPanel = "";

    banner.addEventListener("click", (event) => {
      if (event.target.closest('.category-filter [role="radio"]')) {
        show("formats", formats);
        formats.focus();
      }
    });
  };
  const sync = () => {
    scheduled = false;
    mount();
    if (!banner || !toolbar?.isConnected) return;
    position();
    syncDiscoverSurfaces(r);
    syncGenreColours(banner, chips);
    const nativeCount = document.querySelector("#DiscoverApp .result-count-display")?.textContent.trim() || "";
    setText(results, nativeCount.replace(/\d[\d,]*/, (number) => Number(number.replaceAll(",", "")).toLocaleString()));
    results.hidden = !nativeCount;
    for (const control of toolbar.querySelectorAll("button")) control.classList.toggle("dark-mode", banner.classList.contains("dark-mode"));
    const selected = [...banner.querySelectorAll(".selected-tags .selected-tag")]
      .filter((node) => node.textContent.trim().toLowerCase() !== "all genres");
    for (const [name, started] of pendingSubgenres) {
      if (selected.some((node) => node.textContent.trim() === name) || Date.now() - started > 15000) pendingSubgenres.delete(name);
    }
    const suggestions = [...banner.querySelectorAll('.subgenre-filter [role="option"]')].filter((node) => node.getAttribute("aria-selected") !== "true");
    const nextSelectedSignature = selected.map((node) => node.textContent.trim()).join("|");
    if (mode === "tags" && selectedSignature !== nextSelectedSignature) show("tags", add);
    selectedSignature = nextSelectedSignature;
    const signature = [...selected, ...suggestions].map((node) => node.textContent.trim()).join("|") + JSON.stringify([...pendingSubgenres.keys()]);
    if (signature !== chipSignature) {
      chipSignature = signature;
      chips.replaceChildren(...selected.map((native) => {
        const title = native.textContent.trim();
        const chip = native.cloneNode(true);
        chip.removeAttribute("id");
        chip.addEventListener("click", () => {
          const current = [...banner.querySelectorAll(".selected-tags .selected-tag")].find((node) => node.textContent.trim() === title);
          current?.click();
        });
        chip.setAttribute("aria-label", `Remove ${title} filter`);
        return chip;
      }));
      const group = copySubgenreOptions(banner, selected, pendingSubgenres, schedule);
      if (group) chips.append(group);
    }
    syncGenreColours(banner, chips);
    chipRow.hidden = !chips.children.length;
    syncChipArrow();
    const category = banner.querySelector('.category-filter [aria-checked="true"]')?.textContent.trim() || "all categories";
    setText(formats, `${category === "all categories" ? "All formats" : category}`);
    syncFormatIcon(banner, formats);
    const location = banner.querySelector(".location-filter-dropdown > button")?.textContent.trim();
    const time = banner.querySelector(".time-filter-dropdown > button")?.textContent.trim();
    const followed = banner.querySelector('.more-filters-row .right > button[aria-pressed="true"]');
    const count = Number(Boolean(location && location !== "artists from anywhere"))
      + Number(Boolean(time && time !== "fresh")) + Number(Boolean(followed));
    setText(filters, `Filters${count ? ` (${count})` : ""}`);
    const sort = banner.querySelector(".sort-filter-dropdown > button")?.textContent.trim();
    clear.hidden = !selected.length && category === "all categories" && !count && (!sort || sort === "best-selling");
    const nativeFollow = banner.querySelector(".tag-search-wrapper .follow-button");
    follow.hidden = !nativeFollow;
    if (nativeFollow) {
      setText(follow, nativeFollow.textContent.trim());
      follow.disabled = nativeFollow.disabled;
    }
  };
  const syncChipArrow = () => {
    if (!chips || !nextChips) return;
    nextChips.hidden = chips.scrollWidth <= chipRow.clientWidth + 1;
    nextChips.disabled = chips.scrollLeft + chips.clientWidth >= chips.scrollWidth - 1;
  };
  const position = () => {
    if (!banner) return;
    const header = document.querySelector("#DiscoverApp .menu-bar");
    const top = Math.max(0, Math.round(header?.getBoundingClientRect().bottom || 0));
    banner.style.setProperty("--bandkit-filter-top", `${top}px`);
  };
  window.addEventListener("scroll", position, { passive: true });
  window.addEventListener("resize", position, { passive: true });
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(sync);
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mode && banner?.contains(event.target)) {
      show(mode, opener);
      opener?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (mode && mode !== "advanced" && !banner?.contains(event.target)) show(mode, opener);
  });
  const app = document.querySelector("#DiscoverApp");
  if (app) new MutationObserver((records) => {
    if (records.some((record) => {
      const target = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      return !target?.closest?.(".bandkit-discover-toolbar")
        && (target?.closest?.(".filters-banner, .breadcrumbs-bar, .result-count-display") || !toolbar?.isConnected);
    })) schedule();
  }).observe(app, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "aria-checked", "aria-pressed", "disabled", "class"] });
  schedule();
}
