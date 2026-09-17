import { sanitizeHandleSvg } from "./custom-scrub-handle.js";
import { pngDimensions } from "./png-scrub-handle.js";

export const TIMELINE_ARTWORK_HELP = "Artwork stretches to fill the timeline; proportions vary with the player and screen width. Recommended PNG canvases: Small 640 × 48, Medium 1280 × 48, Large 2560 × 48 pixels (2× resolution). Use a wide horizontal design, keep artwork within the canvas, and use transparency for an unboxed shape. SVG scales most cleanly.";

export function normalizeCustomTimeline(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name || "Custom timeline").slice(0, 120);
  try {
    if (typeof value.svg === "string") {
      const svg = sanitizeHandleSvg(value.svg);
      const box = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
      if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
      svg.setAttribute("preserveAspectRatio", "none");
      return { name, svg: new window.XMLSerializer().serializeToString(svg) };
    }
    if (typeof value.png === "string" && value.png.length <= 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.png)) {
      const header = Uint8Array.from(globalThis.atob(value.png.slice(22, 54)), c => c.charCodeAt(0));
      const { width, height } = pngDimensions(header);
      if (width <= 2560 && height <= 96) return { name, png: value.png };
    }
  } catch { /* Invalid imports must not affect other settings. */ }
  return null;
}

export async function importCustomTimeline(file) {
  if (/\.svg$/i.test(file.name)) {
    if (file.size > 128 * 1024) throw new Error("Choose an SVG smaller than 128 KB.");
    const svg = sanitizeHandleSvg(await file.text());
    if (!svg.hasAttribute("viewBox")) {
      const original = new DOMParser().parseFromString(await file.text(), "image/svg+xml").documentElement;
      const width = parseFloat(original.getAttribute("width")), height = parseFloat(original.getAttribute("height"));
      if (!(width > 0 && height > 0)) throw new Error("Give the SVG a viewBox or width and height.");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
    const box = svg.getAttribute("viewBox").trim().split(/[\s,]+/).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error("The SVG needs a valid viewBox.");
    return normalizeCustomTimeline({ name: file.name, svg: new window.XMLSerializer().serializeToString(svg) });
  }
  if (!/\.png$/i.test(file.name) || file.size > 4 * 1024 * 1024) throw new Error("Choose an SVG (up to 128 KB) or PNG (up to 4 MB).");
  pngDimensions(new Uint8Array(await file.slice(0, 24).arrayBuffer()));
  const bitmap = await window.createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2560; canvas.height = 48;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (!context.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v)) throw new Error("The PNG is fully transparent.");
    const result = normalizeCustomTimeline({ name: file.name, png: canvas.toDataURL("image/png") });
    if (!result) throw new Error("The image is too complex to save. Try a simpler PNG.");
    return result;
  } finally { bitmap.close(); }
}

let nextId = 0;
const cache = new WeakMap();
export function applyCustomTimeline(svg, custom, retainColors, width) {
  const previous = cache.get(svg);
  if (previous?.custom === custom && previous.retainColors === retainColors && previous.width === width) return true;
  const safe = normalizeCustomTimeline(custom);
  if (!safe) return false;
  svg.querySelector("defs[data-custom-timeline]")?.remove();
  const ns = "http://www.w3.org/2000/svg", id = `bandkit-timeline-${++nextId}`;
  const defs = document.createElementNS(ns, "defs");
  defs.setAttribute("data-custom-timeline", "");
  const paint = document.createElementNS(ns, retainColors ? "pattern" : "mask");
  paint.id = id;
  paint.setAttribute(retainColors ? "patternUnits" : "maskUnits", "userSpaceOnUse");
  for (const [key, value] of Object.entries({ x: 0, y: 0, width, height: 24 })) paint.setAttribute(key, value);
  if (!retainColors) paint.style.maskType = "alpha";
  const image = document.createElementNS(ns, "image");
  image.setAttribute("href", safe.png || `data:image/svg+xml,${encodeURIComponent(safe.svg)}`);
  image.setAttribute("width", width); image.setAttribute("height", "24");
  image.setAttribute("preserveAspectRatio", "none");
  paint.append(image); defs.append(paint); svg.append(defs);
  svg.setAttribute("viewBox", `0 0 ${width} 24`);
  const paths = svg.querySelectorAll("path");
  paths.forEach((path, index) => {
    path.setAttribute("d", `M0 12H${width}`);
    path.style.strokeWidth = "24"; path.style.strokeLinecap = "butt";
    path.style.stroke = retainColors ? `url(#${id})` : "";
    path.style.opacity = retainColors && paths.length > 1 && index === 0 ? "0.4" : "";
    if (retainColors) path.removeAttribute("mask");
    else path.setAttribute("mask", `url(#${id})`);
  });
  cache.set(svg, { custom, retainColors, width });
  return true;
}

export function clearCustomTimeline(svg) {
  if (!cache.has(svg)) return;
  svg.querySelector("defs[data-custom-timeline]")?.remove();
  svg.querySelectorAll("path").forEach(path => {
    path.removeAttribute("mask"); path.style.stroke = ""; path.style.opacity = "";
  });
  cache.delete(svg);
}
