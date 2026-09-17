import assert from "node:assert/strict";

let scheduledSample = null;
let scheduledDelay = 0;
let samplingNow = 0;
const messages = [];
const originalWindow = globalThis.window;
const originalChrome = globalThis.chrome;
const originalGetComputedStyle = globalThis.getComputedStyle;
const originalPerformance = globalThis.performance;

globalThis.window = {
  setTimeout(callback, delay) {
    scheduledSample = callback;
    scheduledDelay = delay;
    return 1;
  }
};
Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => samplingNow } });
globalThis.chrome = {
  runtime: {
    sendMessage(message) {
      messages.push(message);
      return Promise.resolve({ ok: true });
    }
  }
};

const { startVisualizerSignal } = await import(`../src/offscreen/visualizer.js?smoke=${Date.now()}`);
const sourceBins = new Uint8Array(512);
sourceBins[2] = 220;
sourceBins[10] = 170;
sourceBins[42] = 245;
sourceBins[160] = 135;
let reads = 0;
const analyser = {
  context: { sampleRate: 48000 },
  frequencyBinCount: sourceBins.length,
  getByteFrequencyData(target) {
    reads += 1;
    samplingNow += 2;
    target.set(sourceBins);
  }
};
const audio = { ended: false };

startVisualizerSignal({ analyser, audio, isPlaying: () => true });
assert.equal(reads, 1, "The analyzer should be sampled immediately");
assert.equal(messages.length, 1, "The first FFT profile should be broadcast immediately");
assert.equal(messages[0].signal.spectrum.length, 320, "The broadcast FFT profile should contain 320 logarithmic bands");
assert.ok(messages[0].signal.spectrum.some((value) => value > 0), "Audible frequency peaks should survive compression");
assert.ok(new Set(messages[0].signal.spectrum).size > 3, "The FFT profile should retain local spectral detail");

const firstProfile = [...messages[0].signal.spectrum];
assert.equal(scheduledDelay, 31, "Sampling cost must come out of the 33ms budget rather than accumulate as drift");
sourceBins.fill(0);
sourceBins[6] = 250;
sourceBins[95] = 230;
samplingNow += scheduledDelay;
scheduledSample();
assert.equal(reads, 2, "Every active animation sample should read the analyzer again");
assert.notDeepEqual(messages[1].signal.spectrum, firstProfile, "Changing frequency content should redraw a different spectrum");
assert.equal(scheduledDelay, 31, "The next deadline must retain the original sampling cadence");
samplingNow += 500;
scheduledSample();
assert.equal(scheduledDelay, 33, "After a stall skip obsolete samples instead of a zero-delay catch-up burst");

