import { asset, createElement } from "../core.js";

// DOM only. Playback, persistence, page adapters and event wiring belong to callers.
// Return the detached drawer separately: it must remain a sibling of the player.
export function createMusicBar() {
  const player = createElement("footer");
  player.className = "hub-player";
  player.innerHTML = `
          <div class="hub-dj-drawer" aria-hidden="true"></div>
          <div class="hub-player-backdrop-glow" aria-hidden="true"></div>
          <div class="hub-player-visualizer" aria-hidden="true">
            <canvas class="hub-player-spectrum" width="1200" height="120"></canvas>
          </div>
          <div class="hub-player-content">
            <a class="hub-player-art-link" aria-disabled="true"><img class="hub-art is-small hub-player-art" alt=""></a>
            <div class="hub-player-main">
              <div class="hub-player-top-row">
                <div class="hub-player-track is-empty">
                  <div class="hub-track-copy">
                    <a class="hub-track-title hub-inline-link hub-player-title" aria-disabled="true"></a>
                    <span class="hub-player-secondary">
                      <a class="hub-track-artist hub-inline-link hub-player-artist" aria-disabled="true"></a>
                      <span class="hub-player-secondary-separator" hidden> - </span>
                      <a class="hub-track-album hub-inline-link hub-player-album" aria-disabled="true" hidden></a>
                    </span>
                  </div>
                </div>
                <div class="hub-player-tools">
                  <button class="hub-now-playing-button" type="button" aria-label="Open Now Playing" aria-expanded="false">
                    <span class="hub-now-playing-icon" style="--hub-icon:url('${asset("icon-now-playing.svg")}')"></span>
                    <span class="hub-now-playing-label">Play</span>
                    <span class="hub-now-playing-count">0</span>
                  </button>
                  <div class="hub-player-analysis" role="group" aria-label="Track BPM and key" hidden>
                    <span class="hub-player-analysis-badge hub-player-bpm-badge" hidden></span>
                    <span class="hub-player-analysis-badge hub-player-key-badge" hidden>
                      <span class="hub-player-key-name"></span>
                      <span class="hub-player-key-camelot"></span>
                    </span>
                  </div>
                  <button class="hub-dj-player-button" type="button" aria-label="Open DJ tools" style="--hub-dj-icon:url('${asset("icon-dj.svg")}')"></button>
                  <div class="hub-player-more-wrap">
                    <button class="hub-player-more-button" type="button" aria-label="More track actions" aria-expanded="false">
                      <span class="hub-player-more-dots" aria-hidden="true"><span></span><span></span><span></span></span>
                    </button>
                    <div class="hub-player-more-menu" hidden></div>
                  </div>
                </div>
              </div>
              <div class="hub-player-playback-row">
                <div class="hub-scrub-row">
                  <div class="hub-scrub-control">
                    <input class="hub-scrub-slider" type="range" min="0" max="1000" step="1" value="0" aria-label="Playback position">
                    <svg class="hub-scrub-waveform" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      <path class="hub-scrub-waveform-remaining"></path>
                      <path class="hub-scrub-waveform-played"></path>
                    </svg>
                    <span class="hub-scrub-playhead" aria-hidden="true"></span>
                    <span class="hub-scrub-time-readout" aria-hidden="true"><span class="hub-current-time">0:00</span><span class="hub-duration">−0:00</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="hub-player-actions">
            <button class="hub-skip-button hub-previous-button" type="button" aria-label="Previous track"><span class="hub-skip-icon" style="--hub-skip-icon:url('${asset("icon-skip.svg")}')" aria-hidden="true"></span></button>
            <button class="hub-play-button" type="button" aria-label="Play or pause"></button>
            <button class="hub-skip-button hub-next-button" type="button" aria-label="Next track"><span class="hub-skip-icon" style="--hub-skip-icon:url('${asset("icon-skip.svg")}')" aria-hidden="true"></span></button>
          </div>
          <div class="hub-toast" role="status" aria-live="polite"></div>
      `;
  const djDrawer = player.querySelector(".hub-dj-drawer");
  djDrawer.remove();
  const headerShortcuts = document.createElement("nav");
  headerShortcuts.className = "hub-header-shortcuts";
  headerShortcuts.setAttribute("aria-label", "Bandkit shortcuts");
  const playerSections = document.createElement("div");
  playerSections.className = "hub-player-sections";
  playerSections.setAttribute("aria-label", "Bandkit player and sections");
  playerSections.append(player.querySelector(".hub-now-playing-button"), headerShortcuts);
  player.append(playerSections);
  return { player, djDrawer, headerShortcuts, playerSections };
}
