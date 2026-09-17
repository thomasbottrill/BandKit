import { asset } from "../core.js";
import { runtimeLive } from "./context.js";

export function syncFullscreenVisualizerGlass(r) {
  const stage = r.$fullscreenVisualizerStage;
  if (!stage) return;
  const enabled = r.$player.classList.contains("is-frosted-glass");
  stage.classList.toggle("is-frosted-glass", enabled);
  stage.parentNode.classList.toggle("is-frosted-glass", enabled);
  for (const name of ["--hub-glass-surface-opacity", "--hub-glass-blur"]) {
    stage.style.setProperty(name, r.$player.style.getPropertyValue(name));
  }
}

// Move the real player, not a clone: one audio connection, FFT queue and canvas.
export function openFullscreenVisualizer(r) {
  if (r.$visualizerFullscreen || !runtimeLive.isPlaying) return;
  r.$closePlayerMoreMenu?.();
  const dialog = document.createElement("dialog");
  dialog.className = "hub-visualizer-dialog";
  dialog.setAttribute("aria-label", "Fullscreen visualizer — experimental");
  const stage = document.createElement("div");
  stage.className = "hub-visualizer-stage";
  stage.tabIndex = -1;
  const playerStyle = getComputedStyle(r.$player);
  stage.style.setProperty("--hub-fullscreen-surface", playerStyle.getPropertyValue("--hub-zune-surface").trim() || playerStyle.getPropertyValue("--hub-panel"));
  // Capture the resolved player palette before moving it away from its page
  // position. Fullscreen must not inherit the panel's unrelated theme colours.
  for (const name of ["ink", "muted", "faint", "accent", "accent-soft", "line", "scrub-accent", "scrub-remaining", "scrub-surface", "scrub-halo"]) {
    stage.style.setProperty(`--hub-fullscreen-${name}`, playerStyle.getPropertyValue(`--hub-${name}`));
  }
  const pageOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const close = document.createElement("button");
  close.className = "hub-visualizer-exit";
  close.type = "button";
  close.setAttribute("aria-label", "Exit fullscreen visualizer");
  close.title = "Exit visualizer (Escape)";
  close.innerHTML = `<span class="hub-button-icon" style="--hub-icon:url('${asset("icon-close.svg")}')" aria-hidden="true"></span>`;
  const marker = document.createComment("player position before fullscreen");
  r.$player.before(marker);
  r.$visualizerFullscreen = true;
  stage.append(close, r.$player);
  dialog.append(stage);
  r.$shadow.append(dialog);
  r.$fullscreenVisualizerStage = stage;
  syncFullscreenVisualizerGlass(r);
  r.$syncMusicBarVisualizer();
  r.$schedulePlayerSectionGeometry();
  let idleTimer, nativeFullscreen = false;
  const controls = [close, r.$player.querySelector(".hub-player-actions"), r.$player.querySelector(".hub-player-tools")];
  const reveal = () => {
    clearTimeout(idleTimer);
    stage.classList.remove("is-idle");
    controls.forEach((control) => { control.inert = false; });
    idleTimer = setTimeout(() => {
      // Keyboard users retain their focused action. Pointer users can settle.
      if (stage.querySelector(":focus-visible") && r.$shadow.activeElement !== stage) return;
      stage.classList.add("is-idle");
      controls.forEach((control) => { control.inert = true; });
      stage.focus({ preventScroll: true });
    }, 3000);
  };
  const restore = () => {
    if (!r.$visualizerFullscreen) return;
    clearTimeout(idleTimer);
    r.$closePlayerMoreMenu?.();
    r.$visualizerFullscreen = false;
    r.$fullscreenVisualizerStage = null;
    document.documentElement.style.overflow = pageOverflow;
    controls.forEach((control) => { control.inert = false; });
    marker.replaceWith(r.$player);
    if (r.$playerSurfaceHost) document.body.append(r.$playerSurfaceHost);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    dialog.close();
    dialog.remove();
    r.$syncMusicBarVisualizer();
    r.$schedulePlayerSectionGeometry();
    r.$syncPlayerPageSpace();
    r.$playerMoreButton.focus({ preventScroll: true });
  };
  const exit = () => {
    if (document.fullscreenElement === document.documentElement) document.exitFullscreen().catch(() => {});
    restore();
  };
  const onFullscreenChange = () => {
    if (document.fullscreenElement === document.documentElement) {
      nativeFullscreen = true;
      // Fullscreen promotes the document above existing top-layer entries.
      // Re-promote our modal so it stays above the page it is blurring.
      dialog.close();
      dialog.showModal();
      stage.focus({ preventScroll: true });
    }
    else if (nativeFullscreen) restore();
  };
  close.addEventListener("click", exit);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); exit(); });
  stage.addEventListener("pointermove", reveal, { passive: true });
  stage.addEventListener("pointerdown", reveal, { passive: true });
  stage.addEventListener("keydown", (event) => {
    reveal();
    if (event.key === "Escape") { event.preventDefault(); exit(); }
  });
  stage.addEventListener("focusin", () => {
    if (r.$shadow.activeElement !== stage) reveal();
  });
  document.addEventListener("fullscreenchange", onFullscreenChange);
  dialog.showModal();
  stage.focus({ preventScroll: true });
  reveal();
  // If browser fullscreen is unavailable, the modal still covers the viewport.
  // Keep the page in the fullscreen document so glass has real content to
  // refract. Fullscreening only the stage leaves a flat black backdrop.
  document.documentElement.requestFullscreen?.().catch(() => {});
}
