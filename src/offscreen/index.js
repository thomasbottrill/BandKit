import { MESSAGES } from "../shared/contracts.js";
import { createAnalysisCache } from "./analysis-cache.js";
import { createTrackAudioDecoder } from "./analysis.js";
import { createAnalysisGate } from "./analysis-gate.js";
import { createAnalysisWorkerClient } from "./analysis-worker-client.js";
import { installOffscreenEvents } from "./events.js";
import { interruptedPlay, startMediaPlayback, waitForMediaMetadata } from "./progressive.js";
import { compensatedHandoffTime, finiteNumber, gainFromDb, trackKey as stableTrackKey } from "./utils.js";
import { startVisualizerSignal } from "./visualizer.js";
import { createStateSender, updateMediaSessionState } from "./state.js";

const audio = document.querySelector("#bandcamp-hub-audio");
// The progressive player normally uses a same-origin Blob URL, but an
// out-of-buffer seek falls back to Bandcamp's range-seekable bcbits stream.
// Web Audio silences cross-origin media without an explicit CORS request even
// while currentTime continues advancing, creating a false-playing state.
audio.crossOrigin = "anonymous";
let queue = [];
let currentIndex = -1;
let enabled = false;
let status = "idle";
let playbackError = "";
let preservePitch = true;
let selectedRate = 1;
let scratchActive = false;
let autoplayRequested = false;
let loopBeats = 0;
let loopStart = 0;
let loopEnd = 0;
let beatLoopTimer = null;
let filterValue = 0;
let gainDb = 0;
let eqLowDb = 0;
let eqMidDb = 0;
let eqHighDb = 0;
let loadToken = 0;
let mediaRequestToken = 0;
const playbackSessionStartedAt = Date.now();
let playbackStateRevision = 0;
let pendingSeekTime = null;
let pendingSeekRevision = 0;
let bpmAnalysisToken = 0;
let detectedBpm = null;
let automaticBpm = null;
let automaticBpmUncertain = false;
let bpmSource = "auto";
let bpmStatus = "idle";
let bpmError = "";
let bpmUncertain = false;
let detectedKey = null;
let waveform = [];
const analysisFetchControllers = new Set();
const playbackPriorityControllers = new WeakSet();
const bpmOverrides = new Map();
const ANALYSIS_ALGORITHM_VERSION = 9;
const analysisCache = createAnalysisCache({ version: ANALYSIS_ALGORITHM_VERSION });
const analysisWorker = createAnalysisWorkerClient();
const PLAYBACK_PRIORITY_GRACE_MS = 750;
const PLAYBACK_ANALYSIS_HEADROOM_SECONDS = 15;
const PLAYBACK_ANALYSIS_RETRY_MS = 500;
const PLAYBACK_ANALYSIS_DELAY_MS = 8_000;
let bpmOverridesLoaded = false;
let playbackPriorityUntil = 0;
let analysisNotBefore = 0;
let audioContext = null;
let sourceNode = null;
let filterNode = null;
let lowEqNode = null;
let midEqNode = null;
let highEqNode = null;
let gainNode = null;
let analyserNode = null;
let visualizerHandoffUntil = 0;

function currentTrack() { return queue[currentIndex] || null; }

function stateSnapshot() {
  const track = currentTrack();
  const loading = status === "loading";
  const sourceUnavailable = loading || (status === "error" && !audio.src);
  const duration = sourceUnavailable
    ? finiteNumber(track?.duration)
    : Number.isFinite(audio.duration) ? audio.duration : finiteNumber(track?.duration);
  const currentTime = sourceUnavailable && pendingSeekTime !== null
    ? finiteNumber(pendingSeekTime)
    : sourceUnavailable ? 0 : finiteNumber(audio.currentTime);
  return {
    sessionStartedAt: playbackSessionStartedAt,
    revision: ++playbackStateRevision,
    enabled,
    status,
    error: playbackError,
    isPlaying: enabled && !loading && !audio.paused && !audio.ended,
    currentTime,
    duration,
    progress: duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0,
    rate: selectedRate,
    preservePitch,
    scratchActive,
    loopBeats,
    loopStart,
    loopEnd,
    filterValue,
    gainDb,
    eqLowDb,
    eqMidDb,
    eqHighDb,
    detectedBpm,
    automaticBpm,
    automaticBpmUncertain,
    bpmSource,
    bpmStatus,
    bpmError,
    bpmUncertain,
    detectedKey,
    waveform,
    index: currentIndex,
    track,
    queue
  };
}

