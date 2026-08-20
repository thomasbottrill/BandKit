export function installAudioBridge() {
  const tracked = new Set();
  let activeMedia = null;
  let lastEmit = 0;

  function stateFor(media) {
    if (!media) return null;
    return {
      src: media.currentSrc || media.src || "",
      paused: Boolean(media.paused),
      ended: Boolean(media.ended),
      currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      playbackRate: Number.isFinite(media.playbackRate) ? media.playbackRate : 1,
      volume: Number.isFinite(media.volume) ? media.volume : 1
    };
  }

  function emit(media = activeMedia, force = false) {
    if (!media) return;
    const now = Date.now();
    if (!force && now - lastEmit < 180) return;
    lastEmit = now;
    document.dispatchEvent(new CustomEvent("bandkit:media-state", { detail: stateFor(media) }));
  }

  function track(media) {
    if (!(media instanceof HTMLMediaElement) || tracked.has(media)) return media;
    tracked.add(media);
    for (const type of ["play", "playing", "pause", "ended", "loadedmetadata", "durationchange", "ratechange", "volumechange", "seeked"]) {
      media.addEventListener(type, () => {
        activeMedia = media;
        emit(media, true);
      });
    }
    media.addEventListener("timeupdate", () => {
      activeMedia = media;
      emit(media);
    });
    return media;
  }

  const NativeAudio = window.Audio;
  function BandKitAudio(...args) {
    return track(new NativeAudio(...args));
  }
  BandKitAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(BandKitAudio, NativeAudio);
  window.Audio = BandKitAudio;

  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    activeMedia = track(this);
    const result = nativePlay.apply(this, args);
    emit(this, true);
    return result;
  };

  document.addEventListener("bandkit:media-command", (event) => {
    const command = event.detail || {};
    const media = activeMedia || [...tracked].find((candidate) => candidate.currentSrc || candidate.src);
    if (command.action === "pauseAll") {
      for (const candidate of tracked) if (!candidate.paused) candidate.pause();
      if (activeMedia) emit(activeMedia, true);
      return;
    }
    if (!media) return;
    activeMedia = media;
    if (command.action === "getState") emit(media, true);
    if (command.action === "play") void media.play().catch(() => {});
    if (command.action === "pause") media.pause();
    if (command.action === "playPause") {
      if (media.paused) void media.play().catch(() => {});
      else media.pause();
    }
    if (command.action === "seek" && Number.isFinite(Number(command.currentTime))) {
      const duration = Number.isFinite(media.duration) ? media.duration : Infinity;
      media.currentTime = Math.max(0, Math.min(duration, Number(command.currentTime)));
    }
    if (command.action === "setDj") {
      const rate = Math.max(0.35, Math.min(2, Number(command.rate) || 1));
      media.defaultPlaybackRate = rate;
      media.playbackRate = rate;
      if ("preservesPitch" in media) media.preservesPitch = command.preservePitch !== false;
      if ("webkitPreservesPitch" in media) media.webkitPreservesPitch = command.preservePitch !== false;
      const gainDb = Math.max(-30, Math.min(6, Number(command.gainDb) || 0));
      media.volume = gainDb <= -30 ? 0 : Math.min(1, Math.pow(10, gainDb / 20));
    }
    emit(media, true);
  });
}
