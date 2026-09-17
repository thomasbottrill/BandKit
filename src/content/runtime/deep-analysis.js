import { runtimeSeamless } from "./context.js";
import { MESSAGES } from "../../shared/contracts.js";

const DEEP_ANALYSIS_FEEDBACK_MS = 900;

function activeTrackMatches(r, track) {
  return Boolean(runtimeSeamless.enabled && track
    && r.$matchingQueueTrack([track], runtimeSeamless.track || {}));
}

function stateAnalysisResult(r, track, state) {
  if (!state?.track || !r.$matchingQueueTrack([track], state.track)) return null;
  const bpm = Number(state.detectedBpm);
  return {
    id: track.id,
    url: track.url,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
    bpmUncertain: state.bpmUncertain === true,
    key: state.detectedKey || null,
    error: state.bpmError || ""
  };
}

function registerDeepAnalysis(r) {
  r.$deepAnalysisTrackKeys = new Set();
  r.$deepAnalysisResultLocks = new Set();
  r.$deepAnalysisResultOwners = new Map();
  r.$deepAnalysisRequest = null;
  r.$deepAnalysisButton = null;
  const releaseResultLock = (trackKey, owner, button = null) => {
    r.$deepAnalysisResultLocks.delete(trackKey);
    r.$deepAnalysisResultOwners.delete(trackKey);
    owner?.classList.remove("is-deep-analysis-result");
    if (owner) owner._bandkitDeepAnalysisResultKey = "";
    button?.classList.remove("is-awaiting-reentry");
    r.$syncDeepAnalysisButtons();
  };
  window.addEventListener("pointermove", (event) => {
    for (const [trackKey, owner] of r.$deepAnalysisResultOwners) {
      if (!owner?.isConnected) {
        releaseResultLock(trackKey, owner);
        continue;
      }
      const rect = owner.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) releaseResultLock(trackKey, owner, owner.querySelector(".bandkit-deep-analysis"));
    }
  }, { capture: true, passive: true });
  r.$keyAlternativeDescription = function keyAlternativeDescription(key) {
    if (!key?.uncertain || !key.alternative?.name) return "";
    return `Possible alternative: ${key.alternative.name}${key.alternative.camelot ? ` · ${key.alternative.camelot}` : ""}`;
  };
  r.$updateDeepAnalysisButton = function updateDeepAnalysisButton(button, track) {
    if (!button) return;
    button._bandkitTrack = track || null;
    const locked = Boolean(r.$deepAnalysisRequest);
    const running = locked && button === r.$deepAnalysisButton;
    const trackKey = track?.url ? r.$pageAnalysisTrackKey(track) : "";
    const awaitingReentry = Boolean(trackKey && r.$deepAnalysisResultLocks.has(trackKey));
    button.hidden = !track;
    button.disabled = locked;
    button.classList.toggle("is-analyzing", running);
    button.classList.toggle("is-awaiting-reentry", awaitingReentry);
    button.setAttribute("aria-busy", String(running));
    const visibleLabel = button.querySelector(".bandkit-deep-analysis-label");
    if (visibleLabel) visibleLabel.textContent = "Rescan";
    button.closest(".bandkit-track-analysis,.hub-player-analysis,.hub-dj-key")
      ?.classList.toggle("is-deep-analyzing", running);
    const action = running
      ? "Deep-scanning BPM and key…"
      : locked ? "Another deep BPM and key scan is in progress" : "Re-analyse BPM & key (deep scan)";
    button.title = action;
    button.setAttribute("aria-label", `${action}${track?.title ? ` for ${track.title}` : ""}`);
    window.queueMicrotask(() => {
      const owner = button.closest(".bandkit-track-analysis,.hub-player-analysis,.hub-dj-key");
      if (!owner) return;
      owner.classList.toggle("is-deep-analysis-result", awaitingReentry);
      if (!awaitingReentry || owner._bandkitDeepAnalysisResultKey === trackKey) return;
      owner._bandkitDeepAnalysisResultKey = trackKey;
      r.$deepAnalysisResultOwners.set(trackKey, owner);
      owner.addEventListener("pointerleave", () => {
        releaseResultLock(trackKey, owner, button);
      }, { once: true });
    });
  };
  r.$syncDeepAnalysisButtons = function syncDeepAnalysisButtons() {
    const buttons = new Set(document.querySelectorAll(".bandkit-deep-analysis"));
    r.$root?.querySelectorAll(".bandkit-deep-analysis").forEach((button) => buttons.add(button));
    if (r.$playerDeepAnalysis) buttons.add(r.$playerDeepAnalysis);
    buttons.forEach((button) => {
      r.$updateDeepAnalysisButton(button, button._bandkitTrack);
    });
  };
  r.$createDeepAnalysisButton = function createDeepAnalysisButton(track, className = "") {
    const button = document.createElement("button");
    button.className = `bandkit-deep-analysis${className ? ` ${className}` : ""}`;
    button.type = "button";
    const label = document.createElement("span");
    label.className = "bandkit-deep-analysis-label";
    label.textContent = "Rescan";
    const progress = document.createElement("span");
    progress.className = "bandkit-deep-analysis-progress";
    progress.setAttribute("aria-hidden", "true");
    progress.append(...[0, 1, 2].map(() => {
      const dot = document.createElement("i");
      dot.textContent = "·";
      return dot;
    }));
    button.append(label, progress);
    r.$updateDeepAnalysisButton(button, track);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button._bandkitTrack) void r.$requestDeepTrackAnalysis(button._bandkitTrack, button);
    });
    return button;
  };
  r.$requestDeepTrackAnalysis = function requestDeepTrackAnalysis(track, button) {
    if (!track?.url || r.$deepAnalysisRequest) return r.$deepAnalysisRequest;
    const key = r.$pageAnalysisTrackKey(track);
    const startedAt = performance.now();
    r.$deepAnalysisTrackKeys.add(key);
    r.$deepAnalysisButton = button || null;
    const request = (async () => {
      let toast = "";
      try {
        let result = null;
        if (activeTrackMatches(r, track)) {
          const state = await r.$seamlessCommand(MESSAGES.SEAMLESS_ANALYZE_BPM, { deep: true });
          result = stateAnalysisResult(r, track, state);
        } else {
          const response = await r.$runtimeMessage({ type: MESSAGES.ANALYZE_TRACKS, tracks: [track], force: true, deep: true });
          if (!response?.ok) throw new Error(response?.error || "Deep analysis failed.");
          result = response.results?.[0] || null;
        }
        if (result) r.$pageTrackAnalysis.set(key, result);
        toast = result?.error ? "Deep scan completed with limited confidence" : "Deep BPM & key scan complete";
      } catch (error) {
        toast = error.message || "Deep BPM & key scan failed.";
      } finally {
        const remainingFeedback = DEEP_ANALYSIS_FEEDBACK_MS - (performance.now() - startedAt);
        if (remainingFeedback > 0) await new Promise((resolve) => { window.setTimeout(resolve, remainingFeedback); });
        const analysisOwner = button?.closest(".bandkit-track-analysis,.hub-player-analysis,.hub-dj-key");
        if (analysisOwner?.matches(":hover")) {
          r.$deepAnalysisResultLocks.add(key);
          button.blur();
        }
        r.$deepAnalysisTrackKeys.delete(key);
        r.$deepAnalysisRequest = null;
        r.$syncDeepAnalysisButtons();
        r.$deepAnalysisButton = null;
        r.$syncPageTrackAnalysisUi?.();
      }
      r.$showToast(toast);
    })();
    r.$deepAnalysisRequest = request;
    r.$syncDeepAnalysisButtons();
    return request;
  };
}

function setupDeepAnalysis(r) {
  r.$playerDeepAnalysis = r.$createDeepAnalysisButton(runtimeSeamless.track, "hub-player-deep-analysis");
  r.$playerAnalysis.append(r.$playerDeepAnalysis);
}

export const registerDeepAnalysisRuntime = [registerDeepAnalysis];
export const setupDeepAnalysisRuntime = [setupDeepAnalysis];
