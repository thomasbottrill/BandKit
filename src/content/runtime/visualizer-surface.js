// Blend the visualizer with the page-facing backing, not the transparent
// stacking context containing the player controls. Keep the source as geometry.
export function syncVisualizerSurface(r, paint = true, newFrame = false) {
  if (newFrame) r.$visualizerSurfaceFrameVersion = (r.$visualizerSurfaceFrameVersion || 0) + 1;
  const source = r.$playerVisualizer;
  const shadow = r.$playerSurfaceHost?.shadowRoot;
  if (!source || !shadow) return;
  if (!r.$visualizerSurface) {
    const surface = document.createElement("div");
    surface.style.cssText = "position:fixed;pointer-events:none;z-index:2147483645;overflow:hidden";
    const bloom = document.createElement("div");
    bloom.style.cssText = "position:absolute;pointer-events:none";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;left:0;bottom:0;width:100%;height:100%;pointer-events:none";
    surface.append(bloom, canvas);
    shadow.append(surface);
    r.$visualizerSurface = surface;
    r.$visualizerSurfaceBloom = bloom;
    r.$visualizerSurfaceCanvas = canvas;
    source.style.visibility = "hidden";
  }
  const surface = r.$visualizerSurface;
  if (paint) {
    const style = getComputedStyle(source);
    const rect = source.getBoundingClientRect();
    surface.hidden = style.display === "none" || !rect.width || !rect.height;
    if (surface.hidden) return;
    for (const [property, value] of Object.entries({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      "mix-blend-mode": style.mixBlendMode, opacity: style.opacity, "mask-image": style.maskImage })) setStyle(surface, property, value);
    const bloom = getComputedStyle(source, "::before");
    for (const prop of ["background", "filter", "opacity", "inset", "transform", "transform-origin", "display"]) {
      setStyle(r.$visualizerSurfaceBloom, prop, bloom.getPropertyValue(prop));
    }
    const original = source.querySelector("canvas");
    if (original) {
      const canvasStyle = getComputedStyle(original);
      for (const prop of ["filter", "opacity", "display"]) setStyle(r.$visualizerSurfaceCanvas, prop, canvasStyle.getPropertyValue(prop));
    }
  }
  const original = source.querySelector("canvas");
  const canvas = r.$visualizerSurfaceCanvas;
  if (surface.hidden || !original?.width || !original.height) return;
  const version = r.$visualizerSurfaceFrameVersion || 0;
  if (r.$visualizerSurfacePresentedSource === original && r.$visualizerSurfacePresentedVersion === version
    && canvas.width === original.width && canvas.height === original.height) return;
  if (canvas.width !== original.width) canvas.width = original.width;
  if (canvas.height !== original.height) canvas.height = original.height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(original, 0, 0);
  r.$visualizerSurfacePresentedSource = original;
  r.$visualizerSurfacePresentedVersion = version;
}

function setStyle(element, property, value) {
  if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
}
