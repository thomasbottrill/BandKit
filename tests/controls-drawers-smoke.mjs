import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const element = () => ({
  children: [], attributes: {}, events: {}, dataset: {}, classes: new Set(),
  append(...items) { this.children.push(...items); },
  setAttribute(key, value) { this.attributes[key] = value; },
  addEventListener(key, callback) { this.events[key] = callback; },
  get classList() { return { add: value => this.classes.add(value), toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value) }; }
});
const context = vm.createContext({ createElement: element, createPanelCaret: element });
for (const file of ["settings-drawer.js", "controls-settings.js"]) {
  const source = fs.readFileSync(new URL(`../src/content/${file}`, import.meta.url), "utf8");
  vm.runInContext(source.replace(/^import .*;\n/gm, "").replaceAll("export function", "function"), context);
}
const parent = element();
context.appendControlsDrawers(parent, [element(), element()], element(), element());
assert.equal(parent.children.length, 3);
for (const drawer of parent.children) {
  const [trigger, content] = drawer.children;
  assert.equal(content.hidden, true);
  assert.equal(trigger.attributes["aria-expanded"], "false");
  assert.equal(trigger.attributes["aria-controls"], content.id);
  trigger.events.click();
  assert.equal(content.hidden, false);
  assert.equal(trigger.attributes["aria-expanded"], "true");
}
const rerender = element();
context.appendControlsDrawers(rerender, [], element(), element());
assert.ok(rerender.children.every(drawer => !drawer.children[1].hidden), "Editing controls retains open drawers");
context.resetSettingsDisclosures();
const revisit = element();
context.appendControlsDrawers(revisit, [], element(), element());
assert.ok(revisit.children.every(drawer => drawer.children[1].hidden), "Navigation starts with closed drawers again");
console.log("Controls drawers: closed defaults, accessible toggles, edit retention and navigation reset passed");
