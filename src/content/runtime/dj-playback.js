import { runtimeLive, runtimeSaveState, runtimeSeamless, runtimeState, updateRuntimeLive, updateRuntimeSeamless } from "./context.js";
import { asset, createElement } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";
import { registerDjHandoff } from "./dj-handoff.js";

function registerDjPlayback1(r) {
r.$renderDjTools = function renderDjTools() {
      r.$djDrawer.replaceChildren();
      r.$djDrawer.classList.toggle("is-open", runtimeState.dj.open);
      r.$djDrawer.setAttribute("aria-hidden", String(!runtimeState.dj.open));
      r.$djPlayerButton.classList.toggle("is-active", runtimeState.dj.open);
      r.$djPlayerButton.setAttribute("aria-expanded", String(runtimeState.dj.open));
      r.$djPlayerButton.setAttribute("aria-label", runtimeState.dj.open ? "Close DJ tools" : "Open DJ tools");
      r.$syncPageDjToolsUi();
      if (runtimeState.dj.open) r.$djDrawer.append(r.$createDjToolsCard());
      r.$renderPageDjTools();
    };
}

function registerDjWaveformControl(r) {
r.$createDjWaveform = function createDjWaveform() {
const waveformButton = createElement("button", "hub-dj-waveform");
        waveformButton.type = "button";
        waveformButton.disabled = !runtimeSeamless.enabled || !runtimeSeamless.waveform?.length;
        waveformButton.setAttribute("aria-label", "Track waveform. Click to seek.");
        const waveformCanvas = createElement("canvas", "hub-dj-waveform-canvas");
        waveformButton.append(waveformCanvas);
        waveformButton.addEventListener("click", (event) => {
          const duration = Number(runtimeSeamless.duration) || 0;
          if (!duration) return;
          const bounds = waveformButton.getBoundingClientRect();
          const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: duration * progress });
        });
        r.$drawDjWaveform(waveformCanvas);
      return waveformButton;
    };
}

