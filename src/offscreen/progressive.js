export function playbackStartDeadline(timeout) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(false), timeout);
  });
}

export function interruptedPlay(error) {
  return error?.name === "AbortError" || /play\(\).*interrupted/i.test(String(error?.message || ""));
}

export function canProgressivelyStreamMp3() {
  return typeof MediaSource === "function"
    && typeof MediaSource.isTypeSupported === "function"
    && MediaSource.isTypeSupported("audio/mpeg");
}

const ANALYSIS_SAMPLE_BYTES = 1_048_576;
const MAX_BUFFER_AHEAD_SECONDS = 180;
const KEEP_BUFFER_BEHIND_SECONDS = 30;

export function waitForMediaMetadata(audio, isCurrent) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
      audio.removeEventListener("abort", aborted);
    };
    const loaded = () => {
      cleanup();
      if (isCurrent()) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(`Bandcamp stream failed to load (media error ${audio.error?.code || "unknown"}).`));
    };
    const aborted = () => {
      cleanup();
      reject(new Error(isCurrent() ? "Bandcamp stream loading was aborted." : "Track load was replaced."));
    };
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("error", failed);
    audio.addEventListener("abort", aborted);
  });
}

function waitForMediaSourceOpen(mediaSource, isCurrent) {
  if (mediaSource.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      mediaSource.removeEventListener("sourceopen", opened);
      mediaSource.removeEventListener("sourceclose", failed);
    };
    const opened = () => {
      cleanup();
      if (isCurrent()) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(isCurrent() ? "The progressive audio source could not be opened." : "Track load was replaced."));
    };
    mediaSource.addEventListener("sourceopen", opened, { once: true });
    mediaSource.addEventListener("sourceclose", failed, { once: true });
  });
}

function appendMediaChunk(sourceBuffer, chunk, isCurrent) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", updated);
      sourceBuffer.removeEventListener("error", failed);
      sourceBuffer.removeEventListener("abort", failed);
    };
    const updated = () => {
      cleanup();
      if (isCurrent()) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(isCurrent() ? "The progressive audio buffer rejected the stream." : "Track load was replaced."));
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

function bufferedRange(sourceBuffer) {
  try {
    const ranges = sourceBuffer.buffered;
    if (!ranges?.length) return null;
    return {
      start: ranges.start(0),
      end: ranges.end(ranges.length - 1)
    };
  } catch {
    return null;
  }
}

function waitForProgressiveCapacity(audio, sourceBuffer, signal, isCurrent) {
  const hasCapacity = () => {
    const range = bufferedRange(sourceBuffer);
    return !range || range.end - Number(audio.currentTime || 0) <= MAX_BUFFER_AHEAD_SECONDS;
  };
  if (hasCapacity()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("timeupdate", check);
      audio.removeEventListener("seeked", check);
      signal.removeEventListener("abort", aborted);
    };
    const check = () => {
      if (!isCurrent() || signal.aborted) return aborted();
      if (!hasCapacity()) return;
      cleanup();
      resolve();
    };
    const aborted = () => {
      cleanup();
      reject(new Error(isCurrent() ? "Bandcamp stream loading was aborted." : "Track load was replaced."));
    };
    audio.addEventListener("timeupdate", check);
    audio.addEventListener("seeked", check);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

function removeMediaRange(sourceBuffer, start, end, isCurrent) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", updated);
      sourceBuffer.removeEventListener("error", failed);
      sourceBuffer.removeEventListener("abort", failed);
    };
    const updated = () => {
      cleanup();
      if (isCurrent()) resolve();
      else reject(new Error("Track load was replaced."));
    };
    const failed = () => {
      cleanup();
      reject(new Error(isCurrent() ? "The progressive audio buffer could not release played data." : "Track load was replaced."));
    };
    sourceBuffer.addEventListener("updateend", updated, { once: true });
    sourceBuffer.addEventListener("error", failed, { once: true });
    sourceBuffer.addEventListener("abort", failed, { once: true });
    try {
      sourceBuffer.remove(start, end);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function releasePlayedBuffer(audio, sourceBuffer, isCurrent) {
  if (typeof sourceBuffer.remove !== "function") return;
  const range = bufferedRange(sourceBuffer);
  const removeEnd = Math.min(Number(audio.currentTime || 0) - KEEP_BUFFER_BEHIND_SECONDS, range?.end || 0);
  if (!range || removeEnd <= range.start + 1) return;
  await removeMediaRange(sourceBuffer, range.start, removeEnd, isCurrent);
}

function joinChunks(chunks, byteLength) {
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

export function startProgressiveMp3Stream(audio, track, isCurrent) {
  const mediaSource = new MediaSource();
  const abortController = new AbortController();
  const objectUrl = URL.createObjectURL(mediaSource);
  audio.src = objectUrl;
  audio.load();
  let analysisByteLength = 0;
  const analysisChunks = [];
  let resolveAnalysis;
  let rejectAnalysis;
  let analysisSettled = false;
  const analysisPromise = new Promise((resolve, reject) => {
    resolveAnalysis = resolve;
    rejectAnalysis = reject;
  });
  analysisPromise.catch(() => {});
  const finishAnalysis = () => {
    if (analysisSettled) return;
    analysisSettled = true;
    resolveAnalysis(joinChunks(analysisChunks, analysisByteLength));
  };
  const collectAnalysis = (chunk) => {
    if (analysisSettled || analysisByteLength >= ANALYSIS_SAMPLE_BYTES) return;
    const remaining = ANALYSIS_SAMPLE_BYTES - analysisByteLength;
    const sample = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    analysisChunks.push(sample);
    analysisByteLength += sample.byteLength;
    if (analysisByteLength >= ANALYSIS_SAMPLE_BYTES) finishAnalysis();
  };
  const promise = (async () => {
    await waitForMediaSourceOpen(mediaSource, isCurrent);
    if (!isCurrent()) throw new Error("Track load was replaced.");
    const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
    const response = await fetch(track.url, { cache: "force-cache", signal: abortController.signal });
    if (!response.ok) throw new Error(`Bandcamp stream request failed (${response.status}).`);
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isCurrent()) throw new Error("Track load was replaced.");
        if (!value?.byteLength) continue;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        collectAnalysis(chunk);
        await waitForProgressiveCapacity(audio, sourceBuffer, abortController.signal, isCurrent);
        await releasePlayedBuffer(audio, sourceBuffer, isCurrent);
        await appendMediaChunk(sourceBuffer, chunk, isCurrent);
      }
    } else {
      const chunk = new Uint8Array(await response.arrayBuffer());
      collectAnalysis(chunk);
      await appendMediaChunk(sourceBuffer, chunk, isCurrent);
    }
    if (!isCurrent()) throw new Error("Track load was replaced.");
    if (mediaSource.readyState === "open") mediaSource.endOfStream();
    finishAnalysis();
    return analysisPromise;
  })().then((result) => result).catch((error) => {
    if (!analysisSettled) {
      analysisSettled = true;
      rejectAnalysis(error);
    }
    throw error;
  });
  return { abortController, analysisPromise, objectUrl, promise };
}
