import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/content/music-bar-settings.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("function createDynamicColorSetting("), source.indexOf("function createPlayerBlendModeSetting("));
const switches = [];
const element = () => ({
  children: [], attributes: {}, classes: new Set(), hidden: false,
  append(...children) { this.children.push(...children); },
  setAttribute(key, value) { this.attributes[key] = value; },
  addEventListener(type, handler) { this[type] = handler; },
  get classList() { const classes = this.classes; return {
    add(name) { classes.add(name); },
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }
  }; }
});
const state = { musicBarDynamicColor: false, musicBarPlayerDynamicColor: false, musicBarPanelDynamicColor: false };
let saves = 0;
const context = vm.createContext({
  runtimeState: state, runtimeSaveState: () => saves++, createElement: element,
  createSettingsToggle: ({ checked }) => { const toggle = element(); toggle.setAttribute("aria-checked", String(checked)); switches.push(toggle); return toggle; },
  createPlayerSettingRow: (_label, _description, control) => control
});
vm.runInContext(`${body}\nthis.createSetting = createDynamicColorSetting;`, context);
const row = element();
const setting = context.createSetting({ $syncMusicBarStyle() {}, $schedulePlayerSectionGeometry() {}, $showToast() {} }, row);
const [master, player, panel] = switches;
master.click();
assert.equal(state.musicBarDynamicColor, true);
assert.equal(state.musicBarPlayerDynamicColor, true);
assert.equal(state.musicBarPanelDynamicColor, true);
assert.equal(player.attributes["aria-checked"], "true");
assert.equal(panel.attributes["aria-checked"], "true");
assert.equal(setting.children[1].hidden, false);
assert.equal(row.hidden, true);
player.click(); panel.click();
assert.equal(state.musicBarPlayerDynamicColor, false);
assert.equal(state.musicBarPanelDynamicColor, false);
master.click();
assert.equal(setting.children[1].hidden, true);
master.click();
assert.equal(state.musicBarPlayerDynamicColor, true);
assert.equal(state.musicBarPanelDynamicColor, true);
assert.equal(saves, 5);
console.log("Dynamic colour master switch enables both surfaces; independent overrides and re-enabling passed.");
