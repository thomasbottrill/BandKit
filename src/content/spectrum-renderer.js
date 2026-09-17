import { drawVisualizerVariant, VISUALIZER_VARIANTS } from "./visualizer-variants.js";
import { visualizerLayerAlpha } from "./visualizer-intensity.js";
import { flowingColour } from "./visualizer-colour-field.js";

function interpolatedSpectrumValue(spectrum, position) {
  if (!spectrum.length) return 0;
  const bounded = Math.max(0, Math.min(spectrum.length - 1, position));
  const first = Math.floor(bounded);
  const mix = bounded - first;
  const next = spectrum[Math.min(spectrum.length - 1, first + 1)] ?? spectrum[first];
  return spectrum[first] + (next - spectrum[first]) * mix;
}

function softLimitPeak(value, knee = 0.7, ceiling = 0.96) {
  const level = Math.max(0, value);
  if (level <= knee) return level;
  const range = Math.max(0.01, ceiling - knee);
  return knee + range * (1 - Math.exp(-(level - knee) / range));
}

function spectrumAnalyzerContour(spectrum, width, height) {
  // One point per supplied FFT band already exceeds the visible pixel density
  // at typical player widths. Doubling it only repeats interpolation work and
  // multiplies the cost of every glow/history stroke.
  const pointCount = Math.max(257, spectrum.length);
  const overallEnergy = spectrum.reduce((sum, value) => sum + value, 0) / Math.max(1, spectrum.length);
  return Array.from({ length: pointCount }, (_, index) => {
    const horizontal = index / (pointCount - 1);
    const lastBand = Math.max(0, spectrum.length - 1);
    const frequencyPosition = horizontal * lastBand;
    const energy = interpolatedSpectrumValue(spectrum, frequencyPosition);
    const nearby = (
      interpolatedSpectrumValue(spectrum, frequencyPosition - 1.7)
      + interpolatedSpectrumValue(spectrum, frequencyPosition + 1.7)
      + interpolatedSpectrumValue(spectrum, frequencyPosition - 4.2)
      + interpolatedSpectrumValue(spectrum, frequencyPosition + 4.2)
    ) / 4;
    const localContrast = (energy - nearby) * 0.9;
    const spectralDetail = softLimitPeak(Math.max(0, energy * 0.76 + localContrast), 0.56, 0.9);
    // Spectrum keeps Ambient's long, centre-weighted silhouette. Fine FFT
    // deviations ride on that body rather than replacing it, so peaks read as
    // upward motion and can never form a level ceiling across the canvas.
    const centreEnvelope = Math.pow(Math.sin(Math.PI * horizontal), 0.84);
    const bodyAmplitude = height * (0.045 + Math.pow(overallEnergy, 0.88) * 0.18) * centreEnvelope;
    const detailAmplitude = height * (0.014 + Math.pow(spectralDetail, 1.12) * 0.32) * centreEnvelope;
    return [horizontal * width, height - bodyAmplitude - detailAmplitude];
  });
}

function traceSpectrumContour(context, points, height, close = false) {
  context.beginPath();
  points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  if (close) {
    context.lineTo(points.at(-1)?.[0] || 0, height);
    context.lineTo(points[0]?.[0] || 0, height);
    context.closePath();
  }
}

function traceAmbientContour(context, points, height, close = false) {
  context.beginPath();
  if (!points.length) return;
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midpointX = (previous[0] + current[0]) / 2;
    const midpointY = (previous[1] + current[1]) / 2;
    if (typeof context.quadraticCurveTo === "function") {
      context.quadraticCurveTo(previous[0], previous[1], midpointX, midpointY);
    } else context.lineTo(midpointX, midpointY);
  }
  const last = points.at(-1);
  context.lineTo(last[0], last[1]);
  if (close) {
    context.lineTo(last[0], height);
    context.lineTo(points[0][0], height);
    context.closePath();
  }
}

