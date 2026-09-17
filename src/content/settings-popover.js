const activePopovers = new WeakMap();

function positionPopover(anchor, popover) {
  if (!anchor.isConnected || !popover.isConnected) return;
  const margin = 8;
  const gap = 4;
  const anchorRect = anchor.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  popover.style.position = "fixed";
  popover.style.inset = "auto";
  popover.style.margin = "0";
  popover.style.minWidth = `${Math.round(anchorRect.width)}px`;
  popover.style.maxWidth = `${Math.max(0, viewportWidth - margin * 2)}px`;
  popover.style.visibility = "hidden";

  const popoverRect = popover.getBoundingClientRect();
  const cssMaxHeight = Number.parseFloat(getComputedStyle(popover).maxHeight);
  const availableBelow = viewportHeight - anchorRect.bottom - gap - margin;
  const availableAbove = anchorRect.top - gap - margin;
  const openAbove = popoverRect.height > availableBelow && availableAbove > availableBelow;
  const availableHeight = Math.max(96, openAbove ? availableAbove : availableBelow);
  const cappedHeight = Number.isFinite(cssMaxHeight) ? Math.min(availableHeight, cssMaxHeight) : availableHeight;
  const height = Math.min(popoverRect.height, cappedHeight);
  const top = openAbove
    ? Math.max(margin, anchorRect.top - gap - height)
    : Math.min(viewportHeight - margin - height, anchorRect.bottom + gap);
  const left = Math.min(
    Math.max(margin, anchorRect.right - popoverRect.width),
    Math.max(margin, viewportWidth - margin - popoverRect.width)
  );

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.maxHeight = `${Math.round(cappedHeight)}px`;
  popover.style.zIndex = "2147483647";
  popover.style.visibility = "visible";
}

export function openSettingsPopover(anchor, popover) {
  const owner = popover.parentNode;
  const root = anchor.getRootNode();
  if (!(root instanceof ShadowRoot)) return;
  root.append(popover);
  popover.hidden = false;
  const reposition = () => positionPopover(anchor, popover);
  activePopovers.set(popover, { owner, reposition });
  reposition();
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
}

export function closeSettingsPopover(popover) {
  const active = activePopovers.get(popover);
  popover.hidden = true;
  if (!active) return;
  window.removeEventListener("resize", active.reposition);
  window.removeEventListener("scroll", active.reposition, true);
  activePopovers.delete(popover);
  for (const property of ["position", "inset", "margin", "minWidth", "maxWidth", "maxHeight", "left", "top", "visibility", "zIndex"]) {
    popover.style[property] = "";
  }
  if (active.owner?.isConnected) active.owner.append(popover);
  else popover.remove();
}

export function settingsPopoverContainsFocus(anchor, popover) {
  const active = anchor.getRootNode()?.activeElement || document.activeElement;
  return anchor.contains(active) || popover.contains(active);
}
