// The producer already limits FFT traffic. Paint the newest sample on the
// next display frame: a second elapsed-time cap here causes beat-frequency
// stutter as the independent sample and display clocks drift past each other.
export function resumeVisualizer(r, now = Date.now()) {
  r.$visualizerFrameQueue?.cancel();
  // Hidden tabs intentionally stop consuming FFT frames. That silence is not
  // a lost audio feed: allow the producer to resume before using the much
  // louder, peak-normalized track waveform as a fallback.
  r.$visualizerResumeAt = now;
  r.$spectrumColourUpdatedAt = 0;
}

export function createVisualizerFrameQueue({ render, visible,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (id) => window.cancelAnimationFrame(id)
}) {
  let frame = 0;
  let latest = null;
  const cancel = () => {
    if (frame) cancelFrame(frame);
    frame = 0;
    latest = null;
  };
  return {
    push(signal) {
      if (!visible()) { cancel(); return; }
      latest = signal;
      if (frame) return;
      frame = requestFrame(() => {
        frame = 0;
        const signalToPaint = latest;
        latest = null;
        if (signalToPaint && visible()) render(signalToPaint);
      });
    },
    cancel
  };
}
