import { MESSAGES, STORAGE_KEYS } from "../shared/contracts.js";

import { buildWaveform, estimateBpm, estimateKey } from "./analysis.js";

const audio = document.querySelector("#bandcamp-hub-audio");
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
let lastStateSentAt = 0;
let stateSendTimer = null;
let loadToken = 0;
let bpmAnalysisToken = 0;
let detectedBpm = null;
let automaticBpm = null;
let bpmSource = "auto";
let bpmStatus = "idle";
let bpmError = "";
let detectedKey = null;
let waveform = [];
const analysisCache = new Map();
const bpmOverrides = new Map();
const BPM_OVERRIDES_KEY = STORAGE_KEYS.BPM_CORRECTIONS;
let bpmOverridesLoaded = false;
let audioContext = null;
let sourceNode = null;
let filterNode = null;
let lowEqNode = null;
let midEqNode = null;
let highEqNode = null;
let gainNode = null;
let loadedAudioBytes = null;
let loadedAudioTrackUrl = "";
let loadedObjectUrl = "";
let loadedAudioBytesPromise = null;
let streamAbortController = null;
let trackAnalysisAudioContext = null;

function currentTrack() {
  return queue[currentIndex] || null;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function stateSnapshot() {
  const track = currentTrack();
  const loading = status === "loading";
  const sourceUnavailable = loading || (status === "error" && !audio.src);
  const duration = sourceUnavailable
    ? finiteNumber(track?.duration)
    : Number.isFinite(audio.duration) ? audio.duration : finiteNumber(track?.duration);
  const currentTime = sourceUnavailable ? 0 : finiteNumber(audio.currentTime);
  return {
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
    bpmSource,
    bpmStatus,
    bpmError,
    detectedKey,
    waveform,
    index: currentIndex,
    track,
    queue
  };
}

function trackKey(track = currentTrack()) {
  const id = String(track?.id || "").trim();
  const stableId = id.match(/^(?:track-)?(\d+)$/i)?.[1]?.replace(/^0+(?=\d)/, "");
  if (stableId) return `id:${stableId}`;
  let pageUrl = String(track?.pageUrl || "");
  try {
    const canonical = new URL(pageUrl);
    canonical.hash = "";
    canonical.search = "";
    canonical.pathname = canonical.pathname.replace(/\/+$/, "") || "/";
    pageUrl = canonical.href;
  } catch {
    pageUrl = "";
  }
  return [pageUrl, id, track?.title, track?.artist].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

async function loadBpmOverrides() {
  if (bpmOverridesLoaded) return;
  bpmOverridesLoaded = true;
  if (!chrome.storage?.local?.get) return;
  try {
    const stored = await chrome.storage.local.get(BPM_OVERRIDES_KEY);
    for (const [key, value] of Object.entries(stored[BPM_OVERRIDES_KEY] || {})) {
      const bpm = finiteNumber(value);
      if (bpm >= 40 && bpm <= 300) bpmOverrides.set(key, bpm);
    }
  } catch {
    // Playback and automatic analysis still work when local storage is unavailable.
  }
}

function persistBpmOverrides() {
  if (!chrome.storage?.local?.set) return;
  const entries = [...bpmOverrides.entries()].slice(-500);
  chrome.storage.local.set({ [BPM_OVERRIDES_KEY]: Object.fromEntries(entries) }).catch(() => {});
}

function gainFromDb(value) {
  return value <= -30 ? 0 : Math.pow(10, value / 20);
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
    highEqNode.connect(gainNode);
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


async function analyzeCurrentTrack(force = false) {
  const track = currentTrack();
  if (!track?.url) return stateSnapshot();
  await loadBpmOverrides();
  const key = trackKey(track);
  if (!force && analysisCache.has(key)) {
    const cached = analysisCache.get(key);
    automaticBpm = cached.bpm;
    detectedBpm = bpmOverrides.get(key) || automaticBpm;
    bpmSource = bpmOverrides.has(key) ? "manual" : "auto";
    detectedKey = cached.key;
    waveform = cached.waveform;
    bpmStatus = "ready";
    bpmError = "";
    sendState(true);
    return stateSnapshot();
  }
  const token = ++bpmAnalysisToken;
  detectedBpm = null;
  automaticBpm = null;
  bpmSource = "auto";
  detectedKey = null;
  waveform = [];
  bpmStatus = "analyzing";
  bpmError = "";
  sendState(true);
  try {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio analysis is unavailable.");
    let encodedAudio = loadedAudioTrackUrl === track.url ? loadedAudioBytes : null;
    if (!encodedAudio && loadedAudioTrackUrl === track.url && loadedAudioBytesPromise) {
      encodedAudio = await loadedAudioBytesPromise;
    }
    if (!encodedAudio) {
      const response = await fetch(track.url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Stream analysis request failed (${response.status}).`);
      encodedAudio = await response.arrayBuffer();
    }
    const context = new AudioContextClass();
    let buffer;
    try {
      buffer = await context.decodeAudioData(encodedAudio.slice(0));
    } finally {
      await context.close().catch(() => {});
    }
    if (token !== bpmAnalysisToken || currentTrack()?.url !== track.url) return stateSnapshot();
    const result = {
      bpm: estimateBpm(buffer),
      key: estimateKey(buffer),
      waveform: buildWaveform(buffer)
    };
    automaticBpm = result.bpm;
    detectedBpm = bpmOverrides.get(key) || result.bpm;
    bpmSource = bpmOverrides.has(key) ? "manual" : "auto";
    detectedKey = result.key;
    waveform = result.waveform;
    analysisCache.set(key, result);
    if (analysisCache.size > 100) analysisCache.delete(analysisCache.keys().next().value);
    bpmStatus = "ready";
  } catch (error) {
    if (token !== bpmAnalysisToken) return stateSnapshot();
    bpmStatus = "error";
    bpmError = error.message;
  }
  sendState(true);
  return stateSnapshot();
}

const TRACK_ANALYSIS_SAMPLE_BYTES = 524_288;
const TRACK_ANALYSIS_FALLBACK_BYTES = 1_048_576;
const TRACK_ANALYSIS_FETCH_TIMEOUT_MS = 10_000;
const TRACK_ANALYSIS_CONCURRENCY = 6;

async function fetchTrackAnalysisAudio(url, sampleBytes = TRACK_ANALYSIS_SAMPLE_BYTES) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TRACK_ANALYSIS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "force-cache",
      headers: { Range: `bytes=0-${sampleBytes - 1}` },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Stream analysis request failed (${response.status}).`);
    return {
      bytes: await response.arrayBuffer(),
      partial: response.status === 206
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Track analysis timed out.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function decodeTrackAnalysisAudio(AudioContextClass, url) {
  trackAnalysisAudioContext ||= new AudioContextClass();
  const sample = await fetchTrackAnalysisAudio(url);
  try {
    return await trackAnalysisAudioContext.decodeAudioData(sample.bytes.slice(0));
  } catch (error) {
    if (!sample.partial) throw error;
    const fallback = await fetchTrackAnalysisAudio(url, TRACK_ANALYSIS_FALLBACK_BYTES);
    return await trackAnalysisAudioContext.decodeAudioData(fallback.bytes.slice(0));
  }
}

async function analyzeTrack(track, force = false) {
  await loadBpmOverrides();
  const key = trackKey(track);
  if (!force && analysisCache.has(key)) {
    const cached = analysisCache.get(key);
    return {
      id: track.id,
      url: track.url,
      bpm: bpmOverrides.get(key) || cached.bpm,
      key: cached.key
    };
  }
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio analysis is unavailable.");
  const buffer = await decodeTrackAnalysisAudio(AudioContextClass, track.url);
  const result = {
    bpm: estimateBpm(buffer),
    key: estimateKey(buffer),
    waveform: buildWaveform(buffer)
  };
  analysisCache.set(key, result);
  if (analysisCache.size > 100) analysisCache.delete(analysisCache.keys().next().value);
  return {
    id: track.id,
    url: track.url,
    bpm: bpmOverrides.get(key) || result.bpm,
    key: result.key
  };
}

async function analyzeTracks(tracks, force = false) {
  const source = Array.isArray(tracks) ? tracks.slice(0, 100) : [];
  const results = new Array(source.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      const track = source[index];
      try {
        results[index] = await analyzeTrack(track, force);
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

function sendState(force = false) {
  window.clearTimeout(stateSendTimer);
  const elapsed = Date.now() - lastStateSentAt;
  if (!force && elapsed < 500) {
    stateSendTimer = window.setTimeout(() => sendState(true), 500 - elapsed);
    return;
  }
  lastStateSentAt = Date.now();
  chrome.runtime.sendMessage({
    target: "background",
    type: MESSAGES.OFFSCREEN_STATE,
    state: stateSnapshot()
  }).catch(() => {});
}

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
  const track = currentTrack();
  if (!("mediaSession" in navigator)) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.art ? [{ src: track.art }] : []
  });
  navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
}

function waitForMetadata(token) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const loaded = () => {
      cleanup();
      if (token === loadToken) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(`Bandcamp stream failed to load (media error ${audio.error?.code || "unknown"}).`));
    };
    const aborted = () => {
      cleanup();
      reject(new Error(token === loadToken ? "Bandcamp stream loading was aborted." : "Track load was replaced."));
    };
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
      audio.removeEventListener("abort", aborted);
    };
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("error", failed);
    audio.addEventListener("abort", aborted);
  });
}

function canProgressivelyStreamMp3() {
  return typeof MediaSource === "function"
    && typeof MediaSource.isTypeSupported === "function"
    && MediaSource.isTypeSupported("audio/mpeg");
}

function waitForMediaSourceOpen(mediaSource, token) {
  if (mediaSource.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const opened = () => {
      cleanup();
      if (token === loadToken) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(token === loadToken ? "The progressive audio source could not be opened." : "Track load was replaced."));
    };
    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", opened);
      mediaSource.removeEventListener("sourceclose", failed);
    };
    mediaSource.addEventListener("sourceopen", opened, { once: true });
    mediaSource.addEventListener("sourceclose", failed, { once: true });
  });
}