function ambientSpectrumContour(spectrum, width, height) {
  const pointCount = 65;
  const lastBand = Math.max(0, spectrum.length - 1);
  return Array.from({ length: pointCount }, (_, index) => {
    const horizontal = index / (pointCount - 1);
    const bandPosition = horizontal * lastBand;
    const primary = interpolatedSpectrumValue(spectrum, bandPosition);
    const reflected = interpolatedSpectrumValue(spectrum, lastBand - bandPosition);
    const folded = interpolatedSpectrumValue(spectrum, (bandPosition * 1.61 + lastBand * 0.17) % Math.max(1, lastBand));
    const nearby = (
      interpolatedSpectrumValue(spectrum, bandPosition - 1.4)
      + interpolatedSpectrumValue(spectrum, bandPosition + 1.4)
    ) / 2;
    const localEnergy = primary * 0.78 + reflected * 0.07 + folded * 0.15;
    const localContrast = (primary - nearby) * 0.86;
    const localPeak = softLimitPeak(localEnergy + localContrast);
    const centreEnvelope = Math.pow(Math.sin(Math.PI * horizontal), 0.84);
    const amplitude = height * (0.035 + Math.pow(localPeak, 1.18) * 0.5) * centreEnvelope;
    return [horizontal * width, height - amplitude];
  });
}

function syncCanvasResolution(r, canvas, context) {
  const cached = r.$spectrumCanvasSize;
  const bounds = cached?.width > 0 && cached?.height > 0 ? cached : canvas.getBoundingClientRect?.();
  const cssWidth = Math.max(1, Number(bounds?.width) || Number(canvas.width) || 1);
  const cssHeight = Math.max(1, Number(bounds?.height) || Number(canvas.height) || 1);
  const pixelRatio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
  if (bounds?.width > 0 && bounds?.height > 0) {
    const targetWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
    const targetHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
  }
  context.setTransform?.(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { width: cssWidth, height: cssHeight };
}

function insetContour(points, topPadding) {
  return points.map(([x, y]) => [x, y + topPadding]);
}

function colourChannels(value, fallback) {
  const colour = String(value || "").trim();
  const shortHex = colour.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  if (shortHex) return shortHex.slice(1).map((channel) => Number.parseInt(`${channel}${channel}`, 16));
  const hex = colour.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (hex) return hex.slice(1).map((channel) => Number.parseInt(channel, 16));
  const rgb = colour.match(/^rgba?\(([^)]+)\)/i)?.[1]?.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return rgb?.length === 3 ? rgb : fallback;
}

function spectrumGradient(context, width, colours, phase, cycles = 2) {
  const gradient = context.createLinearGradient(0, 0, width, 0);
  for (let index = 0; index <= 32; index += 1) {
    const position = index / 32;
    gradient.addColorStop(position, flowingColour(colours, position, phase, cycles));
  }
  return {
    gradient,
    halo: flowingColour(colours, 0.5, phase + 0.34),
    history: flowingColour(colours, 0.22, phase - 0.26),
    ridge: flowingColour(colours, 0.68, phase + 0.18)
  };
}

function spectrumColours(r, now) {
  if (r.$spectrumColourCache && now - r.$spectrumColourCache.updatedAt < 500) {
    return r.$spectrumColourCache.colours;
  }
  const computed = getComputedStyle(r.$playerVisualizer);
  const colour = (name, fallback) => computed.getPropertyValue(name).trim() || fallback;
  const colours = [
    colourChannels(colour("--hub-visualizer-color-1", "#e94783"), [233, 71, 131]),
    colourChannels(colour("--hub-visualizer-color-2", "#ffc857"), [255, 200, 87]),
    colourChannels(colour("--hub-visualizer-color-3", "#43c6db"), [67, 198, 219])
  ];
  r.$spectrumColourCache = { colours, updatedAt: now };
  return colours;
}

