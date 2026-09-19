import { PAPER_DEFAULTS } from "./state.js";

// Independent micro-grain and paper structure: changing Grain size scales
// fibres/mottling, never the fine surface detail. Everything stays static.
const textureCache = new Map();
const textureUrl = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const fibres = (() => {
  let seed = 217;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const paths = [];
  for (let i = 0; i < 160; i++) {
    const x = random() * 384, y = random() * 384;
    const angle = random() * Math.PI * 2, length = 2 + random() * 9;
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const bend = (random() - .5) * 3, opacity = .12 + random() * .18;
    // Repeat edge-crossing fibres in neighbouring tiles for seamless joins.
    for (const ox of [-384, 0, 384]) for (const oy of [-384, 0, 384]) {
      if (x + ox < -12 || x + ox > 396 || y + oy < -12 || y + oy > 396) continue;
      const path = `M${(x+ox).toFixed(2)} ${(y+oy).toFixed(2)}q${(dx*.5+bend).toFixed(2)} ${(dy*.5-bend).toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)}`;
      paths.push(`<path d="${path}" stroke="#fff" opacity="${opacity}" transform="translate(0 -.45)"/><path d="${path}" stroke="#000" opacity="${opacity*.75}"/>`);
    }
  }
  return paths.join("");
})();

const normalizeStrength = value => Math.round(Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 65)));

export function paperTexture(strength = 65, fibreStrength = strength, mottleStrength = strength) {
  const amount = normalizeStrength(strength);
  const fibreAmount = normalizeStrength(fibreStrength);
  const mottleAmount = normalizeStrength(mottleStrength);
  const key = `${amount}:${fibreAmount}:${mottleAmount}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const intensity = amount / 100;
  const fine = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><filter id="micro"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="23" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" opacity="${.7*Math.sqrt(intensity)}" filter="url(#micro)"/></svg>`;
  const structure = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384"><defs><filter id="mottle"><feTurbulence type="fractalNoise" baseFrequency=".018 .025" numOctaves="3" seed="11" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><filter id="soft"><feGaussianBlur stdDeviation=".18"/></filter></defs><rect width="100%" height="100%" opacity="${.65*mottleAmount/100}" filter="url(#mottle)"/><g opacity="${fibreAmount/100}" fill="none" stroke-width=".65" stroke-linecap="round" filter="url(#soft)">${fibres}</g></svg>`;
  const result = `${textureUrl(fine)}, ${textureUrl(structure)}`;
  // Independent controls create many combinations; retain only recent textures.
  if (textureCache.size >= 32) textureCache.delete(textureCache.keys().next().value);
  textureCache.set(key, result);
  return result;
}

// Reproduce Fade's two rounded backing layers as an alpha mask. Grain stays
// crisp in the centre, but inherits the actual contours and Gaussian falloff.
export function paperFadeMask(width, height, paints) {
  const pad = 192;
  const shapes = paints.map((paint, index) => {
    const w = parseFloat(paint.width), h = parseFloat(paint.height);
    const x = (width - w) / 2, y = height - parseFloat(paint.bottom) - h;
    const blur = Number(paint.filter.match(/blur\(([\d.]+)px\)/)?.[1]) || 0;
    const rx = w / 2, ry = h * .9;
    if (![w, h, x, y].every(Number.isFinite)) return "";
    return `<filter id="b${index}" x="-50%" y="-100%" width="200%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}"/></filter><path fill="white" opacity="${Number(paint.opacity) || 1}" filter="url(#b${index})" d="M${x} ${y+h}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h}Z"/>`;
  }).join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width+pad*2}" height="${height+pad*2}" viewBox="${-pad} ${-pad} ${width+pad*2} ${height+pad*2}">${shapes}</svg>`)}")`;
}

export function syncPaperSurface(r, appearance) {
  const enabled = appearance.paperTexture === true && appearance.frostedGlass !== true;
  const previousStrength = appearance.paperTextureStrength;
  const strength = Math.round(Math.max(0, Math.min(100, Number(previousStrength ?? PAPER_DEFAULTS.paperTextureStrength) || 0)));
  appearance.paperTextureStrength = strength;
  // Capture the old combined strength before any individual control changes it.
  appearance.paperFibreStrength = normalizeStrength(appearance.paperFibreStrength ?? previousStrength ?? PAPER_DEFAULTS.paperFibreStrength);
  appearance.paperMottleStrength = normalizeStrength(appearance.paperMottleStrength ?? previousStrength ?? PAPER_DEFAULTS.paperMottleStrength);
  const texture = enabled ? paperTexture(strength, appearance.paperFibreStrength, appearance.paperMottleStrength) : "none";
  r.$host.style.setProperty("--hub-paper-texture", texture);
  const requestedSize = Number(appearance.paperGrainSize ?? PAPER_DEFAULTS.paperGrainSize);
  const grainSize = Math.round(Math.max(25, Math.min(400, Number.isFinite(requestedSize) ? requestedSize : PAPER_DEFAULTS.paperGrainSize)));
  appearance.paperGrainSize = grainSize;
  r.$host.style.setProperty("--hub-paper-grain-size", `${160 * grainSize / 100}px`);
  for (const surface of [r.$player, r.$panel, r.$djDrawer, r.$onboardingDialog].filter(Boolean)) {
    surface.classList.toggle("is-paper", enabled);
  }
}