function prioritizePlayback() {
  playbackPriorityUntil = Date.now() + PLAYBACK_PRIORITY_GRACE_MS;
  analysisNotBefore = Math.max(analysisNotBefore, Date.now() + PLAYBACK_ANALYSIS_DELAY_MS);
  for (const controller of analysisFetchControllers) {
    playbackPriorityControllers.add(controller);
    controller.abort();
  }
}

async function waitForPlaybackPriority(respectHeadroom = true) {
  while (status === "loading"
    || Date.now() < playbackPriorityUntil
    || (respectHeadroom && enabled && !audio.paused && !audio.ended && (
      Date.now() < analysisNotBefore
      || bufferedPlaybackHeadroom() < PLAYBACK_ANALYSIS_HEADROOM_SECONDS
    ))) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 25);
    });
  }
}

function bufferedPlaybackHeadroom() {
  const ranges = audio.buffered;
  const currentTime = finiteNumber(audio.currentTime);
  if (!ranges?.length) return 0;
  for (let index = 0; index < ranges.length; index += 1) {
    if (currentTime >= ranges.start(index) - 0.25 && currentTime <= ranges.end(index) + 0.25) {
      return Math.max(0, ranges.end(index) - currentTime);
    }
  }
  return 0;
}

async function waitForAnalysisHeadroom(token, trackUrl) {
  while (token === bpmAnalysisToken && currentTrack()?.url === trackUrl) {
    if (!enabled || audio.paused || audio.ended) return true;
    if (Date.now() >= analysisNotBefore
      && bufferedPlaybackHeadroom() >= PLAYBACK_ANALYSIS_HEADROOM_SECONDS) return true;
    await new Promise((resolve) => {
      window.setTimeout(resolve, PLAYBACK_ANALYSIS_RETRY_MS);
    });
  }
  return false;
}

async function loadBpmOverrides() {
  if (bpmOverridesLoaded) return;
  bpmOverridesLoaded = true;
  try {
    const stored = await chrome.runtime.sendMessage({ type: MESSAGES.OFFSCREEN_GET_ANALYSIS_STORAGE });
    for (const [key, value] of Object.entries(stored?.bpmCorrections || {})) {
      const bpm = finiteNumber(value);
      if (bpm >= 40 && bpm <= 300) bpmOverrides.set(key, bpm);
    }
  } catch {
    // Playback and automatic analysis still work when local storage is unavailable.
  }
}

function persistBpmOverrides() {
  const entries = [...bpmOverrides.entries()].slice(-500);
  chrome.runtime.sendMessage({
    type: MESSAGES.OFFSCREEN_SET_ANALYSIS_STORAGE,
    bpmCorrections: Object.fromEntries(entries)
  }).catch(() => {});
}

async function ensureAudioGraph() {
  if (gainNode) {
    if (audioContext?.state === "suspended") await audioContext.resume().catch(() => {});
    return true;
  }
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    audioContext ||= new AudioContextClass();
    if (typeof audioContext.createMediaElementSource !== "function") return false;
    sourceNode = audioContext.createMediaElementSource(audio);
    filterNode = audioContext.createBiquadFilter();
    lowEqNode = audioContext.createBiquadFilter();
    midEqNode = audioContext.createBiquadFilter();
    highEqNode = audioContext.createBiquadFilter();
    gainNode = audioContext.createGain();
    sourceNode.connect(filterNode);
    filterNode.connect(lowEqNode);
    lowEqNode.connect(midEqNode);
    midEqNode.connect(highEqNode);
    if (typeof audioContext.createAnalyser === "function") {
      analyserNode = audioContext.createAnalyser();
      Object.assign(analyserNode, { fftSize: 4096, minDecibels: -105, maxDecibels: -6, smoothingTimeConstant: 0.08 });
      highEqNode.connect(analyserNode);
      analyserNode.connect(gainNode);
      startVisualizerSignal({
        analyser: analyserNode,
        audio,
        isPlaying: () => enabled && !audio.paused && !audio.ended && status !== "loading",
        isTransitioning: () => enabled && (status === "loading" || Date.now() < visualizerHandoffUntil)
      });
    } else highEqNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    if (audioContext.state === "suspended") await audioContext.resume().catch(() => {});
    return true;
  } catch {
    sourceNode = null;
    filterNode = null;
    lowEqNode = null;
    midEqNode = null;
    highEqNode = null;
    gainNode = null;
    analyserNode = null;
    return false;
  }
}

