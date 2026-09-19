import { asset } from "../core.js";

export function createPanelShell() {
  const panel = document.createElement("section");
  panel.className = "hub-panel is-contextual";
  panel.setAttribute("aria-label", "Bandkit");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.innerHTML = `
      <header class="hub-header">
        <div class="hub-title-row">
          <span class="hub-title">Now Playing &amp; Playlists</span>
        </div>
        <div class="hub-header-actions">
          <button class="hub-icon-button hub-reset" type="button" title="Reset size and position" aria-label="Reset size and position">
            <span class="hub-reset-symbol" aria-hidden="true"></span>
          </button>
          <button class="hub-icon-button hub-layout-toggle" type="button" aria-label="Dock Bandkit to the right" title="Dock Bandkit to the right">
            <span class="hub-button-icon" style="--hub-icon:url('${asset("icon-dock.svg")}')" aria-hidden="true"></span>
          </button>
          <button class="hub-icon-button hub-close" type="button" aria-label="Close Bandkit">
            <span class="hub-button-icon" style="--hub-icon:url('${asset("icon-close.svg")}')" aria-hidden="true"></span>
          </button>
        </div>
      </header>
      <nav class="hub-tabs" aria-label="Bandkit sections"></nav>
      <main class="hub-content"></main>

      <div class="hub-resize-handle is-left" data-edge="left" aria-hidden="true"></div>
      <div class="hub-resize-handle is-right" data-edge="right" aria-hidden="true"></div>
      <div class="hub-resize-handle is-top" data-edge="top" aria-hidden="true"></div>
      <div class="hub-resize-handle is-bottom" data-edge="bottom" aria-hidden="true"></div>
    `;
  return panel;
}
