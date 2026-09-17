import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/content/runtime/interaction-guards.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/, "").replaceAll("export function", "function");
const classes = () => {
  const values = new Set();
  return { add: (v) => values.add(v), remove: (v) => values.delete(v),
    toggle: (v, on) => on ? values.add(v) : values.delete(v), contains: (v) => values.has(v) };
};
const icon = { textContent: "", setAttribute() {}, removeAttribute() {} };
const buttons = ["playlist", "cart"].map(tab => ({ dataset: { tab }, classList: classes(),
  badge: { textContent: "" }, querySelector() { return this.badge; } }));
const r = { $panelShortcuts: { querySelectorAll: () => buttons },
  $compactPanelButton: { classList: classes(), querySelector: () => icon, offsetWidth: 44 } };
const state = { open: false, activeTab: "settings", cart: Array(9), playlist: Array(2) };
let expire;
const context = vm.createContext({ runtimeState: state, window: { clearTimeout() {}, setTimeout(fn) { expire = fn; return 1; } } });
vm.runInContext(source, context);
context.setupCompactPanelNotices(r, () => true);
r.$syncDestinationNotices();
assert.ok(buttons.every(b => !b.classList.contains("has-dot")), "Existing totals must not create badges");
r.$showCompactPanelNotice("icon-cart.svg", "Added to Cart");
assert.equal(icon.textContent, "Cart 9");
assert.ok(buttons[1].classList.contains("has-dot"));
expire();
assert.ok(!r.$compactPanelButton.classList.contains("is-notifying"));
state.open = true; state.activeTab = "cart";
r.$syncDestinationNotices();
assert.ok(!buttons[1].classList.contains("has-dot"), "Opening Cart acknowledges its additions");
r.$showCompactPanelNotice("icon-playlist.svg", "Added to saved playlist", 4);
assert.equal(icon.textContent, "Cart 9", "Playlist changes must not replace the cart-only preview");
assert.ok(!buttons[0].classList.contains("has-dot"), "Playlist changes must not create unseen-count badges");
console.log("Destination notice checks passed.");
