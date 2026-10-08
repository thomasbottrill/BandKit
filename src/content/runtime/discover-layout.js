// Keep the selected release scrollable before Bandcamp's native sticky threshold.
export function setupDiscoverLayout() {
  if (location.hostname !== "bandcamp.com" || !/^\/discover(?:\/|$)/.test(location.pathname)) return;
  let scheduled = false;
  let panel = null;
  let observedBanner = null;
  const bannerResize = new ResizeObserver(() => schedule());
  const update = () => {
    scheduled = false;
    const next = document.querySelector("#DiscoverApp .focused-result");
    if (next !== panel) {
      panel = next;
      if (panel) {
        panel.addEventListener("pointerenter", update);
        panel.addEventListener("focusin", update);
        panel.tabIndex = 0;
        panel.setAttribute("role", "region");
        panel.setAttribute("aria-label", "Selected release");
      }
    }
    if (!panel) return;
    const content = panel.querySelector(".tralbum-purchase-options-browser");
    const cover = content?.querySelector(".images .cover");
    const album = cover?.getAttribute("alt")?.replace(/^View /, "").trim() || "";
    if (content && album) {
      let title = content.querySelector(".bandkit-discover-album-title");
      if (!title) {
        title = document.createElement("h2");
        title.className = "bandkit-discover-album-title";
        content.append(title);
      }
      if (title.textContent !== album) title.textContent = album;
    }
    if (window.innerWidth < 900) return;
    const banner = document.querySelector("#DiscoverApp .bandkit-compact-filters");
    if (banner && banner !== observedBanner) {
      bannerResize.disconnect();
      bannerResize.observe(banner);
      observedBanner = banner;
    }
    const headerBottom = [".menu-bar-container", "#content", ".breadcrumbs-bar:not(.hidden)"]
      .map((selector) => document.querySelector(`#DiscoverApp ${selector}`)?.getBoundingClientRect())
      .filter((rect) => rect && rect.height > 0 && rect.top < 180 && rect.bottom > 0)
      .reduce((bottom, rect) => Math.max(bottom, Math.ceil(rect.bottom)), 0);
    const stickyTop = Math.max(66, headerBottom + 12, Math.ceil(banner?.getBoundingClientRect().bottom || 0) + 12);
    const stickyValue = `${stickyTop}px`;
    if (panel.style.getPropertyValue("--bandkit-discover-sticky-top") !== stickyValue) {
      panel.style.setProperty("--bandkit-discover-sticky-top", stickyValue);
    }
    const top = Math.max(stickyTop, Math.ceil(panel.getBoundingClientRect().top));
    const value = `${top}px`;
    if (panel.style.getPropertyValue("--bandkit-discover-panel-top") !== value) {
      panel.style.setProperty("--bandkit-discover-panel-top", value);
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !record.target.closest?.(".focused-result")
      || record.target.matches?.(".images .cover")
      || record.target.matches?.(".tralbum-purchase-options-browser"))) schedule();
  });
  const app = document.querySelector("#DiscoverApp");
  if (app) observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["alt"] });
  schedule();
}
