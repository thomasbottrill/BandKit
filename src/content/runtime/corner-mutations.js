// Bandkit injects its corner stylesheet into every shadow root on the page, so
// that insertion is itself a childList mutation inside a root Bandkit already
// observes. Discovery must ignore extension-owned nodes, and must walk only the
// newly inserted subtrees instead of rescanning the whole document each time a
// native mutation lands.

export function isCornerStyleNode(node) {
  return node.nodeType === 1 && node.dataset?.bandkitPageCorners === "true";
}

export function collectCornerMutationRoots(records, sink) {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1 || isCornerStyleNode(node)) continue;
      sink.add(node);
    }
  }
  return sink;
}

// Already-styled roots are observed with subtree:true, so anything inserted into
// them arrives as its own mutation. Skipping them here is what keeps an
// incremental pass proportional to what actually changed.
// Scannable scopes are elements, the document itself and shadow roots, which
// are Node types 1, 9 and 11 respectively. Only elements can host a shadow root.
const SCANNABLE_NODE_TYPES = new Set([1, 9, 11]);

export function collectShadowRoots(node, { styled, pending, roots = [] } = {}) {
  if (!node || !SCANNABLE_NODE_TYPES.has(node.nodeType)) return roots;
  const scan = (scope) => {
    for (const host of scope.querySelectorAll("*")) {
      const shadow = host.shadowRoot;
      if (!shadow) {
        // A custom element attaches its shadow root during upgrade, which emits
        // no childList mutation when the definition lands after insertion.
        // Remembering the undefined hosts keeps that case reachable without a
        // full document rescan.
        if (pending && host.tagName.includes("-")) pending.add(host);
        continue;
      }
      pending?.delete(host);
      if (styled?.has(shadow)) continue;
      roots.push(shadow);
      scan(shadow);
    }
  };
  if (node.nodeType === 1 && node.shadowRoot && !styled?.has(node.shadowRoot)) {
    roots.push(node.shadowRoot);
    scan(node.shadowRoot);
  }
  scan(node);
  return roots;
}

export function promotePendingHosts(pending, { styled, roots = [] } = {}) {
  for (const host of [...pending]) {
    if (!host.isConnected) {
      pending.delete(host);
      continue;
    }
    const shadow = host.shadowRoot;
    if (!shadow) continue;
    pending.delete(host);
    if (styled?.has(shadow)) continue;
    roots.push(shadow);
    collectShadowRoots(shadow, { styled, pending, roots });
  }
  return roots;
}
