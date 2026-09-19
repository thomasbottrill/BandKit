export function createAnalysisWorkerClient({
  createWorker = () => new globalThis.Worker(chrome.runtime.getURL("analysis-worker.js"))
} = {}) {
  let worker = null;
  let current = null;
  let nextId = 0;
  const pending = [];

  const finish = (error, result) => {
    const job = current;
    if (!job) return;
    clearTimeout(job.timeout);
    current = null;
    if (error) job.reject(error);
    else job.resolve(result);
    pump();
  };
  const fail = (error) => {
    worker?.terminate();
    worker = null;
    finish(error);
  };
  const pump = () => {
    if (current || !pending.length) return;
    current = pending.shift();
    try {
      if (!worker) {
        worker = createWorker();
        const createdWorker = worker;
        worker.onmessage = ({ data }) => {
          if (worker !== createdWorker || data.id !== current?.id) return;
          finish(data.error ? new Error(data.error) : null, data.result);
        };
        worker.onerror = () => {
          if (worker === createdWorker) fail(new Error("Audio analysis worker stopped unexpectedly."));
        };
        worker.onmessageerror = () => {
          if (worker === createdWorker) fail(new Error("Audio analysis worker returned an unreadable result."));
        };
      }
      // Do not detach decoder/playback-owned channels. Copy once, then
      // transfer those copies without another structured-clone allocation.
      const buffers = current.buffers.map((buffer) => ({
        sampleRate: buffer.sampleRate,
        channels: Array.from({ length: Math.max(1, Math.min(2, buffer.numberOfChannels)) },
          (_, index) => buffer.getChannelData(index).slice())
      }));
      current.timeout = setTimeout(() => fail(new Error("Audio analysis timed out.")), 120000);
      worker.postMessage({ id: current.id, buffers, deep: current.deep },
        buffers.flatMap((buffer) => buffer.channels.map((channel) => channel.buffer)));
    } catch (error) { fail(error); }
  };

  return {
    analyze(input, { deep = false, priority = false } = {}) {
      return new Promise((resolve, reject) => {
        const job = { id: ++nextId, buffers: (Array.isArray(input) ? input : [input]).filter(Boolean), deep, resolve, reject };
        // A single worker bounds CPU/memory use when a playlist is analysed.
        // The playing track gets the next slot ahead of queued batch work.
        if (priority) pending.unshift(job);
        else pending.push(job);
        pump();
      });
    },
    dispose() {
      const error = new Error("Audio analysis stopped.");
      for (const job of pending.splice(0)) job.reject(error);
      worker?.terminate();
      worker = null;
      finish(error);
    }
  };
}