function applyAudioEffects(
  nextFilter = filterValue,
  nextGainDb = gainDb,
  nextLowDb = eqLowDb,
  nextMidDb = eqMidDb,
  nextHighDb = eqHighDb
) {
  filterValue = Math.max(-1, Math.min(1, finiteNumber(nextFilter)));
  gainDb = Math.max(-30, Math.min(6, finiteNumber(nextGainDb)));
  eqLowDb = Math.max(-12, Math.min(12, finiteNumber(nextLowDb)));
  eqMidDb = Math.max(-12, Math.min(12, finiteNumber(nextMidDb)));
  eqHighDb = Math.max(-12, Math.min(12, finiteNumber(nextHighDb)));
  if (filterNode) {
    const now = audioContext.currentTime || 0;
    if (Math.abs(filterValue) < 0.01) {
      filterNode.type = "allpass";
      filterNode.frequency.setTargetAtTime(1000, now, 0.015);
    } else if (filterValue < 0) {
      filterNode.type = "lowpass";
      filterNode.frequency.setTargetAtTime(20000 * Math.pow(120 / 20000, Math.abs(filterValue)), now, 0.015);
    } else {
      filterNode.type = "highpass";
      filterNode.frequency.setTargetAtTime(20 * Math.pow(8000 / 20, filterValue), now, 0.015);
    }
    filterNode.Q.setTargetAtTime(0.72, now, 0.015);
  }
  if (lowEqNode && midEqNode && highEqNode) {
    const now = audioContext.currentTime || 0;
    lowEqNode.type = "lowshelf";
    lowEqNode.frequency.setTargetAtTime(250, now, 0.015);
    lowEqNode.gain.setTargetAtTime(eqLowDb, now, 0.015);
    midEqNode.type = "peaking";
    midEqNode.frequency.setTargetAtTime(1000, now, 0.015);
    midEqNode.Q.setTargetAtTime(0.9, now, 0.015);
    midEqNode.gain.setTargetAtTime(eqMidDb, now, 0.015);
    highEqNode.type = "highshelf";
    highEqNode.frequency.setTargetAtTime(4000, now, 0.015);
    highEqNode.gain.setTargetAtTime(eqHighDb, now, 0.015);
  }
  if (gainNode) {
    gainNode.gain.setTargetAtTime(gainFromDb(gainDb), audioContext.currentTime || 0, 0.015);
    audio.volume = 1;
  } else {
    audio.volume = Math.max(0, Math.min(1, gainFromDb(gainDb)));
  }
}


async function analyzeCurrentTrack(force = false, deep = false) {
  const track = currentTrack();
  if (!track?.url) return stateSnapshot();
  await Promise.all([loadBpmOverrides(), analysisCache.load()]);
  const key = stableTrackKey(track);
  if (!force && analysisCache.has(key)) {
    const cached = analysisCache.get(key);
    automaticBpm = cached.bpm;
    automaticBpmUncertain = Boolean(cached.bpmUncertain);
    detectedBpm = bpmOverrides.get(key) || automaticBpm;
    bpmSource = bpmOverrides.has(key) ? "manual" : "auto";
    bpmUncertain = bpmSource === "auto" && Boolean(cached.bpmUncertain);
    detectedKey = cached.key;
    waveform = cached.waveform || [];
    bpmStatus = detectedBpm ? "ready" : "error";
    bpmError = bpmUncertain ? "This is a best-effort tempo estimate." : "";
    sendState(true);
    return stateSnapshot();
  }
  const token = ++bpmAnalysisToken;
  if (!deep) {
    detectedBpm = null;
    automaticBpm = null;
    automaticBpmUncertain = false;
    bpmSource = "auto";
    detectedKey = null;
    waveform = [];
  }
  bpmStatus = "analyzing";
  bpmError = "";
  if (!deep) {
    bpmUncertain = false;
    sendState(true);
  }
  try {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio analysis is unavailable.");
    let buffer;
    while (!buffer) {
      // `force` bypasses the result cache only. It must never bypass playback
      // headroom: a manual reanalysis is still lower priority than starting,
      // switching, seeking, or continuously buffering the current track.
      await waitForPlaybackPriority();
      if (!await waitForAnalysisHeadroom(token, track.url)) return stateSnapshot();
      try {
        buffer = await decodeTrackAnalysisAudio(AudioContextClass, track.url, {
          duration: track.duration,
          segmentCount: deep ? 7 : 3,
          yieldControl: () => waitForPlaybackPriority()
        });
      } catch (error) {
        if (error?.code !== "PLAYBACK_PRIORITY") throw error;
      }
    }
    if (token !== bpmAnalysisToken || currentTrack()?.url !== track.url) return stateSnapshot();
    const { bpmError: analysisError, ...result } = await analysisWorker.analyze(buffer, { deep, priority: true });
    if (token !== bpmAnalysisToken || currentTrack()?.url !== track.url) return stateSnapshot();
    automaticBpm = result.bpm;
    automaticBpmUncertain = result.bpmUncertain;
    detectedBpm = bpmOverrides.get(key) || result.bpm;
    bpmSource = bpmOverrides.has(key) ? "manual" : "auto";
    bpmUncertain = bpmSource === "auto" && result.bpmUncertain;
    detectedKey = result.key;
    waveform = result.waveform;
    analysisCache.set(key, result);
    bpmStatus = result.bpm ? "ready" : "error";
    bpmError = analysisError;
  } catch (error) {
    if (token !== bpmAnalysisToken || currentTrack()?.url !== track.url) return stateSnapshot();
    if (token !== bpmAnalysisToken) return stateSnapshot();
    bpmStatus = "error";
    bpmError = error.message;
  }
  sendState(true);
  return stateSnapshot();
}