function registerDjAnalysisControls(r) {
r.$createDjAnalysis = function createDjAnalysis(bpm) {
      const analysisRow = createElement("div", "hub-dj-analysis-row");
      const bpmEditor = createElement("div", "hub-dj-bpm-editor");
      const bpmLabel = createElement("span");
      bpmLabel.className = `hub-dj-bpm-label${runtimeState.dj.autoTempo ? " is-active" : ""}`;
      bpmEditor.append(bpmLabel);
      const bpmValueRow = createElement("div", "hub-dj-bpm-value-row");
      const bpmInput = createElement("input", "hub-dj-bpm-input");
      bpmInput.type = "text";
      bpmInput.inputMode = "decimal";
      bpmInput.pattern = "[0-9]*[.]?[0-9]*";
      bpmInput.min = "40";
      bpmInput.max = "300";
      bpmInput.step = "0.1";
      bpmInput.placeholder = runtimeSeamless.bpmStatus === "analyzing" ? "…" : "—";
      bpmInput.title = "Click to edit BPM";
      bpmInput.setAttribute("aria-label", "Track BPM. Click to edit.");
      const refreshDisplayedBpm = () => {
        const tempoAdjusted = Boolean(bpm && Math.abs(runtimeState.dj.rate - 1) > 0.001);
        bpmLabel.textContent = `BPM · ${runtimeState.dj.autoTempo ? "AUTO" : "MANUAL"}${tempoAdjusted ? " · ↕" : ""}`;
        bpmLabel.title = tempoAdjusted ? "BPM adjusted by the tempo control" : "";
        bpmInput.value = r.$bpmEditing ? r.$bpmDraft : (bpm ? String(Math.round(bpm * runtimeState.dj.rate * 10) / 10) : "");
      };
      refreshDisplayedBpm();
      bpmInput.disabled = !runtimeSeamless.enabled;
      const setManualBpm = () => {
        const displayedValue = Math.max(40, Math.min(300, Number(bpmInput.value)));
        if (!Number.isFinite(displayedValue) || !bpm) return;
        bpmInput.value = String(Math.round(displayedValue * 10) / 10);
        if (runtimeState.dj.autoTempo) {
          const detectedBase = Number(runtimeSeamless.automaticBpm) || bpm;
          const targetRate = Math.max(0.35, Math.min(2, displayedValue / detectedBase));
          runtimeState.dj.rate = targetRate;
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, {
            rate: targetRate,
            preservePitch: runtimeState.dj.preservePitch
          });
        } else {
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_BPM, { bpm: displayedValue });
        }
      };
      bpmInput.addEventListener("change", setManualBpm);
      bpmInput.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        r.$bpmEditing = true;
        r.$bpmDraft = bpmInput.value;
      });
      bpmInput.addEventListener("focus", () => {
        r.$bpmEditing = true;
        r.$bpmDraft = bpmInput.value;
        bpmInput.select();
      });
      bpmInput.addEventListener("input", () => {
        r.$bpmDraft = bpmInput.value;
      });
      bpmInput.addEventListener("blur", () => {
        r.$bpmEditing = false;
        r.$bpmDraft = "";
        window.setTimeout(() => {
          if (!r.$bpmEditing) r.$renderDjTools();
        }, 0);
      });
      bpmInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") bpmInput.blur();
        if (event.key === "Escape") {
          r.$bpmEditing = false;
          r.$bpmDraft = "";
          refreshDisplayedBpm();
          bpmInput.blur();
        }
        event.stopPropagation();
      });
      const resetBpm = createElement("button", "hub-dj-reset-symbol hub-dj-bpm-reset");
      resetBpm.style.setProperty("--hub-reset-icon", `url('${asset("icon-reset.svg")}')`);
      resetBpm.type = "button";
      resetBpm.disabled = !runtimeSeamless.enabled || !bpm;
      resetBpm.title = "Reset BPM and tempo";
      resetBpm.setAttribute("aria-label", "Reset BPM and tempo");
      resetBpm.addEventListener("click", () => {
        r.$bpmTapTimes = [];
        r.$bpmEditing = false;
        r.$bpmDraft = "";
        runtimeState.dj.rate = 1;
        runtimeSaveState();
        void r.$seamlessCommand(MESSAGES.SEAMLESS_RESET_BPM).then(() => r.$seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, {
          rate: 1,
          preservePitch: runtimeState.dj.preservePitch
        }));
      });
      bpmValueRow.append(bpmInput, resetBpm);
      bpmEditor.append(bpmValueRow);

      const keyReadout = createElement("div", "hub-dj-key");
      keyReadout.title = runtimeSeamless.detectedKey?.name ? `Detected key: ${runtimeSeamless.detectedKey.name}` : "Musical key is detected automatically";
      keyReadout.append(
        createElement("span", "", "KEY"),
        createElement("strong", "", runtimeSeamless.detectedKey?.camelot || (runtimeSeamless.bpmStatus === "analyzing" ? "…" : "—")),
        createElement("small", "", runtimeSeamless.detectedKey?.shortName || "")
      );

      const tap = createElement("button", "hub-dj-action hub-dj-compact-action", "Tap");
      tap.type = "button";
      tap.disabled = !runtimeSeamless.enabled;
      tap.title = "Tap repeatedly to set this track's BPM";
      tap.addEventListener("click", () => {
        const now = performance.now();
        if (!r.$bpmTapTimes.length || now - r.$bpmTapTimes.at(-1) > 2200) r.$bpmTapTimes = [];
        r.$bpmTapTimes.push(now);
        r.$bpmTapTimes = r.$bpmTapTimes.slice(-7);
        if (r.$bpmTapTimes.length < 2) return;
        const intervals = r.$bpmTapTimes.slice(1).map((time, index) => time - r.$bpmTapTimes[index]);
        let tappedBpm = 60000 / (intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length);
        while (tappedBpm < 70) tappedBpm *= 2;
        while (tappedBpm > 180) tappedBpm /= 2;
        tappedBpm = Math.round(tappedBpm * 10) / 10;
        bpmInput.value = String(tappedBpm);
        if (runtimeState.dj.autoTempo && bpm) {
          const detectedBase = Number(runtimeSeamless.automaticBpm) || bpm;
          const targetRate = Math.max(0.35, Math.min(2, tappedBpm / detectedBase));
          runtimeState.dj.rate = targetRate;
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, { rate: targetRate, preservePitch: runtimeState.dj.preservePitch });
        } else {
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_BPM, { bpm: tappedBpm });
        }
      });

      const autoBpm = createElement("button", `hub-dj-action hub-dj-compact-action hub-dj-status-button${runtimeState.dj.autoTempo ? " is-active" : ""}`, runtimeSeamless.bpmStatus === "analyzing" ? "…" : "Auto");
      if (runtimeState.dj.autoTempo && runtimeSeamless.bpmStatus !== "analyzing") autoBpm.append(createElement("span", "hub-dj-active-dot"));
      autoBpm.type = "button";
      autoBpm.disabled = runtimeSeamless.bpmStatus === "analyzing" || !runtimeSeamless.enabled;
      autoBpm.setAttribute("aria-pressed", String(runtimeState.dj.autoTempo));
      autoBpm.title = runtimeState.dj.autoTempo ? "Turn off automatic tempo control" : "Use the automatically detected BPM to control playback tempo";
      autoBpm.addEventListener("click", () => {
        r.$bpmTapTimes = [];
        runtimeState.dj.autoTempo = !runtimeState.dj.autoTempo;
        if (!runtimeState.dj.autoTempo) runtimeState.dj.rate = 1;
        runtimeSaveState();
        r.$renderDjTools();
        if (runtimeState.dj.autoTempo) void r.$seamlessCommand(MESSAGES.SEAMLESS_ANALYZE_BPM);
        else void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_RATE, { rate: 1, preservePitch: runtimeState.dj.preservePitch });
      });
      analysisRow.append(bpmEditor, keyReadout, tap, autoBpm);
      return { analysisRow, refreshDisplayedBpm };
    };
}

