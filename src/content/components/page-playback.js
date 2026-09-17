// Presentation shared by native and modern page-player adapters.
export function createPageWaveform() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "bandkit-page-scrub-waveform");
  svg.setAttribute("viewBox", "0 0 320 24");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const className of ["bandkit-page-waveform-remaining", "bandkit-page-waveform-played"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", className);
    svg.append(path);
  }
  return svg;
}

export function createPageTransportButton(direction) {
  const proxy = document.createElement("button");
  proxy.type = "button";
  proxy.dataset.bandkitTrackNavigation = direction;
  proxy.className = `bandkit-page-skip-control is-${direction}`;
  proxy.setAttribute("aria-label", direction === "next" ? "Next track" : "Previous track");
  return proxy;
}

export function createPagePlayhead() {
  const playhead = document.createElement("span");
  playhead.className = "bandkit-page-scrub-playhead";
  playhead.setAttribute("aria-hidden", "true");
  return playhead;
}
