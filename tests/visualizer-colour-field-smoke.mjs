import assert from "node:assert/strict";
import { flowingColour } from "../src/content/visualizer-colour-field.js";

const palette = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
const channels = (colour) => colour.match(/\d+/g).map(Number);
for (let phase = 0; phase < Math.PI * 2; phase += 0.2) {
  const samples = Array.from({ length: 101 }, (_, index) => channels(flowingColour(palette, index / 100, phase)));
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(samples.filter((rgb) => rgb[channel] > 245 && rgb.every((value, index) => index === channel || value < 60)).length >= 8,
      "Every chosen colour must have visibly distinct patches throughout the colour cycle");
    const edited = palette.map((colour, index) => index === channel ? [0, 0, 0] : colour);
    assert.ok(samples.filter((rgb, index) => rgb[channel] - channels(flowingColour(edited, index / 100, phase))[channel] > 200).length > 15,
      "Changing each picker must visibly change a meaningful part of the field");
  }
  assert.ok(samples.some((rgb) => rgb.filter((value) => value > 120).length >= 2), "Colour patches must still blend softly");
}
for (let position = 0; position <= 1; position += 0.025) {
  const seen = new Set();
  for (let phase = 0; phase < Math.PI * 2; phase += 0.05) {
    const rgb = channels(flowingColour(palette, position, phase));
    seen.add(rgb.indexOf(Math.max(...rgb)));
    assert.equal(flowingColour([[71, 132, 211], [71, 132, 211], [71, 132, 211]], position, phase), "rgb(71 132 211)");
  }
  assert.equal(seen.size, 3, "No position should be permanently assigned to one colour");
  const before = channels(flowingColour(palette, position, Math.PI * 2 - 0.0001));
  const after = channels(flowingColour(palette, position, 0.0001));
  assert.ok(before.every((value, index) => Math.abs(value - after[index]) <= 1), "The colour loop must have no visible reset seam");
}
console.log("Visualizer colour field smoke passed");