function registerDjEqControls(r) {
r.$createDjEqControls = function createDjEqControls() {
      const formatDb = (value) => value === 0 ? "0" : `${value > 0 ? "+" : ""}${value}`;
      const addKnob = ({ label, value, min, max, size = "", step = 1, resetValue = 0, format = formatDb, onInput }) => {
        const knob = createElement("label", `hub-dj-knob${size ? ` ${size}` : ""}`);
        knob.append(createElement("span", "hub-dj-knob-label", label));
        const dial = createElement("span", "hub-dj-knob-dial");
        const control = createElement("input", "hub-dj-knob-input");
        control.type = "range";
        control.min = String(min);
        control.max = String(max);
        control.step = String(step);
        control.value = String(value);
        control.setAttribute("aria-label", `${label} control`);
        const readout = createElement("output", "hub-dj-knob-output");
        const update = (nextValue, apply = true) => {
          const precision = String(step).includes(".") ? String(step).split(".")[1].length : 0;
          const numeric = Math.max(min, Math.min(max, Number(Number(nextValue).toFixed(precision))));
          const rotation = -135 + ((numeric - min) / (max - min)) * 270;
          control.value = String(numeric);
          dial.style.setProperty("--hub-knob-angle", `${rotation}deg`);
          readout.textContent = format(numeric);
          if (apply) onInput(numeric);
        };
        control.addEventListener("input", () => update(control.value));
        control.addEventListener("keydown", (event) => {
          if (event.key === "Home") update(min);
          if (event.key === "End") update(max);
        });
        dial.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          control.focus({ preventScroll: true });
          dial.classList.add("is-dragging");
          const startX = event.clientX;
          const startY = event.clientY;
          const startValue = Number(control.value);
          const bounds = dial.getBoundingClientRect();
          const mode = runtimeState.dj.knobMode || "both";
          const pointerId = event.pointerId;
          let finished = false;
          const move = (moveEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            moveEvent.preventDefault();
            let nextValue = startValue;
            if (mode === "radial") {
              let angle = (Math.atan2(moveEvent.clientY - (bounds.top + bounds.height / 2), moveEvent.clientX - (bounds.left + bounds.width / 2)) * 180) / Math.PI + 90;
              if (angle > 180) angle -= 360;
              angle = Math.max(-135, Math.min(135, angle));
              nextValue = min + ((angle + 135) / 270) * (max - min);
            } else {
              const horizontal = moveEvent.clientX - startX;
              const vertical = startY - moveEvent.clientY;
              const dragDistance = mode === "vertical"
                ? vertical
                : mode === "horizontal"
                  ? horizontal
                  : Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
              nextValue = startValue + (dragDistance / 120) * (max - min);
            }
            update(nextValue);
          };
          const finish = () => {
            if (finished) return;
            finished = true;
            dial.classList.remove("is-dragging");
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", finish, true);
            window.removeEventListener("pointercancel", finish, true);
            window.removeEventListener("blur", finish, true);
            document.removeEventListener("visibilitychange", visibilityChanged, true);
            runtimeSaveState();
          };
          const visibilityChanged = () => {
            if (document.visibilityState !== "visible") finish();
          };
          window.addEventListener("pointermove", move, { capture: true, passive: false });
          window.addEventListener("pointerup", finish, true);
          window.addEventListener("pointercancel", finish, true);
          window.addEventListener("blur", finish, true);
          document.addEventListener("visibilitychange", visibilityChanged, true);
        });
        knob.addEventListener("dblclick", (event) => {
          event.preventDefault();
          update(resetValue);
          runtimeSaveState();
        });
        dial.append(control);
        knob.append(dial, readout);
        update(value, false);
        return knob;
      };

      const createPanelReset = (title, action) => {
        const button = createElement("button", "hub-dj-reset-symbol hub-dj-panel-reset");
        button.style.setProperty("--hub-reset-icon", `url('${asset("icon-reset.svg")}')`);
        button.type = "button";
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", () => {
          action();
          r.$applyDjToAudio();
          runtimeSaveState();
          r.$render();
        });
        return button;
      };

      const eqPanel = createElement("section", "hub-dj-eq-panel");
      eqPanel.append(addKnob({
        label: "Filter", value: Math.round(runtimeState.dj.filterValue * 100), min: -100, max: 100,
        format: (value) => value < -1 ? "LP" : value > 1 ? "HP" : "Off",
        onInput: (value) => { runtimeState.dj.filterValue = value / 100; r.$applyDjToAudio(); }
      }));
      for (const [label, key] of [["High", "eqHighDb"], ["Mid", "eqMidDb"], ["Low", "eqLowDb"]]) {
        eqPanel.append(addKnob({
          label, value: runtimeState.dj[key], min: -12, max: 12,
          onInput: (value) => { runtimeState.dj[key] = value; r.$applyDjToAudio(); }
        }));
      }
      eqPanel.append(createPanelReset("Reset filter and EQ", () => {
        runtimeState.dj.filterValue = 0;
        runtimeState.dj.eqLowDb = 0;
        runtimeState.dj.eqMidDb = 0;
        runtimeState.dj.eqHighDb = 0;
      }));
      return { eqPanel, addKnob, createPanelReset, formatDb };
    };
}

function registerDjPlatterKeyboard(r) {
r.$bindDjPlatterKeyboard = function bindDjPlatterKeyboard(platter, startCoast, cancelMomentum) {
      platter.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        cancelMomentum();
        const positive = event.key === "ArrowUp" || event.key === "ArrowRight";
        startCoast(positive ? 0.75 : -0.75, Number(platter.dataset.angle) || 0);
      });
    };
}

