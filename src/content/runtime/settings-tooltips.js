// Render help above clipping/scrolling ancestors without changing panel layout.
export function setupSettingsTooltips(r) {
  const tip = document.createElement("div");
  tip.className = "hub-settings-help-tooltip";
  tip.id = "hub-settings-help-tooltip";
  tip.setAttribute("popover", "manual");
  tip.setAttribute("role", "tooltip");
  r.$shadow.append(tip);
  let anchor = null;
  const hide = () => {
    if (!anchor) return;
    anchor.removeAttribute("aria-describedby");
    anchor = null;
    tip.hidePopover();
  };
  const show = (element) => {
    if (!element || element === anchor) return;
    hide();
    anchor = element;
    element.dataset.tooltipPortaled = "true";
    element.setAttribute("aria-describedby", tip.id);
    tip.textContent = element.dataset.settingsTooltip;
    tip.showPopover();
    const box = element.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const above = box.top - size.height - 7;
    const top = above >= r.$content.getBoundingClientRect().top + 4 ? above : box.bottom + 7;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - size.width - 8, box.left))}px`;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - size.height - 8, top))}px`;
  };
  for (const event of ["pointerover", "focusin"]) {
    r.$shadow.addEventListener(event, (e) => show(e.target.closest?.("[data-settings-tooltip]")));
  }
  r.$shadow.addEventListener("pointerout", (e) => {
    if (anchor?.contains(e.target) && !anchor.contains(e.relatedTarget)) hide();
  });
  r.$shadow.addEventListener("focusout", hide);
  r.$shadow.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  r.$shadow.addEventListener("click", hide);
  r.$shadow.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
