import { runtimeSaveState, runtimeState } from "./context.js";

export function syncDockChevron(r, center) {
  r.$dockChevronMaxOffset = Math.max(0, center - 36);
  const offset = Math.min(r.$dockChevronMaxOffset, Math.max(0, Number(runtimeState.dockChevronOffset) || 0));
  r.$player.style.setProperty("--hub-dock-chevron-offset", `${offset}px`);
  if (r.$panel) {
    const playerLeft = r.$player.getBoundingClientRect?.().left || 0;
    const panelWidth = r.$panel.offsetWidth || r.$panel.getBoundingClientRect?.().width || 420;
    const viewportWidth = document.documentElement?.clientWidth || window.innerWidth;
    const maxPanelLeft = Math.max(12, viewportWidth - panelWidth - 12);
    const panelLeft = Math.max(12, Math.min(maxPanelLeft, playerLeft + center - offset - panelWidth / 2));
    r.$panel.style.setProperty("--hub-context-panel-left", `${Math.round(panelLeft)}px`);
  }
  for (const handle of r.$playerSections.querySelectorAll(".hub-chevron-drag-handle")) {
    handle.setAttribute("aria-valuemax", String(Math.round(r.$dockChevronMaxOffset)));
    handle.setAttribute("aria-valuenow", String(Math.round(r.$dockChevronMaxOffset - offset)));
  }
}

export function bindDockChevron(r) {
  let drag = null;
  const move = (offset) => {
    runtimeState.dockChevronOffset = Math.max(0, Math.min(r.$dockChevronMaxOffset || 0, offset));
    syncDockChevron(r, (r.$dockChevronMaxOffset || 0) + 36);
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
      drag = { pointerId: event.pointerId, x: event.clientX, offset: Number.parseFloat(r.$player.style.getPropertyValue("--hub-dock-chevron-offset")) || 0 };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-active");
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      move(drag.offset + drag.x - event.clientX);
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
      const offset = Number.parseFloat(r.$player.style.getPropertyValue("--hub-dock-chevron-offset")) || 0;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      move(event.key === "Home" ? r.$dockChevronMaxOffset : event.key === "End" ? 0 : offset + (event.key === "ArrowLeft" ? 10 : -10));
      runtimeSaveState();
    });
  }
}