function colourWithAlpha(colour, alpha) {
  const channels = String(colour).match(/[\d.]+/g)?.slice(0, 3) || [255, 255, 255];
  return `rgba(${channels.join(", ")}, ${Math.max(0, Math.min(1, alpha))})`;
}

function drawAmbientGlow(context, spectrum, width, height, colours, phase, intensity) {
  const points = ambientSpectrumContour(spectrum, width, height);
  const colourField = spectrumGradient(context, width, colours, phase);

  /* A broad, quiet FFT silhouette supplies the ambient body. It is followed
     by overlapping local colour cells so hue can climb within individual
     peaks instead of resolving as three horizontal bands or one vertical
     gradient. */
  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = visualizerLayerAlpha(0.52, 0.25, intensity);
  context.fillStyle = colourField.gradient;
  context.shadowBlur = 16;
  context.shadowColor = colourField.halo;
  traceAmbientContour(context, points, height, true);
  context.fill();
  context.restore();

  context.save();
  traceAmbientContour(context, points, height, true);
  context.clip();
  context.globalCompositeOperation = "lighter";
  const cellCount = 13;
  for (let index = 0; index < cellCount; index += 1) {
    const position = (index + 0.5) / cellCount;
    const point = points[Math.round(position * (points.length - 1))];
    const peakHeight = Math.max(4, height - point[1]);
    const centreX = point[0] + Math.sin(phase * 0.71 + index * 1.37) * width * 0.008;
    const centreY = height - peakHeight * (0.32 + (index % 3) * 0.08);
    const radius = Math.min(height * 0.52, Math.max(width / 30, peakHeight * 1.05));
    const localColour = flowingColour(colours, position + peakHeight / height * 0.08, phase + index * 0.09);
    const edgeColour = flowingColour(colours, position - 0.11, phase - index * 0.045);
    context.save();
    context.translate(centreX, centreY);
    context.scale(2.35, 1);
    const cell = context.createRadialGradient(0, 0, 0, 0, 0, radius);
    cell.addColorStop(0, colourWithAlpha(localColour, visualizerLayerAlpha(0.72, 0.36, intensity)));
    cell.addColorStop(0.46, colourWithAlpha(edgeColour, visualizerLayerAlpha(0.48, 0.23, intensity)));
    cell.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = cell;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }
  context.restore();

  const core = context.createLinearGradient(0, 0, width, 0);
  for (let index = 0; index <= 12; index += 1) {
    const position = index / 12;
    core.addColorStop(position, colourWithAlpha(flowingColour(colours, position, phase + 0.52), 0.72));
  }
  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = visualizerLayerAlpha(0.72, 0.38, intensity);
  context.fillStyle = core;
  context.shadowBlur = 9;
  context.shadowColor = colourField.ridge;
  traceAmbientContour(context, points.map(([x, y]) => [x, Math.min(height - 1, y + (height - y) * 0.62)]), height, true);
  context.fill();
  context.restore();
}

function drawSpectrumHistory(context, history, height, gradient, glowColour, intensity) {
  for (let index = history.length - 1; index >= 1; index -= 1) {
    const points = history[index];
    context.save();
    context.globalAlpha = visualizerLayerAlpha(0.22, 0.045 + (history.length - index) * 0.022, intensity);
    context.strokeStyle = gradient;
    context.lineWidth = 0.9 + index * 0.24;
    context.shadowBlur = 12;
    context.shadowColor = glowColour;
    traceSpectrumContour(context, points, height);
    context.stroke();
    context.restore();
  }
}

function drawLiveSpectrum(context, points, height, colourField, intensity) {
  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = visualizerLayerAlpha(0.34, 0.14, intensity);
  context.strokeStyle = colourField.gradient;
  context.lineWidth = 4.5;
  context.shadowBlur = 28;
  context.shadowColor = colourField.halo;
  traceSpectrumContour(context, points, height);
  context.stroke();
  context.restore();

  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = visualizerLayerAlpha(0.92, 0.72, intensity);
  context.strokeStyle = colourField.gradient;
  context.lineWidth = 1.55;
  context.shadowBlur = 6;
  context.shadowColor = colourField.ridge;
  traceSpectrumContour(context, points, height);
  context.stroke();
  context.restore();
}

