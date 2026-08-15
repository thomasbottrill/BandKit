export function parseColor(value) {
  const match = String(value || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
}

export function hexColor(value, fallback) {
  const match = String(value || "").match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  return match ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16), a: 1 } : fallback;
}

export function colorString(color, alpha = color.a ?? 1) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

export function hexString(color) {
  return `#${[color.r, color.g, color.b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function mixColor(first, second, amount) {
  return {
    r: first.r + (second.r - first.r) * amount,
    g: first.g + (second.g - first.g) * amount,
    b: first.b + (second.b - first.b) * amount,
    a: 1
  };
}

export function luminance(color) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrast(first, second) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

export function readableColor(foreground, backgrounds, minimum) {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const passes = (candidate) => backgrounds.every((background) => contrast(candidate, background) >= minimum);
  if (passes(foreground)) return { color: foreground, adjusted: false };
  const target = Math.min(...backgrounds.map((background) => contrast(white, background)))
    >= Math.min(...backgrounds.map((background) => contrast(black, background))) ? white : black;
  for (let amount = 0.08; amount <= 1.001; amount += 0.08) {
    const candidate = mixColor(foreground, target, Math.min(1, amount));
    if (passes(candidate)) return { color: candidate, adjusted: true };
  }
  return { color: target, adjusted: true };
}

export function accessibleControlPalette(backgrounds, preferredBackground) {
  const surfaces = (Array.isArray(backgrounds) ? backgrounds : [backgrounds]).filter(Boolean);
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 17, g: 24, b: 39, a: 1 };
  const foregroundFor = (background) => contrast(background, white) >= contrast(background, black) ? white : black;
  const passes = (background) => surfaces.every((surface) => contrast(background, surface) >= 3)
    && contrast(background, foregroundFor(background)) >= 4.5;
  let background = preferredBackground;
  if (!background || !passes(background)) {
    background = [black, white]
      .sort((first, second) => (
        Math.min(...surfaces.map((surface) => contrast(second, surface)))
        - Math.min(...surfaces.map((surface) => contrast(first, surface)))
      ))[0];
  }
  return { background, foreground: foregroundFor(background) };
}

export function accessibleScrubberPalette(preferredAccent, surface) {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 17, g: 24, b: 39, a: 1 };
  const background = surface || white;
  const accent = readableColor(preferredAccent || { r: 29, g: 160, b: 195, a: 1 }, [background], 3).color;
  const halo = contrast(background, white) >= contrast(background, black) ? white : black;
  return { accent, surface: background, halo };
}
