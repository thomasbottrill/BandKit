// A surface nested inside the fixed player blends only with that player's
// stacking context. Paint directly over the page instead; retain the existing
// CSS geometry as the source of truth for sizing, corners and Fade's contour.
import { syncVisualizerSurface } from "./visualizer-surface.js";
import { paperFadeMask } from "../paper-surface.js";

const PAINT_PROPERTIES = [
  "background-color", "border", "border-radius", "filter", "opacity",
  "width", "height", "top", "right", "bottom", "left", "transform"
];

function setStyle(element, property, value) {
  if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
}

function createSurface(r) {
  const host = document.createElement("div");
  host.id = "bandkit-player-surface";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "all:initial;display:contents;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { pointer-events: none; }
    .surface { box-sizing: border-box; position: fixed; pointer-events: none;
      z-index: 2147483645; }
    .surface[hidden], .layer[hidden] { display: none; }
    .layer { box-sizing: border-box; position: absolute; pointer-events: none; }
    /* Large, low-contrast CSS blurs expose the browser's 8-bit alpha steps on
       dark pages. A single neutral-noise pass breaks up those steps without
       changing the plume geometry, opacity curve or blur radius. */
    .blend-surface[data-fade="true"]::after {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' seed='17' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E");
      background-repeat: repeat;
      background-size: 96px 96px;
      content: "";
      inset: -96px -112px -72px;
      -webkit-mask-image: radial-gradient(ellipse 72% 105% at 50% 100%, #000 0%, #000 35%, rgb(0 0 0 / 70%) 62%, transparent 100%);
      mask-image: radial-gradient(ellipse 72% 105% at 50% 100%, #000 0%, #000 35%, rgb(0 0 0 / 70%) 62%, transparent 100%);
      mix-blend-mode: soft-light;
      opacity: 0.055;
      pointer-events: none;
      position: absolute;
    }
    .blend-surface[data-paper="true"][data-fade="false"] {
      background-image: var(--paper-texture);
      background-blend-mode: soft-light;
      background-size: 192px 192px, calc(var(--paper-grain-size, 160px) * 2.4) calc(var(--paper-grain-size, 160px) * 2.4);
    }
    .blend-surface[data-paper="true"][data-fade="true"]::after {
      /* Texture belongs to the paper colour, not the page underneath its
         transparent edge. Composite the material first, then feather once. */
      background-color: var(--paper-fade-color);
      background-image: var(--paper-texture);
      background-blend-mode: soft-light;
      mix-blend-mode: normal;
      background-size: 192px 192px, calc(var(--paper-grain-size, 160px) * 2.4) calc(var(--paper-grain-size, 160px) * 2.4);
      opacity: 1;
      inset: -192px;
      -webkit-mask-image: var(--paper-fade-mask);
      mask-image: var(--paper-fade-mask);
      mask-size: 100% 100%;
      mask-repeat: no-repeat;
    }
  `;
  const surface = document.createElement("div");
  surface.className = "surface blend-surface";
  const layers = ["before", "after"].map((name) => {
    const layer = document.createElement("div");
    layer.className = `layer ${name}`;
    return layer;
  });
  surface.append(...layers);
  const fillBase = surface.cloneNode(true);
  fillBase.className = "surface fill-base";
  shadow.append(style, fillBase, surface);
  r.$playerFillBase = fillBase;
  document.body.append(host);
  r.$playerSurfaceHost = host;
  r.$playerSurface = surface;
  r.$playerSurfaceLayers = layers;
  r.$player.dataset.detachedSurface = "true";
  for (const event of ["pointerenter", "pointerleave", "focusin", "focusout", "transitionrun"]) {
    r.$player.addEventListener(event, () => syncPlayerSurface(r, true));
  }
  r.$playerSurfaceObserver = new ResizeObserver(() => syncPlayerSurface(r));
  r.$playerSurfaceObserver.observe(r.$player);
  r.$playerSurfaceObserver.observe(r.$player.querySelector(".hub-player-backdrop-glow"));
}

function paintSurface(r) {
  if (!r.$playerSurface || !r.$player.isConnected) return;
  if (r.$visualizerFullscreen) {
    if (r.$playerSurfaceHost.parentNode !== r.$fullscreenVisualizerStage) r.$fullscreenVisualizerStage.append(r.$playerSurfaceHost);
    r.$playerSurface.hidden = true;
    r.$playerFillBase.hidden = true;
    syncVisualizerSurface(r);
    return;
  }
  const playerStyle = getComputedStyle(r.$player);
  const dock = r.$player.dataset.playerStyle === "docked";
  const fade = !dock && r.$player.dataset.playerVariant !== "rounded";
  const source = dock ? r.$player : r.$player.querySelector(".hub-player-backdrop-glow");
  const rect = source.getBoundingClientRect();
  const surface = r.$playerSurface;
  surface.hidden = !rect.width || !rect.height || playerStyle.display === "none";
  if (surface.hidden) { r.$playerFillBase.hidden = true; return; }
  const blendMode = playerStyle.getPropertyValue("--hub-player-blend-mode").trim() || "normal";
  for (const [property, value] of Object.entries({
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    "mix-blend-mode": blendMode
  })) setStyle(surface, property, value);
  surface.dataset.fade = fade ? "true" : "false";
  surface.dataset.paper = String(r.$player.classList.contains("is-paper"));
  setStyle(surface, "--paper-texture", playerStyle.getPropertyValue("--hub-paper-texture").trim() || "none");
  setStyle(surface, "--paper-grain-size", playerStyle.getPropertyValue("--hub-paper-grain-size").trim() || "160px");
  const before = getComputedStyle(source, "::before");
  const after = fade ? getComputedStyle(source, "::after") : null;
  const paperFade = fade && surface.dataset.paper === "true";
  setStyle(surface, "--paper-fade-color", before.backgroundColor);
  if (fade && surface.dataset.paper === "true") {
    const paints = [before, after].map(paint => Object.fromEntries(["width", "height", "bottom", "filter", "opacity"].map(key => [key, paint.getPropertyValue(key)])));
    const key = JSON.stringify([rect.width, rect.height, paints]);
    if (r.$paperFadeMaskKey !== key) {
      r.$paperFadeMaskKey = key;
      setStyle(surface, "--paper-fade-mask", paperFadeMask(rect.width, rect.height, paints));
    }
  }
  // Glass is applied at the page-facing layer, not beneath a blending ancestor.
  // Fade deliberately remains the opaque, progressively feathered treatment.
  setStyle(surface, "backdrop-filter", fade ? "none" : before.backdropFilter);
  setStyle(surface, "-webkit-backdrop-filter", fade ? "none" : before.backdropFilter);
  setStyle(surface, "background-color", fade ? "transparent" : before.backgroundColor);
  setStyle(surface, "border", fade ? "0px none" : before.border);
  setStyle(surface, "border-radius", fade ? "0px" : before.borderRadius);
  r.$playerSurfaceLayers.forEach((layer, index) => {
    layer.hidden = !fade || paperFade;
    if (!fade) return;
    const paint = index ? after : before;
    for (const property of PAINT_PROPERTIES) setStyle(layer, property, paint.getPropertyValue(property));
  });
  const fillBase = r.$playerFillBase;
  // A normal blend already supplies the neutral base. Avoid compositing the
  // same semi-transparent blurred edge twice, which makes alpha banding much
  // easier to see. Non-normal blend modes retain the protective base layer.
  fillBase.hidden = surface.hidden || paperFade || blendMode === "normal" || r.$player.classList.contains("is-frosted-glass");
  for (const property of surface.style) setStyle(fillBase, property, property === "mix-blend-mode" ? "normal" : surface.style.getPropertyValue(property));
  [...fillBase.children].forEach((layer, index) => {
    layer.hidden = r.$playerSurfaceLayers[index].hidden;
    const css = r.$playerSurfaceLayers[index].style.cssText;
    if (layer.style.cssText !== css) layer.style.cssText = css;
  });
  syncVisualizerSurface(r);
}

function surfaceSignature(r) {
  return [r.$playerSurface, r.$playerFillBase, ...r.$playerSurfaceLayers, r.$visualizerSurface]
    .filter(Boolean).map((surface) => `${surface.hidden}|${surface.style.cssText}`).join("\n");
}

export function syncPlayerSurface(r, transition = false) {
  if (!r.$player?.isConnected || !document.body) return;
  if (!r.$playerSurfaceHost) createSurface(r);
  paintSurface(r);
  const signature = surfaceSignature(r);
  const changed = signature !== r.$playerSurfacePaintSignature;
  r.$playerSurfacePaintSignature = signature;
  // Follow the existing width, colour and empty-state transitions. Stop once
  // they have settled instead of keeping another permanent animation loop.
  if (!changed && !transition) return;
  r.$playerSurfaceSettleUntil = performance.now() + 460;
  if (r.$playerSurfaceFrame) return;
  const settle = () => {
    r.$playerSurfaceFrame = 0;
    if (!r.$playerSurfaceHost?.isConnected || !r.$player.isConnected) return;
    paintSurface(r);
    r.$playerSurfacePaintSignature = surfaceSignature(r);
    if (performance.now() < r.$playerSurfaceSettleUntil) r.$playerSurfaceFrame = requestAnimationFrame(settle);
  };
  r.$playerSurfaceFrame = requestAnimationFrame(settle);
}
