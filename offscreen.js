const audio = document.querySelector("#bandcamp-hub-audio");
let queue = [];
let currentIndex = -1;
let enabled = false;
let status = "idle";
let playbackError = "";
let preservePitch = true;
let selectedRate = 1;
let scratchActive = false;
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
const BPM_OVERRIDES_KEY = "bandcampHubBpmCorrections";
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

function currentTrack() {
  return queue[currentIndex] || null;
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function stateSnapshot() {
  const track = currentTrack();
  const duration = Number.isFinite(audio.duration) ? audio.duration : finiteNumber(track?.duration);
  return {
    enabled,
    status,
    error: playbackError,
    isPlaying: enabled && !audio.paused && !audio.ended,
    currentTime: finiteNumber(audio.currentTime),
    duration,
    progress: duration > 0 ? Math.max(0, Math.min(1, audio.currentTime / duration)) : 0,
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
  return String(track?.id || track?.url || "");
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

function estimateBpm(buffer) {
  const sampleRate = buffer.sampleRate;
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const hop = 1024;
  const start = Math.min(buffer.length, Math.floor(sampleRate * 4));
  const end = Math.min(buffer.length, start + Math.floor(sampleRate * 150));
  const frames = Math.floor((end - start) / hop);
  if (frames < 100) throw new Error("The stream sample was too short for tempo analysis.");
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  const energy = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = start + frame * hop;
    let total = 0;
    for (let sample = 0; sample < hop; sample += 4) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[offset + sample] || 0;
      mixed /= channelCount;
      total += mixed * mixed;
    }
    energy[frame] = Math.sqrt(total / (hop / 4));
  }

  const onset = new Float32Array(frames);
  let average = 0;
  const smoothing = Math.max(4, Math.round(sampleRate / hop));
  for (let index = 0; index < frames; index += 1) {
    average += (energy[index] - average) / smoothing;
    onset[index] = Math.max(0, energy[index] - average * 1.08);
  }

  let bestBpm = 0;
  let bestScore = -Infinity;
  for (let bpm = 60; bpm <= 200; bpm += 0.25) {
    const lag = (60 * sampleRate) / (hop * bpm);
    const lagFloor = Math.floor(lag);
    const mix = lag - lagFloor;
    let score = 0;
    for (let index = lagFloor + 1; index < frames; index += 1) {
      const delayed = onset[index - lagFloor] * (1 - mix) + onset[index - lagFloor - 1] * mix;
      score += onset[index] * delayed;
    }
    const centered = bpm >= 75 && bpm <= 170 ? 1.025 : 1;
    if (score * centered > bestScore) {
      bestScore = score * centered;
      bestBpm = bpm;
    }
  }
  if (!Number.isFinite(bestBpm) || bestScore <= 0) throw new Error("No stable beat was found in this stream sample.");
  while (bestBpm < 70) bestBpm *= 2;
  while (bestBpm > 180) bestBpm /= 2;
  return Math.round(bestBpm * 10) / 10;
}

function buildWaveform(buffer, pointCount = 180) {
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  const points = new Array(pointCount).fill(0);
  let largest = 0;
  for (let point = 0; point < pointCount; point += 1) {
    const start = Math.floor((point / pointCount) * buffer.length);
    const end = Math.max(start + 1, Math.floor(((point + 1) / pointCount) * buffer.length));
    const stride = Math.max(1, Math.floor((end - start) / 160));
    let sum = 0;
    let samples = 0;
    for (let offset = start; offset < end; offset += stride) {
      let mixed = 0;
      for (const channel of channels) mixed += Math.abs(channel[offset] || 0);
      sum += mixed / channelCount;
      samples += 1;
    }
    points[point] = samples ? Math.sqrt(sum / samples) : 0;
    largest = Math.max(largest, points[point]);
  }
  if (!largest) return points;
  return points.map((value) => Math.round(Math.min(1, value / largest) * 100));
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const KEY_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

function profileScore(chroma, profile, tonic) {
  const chromaMean = chroma.reduce((sum, value) => sum + value, 0) / 12;
  const profileMean = profile.reduce((sum, value) => sum + value, 0) / 12;
  let numerator = 0;
  let chromaEnergy = 0;
  let profileEnergy = 0;
  for (let pitch = 0; pitch < 12; pitch += 1) {
    const chromaValue = chroma[(pitch + tonic) % 12] - chromaMean;
    const profileValue = profile[pitch] - profileMean;
    numerator += chromaValue * profileValue;
    chromaEnergy += chromaValue * chromaValue;
    profileEnergy += profileValue * profileValue;
  }
  return numerator / Math.sqrt(chromaEnergy * profileEnergy || 1);
}

function estimateKey(buffer) {
  const data = buffer.getChannelData(0);
  const chroma = new Float64Array(12);
  const frameSize = Math.min(4096, 2 ** Math.floor(Math.log2(Math.max(1024, data.length))));
  const frameCount = Math.min(24, Math.max(8, Math.floor(data.length / frameSize)));
  const frequencies = Array.from({ length: 48 }, (_, index) => 65.406 * Math.pow(2, index / 12));
  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = Math.floor(((frame + 0.5) / frameCount) * data.length);
    const start = Math.max(0, Math.min(data.length - frameSize, center - Math.floor(frameSize / 2)));
    const frameChroma = new Float64Array(12);
    for (let note = 0; note < frequencies.length; note += 1) {
      const coefficient = 2 * Math.cos((2 * Math.PI * frequencies[note]) / buffer.sampleRate);
      let previous = 0;
      let previousTwo = 0;
      for (let sample = 0; sample < frameSize; sample += 1) {
        const windowed = (data[start + sample] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / (frameSize - 1)));
        const current = windowed + coefficient * previous - previousTwo;
        previousTwo = previous;
        previous = current;
      }
      const power = Math.max(0, previousTwo * previousTwo + previous * previous - coefficient * previous * previousTwo);
      frameChroma[note % 12] += Math.sqrt(power);
    }
    const frameTotal = frameChroma.reduce((sum, value) => sum + value, 0) || 1;
    for (let pitch = 0; pitch < 12; pitch += 1) chroma[pitch] += frameChroma[pitch] / frameTotal;
  }

  const candidates = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    candidates.push({ tonic, mode: "major", score: profileScore(chroma, MAJOR_PROFILE, tonic) });
    candidates.push({ tonic, mode: "minor", score: profileScore(chroma, MINOR_PROFILE, tonic) });
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || !Number.isFinite(best.score)) return null;
  return {
    name: `${KEY_NAMES[best.tonic]} ${best.mode}`,
    shortName: `${KEY_NAMES[best.tonic]} ${best.mode === "major" ? "maj" : "min"}`,
    camelot: (best.mode === "major" ? CAMELOT_MAJOR : CAMELOT_MINOR)[best.tonic],
    confidence: Math.max(0, Math.min(1, (best.score - (candidates[1]?.score || 0)) * 2.5))
  };
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
    type: "BANDCAMP_HUB_OFFSCREEN_STATE",
    state: stateSnapshot()
  }).catch(() => {});
}

