import { asset, removeStyleProperty, setStyleProperty } from "./core.js";
import { scrubberHandleIconName } from "./state.js";
import { importPngHandle, normalizePngHandle } from "./png-scrub-handle.js";

const MAX_SVG_BYTES = 128 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const ATTRIBUTES = new Set(["d", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "rx", "ry", "cx", "cy", "r", "points", "transform", "fill", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit"]);

// Rebuild an inert geometry-only SVG. Never insert uploaded markup, scripts,
// event handlers, images, links, foreignObject, CSS, or external references.
export function sanitizeHandleSvg(source) {
  if (typeof source !== "string" || source.length > MAX_SVG_BYTES || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Use an SVG smaller than 128 KB without external references.");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") throw new Error("That file is not a valid SVG.");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  const viewBox = parsed.documentElement.getAttribute("viewBox");
  if (viewBox && /^[-+\d.eE,\s]+$/.test(viewBox)) svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", "100");
  svg.setAttribute("height", "100");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  let shapes = 0;
  let nodes = 0;
  const copy = (input, parent) => {
    if (++nodes > 2048) throw new Error("This SVG is too complex. Please simplify it first.");
    const tag = input.localName;
    if (tag !== "svg" && tag !== "g" && !SHAPES.has(tag)) return;
    const output = document.createElementNS(SVG_NS, tag === "svg" ? "g" : tag);
    const properties = new Map([...input.attributes].map((attribute) => [attribute.name, attribute.value]));
    for (const declaration of (input.getAttribute("style") || "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0) properties.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
    for (const [name, value] of properties) {
      if (!ATTRIBUTES.has(name)) continue;
      if (name === "fill" || name === "stroke") {
        // Keep inert color values for optional original-color rendering. Paint
        // servers, external URLs and CSS expressions are deliberately excluded.
        if (/^(?:[a-z]+|#[\da-f]{3,8}|(?:rgba?|hsla?)\([\d.%+,\s/-]+\))$/i.test(value.trim())) output.setAttribute(name, value.trim());
      }
      else if (!/[<>]|url\s*\(|javascript:|var\s*\(/i.test(value)) output.setAttribute(name, value);
    }
    if (SHAPES.has(tag)) shapes++;
    parent.append(output);
    for (const child of input.children) copy(child, output);
  };
  copy(parsed.documentElement, svg);
  if (!shapes) throw new Error("Use an SVG containing vector paths or shapes, not an embedded image.");
  return svg;
}

export function normalizeCustomHandle(value) {
  if (value?.png) return normalizePngHandle(value);
  if (!value || typeof value.svg !== "string") return null;
  try {
    return { name: String(value.name || "Custom.svg").slice(0, 120), svg: new window.XMLSerializer().serializeToString(sanitizeHandleSvg(value.svg)) };
  } catch { return null; }
}

export async function importCustomHandle(file) {
  if (file && /\.png$/i.test(file.name)) return importPngHandle(file);
  if (!file || !/\.svg$/i.test(file.name) || file.size > MAX_SVG_BYTES) throw new Error("Choose an SVG smaller than 128 KB or a PNG smaller than 4 MB.");
  const svg = sanitizeHandleSvg(await file.text());
  const measurement = document.createElement("div");
  measurement.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:100px;height:100px";
  measurement.append(svg);
  document.body.append(measurement);
  try {
    const box = svg.getBBox();
    const extent = Math.max(box.width, box.height);
    if (!Number.isFinite(extent) || extent <= 0 || extent > 1e7) throw new Error("The SVG has no usable visible shape.");
    // Trim excess canvas, keep the aspect ratio, and leave space for strokes.
    const padding = extent * 0.08;
    svg.setAttribute("viewBox", `${box.x - padding} ${box.y - padding} ${box.width + padding * 2} ${box.height + padding * 2}`);
    return { name: file.name.slice(0, 120), svg: new window.XMLSerializer().serializeToString(svg) };
  } finally { measurement.remove(); }
}

let cachedSource = null;
let cachedMask = null;

export function setHandleImageStyles(style, prefix, shape, custom, retainSvgColors = false, retainPngColors = true) {
  const png = shape === "custom" ? normalizePngHandle(custom)?.png : null;
  const image = png ? retainPngColors ? `url("${png}")` : null : shape === "custom" && custom?.svg && retainSvgColors ? scrubberHandleMask(shape, false, custom) : null;
  if (image) setStyleProperty(style, `${prefix}-fill`, `${image} center / contain no-repeat`);
  // A var() written here would resolve against the host's accent, so the theme
  // fill is left to the handle rule where the player's own accent is in scope.
  else removeStyleProperty(style, `${prefix}-fill`);
  setStyleProperty(style, `${prefix}-fill-mask`, image ? "none" : `var(${prefix}-mask)`);
}

export function scrubberHandleMask(shape, rounded, custom) {
  const source = custom?.png || custom?.svg;
  if (shape === "custom" && source) {
    if (cachedSource !== source) {
      cachedSource = source;
      const safe = normalizeCustomHandle(custom);
      cachedMask = safe ? safe.png ? `url("${safe.png}")` : `url("data:image/svg+xml,${encodeURIComponent(safe.svg)}")` : null;
    }
    if (cachedMask) return cachedMask;
  }
  return `url("${asset(scrubberHandleIconName(shape, rounded))}")`;
}
