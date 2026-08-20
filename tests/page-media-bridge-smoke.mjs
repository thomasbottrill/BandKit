import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const listeners = new Map();
let renderedCartItemCount = 1;
const document = {
  addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  },
  dispatchEvent(event) {
    for (const listener of listeners.get(event.type) || []) listener(event);
    return true;
  },
  querySelector(selector) {
    if (selector !== "#sidecart #item_list") return null;
    return { querySelectorAll: () => Array.from({ length: renderedCartItemCount }) };
  }
};

class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

class HTMLMediaElement extends EventTarget {
  constructor() {
    super();
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.duration = 120;
    this.playbackRate = 1;
    this.volume = 1;
    this.src = "";
    this.currentSrc = "";
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

const nativeItem = {
  id: 321,
  local_id: 987,
  item_type: "a",
  item_id: 123,
  option_id: null,
  discount_id: null,
  item_title: "Remove Me"
};
let deletedItem = null;
const window = {
  Sidecart: {
    cart_items: [nativeItem],
    subtotal: 9,
    add_to_cart(item) {
      item.local_id = "added-local-id";
      item.id = 654;
      this.cart_items.push(item);
    },
    delete_from_cart(item) {
      deletedItem = item;
      this.cart_items = this.cart_items.filter((candidate) => candidate !== item);
    }
  },
  ClientPrefs: { currency: "USD" },
  Audio: function Audio() { return new HTMLMediaElement(); },
  setTimeout,
  setInterval() { return 1; }
};

const context = { window, document, CustomEvent, HTMLMediaElement, Set, Date, JSON, Math, Number, Object, Array, Promise };
const source = await readFile(new URL("../dist/unpacked/page-media-bridge.js", import.meta.url), "utf8");
vm.runInNewContext(source, context);

let cartState = null;
document.addEventListener("bandkit:cart-state", (event) => { cartState = event.detail; });
document.dispatchEvent(new CustomEvent("bandkit:cart-command", { detail: { action: "getState" } }));
assert.equal(cartState.items[0].local_id, nativeItem.local_id, "bridge should retain Bandcamp's native cart identity");

renderedCartItemCount = 0;
document.dispatchEvent(new CustomEvent("bandkit:cart-command", { detail: { action: "getState" } }));
assert.equal(cartState.items.length, 0, "an empty rendered Bandcamp cart should override a stale final Sidecart item");
assert.equal(cartState.summary.subtotal, 0, "an empty rendered cart should report a zero subtotal");
renderedCartItemCount = 1;

const result = await new Promise((resolve) => {
  document.addEventListener("bandkit:cart-remove-result", (event) => resolve(event.detail));
  document.dispatchEvent(new CustomEvent("bandkit:cart-command", {
    detail: { action: "remove", requestId: "remove-test", item: { ...nativeItem } }
  }));
});

assert.equal(deletedItem, nativeItem, "remove should pass Bandcamp's native item to Sidecart.delete_from_cart");
assert.equal(window.Sidecart.cart_items.length, 0, "native Sidecart should no longer contain the item");
assert.equal(result.requestId, "remove-test");
assert.equal(result.removed, true);
assert.equal(result.error, undefined);

const addResult = await new Promise((resolve) => {
  document.addEventListener("bandkit:cart-restore-result", (event) => resolve(event.detail));
  document.dispatchEvent(new CustomEvent("bandkit:cart-command", {
    detail: {
      action: "restore",
      requestId: "restore-test",
      items: [{ title: "Add Me", restore: { item_type: "t", item_id: 456, band_id: 12, unit_price: 4, quantity: 1 } }]
    }
  }));
});

assert.equal(addResult.requestId, "restore-test");
assert.equal(addResult.added, 1, "restore should add a resolved item to Bandcamp's current cart");
assert.equal(window.Sidecart.cart_items[0].item_id, 456);

const firstAudio = new window.Audio();
const secondAudio = new window.Audio();
await firstAudio.play();
await secondAudio.play();
assert.equal(firstAudio.paused, false);
assert.equal(secondAudio.paused, false);
document.dispatchEvent(new CustomEvent("bandkit:media-command", { detail: { action: "pauseAll" } }));
assert.equal(firstAudio.paused, true, "pauseAll should stop the first tracked native player");
assert.equal(secondAudio.paused, true, "pauseAll should stop every tracked native player, not only the most recently active one");

console.log("page media bridge cart removal smoke test passed");
