import { installAudioBridge } from "./page-audio-bridge.js";
import { installCartBridge } from "./page-cart-bridge.js";

(() => {
  if (window.__bandkitMediaBridgeInstalled) return;
  window.__bandkitMediaBridgeInstalled = true;
  installAudioBridge();
  installCartBridge();
})();
