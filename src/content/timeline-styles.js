import { waveformAmplitudes, waveformPathData } from "./waveform.js";
import { applyCustomTimeline, clearCustomTimeline } from "./custom-timeline.js";

export const TIMELINE_STYLES = Object.freeze([
  ["traditional", "Classic"], ["waveform", "Waveform"],
  ["dots", "Dots"], ["dashes", "Dashes"], ["ticks", "Ruler"],
  ["steps", "Steps"], ["skyline", "Stitches"], ["peaks", "Squiggle"],
  ["ribbon", "Pixels"], ["pulse", "Pulse"], ["sine", "Sine"],
  ["weave", "Weave"], ["beads", "Beads"], ["circuit", "Circuit"],
  ["diamonds", "Capsules"]
].map(([value, label]) => Object.freeze({ value, label })));

export function normalizeTimelineStyle(value) {
  if (value === "custom") return "custom";
  return TIMELINE_STYLES.some((style) => style.value === value) ? value : "waveform";
}

// All styles use the same 24px lane and progress clipping. Geometry is stable
// for each track: these decorative timelines never animate or imply live audio.
export function timelinePathData(signature, width, selected = "waveform") {
  const style = normalizeTimelineStyle(selected);
  const pixelWidth = Math.max(80, Math.min(8192, Math.round(Number(width) || 320)));
  if (style === "waveform") return { ...waveformPathData(signature, pixelWidth), strokeWidth: 2.4, linecap: "round" };
  const spacing = { dots: 8, dashes: 12, ticks: 6, steps: 14, skyline: 10, peaks: 48, ribbon: 8, pulse: 48, sine: 32, weave: 40, beads: 14, circuit: 30, diamonds: 16 }[style] || 16;
  const count = Math.max(4, Math.floor((pixelWidth - 6) / spacing));
  const step = (pixelWidth - 6) / count;
  const energy = waveformAmplitudes(signature, count);
  const f = (n) => Number(n.toFixed(2));
  const point = (x, y) => `${f(x)} ${f(y)}`;
  const paths = [];
  const move = (x, y) => `M${point(x, y)}`;
  const line = (x, y) => `L${point(x, y)}`;
  const circle = (x, y, radius) => `${move(x - radius, y)}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  if (style === "traditional") paths.push(`${move(3, 12)}H${pixelWidth - 3}`);
  for (let i = 0; i < count && style !== "traditional"; i++) {
    const x = 3 + i * step, end = x + step, center = x + step / 2;
    const h = Math.min(9, Math.max(2, energy[i] / 2));
    switch (style) {
      case "dots": paths.push(`${move(center, 12)}h0.01`); break;
      case "dashes": paths.push(`${move(x + 2, 12)}H${f(end - 2)}`); break;
      case "ticks": {
        const size = i % 5 === 0 ? 7 : i % 5 === 2 ? 4 : 2;
        paths.push(`${move(center, 12 - size)}V${12 + size}`); break;
      }
      case "steps": {
        const y = 20 - Math.round(h / 2) * 3;
        const next = 20 - Math.round(Math.min(9, Math.max(2, energy[(i + 1) % count] / 2)) / 2) * 3;
        paths.push(`${move(x, y)}H${f(end)}V${next}`); break;
      }
      // Keep the stored IDs stable when replacing a design, so saved settings
      // and backups continue selecting the corresponding menu slot.
      case "skyline": {
        const tilt = i % 2 === 0 ? 5 : -5;
        paths.push(`${move(x + 2, 12 - tilt)}${line(end - 2, 12 + tilt)}`); break;
      }
      case "peaks": {
        // One long, gentle sine period per step. Each half period is a cubic
        // whose equal control points sit at 4/3 of the amplitude, so the curve
        // crests at exactly `wave` and stays soft rather than peaked.
        const half = step / 2, wave = 5, control = wave * 4 / 3;
        paths.push(`${i === 0 ? move(x, 12) : ""}`
          + `C${point(x + half / 3, 12 - control)} ${point(x + half * 2 / 3, 12 - control)} ${point(center, 12)}`
          + `C${point(center + half / 3, 12 + control)} ${point(center + half * 2 / 3, 12 + control)} ${point(end, 12)}`);
        break;
      }
      case "ribbon": {
        const rows = 1 + i % 3;
        for (let row = 1 - rows; row < rows; row++) {
          const y = 12 + row * 4;
          paths.push(`${move(center - 1, y)}h2`);
        }
        break;
      }
      case "pulse": paths.push(`${move(x, 12)}H${f(x + step * .3)}${line(x + step * .43, 12 - h)}${line(x + step * .57, 12 + h)}${line(x + step * .7, 12)}H${f(end)}`); break;
      case "sine": paths.push(`${move(x, 12)}C${point(x + step * .25, 1)} ${point(x + step * .25, 1)} ${point(center, 12)}S${point(x + step * .75, 23)} ${point(end, 12)}`); break;
      case "weave":
        for (const side of [-1, 1]) paths.push(`${move(x, 12)}Q${point(x + step * .25, 12 + side * 13)} ${point(center, 12)}T${point(end, 12)}`);
        break;
      case "beads": {
        const radius = i % 4 === 0 ? 4 : 2;
        paths.push(`${move(x, 12)}H${f(center - radius)}${circle(center, 12, radius)}${move(center + radius, 12)}H${f(end)}`); break;
      }
      case "circuit": {
        const y = i % 2 === 0 ? 6 : 18;
        paths.push(`${move(x, 12)}H${f(x + step * .2)}${line(x + step * .4, y)}H${f(x + step * .6)}${line(x + step * .8, 12)}H${f(end)}`); break;
      }
      case "diamonds": {
        paths.push(`${move(x + 5, 9)}H${f(end - 5)}a3 3 0 0 1 0 6H${f(x + 5)}a3 3 0 0 1 0 -6Z`); break;
      }
    }
  }
  return { pathData: paths.join(""), pixelWidth, strokeWidth: style === "dots" ? 3.5 : style === "traditional" ? 4 : style === "dashes" ? 3 : style === "ribbon" ? 2 : 1.6, linecap: style === "ribbon" ? "square" : "round" };
}

export function applyTimelinePath(svg, signature, width, style, custom = null, retainColors = true) {
  if (style === "custom" && applyCustomTimeline(svg, custom, retainColors, Math.max(80, Math.round(width || 320)))) return { pixelWidth: Math.max(80, Math.round(width || 320)) };
  clearCustomTimeline(svg);
  if (style === "custom") style = "waveform";
  const geometry = timelinePathData(signature, width, style);
  svg.setAttribute("viewBox", `0 0 ${geometry.pixelWidth} 24`);
  for (const path of svg.querySelectorAll("path")) {
    path.setAttribute("d", geometry.pathData);
    path.style.strokeWidth = String(geometry.strokeWidth);
    path.style.strokeLinecap = geometry.linecap;
    path.style.strokeLinejoin = "round";
  }
  return geometry;
}

export function createTimelinePreview(style) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "76"); svg.setAttribute("height", "24");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor");
  svg.append(path);
  applyTimelinePath(svg, "Bandkit timeline preview", 100, style);
  // A tiny track-derived sample can be flat after energy quantization. Use a
  // representative staircase for the menu, not a random quiet section.
  if (style === "steps") path.setAttribute("d", "M3 18H20V9H39V15H58V5H77V12H97");
  return svg;
}
