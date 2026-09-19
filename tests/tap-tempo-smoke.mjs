import assert from "node:assert/strict";
import { tapTempoBpm } from "../src/content/tap-tempo.js";

assert.equal(tapTempoBpm([]), null);
assert.equal(tapTempoBpm([0, 500]), null, "two taps must not be mistaken for a stable tempo");
assert.equal(tapTempoBpm([0, 500, 1000]), null, "the initial estimate should wait for four taps");
assert.equal(tapTempoBpm([0, 500, 1000, 1500]), 120);
assert.equal(tapTempoBpm([0, 1000, 2000, 3000]), 120, "slow half-time taps should fold into the useful BPM range");
assert.equal(tapTempoBpm([0, 250, 500, 750]), 120, "fast double-time taps should fold into the useful BPM range");
assert.ok(Math.abs(tapTempoBpm([0, 495, 1005, 1490, 2008, 2497, 3004, 3500]) - 120) <= 0.2,
  "human timing variation should settle around the underlying tempo");
assert.equal(tapTempoBpm([0, 500, 1000, 2000, 2500, 3000]), 120,
  "a missed beat must not halve the rolling estimate");
assert.equal(tapTempoBpm([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500]), 120,
  "a longer tapping run should remain stable across the full rolling window");

console.log("Tap-tempo readout checks passed.");
