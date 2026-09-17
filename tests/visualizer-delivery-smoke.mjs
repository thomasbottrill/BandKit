import assert from "node:assert/strict";
import { createVisualizerDelivery } from "../src/background/visualizer-delivery.js";

const sent = [];
const pending = [];
const deliver = createVisualizerDelivery((tabId, message) => {
  sent.push({ tabId, message });
  if (tabId === 1) return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  if (tabId === 3) throw new Error("Tab closed");
  if (tabId === 4) return Promise.reject(new Error("No receiver"));
  return Promise.resolve();
});
for (let frame = 0; frame < 40; frame++) {
  deliver(1, { frame });
  deliver(2, { frame });
  await Promise.resolve();
}
assert.equal(sent.filter(({ tabId }) => tabId === 1).length, 16,
  "A stalled receiver must have bounded outstanding messages");
assert.equal(sent.filter(({ tabId }) => tabId === 2).length, 40,
  "A stalled receiver must not delay a healthy tab");
pending.splice(0).forEach(({ resolve }) => resolve());
await Promise.resolve();
assert.equal(sent.length, 56, "Acknowledgements must not replay obsolete frames");
deliver(1, { frame: 99 });
assert.deepEqual(sent.at(-1), { tabId: 1, message: { frame: 99 } },
  "Recovery must deliver the current frame, not a skipped backlog");
pending.shift().reject(new Error("Receiver disconnected"));
await Promise.resolve();
for (let frame = 0; frame < 20; frame++) {
  assert.equal(deliver(3, { frame }), true, "Synchronous failures must release capacity");
  assert.equal(deliver(4, { frame }), true, "Rejected deliveries must release capacity");
  await Promise.resolve();
}
assert.equal(deliver(1, { frame: 100 }), true);
pending.shift().resolve();
await Promise.resolve();
console.log("Visualizer bounded, independent delivery checks passed.");
