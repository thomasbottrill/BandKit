// Bandcamp refuses to add a name-your-price release to a collection below the
// per-currency minimum its own buy dialog shows ("Pay €0.50 EUR or more…").
// The rule lives in Bandcamp's bundle: an album needs the currency's "medium"
// minimum and a track the "small" one. Asking Bandcamp for those numbers keeps
// Bandkit from inventing a floor that only fails later, at checkout.
const CURRENCY_DATA_URL = "https://bandcamp.com/api/currency_data/1/javascript";
const CURRENCY_DATA_TTL_MS = 24 * 60 * 60 * 1000;
const CURRENCY_DATA_RETRY_MS = 5 * 60 * 1000;
const CURRENCY_DATA_TIMEOUT_MS = 8000;
const DEFAULT_MINIMUM = { small: 0.5, medium: 1 };
const FALLBACK_MINIMUMS = new Map([
  ["USD", { small: 0.5, medium: 1 }],
  ["EUR", { small: 0.25, medium: 0.5 }],
  ["GBP", { small: 0.25, medium: 0.5 }],
  ["AUD", { small: 0.5, medium: 1 }],
  ["CAD", { small: 0.5, medium: 1 }],
  ["NZD", { small: 0.5, medium: 1 }],
  ["CHF", { small: 0.5, medium: 1 }],
  ["JPY", { small: 70, medium: 140 }]
]);

let cache = { expiresAt: 0, minimums: new Map() };

function extractJsonObject(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

export async function loadCurrencyMinimums() {
  if (Date.now() < cache.expiresAt && cache.minimums.size) return cache.minimums;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CURRENCY_DATA_TIMEOUT_MS);
  try {
    const response = await fetch(CURRENCY_DATA_URL, { credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error(`Bandcamp returned ${response.status}`);
    const text = await response.text();
    const start = text.indexOf("{");
    const parsed = start >= 0 ? JSON.parse(extractJsonObject(text, start)) : null;
    const minimums = new Map();
    for (const [code, info] of Object.entries(parsed?.info || {})) {
      const small = Number(info?.small_min_price);
      const medium = Number(info?.medium_min_price);
      if (Number.isFinite(small) && small > 0 && Number.isFinite(medium) && medium > 0) {
        minimums.set(code, { small, medium });
      }
    }
    if (minimums.size) {
      cache = { expiresAt: Date.now() + CURRENCY_DATA_TTL_MS, minimums };
      return cache.minimums;
    }
  } catch {
    // Fall through to the last good table, then to the built-in fallbacks.
  } finally {
    clearTimeout(timeout);
  }
  cache = { expiresAt: Date.now() + CURRENCY_DATA_RETRY_MS, minimums: cache.minimums };
  return cache.minimums.size ? cache.minimums : FALLBACK_MINIMUMS;
}

export function cartMinimumFor(minimums, currency, itemType) {
  const table = minimums instanceof Map ? minimums : FALLBACK_MINIMUMS;
  const code = /^[A-Z]{3}$/.test(currency || "") ? currency : "USD";
  const entry = table.get(code) || FALLBACK_MINIMUMS.get(code) || DEFAULT_MINIMUM;
  return itemType === "track" || itemType === "t" ? entry.small : entry.medium;
}
