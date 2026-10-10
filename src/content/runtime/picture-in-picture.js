import { asset, createElement, formatDuration } from "../core.js";
import { runtimeSeamless } from "./context.js";
import { MESSAGES } from "../../shared/contracts.js";

// The mini player is a video Picture-in-Picture window, the same chrome-less
// floating window YouTube uses. A canvas draws the artwork and progress, its
// frames feed a muted video, and Chrome's own overlay controls reach the music
// bar through Media Session action handlers.
const SIZE = 480;
const TICK_MS = 250;
const ACTIONS = ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"];

export function pictureInPictureSupported() {
  return document.pictureInPictureEnabled === true
    && typeof window.HTMLCanvasElement?.prototype.captureStream === "function";
}

function resolvePalette(r, ctx) {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  r.$player.append(probe);
  const read = (value) => {
    probe.style.color = value;
    ctx.fillStyle = "#000";
    ctx.fillStyle = getComputedStyle(probe).color;
    return ctx.fillStyle;
  };
  const palette = {
    surface: read("var(--hub-zune-surface, var(--hub-panel))"),
    ink: read("var(--hub-ink)"),
    muted: read("var(--hub-muted)"),
    accent: read("var(--hub-playback-color, var(--hub-accent))"),
    font: getComputedStyle(r.$player).fontFamily || "Helvetica Neue, Helvetica, Arial, sans-serif"
  };
  probe.remove();
  return palette;
}

function withAlpha(color, alpha) {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  const channels = hex ? hex.slice(1).map((part) => parseInt(part, 16)) : (color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3);
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function fitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let fitted = text;
  while (fitted && ctx.measureText(`${fitted}…`).width > width) fitted = fitted.slice(0, -1);
  return `${fitted.trimEnd()}…`;
}

function readBar(r) {
  const empty = r.$player.classList.contains("is-empty");
  return {
    empty,
    art: r.$playerArtLink.hidden ? "" : r.$playerArt.currentSrc || r.$playerArt.src || "",
    title: empty ? "Nothing playing" : r.$playerTitle.textContent.trim(),
    artist: empty ? "" : r.$playerArtist.textContent.trim(),
    playing: r.$player.classList.contains("is-playing"),
    progress: empty || r.$scrubControl.classList.contains("is-empty") ? -1 : Number(r.$scrubSlider.value) / 1000,
    duration: empty ? 0 : Number(r.$scrubDuration) || 0,
    hasPrevious: !r.$player.querySelector(".hub-previous-button")?.disabled,
    hasNext: !r.$player.querySelector(".hub-next-button")?.disabled
  };
}

const ART = { size: 264, x: 108, y: 36, radius: 12 };
const PROGRESS = { x: 44, y: 420, width: 392 };

function drawArtwork(mini, image) {
  const { ctx, palette } = mini;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = withAlpha(palette.ink, 0.08);
  ctx.beginPath();
  ctx.roundRect(ART.x, ART.y, ART.size, ART.size, ART.radius);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ART.x, ART.y, ART.size, ART.size, ART.radius);
  ctx.clip();
  if (image) {
    const scale = Math.max(ART.size / image.width, ART.size / image.height);
    ctx.drawImage(image, ART.x + (ART.size - image.width * scale) / 2, ART.y + (ART.size - image.height * scale) / 2, image.width * scale, image.height * scale);
  } else if (mini.fallbackImage) {
    ctx.globalAlpha = 0.45;
    ctx.drawImage(mini.fallbackImage, ART.x + ART.size * 0.32, ART.y + ART.size * 0.32, ART.size * 0.36, ART.size * 0.36);
  }
  ctx.restore();
}