function registerDjPlatter(r) {
r.$createDjPlatter = function createDjPlatter() {
      const platter = createElement("div", "hub-dj-platter");
      platter.tabIndex = 0;
      platter.setAttribute("role", "slider");
      platter.setAttribute("aria-label", "Jog wheel. Flick up or right, or down or left, then release to coast.");
      platter.setAttribute("aria-valuemin", "-35");
      platter.setAttribute("aria-valuemax", "35");
      platter.setAttribute("aria-valuenow", "0");
      platter.append(
        createElement("span", "hub-dj-platter-dot"),
        createElement("span", "hub-dj-platter-spindle"),
        createElement("span", "hub-dj-platter-grip")
      );
      let scratchFrame = 0;
      let momentumFrame = 0;
      let vinylFrame = 0;
      let vinylMultiplier = 1;
      let pendingScratch = 1;
      let lastScratchSentAt = 0;
      const sendScratch = (multiplier, active = true) => {
        if (runtimeSeamless.enabled) {
          pendingScratch = multiplier;
          if (!active) {
            window.cancelAnimationFrame(scratchFrame);
            scratchFrame = 0;
            void r.$runtimeMessage({ type: MESSAGES.SEAMLESS_SCRATCH, active: false, multiplier: 1 });
          } else if (!scratchFrame) {
            const flush = (now) => {
              if (now - lastScratchSentAt < 32) {
                scratchFrame = window.requestAnimationFrame(flush);
                return;
              }
              scratchFrame = 0;
              lastScratchSentAt = now;
              void r.$runtimeMessage({ type: MESSAGES.SEAMLESS_SCRATCH, active: true, multiplier: pendingScratch });
            };
            scratchFrame = window.requestAnimationFrame(flush);
          }
          return;
        }
        const target = r.$getAudio();
        if (!target) return;
        if (active) {
          target.playbackRate = Math.max(0.35, Math.min(2, runtimeState.dj.rate * multiplier));
          if ("preservesPitch" in target) target.preservesPitch = false;
          if ("webkitPreservesPitch" in target) target.webkitPreservesPitch = false;
        } else {
          r.$applyDjToAudio(target);
        }
      };
      const updatePlatter = (angle, velocity) => {
        const bend = Math.max(-0.48, Math.min(0.48, velocity * 0.28));
        platter.dataset.angle = String(angle);
        platter.style.setProperty("--hub-platter-angle", `${angle}deg`);
        platter.setAttribute("aria-valuenow", String(Math.round(bend * 100)));
        sendScratch(1 + bend);
      };
      const stopScratch = () => {
        window.cancelAnimationFrame(momentumFrame);
        window.cancelAnimationFrame(vinylFrame);
        momentumFrame = 0;
        vinylFrame = 0;
        vinylMultiplier = 1;
        platter.classList.remove("is-scratching", "is-coasting", "is-vinyl-releasing");
        platter.setAttribute("aria-valuenow", "0");
        sendScratch(1, false);
      };
      const vinylTransition = (from, to, releasing = false) => {
        window.cancelAnimationFrame(vinylFrame);
        const duration = 80 + Math.max(0, Math.min(1, runtimeState.dj.vinylSpeedAdjust)) * 820;
        const startedAt = performance.now();
        if (releasing) {
          platter.classList.remove("is-scratching");
          platter.classList.add("is-vinyl-releasing");
        }
        const transition = (now) => {
          const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
          const eased = 1 - Math.pow(1 - progress, 2);
          vinylMultiplier = from + (to - from) * eased;
          sendScratch(vinylMultiplier);
          if (progress < 1) {
            vinylFrame = window.requestAnimationFrame(transition);
          } else {
            vinylFrame = 0;
            if (releasing) stopScratch();
          }
        };
        vinylFrame = window.requestAnimationFrame(transition);
      };
      const startCoast = (initialVelocity, initialAngle) => {
        let velocity = initialVelocity;
        let angle = initialAngle;
        if (Math.abs(velocity) < 0.025) {
          stopScratch();
          return;
        }
        platter.classList.remove("is-scratching");
        platter.classList.add("is-coasting");
        let previousFrame = performance.now();
        const coast = (now) => {
          const elapsed = Math.max(8, Math.min(34, now - previousFrame));
          previousFrame = now;
          const resistance = Math.max(0, Math.min(1, runtimeState.dj.jogAdjust));
          velocity *= Math.pow(0.978 - resistance * 0.03, elapsed / 16.67);
          if (Math.abs(velocity) < 0.018) {
            stopScratch();
            return;
          }
          angle += velocity * elapsed * 3;
          updatePlatter(angle, velocity);
          momentumFrame = window.requestAnimationFrame(coast);
        };
        momentumFrame = window.requestAnimationFrame(coast);
      };
      platter.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        try { platter.setPointerCapture(event.pointerId); } catch {}
        platter.classList.add("is-scratching");
        platter.classList.remove("is-coasting");
        window.cancelAnimationFrame(momentumFrame);
        window.cancelAnimationFrame(vinylFrame);
        momentumFrame = 0;
        vinylFrame = 0;
        sendScratch(1, false);
        vinylMultiplier = 1;
        vinylTransition(1, 0.35);
        const pointerId = event.pointerId;
        let dragging = true;
        let lastX = event.clientX;
        let lastY = event.clientY;
        let lastTime = event.timeStamp;
        let lastMoveAt = performance.now();
        let velocity = 0;
        let moved = false;
        let angle = Number(platter.dataset.angle) || 0;
        const move = (moveEvent) => {
          if (!dragging || moveEvent.pointerId !== pointerId) return;
          moveEvent.preventDefault();
          const elapsed = Math.max(8, moveEvent.timeStamp - lastTime);
          const deltaX = moveEvent.clientX - lastX;
          const deltaY = moveEvent.clientY - lastY;
          const travel = deltaX - deltaY;
          if (!moved && Math.abs(travel) >= 1) {
            moved = true;
            window.cancelAnimationFrame(vinylFrame);
            vinylFrame = 0;
          }
          const response = 1.15 - Math.max(0, Math.min(1, runtimeState.dj.jogAdjust)) * 0.3;
          const instantaneousVelocity = Math.max(-3.2, Math.min(3.2, (travel / elapsed) * response));
          velocity = velocity * 0.25 + instantaneousVelocity * 0.75;
          angle += travel * 3;
          updatePlatter(angle, velocity);
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          lastTime = moveEvent.timeStamp;
          lastMoveAt = performance.now();
        };
        const cleanup = () => {
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", finish, true);
          window.removeEventListener("pointercancel", cancel, true);
          window.removeEventListener("blur", cancel, true);
          document.removeEventListener("visibilitychange", visibilityChanged, true);
        };
        const finish = (finishEvent) => {
          if (!dragging || (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== pointerId)) return;
          dragging = false;
          cleanup();
          try { platter.releasePointerCapture(pointerId); } catch {}
          if (!moved) {
            vinylTransition(vinylMultiplier, 1, true);
            return;
          }
          const idleTime = Math.max(0, performance.now() - lastMoveAt);
          velocity *= Math.exp(-idleTime / 90);
          startCoast(velocity, angle);
        };
        const cancel = () => {
          if (!dragging) return;
          dragging = false;
          cleanup();
          try { platter.releasePointerCapture(pointerId); } catch {}
          stopScratch();
        };
        const visibilityChanged = () => {
          if (document.visibilityState !== "visible") cancel();
        };
        window.addEventListener("pointermove", move, { capture: true, passive: false });
        window.addEventListener("pointerup", finish, true);
        window.addEventListener("pointercancel", cancel, true);
        window.addEventListener("blur", cancel, true);
        document.addEventListener("visibilitychange", visibilityChanged, true);
      });
      r.$bindDjPlatterKeyboard(platter, startCoast, () => window.cancelAnimationFrame(momentumFrame));
      return platter;
    };
}

