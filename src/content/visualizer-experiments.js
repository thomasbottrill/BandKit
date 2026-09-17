import { visualizerLayerAlpha } from "./visualizer-intensity.js";

export const EXPERIMENTAL_VISUALIZERS = ["rain", "constellation", "terrain"];
export const visualizerSeed = (index, salt) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const seed = visualizerSeed;

export function drawExperimentalVisualizer(context, style, points, width, height, time, intensity, amplitudeAt) {
  if (style === "rain") {
    context.lineWidth = 1.2;
    context.shadowBlur = 2;
    for (let layer = 0; layer < 3; layer += 1) {
      context.beginPath();
      for (let index = layer; index < 150; index += 3) {
        const position = (index + 0.5) / 150;
        const amplitude = amplitudeAt(position);
        const age = (time * (1.4 + seed(index, 14) * 1.2) + seed(index, 15)) % 1;
        const length = amplitude * 0.25 * Math.sin(age * Math.PI);
        const x = position * width + age * amplitude * 0.22;
        const y = height - amplitude * (1 - age);
        context.moveTo(x, y);
        context.lineTo(x + length * 0.28, Math.min(height, y + length));
      }
      context.globalAlpha = visualizerLayerAlpha(0.85, 0.4 + layer * 0.16, intensity);
      context.stroke();
    }
  } else if (style === "constellation") {
    context.beginPath();
    const stars = [];
    for (let index = 0; index < 80; index += 1) {
      const position = (index + 0.5) / 80;
      const amplitude = amplitudeAt(position);
      const x = position * width + Math.sin(time * 0.8 + index * 2) * amplitude * 0.12;
      const y = height - amplitude * (0.35 + seed(index, 19) * 0.4 + Math.sin(time * 1.1 + index) * 0.15)
        * (0.55 + amplitude / height * 0.6);
      stars.push([x, y]);
      if (index) { context.moveTo(...stars[index - 1]); context.lineTo(x, y); }
      if (index > 1 && index % 3 === 0) { context.moveTo(...stars[index - 2]); context.lineTo(x, y); }
    }
    context.lineWidth = 0.65;
    context.globalAlpha = visualizerLayerAlpha(0.65, 0.32, intensity);
    context.stroke();
    context.beginPath();
    stars.forEach(([x, y]) => { context.moveTo(x + 1.5, y); context.arc(x, y, 1.5, 0, Math.PI * 2); });
    context.globalAlpha = visualizerLayerAlpha(0.95, 0.8, intensity);
    context.fill();
  } else if (style === "terrain") {
    context.lineWidth = 0.8;
    for (let row = 1; row <= 5; row += 1) {
      context.beginPath();
      const depth = row / 5;
      points.forEach(([x, y], index) => {
        const perspectiveX = width / 2 + (x - width / 2) * (0.7 + depth * 0.3);
        const amplitude = height - y;
        const lift = amplitude * depth * (0.58 + amplitude / height * 0.55)
          * (0.87 + Math.sin(time * 0.9 + x / width * 11) * 0.13);
        if (index) context.lineTo(perspectiveX, height - lift); else context.moveTo(perspectiveX, height - lift);
        if (index % 12 === 0 && row > 1) {
          context.lineTo(width / 2 + (x - width / 2) * (0.7 + (depth - 0.2) * 0.3), height - lift * (depth - 0.2) / depth);
          context.moveTo(perspectiveX, height - lift);
        }
      });
      context.globalAlpha = visualizerLayerAlpha(0.9, 0.22 + depth * 0.5, intensity);
      context.stroke();
    }
  }
}
