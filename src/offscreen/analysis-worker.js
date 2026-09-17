import { buildWaveform, estimateBpmDetailsCooperatively, estimateKeyCooperatively } from "./analysis.js";

// PCM arrives as owned, transferable copies. AudioBuffer and the playback
// graph stay in the offscreen document; only CPU analysis runs here.
globalThis.onmessage = async ({ data: { id, buffers, deep } }) => {
  try {
    const decoded = buffers.map(({ sampleRate, channels }) => ({
      sampleRate,
      length: channels[0].length,
      duration: channels[0].length / sampleRate,
      numberOfChannels: channels.length,
      getChannelData: (index) => channels[index]
    }));
    const key = await estimateKeyCooperatively(decoded, () => Promise.resolve(), deep ? { targetFrameCount: 72 } : {});
    let bpmDetails = null;
    let bpmError = "";
    try { bpmDetails = await estimateBpmDetailsCooperatively(decoded, () => Promise.resolve()); }
    catch (error) { bpmError = error.message || "Tempo analysis failed."; }
    globalThis.postMessage({ id, result: {
      bpm: bpmDetails?.bpm || null,
      bpmUncertain: Boolean(bpmDetails?.uncertain),
      bpmError: bpmDetails?.reason || bpmError,
      key,
      waveform: buildWaveform(decoded[0])
    } });
  } catch (error) {
    globalThis.postMessage({ id, error: error.message || "Track analysis failed." });
  }
};