function registerDjPerformanceControls(r) {
r.$createDjPerformancePanel = function createDjPerformancePanel(bpm, addKnob) {
      const performancePanel = createElement("section", "hub-dj-performance-panel");
      const platterAdjustments = createElement("div", "hub-dj-platter-adjustments");
      platterAdjustments.append(
        addKnob({
          label: "Jog adjust",
          value: Math.round(runtimeState.dj.jogAdjust * 100),
          min: 0,
          max: 100,
          size: "is-mini",
          resetValue: 50,
          format: (value) => value < 34 ? "Light" : value > 66 ? "Heavy" : "Mid",
          onInput: (value) => { runtimeState.dj.jogAdjust = value / 100; }
        }),
        addKnob({
          label: "Vinyl speed",
          value: Math.round(runtimeState.dj.vinylSpeedAdjust * 100),
          min: 0,
          max: 100,
          size: "is-mini",
          resetValue: 35,
          format: (value) => value < 34 ? "Fast" : value > 66 ? "Slow" : "Mid",
          onInput: (value) => { runtimeState.dj.vinylSpeedAdjust = value / 100; }
        })
      );
      const platter = r.$createDjPlatter();
      const loopPages = [[1 / 16, 1 / 8, 1 / 4, 1 / 2], [1, 2, 4, 8]];
      const loopSizes = loopPages.flat();
      const formatLoopSize = (beats) => ({
        [1 / 16]: "1/16",
        [1 / 8]: "1/8",
        [1 / 4]: "1/4",
        [1 / 2]: "1/2"
      })[beats] || String(beats);
      const activeLoopSize = loopSizes.includes(Number(runtimeSeamless.loopBeats)) ? Number(runtimeSeamless.loopBeats) : 0;
      const savedLoopSize = loopSizes.includes(Number(runtimeState.dj.loopSize)) ? Number(runtimeState.dj.loopSize) : 4;
      const selectedLoopSize = activeLoopSize || savedLoopSize;
      runtimeState.dj.loopSize = selectedLoopSize;
      const savedLoopPage = [0, 1].includes(Number(runtimeState.dj.loopPage)) ? Number(runtimeState.dj.loopPage) : (selectedLoopSize < 1 ? 0 : 1);
      const visibleLoopSizes = loopPages[savedLoopPage];
      const loopControls = createElement("div", `hub-dj-loop-controls${activeLoopSize ? " is-active" : ""}`);
      loopControls.setAttribute("aria-label", activeLoopSize
        ? `${formatLoopSize(activeLoopSize)}-beat loop active`
        : "Beat loop off");
      const loopHeader = createElement("div", "hub-dj-loop-header");
      const changeLoopPage = (nextPage) => {
        if (nextPage === savedLoopPage || !loopPages[nextPage]) return;
        runtimeState.dj.loopPage = nextPage;
        runtimeSaveState();
        r.$renderDjTools();
      };
      const smallerLoop = createElement("button", "hub-dj-loop-arrow", "‹");
      smallerLoop.type = "button";
      smallerLoop.disabled = savedLoopPage === 0;
      smallerLoop.title = "Show smaller loop sizes";
      smallerLoop.setAttribute("aria-label", "Show smaller beat-loop sizes");
      smallerLoop.addEventListener("click", () => changeLoopPage(0));
      const largerLoop = createElement("button", "hub-dj-loop-arrow", "›");
      largerLoop.type = "button";
      largerLoop.disabled = savedLoopPage === loopPages.length - 1;
      largerLoop.title = "Show larger loop sizes";
      largerLoop.setAttribute("aria-label", "Show larger beat-loop sizes");
      largerLoop.addEventListener("click", () => changeLoopPage(1));
      loopHeader.append(smallerLoop, createElement("span", "hub-dj-loop-label", "Beat loop"), largerLoop);
      const loopOptions = createElement("div", "hub-dj-loop-options");
      for (const beats of visibleLoopSizes) {
        const active = activeLoopSize === beats;
        const option = createElement("button", `hub-dj-loop-button${active ? " is-active" : ""}`, formatLoopSize(beats));
        option.type = "button";
        option.disabled = !runtimeSeamless.enabled || !bpm;
        option.setAttribute("aria-label", active
          ? `Deactivate ${formatLoopSize(beats)}-beat loop`
          : `Activate ${formatLoopSize(beats)}-beat loop`);
        option.setAttribute("aria-pressed", String(active));
        option.title = bpm ? `${active ? "Exit" : "Start"} ${formatLoopSize(beats)}-beat loop` : "Analyze BPM before starting a beat loop";
        option.addEventListener("click", () => {
          const nextLoopBeats = active ? 0 : beats;
          runtimeState.dj.loopSize = beats;
          runtimeState.dj.loopPage = savedLoopPage;
          r.$pendingLoopBeats = nextLoopBeats;
          runtimeSeamless.loopBeats = nextLoopBeats;
          runtimeSaveState();
          r.$renderDjTools();
          void r.$seamlessCommand(MESSAGES.SEAMLESS_SET_LOOP, { beats: nextLoopBeats, bpm }).then((result) => {
            if (result || r.$pendingLoopBeats !== nextLoopBeats) return;
            r.$pendingLoopBeats = null;
            void r.$syncSeamlessState();
          });
        });
        loopOptions.append(option);
      }
      loopControls.append(loopHeader, loopOptions);
      performancePanel.append(platterAdjustments, platter, loopControls);
      return performancePanel;
    };
}