// A music card rather than a video frame: artwork on a soft wash of itself,
// then the track, artist and position, all readable without hovering.
function draw(mini, bar) {
  const { ctx, palette } = mini;
  const image = mini.artUrl === bar.art ? mini.artImage : null;
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (image) {
    ctx.save();
    ctx.filter = "blur(56px) saturate(1.2)";
    ctx.globalAlpha = 0.42;
    ctx.drawImage(image, -SIZE * 0.25, -SIZE * 0.25, SIZE * 1.5, SIZE * 1.5);
    ctx.restore();
  }
  drawArtwork(mini, image);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.ink;
  ctx.font = `600 26px ${palette.font}`;
  ctx.fillText(fitText(ctx, bar.title, SIZE - 64), SIZE / 2, 346);
  if (bar.artist) {
    ctx.fillStyle = palette.muted;
    ctx.font = `400 20px ${palette.font}`;
    ctx.fillText(fitText(ctx, bar.artist, SIZE - 64), SIZE / 2, 378);
  }
  if (bar.progress < 0) return;
  const played = Math.max(0, Math.min(1, bar.progress));
  ctx.fillStyle = withAlpha(palette.ink, 0.16);
  ctx.beginPath();
  ctx.roundRect(PROGRESS.x, PROGRESS.y, PROGRESS.width, 5, 2.5);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.roundRect(PROGRESS.x, PROGRESS.y, Math.max(5, PROGRESS.width * played), 5, 2.5);
  ctx.fill();
  if (bar.duration > 0) {
    const elapsed = played * bar.duration;
    ctx.fillStyle = palette.muted;
    ctx.font = `400 16px ${palette.font}`;
    ctx.textAlign = "left";
    ctx.fillText(formatDuration(elapsed), PROGRESS.x, PROGRESS.y + 30);
    ctx.textAlign = "right";
    ctx.fillText(`−${formatDuration(bar.duration - elapsed)}`, PROGRESS.x + PROGRESS.width, PROGRESS.y + 30);
  }
}

// MediaStreamTrackGenerator accepts frames without a rendering update, so the
// window keeps moving while the Bandcamp tab is hidden. Canvas capture is the
// fallback where the generator is unavailable.
function createFrameSink(canvas) {
  if (typeof window.MediaStreamTrackGenerator === "function" && typeof window.VideoFrame === "function") {
    const track = new window.MediaStreamTrackGenerator({ kind: "video" });
    const writer = track.writable.getWriter();
    return {
      stream: new window.MediaStream([track]),
      push: () => writer.write(new window.VideoFrame(canvas, { timestamp: Math.round(performance.now() * 1000) })).catch(() => {}),
      stop: () => { writer.close().catch(() => {}); track.stop(); }
    };
  }
  const stream = canvas.captureStream(0);
  const [track] = stream.getVideoTracks();
  return { stream, push: () => track.requestFrame?.(), stop: () => track.stop() };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = src;
  });
}

async function loadArtwork(r, mini, url) {
  mini.artUrl = url;
  mini.artImage = null;
  if (!url) return;
  const response = await r.$runtimeMessage({ type: MESSAGES.FETCH_ARTWORK, url });
  if (mini.artUrl !== url || !response?.ok) return;
  const image = await loadImage(response.dataUrl).catch(() => null);
  if (mini.artUrl !== url || !image) return;
  mini.artImage = image;
  mini.signature = "";
  mini.tick();
}

function setActionHandlers(r, mini, bar) {
  const session = navigator.mediaSession;
  if (!session) return;
  const play = r.$playButton;
  const setNativePlayback = (playing) => {
    session.playbackState = playing ? "playing" : "paused";
    if (!mini?.video) return;
    if (playing) mini.video.play().catch(() => {});
    else mini.video.pause();
  };
  const seekTo = (time) => {
    const duration = Number(r.$scrubDuration) || 0;
    if (!duration || !Number.isFinite(time)) return;
    r.$scrubSlider.value = String(Math.round(Math.max(0, Math.min(1, time / duration)) * 1000));
    r.$scrubSlider.dispatchEvent(new Event("input"));
    r.$scrubSlider.dispatchEvent(new Event("change"));
  };
  const handlers = {
    play: () => {
      if (!readBar(r).playing) play.click();
      // Background tabs throttle the render timer, so reflect the requested
      // state in Chrome's native control immediately instead of waiting for a tick.
      setNativePlayback(true);
    },
    pause: () => {
      if (readBar(r).playing) play.click();
      setNativePlayback(false);
    },
    previoustrack: bar?.hasPrevious ? () => r.$player.querySelector(".hub-previous-button").click() : null,
    nexttrack: bar?.hasNext ? () => r.$player.querySelector(".hub-next-button").click() : null,
    seekbackward: (details) => {
      const current = readBar(r).progress * (Number(r.$scrubDuration) || 0);
      seekTo(current - (Number(details.seekOffset) || 10));
    },
    seekforward: (details) => {
      const current = readBar(r).progress * (Number(r.$scrubDuration) || 0);
      seekTo(current + (Number(details.seekOffset) || 10));
    },
    // Seeks go through the bar's own slider handlers, like a drag would.
    seekto: (details) => seekTo(details.seekTime)
  };
  for (const action of ACTIONS) {
    try { session.setActionHandler(action, mini ? handlers[action] : null); } catch { /* unsupported action */ }
  }
  if (mini) session.playbackState = bar?.playing ? "playing" : "paused";
}

