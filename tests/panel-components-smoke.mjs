import assert from "node:assert/strict";
import { createSettingsToggle, createSettingsActionRow, createSettingsActions } from "../src/content/components/settings.js";
import { createPanelViewTabs, createSavedCollectionCard } from "../src/content/components/collections.js";
import { createPanelMenuAction, createPanelOverflow } from "../src/content/components/actions.js";
import { registerActivitySettings } from "../src/content/runtime/activity-settings.js";
import { updateRuntimeState, updateRuntimeSaveState } from "../src/content/runtime/context.js";

// A small DOM harness exercises the actual components and view callbacks without
// mocking their implementation. Real-site verification covers layout and focus.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {}; this.style = { setProperty() {} }; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
  emit(name, event = {}) { for (const handler of this.events[name] || []) handler(event); }
  focus() { active = this; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === "button:not(:disabled)" && child.tagName === "button" && !child.disabled) return child;
      const descendant = child.querySelector(selector);
      if (descendant) return descendant;
    }
    return null;
  }
  get classList() { return { add: value => { this.className += ` ${value}`; } }; }
}
let active;
const deferred = [];
globalThis.Element = Element;
globalThis.document = { createElement: tag => new Element(tag) };
globalThis.chrome = { runtime: { getURL: path => `chrome-extension://test/${path}` } };
globalThis.window = { setTimeout: callback => deferred.push(callback) };
const flush = () => { while (deferred.length) deferred.shift()(); };

for (const checked of [false, true]) {
  const toggle = createSettingsToggle({ checked, ariaLabel: "Analysis", controls: "options", expanded: checked });
  assert.equal(toggle.attributes.role, "switch");
  assert.equal(toggle.attributes["aria-checked"], String(checked));
  assert.equal(toggle.attributes["aria-expanded"], String(checked));
  assert.equal(toggle.attributes["aria-controls"], "options");
  assert.equal(toggle.className.includes("is-active"), checked);
}
const selections = [];
const tabs = createPanelViewTabs({ views: [{ id: "current", label: "Cart" }, { id: "saved", label: "Saved" }], selected: "saved", onSelect: id => selections.push(id) });
assert.deepEqual(tabs.children[0].children.map(button => button.attributes["aria-selected"]), ["false", "true"]);
tabs.children[0].children[0].emit("click");
assert.deepEqual(selections, ["current"]);

let opened = 0;
const card = createSavedCollectionCard({ title: "<b>Literal title</b>", total: "1:30", summary: "1 track", artwork: new Element("img"), ariaLabel: "Open playlist", onOpen: () => opened++ });
assert.equal(card.children[0].children[1].children[0].children[0].textContent, "<b>Literal title</b>");
card.children[0].emit("click");
assert.equal(opened, 1);
assert.equal(card.children[0].tagName, "button");

let invoked = 0;
const disabled = createPanelMenuAction("Unavailable", "icon-play.svg", () => {}, { disabled: true });
const action = createPanelMenuAction("Rename", "icon-settings.svg", () => invoked++);
const overflow = createPanelOverflow("More", [disabled, action], { activeElement: () => active });
const [trigger, menu] = overflow.children;
trigger.emit("click"); flush();
assert.equal(menu.hidden, false);
assert.equal(active, action, "Opening a menu focuses the first enabled action");
overflow.emit("keydown", { key: "Escape" });
assert.equal(menu.hidden, true);
assert.equal(active, trigger, "Escape restores focus to the trigger");
trigger.emit("click"); flush(); active = new Element("button"); overflow.emit("focusout"); flush();
assert.equal(menu.hidden, true, "Leaving the menu closes it");
action.emit("click"); assert.equal(invoked, 1);
assert.equal(createPanelOverflow("Unavailable", [disabled], { activeElement: () => active }).children[0].disabled, true);

const row = createSettingsActionRow({ label: "Backup", description: "Save a copy", actions: createSettingsActions("", action, disabled) });
assert.equal(row.children[0].children[0].textContent, "Backup");
assert.deepEqual(row.children[1].children, [action, disabled], "Action rows keep label and action group as separate columns");

let saves = 0;
const state = { appearance: { preset: "saved-one", savedThemes: [{ id: "saved-one", label: "Original" }, { id: "saved-two", label: "Keep me" }] } };
updateRuntimeState(state); updateRuntimeSaveState(() => saves++);
const runtime = { $render() {}, $showToast() {} };
for (const register of registerActivitySettings) register(runtime);
const renderTheme = mode => { const parent = new Element("section"); runtime.$appendSavedThemeSettings(parent, mode); return parent; };
assert.equal(renderTheme("page").children.length, 0, "Page colour mode does not expose saved palette management");
const theme = renderTheme("theme");
const [rename, remove] = theme.children[0].children[1].children;
assert.equal(rename.attributes["aria-label"], "Rename saved palette");
assert.equal(remove.attributes["aria-label"], "Delete saved palette");
window.prompt = () => "  Renamed  "; rename.emit("click");
assert.equal(state.appearance.savedThemes[0].label, "Renamed");
assert.equal(state.appearance.savedThemes[1].label, "Keep me");
assert.equal(saves, 1);
window.prompt = () => "  "; rename.emit("click");
window.confirm = () => false; remove.emit("click");
assert.equal(saves, 1, "Cancelled or blank management actions do not persist changes");
window.confirm = () => true; remove.emit("click");
assert.deepEqual(state.appearance.savedThemes, [{ id: "saved-two", label: "Keep me" }]);
assert.equal(state.appearance.preset, "custom");
assert.equal(saves, 2);
assert.equal(renderTheme("theme").children.length, 0, "Built-in and custom themes have no saved-theme actions");
console.log("Panel components: switch semantics, tabs, saved cards, menu focus, action rows and saved-theme callbacks passed.");
