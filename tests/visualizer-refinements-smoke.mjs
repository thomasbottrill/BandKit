import assert from "node:assert/strict";
import { drawOrganicVisualizer } from "../src/content/visualizer-organic.js";
import { ALTERNATIVE_VISUALIZERS, drawAlternativeVisualizer } from "../src/content/visualizer-alternatives.js";

function record(draw, time, level = 1) {
  const calls = [], paints = [];
  const context = { globalAlpha: 1 };
  for (const method of ["beginPath", "moveTo", "lineTo", "quadraticCurveTo", "arc", "rect", "closePath"]) {
    context[method] = (...args) => calls.push([method, ...args]);
  }
  context.fill = context.stroke = () => paints.push({ alpha: context.globalAlpha, blend: context.globalCompositeOperation });
  const amplitude = p => Math.sin(Math.PI * p) * 35 * level;
  draw(context, time, amplitude);
  return { calls, paints };
}
for (const style of ALTERNATIVE_VISUALIZERS) {
  const draw = (c, t, a) => drawAlternativeVisualizer(c, style, 1200, 72, t, 1, a);
  const first = record(draw, 0.1);
  assert.notDeepEqual(first.calls, record(draw, 0.9).calls, `${style} animates`);
  assert.notDeepEqual(first.calls, record(draw, 0.1, 0.25).calls, `${style} responds to audio`);
  assert.ok(first.paints.length <= 4, `${style} uses bounded batched drawing`);
}
for (const style of ["fog"]) {
  const draw = (c, t, a) => drawOrganicVisualizer(c, style, 1200, 72, t, 1, a);
  assert.notDeepEqual(record(draw, 0).calls, record(draw, 1).calls, `${style} has independent motion`);
}
const glitch = record((c, t, a) => drawAlternativeVisualizer(c, "glitch", 1200, 72, t, 1, a), 1);
const lengths = glitch.calls.filter(c => c[0] === "rect").map(c => c[3]);
assert.ok(Math.max(...lengths) > Math.min(...lengths) * 15, "Glitch mixes tiny fragments and long tears");
assert.ok(Math.max(...glitch.paints.map(p => p.alpha)) > Math.min(...glitch.paints.map(p => p.alpha)) * 6, "Glitch has visibly different exposures");
console.log("Visualizer replacements, audio response, motion and Glitch variation checks passed.");
