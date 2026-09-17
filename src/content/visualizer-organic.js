import { visualizerLayerAlpha } from "./visualizer-intensity.js";

function mist(c, width, height, time, intensity, amplitudeAt) {
  c.shadowBlur = 0;
  c.filter = "blur(5px)";
  for (let layer = 0; layer < 5; layer++) {
    c.beginPath(); c.moveTo(0, height);
    for (let index = 0; index <= 120; index++) {
      const p = index / 120;
      // Both scales advect together; deeper layers roll past at different speeds.
      const drift = p - time * (0.045 + layer * 0.008);
      const broad = Math.sin(drift * 17 + layer * 0.9);
      const curl = Math.sin(drift * 31 + broad * 2 + layer * 1.3);
      const lift = amplitudeAt(p) * (0.48 + broad * 0.2 + curl * 0.16) * (0.45 + layer * 0.11);
      c.lineTo(p * width, height - lift);
    }
    c.lineTo(width, height); c.closePath();
    c.globalAlpha = visualizerLayerAlpha(0.5, 0.13, intensity); c.fill();
  }
}

export function drawOrganicVisualizer(c, style, width, height, time, intensity, amplitudeAt) {
  if (style === "fog") mist(c, width, height, time, intensity, amplitudeAt);
}
