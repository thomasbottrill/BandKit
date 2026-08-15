import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource } from "./support/source.mjs";

const popupSource = fs.readFileSync(new URL("../dist/unpacked/popup.js", import.meta.url), "utf8");
const contentSource = readContentSource();

class FixtureElement {
  constructor() {
    this.attributes = new Map();
    this.classNames = new Set();
    this.classList = {
      add: (name) => this.classNames.add(name),
      remove: (name) => this.classNames.delete(name),
      toggle: (name, enabled) => enabled ? this.classNames.add(name) : this.classNames.delete(name)
    };
    this.disabled = false;
    this.listeners = new Map();
    this.textContent = "";
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

const status = new FixtureElement();
const toggle = new FixtureElement();
let enabled = true;
const messages = [];
const context = {
  document: {
    querySelector(selector) { return selector === "#status" ? status : toggle; }
  },
  chrome: {
    runtime: {
      async sendMessage(message) {
        messages.push(message);
        if (message.type === "BANDCAMP_HUB_SET_ENABLED") enabled = message.enabled !== false;
        return { ok: true, enabled };
      }
    }
  }
};

vm.runInNewContext(popupSource, context);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(status.textContent, "Bandkit is active");
assert.equal(toggle.textContent, "Deactivate");
assert.equal(toggle.attributes.get("aria-pressed"), "true");

await toggle.listeners.get("click")();
assert.equal(messages.at(-1).type, "BANDCAMP_HUB_SET_ENABLED");
assert.equal(messages.at(-1).enabled, false);
assert.equal(status.textContent, "Bandkit is deactivated");
assert.equal(toggle.textContent, "Activate");
assert.equal(toggle.attributes.get("aria-pressed"), "false");

assert.match(contentSource, /chrome\.storage\.local\.get\(STORAGE_KEYS\.ENABLED/);
assert.match(contentSource, /ENABLED:\s*"bandcampHubEnabled"/);
assert.match(contentSource, /if \(!activation\) return;/);

console.log("Global Bandkit activation checks passed.");
