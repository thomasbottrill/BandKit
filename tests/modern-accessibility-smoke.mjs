import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readContentSource, readModernStyles } from "./support/source.mjs";

const source = readContentSource();
const css = readModernStyles();

function extractFunction(name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find ${name} in content.js`);
  const start = match.index;
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}`);
}

const context = vm.createContext({});
vm.runInContext([
  extractFunction("mixColor"),
  extractFunction("luminance"),
  extractFunction("contrast"),
  extractFunction("readableColor"),
  extractFunction("modernArtistForeground"),
  extractFunction("accessibleModernPagePalette"),
  `globalThis.palette = accessibleModernPagePalette({
    background: { r: 3, g: 3, b: 3, a: 1 },
    surface: { r: 5, g: 5, b: 5, a: 1 },
    surfaceRaised: { r: 250, g: 250, b: 250, a: 1 },
    footerBackground: { r: 247, g: 247, b: 247, a: 1 },
    navbar: { r: 17, g: 17, b: 17, a: 1 },
    text: { r: 41, g: 41, b: 41, a: 1 },
    secondary: { r: 52, g: 52, b: 52, a: 1 },
    link: { r: 45, g: 45, b: 45, a: 1 },
    navbarText: { r: 41, g: 41, b: 41, a: 1 },
    line: { r: 41, g: 41, b: 41, a: 0.18 },
    preserveArtistColors: true
  });
  globalThis.artistSource = {
    background: { r: 132, g: 195, b: 232, a: 1 },
    surface: { r: 132, g: 195, b: 232, a: 1 },
    surfaceRaised: { r: 132, g: 195, b: 232, a: 1 },
    footerBackground: { r: 132, g: 195, b: 232, a: 1 },
    navbar: { r: 132, g: 195, b: 232, a: 1 },
    text: { r: 0, g: 0, b: 0, a: 1 },
    secondary: { r: 255, g: 255, b: 64, a: 1 },
    link: { r: 0, g: 0, b: 0, a: 1 },
    navbarText: { r: 0, g: 0, b: 0, a: 1 },
    line: { r: 0, g: 0, b: 0, a: 0.18 },
    preserveArtistColors: true
  };
  globalThis.artistPalette = accessibleModernPagePalette(artistSource);
  globalThis.strictPalette = accessibleModernPagePalette({ ...artistSource, preserveArtistColors: false });`
].join("\n"), context);

const contrast = context.contrast;
const palette = context.palette;
for (const [foreground, background, minimum, label] of [
  [palette.backgroundText, palette.background, 7, "page text"],
  [palette.text, palette.surface, 7, "surface text"],
  [palette.secondary, palette.surface, 4.5, "surface secondary text"],
  [palette.link, palette.surface, 4.5, "surface links"],
  [palette.raisedText, palette.surfaceRaised, 7, "card text"],
  [palette.raisedSecondary, palette.surfaceRaised, 4.5, "card secondary text"],
  [palette.raisedLink, palette.surfaceRaised, 4.5, "card links"],
  [palette.footerText, palette.footerBackground, 7, "footer text"],
  [palette.footerSecondary, palette.footerBackground, 4.5, "footer secondary text"],
  [palette.footerLink, palette.footerBackground, 4.5, "footer links"],
  [palette.navbarText, palette.navbar, 7, "navigation text"],
  [palette.line, palette.surface, 3, "surface boundaries"],
  [palette.raisedLine, palette.surfaceRaised, 3, "card boundaries"],
  [palette.footerLine, palette.footerBackground, 3, "footer boundaries"],
  [palette.navbarLine, palette.navbar, 3, "navigation boundaries"]
]) {
  assert.ok(contrast(foreground, background) >= minimum, `${label} must reach ${minimum}:1`);
}

assert.notDeepEqual(palette.text, palette.raisedText, "Opposing surfaces need independent foreground tokens");
assert.deepEqual(
  context.artistPalette.secondary,
  context.artistSource.secondary,
  "Layout-only Modern Pages must preserve deliberate artist secondary colours"
);
assert.ok(
  contrast(context.strictPalette.secondary, context.strictPalette.surface) >= 4.5,
  "Explicit page theming must retain strict secondary-text contrast correction"
);
assert.notDeepEqual(
  context.strictPalette.secondary,
  context.artistSource.secondary,
  "Strict page theming may correct an unsafe artist secondary colour"
);
assert.match(source, /accessibleModernPagePalette\(themedModernReleasePalette\(modernReleasePalette\)\)/, "Every modern page palette must pass through contrast correction");
for (const token of [
  "--bandkit-release-background-ink",
  "--bandkit-release-raised-ink",
  "--bandkit-release-raised-muted",
  "--bandkit-release-navbar-accent",
  "--bandkit-release-footer-ink"
]) {
  assert.ok(source.includes(`"${token}"`), `${token} must be emitted and cleared`);
  assert.ok(css.includes(token), `${token} must have a CSS fallback or consumer`);
}
assert.match(css, /body\.tralbum-page \.bandkit-modern-purchase-panel,[\s\S]*?--bandkit-release-ink:\s*var\(--bandkit-release-raised-ink\)/, "Release purchase and profile cards must enter the raised contrast context");
assert.match(css, /body\.tralbum-page #track_table \.track_row_view,[\s\S]*?--bandkit-release-ink:\s*var\(--bandkit-release-raised-ink\)/, "Release track rows must use foregrounds corrected for their painted surface");
assert.match(css, /#track_table \.track_row_view\s*\{[\s\S]*?background:\s*var\(--bandkit-release-surface-raised\)\s*!important/, "Release track rows must paint the surface used for their foreground correction");
assert.match(css, /body\.tralbum-page #pgFt\s*\{[\s\S]*?--bandkit-release-ink:\s*var\(--bandkit-release-footer-ink\)/, "Release footers must enter their own contrast context");

console.log("Modern page accessibility palette checks passed.");
