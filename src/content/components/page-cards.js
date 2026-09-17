import { asset, createElement } from "../core.js";

export function createBandkitPlaylistOrigin() {
  const origin = createElement("span", "bandkit-collection-origin");
  origin.title = "BandKit playlist";
  origin.setAttribute("aria-label", "BandKit playlist");
  const originIcon = document.createElement("img");
  originIcon.src = asset("icon-bandkit.svg");
  originIcon.alt = "";
  origin.append(originIcon);
  return origin;
}

export function createPagePlaylistCard({ id, ariaLabel, artwork, date, title, subtitle, onOpen }) {
  const card = createElement("li", "bandkit-collection-playlist-card card-item playlist-card");
  card.dataset.bandkitPlaylistId = id;

  const surface = createElement("article", "bandkit-collection-playlist-surface");
  const open = createElement("button", "bandkit-collection-playlist-open");
  open.type = "button";
  open.setAttribute("aria-label", ariaLabel);
  open.append(artwork);

  const copy = createElement("span", "bandkit-collection-playlist-copy");
  copy.append(
    createElement("span", "bandkit-collection-playlist-date", date),
    createElement("strong", "bandkit-collection-playlist-title", title),
    createElement(
      "span",
      "bandkit-collection-playlist-subtitle",
      subtitle
    )
  );
  open.append(copy);
  open.addEventListener("click", onOpen);

  const footer = createElement("footer", "bandkit-collection-playlist-footer");
  const privateBadge = createElement("span", "bandkit-collection-private-badge");
  privateBadge.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8V5.8C6 3.7 7.8 2 10 2s4 1.7 4 3.8V8h1.5c.6 0 1 .4 1 1v8c0 .6-.4 1-1 1h-11c-.6 0-1-.4-1-1V9c0-.6.4-1 1-1H6Zm1-2.2V8h6V5.8C13 4.3 11.7 3 10 3S7 4.3 7 5.8Z"/></svg><span>Private</span>';
  footer.append(privateBadge, createBandkitPlaylistOrigin());
  surface.append(open, footer);
  card.append(surface);
  return card;
}

export function createCollectionActionRow() {
  return createElement("div", "bandkit-collection-action-row");
}

// Enhance existing native rows without replacing their children or listeners.
export function setPageCardActionRow(row, modern, sidebar) {
  row?.classList.toggle("bandkit-feed-action-row", modern);
  if (typeof sidebar === "boolean") row?.classList.toggle("bandkit-feed-sidebar-actions", modern && sidebar);
}
