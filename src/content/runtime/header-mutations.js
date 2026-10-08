// Native header replacements must still remount the launcher, but rendering
// Bandkit's own controls/styles must never schedule another header render.
export function headerMutationNeedsMount(record, root) {
  const target = record.target;
  if (target === root || root.contains(target)) return false;
  const element = target.nodeType === 1 ? target : target.parentElement;
  if (element?.closest("#bandkit-shadow-header-theme, #bandkit-header-scroll-style")) return false;
  // A removed launcher/style needs repair, even though its initial insertion
  // is ours. Keep removals and mixed native/extension updates observable.
  if (record.removedNodes.length) return true;
  return [...record.addedNodes].some((node) => node !== root && node.id !== "bandkit-shadow-header-theme" && node.id !== "bandkit-header-scroll-style");
}
