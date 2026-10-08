// A single ANALYZE_TRACKS request already serialises its own tracks, but the
// page starts several concurrent single-track requests, so that per-request cap
// bounded nothing: their fetches and decodes overlapped and competed with
// playback for the offscreen main thread. This gate serialises that work across
// every in-flight request, and lets requests for the same track share one run.

export function createAnalysisGate() {
  let chain = Promise.resolve();
  const inFlight = new Map();

  function runExclusive(job) {
    // Settling either way must release the gate, or one failure stalls the rest.
    const run = chain.then(job, job);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  function share(key, job) {
    if (!key) return runExclusive(job);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const run = runExclusive(job);
    inFlight.set(key, run);
    const release = () => { if (inFlight.get(key) === run) inFlight.delete(key); };
    run.then(release, release);
    return run;
  }

  return { runExclusive, share, pending: () => inFlight.size };
}
