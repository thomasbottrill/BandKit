import { MESSAGES } from "../shared/contracts.js";

export function createAnalysisCache({ version, maxEntries = 250, ttlMs = 12 * 60 * 60 * 1000 }) {
  const results = new Map();
  let loaded = false;
  let persistTimer = null;

  const trim = () => {
    const cutoff = Date.now() - ttlMs;
    for (const [key, result] of results) {
      if (Number(result?.cachedAt) < cutoff) results.delete(key);
    }
    while (results.size > maxEntries) results.delete(results.keys().next().value);
  };

  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const stored = await chrome.runtime.sendMessage({ type: MESSAGES.OFFSCREEN_GET_ANALYSIS_STORAGE });
      for (const [key, result] of Object.entries(stored?.trackAnalysisCache || {})) {
        const bpm = Number(result?.bpm);
        if ((result?.key || bpm > 0) && result.version === version && Number(result.cachedAt) > 0) {
          results.set(key, {
            bpm: bpm > 0 ? bpm : null,
            bpmUncertain: Boolean(result.bpmUncertain),
            key: result.key,
            waveform: [],
            cachedAt: Number(result.cachedAt)
          });
        }
      }
      trim();
    } catch {
      // Analysis remains available when session storage is unavailable.
    }
  };

  const persist = () => {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      trim();
      const compact = Object.fromEntries([...results.entries()].map(([key, result]) => [key, {
        bpm: result.bpm,
        bpmUncertain: Boolean(result.bpmUncertain),
        key: result.key,
        version,
        cachedAt: result.cachedAt
      }]));
      chrome.runtime.sendMessage({
        type: MESSAGES.OFFSCREEN_SET_ANALYSIS_STORAGE,
        trackAnalysisCache: compact
      }).catch(() => {});
    }, 100);
  };

  return {
    get: (key) => results.get(key),
    has: (key) => results.has(key),
    load,
    set(key, result) {
      results.delete(key);
      results.set(key, { ...result, cachedAt: Date.now() });
      trim();
      persist();
    }
  };
}