const TRACK_ANALYSIS_CONCURRENCY = 1;

// Bounds fetch/decode to one track at a time across every in-flight request.
const analysisGate = createAnalysisGate();

const decodeTrackAnalysisAudio = createTrackAudioDecoder({
  analysisFetchControllers,
  playbackPriorityControllers
});

async function analyzeTrack(track, force = false, deep = false) {
  await Promise.all([loadBpmOverrides(), analysisCache.load()]);
  const key = stableTrackKey(track);
  if (!force && analysisCache.has(key)) {
    const cached = analysisCache.get(key);
    return {
      id: track.id,
      url: track.url,
      bpm: bpmOverrides.get(key) || cached.bpm,
      bpmUncertain: !bpmOverrides.has(key) && Boolean(cached.bpmUncertain),
      key: cached.key
    };
  }
  const run = () => decodeAndAnalyzeTrack(track, key, deep);
  // A forced re-analysis must not adopt an in-flight unforced result.
  return force
    ? analysisGate.runExclusive(run)
    : analysisGate.share(`${key}:${deep ? "deep" : "quick"}`, run);
}

async function decodeAndAnalyzeTrack(track, key, deep) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio analysis is unavailable.");
  let buffer;
  while (!buffer) {
    await waitForPlaybackPriority();
    try {
      buffer = await decodeTrackAnalysisAudio(AudioContextClass, track.url, {
        duration: track.duration,
        segmentCount: deep ? 7 : 3,
        yieldControl: () => waitForPlaybackPriority()
      });
    } catch (error) {
      if (error?.code !== "PLAYBACK_PRIORITY") throw error;
    }
  }
  await waitForPlaybackPriority();
  const { bpmError: _analysisError, ...result } = await analysisWorker.analyze(buffer, { deep });
  analysisCache.set(key, result);
  return {
    id: track.id,
    url: track.url,
    bpm: bpmOverrides.get(key) || result.bpm,
    bpmUncertain: !bpmOverrides.has(key) && result.bpmUncertain,
    key: result.key
  };
}

async function analyzeTracks(tracks, force = false, deep = false) {
  const source = Array.isArray(tracks) ? tracks.slice(0, 100) : [];
  const results = new Array(source.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      const track = source[index];
      try {
        results[index] = await analyzeTrack(track, force, deep);
      } catch (error) {
        results[index] = {
          id: track?.id,
          url: track?.url,
          error: error.message || "Track analysis failed."
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(TRACK_ANALYSIS_CONCURRENCY, source.length) }, worker));
  return results;
}

const sendState = createStateSender(stateSnapshot);

function applyPlaybackOptions(rate = audio.playbackRate || 1, shouldPreservePitch = preservePitch) {
  const nextRate = Math.max(0.35, Math.min(2, finiteNumber(rate, 1)));
  selectedRate = nextRate;
  scratchActive = false;
  preservePitch = shouldPreservePitch !== false;
  audio.defaultPlaybackRate = nextRate;
  audio.playbackRate = nextRate;
  if ("preservesPitch" in audio) audio.preservesPitch = preservePitch;
  if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = preservePitch;
}

function applyScratch(multiplier = 1, active = true) {
  if (!active) {
    applyPlaybackOptions(selectedRate, preservePitch);
    return;
  }
  scratchActive = true;
  audio.playbackRate = Math.max(0.35, Math.min(2, selectedRate * finiteNumber(multiplier, 1)));
  if ("preservesPitch" in audio) audio.preservesPitch = false;
  if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = false;
}

