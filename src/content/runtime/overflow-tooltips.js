const OVERFLOW_TOOLTIP_SELECTOR = [
  "[data-bandkit-overflow-tooltip]",
  ".track-title",
  ".title_link",
  ".title-text",
  ".artist-name",
  ".albumTitle",
  ".trackTitle",
  ".release-title",
  ".collection-item-title",
  ".collection-item-artist",
  ".fav-track-title",
  ".waypoint-item-title",
  ".waypoint-artist-title",
  ".bandkit-collection-playlist-title",
  ".bandkit-collection-playlist-subtitle",
  ".hub-track-title",
  ".hub-track-artist",
  ".hub-player-secondary",
  ".hub-cart-title",
  ".hub-meta",
  ".hub-saved-playlist-detail-title",
  ".hub-cart-backup-time",
  ".hub-row-title strong",
  ".hub-saved-cart-detail-copy h2",
  ".hub-theme-combobox-label",
  ".hub-theme-option-label",
  ".hub-theme-preset-label",
  ".hub-playlist-meta",
  ".hub-playlist-analysis-text",
  ".hub-dj-key strong",
  ".hub-dj-key small"
].join(",");

const OWNED_TITLE_ATTRIBUTE = "data-bandkit-overflow-title";

function normalizedTooltipText(element) {
  return String(element?.dataset?.bandkitFullLabel || element?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function syncOverflowTooltip(element) {
  if (!element?.getAttribute || !element?.setAttribute || !element?.removeAttribute) return false;
  const ownsTitle = element.hasAttribute(OWNED_TITLE_ATTRIBUTE);
  if (element.hasAttribute("title") && !ownsTitle) return false;

  const widthClipped = Number(element.clientWidth) > 0 && Number(element.scrollWidth) > Number(element.clientWidth) + 1;
  const heightClipped = Number(element.clientHeight) > 0 && Number(element.scrollHeight) > Number(element.clientHeight) + 1;
  const fullText = normalizedTooltipText(element);
  if ((widthClipped || heightClipped) && fullText) {
    element.setAttribute("title", fullText);
    element.setAttribute(OWNED_TITLE_ATTRIBUTE, "true");
    return true;
  }

  if (ownsTitle) {
    element.removeAttribute("title");
    element.removeAttribute(OWNED_TITLE_ATTRIBUTE);
  }
  return false;
}

function registerOverflowTooltips1(r) {
  r.$isOverflowTooltipCandidate = function isOverflowTooltipCandidate(element) {
    if (!(element instanceof Element) || element.getAttribute("aria-hidden") === "true") return false;
    if (element.matches(OVERFLOW_TOOLTIP_SELECTOR)) return true;
    const style = getComputedStyle(element);
    return style.textOverflow === "ellipsis"
      || (style.overflow !== "visible" && style.webkitLineClamp && style.webkitLineClamp !== "none");
  };
  r.$syncOverflowTooltip = syncOverflowTooltip;
}

function setupOverflowTooltips1(r) {
  const handlePotentialOverflow = (event) => {
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue;
      if (r.$isOverflowTooltipCandidate(node)) {
        if (r.$syncOverflowTooltip(node)) return;
      }
    }
  };
  document.addEventListener("pointerover", handlePotentialOverflow, true);
  document.addEventListener("focusin", handlePotentialOverflow, true);
  r.$shadow.addEventListener("pointerover", handlePotentialOverflow, true);
  r.$shadow.addEventListener("focusin", handlePotentialOverflow, true);
}

export const registerOverflowTooltips = [registerOverflowTooltips1];
export const setupOverflowTooltips = [setupOverflowTooltips1];