function applyPlaybackOptions(rate = audio.playbackRate || 1, shouldPreservePitch = preservePitch) {
  const nextRate = Math.max(0.5, Math.min(2, finiteNumber(rate, 1)));
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
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
    };
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("error", failed);
  });
}

async function loadTrack(index, currentTime = 0, autoplay = false) {
  if (!queue.length) throw new Error("The seamless queue is empty.");
  currentIndex = Math.max(0, Math.min(queue.length - 1, Number(index) || 0));
  const track = currentTrack();
  const token = ++loadToken;
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
  updateMediaSession();
  sendState(true);

  try {
    const response = await fetch(track.url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Bandcamp stream request failed (${response.status}).`);
    const encodedAudio = await response.arrayBuffer();
    if (token !== loadToken) return stateSnapshot();
    loadedAudioBytes = encodedAudio;
    loadedAudioTrackUrl = track.url;
    if (loadedObjectUrl) URL.revokeObjectURL(loadedObjectUrl);
    loadedObjectUrl = URL.createObjectURL(new Blob([encodedAudio], {
      type: response.headers?.get?.("content-type") || "audio/mpeg"
    }));
    audio.src = loadedObjectUrl;
    await applyDjOptions({ rate: audio.playbackRate || 1, preservePitch, filterValue, gainDb });
    audio.load();
    await waitForMetadata(token);
    if (token !== loadToken) return stateSnapshot();
    const seekTime = Math.max(0, finiteNumber(currentTime));
    if (seekTime && Number.isFinite(audio.duration)) audio.currentTime = Math.min(seekTime, Math.max(0, audio.duration - 0.1));
    status = "paused";
    if (autoplay) {
      await audio.play();
      status = "playing";
    }
    void analyzeCurrentTrack();
  } catch (error) {
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
  if (message.type === "BANDCAMP_HUB_OFFSCREEN_GET_STATE") {
    return stateSnapshot();
  }
  if (message.type === "BANDCAMP_HUB_OFFSCREEN_ENABLE") {
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

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_RESTORE") {
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

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE") {
    const previousTrack = currentTrack();
    const previousIndex = currentIndex;
    const wasPlaying = enabled && !audio.paused && !audio.ended;
    queue = Array.isArray(message.queue) ? message.queue : [];
    if (!queue.length) {
      enabled = false;
      currentIndex = -1;
      clearBeatLoop();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (loadedObjectUrl) URL.revokeObjectURL(loadedObjectUrl);
      loadedObjectUrl = "";
      loadedAudioBytes = null;
      loadedAudioTrackUrl = "";
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

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX") {
    if (!queue.length) throw new Error("The seamless queue is empty.");
    enabled = true;
    return loadTrack(Math.max(0, Math.min(queue.length - 1, Number(message.index) || 0)), 0, message.autoplay !== false);
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_DISABLE") {
    enabled = false;
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
    if (loadedObjectUrl) URL.revokeObjectURL(loadedObjectUrl);
    loadedObjectUrl = "";
    loadedAudioBytes = null;
    loadedAudioTrackUrl = "";
    queue = [];
    currentIndex = -1;
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE") {
    if (!enabled) throw new Error("Seamless playback is not enabled.");
    if (!audio.src) return loadTrack(Math.max(0, currentIndex), 0, true);
    if (audio.paused) await audio.play();
    else audio.pause();
    status = audio.paused ? "paused" : "playing";
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_NEXT") return nextTrack();
  if (message.type === "BANDCAMP_HUB_OFFSCREEN_PREVIOUS") return previousTrack();

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_SEEK") {
    clearBeatLoop();
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    audio.currentTime = Math.max(0, Math.min(duration || Infinity, finiteNumber(message.currentTime)));
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_SET_RATE") {
    applyPlaybackOptions(message.rate, message.preservePitch);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_SET_DJ") {
    await applyDjOptions(message);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_SCRATCH") {
    applyScratch(message.multiplier, message.active !== false);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_SET_LOOP") {
    setBeatLoop(message.beats, message.bpm);
    sendState(true);
    return stateSnapshot();
  }

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_SET_BPM") {
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

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_RESET_BPM") {
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

  if (message.type === "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM") {
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
  status = "playing";
  updateMediaSession();
  sendState(true);
});
audio.addEventListener("pause", () => {
  if (enabled && status !== "loading" && status !== "error") status = "paused";
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
  status = "error";
  playbackError = `Bandcamp stream error ${audio.error?.code || "unknown"}`;
  sendState(true);
});

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
  navigator.mediaSession.setActionHandler("previoustrack", () => previousTrack());
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== "offscreen") return false;
  handleCommand(message)
    .then((state) => sendResponse({ ok: true, state }))
    .catch((error) => sendResponse({ ok: false, error: error.message, state: stateSnapshot() }));
  return true;
});