function clearBeatLoop() {
  if (beatLoopTimer) window.clearTimeout(beatLoopTimer);
  beatLoopTimer = null;
  loopBeats = 0;
  loopStart = 0;
  loopEnd = 0;
}

function setBeatLoop(beats, bpm) {
  clearBeatLoop();
  const nextBeats = Number(beats);
  const nextBpm = Math.max(40, Math.min(300, finiteNumber(bpm, detectedBpm || 120)));
  if (![1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8].includes(nextBeats)) return;
  const duration = (60 / nextBpm) * nextBeats;
  loopBeats = nextBeats;
  loopStart = Math.max(0, finiteNumber(audio.currentTime));
  loopEnd = loopStart + duration;
  if (Number.isFinite(audio.duration)) loopEnd = Math.min(loopEnd, audio.duration);
  if (loopEnd <= loopStart + 0.004) {
    clearBeatLoop();
    return;
  }
  const watchBoundary = () => {
    beatLoopTimer = null;
    if (!enabled || !loopBeats) return;
    if (audio.paused || audio.ended) {
      beatLoopTimer = window.setTimeout(watchBoundary, 20);
      return;
    }

    const remaining = loopEnd - audio.currentTime;
    if (remaining <= 0.0015) {
      const loopDuration = loopEnd - loopStart;
      const overflow = Math.max(0, -remaining);
      audio.currentTime = loopStart + (overflow % loopDuration);
      beatLoopTimer = window.setTimeout(watchBoundary, 0);
      return;
    }

    // Wake close to the boundary instead of polling at a fixed interval. The
    // short final checks keep overshoot below a couple of milliseconds while
    // avoiding a permanently hot timer for longer loops.
    const playbackRate = Math.max(0.35, finiteNumber(audio.playbackRate, 1));
    const waitMs = Math.max(1, Math.min(20, (remaining / playbackRate) * 1000 - 1));
    beatLoopTimer = window.setTimeout(watchBoundary, waitMs);
  };
  watchBoundary();
}

async function applyDjOptions(options = {}) {
  applyPlaybackOptions(options.rate, options.preservePitch);
  await ensureAudioGraph();
  applyAudioEffects(options.filterValue, options.gainDb, options.eqLowDb, options.eqMidDb, options.eqHighDb);
}

function updateMediaSession() {
  updateMediaSessionState(audio, currentTrack());
}

function waitForMetadata(token) {
  return waitForMediaMetadata(audio, () => token === loadToken);
}

async function playForMediaRequest(request, token = loadToken) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (request !== mediaRequestToken || token !== loadToken) return false;
    try {
      await startMediaPlayback(audio);
      if (request !== mediaRequestToken || token !== loadToken) {
        if (!enabled) audio.pause();
        return false;
      }
      return true;
    } catch (error) {
      if (request !== mediaRequestToken || token !== loadToken) return false;
      if (!interruptedPlay(error)) throw error;
      await new Promise((resolve) => {
        window.setTimeout(resolve, 40 * (attempt + 1));
      });
    }
  }
  if (request !== mediaRequestToken || token !== loadToken) return false;
  throw new Error("Playback was interrupted while starting. Please try again.");
}

function isTimeBuffered(time) {
  const target = Math.max(0, finiteNumber(time));
  if (Math.abs(finiteNumber(audio.currentTime) - target) < 0.25) return true;
  const ranges = audio.buffered;
  if (!ranges) return false;
  for (let index = 0; index < ranges.length; index += 1) {
    if (target >= ranges.start(index) - 0.25 && target <= ranges.end(index) + 0.25) return true;
  }
  return false;
}

