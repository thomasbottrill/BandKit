export function createAppContext(initialState) {
  let state = structuredClone(initialState);
  let cleaned = false;
  const cleanups = [];

  return {
    dom: {},
    services: {},
    get state() {
      return state;
    },
    replaceState(nextState) {
      state = nextState;
      return state;
    },
    registerCleanup(cleanup) {
      if (typeof cleanup !== "function") throw new TypeError("Cleanup must be a function.");
      cleanups.push(cleanup);
      return () => {
        const index = cleanups.indexOf(cleanup);
        if (index >= 0) cleanups.splice(index, 1);
      };
    },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.error("Bandkit cleanup failed.", error);
        }
      }
    }
  };
}
