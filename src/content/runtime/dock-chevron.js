import { interfaceScale } from "../scale.js";
import { runtimeSaveState, runtimeState } from "./context.js";

// The docked chevron is anchored just past the right edge of the music bar
// content, so it starts where the fade and float bars place it. The saved
// position is the gap kept to the right of that anchor: widening the timeline
// moves the anchor and pushes the chevron along, and dragging the chevron back
// stops as soon as it meets the timeline again.
export const DOCK_CHEVRON_WIDTH = 48;
export const DOCK_CHEVRON_CLEARANCE = 8;
export const DOCK_CHEVRON_EDGE_MARGIN = 12;

export function dockChevronGeometry(playerRect, contentRect, scale = 1) {
  const viewportWidth = (document.documentElement?.clientWidth || window.innerWidth) / scale;
  const half = DOCK_CHEVRON_WIDTH / 2;
  const anchor = contentRect?.width
    ? contentRect.right - playerRect.left + DOCK_CHEVRON_CLEARANCE + half
    : viewportWidth - DOCK_CHEVRON_EDGE_MARGIN - half - playerRect.left;
  const maxCenter = viewportWidth - DOCK_CHEVRON_EDGE_MARGIN - half - playerRect.left;
  const center = Math.min(anchor, Math.max(half + DOCK_CHEVRON_EDGE_MARGIN, maxCenter));
  return { center, maxGap: Math.max(0, maxCenter - center) };
}

export function syncDockChevron(r, center, docked = false) {
  const maxGap = docked ? Math.max(0, Number(r.$dockChevronMaxGap) || 0) : 0;
  r.$dockChevronMaxGap = maxGap;
  const gap = docked ? Math.min(maxGap, Math.max(0, Number(runtimeState.dockChevronGap) || 0)) : 0;
  r.$player.style.setProperty("--hub-dock-chevron-gap", `${gap}px`);
  if (r.$panel) {
    const playerLeft = (r.$player.getBoundingClientRect?.().left || 0) / interfaceScale(runtimeState.appearance);
    const panelWidth = r.$panel.offsetWidth || r.$panel.getBoundingClientRect?.().width || 420;
    const viewportWidth = (document.documentElement?.clientWidth || window.innerWidth) / interfaceScale(runtimeState.appearance);
    const maxPanelLeft = Math.max(12, viewportWidth - panelWidth - 12);
    const panelLeft = Math.max(12, Math.min(maxPanelLeft, playerLeft + center + gap - panelWidth / 2));
    r.$panel.style.setProperty("--hub-context-panel-left", `${Math.round(panelLeft)}px`);
  }
  for (const handle of r.$playerSections.querySelectorAll(".hub-chevron-drag-handle")) {
    handle.setAttribute("aria-valuemax", String(Math.round(maxGap)));
    handle.setAttribute("aria-valuenow", String(Math.round(gap)));
  }
}

export function bindDockChevron(r) {
  let drag = null;
  const move = (gap) => {
    runtimeState.dockChevronGap = Math.max(0, Math.min(r.$dockChevronMaxGap || 0, gap));
    r.$playerSectionGeometrySignature = "";
    r.$syncPlayerSectionGeometry();
  };
  for (const edge of ["left", "right"]) {
    const handle = document.createElement("div");
    handle.className = `hub-chevron-drag-handle is-${edge}`;
    handle.tabIndex = 0;
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", "Dock menu position");
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-valuemin", "0");
    handle.title = "Drag to move menu · Arrow keys to adjust";
    r.$playerSections.append(handle);
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { pointerId: event.pointerId, x: event.clientX, gap: Number.parseFloat(r.$player.style.getPropertyValue("--hub-dock-chevron-gap")) || 0 };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-active");
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      move(drag.gap + (event.clientX - drag.x) / interfaceScale(runtimeState.appearance));
    });
    const finish = () => {
      if (!drag) return;
      drag = null;
      handle.classList.remove("is-active");
      runtimeSaveState();
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    handle.addEventListener("keydown", (event) => {
      const gap = Number.parseFloat(r.$player.style.getPropertyValue("--hub-dock-chevron-gap")) || 0;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      move(event.key === "Home" ? 0 : event.key === "End" ? r.$dockChevronMaxGap : gap + (event.key === "ArrowLeft" ? -10 : 10));
      runtimeSaveState();
    });
  }
}