function registerDjFaderControls(r) {
r.$createDjFaderPanel = function createDjFaderPanel(tempoPercent, refreshDisplayedBpm, formatDb, createPanelReset) {
      const faderPanel = createElement("section", "hub-dj-fader-panel");
      const rangeValues = [6, 10, 16, 50];
      const rangeLabel = (range) => range === 50 ? "Wide" : `±${range}`;
      const modeButtons = createElement("div", "hub-dj-mode-buttons");
      const tempoRange = createElement("button", "hub-dj-mode-button", rangeLabel(runtimeState.dj.range));
      tempoRange.type = "button";
      tempoRange.setAttribute("aria-label", `Tempo range ${rangeLabel(runtimeState.dj.range)}. Click for next range.`);
      const masterTempo = createElement("button", `hub-dj-mode-button hub-dj-master hub-dj-status-button${runtimeState.dj.preservePitch ? " is-active" : ""}`, "MT");
      if (runtimeState.dj.preservePitch) masterTempo.append(createElement("span", "hub-dj-active-dot"));
      masterTempo.type = "button";
      masterTempo.setAttribute("aria-label", "Master Tempo");
      masterTempo.setAttribute("aria-pressed", String(runtimeState.dj.preservePitch));
      modeButtons.append(tempoRange, masterTempo);
      const faders = createElement("div", "hub-dj-faders");
      const addFader = ({ label, value, min, max, step, className = "", format, onInput, resetTitle, onReset }) => {
        const fader = createElement("div", `hub-dj-fader${className ? ` ${className}` : ""}`);
        const output = createElement("output", "hub-dj-fader-output", format(value));
        const rail = createElement("span", "hub-dj-fader-rail");
        const control = createElement("input", "hub-dj-fader-input");
        control.type = "range";
        control.min = String(min);
        control.max = String(max);
        control.step = String(step);
        control.value = String(value);
        control.setAttribute("aria-label", label);
        control.addEventListener("input", () => {
          onInput(Number(control.value));
          output.textContent = format(Number(control.value));
        });
        control.addEventListener("change", runtimeSaveState);
        rail.addEventListener("dblclick", (event) => {
          event.preventDefault();
          onReset();
          control.value = "0";
          output.textContent = format(0);
          r.$applyDjToAudio();
          runtimeSaveState();
          r.$render();
        });
        rail.append(control);
        fader.append(
          createElement("span", "hub-dj-fader-label", label),
          output,
          rail,
          createPanelReset(resetTitle, onReset)
        );
        faders.append(fader);
        return control;
      };
      const tempoOutputFormat = (value) => r.$signedPercent(value);
      const tempoSlider = addFader({
        label: "Tempo", value: tempoPercent, min: -runtimeState.dj.range, max: runtimeState.dj.range, step: 0.1,
        format: tempoOutputFormat,
        onInput: (value) => { r.$setDjTempo(value); refreshDisplayedBpm(); },
        resetTitle: "Reset tempo",
        onReset: () => { runtimeState.dj.rate = 1; runtimeState.dj.preservePitch = true; }
      });
      addFader({
        label: "Gain", value: runtimeState.dj.gainDb, min: -30, max: 6, step: 1, className: "is-gain",
        format: (value) => value <= -30 ? "Mute" : `${formatDb(value)}dB`,
        onInput: (value) => { runtimeState.dj.gainDb = value; r.$applyDjToAudio(); },
        resetTitle: "Reset gain",
        onReset: () => { runtimeState.dj.gainDb = 0; }
      });
      tempoRange.addEventListener("click", () => {
        const current = rangeValues.indexOf(runtimeState.dj.range);
        runtimeState.dj.range = rangeValues[(current + 1) % rangeValues.length];
        r.$setDjTempo(Math.max(-runtimeState.dj.range, Math.min(runtimeState.dj.range, r.$tempoPercentFromState())));
        tempoSlider.min = String(-runtimeState.dj.range);
        tempoSlider.max = String(runtimeState.dj.range);
        tempoSlider.value = String(r.$tempoPercentFromState());
        tempoRange.textContent = rangeLabel(runtimeState.dj.range);
        tempoRange.setAttribute("aria-label", `Tempo range ${rangeLabel(runtimeState.dj.range)}. Click for next range.`);
        refreshDisplayedBpm();
        runtimeSaveState();
      });
      masterTempo.addEventListener("click", () => {
        runtimeState.dj.preservePitch = !runtimeState.dj.preservePitch;
        masterTempo.classList.toggle("is-active", runtimeState.dj.preservePitch);
        masterTempo.setAttribute("aria-pressed", String(runtimeState.dj.preservePitch));
        masterTempo.querySelector(".hub-dj-active-dot")?.remove();
        if (runtimeState.dj.preservePitch) masterTempo.append(createElement("span", "hub-dj-active-dot"));
        r.$applyDjToAudio();
        runtimeSaveState();
      });
      faderPanel.append(modeButtons, faders);
      return faderPanel;
    };
}

