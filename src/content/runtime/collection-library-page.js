import { STORAGE_KEYS } from "../../shared/contracts.js";
import { emptyLibrary, normalizeLibraryQuery } from "../../shared/library.js";
import { createButtonIcon, createElement } from "../core.js";

const CARDS = '#collection-items .collection-item-container, #wishlist-items .collection-item-container';
const scopeForTab = (tab) => tab === "collection" ? "owned" : tab === "wishlist" ? "wishlist" : "";

// Only replace the native grid while a search, tag, filter or release detail
// is open. Untouched browsing keeps Bandcamp's cards, paging and actions.
export function syncLibraryNativeGrid(r) {
  const query = normalizeLibraryQuery(r.$libraryQuery);
  const filtered = Boolean(r.$libraryDetail || r.$libraryCrateId
    || Object.entries(query).some(([key, value]) => key === "sort" ? value !== "added" : key !== "scope" && value));
  for (const id of ["collection-grid", "wishlist-grid"]) {
    const grid = document.getElementById(id);
    const active = grid?.contains(r.$libraryContent) && filtered;
    if (grid?.classList.contains("bandkit-library-filtered") !== Boolean(active)) grid?.classList.toggle("bandkit-library-filtered", Boolean(active));
  }
  if (document.documentElement.dataset.bandkitLibraryFiltered !== String(filtered)) document.documentElement.dataset.bandkitLibraryFiltered = String(filtered);
  return filtered;
}
export function bindLibraryNotes(r) {
  const account = r.$library.accounts[r.$libraryAccountId];
  if (!account) return;
  for (const card of document.querySelectorAll(CARDS)) {
    if (card.querySelector('.bandkit-library-card-note')) continue;
    const id = `${card.dataset.itemtype === "track" ? "t" : "a"}:${card.dataset.itemid}`;
    const item = account.items[id];
    if (!item) continue;
    const button = createElement("button", "bandkit-library-card-note"); button.type = "button";
    button.title = `Notes and tags for ${item.title}`; button.setAttribute("aria-label", button.title);
    button.append(createButtonIcon("icon-edit.svg"));
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); r.$openLibraryDetail(id); });
    card.querySelector(".collection-title-details")?.append(button);
  }
}
function mount(r) {
  const tab = document.querySelector('#grid-tabs > li.active')?.dataset.tab;
  const scope = scopeForTab(tab);
  const account = r.$library.accounts[r.$libraryAccountId];
  const enabled = Boolean(scope && account);
  if (document.documentElement.dataset.bandkitLibrary !== String(enabled)) document.documentElement.dataset.bandkitLibrary = String(enabled);
  if (!scope) { r.$libraryContent.hidden = true; r.$libraryControls?.remove(); return; }
  const grid = document.getElementById(`${tab}-grid`);
  if (!grid) return;
  r.$libraryContent.hidden = false;
  if (r.$libraryContent.parentElement !== grid) grid.prepend(r.$libraryContent);
  if (r.$libraryScope !== scope) {
    r.$libraryScope = scope;
    r.$libraryQuery = normalizeLibraryQuery({ scope });
    r.$libraryCrateId = ""; r.$libraryCrateName = ""; r.$libraryDetail = null;
    r.$renderLibrary();
  } else if (r.$libraryControls && !r.$libraryControls.isConnected) r.$renderLibrary();
  bindLibraryNotes(r);
}
export function setupCollectionLibraryPage(r) {
  const blob = r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob");
  if (!blob?.fan_data?.is_own_page || !document.querySelector("#grid-tabs")) return;
  r.$libraryAccountId = String(blob.fan_data.fan_id);
  r.$libraryContent = createElement("section", "bandkit-library");
  r.$libraryContent.setAttribute("aria-label", "Organise your music");
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; mount(r); });
  };
  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === "attributes" || [...record.addedNodes].some((node) =>
      node.nodeType === 1 && (node.matches?.(".collection-item-container") || node.querySelector?.(".collection-item-container"))))) schedule();
  });
  observer.observe(document.querySelector("#grid-tabs"), { attributes: true, subtree: true, attributeFilter: ["class"] });
  observer.observe(document.querySelector("#grids"), { childList: true, subtree: true });
  void r.$loadLibrary().then(() => { mount(r); r.$renderLibrary(); }).catch(() => mount(r));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEYS.LIBRARY]) return;
    const hadAccount = Boolean(r.$library.accounts[r.$libraryAccountId]);
    r.$library = changes[STORAGE_KEYS.LIBRARY].newValue || emptyLibrary();
    const hasAccount = Boolean(r.$library.accounts[r.$libraryAccountId]);
    if (hadAccount !== hasAccount) { mount(r); r.$renderLibrary(); }
    else if (!r.$libraryDetail) r.$updateLibraryResults();
  });
  window.addEventListener("pagehide", () => { r.$libraryTagIndex.token += 1; observer.disconnect(); cancelAnimationFrame(frame); });
}
