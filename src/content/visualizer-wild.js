import { visualizerLayerAlpha } from "./visualizer-intensity.js";
import { visualizerSeed as seed } from "./visualizer-experiments.js";
import { drawOrganicVisualizer } from "./visualizer-organic.js";
import { ALTERNATIVE_VISUALIZERS, drawAlternativeVisualizer } from "./visualizer-alternatives.js";

export const WILD_VISUALIZERS = ["matrix", "fog", ...ALTERNATIVE_VISUALIZERS];

// Geometric code glyphs are batched paths, not hundreds of shadowed text draws.
function matrix(context, width, height, time, amplitudeAt, intensity) {
  const columns = Math.min(110, Math.floor(width / 11));
  context.lineWidth = 1;
  context.shadowBlur = 2;
  for (let layer = 0; layer < 4; layer += 1) {
    context.beginPath();
    for (let column = 0; column < columns; column += 1) {
      const position = (column + 0.5) / columns;
      const amplitude = amplitudeAt(position);
      const travel = time * (10 + seed(column, 31) * 20) + seed(column, 32) * 60;
      const rows = Math.ceil(amplitude / 8);
      for (let row = layer; row < rows; row += 4) {
        const span = Math.max(8, rows * 8);
        const lift = ((row * 8 - travel) % span + span) % span;
        if (lift >= amplitude) continue;
        const size = Math.min(2.5, Math.max(0, amplitude - lift) * 0.4, lift * 0.4);
        const x = position * width, y = height - lift;
        const code = Math.floor(seed(column * 17 + row, Math.floor(time * 2)) * 8);
        context.moveTo(x - size, y - size); context.lineTo(x + size, y - size);
        context.moveTo(x, y - size); context.lineTo(x, y + size);
        if (code & 1) { context.moveTo(x - size, y); context.lineTo(x + size, y); }
        if (code & 2) { context.moveTo(x - size, y + size); context.lineTo(x + size, y); }
        if (code & 4) { context.moveTo(x + size, y - size); context.lineTo(x + size, y + size); }
      }
    }
    context.globalAlpha = visualizerLayerAlpha(0.95, 0.25 + layer * 0.2, intensity);
    context.stroke();
  }
}

export function drawWildVisualizer(context, style, width, height, time, intensity, amplitudeAt) {
  context.globalAlpha = visualizerLayerAlpha(0.9, 0.65, intensity);
  if (style === "matrix") matrix(context, width, height, time, amplitudeAt, intensity);
  else if (ALTERNATIVE_VISUALIZERS.includes(style)) drawAlternativeVisualizer(context, style, width, height, time, intensity, amplitudeAt);
  else drawOrganicVisualizer(context, style, width, height, time, intensity, amplitudeAt);
}
