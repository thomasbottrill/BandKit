const SEARCH_PATH = "/search";
const STRONG_MATCH_SCORE = 2000;
const INSTANT_MATCH_SCORE = 1200;
const INSTANT_RESULT_LIMIT = 5;
const AUTOCOMPLETE_URL = "/api/bcsearch_public_api/1/autocomplete_elastic";
const instantSearchRoots = new WeakSet();
const instantSearchCache = new Map();

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizePhrase(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left, right) {
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1])
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function searchSimilarity(left, right) {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);
  const length = Math.max(normalizedLeft.length, normalizedRight.length);
  return length ? 1 - editDistance(normalizedLeft, normalizedRight) / length : 1;
}

function exactTypeLabel(type) {
  if (type === "b") return "Exact artist match";
  if (type === "a") return "Exact album match";
  if (type === "t") return "Exact track match";
  if (type === "f") return "Exact fan match";
  return "Exact match";
}

export function scoreSearchMetadata(metadata, query) {
  const queryCompact = normalizeSearchText(query);
  const queryPhrase = normalizePhrase(query);
  if (!queryCompact) return { score: 0, reason: "" };
  const titleCompact = normalizeSearchText(metadata.title);
  const artistCompact = normalizeSearchText(metadata.artist);
  const titlePhrase = normalizePhrase(metadata.title);
  const artistPhrase = normalizePhrase(metadata.artist);
  const tagsPhrase = normalizePhrase(metadata.tags);
  const textCompact = normalizeSearchText(metadata.text);

  if (metadata.type === "b" && titleCompact === queryCompact) {
    return { score: 5000, reason: "Exact artist match" };
  }
  // Joined artist names are the important exception to Bandcamp's tokenisation:
  // “Trick Pony” should recognise releases credited to “trickpony”.
  if (artistCompact === queryCompact) return { score: 4500, reason: "Artist match" };
  if (titleCompact === queryCompact) return { score: 4200, reason: exactTypeLabel(metadata.type) };
  if (titlePhrase.includes(queryPhrase)) return { score: 2600, reason: "Title match" };
  if (artistPhrase.includes(queryPhrase)) return { score: 2500, reason: "Artist match" };
  if (titleCompact.includes(queryCompact)) return { score: 1800, reason: "Partial title match" };
  if (artistCompact.includes(queryCompact)) return { score: 1700, reason: "Artist match" };

  const titleSimilarity = searchSimilarity(metadata.title, query);
  const artistSimilarity = searchSimilarity(metadata.artist, query);
  if (artistSimilarity >= .84) {
    return { score: 2300 + Math.round(artistSimilarity * 500), reason: "Artist match" };
  }
  const similarity = Math.max(titleSimilarity, artistSimilarity);
  if (similarity >= .72) return { score: 900 + Math.round(similarity * 500), reason: "Close match" };

  const tokens = queryPhrase.split(" ").filter(Boolean);
  if (tokens.length && tokens.every((token) => tagsPhrase.includes(token))) {
    return { score: 300, reason: "Matched in tags" };
  }
  if (textCompact.includes(queryCompact)) return { score: 100, reason: "Related match" };
  return { score: 0, reason: "" };
}

function resultType(result) {
  try {
    return JSON.parse(result.dataset.search || "{}").type || "";
  } catch {
    return "";
  }
}

function resultMetadata(result) {
  const subhead = result.querySelector(".subhead")?.textContent.replace(/\s+/g, " ").trim() || "";
  return {
    title: result.querySelector(".heading")?.textContent.replace(/\s+/g, " ").trim() || "",
    artist: subhead.replace(/^(?:from\s+.+?\s+)?by\s+/i, "").trim(),
    tags: result.querySelector(".tags")?.textContent.replace(/^tags:\s*/i, "").trim() || "",
    text: result.textContent.replace(/\s+/g, " ").trim(),
    type: resultType(result)
  };
}

