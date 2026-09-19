import { visualizerLayerAlpha } from "./visualizer-intensity.js";
import { drawExperimentalVisualizer, EXPERIMENTAL_VISUALIZERS, visualizerSeed as seed } from "./visualizer-experiments.js";
import { drawWildVisualizer, WILD_VISUALIZERS } from "./visualizer-wild.js";

// Alternate treatments of the same FFT silhouette. Fixed layer/particle counts
// keep frame cost bounded; there are no extra timers or accumulated particles.
export const VISUALIZER_VARIANTS = ["grass", "embers", "contours", "firefly", "pixels", "scanlines", "cross-stitch", "weave", "rain", "constellation", "terrain", ...WILD_VISUALIZERS];

const fireSurfaces = new WeakMap();
function drawFireBed(context, points, width, height, gradient, intensity) {
  // Blur on a quarter-height surface, then expand it vertically. This makes
  // the layer blur four times taller than it is wide without a large filter.
  let surface = fireSurfaces.get(context);
  if (!surface && typeof OffscreenCanvas === "function") {
    surface = new globalThis.OffscreenCanvas(Math.ceil(width), Math.ceil(height / 4));
    fireSurfaces.set(context, surface);
  }
  const paint = surface?.getContext("2d") || context;
  if (surface) {
    if (surface.width !== Math.ceil(width)) surface.width = Math.ceil(width);
    if (surface.height !== Math.ceil(height / 4)) surface.height = Math.ceil(height / 4);
    paint.setTransform(1, 0, 0, surface.height / height, 0, 0);
    paint.clearRect(0, 0, width, height);
  }
  paint.save();
  paint.fillStyle = gradient;
  paint.filter = surface ? "blur(2.5px)" : "blur(5px)";
  paint.globalAlpha = visualizerLayerAlpha(0.9, 0.65, intensity);
  paint.beginPath();
  paint.moveTo(0, height);
  points.forEach(([x, y]) => paint.lineTo(x, y));
  paint.lineTo(width, height);
  paint.closePath();
  paint.fill();
  paint.restore();
  if (surface) {
    context.save();
    context.shadowBlur = 0;
    context.drawImage(surface, 0, 0, width, height);
    context.restore();
  }
}

const EMBERS = Array.from({ length: 120 }, (_, index) => ({
  position: (index + 0.25 + seed(index, 1) * 0.5) / 120,
  phase: seed(index, 2) * Math.PI * 2,
  speed: 0.6 + seed(index, 3) * 0.5,
  radius: 1.45 + seed(index, 4) * 0.7
}));
const FIREFLIES = Array.from({ length: 280 }, (_, index) => ({
  position: seed(index, 8), phase: seed(index, 9) * Math.PI * 2,
  speed: 0.8 + seed(index, 10) * 2.8, radius: 0.7 + seed(index, 11) * 1.55,
  altitude: seed(index, 12)
}));

