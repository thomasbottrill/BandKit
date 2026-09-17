// An idle offscreen heartbeat is not an audio sample from native page playback.
// Reconcile a disagreement without letting that heartbeat replace a live frame
// or continually postpone missing-feed recovery. Never restart/seek audio here.
export function createVisualizerSignalGuard({ isPlaying, reconcile, onState = () => {}, now = Date.now }) {
  let nextReconcileAt = -Infinity;
  let reconciliation = null;
  let state = "";
  const report = (next) => {
    if (state === next) return;
    state = next;
    onState(next);
  };
  return {
    accept(signal) {
      if (!signal || typeof signal !== "object") return false;
      if (signal.playing !== false || !isPlaying()) {
        report(signal.playing === false ? "idle" : "live");
        return true;
      }
      report("idle-conflict");
      const time = now();
      if (!reconciliation && time >= nextReconcileAt) {
        nextReconcileAt = time + 3000;
        reconciliation = Promise.resolve().then(reconcile).catch(() => {}).finally(() => {
          reconciliation = null;
        });
      }
      return false;
    }
  };
}