function canonicalResultUrl(result) {
  const href = result.querySelector(".heading a[href], .artcont[href]")?.href || "";
  try {
    const url = new URL(href);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function currentQuery() {
  return document.querySelector("#searchwidget #q")?.value
    || new URL(location.href).searchParams.get("q")
    || "";
}

function joinedQuery(query) {
  return normalizePhrase(query).replace(/\s+/g, "");
}

async function joinedNameResults(query, currentResults) {
  const joined = joinedQuery(query);
  if (!joined || normalizePhrase(query) === joined) return [];
  const url = new URL(SEARCH_PATH, location.origin);
  url.searchParams.set("q", joined);
  const type = new URL(location.href).searchParams.get("item_type") || "";
  if (type) url.searchParams.set("item_type", type);
  try {
    const response = await fetch(url.href, { credentials: "same-origin" });
    if (!response.ok) return [];
    const parsed = new DOMParser().parseFromString(await response.text(), "text/html");
    const known = new Set(currentResults.map(canonicalResultUrl).filter(Boolean));
    return [...parsed.querySelectorAll(".search .result-items > .searchresult")]
      .filter((result) => {
        const score = scoreSearchMetadata(resultMetadata(result), query).score;
        const canonical = canonicalResultUrl(result);
        if (score < STRONG_MATCH_SCORE || !canonical || known.has(canonical)) return false;
        known.add(canonical);
        return true;
      })
      .slice(0, 3)
      .map((result) => {
        const clone = document.importNode(result, true);
        clone.dataset.bandkitSearchFallback = "joined-name";
        return clone;
      });
  } catch {
    return [];
  }
}

function addOpenAction(result, metadata) {
  const heading = result.querySelector(".heading");
  const nativeLink = heading?.querySelector("a[href]");
  if (!heading || !nativeLink || heading.querySelector(".bandkit-search-open")) return;
  const open = document.createElement("a");
  open.className = "bandkit-search-open";
  open.href = nativeLink.href;
  open.textContent = "Open";
  open.setAttribute("aria-label", `Open ${metadata.title}`);
  heading.append(open);
}

function addMatchContext(result, label, best) {
  result.querySelector(".bandkit-search-match-context")?.remove();
  if (!label) return;
  const itemType = result.querySelector(".itemtype");
  if (!itemType) return;
  const context = document.createElement("span");
  context.className = "bandkit-search-match-context";
  context.textContent = best ? `Best match · ${label}` : label;
  itemType.append(context);
}

function suggestionValue(ranked, query) {
  if (!ranked.length || ranked[0].score >= STRONG_MATCH_SCORE) return "";
  const candidates = ranked.flatMap(({ metadata }) => [metadata.title, metadata.artist]).filter(Boolean);
  const value = candidates.sort((left, right) => searchSimilarity(right, query) - searchSimilarity(left, query))[0] || "";
  return value && searchSimilarity(value, query) >= .72 && normalizePhrase(value) !== normalizePhrase(query) ? value : "";
}

function renderSuggestion(list, suggestion) {
  document.querySelector(".bandkit-search-suggestion")?.remove();
  if (!suggestion) return;
  const row = document.createElement("p");
  row.className = "bandkit-search-suggestion";
  row.append(`Did you mean “${suggestion}”? `);
  const link = document.createElement("a");
  const url = new URL(SEARCH_PATH, location.origin);
  url.searchParams.set("q", suggestion);
  link.href = url.href;
  link.textContent = "Search this instead";
  link.setAttribute("aria-label", `Search for ${suggestion} instead`);
  row.append(link);
  list.before(row);
}

async function enhanceSearchResults() {
  const list = document.querySelector(".search .result-items");
  if (!list) return;
  const query = currentQuery();
  const nativeResults = [...list.querySelectorAll(":scope > .searchresult")];
  const fallback = await joinedNameResults(query, nativeResults);
  if (fallback.length) list.append(...fallback);
  const ranked = [...list.querySelectorAll(":scope > .searchresult")]
    .map((result, index) => {
      const metadata = resultMetadata(result);
      return { result, metadata, index, ...scoreSearchMetadata(metadata, query) };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const bestScore = ranked[0]?.score || 0;
  ranked.forEach((entry, index) => {
    const best = index === 0 && bestScore > 0;
    entry.result.toggleAttribute("data-bandkit-search-best", best);
    addOpenAction(entry.result, entry.metadata);
    addMatchContext(entry.result, index < 5 && entry.score >= 300 ? entry.reason : "", best);
    list.append(entry.result);
  });
  renderSuggestion(list, suggestionValue(ranked, query));
}

export function autocompleteResultMetadata(result) {
  return {
    title: result?.name || "",
    artist: result?.band_name || "",
    tags: Array.isArray(result?.tag_names) ? result.tag_names.join(" ") : "",
    text: [result?.name, result?.band_name, ...(result?.tag_names || [])].filter(Boolean).join(" "),
    type: result?.type || ""
  };
}

export function usefulJoinedAutocompleteResults(results, query) {
  return (results || [])
    .map((result, index) => ({
      result,
      index,
      ...scoreSearchMetadata(autocompleteResultMetadata(result), query)
    }))
    .filter((entry) => entry.score >= INSTANT_MATCH_SCORE)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function instantResultUrl(result) {
  return result?.item_url_path || result?.item_url_root || "";
}

function canonicalUrl(value) {
  try {
    const url = new URL(value, location.origin);
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function instantDomMetadata(item) {
  const anchor = item.querySelector("a.result-link");
  const subtitle = anchor?.querySelector(".subtitle")?.textContent.replace(/^by\s+/i, "").trim() || "";
  const label = anchor?.querySelector(".item-type")?.textContent.trim().toLocaleLowerCase() || "";
  const type = label.startsWith("artist") || label.startsWith("label") ? "b"
    : label.startsWith("album") ? "a"
      : label.startsWith("track") ? "t"
        : label.startsWith("fan") ? "f" : "";
  return {
    title: anchor?.querySelector(".title")?.textContent.trim() || "",
    artist: subtitle,
    tags: "",
    text: anchor?.textContent.replace(/\s+/g, " ").trim() || "",
    type
  };
}

function resultTypeName(type) {
  if (type === "b") return "Artist";
  if (type === "a") return "Album";
  if (type === "t") return "Track";
  if (type === "f") return "Fan";
  return "Result";
}

export function instantArtworkUrl(result) {
  const value = String(result?.img || "");
  if (!value || !["a", "t"].includes(result?.type)) return value;
  return value.replace(/\/img\/(?=\d)/, "/img/a");
}

function cloneInstantResult(root, result) {
  const typeName = resultTypeName(result.type).toLocaleLowerCase();
  const templates = [...root.querySelectorAll(".result-links-list > li:not([data-bandkit-instant-result])")];
  const template = templates.find((item) => item.querySelector(".item-type")?.textContent.trim().toLocaleLowerCase().startsWith(typeName))
    || templates[0];
  if (!template) return null;
  const item = template.cloneNode(true);
  item.hidden = false;
  item.dataset.bandkitInstantResult = "joined-name";
  const anchor = item.querySelector("a.result-link");
  const url = instantResultUrl(result);
  if (!anchor || !url) return null;
  anchor.href = url;
  anchor.setAttribute("aria-label", [result.name, result.band_name && `by ${result.band_name}`].filter(Boolean).join(" "));
  const image = anchor.querySelector("img");
  const artwork = instantArtworkUrl(result);
  if (image && artwork) {
    image.src = artwork;
    image.alt = "";
  }
  const title = anchor.querySelector(".title");
  if (title) title.textContent = result.name || "";
  let subtitle = anchor.querySelector(".subtitle");
  const subtitleText = result.type === "b" ? (result.location || "") : (result.band_name ? `by ${result.band_name}` : "");
  if (!subtitle && subtitleText && title) {
    subtitle = title.cloneNode(false);
    subtitle.className = "subtitle";
    title.after(subtitle);
  }
  if (subtitle) subtitle.textContent = subtitleText;
  const itemType = anchor.querySelector(".item-type");
  if (itemType) itemType.textContent = resultTypeName(result.type);
  return item;
}

async function fetchJoinedAutocomplete(query) {
  const joined = joinedQuery(query);
  if (!joined || normalizePhrase(query) === joined) return [];
  if (instantSearchCache.has(joined)) return instantSearchCache.get(joined);
  const request = fetch(new URL(AUTOCOMPLETE_URL, location.origin), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ search_text: joined, search_filter: "", fan_id: null, full_page: false })
  }).then(async (response) => response.ok ? (await response.json())?.auto?.results || [] : []).catch(() => []);
  instantSearchCache.set(joined, request);
  return request;
}

function renderInstantList(root, list, joinedEntries, query, filter) {
  list.querySelectorAll(":scope > [data-bandkit-instant-result]").forEach((item) => item.remove());
  const native = [...list.querySelectorAll(":scope > li")].map((item, index) => {
    const metadata = instantDomMetadata(item);
    return {
      item,
      metadata,
      index,
      canonical: canonicalUrl(item.querySelector("a.result-link")?.href),
      ...scoreSearchMetadata(metadata, query)
    };
  });
  const known = new Set(native.map((entry) => entry.canonical).filter(Boolean));
  const additions = joinedEntries
    .filter((entry) => !filter || entry.result.type === filter)
    .filter((entry) => {
      const canonical = canonicalUrl(instantResultUrl(entry.result));
      if (!canonical || known.has(canonical)) return false;
      known.add(canonical);
      return true;
    })
    .map((entry) => ({
      ...entry,
      metadata: autocompleteResultMetadata(entry.result),
      item: cloneInstantResult(root, entry.result),
      canonical: canonicalUrl(instantResultUrl(entry.result)),
      index: native.length + entry.index
    }))
    .filter((entry) => entry.item);
  const ranked = [...native, ...additions]
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, INSTANT_RESULT_LIMIT);
  const visibleItems = new Set(ranked.map((entry) => entry.item));
  native.forEach((entry) => { entry.item.hidden = !visibleItems.has(entry.item); });
  ranked.forEach((entry, index) => {
    entry.item.toggleAttribute("data-bandkit-instant-best", index === 0 && entry.score >= INSTANT_MATCH_SCORE);
    list.append(entry.item);
    entry.item.removeAttribute("hidden");
  });
}

function resetInstantLists(lists) {
  lists.forEach((list) => {
    list.querySelectorAll(":scope > [data-bandkit-instant-result]").forEach((item) => item.remove());
    list.querySelectorAll(":scope > li").forEach((item) => {
      item.hidden = false;
      item.removeAttribute("data-bandkit-instant-best");
    });
  });
}

async function enhanceInstantSearch(root, state) {
  const input = root.querySelector(".site-search-form input");
  const query = input?.value.trim() || "";
  const lists = [...root.querySelectorAll(".search-instant-inline .result-links-list")];
  if (!lists.length) return;
  if (!query || normalizePhrase(query) === joinedQuery(query)) {
    state.rendering = true;
    resetInstantLists(lists);
    Promise.resolve().then(() => { state.rendering = false; });
    return;
  }
  const requestId = ++state.requestId;
  const joinedEntries = usefulJoinedAutocompleteResults(await fetchJoinedAutocomplete(query), query);
  if (requestId !== state.requestId || input.value.trim() !== query) return;
  state.rendering = true;
  if (!joinedEntries.length) {
    resetInstantLists(lists);
    Promise.resolve().then(() => { state.rendering = false; });
    return;
  }
  const filters = ["", "b", "a", "t", "f"];
  lists.forEach((list, index) => renderInstantList(root, list, joinedEntries, query, filters[index] || ""));
  Promise.resolve().then(() => { state.rendering = false; });
}

function installInstantSearch(root) {
  if (!root || instantSearchRoots.has(root)) return false;
  instantSearchRoots.add(root);
  const state = { timer: 0, requestId: 0, rendering: false };
  const style = document.createElement("style");
  style.id = "bandkit-instant-search-style";
  style.textContent = `
    .result-links-list > li[hidden] { display: none !important; }
    .result-links-list > li[data-bandkit-instant-result] { display: list-item !important; }
    .result-links-list > li[data-bandkit-instant-best] > .result-link {
      box-shadow: inset 3px 0 var(--bandkit-page-navbar-accent, currentColor);
    }
  `;
  (root.nodeType === 9 ? document.head : root).append(style);
  const schedule = () => {
    if (state.rendering) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => void enhanceInstantSearch(root, state), 260);
  };
  root.addEventListener("input", schedule, true);
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  schedule();
  return true;
}

function setupInstantSearch() {
  installInstantSearch(document);
  const connect = () => installInstantSearch(document.querySelector("menu-bar")?.shadowRoot);
  if (connect()) return;
  const observer = new MutationObserver(() => {
    if (!connect()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function setupSearchResults() {
  if (location.hostname !== "bandcamp.com") return;
  setupInstantSearch();
  if (location.pathname.replace(/\/+$/, "") === SEARCH_PATH) void enhanceSearchResults();
}