export function drawVisualizerVariant(context, style, points, width, height, time, intensity, colourField, colourAt) {
  const amplitudeAt = (position) => {
    const sample = Math.max(0, Math.min(points.length - 1, position * (points.length - 1)));
    const index = Math.floor(sample);
    const first = points[index][1];
    const second = points[Math.min(points.length - 1, index + 1)][1];
    return height - first - (second - first) * (sample - index);
  };
  context.save();
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = colourField.gradient;
  context.fillStyle = colourField.gradient;
  context.shadowColor = colourField.halo;
  context.shadowBlur = 4;
  if (WILD_VISUALIZERS.includes(style)) {
    drawWildVisualizer(context, style, width, height, time, intensity, amplitudeAt);
    context.restore();
    return;
  }
  if (EXPERIMENTAL_VISUALIZERS.includes(style)) {
    drawExperimentalVisualizer(context, style, points, width, height, time, intensity, amplitudeAt);
    context.restore();
    return;
  }
  if (style === "contours") {
    for (let layer = 1; layer <= 6; layer += 1) {
      context.beginPath();
      points.forEach(([x, y], index) => {
        const nextY = height - (height - y) * layer / 6;
        if (index) context.lineTo(x, nextY);
        else context.moveTo(x, nextY);
      });
      context.globalAlpha = visualizerLayerAlpha(0.85, 0.14 + layer * 0.09, intensity);
      context.lineWidth = layer === 6 ? 1.3 : 0.7;
      context.stroke();
    }
  } else if (style === "grass") {
    // Batch strands into a few colour groups instead of applying 144 separate
    // shadow filters. Their tips keep the source FFT's local detail.
    for (let group = 0; group < 8; group += 1) {
      context.beginPath();
      context.strokeStyle = colourField.gradient;
      for (let index = group; index < 144; index += 8) {
        const position = (index + 0.5) / 144;
        const x = position * width;
        const measured = amplitudeAt(position);
        const amplitude = measured * (0.48 + seed(index, 30) * 0.4 + measured / height * 0.2);
        const gust = Math.sin(time * 0.7 - position * 6) * 0.8
          + Math.sin(time * 1.15 - position * 11) * 0.2;
        const sway = gust * amplitude * 0.38;
        context.moveTo(x, height);
        context.quadraticCurveTo(x + sway * 0.55, height - amplitude * 0.55,
          x + sway, height - amplitude);
      }
      context.globalAlpha = visualizerLayerAlpha(0.8, 0.58, intensity);
      context.lineWidth = 1.5;
      context.stroke();
    }
  } else if (style === "embers") {
    // A glowing spectral fire-bed ties every spark to its local FFT peak.
    // Sparks rise and burn out; they do not bounce back down or wander freely.
    drawFireBed(context, points, width, height, colourField.gradient, intensity);
    context.shadowBlur = 3;
    for (let group = 0; group < 6; group += 1) {
      context.beginPath();
      context.fillStyle = colourAt(group / 5);
      for (let index = group * 20; index < (group + 1) * 20; index += 1) {
        const { position, phase, speed, radius } = EMBERS[index];
        const amplitude = amplitudeAt(position);
        const envelope = Math.pow(Math.sin(position * Math.PI), 0.84);
        const age = (time * speed + phase / (Math.PI * 2)) % 1;
        const flight = amplitude * (0.72 + age * 0.48) + height * 0.06 * age * envelope;
        const x = position * width + Math.sin(time * 0.9 + phase) * amplitude * 0.04 * age;
        const y = height - flight;
        const dotRadius = radius * envelope * Math.sin(age * Math.PI) * (0.45 + amplitude / height);
        context.moveTo(x + dotRadius, y);
        context.arc(x, y, dotRadius, 0, Math.PI * 2);
      }
      context.globalAlpha = visualizerLayerAlpha(0.9, 0.68, intensity);
      context.fill();
    }
  } else if (style === "pixels") {
    const columns = Math.max(32, Math.min(440, Math.floor(width / 3)));
    const block = 2;
    context.shadowBlur = 0;
    context.globalAlpha = visualizerLayerAlpha(0.9, 0.68, intensity);
    context.beginPath();
    for (let index = 0; index < columns; index += 1) {
      const position = (index + 0.5) / columns;
      const amplitude = amplitudeAt(position);
      const x = position * width;
      const rows = Math.floor(amplitude / (block + 1));
      for (let row = 0; row < rows; row += 1) {
        context.rect(Math.round(x - block / 2), height - (row + 1) * (block + 1), block, block);
      }
    }
    context.fill();
  } else if (style === "firefly") {
    // Independent, deterministic meanders and twinkles: no shared wipe, no
    // frame-random jitter, and only four batched paints for the whole swarm.
    context.shadowBlur = 3;
    for (let group = 0; group < 4; group += 1) {
      context.beginPath();
      for (let index = group; index < FIREFLIES.length; index += 4) {
        const fly = FIREFLIES[index];
        const t = time * fly.speed + fly.phase;
        const position = Math.max(0.005, Math.min(0.995, fly.position + Math.sin(t * 0.37) * 0.024));
        const envelope = Math.sin(position * Math.PI) ** 0.84;
        const amplitude = amplitudeAt(position);
        const wander = 0.5 + Math.sin(t) * Math.cos(t * 0.63 + fly.phase) * 0.5;
        const lift = height * envelope * (0.08 + fly.altitude * 0.16 + wander * 0.15) + amplitude * (0.12 + wander * 0.38);
        const x = position * width;
        const y = height - lift;
        const twinkle = 0.2 + (0.5 + Math.sin(t * 2.3 + fly.phase) * 0.5) ** 3 * 0.8;
        const radius = fly.radius * envelope * twinkle;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, Math.PI * 2);
      }
      context.globalAlpha = visualizerLayerAlpha(0.95, 0.5 + group * 0.12, intensity);
      context.fill();
    }
  } else if (style === "scanlines") {
    // A broken CRT-like raster, with travelling scans rather than circles.
    context.shadowBlur = 2;
    context.lineWidth = 1.25;
    for (let pass = 0; pass < 3; pass += 1) {
      context.beginPath();
      for (let row = pass; row < Math.min(40, Math.ceil(height / 4)); row += 3) {
        const lift = (row + 1) * 4;
        for (let column = 0; column < 120; column += 1) {
          const position = (column + 0.5) / 120;
          if (amplitudeAt(position) < lift) continue;
          const scan = 0.5 + Math.sin(position * 13 - time * 2 + row * 0.8) * 0.5;
          const x = position * width;
          const half = width / 240 * (0.15 + scan * 0.8);
          context.moveTo(x - half, height - lift);
          context.lineTo(x + half, height - lift);
        }
      }
      context.globalAlpha = visualizerLayerAlpha(0.9, 0.45 + pass * 0.12, intensity);
      context.stroke();
    }
  } else if (style === "cross-stitch") {
    context.shadowBlur = 1;
    context.lineWidth = 1;
    context.beginPath();
    const columns = Math.max(24, Math.min(240, Math.floor(width / 6)));
    for (let column = 0; column < columns; column += 1) {
      const position = (column + 0.5) / columns;
      const amplitude = amplitudeAt(position);
      for (let row = 0; row < Math.ceil(amplitude / 6); row += 1) {
        const stitch = Math.min(2, Math.max(0, amplitude - row * 6) / 3);
        const x = position * width;
        const y = height - row * 6 - 3;
        context.moveTo(x - stitch, y - stitch);
        context.lineTo(x + stitch, y + stitch);
        context.moveTo(x - stitch, y + stitch);
        context.lineTo(x + stitch, y - stitch);
      }
    }
    context.globalAlpha = visualizerLayerAlpha(0.95, 0.75, intensity);
    context.stroke();
  } else if (style === "weave") {
    for (let strand = 0; strand < 4; strand += 1) {
      context.beginPath();
      points.forEach(([x, y], index) => {
        const crossing = 0.56 + Math.sin(x / width * Math.PI * 12 + time * 1.2 + strand * Math.PI / 2) * 0.38;
        const nextY = height - (height - y) * crossing;
        if (index) context.lineTo(x, nextY);
        else context.moveTo(x, nextY);
      });
      context.strokeStyle = colourField.gradient;
      context.globalAlpha = visualizerLayerAlpha(0.85, 0.6, intensity);
      context.lineWidth = 1.4;
      context.stroke();
    }
  }
  context.restore();
}