function registerDjPlayback2(r) {
r.$createDjToolsCard = function createDjToolsCard({ includeWaveform = true } = {}) {
      const card = createElement("section", "hub-card hub-dj-card");
      card.setAttribute("aria-label", "DJ playback tools");

      const bpm = Number(runtimeSeamless.detectedBpm) || null;
      const tempoPercent = (runtimeState.dj.rate - 1) * 100;

      if (includeWaveform) card.append(r.$createDjWaveform());
      const { analysisRow, refreshDisplayedBpm } = r.$createDjAnalysis(bpm);
      card.append(analysisRow);
      const deckControls = createElement("div", "hub-dj-deck-controls");
      const { eqPanel, addKnob, createPanelReset, formatDb } = r.$createDjEqControls();
      const performancePanel = r.$createDjPerformancePanel(bpm, addKnob);
      const faderPanel = r.$createDjFaderPanel(tempoPercent, refreshDisplayedBpm, formatDb, createPanelReset);

      deckControls.append(eqPanel, performancePanel, faderPanel);
      card.append(deckControls);
      return card;
    };
}

function registerDjPlayback3(r) {
r.$drawDjWaveform = function drawDjWaveform(canvas) {
      window.requestAnimationFrame(() => {
        const points = runtimeSeamless.waveform || [];
        const bounds = canvas.getBoundingClientRect();
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.round(bounds.width * ratio));
        const height = Math.max(1, Math.round(bounds.height * ratio));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.clearRect(0, 0, width, height);
        const styles = getComputedStyle(r.$host);
        const played = styles.getPropertyValue("--hub-accent").trim() || "#1da0c3";
        const remaining = styles.getPropertyValue("--hub-line").trim() || "#d1d5db";
        const progress = Math.max(0, Math.min(1, Number(runtimeSeamless.progress) || 0));
        const barWidth = width / Math.max(1, points.length);
        for (let index = 0; index < points.length; index += 1) {
          const amplitude = Math.max(2 * ratio, (Number(points[index]) / 100) * (height - 4 * ratio));
          context.fillStyle = index / points.length <= progress ? played : remaining;
          context.fillRect(index * barWidth, (height - amplitude) / 2, Math.max(1, barWidth - ratio), amplitude);
        }
      });
    };
r.$tempoPercentFromState = function tempoPercentFromState() {
      return (runtimeState.dj.rate - 1) * 100;
    };
r.$recordActivePlaylistAnalysis = function recordActivePlaylistAnalysis() {
      if (runtimeState.recordPlaylistMetadata === false || !runtimeSeamless.track) return false;
      const bpm = r.$normalizePlaylistBpm(runtimeSeamless.detectedBpm);
      const key = r.$normalizePlaylistKey(runtimeSeamless.detectedKey);
      if (!bpm && !key) return false;
      let changed = false;
      const record = (item) => {
        if (!r.$playlistTracksMatch(item, runtimeSeamless.track)) return item;
        const next = {
          ...item,
          bpm: bpm ?? item.bpm,
          key: key ?? item.key
        };
        if (JSON.stringify(next) === JSON.stringify(item)) return item;
        changed = true;
        return next;
      };
      runtimeState.playlist = runtimeState.playlist.map(record);
      runtimeState.savedPlaylists = runtimeState.savedPlaylists.map((snapshot) => ({
        ...snapshot,
        items: (snapshot.items || []).map(record)
      }));
      if (changed) runtimeSaveState();
      return changed;
    };
r.$consumeCompletedNowPlayingItems = function consumeCompletedNowPlayingItems() {
      if (runtimeSeamless.status === "ended") {
        if (!runtimeState.playlist.length) return false;
        runtimeState.playlist = [];
        runtimeState.playlistMode = "browse";
        runtimeSaveState();
        return true;
      }
      if (!runtimeSeamless.enabled || !runtimeSeamless.track || runtimeState.playlist.length < 2) return false;
      const activeIndex = runtimeState.playlist.findIndex((item) => r.$playlistTracksMatch(item, runtimeSeamless.track));
      if (activeIndex <= 0) return false;
      runtimeState.playlist = r.$normalizePlaylist(runtimeState.playlist.slice(activeIndex));
      runtimeSaveState();
      // Now Playing represents only the current track and Up Next. Keep the
      // offscreen queue aligned after consuming completed items so Previous
      // cannot resurrect a track that is no longer visible in the queue.
      void r.$syncActivePlaylistQueue();
      return true;
    };
