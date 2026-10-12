import { createPanelViewTabs } from "../components/collections.js";

const RELEASE_FILTER_ATTRIBUTE = "data-bandkit-feed-catch-up";
const STORY_SELECTOR = "#stories-vm .story";

function feedPage() {
  return document.body.classList.contains("feed") || location.pathname.endsWith("/feed");
}

function syncFilteredStories(active) {
  for (const story of document.querySelectorAll(STORY_SELECTOR)) {
    const filtered = active && !story.classList.contains("nr");
    story.toggleAttribute("inert", filtered);
    story.setAttribute("aria-hidden", String(filtered));
  }
}

export function registerFeedCatchUp(r) {
  r.$feedCatchUpActive = false;
  r.$feedCatchUpScrollY = 0;

  r.$syncFeedCatchUp = () => {
    const active = r.$feedCatchUpActive;
    for (const button of r.$feedCatchUpFilter?.querySelectorAll("[data-bandkit-feed-view]") || []) {
      const selected = button.dataset.bandkitFeedView === (active ? "releases" : "feed");
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    syncFilteredStories(active);
  };

  r.$setFeedCatchUp = (active, { restoreScroll = true } = {}) => {
    const next = Boolean(active);
    if (next === r.$feedCatchUpActive) return;
    if (next) r.$feedCatchUpScrollY = window.scrollY;
    r.$feedCatchUpActive = next;
    document.documentElement.toggleAttribute(RELEASE_FILTER_ATTRIBUTE, next);
    r.$syncFeedCatchUp();

    window.requestAnimationFrame(() => {
      if (next) document.querySelector("#dash-container")?.scrollIntoView({ block: "start" });
      else if (restoreScroll) window.scrollTo({ top: r.$feedCatchUpScrollY, behavior: "auto" });
    });
  };
}

export function setupFeedCatchUp(r) {
  if (!feedPage()) return;
  const mount = () => {
    const stories = document.querySelector("#stories-vm");
    const dashboard = document.querySelector("#dash-container");
    if (!stories || !dashboard) return false;
    if (dashboard.querySelector(":scope > .bandkit-feed-filter")) return true;

    const filter = createPanelViewTabs({
      views: [{ id: "feed", label: "Feed" }, { id: "releases", label: "New releases" }],
      selected: "feed",
      onSelect: (view) => r.$setFeedCatchUp(view === "releases"),
      headerClass: "bandkit-feed-filter",
      tabsClass: "bandkit-feed-filter-tabs",
      buttonClass: "bandkit-feed-filter-tab",
      ariaLabel: "Feed view"
    });
    for (const button of filter.querySelectorAll("[role='tab']")) {
      button.dataset.bandkitFeedView = /release/i.test(button.textContent) ? "releases" : "feed";
    }
    filter.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...filter.querySelectorAll("[role='tab']")];
      const current = Math.max(0, tabs.indexOf(document.activeElement));
      const target = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[target].click();
      tabs[target].focus();
    });
    dashboard.prepend(filter);
    r.$feedCatchUpFilter = filter;
    r.$syncFeedCatchUp();

    let syncFrame = 0;
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(syncFrame);
      syncFrame = window.requestAnimationFrame(r.$syncFeedCatchUp);
    });
    observer.observe(stories, { childList: true, subtree: true });
    return true;
  };

  if (!mount()) {
    const pageObserver = new MutationObserver(() => {
      if (mount()) pageObserver.disconnect();
    });
    pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}