function appendMediaChunk(sourceBuffer, chunk, token) {
  return new Promise((resolve, reject) => {
    const updated = () => {
      cleanup();
      if (token === loadToken) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(token === loadToken ? "The progressive audio buffer rejected the stream." : "Track load was replaced."));
    };
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", updated);
      sourceBuffer.removeEventListener("error", failed);
      sourceBuffer.removeEventListener("abort", failed);
    };
    sourceBuffer.addEventListener("updateend", updated, { once: true });
    sourceBuffer.addEventListener("error", failed, { once: true });
    sourceBuffer.addEventListener("abort", failed, { once: true });
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function startProgressiveTrackStream(track, token) {
  const mediaSource = new MediaSource();
  const abortController = new AbortController();
  streamAbortController = abortController;
  loadedObjectUrl = URL.createObjectURL(mediaSource);
  audio.src = loadedObjectUrl;
  audio.load();
  return (async () => {
    await waitForMediaSourceOpen(mediaSource, token);
    if (token !== loadToken) throw new Error("Track load was replaced.");
    const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
    const response = await fetch(track.url, {
      cache: "force-cache",
      signal: abortController.signal
    });
    if (!response.ok) throw new Error(`Bandcamp stream request failed (${response.status}).`);
    const chunks = [];
    let byteLength = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (token !== loadToken) throw new Error("Track load was replaced.");
        if (!value?.byteLength) continue;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        chunks.push(chunk);
        byteLength += chunk.byteLength;
        await appendMediaChunk(sourceBuffer, chunk, token);
      }
    } else {
      const chunk = new Uint8Array(await response.arrayBuffer());
      chunks.push(chunk);
      byteLength = chunk.byteLength;
      await appendMediaChunk(sourceBuffer, chunk, token);
    }
    if (token !== loadToken) throw new Error("Track load was replaced.");
    if (mediaSource.readyState === "open") mediaSource.endOfStream();
    const encodedAudio = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      encodedAudio.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return encodedAudio.buffer;
  })();
}