const { drawSpectrumAnalyzer } = await import(`../src/content/spectrum-renderer.js?smoke=${Date.now()}`);
let now = 1000;
const gradients = [];
const radialGradients = [];
let edgeMasks = 0;
let canvasTransform = null;
const context = {
  beginPath() {}, clearRect() {}, clip() {}, closePath() {}, fill() {}, fillRect() { edgeMasks += 1; }, lineTo() {}, moveTo() {}, quadraticCurveTo() {}, restore() {}, save() {}, scale() {}, stroke() {}, translate() {},
  setTransform(...values) { canvasTransform = values; },
  createLinearGradient() {
    const gradient = { stops: [], addColorStop(position, colour) { this.stops.push([position, colour]); } };
    gradients.push(gradient);
    return gradient;
  },
  createRadialGradient() {
    const gradient = { stops: [], addColorStop(position, colour) { this.stops.push([position, colour]); } };
    radialGradients.push(gradient);
    return gradient;
  }
};
globalThis.getComputedStyle = () => ({
  getPropertyValue(name) {
    return ({
      "--hub-visualizer-color-1": "#ff0000",
      "--hub-visualizer-color-2": "#00ff00",
      "--hub-visualizer-color-3": "#0000ff"
    })[name] || "";
  }
});
Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
const renderer = {
  $playerSpectrum: { width: 1200, height: 120, getBoundingClientRect: () => ({ width: 720, height: 72 }), getContext: () => context },
  $playerVisualizer: {},
  $player: { dataset: { visualizer: "spectrum" } }
};
const detailedSpectrum = Array.from({ length: 192 }, (_, index) => (Math.sin(index * 0.43) + 1) / 2);
drawSpectrumAnalyzer(renderer, detailedSpectrum, true, 1);
assert.deepEqual(canvasTransform, [1, 0, 0, 1, 0, 0], "Canvas coordinates should stay uniform at the current device density");
assert.equal(renderer.$playerSpectrum.width, 720, "Canvas pixels should follow the displayed width instead of stretching a fixed bitmap");
assert.equal(renderer.$playerSpectrum.height, 72, "Canvas pixels should follow the displayed height instead of compressing a fixed bitmap");
const firstColours = gradients.find((gradient) => gradient.stops.length === 33).stops.map(([, colour]) => colour);
const firstContour = renderer.$spectrumHistory[0];
assert.equal(firstColours.length, 33, "The flowing colour field should resolve the recurring patches and soft transitions");
assert.ok(new Set(firstColours).size > 8, "The flowing field should contain many distinct three-colour mixtures");
assert.ok(firstColours.every((colour) => /^rgb\(/.test(colour)), "Canvas stops should be computed colour mixtures");
const edgeFade = gradients.find((gradient) => gradient.stops.length === 6);
assert.deepEqual(edgeFade.stops.map(([position]) => position), [0, 0.01, 0.14, 0.86, 0.99, 1],
  "The rendered spectrum should fade to transparent before both canvas boundaries");
assert.equal(edgeMasks, 1, "The edge fade should be composited onto every rendered spectrum frame");
now += 160;
drawSpectrumAnalyzer(renderer, detailedSpectrum, true, 1);
assert.equal(renderer.$spectrumHistory[1], firstContour, "Trailing strokes must reuse the exact previous contour rather than re-run FFT shaping");
const secondColours = gradients.filter((gradient) => gradient.stops.length === 33).at(-1).stops.map(([, colour]) => colour);
assert.notDeepEqual(secondColours, firstColours, "The mixed colour field should drift between live frames");
assert.equal(edgeMasks, 2, "The edge fade should be refreshed as the live spectrum redraws");

renderer.$player.dataset.visualizer = "glow";
now += 160;
drawSpectrumAnalyzer(renderer, detailedSpectrum, true, 1.4);
assert.equal(radialGradients.length, 13, "Ambient glow should build a lightweight set of overlapping colour cells across the FFT contour");
assert.ok(radialGradients.every((gradient) => gradient.stops.length === 3),
  "Each ambient colour cell should have a bright core, coloured falloff and transparent edge");
assert.ok(new Set(radialGradients.map((gradient) => gradient.stops[0][1])).size > 8,
  "Ambient peaks should carry many locally mixed colours instead of three fixed colour zones");
assert.equal(edgeMasks, 16, "Ambient cells and the final edge feather should be painted on every glow frame");

// All alternatives use the same canvas and bounded FFT silhouette, not
// their own layout or animation loop. Record actual draw coordinates as well
// as dispatch to catch accidentally static styles and invalid silent frames.
const { MUSIC_BAR_VISUALIZER_TYPES, normalizeVisualizerType } = await import("../src/content/state.js");
assert.ok(!MUSIC_BAR_VISUALIZER_TYPES.includes("rorschach"), "Removed Rorschach is not offered");
assert.equal(new Set(MUSIC_BAR_VISUALIZER_TYPES).size, MUSIC_BAR_VISUALIZER_TYPES.length, "Each visualizer must appear only once");
assert.equal(normalizeVisualizerType("filaments"), "grass");
assert.equal(normalizeVisualizerType("ribbons"), "contours");
assert.equal(normalizeVisualizerType(undefined, "ribbons"), "contours");
assert.equal(normalizeVisualizerType(undefined, "spectrum"), "spectrum");
assert.equal(normalizeVisualizerType("unknown"), "glow");
for (const [oldStyle, newStyle] of [["bars", "firefly"], ["ripples", "scanlines"], ["prism", "cross-stitch"], ["vortex", "scanlines"], ["lightning", "cross-stitch"], ["ink", "embers"], ["orbitals", "warp"], ["jellyfish", "dna"], ["springs", "pixels"], ["kaleidoscope", "glitch"], ["bubbles", "contours"], ["shards", "matrix"], ["ferrofluid", "embers"], ["tendrils", "grass"], ["circuit", "matrix"], ["eclipse", "contours"], ["dominoes", "pixels"], ["aurora", "fog"], ["comets", "warp"]]) {
  assert.equal(normalizeVisualizerType(oldStyle), newStyle);
  assert.equal(normalizeVisualizerType(undefined, oldStyle), newStyle);
  assert.ok(!MUSIC_BAR_VISUALIZER_TYPES.includes(oldStyle));
}
let coordinates = [];
let dots = [];
let strokeCount = 0;
let fillCount = 0;
context.moveTo = context.lineTo = (...values) => coordinates.push(values);
context.quadraticCurveTo = (...values) => coordinates.push(values);
context.bezierCurveTo = (...values) => coordinates.push(values);
context.rect = (x, y, width, height) => coordinates.push([x, y, x + width, y + height]);
context.arc = (x, y, radius) => { coordinates.push([x, y]); dots.push({ x, y, radius }); };
context.ellipse = (x, y, radiusX, radiusY) => coordinates.push([x - radiusX, y, x, y - radiusY]);
context.stroke = () => { strokeCount += 1; };
context.fill = () => { fillCount += 1; };
for (const style of MUSIC_BAR_VISUALIZER_TYPES.slice(2)) {
  assert.ok(MUSIC_BAR_VISUALIZER_TYPES.includes(style), `${style} must survive settings persistence`);
  renderer.$player.dataset.visualizer = style;
  coordinates = [];
  strokeCount = fillCount = 0;
  const beforeMask = edgeMasks;
  drawSpectrumAnalyzer(renderer, detailedSpectrum, false, 1);
  const firstDrawing = coordinates;
  assert.ok(firstDrawing.length > 30, `${style} should retain detailed geometry`);
  assert.ok(firstDrawing.every((values) => values.every(Number.isFinite)), `${style} coordinates must stay finite`);
  assert.ok(firstDrawing.every((values) => values.filter((_, index) => index % 2).every((y) => y >= 10 && y <= 72)),
    `${style} must leave headroom and stay below the existing height envelope`);
  assert.ok(strokeCount <= 8 && fillCount <= 8, `${style} must have bounded drawing passes`);
  assert.equal(edgeMasks, beforeMask + 1, `${style} must inherit the same tapered edge mask`);
  assert.equal(renderer.$spectrumHistory, null, `${style} must not leave old spectrum trails`);
  coordinates = [];
  drawSpectrumAnalyzer(renderer, detailedSpectrum.map((value) => value * 0.25), false, 1);
  assert.notDeepEqual(coordinates, firstDrawing, `${style} must respond to real frequency changes`);
  for (const bins of [[], new Array(320).fill(0), new Array(320).fill(1)]) {
    coordinates = [];
    drawSpectrumAnalyzer(renderer, bins, false, 2);
    assert.ok(coordinates.every((values) => values.every(Number.isFinite)), `${style} must handle silence and full scale`);
  }
  assert.equal(renderer.$playerSpectrum.width, 720);
  assert.equal(renderer.$playerSpectrum.height, 72);
}

renderer.$player.dataset.visualizer = "pixels";
coordinates = [];
drawSpectrumAnalyzer(renderer, new Array(320).fill(1), false, 1);
const squares = coordinates.filter(values => values.length === 4);
assert.ok(squares.length > 1000, "Pixels should resolve much finer horizontal and vertical detail");
assert.ok(squares.every(([x, y, right, bottom]) => right - x === 2 && bottom - y === 2));
assert.ok(new Set(squares.map(values => values[1])).size >= 8, "Pixels should have substantially more than three rows");

renderer.$player.dataset.visualizer = "firefly";
let previousFlies = null;
for (let time = 0; time < 2; time += 1 / 60) {
  dots = [];
  renderer.$spectrumMotionTime = time;
  drawSpectrumAnalyzer(renderer, detailedSpectrum, false, 1);
  assert.equal(dots.length, 280, "Firefly should have a bounded dense swarm");
  assert.ok(dots.filter(dot => dot.radius > 0.2 && dot.y < 65).length > 70, "Independent twinkles must never wipe out the whole swarm");
  if (previousFlies) {
    assert.ok(dots.some((dot, index) => Math.abs(dot.y - previousFlies[index].y) > 0.01), "The swarm must wander");
    assert.ok(dots.every((dot, index) => Math.abs(dot.y - previousFlies[index].y) < 3), "Firefly movement should be continuous, not frame-random jitter");
  }
  previousFlies = dots;
}
renderer.$player.dataset.visualizer = "embers";
let previousDots = null;
let fireSurfaces = 0;
let fireCopies = 0;
let fireTransform = null;
let fireFilter = null;
const originalOffscreenCanvas = globalThis.OffscreenCanvas;
globalThis.OffscreenCanvas = class {
  constructor(width, height) { this.width = width; this.height = height; fireSurfaces += 1; }
  getContext() { return {
    setTransform(...values) { fireTransform = values; }, clearRect() {}, save() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    set filter(value) { fireFilter = value; }
  }; }
};
context.drawImage = () => { fireCopies += 1; };
drawSpectrumAnalyzer(renderer, detailedSpectrum, false, 1);
drawSpectrumAnalyzer(renderer, detailedSpectrum, false, 1);
assert.equal(fireSurfaces, 1, "Embers should reuse its small blur surface");
assert.equal(fireCopies, 2);
assert.equal(fireTransform[3], 0.25, "Fire blur should expand vertically fourfold without horizontal smearing");
assert.equal(fireFilter, "blur(2.5px)");
globalThis.OffscreenCanvas = originalOffscreenCanvas;
// Cover two old colour-loop boundaries. No particle disappears or respawns,
// and a useful central population stays clear of the below-screen baseline.
for (let time = 0; time <= 89; time += 0.1) {
  dots = [];
  coordinates = [];
  renderer.$spectrumMotionTime = time;
  drawSpectrumAnalyzer(renderer, detailedSpectrum, false, 1);
  assert.equal(dots.length, 120, "Embers should have a denser but bounded population");
  const central = dots.filter(({ x }) => x > 720 * 0.2 && x < 720 * 0.8);
  assert.ok(central.filter(({ radius }) => radius > 0.3).length >= 25,
    "Independently fading sparks must never disappear together");
  if (previousDots) dots.forEach((dot, index) => {
    if (dot.y > previousDots[index].y) {
      assert.ok(dot.radius < 0.5 && previousDots[index].radius < 0.5, "Sparks may only reset at their invisible birth/death seam");
    } else assert.ok(previousDots[index].y - dot.y < 4, "Sparks should rise continuously from their spectral peak");
  });
  previousDots = dots;
}
renderer.$spectrumColourPhase = Math.PI * 2 - 0.001;
renderer.$spectrumColourUpdatedAt = now;
renderer.$spectrumMotionTime = 44;
now += 160;
drawSpectrumAnalyzer(renderer, detailedSpectrum, true, 1);
assert.ok(renderer.$spectrumMotionTime > 44, "Particle motion must not reset with the colour phase");
const pausedTime = renderer.$spectrumMotionTime;
now += 160;
drawSpectrumAnalyzer(renderer, detailedSpectrum, false, 1);
assert.equal(renderer.$spectrumMotionTime, pausedTime, "Paused/reduced-motion frames must freeze the new motion");

globalThis.window = originalWindow;
globalThis.chrome = originalChrome;
globalThis.getComputedStyle = originalGetComputedStyle;
Object.defineProperty(globalThis, "performance", { configurable: true, value: originalPerformance });

console.log("Visualizer spectrum smoke test passed.");