r.$applySeamlessState = function applySeamlessState(nextState) {
      if (!nextState || typeof nextState !== "object") return;
      if (r.$nowPlayingExplicitlyCleared && nextState.enabled) return;
      const wasEnabled = runtimeSeamless.enabled;
      const incomingState = { ...nextState };
      if (r.$pendingLoopBeats !== null) {
        if (Number(incomingState.loopBeats) === r.$pendingLoopBeats) {
          r.$pendingLoopBeats = null;
        } else {
          delete incomingState.loopBeats;
          delete incomingState.loopStart;
          delete incomingState.loopEnd;
        }
      }
      r.$seamless = updateRuntimeSeamless({ ...runtimeSeamless, ...incomingState });
      if (runtimeSeamless.enabled && !r.$pendingFeedTrackId) r.$silenceNativePagePlayback();
      if (r.$pendingPlaylistItemId && runtimeSeamless.status !== "loading") {
        const pendingItem = runtimeState.playlist.find((item) => item.playlistItemId === r.$pendingPlaylistItemId);
        if (pendingItem && r.$playlistItemMatchesActiveTrack(pendingItem)) r.$pendingPlaylistItemId = "";
      }

      if (runtimeSeamless.enabled && runtimeSeamless.track) {
        if (Number.isFinite(Number(runtimeSeamless.rate))) runtimeState.dj.rate = Number(runtimeSeamless.rate);
        runtimeState.dj.preservePitch = runtimeSeamless.preservePitch !== false;
        if (Number.isFinite(Number(runtimeSeamless.filterValue))) runtimeState.dj.filterValue = Number(runtimeSeamless.filterValue);
        if (Number.isFinite(Number(runtimeSeamless.gainDb))) runtimeState.dj.gainDb = Number(runtimeSeamless.gainDb);
        if (Number.isFinite(Number(runtimeSeamless.eqLowDb))) runtimeState.dj.eqLowDb = Number(runtimeSeamless.eqLowDb);
        if (Number.isFinite(Number(runtimeSeamless.eqMidDb))) runtimeState.dj.eqMidDb = Number(runtimeSeamless.eqMidDb);
        if (Number.isFinite(Number(runtimeSeamless.eqHighDb))) runtimeState.dj.eqHighDb = Number(runtimeSeamless.eqHighDb);
        r.$live = updateRuntimeLive({
          ...runtimeLive,
          available: true,
          isPlaying: Boolean(runtimeSeamless.isPlaying),
          hasPlaybackStarted: true,
          title: runtimeSeamless.track.title || runtimeLive.title,
          artist: runtimeSeamless.track.artist || runtimeLive.artist,
          art: runtimeSeamless.track.art || runtimeLive.art,
          pageUrl: runtimeSeamless.track.pageUrl || runtimeLive.pageUrl,
          artistUrl: runtimeSeamless.track.artistUrl || r.$artistUrlFromPageUrl(runtimeSeamless.track.pageUrl) || runtimeLive.artistUrl,
          currentTime: Number(runtimeSeamless.currentTime) || 0,
          duration: Number(runtimeSeamless.duration) || 0,
          progress: Number(runtimeSeamless.progress) || 0,
          tracks: (runtimeSeamless.queue || []).slice(Math.max(0, Number(runtimeSeamless.index) + 1))
        });
        if (runtimeLive.isPlaying) r.$recordListeningActivity();
      } else if (r.$nowPlayingExplicitlyCleared) {
        r.$resetLoadedPlayback();
      } else if (wasEnabled) {
        r.$resetLoadedPlayback();
        window.setTimeout(r.$scanLivePlayer, 0);
      }

      const playlistAnalysisChanged = r.$recordActivePlaylistAnalysis();
      r.$syncActivePageTrackAnalysis?.();
      const playlistQueueChanged = r.$consumeCompletedNowPlayingItems();

      r.$syncPagePlayerUi();
      r.$syncRecommendationPlaybackUi();
      const activeDjControl = r.$shadow.activeElement;
      const activePageDjControl = r.$pageDjShadow?.activeElement;
      const editingDjControl = r.$bpmEditing
        || (activeDjControl && r.$djDrawer.contains(activeDjControl) && activeDjControl.matches("input"))
        || (activePageDjControl && r.$pageDjSurface?.contains(activePageDjControl) && activePageDjControl.matches("input"));
      const gestureSelector = ".hub-dj-knob-dial.is-dragging, .hub-dj-platter.is-scratching, .hub-dj-platter.is-coasting, .hub-dj-platter.is-vinyl-releasing";
      const activeDjGesture = r.$djDrawer.querySelector(gestureSelector) || r.$pageDjSurface?.querySelector(gestureSelector);
      if ((runtimeState.dj.open || r.$pageDjOpen) && !editingDjControl && !activeDjGesture) r.$renderDjTools();
      r.$renderPlayer();
      if (playlistQueueChanged && runtimeState.activeTab === "playlist") {
        r.$render();
        return;
      }
      if (playlistAnalysisChanged && runtimeState.activeTab === "playlist") {
        if (r.$isNowPlayingView() && runtimeState.playlist.length && r.$content.querySelector(".hub-playlist-stack")) {
          r.$syncCurrentPlaylistAnalysisUi();
          r.$syncCurrentPlaylistPlaybackUi();
        } else {
          r.$render();
        }
        return;
      }
      if (r.$isNowPlayingView()) {
        if (runtimeState.playlist.length && r.$content.querySelector(".hub-playlist-stack")) r.$syncCurrentPlaylistPlaybackUi();
        else if (!(r.$shadow.activeElement && r.$content.contains(r.$shadow.activeElement))) {
          r.$renderPanelContent();
        }
      }
    };
r.$syncSeamlessState = async function syncSeamlessState() {
      const response = await r.$runtimeMessage({ type: MESSAGES.GET_SEAMLESS_STATE });
      if (response?.ok && response.state) r.$applySeamlessState(response.state);
    };
}

export const registerDjPlayback = [registerDjPlatterKeyboard, registerDjWaveformControl, registerDjAnalysisControls, registerDjEqControls, registerDjPlatter, registerDjPerformanceControls, registerDjFaderControls, registerDjPlayback1, registerDjPlayback2, registerDjPlayback3, registerDjHandoff];

export const setupDjPlayback = [];
