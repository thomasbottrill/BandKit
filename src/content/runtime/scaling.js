import { interfaceScale, resolvePageScale } from "../scale.js";
import { setStyleProperty } from "../core.js";
import { runtimeState } from "./context.js";

export function applyScales(r) {
  const page = resolvePageScale(runtimeState.appearance, r.$modernBandcampPageType?.());
  const ui = interfaceScale(runtimeState.appearance);
  setStyleProperty(document.documentElement.style, "--bandkit-page-scale", String(page));
  setStyleProperty(r.$host.style, "--hub-interface-scale", String(ui));
  if (r.$appliedInterfaceScale !== ui || r.$appliedPageScale !== page) {
    r.$appliedInterfaceScale = ui; r.$appliedPageScale = page;
    r.$playerSectionGeometrySignature = "";
    window.requestAnimationFrame(() => {
      r.$syncPlayerSectionGeometry?.(); r.$syncPlayerPageSpace?.();
    });
  }
}