// Without a position, Chrome treats the stream as live and shows a LIVE badge.
function setPositionState(bar) {
  try {
    if (!bar || bar.duration <= 0 || bar.progress < 0) navigator.mediaSession?.setPositionState?.();
    else navigator.mediaSession?.setPositionState?.({ duration: bar.duration, playbackRate: 1, position: Math.min(bar.duration, bar.progress * bar.duration) });
  } catch { /* invalid or unsupported position */ }
}

// Chrome's speaker button mutes the window's own silent video; mirror it onto
// the music so the button does what it shows.
function setMusicMuted(r, muted) {
  if (runtimeSeamless?.enabled) void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_MUTED, { muted });
  else {
    const audio = r.$getAudio?.();
    if (audio) audio.muted = muted;
  }
}

function syncMenuAction(r) {
  const action = r.$playerMoreMenu.querySelector(".hub-pip-menu-action");
  if (!action) return;
  const open = Boolean(r.$miniPlayer);
  action.querySelector(".hub-pip-menu-label").textContent = open ? "Close mini player" : "Mini player";
  action.title = open ? "Close the floating mini player" : "Open a floating mini player";
}

export function createPictureInPictureMenuAction(r) {
  if (!pictureInPictureSupported()) return null;
  const action = createElement("button", "hub-pip-menu-action");
  action.type = "button";
  action.innerHTML = `<span class="hub-button-icon" style="--hub-icon:url('${asset("icon-picture-in-picture.svg")}')" aria-hidden="true"></span><span class="hub-pip-menu-label"></span>`;
  action.addEventListener("click", () => void togglePictureInPicturePlayer(r));
  r.$playerMoreMenu.append(action);
  syncMenuAction(r);
  return action;
}

