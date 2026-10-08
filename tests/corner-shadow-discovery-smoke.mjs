// Behavioural coverage for shadow-root discovery. The corner assertions in
// music-bar-layout-smoke.mjs match source text, which cannot catch a scan that
// silently returns nothing — such as rejecting the document's own node type.
import assert from "node:assert/strict";
import { collectCornerMutationRoots, collectShadowRoots, isCornerStyleNode, promotePendingHosts } from "../src/content/runtime/corner-mutations.js";

class ShadowRoot {
  constructor() { this.nodeType = 11; this.children = []; }
  append(child) { this.children.push(child); }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll() { return this.descendants(); }
}

class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.shadowRoot = null; this.dataset = {}; this.isConnected = true; }
  append(child) { this.children.push(child); return child; }
  attachShadow() { this.shadowRoot = new ShadowRoot(); return this.shadowRoot; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll() { return this.descendants(); }
}

class Doc {
  constructor() { this.nodeType = 9; this.children = []; }
  append(child) { this.children.push(child); return child; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll() { return this.descendants(); }
}

// A full scan starts at the document, whose node type is 9 and not 1 or 11.
const doc = new Doc();
const menuBar = doc.append(new El("menu-bar"));
const menuShadow = menuBar.attachShadow();
const plainHost = doc.append(new El("div"));
plainHost.attachShadow();
const nested = new El("nested-widget");
nested.attachShadow();
menuShadow.append(nested);

const styled = new WeakSet();
const pending = new Set();
const found = collectShadowRoots(doc, { styled, pending });
assert.equal(found.length, 3, "A full scan from the document must reach every shadow root, including nested ones");
assert.ok(found.includes(menuShadow), "Custom-element shadow roots must be discovered");
assert.ok(found.includes(plainHost.shadowRoot), "Plain-element shadow roots must be discovered");
assert.ok(found.includes(nested.shadowRoot), "Shadow roots nested inside another shadow root must be discovered");

// Already-styled roots are observed for their own mutations, so rescanning must
// skip them: that is what keeps repeated passes proportional to what changed.
for (const root of found) styled.add(root);
assert.equal(collectShadowRoots(doc, { styled, pending }).length, 0, "A rescan must skip shadow roots it has already styled");

// A host that gains its shadow root after insertion emits no childList mutation.
const late = doc.append(new El("late-element"));
collectShadowRoots(doc, { styled, pending });
assert.ok(pending.has(late), "A custom element without a shadow root must be remembered for a later pass");
late.attachShadow();
const promoted = promotePendingHosts(pending, { styled });
assert.deepEqual(promoted, [late.shadowRoot], "A pending host must be promoted once its shadow root exists");
assert.equal(pending.has(late), false, "A promoted host must leave the pending set");

const disconnected = new El("gone-element");
disconnected.isConnected = false;
pending.add(disconnected);
promotePendingHosts(pending, { styled });
assert.equal(pending.has(disconnected), false, "Disconnected hosts must be pruned so the pending set stays bounded");

// Bandkit's own stylesheet insertion is a mutation inside a root it observes,
// so it must never schedule another discovery pass.
const ownStyle = new El("style");
ownStyle.dataset.bandkitPageCorners = "true";
const nativeNode = new El("div");
assert.equal(isCornerStyleNode(ownStyle), true, "Bandkit's corner stylesheet must be recognised as extension-owned");
assert.equal(isCornerStyleNode(nativeNode), false, "Native nodes must not be treated as extension-owned");
const sink = new Set();
collectCornerMutationRoots([{ addedNodes: [ownStyle, nativeNode, { nodeType: 3 }] }], sink);
assert.deepEqual([...sink], [nativeNode], "Only native element insertions may queue a discovery pass");

console.log("Corner shadow-root discovery: document scans, nested roots, skip-styled, pending promotion and self-mutation filtering passed.");
