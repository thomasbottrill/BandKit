window.setTimeout(async () => {
  const root = document.querySelector("#bandcamp-hub-extension-root")?.querySelector("[data-bandcamp-hub]")?.shadowRoot;
  for (const [key, scenario] of Object.entries(window.fixtureScenarios)) {
    if (!location.search.includes(key)) continue;
    await scenario(root);
    return;
  }
  const pageDjButton = document.querySelector(".bandcamp-hub-page-dj");
  pageDjButton?.click();
  const pageDjRoot = document.querySelector(".inline_player > .bandcamp-hub-page-dj-host")?.shadowRoot;
  const pageDjHost = document.querySelector(".inline_player > .bandcamp-hub-page-dj-host");
  const pageOpenedDj = Boolean(
    pageDjRoot?.querySelector(".hub-dj-card")
    && !root?.querySelector(".hub-dj-card")
    && root?.querySelector(".hub-dj-player-button")?.getAttribute("aria-expanded") === "false"
    && pageDjButton?.getAttribute("aria-expanded") === "true"
    && pageDjButton?.classList.contains("is-active")
    && !pageDjButton?.textContent.trim()
    && getComputedStyle(pageDjButton).width === "32px"
    && getComputedStyle(pageDjButton).borderRadius === "4px"
    && getComputedStyle(pageDjHost).maxWidth === "none"
    && pageDjHost?.getBoundingClientRect().width > 420
  );
  root?.querySelector(".hub-dj-player-button")?.click();
  const mirroredControlSet = Boolean(root?.querySelector(".hub-dj-card"))
    && root?.querySelectorAll(".hub-dj-card button, .hub-dj-card input").length
      === pageDjRoot?.querySelectorAll(".hub-dj-card button, .hub-dj-card input").length;
  root?.querySelector(".hub-dj-player-button")?.click();
  const inlineRemainsOpen = !root?.querySelector(".hub-dj-card")
    && Boolean(pageDjRoot?.querySelector(".hub-dj-card"))
    && pageDjButton?.getAttribute("aria-expanded") === "true";
  root?.querySelector(".hub-dj-player-button")?.click();
  const knobDial = root?.querySelector(".hub-dj-knob-dial");
  const knobInput = knobDial?.querySelector(".hub-dj-knob-input");
  if (knobDial && knobInput) {
    knobDial.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 17, clientX: 100, clientY: 100 }));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 17, clientX: 100, clientY: 40 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 17, clientX: 100, clientY: 40 }));
  }
  const slider = root?.querySelector(".hub-dj-fader:not(.is-gain) .hub-dj-fader-input");
  if (slider) {
    slider.value = "5.5";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const gainRail = root?.querySelector(".hub-dj-fader.is-gain .hub-dj-fader-rail");
  const gainSlider = gainRail?.querySelector(".hub-dj-fader-input");
  if (gainRail && gainSlider) {
    gainSlider.value = "-6";
    gainSlider.dispatchEvent(new Event("input", { bubbles: true }));
    gainRail.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }
  window.fixtureRuntimeListener?.({
    type: "BANDCAMP_HUB_SEAMLESS_STATE",
    state: {
      enabled: true,
      status: "playing",
      isPlaying: true,
      currentTime: 10,
      duration: 180,
      progress: 10 / 180,
      index: 0,
      detectedBpm: 120,
      automaticBpm: 120,
      detectedKey: { camelot: "11A", shortName: "F# min", name: "F-sharp minor" },
      track: { title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track" },
      queue: []
    }
  }, {}, () => {});
  const nativeAction = document.querySelector(".fixture-native-play");
  const nativeButton = document.querySelector(".playbutton");
  const nativeStatus = document.querySelector(".play_status");
  const platterAdjustments = root?.querySelectorAll(".hub-dj-platter-adjustments .hub-dj-knob");
  const bpmReset = root?.querySelector(".hub-dj-bpm-reset");
  const loopButtons = root?.querySelectorAll(".hub-dj-loop-button");
  const loopArrows = root?.querySelectorAll(".hub-dj-loop-arrow");
  const loopFour = [...(loopButtons || [])].find((button) => button.textContent === "4");
  loopFour?.click();
  const activeLoopButton = root?.querySelector('.hub-dj-loop-button[aria-pressed="true"]');
  const activeLoopStyle = activeLoopButton ? getComputedStyle(activeLoopButton) : null;
  const loopOnState = root?.querySelector(".hub-dj-loop-controls")?.classList.contains("is-active")
    && activeLoopButton?.textContent === "4"
    && activeLoopButton?.getAttribute("aria-label") === "Deactivate 4-beat loop"
    && root?.querySelector(".hub-dj-loop-label")?.textContent === "Beat loop"
    && activeLoopStyle?.backgroundColor !== "rgba(0, 0, 0, 0)"
    && activeLoopStyle?.color !== activeLoopStyle?.backgroundColor;
  activeLoopButton?.click();
  const loopCommands = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_SET_LOOP");
  const loopOffState = !root?.querySelector(".hub-dj-loop-controls")?.classList.contains("is-active")
    && !root?.querySelector('.hub-dj-loop-button[aria-pressed="true"]')
    && root?.querySelector(".hub-dj-loop-label")?.textContent === "Beat loop"
    && loopCommands.at(-2)?.beats === 4
    && loopCommands.at(-1)?.beats === 0;
  const launcher = root?.querySelector(".hub-launcher");
  const headerLauncherInjected = document.querySelector(".menu-items > .feed + #bandcamp-hub-extension-root")
    && launcher?.classList.contains("is-header")
    && launcher?.classList.contains("is-modern-header")
    && !launcher?.classList.contains("is-floating")
    && getComputedStyle(launcher).position === "relative"
    && getComputedStyle(launcher).visibility === "visible";
  root?.querySelector('.hub-tab[data-tab="settings"]')?.click();
  const layoutMode = root?.querySelector(".hub-layout-mode-select");
  const dockSide = root?.querySelector(".hub-dock-side-select");
  const panel = root?.querySelector(".hub-panel");
  const layoutToggle = root?.querySelector(".hub-layout-toggle");
  const headerReset = root?.querySelector(".hub-reset");
  const floatingBeforeDock = panel?.getBoundingClientRect();
  if (layoutMode) {
    layoutMode.value = "docked";
    layoutMode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const dockedRect = panel?.getBoundingClientRect();
  const rightDockedApplied = dockSide?.value === "right"
    && panel?.classList.contains("is-dock-right")
    && Math.abs(window.innerWidth - (dockedRect?.right || 0)) < 1
    && launcher?.classList.contains("is-panel-open")
    && !headerReset?.textContent.trim()
    && headerReset?.querySelector(".hub-reset-symbol")?.style.getPropertyValue("--hub-reset-icon").includes("icon-chevron.svg")
    && headerReset?.querySelector(".hub-reset-symbol")?.style.getPropertyValue("--hub-reset-rotation") === "-90deg"
    && headerReset?.getAttribute("aria-label") === "Close Bandkit to the right";
  const dockRightResizeHandle = panel?.querySelector(".hub-resize-handle.is-left");
  const dockRightBlockedHandle = panel?.querySelector(".hub-resize-handle.is-right");
  const rightWidthBefore = panel?.getBoundingClientRect().width || 0;
  if (dockRightResizeHandle) {
    const edgeX = panel.getBoundingClientRect().left;
    dockRightResizeHandle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 31, clientX: edgeX, clientY: 300 }));
    dockRightResizeHandle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 31, clientX: edgeX - 48, clientY: 300 }));
    dockRightResizeHandle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 31, clientX: edgeX - 48, clientY: 300 }));
  }
  const rightWidthAfter = panel?.getBoundingClientRect().width || 0;
  const rightEdgeResizeWorks = rightWidthAfter > rightWidthBefore + 40
    && getComputedStyle(dockRightResizeHandle).display !== "none"
    && getComputedStyle(dockRightBlockedHandle).display === "none";
  if (dockSide) {
    dockSide.value = "left";
    dockSide.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const leftDockedRect = panel?.getBoundingClientRect();
  const leftDockedApplied = panel?.classList.contains("is-dock-left")
    && Math.abs(leftDockedRect?.left || 0) < 1
    && launcher?.classList.contains("is-panel-open")
    && !headerReset?.textContent.trim()
    && headerReset?.querySelector(".hub-reset-symbol")?.style.getPropertyValue("--hub-reset-rotation") === "90deg"
    && headerReset?.getAttribute("aria-label") === "Close Bandkit to the left";
  const dockLeftResizeHandle = panel?.querySelector(".hub-resize-handle.is-right");
  const dockLeftBlockedHandle = panel?.querySelector(".hub-resize-handle.is-left");
  const leftWidthBefore = panel?.getBoundingClientRect().width || 0;
  if (dockLeftResizeHandle) {
    const edgeX = panel.getBoundingClientRect().right;
    dockLeftResizeHandle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 32, clientX: edgeX, clientY: 300 }));
    dockLeftResizeHandle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 32, clientX: edgeX + 36, clientY: 300 }));
    dockLeftResizeHandle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 32, clientX: edgeX + 36, clientY: 300 }));
  }
  const leftWidthAfter = panel?.getBoundingClientRect().width || 0;
  const leftEdgeResizeWorks = leftWidthAfter > leftWidthBefore + 28
    && getComputedStyle(dockLeftResizeHandle).display !== "none"
    && getComputedStyle(dockLeftBlockedHandle).display === "none";
  headerReset?.click();
  const dockedClosed = panel?.classList.contains("is-hidden")
    && !launcher?.classList.contains("is-panel-open");
  launcher?.click();
  const dockedReopened = !panel?.classList.contains("is-hidden")
    && launcher?.classList.contains("is-panel-open");
  if (layoutMode) {
    layoutMode.value = "floating";
    layoutMode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const floatingAfterDock = panel?.getBoundingClientRect();
  const floatingRestored = Boolean(
    floatingBeforeDock && floatingAfterDock
    && !panel?.classList.contains("is-docked")
    && Math.abs(floatingBeforeDock.left - floatingAfterDock.left) < 1
    && Math.abs(floatingBeforeDock.top - floatingAfterDock.top) < 1
    && Math.abs(floatingBeforeDock.width - floatingAfterDock.width) < 1
    && Math.abs(floatingBeforeDock.height - floatingAfterDock.height) < 1
  );
  const floatingHeaderControl = layoutToggle?.getAttribute("aria-label") === "Dock Bandkit to the left"
    && !headerReset?.textContent.trim()
    && headerReset?.querySelector(".hub-reset-symbol")?.style.getPropertyValue("--hub-reset-icon").includes("icon-reset.svg")
    && headerReset?.querySelector(".hub-reset-symbol")?.style.getPropertyValue("--hub-reset-rotation") === "0deg";
  layoutToggle?.click();
  const headerDocked = panel?.classList.contains("is-docked")
    && layoutToggle?.getAttribute("aria-label") === "Return Bandkit to floating mode"
    && layoutToggle?.classList.contains("is-docked")
    && Math.abs(panel?.getBoundingClientRect().left || 0) < 1;
  root?.querySelector('.hub-tab[data-tab="activity"]')?.click();
  const activityUpdated = root?.querySelector(".hub-activity-backup .hub-cart-backup-time");
  const activityDownloadButton = root?.querySelector(".hub-activity-download");
  const activityUpdateAligned = Boolean(activityUpdated && activityDownloadButton)
    && activityUpdated.textContent.startsWith("Last updated ")
    && activityUpdated.getBoundingClientRect().right < activityDownloadButton.getBoundingClientRect().left;
  root?.querySelector(".hub-activity-download")?.click();
  const activityDownload = window.fixtureDownloads.at(-1);
  const activityHtml = activityDownload ? await activityDownload.blob.text() : "";
  const audio = document.querySelector("audio");
  document.title = root?.querySelector(".hub-dj-card")
    && pageOpenedDj
    && mirroredControlSet
    && inlineRemainsOpen
    && audio.playbackRate === 1.055
    && Number(knobInput?.value) > 0
    && gainSlider?.value === "0"
    && nativeAction?.getAttribute("aria-label") === "Pause"
    && nativeButton?.classList.contains("playing")
    && nativeStatus?.classList.contains("playing")
    && !nativeStatus?.classList.contains("paused")
    && platterAdjustments?.length === 2
    && loopButtons?.length === 4
    && [...loopButtons].every((button) => !button.disabled)
    && [...loopButtons].map((button) => button.textContent).join(",") === "1,2,4,8"
    && loopArrows?.length === 2
    && !loopArrows[0]?.disabled
    && loopArrows[1]?.disabled
    && loopOnState
    && loopOffState
    && bpmReset && !bpmReset.disabled
    && rightDockedApplied
    && rightEdgeResizeWorks
    && leftDockedApplied
    && leftEdgeResizeWorks
    && dockedClosed
    && dockedReopened
    && floatingRestored
    && floatingHeaderControl
    && headerDocked
    && activityUpdateAligned
    && headerLauncherInjected
    && window.fixtureStored.bandcampHubState?.layoutMode === "docked"
    && window.fixtureStored.bandcampHubState?.dockSide === "left"
    && window.fixtureStored.bandcampHubLayout?.layoutMode === "docked"
    && window.fixtureStored.bandcampHubLayout?.dockSide === "left"
    && window.fixtureStored.bandcampHubLayout?.dockedWidth === Math.round(dockLeftResizeHandle?.closest(".hub-panel")?.getBoundingClientRect().width || 0)
    && Number(window.fixtureStored.bandcampHubLayout?.revision) > 0
    && window.fixtureStored.bandcampHubState?.dj?.pageOpen === true
    && activityDownload?.filename.startsWith("bandcamp-activity-")
    && activityHtml.includes("Bandcamp activity log")
    && activityHtml.includes("Fixture Track")
    && activityHtml.includes("Fixture Artist")
    && activityHtml.includes("<time datetime=")
    && activityHtml.includes("https://fixture-artist.bandcamp.com/track/fixture-track")
    ? "PASS: Bandkit DJ fixture"
    : `FAIL: rate ${audio.playbackRate}, knob ${knobInput?.value}, gain ${gainSlider?.value}, page ${nativeAction?.getAttribute("aria-label")}/${nativeButton?.className}/${nativeStatus?.className}`;
}, 1000);
if (location.search.includes("settings")) {
  window.setTimeout(() => {
    const root = document.querySelector("#bandcamp-hub-extension-root")?.querySelector("[data-bandcamp-hub]")?.shadowRoot;
    root?.querySelector('.hub-tab[data-tab="settings"]')?.click();
  }, 1250);
}
