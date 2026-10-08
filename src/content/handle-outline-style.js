// Dilate the same-sized silhouette by two pixels rather than scaling a
// second copy: scaling produces thin sides on pills and gaps on complex shapes.
const offsets = Array.from({ length: 16 }, (_, index) => {
  const angle = index * Math.PI / 8;
  return `${(Math.cos(angle) * 2).toFixed(3)}px ${(Math.sin(angle) * 2).toFixed(3)}px`;
});
const masks = offsets.map(() => "var(--handle-outline-mask)").join(",");
const positions = offsets.map((offset) => {
  const [x, y] = offset.split(" ");
  return `calc(50% + ${x}) calc(50% + ${y})`;
}).join(",");
const selector = ":is(.hub-scrub-playhead,.hub-shaped-range-handle,.hub-dj-waveform-playhead,.hub-scrub-handle-preview,.bandkit-page-scrub-playhead)";

export const HANDLE_OUTLINE_CSS = `
:is(.hub-scrub-playhead,.hub-shaped-range-handle,.hub-dj-waveform-playhead,.bandkit-page-scrub-playhead) {
  width: var(--hub-scrub-handle-size, var(--bandkit-scrub-handle-size, 22px)) !important;
  height: var(--hub-scrub-handle-size, var(--bandkit-scrub-handle-size, 22px)) !important;
}
${selector} {
  --handle-outline-mask: var(--hub-scrub-handle-mask, var(--bandkit-scrub-handle-mask));
}
.hub-scrub-handle-preview {
  --handle-outline-mask: var(--hub-scrub-handle-option-mask);
}
${selector}::before {
  inset: 0;
  background: var(--hub-scrub-surface, var(--bandkit-scrub-surface)) !important;
  -webkit-mask-image: ${masks};
  mask-image: ${masks};
  -webkit-mask-size: calc(100% - 6px) calc(100% - 6px);
  mask-size: calc(100% - 6px) calc(100% - 6px);
  -webkit-mask-position: ${positions};
  mask-position: ${positions};
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
${selector}::after {
  inset: 3px;
  background: var(--hub-scrub-handle-fill, var(--hub-handle-color, var(--bandkit-scrub-handle-fill, var(--bandkit-handle-color, var(--hub-scrub-accent, var(--bandkit-scrub-accent)))))) !important;
  mask-image: var(--hub-scrub-handle-fill-mask, var(--bandkit-scrub-handle-fill-mask, var(--handle-outline-mask)));
  -webkit-mask-image: var(--hub-scrub-handle-fill-mask, var(--bandkit-scrub-handle-fill-mask, var(--handle-outline-mask)));
}
.hub-scrub-handle-preview::after {
  background: var(--hub-scrub-handle-option-fill, var(--hub-scrub-accent)) !important;
  mask-image: var(--hub-scrub-handle-option-fill-mask, var(--handle-outline-mask));
  -webkit-mask-image: var(--hub-scrub-handle-option-fill-mask, var(--handle-outline-mask));
}
.hub-panel { --hub-scrub-surface: var(--hub-panel); }
.hub-player[data-player-style="zune"] { --hub-scrub-surface: var(--hub-zune-surface); }
.hub-player[data-player-style="docked"] { --hub-scrub-surface: var(--hub-docked-surface); }
`;