async function seekToTime(currentTime) {
  clearBeatLoop();
  const track = currentTrack();
  const duration = Number.isFinite(audio.duration) ? audio.duration : finiteNumber(track?.duration);
  const target = Math.max(0, Math.min(duration || Infinity, finiteNumber(currentTime)));
  pendingSeekTime = target;
  pendingSeekRevision += 1;
  if (status === "loading") {
    prioritizePlayback();
    sendState(true);
    return stateSnapshot();
  }
  const request = ++mediaRequestToken;
  try {
  const needsRemoteRangeSeek = Boolean(
    track?.url
    && status === "loading"
    && audio.src === track.url
    && !isTimeBuffered(target)
  );

  if (!needsRemoteRangeSeek) {
    audio.currentTime = target;
    if (status === "loading" && autoplayRequested && audio.paused) {
      const started = await playForMediaRequest(request);
      if (!started) return stateSnapshot();
      status = "playing";
      void analyzeCurrentTrack();
    }
    pendingSeekTime = null;
    sendState(true);
    return stateSnapshot();
  }

  // A MediaSource cannot seek beyond bytes that have already been appended.
  // Keep its download alive for analysis, but let the native media loader issue
  // a range request from the timestamp the listener actually selected.
  const token = loadToken;
  const resumePlayback = autoplayRequested || (!audio.paused && !audio.ended);
  autoplayRequested = resumePlayback;
  status = "loading";
  playbackError = "";
  prioritizePlayback();
  sendState(true);
  if (audio.src !== track.url) {
    audio.src = track.url;
    audio.load();
  }
  await waitForMetadata(token);
  if (request !== mediaRequestToken || token !== loadToken || currentTrack()?.url !== track.url) return stateSnapshot();
  audio.currentTime = target;
  if (resumePlayback) {
    const started = await playForMediaRequest(request, token);
    if (!started) return stateSnapshot();
  }
  pendingSeekTime = null;
  status = audio.paused ? "paused" : "playing";
  updateMediaSession();
  sendState(true);
  void analyzeCurrentTrack();
  return stateSnapshot();
  } catch (error) {
    if (request === mediaRequestToken) {
      pendingSeekTime = null;
      autoplayRequested = false;
      status = "error";
      playbackError = error?.message || "Bandcamp could not seek this stream.";
      updateMediaSession();
      sendState(true);
    }
    throw error;
  }
}