function featherSpectrumEdges(context, width, height) {
  const edgeFade = context.createLinearGradient(0, 0, width, 0);
  edgeFade.addColorStop(0, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(0.01, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(0.14, "#000");
  edgeFade.addColorStop(0.86, "#000");
  edgeFade.addColorStop(0.99, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = edgeFade;
  context.fillRect(0, 0, width, height);
  context.restore();
}

export function drawSpectrumAnalyzer(r, spectrum, reactive, intensity = 1) {
  const canvas = r.$playerSpectrum;
  const context = canvas?.getContext?.("2d");
  if (!canvas || !context) return;
  const { width, height } = syncCanvasResolution(r, canvas, context);
  const renderStartedAt = performance.now();
  const colours = spectrumColours(r, renderStartedAt);
  if (reactive) {
    const now = renderStartedAt;
    const elapsed = Math.max(0, Math.min(160, now - (r.$spectrumColourUpdatedAt || now)));
    r.$spectrumColourPhase = ((r.$spectrumColourPhase || 0) + elapsed / 44000 * Math.PI * 2) % (Math.PI * 2);
    // Motion must not reset with the colour loop: independent particle speeds
    // and non-integer oscillations would otherwise jump every 44 seconds.
    r.$spectrumMotionTime = (r.$spectrumMotionTime || 0) + elapsed / 1000;
    r.$spectrumColourUpdatedAt = now;
  } else r.$spectrumColourUpdatedAt = 0;
  const phase = r.$spectrumColourPhase || 0;
  if (r.$playerVisualizer.dataset) {
    r.$playerVisualizer.dataset.colourFlow = "mixed";
    r.$playerVisualizer.dataset.colourPhase = phase.toFixed(4);
  }
  const bins = spectrum.length ? spectrum : new Array(64).fill(0);
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (r.$player?.dataset?.visualizer === "glow") {
    r.$spectrumHistory = null;
    drawAmbientGlow(context, bins, width, height, colours, phase, intensity);
    featherSpectrumEdges(context, width, height);
    return;
  }
  const colourField = spectrumGradient(context, width, colours, phase, r.$player?.dataset?.visualizer === "weave" ? 0.85 : 2);
  const topPadding = Math.min(10, height * 0.14);
  const contourHeight = Math.max(1, height - topPadding);
  const style = r.$player?.dataset?.visualizer;
  if (VISUALIZER_VARIANTS.includes(style)) {
    r.$spectrumHistory = null;
    const variantPoints = insetContour(spectrumAnalyzerContour(bins, width, contourHeight), topPadding);
    drawVisualizerVariant(context, style, variantPoints, width, height, r.$spectrumMotionTime || 0, intensity, colourField,
      (position) => flowingColour(colours, position, phase));
    featherSpectrumEdges(context, width, height);
    return;
  }
  const points = insetContour(spectrumAnalyzerContour(bins, width, contourHeight), topPadding);
  const geometry = `${width}|${height}`;
  if (!reactive || r.$spectrumHistoryGeometry !== geometry) r.$spectrumHistory = null;
  r.$spectrumHistoryGeometry = geometry;
  const history = r.$spectrumHistory ||= [];
  // Historical contours are immutable. Reuse their exact points instead of
  // recomputing the same 320-band shape for each trailing stroke every frame.
  history.unshift(points);
  history.length = Math.min(3, history.length);
  drawSpectrumHistory(context, history, height, colourField.gradient, colourField.history, intensity);
  drawLiveSpectrum(context, points, height, colourField, intensity);
  featherSpectrumEdges(context, width, height);
}
