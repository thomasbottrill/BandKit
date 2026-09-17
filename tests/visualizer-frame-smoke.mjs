import assert from "node:assert/strict";
import { createVisualizerFrameQueue } from "../src/content/visualizer-frame.js";

let visible = true;
let nextFrame = 0;
const callbacks = new Map();
const painted = [];
const queue = createVisualizerFrameQueue({
  visible: () => visible,
  render: (signal) => painted.push(signal),
  requestFrame(callback) { callbacks.set(++nextFrame, callback); return nextFrame; },
  cancelFrame(id) { callbacks.delete(id); }
});
const tick = (time) => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); };
queue.push({ sequence: 1 });
queue.push({ sequence: 2 });
queue.push({ sequence: 3 });
assert.equal(callbacks.size, 1, "A burst of messages must request only one paint");
tick(16.67);
assert.deepEqual(painted, [{ sequence: 3 }], "A delayed frame must paint the newest FFT, never a backlog");
queue.push({ sequence: 4 });
tick(33.34);
assert.equal(painted.at(-1).sequence, 4, "A fresh FFT must paint on the next display frame without a second 32ms delay");
queue.push({ sequence: 5 });
visible = false;
tick(50);
assert.equal(painted.length, 2, "A tab hidden between receipt and repaint must not render");
queue.push({ sequence: 6 });
assert.equal(callbacks.size, 0, "Hidden or disabled visualizers must schedule no work");
visible = true;
queue.push({ sequence: 7 });
queue.cancel();
assert.equal(callbacks.size, 0, "Cleanup must cancel outstanding frames");
queue.push({ sequence: 8 });
tick(2500);
assert.equal(painted.at(-1).sequence, 8, "Returning to a tab must resume with current audio only");
console.log("Visualizer frame coalescing and visibility checks passed.");
