import { runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { createButtonIcon, createElement } from "../core.js";

function registerDjPageTools1(r) {
r.$createPageDjToolsCard = function createPageDjToolsCard() {
      const card = createElement("section", "hub-card hub-dj-card hub-dj-card-page");
      card.setAttribute("aria-label", "Page DJ playback tools");

      const bpm = Number(runtimeSeamless.detectedBpm) || null;
      const { analysisRow, refreshDisplayedBpm } = r.$createDjAnalysis(bpm);
      analysisRow.querySelector(".hub-dj-key")?.remove();
      const close = createElement("button", "hub-dj-page-close");
      close.type = "button";
      close.title = "Hide DJ tools on this page";
      close.setAttribute("aria-label", close.title);
      close.append(createButtonIcon("icon-close.svg"));
      close.addEventListener("click", () => r.$togglePageDjTools());

      const tempo = createElement("label", "hub-dj-page-tempo");
      const tempoSlider = createElement("input", "hub-dj-page-tempo-input");
      const updateTempoProgress = () => {
        const minimum = Number(tempoSlider.min);
        const maximum = Number(tempoSlider.max);
        const progress = ((Number(tempoSlider.value) - minimum) / Math.max(1, maximum - minimum)) * 100;
        tempoSlider.style.setProperty("--hub-dj-page-tempo-progress", `${Math.max(0, Math.min(100, progress))}%`);
      };
      tempoSlider.type = "range";
      tempoSlider.min = String(-runtimeState.dj.range);
      tempoSlider.max = String(runtimeState.dj.range);
      tempoSlider.step = "0.1";
      tempoSlider.value = String(r.$tempoPercentFromState());
      tempoSlider.setAttribute("aria-label", "Tempo");
      updateTempoProgress();
      tempoSlider.addEventListener("input", () => {
        const value = Number(tempoSlider.value);
        r.$setDjTempo(value);
        updateTempoProgress();
        refreshDisplayedBpm();
      });
      tempoSlider.addEventListener("change", runtimeSaveState);
      tempo.append(tempoSlider);

      const rangeValues = [6, 10, 16, 50];
      const rangeLabel = (range) => range === 50 ? "Wide" : `±${range}`;
      const modes = createElement("div", "hub-dj-page-modes hub-dj-mode-buttons");
      const tempoRange = createElement("button", "hub-dj-mode-button", rangeLabel(runtimeState.dj.range));
      tempoRange.type = "button";
      tempoRange.setAttribute("aria-label", `Tempo range ${rangeLabel(runtimeState.dj.range)}. Click for next range.`);
      tempoRange.addEventListener("click", () => {
        const current = rangeValues.indexOf(runtimeState.dj.range);
        runtimeState.dj.range = rangeValues[(current + 1) % rangeValues.length];
        r.$setDjTempo(Math.max(-runtimeState.dj.range, Math.min(runtimeState.dj.range, r.$tempoPercentFromState())));
        tempoSlider.min = String(-runtimeState.dj.range);
        tempoSlider.max = String(runtimeState.dj.range);
        tempoSlider.value = String(r.$tempoPercentFromState());
        tempoRange.textContent = rangeLabel(runtimeState.dj.range);
        tempoRange.setAttribute("aria-label", `Tempo range ${rangeLabel(runtimeState.dj.range)}. Click for next range.`);
        updateTempoProgress();
        refreshDisplayedBpm();
        runtimeSaveState();
      });
      const masterTempo = createElement("button", `hub-dj-mode-button hub-dj-master hub-dj-status-button${runtimeState.dj.preservePitch ? " is-active" : ""}`, "MT");
      masterTempo.type = "button";
      masterTempo.setAttribute("aria-label", "Master Tempo");
      masterTempo.setAttribute("aria-pressed", String(runtimeState.dj.preservePitch));
      if (runtimeState.dj.preservePitch) masterTempo.append(createElement("span", "hub-dj-active-dot"));
      masterTempo.addEventListener("click", () => {
        runtimeState.dj.preservePitch = !runtimeState.dj.preservePitch;
        masterTempo.classList.toggle("is-active", runtimeState.dj.preservePitch);
        masterTempo.setAttribute("aria-pressed", String(runtimeState.dj.preservePitch));
        masterTempo.querySelector(".hub-dj-active-dot")?.remove();
        if (runtimeState.dj.preservePitch) masterTempo.append(createElement("span", "hub-dj-active-dot"));
        r.$applyDjToAudio();
        runtimeSaveState();
      });
      modes.append(tempoRange, masterTempo);

      card.append(analysisRow, tempo, modes, close);
      return card;
    };
}

export const registerDjPageTools = [registerDjPageTools1];

export const setupDjPageTools = [];
