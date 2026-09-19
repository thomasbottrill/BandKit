// Acknowledgements are not a frame clock. Allow normal delivery to continue
// through short IPC delays, but bound outstanding work for a hung receiver.
export function createVisualizerDelivery(send, maxInFlight = 16) {
  const inFlight = new Map();
  return (tabId, message) => {
    const count = inFlight.get(tabId) || 0;
    if (count >= maxInFlight) return false;
    inFlight.set(tabId, count + 1);
    const release = () => {
      const remaining = (inFlight.get(tabId) || 1) - 1;
      if (remaining) inFlight.set(tabId, remaining);
      else inFlight.delete(tabId);
    };
    try {
      Promise.resolve(send(tabId, message)).then(release, release);
    } catch {
      release();
    }
    // Frames skipped at the limit are discarded, not replayed on recovery.
    // The next producer sample is always fresher than a queued frame.
    return true;
  };
}