function releaseLoadedAudioSource() {
  streamAbortController?.abort();
  streamAbortController = null;
  loadedAudioBytesPromise = null;
  if (loadedObjectUrl) URL.revokeObjectURL(loadedObjectUrl);
  loadedObjectUrl = "";
  loadedAudioBytes = null;
  loadedAudioTrackUrl = "";
}

async function loadTrack(index, currentTime = 0, autoplay = false) {
  if (!queue.length) throw new Error("The seamless queue is empty.");
  currentIndex = Math.max(0, Math.min(queue.length - 1, Number(index) || 0));
  const track = currentTrack();
  const token = ++loadToken;
  autoplayRequested = Boolean(autoplay);
  clearBeatLoop();
  ++bpmAnalysisToken;
  detectedBpm = null;
  automaticBpm = null;
  bpmSource = "auto";
  bpmStatus = "idle";
  bpmError = "";
  detectedKey = null;
  waveform = [];
  playbackError = "";
  status = "loading";
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  releaseLoadedAudioSource();
  updateMediaSession();
  sendState(true);

  try {
    let progressiveCompletion = null;
    if (canProgressivelyStreamMp3()) {
      loadedAudioTrackUrl = track.url;
      progressiveCompletion = startProgressiveTrackStream(track, token);
      loadedAudioBytesPromise = progressiveCompletion;
      progressiveCompletion.then((encodedAudio) => {
        if (token === loadToken && currentTrack()?.url === track.url) loadedAudioBytes = encodedAudio;
      }).catch(() => {});
      const progressiveFailure = progressiveCompletion.then(() => new Promise(() => {}));
      await Promise.race([waitForMetadata(token), progressiveFailure]);
    } else {
      const response = await fetch(track.url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Bandcamp stream request failed (${response.status}).`);
      const encodedAudio = await response.arrayBuffer();
      if (token !== loadToken) return stateSnapshot();
      loadedAudioBytes = encodedAudio;
      loadedAudioTrackUrl = track.url;
      loadedAudioBytesPromise = Promise.resolve(encodedAudio);
      loadedObjectUrl = URL.createObjectURL(new Blob([encodedAudio], {
        type: response.headers?.get?.("content-type") || "audio/mpeg"
      }));
      audio.src = loadedObjectUrl;
      audio.load();
      await waitForMetadata(token);
    }
    await applyDjOptions({ rate: audio.playbackRate || 1, preservePitch, filterValue, gainDb });
    if (token !== loadToken) return stateSnapshot();
    const seekTime = Math.max(0, finiteNumber(currentTime));
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(seekTime, Math.max(0, audio.duration - 0.1));
    status = "paused";
    if (autoplayRequested) {
      await audio.play();
      status = "playing";
    }
    if (progressiveCompletion) {
      void progressiveCompletion.catch((error) => {
        if (token !== loadToken || currentTrack()?.url !== track.url) return;
        autoplayRequested = false;
        status = "error";
        playbackError = error.message || "The Bandcamp stream stopped loading.";
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        releaseLoadedAudioSource();
        sendState(true);
      });
    }
    void analyzeCurrentTrack();
  } catch (error) {
    if (token !== loadToken) return stateSnapshot();
    autoplayRequested = false;
    status = "error";
    playbackError = error.message;
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

async function handleCommand(message) {
  if (message.type === MESSAGES.OFFSCREEN_GET_STATE) {
    return stateSnapshot();
  }
  if (message.type === MESSAGES.OFFSCREEN_ANALYZE_TRACKS) {
    return analyzeTracks(message.tracks, message.force === true);
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
    return loadTrack(message.index, message.currentTime, message.autoplay);
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

  if (message.type === MESSAGES.OFFSCREEN_UPDATE_QUEUE) {
    const previousTrack = currentTrack();
    const previousIndex = currentIndex;
    const wasPlaying = enabled && !audio.paused && !audio.ended;
    queue = Array.isArray(message.queue) ? message.queue : [];
    if (!queue.length) {
      ++loadToken;
      enabled = false;
      autoplayRequested = false;
      currentIndex = -1;
      scratchActive = false;
      clearBeatLoop();
      playbackError = "";
      ++bpmAnalysisToken;
      detectedBpm = null;
      automaticBpm = null;
      bpmSource = "auto";
      bpmStatus = "idle";
      bpmError = "";
      detectedKey = null;
      waveform = [];
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      releaseLoadedAudioSource();
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
    if (matchingIndex >= 0) {
      currentIndex = matchingIndex;
      updateMediaSession();
      sendState(true);
      return stateSnapshot();
    }
    return loadTrack(Math.max(0, Math.min(queue.length - 1, previousIndex)), 0, wasPlaying);
  }

  if (message.type === MESSAGES.OFFSCREEN_PLAY_INDEX) {
    if (!queue.length) throw new Error("The seamless queue is empty.");
    enabled = true;
    return loadTrack(Math.max(0, Math.min(queue.length - 1, Number(message.index) || 0)), 0, message.autoplay !== false);
  }

  if (message.type === MESSAGES.OFFSCREEN_DISABLE) {
    ++loadToken;
    enabled = false;
    autoplayRequested = false;
    scratchActive = false;
    clearBeatLoop();
    status = "idle";
    playbackError = "";
    ++bpmAnalysisToken;
    detectedBpm = null;
    automaticBpm = null;
    bpmSource = "auto";
    bpmStatus = "idle";
    bpmError = "";
    detectedKey = null;
    waveform = [];
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    releaseLoadedAudioSource();
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
      await audio.play();
    } else {
      autoplayRequested = false;
      audio.pause();
    }
    status = audio.paused ? "paused" : "playing";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_NEXT) return nextTrack();
  if (message.type === MESSAGES.OFFSCREEN_PREVIOUS) return previousTrack();

  if (message.type === MESSAGES.OFFSCREEN_SEEK) {
    clearBeatLoop();
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    audio.currentTime = Math.max(0, Math.min(duration || Infinity, finiteNumber(message.currentTime)));
    sendState(true);
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
    const key = trackKey();
    if (key) {
      bpmOverrides.set(key, bpm);
      persistBpmOverrides();
    }
    detectedBpm = bpm;
    bpmSource = "manual";
    bpmStatus = "ready";
    bpmError = "";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_RESET_BPM) {
    clearBeatLoop();
    const key = trackKey();
    if (key) {
      bpmOverrides.delete(key);
      persistBpmOverrides();
    }
    if (!automaticBpm) return analyzeCurrentTrack(true);
    detectedBpm = automaticBpm;
    bpmSource = "auto";
    bpmStatus = "ready";
    bpmError = "";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === MESSAGES.OFFSCREEN_ANALYZE_BPM) {
    const key = trackKey();
    if (key) {
      bpmOverrides.delete(key);
      persistBpmOverrides();
    }
    return analyzeCurrentTrack(true);
  }

  return stateSnapshot();
}

audio.addEventListener("play", () => {
  autoplayRequested = true;
  status = "playing";
  updateMediaSession();
  sendState(true);
});
audio.addEventListener("pause", () => {
  if (enabled && status !== "loading" && status !== "error") {
    autoplayRequested = false;
    status = "paused";
  }
  updateMediaSession();
  sendState(true);
});
audio.addEventListener("timeupdate", () => sendState());
audio.addEventListener("durationchange", () => sendState(true));
audio.addEventListener("ratechange", () => sendState(true));
audio.addEventListener("ended", () => {
  nextTrack().catch((error) => {
    status = "error";
    playbackError = error.message;
    sendState(true);
  });
});
audio.addEventListener("error", () => {
  if (!audio.src) return;
  autoplayRequested = false;
  status = "error";
  playbackError = `Bandcamp stream error ${audio.error?.code || "unknown"}`;
  sendState(true);
});

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => {
    autoplayRequested = true;
    return audio.play();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    autoplayRequested = false;
    audio.pause();
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
  navigator.mediaSession.setActionHandler("previoustrack", () => previousTrack());
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen") return false;
  handleCommand(message)
    .then((result) => sendResponse(message.type === MESSAGES.OFFSCREEN_ANALYZE_TRACKS
      ? { ok: true, results: result }
      : { ok: true, state: result }))
    .catch((error) => sendResponse({ ok: false, error: error.message, state: stateSnapshot() }));
  return true;
});
