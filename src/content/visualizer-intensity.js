// Preserve the established 10–200% appearance. Above that, strengthen the
// existing light layers, not their geometry or the amount of rendering work.
export function visualizerLayerAlpha(cap, weight, intensity) {
  const strength = Math.max(0, Math.min(4, Number(intensity) || 0));
  return Math.min(1, Math.min(cap, weight * Math.min(2, strength)) * Math.max(1, strength / 2));
}
