#!/usr/bin/env node

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const port = Number(process.env.BANDKIT_CDP_PORT || 9333);
const screenshotPath = process.env.BANDKIT_ONBOARDING_SCREENSHOT || "/tmp/bandkit-guided-onboarding-live.png";
const extensionPath = process.env.BANDKIT_EXTENSION_PATH || decodeURIComponent(new URL("../dist/unpacked", import.meta.url).pathname);
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === "page" && /^https:\/\/bandcamp\.com\/discover/.test(item.url));
assert(target, "A real Bandcamp Discover tab was not available over Chrome DevTools");

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { reject, resolve } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

const browserVersion = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
const browserClient = new CdpClient(browserVersion.webSocketDebuggerUrl);
await browserClient.connect();
const { id: extensionId } = await browserClient.send("Extensions.loadUnpacked", { path: extensionPath });
browserClient.close();

const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send("Runtime.enable");
await client.send("Page.enable");
await client.send("Log.enable");
await client.send("Page.reload", { ignoreCache: true });

const delay = (duration = 180) => new Promise((resolve) => setTimeout(resolve, duration));

async function evaluate(expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, message, timeout = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      // Reloads briefly invalidate the execution context.
    }
    await delay(100);
  }
  throw new Error(message);
}

async function clickShadow(selector) {
  const bounds = await evaluate(`(() => {
    const shadow = document.querySelector("#bandcamp-hub-extension-root")?.firstElementChild?.shadowRoot;
    const element = shadow?.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { disabled: element.disabled === true, height: rect.height, width: rect.width, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert(bounds, `Could not find ${selector} in the Bandkit shadow root`);
  assert(!bounds.disabled, `${selector} was disabled`);
  assert(bounds.width > 0 && bounds.height > 0, `${selector} was not visible`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bounds.x, y: bounds.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: bounds.x, y: bounds.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: bounds.x, y: bounds.y, button: "left", clickCount: 1 });
  await delay();
}

async function snapshot() {
  return evaluate(`(() => {
    const shadow = document.querySelector("#bandcamp-hub-extension-root")?.firstElementChild?.shadowRoot;
    const layer = shadow?.querySelector(".hub-onboarding-layer");
    const dialog = shadow?.querySelector(".hub-onboarding-dialog");
    const target = shadow?.querySelector('[aria-describedby="bandkit-onboarding-copy"]');
    const player = shadow?.querySelector(".hub-player");
    const panel = shadow?.querySelector(".hub-panel");
    const rect = (element) => element ? (() => { const value = element.getBoundingClientRect(); return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }; })() : null;
    const style = (element) => element ? getComputedStyle(element) : null;
    return {
      activeTab: [...(shadow?.querySelectorAll(".hub-tab") || [])].find((item) => item.classList.contains("is-active"))?.dataset.tab || null,
      activityRows: shadow?.querySelectorAll(".hub-activity-item").length || 0,
      addMenuOptions: shadow?.querySelectorAll(".hub-playlist-track-menu:not([hidden]) .hub-playlist-menu-option").length || 0,
      addTriggerIcon: shadow?.querySelector(".hub-onboarding-add-trigger .hub-button-icon")?.getAttribute("src") || "",
      backupInPrimaryFooter: Boolean(shadow?.querySelector(".hub-onboarding-primary-navigation .hub-onboarding-backup-action")),
      cartRows: shadow?.querySelectorAll(".hub-cart-item-card").length || 0,
      demoArtCount: shadow?.querySelectorAll(".hub-onboarding-demo-art").length || 0,
      dialogBackdropFilter: style(dialog)?.backdropFilter || style(dialog)?.webkitBackdropFilter,
      dialogFrosted: dialog?.classList.contains("is-frosted-glass") === true,
      dialogRect: rect(dialog),
      hasLegacyHero: Boolean(shadow?.querySelector(".hub-onboarding-hero, .hub-onboarding-preview")),
      kitChoices: shadow?.querySelectorAll(".hub-onboarding-kit-choice").length || 0,
      themeCardColumns: style(shadow?.querySelector(".hub-onboarding-kit-theme-card"))?.gridTemplateColumns || "",
      layerBackground: style(layer)?.backgroundColor,
      layerHidden: layer?.hidden === true,
      panelInert: panel?.hasAttribute("inert") === true,
      playheadWidth: style(shadow?.querySelector(".hub-scrub-playhead"))?.width || "",
      playerEmpty: player?.classList.contains("is-empty") === true,
      playerInert: player?.hasAttribute("inert") === true,
      playerTitle: shadow?.querySelector(".hub-player-title")?.textContent?.trim() || "",
      playlistCards: shadow?.querySelectorAll(".hub-saved-playlist-card").length || 0,
      playlistRows: shadow?.querySelectorAll(".hub-playlist-track").length || 0,
      savedCartCards: shadow?.querySelectorAll(".hub-saved-cart-stack .hub-saved-cart-card").length || 0,
      progress: shadow?.querySelector(".hub-onboarding-progress")?.textContent?.trim() || "",
      targetClasses: target?.className || "",
      targetRect: rect(target),
      title: shadow?.querySelector(".hub-onboarding-title")?.textContent?.trim() || "",
      visualizer: player?.dataset.visualizer || "off",
      visualizerVisible: style(shadow?.querySelector(".hub-player-visualizer"))?.display !== "none",
      djVisible: style(shadow?.querySelector(".hub-dj-player-button"))?.display !== "none",
      djActive: shadow?.querySelector(".hub-dj-player-button")?.classList.contains("is-active") === true,
      djDrawerOpen: shadow?.querySelector(".hub-dj-drawer")?.classList.contains("is-open") === true,
      playheadAnimation: (() => { const value = style(shadow?.querySelector(".hub-scrub-playhead")); return value ? { duration: value.animationDuration, fill: value.animationFillMode, iterations: value.animationIterationCount, name: value.animationName } : null; })(),
      currentTime: shadow?.querySelector(".hub-current-time")?.textContent?.trim() || "",
      duration: shadow?.querySelector(".hub-duration")?.textContent?.trim() || "",
      traditionalTimeline: shadow?.querySelector(".hub-scrub-control")?.classList.contains("is-traditional") === true,
      targetOutlineCount: shadow?.querySelectorAll(".hub-onboarding-target").length || 0,
      viewport: { height: innerHeight, width: innerWidth }
    };
  })()`);
}

function assertAnchored(state, label) {
  assert(state.targetRect, `${label} did not highlight a real interface target`);
  assert(state.dialogRect, `${label} did not render a coachmark`);
  assert(state.dialogRect.left >= 0 && state.dialogRect.top >= 0, `${label} overflowed the top or left viewport edge`);
  assert(state.dialogRect.right <= state.viewport.width && state.dialogRect.bottom <= state.viewport.height, `${label} overflowed the viewport`);
  assert(state.dialogRect.height < state.viewport.height, `${label} expanded into a full-height modal`);
}

async function assertStep(step, title) {
  const state = await snapshot();
  assert.equal(state.progress, `${step} of 10`, `Unexpected guided-tour state: ${JSON.stringify(state)}`);
  assert.equal(state.title, title);
  assertAnchored(state, `Step ${step}`);
  assert.equal(state.layerBackground, "rgba(0, 0, 0, 0)", `Step ${step} dimmed the Bandcamp page`);
  assert(!state.hasLegacyHero, `Step ${step} rendered the retired onboarding screen design`);
  return state;
}

try {
  // A fresh unpacked load already reloads matching Bandcamp tabs through the
  // extension background. Observe that real install path directly here.
  try {
    await waitFor(`document.querySelector("#bandcamp-hub-extension-root")?.firstElementChild?.shadowRoot?.querySelector(".hub-onboarding-progress")?.textContent?.trim() === "1 of 10"`, "Bandkit did not open the first-run guided tour on the real Bandcamp page");
  } catch (error) {
    const diagnostic = await evaluate(`({ readyState: document.readyState, root: Boolean(document.querySelector("#bandcamp-hub-extension-root")), title: document.title, url: location.href })`);
    const recentErrors = client.events.filter((event) => /exception|error/i.test(event.method || "") || /error/i.test(JSON.stringify(event.params || {}))).slice(-8);
    throw new Error(`${error.message}. Diagnostic: ${JSON.stringify({ diagnostic, recentErrors })}`);
  }
  await delay(450);

  const welcome = await assertStep(1, "Your Bandcamp listening toolkit");
  assert.match(welcome.targetClasses, /hub-player/);
  assert.equal(welcome.playerTitle, "Bandkit Test Song");
  assert(welcome.playerInert && welcome.panelInert, "The tour did not isolate its live preview surfaces");
  assert.equal(welcome.targetOutlineCount, 0, "The tour drew a target highlight");
  assert.deepEqual(welcome.playheadAnimation, { duration: "600s", fill: "forwards", iterations: "1", name: "hub-onboarding-playhead" });
  assert.equal(welcome.currentTime, "0:00");
  assert.equal(welcome.duration, "−10:00");
  assert(welcome.demoArtCount >= 1, "The demo player did not receive themed artwork");

  await clickShadow(".hub-onboarding-primary");
  const nowPlaying = await assertStep(2, "Your current queue, ready when you are");
  assert.equal(nowPlaying.activeTab, "playlist");
  assert.equal(nowPlaying.playlistRows, 3);
  assert(nowPlaying.demoArtCount >= 4, "Now Playing did not receive dummy artwork");
  await delay(1600);
  const stableNowPlaying = await assertStep(2, "Your current queue, ready when you are");
  assert.equal(stableNowPlaying.playlistRows, 3, "A background refresh replaced the guided Now Playing data");
  assert.equal(stableNowPlaying.playerTitle, "Bandkit Test Song", "A background refresh replaced the guided player data");

  await clickShadow(".hub-onboarding-primary");
  const playlists = await assertStep(3, "Keep the music you want to return to");
  assert.equal(playlists.playlistCards, 2);
  assert(playlists.demoArtCount >= 3, "Saved playlists did not receive dummy artwork");

  await clickShadow(".hub-onboarding-primary");
  const add = await assertStep(4, "Send music where you want it");
  assert(add.addMenuOptions >= 3, "The Add step did not open the real track actions menu");
  assert.match(add.addTriggerIcon, /icon-plus\.svg/, "The Add step did not show a plus trigger");

  await clickShadow(".hub-onboarding-primary");
  const cart = await assertStep(5, "Keep a recoverable copy of your cart");
  assert.equal(cart.activeTab, "cart");
  assert.equal(cart.savedCartCards, 2);
  assert(cart.demoArtCount >= 3, "Saved carts did not receive dummy artwork");

  await clickShadow(".hub-onboarding-primary");
  const activity = await assertStep(6, "Find your way back to what you did");
  assert.equal(activity.activeTab, "activity");
  assert.equal(activity.activityRows, 3);
  assert(activity.demoArtCount >= 4, "Activity did not receive dummy artwork");

  await clickShadow(".hub-onboarding-primary");
  const settings = await assertStep(7, "Make Bandkit work your way");
  assert.equal(settings.activeTab, "settings");
  assert.match(settings.targetClasses, /hub-panel/);

  await clickShadow(".hub-onboarding-primary");
  const dj = await assertStep(8, "Extra control when you want it");
  assert.match(dj.targetClasses, /hub-dj-drawer/);
  assert.equal(dj.playerTitle, "Bandkit Test Song");
  assert(dj.djVisible, "The DJ tools step did not expose the real record control");
  assert(dj.djActive && dj.djDrawerOpen, "The DJ tools step did not open the active production DJ drawer");
  await delay(1600);
  assert.equal((await assertStep(8, "Extra control when you want it")).playerTitle, "Bandkit Test Song", "Live scanning overtook the DJ tools sample player");

  await clickShadow(".hub-onboarding-primary");
  const kit = await assertStep(9, "Tune your Bandkit");
  assert.equal(kit.kitChoices, 7);
  assert.match(kit.themeCardColumns, /px .*px/, "The Theme card was not presented as two columns");
  assert(kit.visualizerVisible, "The customisation preview did not start with its visualizer visible");
  const waveformPlayheadWidth = kit.playheadWidth;
  await clickShadow('.hub-onboarding-kit-choice[aria-label^="Visualizer:"]');
  assert.equal((await assertStep(9, "Tune your Bandkit")).visualizerVisible, false, "The Visualizer control did not hide the real visualizer");
  await clickShadow('.hub-onboarding-kit-choice[aria-label^="Visualizer:"]');
  assert((await assertStep(9, "Tune your Bandkit")).visualizerVisible, "The Visualizer control did not restore the real visualizer");
  await clickShadow('.hub-onboarding-kit-choice[aria-label^="DJ tools:"]');
  assert.equal((await assertStep(9, "Tune your Bandkit")).djVisible, false, "The DJ tools control did not hide the record button");
  await clickShadow('.hub-onboarding-kit-choice[aria-label^="DJ tools:"]');
  assert((await assertStep(9, "Tune your Bandkit")).djVisible, "The DJ tools control did not restore the record button");
  await clickShadow('.hub-onboarding-kit-choice[aria-label^="Timeline:"]');
  const classicKit = await assertStep(9, "Tune your Bandkit");
  assert(classicKit.traditionalTimeline, "The Timeline control did not switch the real scrubber to Classic");
  assert.equal(classicKit.playheadWidth, waveformPlayheadWidth, "Waveform and Classic changed the playhead size");
  await clickShadow('.hub-onboarding-kit-choice[aria-label^="Surface:"]');
  const glassKit = await assertStep(9, "Tune your Bandkit");
  assert(glassKit.dialogFrosted, "Changing Surface to Glass did not update the live coachmark");
  assert(glassKit.dialogBackdropFilter && glassKit.dialogBackdropFilter !== "none", "The coachmark glass surface had no blur");

  await clickShadow(".hub-onboarding-primary");
  const backup = await assertStep(10, "Keep a portable copy of your Bandkit data");
  assert.equal(backup.activeTab, "settings");
  assert.match(backup.targetClasses, /hub-panel/);
  assert.equal(await evaluate(`document.querySelector("#bandcamp-hub-extension-root").firstElementChild.shadowRoot.querySelector(".hub-onboarding-backup-action")?.textContent.trim()`), "Backup");
  assert(backup.backupInPrimaryFooter, "Backup did not sit beside Finish in the footer");

  const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  await clickShadow(".hub-onboarding-primary");
  const finished = await snapshot();
  assert(finished.layerHidden, "Finishing the guided tour did not close it");
  assert(!finished.playerInert, "The player remained inert after the tour");
  assert.notEqual(finished.playerTitle, "Bandkit Test Song", "Temporary tour playback leaked into Now Playing");

  await client.send("Page.reload", { ignoreCache: true });
  await waitFor(`Boolean(document.querySelector("#bandcamp-hub-extension-root")?.firstElementChild?.shadowRoot?.querySelector(".hub-player"))`, "Bandkit did not remount after completion");
  await delay(450);
  assert((await snapshot()).layerHidden, "Completed onboarding reappeared after reload");

  await clickShadow('.hub-header-shortcut[data-tab="settings"]');
  await clickShadow('.hub-settings-overview-trigger[aria-label="Open Help & onboarding settings"]');
  await clickShadow(".hub-onboarding-replay");
  await assertStep(1, "Your Bandcamp listening toolkit");
  await clickShadow(".hub-onboarding-skip");
  assert((await snapshot()).layerHidden, "Skip tour did not close a replayed guide");

  const extensionErrors = client.events.filter((event) => {
    const serialized = JSON.stringify(event.params || {});
    const isError = event.method === "Runtime.exceptionThrown"
      || (event.method === "Runtime.consoleAPICalled" && event.params?.type === "error")
      || (event.method === "Log.entryAdded" && event.params?.entry?.level === "error");
    return isError && /chrome-extension:|bandkit|bandcamp-hub/i.test(serialized);
  });
  assert.deepEqual(extensionErrors, [], `Extension runtime errors were reported: ${JSON.stringify(extensionErrors)}`);

  console.log(JSON.stringify({ extensionId, screenshot: screenshotPath, target: target.url, verified: [
    "automatic first-run launch", "ten anchored coachmark steps", "real player and panel targets",
    "real Now Playing, playlists, Add, cart and activity views with temporary data", "animated real-player customisation preview",
    "live glass update without step reset", "backup handoff", "dummy playback isolation",
    "completion persistence", "Settings replay and skip", "no extension console/runtime errors"
  ] }, null, 2));
} finally {
  client.close();
}
