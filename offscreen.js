(() => {
  // src/shared/contracts.js
  var STORAGE_KEYS = Object.freeze({
    BPM_CORRECTIONS: "bandcampHubBpmCorrections",
    ENABLED: "bandcampHubEnabled",
    LAYOUT: "bandcampHubLayout",
    PLAYBACK: "bandcampHubPlayback",
    STATE: "bandcampHubState"
  });
  var MESSAGES = Object.freeze({
    CLEAR_PLAYBACK: "BANDCAMP_HUB_CLEAR_PLAYBACK",
    DELETE_ALL_DATA: "BANDCAMP_HUB_DELETE_ALL_DATA",
    GET_ENABLED: "BANDCAMP_HUB_GET_ENABLED",
    GET_SEAMLESS_STATE: "BANDCAMP_HUB_GET_SEAMLESS_STATE",
    OFFSCREEN_PREFIX: "BANDCAMP_HUB_OFFSCREEN_",
    OFFSCREEN_ANALYZE_TRACKS: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_TRACKS",
    OFFSCREEN_ANALYZE_BPM: "BANDCAMP_HUB_OFFSCREEN_ANALYZE_BPM",
    OFFSCREEN_DISABLE: "BANDCAMP_HUB_OFFSCREEN_DISABLE",
    OFFSCREEN_ENABLE: "BANDCAMP_HUB_OFFSCREEN_ENABLE",
    OFFSCREEN_GET_STATE: "BANDCAMP_HUB_OFFSCREEN_GET_STATE",
    OFFSCREEN_NEXT: "BANDCAMP_HUB_OFFSCREEN_NEXT",
    OFFSCREEN_PLAY_INDEX: "BANDCAMP_HUB_OFFSCREEN_PLAY_INDEX",
    OFFSCREEN_PLAY_PAUSE: "BANDCAMP_HUB_OFFSCREEN_PLAY_PAUSE",
    OFFSCREEN_PREVIOUS: "BANDCAMP_HUB_OFFSCREEN_PREVIOUS",
    OFFSCREEN_RESET_BPM: "BANDCAMP_HUB_OFFSCREEN_RESET_BPM",
    OFFSCREEN_RESTORE: "BANDCAMP_HUB_OFFSCREEN_RESTORE",
    OFFSCREEN_SCRATCH: "BANDCAMP_HUB_OFFSCREEN_SCRATCH",
    OFFSCREEN_SEEK: "BANDCAMP_HUB_OFFSCREEN_SEEK",
    OFFSCREEN_SET_BPM: "BANDCAMP_HUB_OFFSCREEN_SET_BPM",
    OFFSCREEN_SET_DJ: "BANDCAMP_HUB_OFFSCREEN_SET_DJ",
    OFFSCREEN_SET_LOOP: "BANDCAMP_HUB_OFFSCREEN_SET_LOOP",
    OFFSCREEN_SET_RATE: "BANDCAMP_HUB_OFFSCREEN_SET_RATE",
    OFFSCREEN_STATE: "BANDCAMP_HUB_OFFSCREEN_STATE",
    OFFSCREEN_UPDATE_QUEUE: "BANDCAMP_HUB_OFFSCREEN_UPDATE_QUEUE",
    OPEN: "BANDCAMP_HUB_OPEN",
    OPEN_BACKGROUND_TAB: "BANDCAMP_HUB_OPEN_BACKGROUND_TAB",
    PING: "BANDCAMP_HUB_PING",
    PLAYBACK_CLEARED: "BANDCAMP_HUB_PLAYBACK_CLEARED",
    RESOLVE_CART_ITEMS: "BANDCAMP_HUB_RESOLVE_CART_ITEMS",
    RESOLVE_CART_METADATA: "BANDCAMP_HUB_RESOLVE_CART_METADATA",
    RESOLVE_PLAYLIST_ITEMS: "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS",
    RESTORE_CART: "BANDCAMP_HUB_RESTORE_CART",
    SEAMLESS_PREFIX: "BANDCAMP_HUB_SEAMLESS_",
    ANALYZE_TRACKS: "BANDCAMP_HUB_ANALYZE_TRACKS",
    SEAMLESS_ANALYZE_BPM: "BANDCAMP_HUB_SEAMLESS_ANALYZE_BPM",
    SEAMLESS_DISABLE: "BANDCAMP_HUB_SEAMLESS_DISABLE",
    SEAMLESS_ENABLE: "BANDCAMP_HUB_SEAMLESS_ENABLE",
    SEAMLESS_NEXT: "BANDCAMP_HUB_SEAMLESS_NEXT",
    SEAMLESS_PLAY_INDEX: "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX",
    SEAMLESS_PLAY_PAUSE: "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE",
    SEAMLESS_PREVIOUS: "BANDCAMP_HUB_SEAMLESS_PREVIOUS",
    SEAMLESS_RESET_BPM: "BANDCAMP_HUB_SEAMLESS_RESET_BPM",
    SEAMLESS_SCRATCH: "BANDCAMP_HUB_SEAMLESS_SCRATCH",
    SEAMLESS_SEEK: "BANDCAMP_HUB_SEAMLESS_SEEK",
    SEAMLESS_SET_BPM: "BANDCAMP_HUB_SEAMLESS_SET_BPM",
    SEAMLESS_SET_DJ: "BANDCAMP_HUB_SEAMLESS_SET_DJ",
    SEAMLESS_SET_LOOP: "BANDCAMP_HUB_SEAMLESS_SET_LOOP",
    SEAMLESS_SET_RATE: "BANDCAMP_HUB_SEAMLESS_SET_RATE",
    SEAMLESS_STATE: "BANDCAMP_HUB_SEAMLESS_STATE",
    SEAMLESS_UPDATE_QUEUE: "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE",
    SET_ENABLED: "BANDCAMP_HUB_SET_ENABLED",
    TOGGLE: "BANDCAMP_HUB_TOGGLE",
    WISHLIST_RESULT: "BANDCAMP_HUB_WISHLIST_RESULT",
    WISHLIST_UPDATED: "BANDCAMP_HUB_WISHLIST_UPDATED"
  });

  // src/offscreen/analysis.js
  function estimateBpm(buffer) {
    const sampleRate = buffer.sampleRate;
    const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
    const hop = 2048;
    const start = Math.min(buffer.length, Math.floor(sampleRate * 4));
    const end = Math.min(buffer.length, start + Math.floor(sampleRate * 30));
    const frames = Math.floor((end - start) / hop);
    if (frames < 40) throw new Error("The stream sample was too short for tempo analysis.");
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
    for (let bpm = 60; bpm <= 200; bpm += 0.5) {
      const lag = 60 * sampleRate / (hop * bpm);
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
      const start = Math.floor(point / pointCount * buffer.length);
      const end = Math.max(start + 1, Math.floor((point + 1) / pointCount * buffer.length));
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
  var MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var KEY_NAMES = ["C", "C\u266F", "D", "E\u266D", "E", "F", "F\u266F", "G", "A\u266D", "A", "B\u266D", "B"];
  var CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
  var CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];
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
    const frameCount = Math.min(8, Math.max(6, Math.floor(data.length / frameSize)));
    const frequencies = Array.from({ length: 48 }, (_, index) => 65.406 * Math.pow(2, index / 12));
    for (let frame = 0; frame < frameCount; frame += 1) {
      const center = Math.floor((frame + 0.5) / frameCount * data.length);
      const start = Math.max(0, Math.min(data.length - frameSize, center - Math.floor(frameSize / 2)));
      const frameChroma = new Float64Array(12);
      for (let note = 0; note < frequencies.length; note += 1) {
        const coefficient = 2 * Math.cos(2 * Math.PI * frequencies[note] / buffer.sampleRate);
        let previous = 0;
        let previousTwo = 0;
        for (let sample = 0; sample < frameSize; sample += 1) {
          const windowed = (data[start + sample] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * sample / (frameSize - 1)));
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

  // src/offscreen/index.js
  var audio = document.querySelector("#bandcamp-hub-audio");
  var queue = [];
  var currentIndex = -1;
  var enabled = false;
  var status = "idle";
  var playbackError = "";
  var preservePitch = true;
  var selectedRate = 1;
  var scratchActive = false;
  var autoplayRequested = false;
  var loopBeats = 0;
  var loopStart = 0;
  var loopEnd = 0;
  var beatLoopTimer = null;
  var filterValue = 0;
  var gainDb = 0;
  var eqLowDb = 0;
  var eqMidDb = 0;
  var eqHighDb = 0;
  var lastStateSentAt = 0;
  var stateSendTimer = null;
  var loadToken = 0;
  var bpmAnalysisToken = 0;
  var detectedBpm = null;
  var automaticBpm = null;
  var bpmSource = "auto";
  var bpmStatus = "idle";
  var bpmError = "";
  var detectedKey = null;
  var waveform = [];
  var analysisCache = /* @__PURE__ */ new Map();
  var bpmOverrides = /* @__PURE__ */ new Map();
  var BPM_OVERRIDES_KEY = STORAGE_KEYS.BPM_CORRECTIONS;
  var bpmOverridesLoaded = false;
  var audioContext = null;
  var sourceNode = null;
  var filterNode = null;
  var lowEqNode = null;
  var midEqNode = null;
  var highEqNode = null;
  var gainNode = null;
  var loadedAudioBytes = null;
  var loadedAudioTrackUrl = "";
  var loadedObjectUrl = "";
  var loadedAudioBytesPromise = null;
  var streamAbortController = null;
  var trackAnalysisAudioContext = null;
  function currentTrack() {
    return queue[currentIndex] || null;
  }
  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function stateSnapshot() {
    const track = currentTrack();
    const loading = status === "loading";
    const sourceUnavailable = loading || status === "error" && !audio.src;
    const duration = sourceUnavailable ? finiteNumber(track?.duration) : Number.isFinite(audio.duration) ? audio.duration : finiteNumber(track?.duration);
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
    }
  }
  function persistBpmOverrides() {
    if (!chrome.storage?.local?.set) return;
    const entries = [...bpmOverrides.entries()].slice(-500);
    chrome.storage.local.set({ [BPM_OVERRIDES_KEY]: Object.fromEntries(entries) }).catch(() => {
    });
  }
  function gainFromDb(value) {
    return value <= -30 ? 0 : Math.pow(10, value / 20);
  }
  async function ensureAudioGraph() {
    if (gainNode) {
      if (audioContext?.state === "suspended") await audioContext.resume().catch(() => {
      });
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
      if (audioContext.state === "suspended") await audioContext.resume().catch(() => {
      });
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
  function applyAudioEffects(nextFilter = filterValue, nextGainDb = gainDb, nextLowDb = eqLowDb, nextMidDb = eqMidDb, nextHighDb = eqHighDb) {
    filterValue = Math.max(-1, Math.min(1, finiteNumber(nextFilter)));
    gainDb = Math.max(-30, Math.min(6, finiteNumber(nextGainDb)));
    eqLowDb = Math.max(-12, Math.min(12, finiteNumber(nextLowDb)));
    eqMidDb = Math.max(-12, Math.min(12, finiteNumber(nextMidDb)));
    eqHighDb = Math.max(-12, Math.min(12, finiteNumber(nextHighDb)));
    if (filterNode) {
      const now = audioContext.currentTime || 0;
      if (Math.abs(filterValue) < 0.01) {
        filterNode.type = "allpass";
        filterNode.frequency.setTargetAtTime(1e3, now, 0.015);
      } else if (filterValue < 0) {
        filterNode.type = "lowpass";
        filterNode.frequency.setTargetAtTime(2e4 * Math.pow(120 / 2e4, Math.abs(filterValue)), now, 0.015);
      } else {
        filterNode.type = "highpass";
        filterNode.frequency.setTargetAtTime(20 * Math.pow(8e3 / 20, filterValue), now, 0.015);
      }
      filterNode.Q.setTargetAtTime(0.72, now, 0.015);
    }
    if (lowEqNode && midEqNode && highEqNode) {
      const now = audioContext.currentTime || 0;
      lowEqNode.type = "lowshelf";
      lowEqNode.frequency.setTargetAtTime(250, now, 0.015);
      lowEqNode.gain.setTargetAtTime(eqLowDb, now, 0.015);
      midEqNode.type = "peaking";
      midEqNode.frequency.setTargetAtTime(1e3, now, 0.015);
      midEqNode.Q.setTargetAtTime(0.9, now, 0.015);
      midEqNode.gain.setTargetAtTime(eqMidDb, now, 0.015);
      highEqNode.type = "highshelf";
      highEqNode.frequency.setTargetAtTime(4e3, now, 0.015);
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
        await context.close().catch(() => {
        });
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
  var TRACK_ANALYSIS_SAMPLE_BYTES = 524288;
  var TRACK_ANALYSIS_FALLBACK_BYTES = 1048576;
  var TRACK_ANALYSIS_FETCH_TIMEOUT_MS = 1e4;
  var TRACK_ANALYSIS_CONCURRENCY = 6;
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
    }).catch(() => {
    });
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
    const duration = 60 / nextBpm * nextBeats;
    loopBeats = nextBeats;
    loopStart = Math.max(0, finiteNumber(audio.currentTime));
    loopEnd = loopStart + duration;
    if (Number.isFinite(audio.duration)) loopEnd = Math.min(loopEnd, audio.duration);
    if (loopEnd <= loopStart + 4e-3) {
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
      if (remaining <= 15e-4) {
        const loopDuration = loopEnd - loopStart;
        const overflow = Math.max(0, -remaining);
        audio.currentTime = loopStart + overflow % loopDuration;
        beatLoopTimer = window.setTimeout(watchBoundary, 0);
        return;
      }
      const playbackRate = Math.max(0.35, finiteNumber(audio.playbackRate, 1));
      const waitMs = Math.max(1, Math.min(20, remaining / playbackRate * 1e3 - 1));
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
    return typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported("audio/mpeg");
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
        }).catch(() => {
        });
        const progressiveFailure = progressiveCompletion.then(() => new Promise(() => {
        }));
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
      const previousTrack2 = currentTrack();
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
      const matchingIndex = queue.findIndex(
        (track) => previousTrack2?.playlistItemId && track.playlistItemId === previousTrack2.playlistItemId || !previousTrack2?.playlistItemId && track.id === previousTrack2?.id && track.url === previousTrack2?.url
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
    handleCommand(message).then((result) => sendResponse(message.type === MESSAGES.OFFSCREEN_ANALYZE_TRACKS ? { ok: true, results: result } : { ok: true, state: result })).catch((error) => sendResponse({ ok: false, error: error.message, state: stateSnapshot() }));
    return true;
  });
})();
