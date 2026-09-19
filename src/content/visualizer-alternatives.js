import { visualizerSeed as seed } from "./visualizer-experiments.js";
import { visualizerLayerAlpha } from "./visualizer-intensity.js";

export const ALTERNATIVE_VISUALIZERS = ["warp", "dna", "glitch"];

function warp(c, w, h, t, amplitude) {
  c.lineWidth = 1.1; c.beginPath();
  for (let i = 0; i < 150; i++) {
    const age = (t * (0.24 + seed(i, 80) * 0.4) + seed(i, 81)) % 1;
    const ray = seed(i, 82) * 2 - 1;
    const depth = 0.1 + age * age * 0.9;
    const p = 0.5 + ray * depth * 0.49, a = amplitude(p);
    const y = h - a * (0.12 + seed(i, 83) * 0.72) * age;
    const tail = Math.sin(age * Math.PI) * (0.025 + a / h * 0.07);
    c.moveTo(p * w, y); c.lineTo((p - ray * tail) * w, Math.min(h, y + a * tail * 2));
  }
  c.stroke();
}

function dna(c, w, h, t, amplitude) {
  c.lineWidth = 1.1;
  for (let strand = 0; strand < 2; strand++) {
    c.beginPath();
    for (let i = 0; i <= 240; i++) {
      const p = i / 240, a = amplitude(p);
      const y = h - a * (0.48 + Math.sin(p * 36 - t * 1.5 + strand * Math.PI) * 0.36);
      if (i) c.lineTo(p * w, y); else c.moveTo(p * w, y);
    }
    c.stroke();
  }
  c.lineWidth = 0.65; c.beginPath();
  for (let i = 0; i < 100; i++) {
    const p = (i + 0.5) / 100, a = amplitude(p), twist = Math.sin(p * 36 - t * 1.5);
    c.moveTo(p * w, h - a * (0.48 + twist * 0.36));
    c.lineTo(p * w, h - a * (0.48 - twist * 0.36));
  }
  c.stroke();
}

function glitch(c, w, h, t, amplitude, intensity) {
  c.shadowBlur = 0;
  const energy = (amplitude(0.25) + amplitude(0.5) + amplitude(0.75)) / (3 * h);
  // Four batched exposure levels: dim fragments and saturated flashes coexist.
  for (let group = 0; group < 4; group++) {
    c.globalAlpha = visualizerLayerAlpha(1, [0.12, 0.3, 0.58, 0.95][group] * (0.7 + energy), intensity);
    c.beginPath();
    for (let i = 0; i < 110; i++) {
      const event = Math.floor(t * (2 + seed(i, 85) * 3));
      if (Math.floor(seed(i, event + 120) * 4) !== group) continue;
      const p = seed(i, 86), a = amplitude(p);
      const x = (p + (seed(i, event + 100) - 0.5) * 0.025) * w;
      // Skewed lengths allow tiny specks through to occasional broad tears.
      const variation = seed(i, 87) * 0.65 + seed(i, event + 130) * 0.35;
      const length = Math.min(w * 0.12, 2 + Math.pow(variation, 2.4) * w * 0.12) * Math.min(1, a / 8);
      const lift = a * (0.1 + seed(i, 88) * 0.8);
      c.rect(x - length / 2, h - lift, length, Math.min(a * 0.09, 0.6 + seed(i, 89) * 2.4));
    }
    c.fill();
  }
}

const DRAW = { warp, dna, glitch };
export function drawAlternativeVisualizer(c, style, w, h, t, intensity, amplitude) {
  c.globalAlpha = visualizerLayerAlpha(0.85, 0.5, intensity);
  DRAW[style]?.(c, w, h, t, amplitude, intensity);
}