async function loadTrack(index, currentTime = 0, autoplay = false, handoffStartedAt = 0) {
  if (!queue.length) throw new Error("The seamless queue is empty.");
  currentIndex = Math.max(0, Math.min(queue.length - 1, Number(index) || 0));
  const track = currentTrack();
  const token = ++loadToken;
  const mediaRequest = ++mediaRequestToken;
  const handoffSeekRevision = pendingSeekRevision;
  pendingSeekTime = Math.max(0, finiteNumber(currentTime));
  autoplayRequested = Boolean(autoplay);
  clearBeatLoop();
  ++bpmAnalysisToken;
  detectedBpm = null;
  automaticBpm = null;
  automaticBpmUncertain = false;
  bpmSource = "auto";
  bpmStatus = "idle";
  bpmError = "";
  bpmUncertain = false;
  detectedKey = null;
  waveform = [];
  playbackError = "";
  // Chromium can report the replacement media as playing one or two analyser
  // samples before its FFT buffer contains the new audio. Keep the previous
  // contour on its gentle handoff curve through that short warm-up window.
  visualizerHandoffUntil = Date.now() + 240;
  status = "loading";
  prioritizePlayback();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  updateMediaSession();
  sendState(true);

  try {
    // Let Chromium's media loader stream the Bandcamp URL directly. The old
    // MediaSource path could abandon a healthy request and start the same URL
    // again, which made queue switches stall for several seconds.
    audio.src = track.url;
    audio.load();
    await applyDjOptions({ rate: audio.playbackRate || 1, preservePitch, filterValue, gainDb });
    if (token !== loadToken || mediaRequest !== mediaRequestToken) return stateSnapshot();
    const requestedSeekTime = Math.max(0, pendingSeekTime === null
      ? finiteNumber(currentTime)
      : finiteNumber(pendingSeekTime));
    if (requestedSeekTime > 0 || !autoplayRequested) {
      await waitForMetadata(token);
    }
    if (token !== loadToken || mediaRequest !== mediaRequestToken) return stateSnapshot();
    const latestSeekTime = Math.max(0, pendingSeekTime === null
      ? finiteNumber(currentTime)
      : finiteNumber(pendingSeekTime));
    const seekTime = pendingSeekRevision !== handoffSeekRevision
      ? latestSeekTime
      : compensatedHandoffTime(currentTime, handoffStartedAt, autoplayRequested);
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(seekTime, Math.max(0, audio.duration - 0.1));
    pendingSeekTime = null;
    status = "paused";
    if (autoplayRequested) {
      const started = await playForMediaRequest(mediaRequest, token);
      if (!started) return stateSnapshot();
      status = "playing";
      visualizerHandoffUntil = Date.now() + 240;
    }
    void analyzeCurrentTrack();
  } catch (error) {
    if (token !== loadToken || mediaRequest !== mediaRequestToken) return stateSnapshot();
    pendingSeekTime = null;
    autoplayRequested = false;
    status = "error";
    playbackError = error.message;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  updateMediaSession();
  sendState(true);
  return stateSnapshot();
}

async function nextTrack() {
  if (currentIndex + 1 >= queue.length) {
    status = "ended";
    sendState(true);
    return stateSnapshot();
  }
  return loadTrack(currentIndex + 1, 0, true);
}

async function previousTrack() {
  if (audio.currentTime > 4 || currentIndex <= 0) {
    clearBeatLoop();
    audio.currentTime = 0;
    sendState(true);
    return stateSnapshot();
  }
  return loadTrack(currentIndex - 1, 0, true);
}

async function updateQueue(message) {
const previousTrack = currentTrack();
    if (message.expectedTrack
      && stableTrackKey(message.expectedTrack) !== stableTrackKey(previousTrack)) {
      return stateSnapshot();
    }
    const previousIndex = currentIndex;
    const wasPlaying = enabled && !audio.paused && !audio.ended;
    queue = Array.isArray(message.queue) ? message.queue : [];
    if (!queue.length) {
      ++loadToken;
      ++mediaRequestToken;
      pendingSeekTime = null;
      enabled = false;
      autoplayRequested = false;
      currentIndex = -1;
      scratchActive = false;
      clearBeatLoop();
      playbackError = "";
      ++bpmAnalysisToken;
      detectedBpm = null;
      automaticBpm = null;
      automaticBpmUncertain = false;
      bpmSource = "auto";
      bpmStatus = "idle";
      bpmError = "";
      bpmUncertain = false;
      detectedKey = null;
      waveform = [];
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      status = "idle";
      updateMediaSession();
      sendState(true);
      return stateSnapshot();
    }
    const matchingIndex = queue.findIndex((track) =>
      (previousTrack?.playlistItemId && track.playlistItemId === previousTrack.playlistItemId)
      || (!previousTrack?.playlistItemId && track.id === previousTrack?.id && track.url === previousTrack?.url)
    );
    enabled = true;
    const selectedPlaylistItemId = String(message.selectedPlaylistItemId || "");
    if (selectedPlaylistItemId) {
      const selectedIndex = queue.findIndex((track) => track.playlistItemId === selectedPlaylistItemId);
      if (selectedIndex < 0) throw new Error("The requested playlist track is no longer available.");
      return loadTrack(selectedIndex, 0, message.autoplay !== false);
    }
    if (matchingIndex >= 0) {
      currentIndex = matchingIndex;
      updateMediaSession();
      sendState(true);
      return stateSnapshot();
    }
    return loadTrack(Math.max(0, Math.min(queue.length - 1, previousIndex)), 0, wasPlaying);
}

async function handleCommand(message) {
  if (message.type === MESSAGES.OFFSCREEN_GET_STATE) {
    return stateSnapshot();
  }
  if (message.type === MESSAGES.OFFSCREEN_ANALYZE_TRACKS) {
    return analyzeTracks(message.tracks, message.force === true, message.deep === true);
  }
  if (message.type === MESSAGES.OFFSCREEN_ENABLE) {
    queue = Array.isArray(message.queue) ? message.queue : [];
    enabled = true;
    preservePitch = message.preservePitch !== false;
    filterValue = finiteNumber(message.filterValue);
    gainDb = finiteNumber(message.gainDb);
    eqLowDb = finiteNumber(message.eqLowDb);
    eqMidDb = finiteNumber(message.eqMidDb);
    eqHighDb = finiteNumber(message.eqHighDb);
    applyPlaybackOptions(message.rate, preservePitch);
    applyAudioEffects(filterValue, gainDb, eqLowDb, eqMidDb, eqHighDb);
    return loadTrack(message.index, message.currentTime, message.autoplay, message.handoffStartedAt);
  }

  if (message.type === MESSAGES.OFFSCREEN_RESTORE) {
    const saved = message.state || {};
    queue = Array.isArray(saved.queue) ? saved.queue : [];
    enabled = Boolean(saved.enabled && queue.length);
    preservePitch = saved.preservePitch !== false;
    filterValue = finiteNumber(saved.filterValue);
    gainDb = finiteNumber(saved.gainDb);
    eqLowDb = finiteNumber(saved.eqLowDb);
    eqMidDb = finiteNumber(saved.eqMidDb);
    eqHighDb = finiteNumber(saved.eqHighDb);
    applyPlaybackOptions(saved.rate, preservePitch);
    applyAudioEffects(filterValue, gainDb, eqLowDb, eqMidDb, eqHighDb);
    if (!enabled) return stateSnapshot();
    return loadTrack(saved.index, saved.currentTime, Boolean(saved.isPlaying));
  }

  if (message.type === MESSAGES.OFFSCREEN_UPDATE_QUEUE) return updateQueue(message);

  if (message.type === MESSAGES.OFFSCREEN_PLAY_INDEX) {
    if (!queue.length) throw new Error("The seamless queue is empty.");
    enabled = true;
    return loadTrack(Math.max(0, Math.min(queue.length - 1, Number(message.index) || 0)), 0, message.autoplay !== false);
  }

  if (message.type === MESSAGES.OFFSCREEN_DISABLE) {
    ++loadToken;
    ++mediaRequestToken;
    pendingSeekTime = null;
    enabled = false;
    autoplayRequested = false;
    scratchActive = false;
    clearBeatLoop();
    status = "idle";
    playbackError = "";
    ++bpmAnalysisToken;
    detectedBpm = null;
    automaticBpm = null;
    automaticBpmUncertain = false;
    bpmSource = "auto";
    bpmStatus = "idle";
    bpmError = "";
    bpmUncertain = false;
    detectedKey = null;
    waveform = [];
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    queue = [];
    currentIndex = -1;
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_PLAY_PAUSE) {
    if (!enabled) throw new Error("Seamless playback is not enabled.");
    if (status === "loading") {
      autoplayRequested = !autoplayRequested;
      sendState(true);
      return stateSnapshot();
    }
    if (!audio.src) {
      autoplayRequested = true;
      return loadTrack(Math.max(0, currentIndex), 0, true);
    }
    if (audio.paused) {
      autoplayRequested = true;
      const request = ++mediaRequestToken;
      const started = await playForMediaRequest(request);
      if (!started) return stateSnapshot();
    } else {
      autoplayRequested = false;
      audio.pause();
    }
    status = audio.paused ? "paused" : "playing";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_PAUSE) {
    ++mediaRequestToken;
    pendingSeekTime = null;
    autoplayRequested = false;
    scratchActive = false;
    clearBeatLoop();
    if (!audio.paused) audio.pause();
    if (status !== "idle" && status !== "error") status = "paused";
    updateMediaSession();
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_NEXT) return nextTrack();
  if (message.type === MESSAGES.OFFSCREEN_PREVIOUS) return previousTrack();

  if (message.type === MESSAGES.OFFSCREEN_SEEK) {
    return seekToTime(message.currentTime);
  }

  if (message.type === MESSAGES.OFFSCREEN_SET_MUTED) {
    audio.muted = message.muted === true;
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_SET_RATE) {
    applyPlaybackOptions(message.rate, message.preservePitch);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_SET_DJ) {
    await applyDjOptions(message);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_SCRATCH) {
    applyScratch(message.multiplier, message.active !== false);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_SET_LOOP) {
    setBeatLoop(message.beats, message.bpm);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_SET_BPM) {
    clearBeatLoop();
    const bpm = Math.round(Math.max(40, Math.min(300, finiteNumber(message.bpm, detectedBpm || 120))) * 10) / 10;
    const key = stableTrackKey(currentTrack());
    if (key) {
      bpmOverrides.set(key, bpm);
      persistBpmOverrides();
    }
    detectedBpm = bpm;
    bpmSource = "manual";
    bpmUncertain = false;
    bpmStatus = "ready";
    bpmError = "";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_RESET_BPM) {
    clearBeatLoop();
    const key = stableTrackKey(currentTrack());
    if (key) {
      bpmOverrides.delete(key);
      persistBpmOverrides();
    }
    if (!automaticBpm) return analyzeCurrentTrack(true);
    detectedBpm = automaticBpm;
    bpmSource = "auto";
    bpmUncertain = automaticBpmUncertain;
    bpmStatus = "ready";
    bpmError = bpmUncertain ? "This is a best-effort tempo estimate." : "";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_ANALYZE_BPM) {
    const key = stableTrackKey(currentTrack());
    if (key) {
      bpmOverrides.delete(key);
      persistBpmOverrides();
    }
    return analyzeCurrentTrack(true, message.deep === true);
  }

  return stateSnapshot();
}

installOffscreenEvents({
  audio,
  handleCommand,
  nextTrack,
  previousTrack,
  prioritizePlayback,
  seekToTime,
  sendState,
  setAutoplayRequested: (value) => { autoplayRequested = value; },
  setPlaybackError: (value) => { playbackError = value; },
  setStatus: (value) => { status = value; },
  shouldUpdatePausedStatus: () => enabled && status !== "loading" && status !== "error",
  stateSnapshot,
  updateMediaSession
});