function createMiniPlayer(r) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const mini = { canvas, ctx, palette: resolvePalette(r, ctx), signature: null, actionSignature: "", positionSignature: "", trackKey: null,
    lastRender: 0, musicMuted: false, artUrl: null, artImage: null, fallbackImage: null };
  mini.sink = createFrameSink(canvas);
  mini.video = document.createElement("video");
  // The stream carries no audio track. Leaving it unmuted keeps Chrome from
  // showing a struck-through speaker over music that is actually playing.
  mini.video.muted = false;
  mini.video.playsInline = true;
  mini.video.className = "hub-pip-video";
  mini.video.setAttribute("aria-hidden", "true");
  mini.video.srcObject = mini.sink.stream;
  mini.video.addEventListener("volumechange", () => {
    if (mini.video.muted === mini.musicMuted) return;
    mini.musicMuted = mini.video.muted;
    setMusicMuted(r, mini.musicMuted);
  });
  loadImage(asset("icon-now-playing.svg")).then((image) => { mini.fallbackImage = image; mini.signature = ""; }).catch(() => {});
  mini.tick = () => {
    const now = performance.now();
    // A hidden Bandcamp tab gets no animation frames, so the bar's own render
    // stalls. The mini player drives it while it is the visible surface.
    if (r.$playerRenderFrame || (document.hidden && now - mini.lastRender >= TICK_MS)) {
      mini.lastRender = now;
      r.$renderPlayer();
    }
    const bar = readBar(r);
    const trackKey = `${bar.title}\u0000${bar.artist}`;
    if (trackKey !== mini.trackKey) {
      mini.trackKey = trackKey;
      mini.palette = resolvePalette(r, ctx);
    }
    if (bar.art !== mini.artUrl) void loadArtwork(r, mini, bar.art);
    const signature = `${trackKey}\u0000${mini.artImage ? mini.artUrl : ""}\u0000${Math.round(bar.progress * PROGRESS.width)}\u0000${Math.floor(bar.progress * bar.duration)}\u0000${Math.round(bar.duration)}`;
    if (signature !== mini.signature) {
      mini.signature = signature;
      draw(mini, bar);
      mini.sink.push();
    }
    const actionSignature = `${bar.playing}|${bar.hasPrevious}|${bar.hasNext}`;
    if (actionSignature !== mini.actionSignature) {
      mini.actionSignature = actionSignature;
      setActionHandlers(r, mini, bar);
    }
    const positionSignature = `${bar.playing}|${Math.round(bar.duration)}|${Math.floor(bar.progress * bar.duration)}`;
    if (positionSignature !== mini.positionSignature) {
      mini.positionSignature = positionSignature;
      setPositionState(bar);
    }
    // Chrome's native play/pause control follows the source video's state.
    // Keep the silent canvas video aligned with the actual music instead of
    // restarting it unconditionally after Chrome pauses it.
    if (document.pictureInPictureElement === mini.video) {
      if (bar.playing && mini.video.paused) mini.video.play().catch(() => {});
      else if (!bar.playing && !mini.video.paused) mini.video.pause();
    }
  };
  return mini;
}

function closeMiniPlayer(r, mini) {
  if (r.$miniPlayer !== mini) return;
  r.$miniPlayer = null;
  window.clearInterval(mini.timer);
  if (mini.onActivity) {
    chrome.runtime.onMessage.removeListener(mini.onActivity);
    document.removeEventListener("bandkit:media-state", mini.onActivity);
  }
  setActionHandlers(r, null);
  setPositionState(null);
  // Never leave the music muted with no visible way to unmute it.
  if (mini.musicMuted) setMusicMuted(r, false);
  mini.sink.stop();
  mini.video.remove();
  syncMenuAction(r);
}

export async function togglePictureInPicturePlayer(r) {
  r.$closePlayerMoreMenu?.();
  if (r.$miniPlayer) {
    await document.exitPictureInPicture().catch(() => {});
    closeMiniPlayer(r, r.$miniPlayer);
    return;
  }
  const mini = createMiniPlayer(r);
  r.$miniPlayer = mini;
  r.$shadow.append(mini.video);
  mini.tick();
  try {
    await mini.video.play();
    if (mini.video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise((resolve) => { mini.video.addEventListener("loadedmetadata", resolve, { once: true }); });
    }
    await mini.video.requestPictureInPicture();
  } catch {
    closeMiniPlayer(r, mini);
    r.$showToast?.("The mini player could not be opened.");
    return;
  }
  mini.video.addEventListener("leavepictureinpicture", () => closeMiniPlayer(r, mini), { once: true });
  // Background timers are throttled; playback updates still arrive as
  // messages and media events, so they drive the window too.
  mini.onActivity = () => { if (document.hidden && performance.now() - mini.lastRender >= TICK_MS) mini.tick(); };
  chrome.runtime.onMessage.addListener(mini.onActivity);
  document.addEventListener("bandkit:media-state", mini.onActivity);
  mini.timer = window.setInterval(mini.tick, TICK_MS);
  if (!r.$miniPlayerCleanupRegistered) {
    r.$miniPlayerCleanupRegistered = true;
    r.$app?.registerCleanup?.(() => {
      if (r.$miniPlayer) closeMiniPlayer(r, r.$miniPlayer);
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    });
  }
  syncMenuAction(r);
}
