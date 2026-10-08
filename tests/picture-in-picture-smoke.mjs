import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Element {
  constructor(name = "") {
    this.name = name; this.events = {}; this.children = []; this.attributes = {}; this.disabled = false; this.hidden = false;
    this.innerHTML = ""; this.textContent = ""; this.value = "0"; this.title = ""; this.queries = {}; this.clicks = 0; this.dispatched = [];
    this.style = { cssText: "", color: "" };
    const classes = new Set();
    this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) };
  }
  set className(value) { value.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  append(...items) { for (const item of items) { this.children.push(item); item.parentNode = this; } }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }
  querySelector(selector) {
    const appended = this.children.find((child) => child.classList?.contains(selector.slice(1)));
    return appended || (this.queries[selector] ||= new Element(selector));
  }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.events[type] = (this.events[type] || []).filter((item) => item !== fn); }
  emit(type, event = {}) { for (const fn of [...(this.events[type] || [])]) fn(event); }
  dispatchEvent(event) { this.dispatched.push(event.type); }
  click() { if (!this.disabled) this.clicks++; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function createContext2d() {
  const calls = [];
  return {
    calls, globalAlpha: 1, font: "", textBaseline: "", _fill: "#000000",
    get fillStyle() { return this._fill; },
    set fillStyle(value) { this._fill = typeof value === "string" && value.startsWith("rgb(") ? "#112233" : value; },
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    roundRect: (...args) => calls.push(["roundRect", ...args]),
    beginPath() {}, fill() {}, clip() {}, save() {}, restore() {},
    drawImage: (image) => calls.push(["drawImage", image.src]),
    fillText: (text) => calls.push(["fillText", text]),
    measureText: (text) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} })
  };
}

const source = fs.readFileSync(new URL("../src/content/runtime/picture-in-picture.js", import.meta.url), "utf8");
const menuSource = fs.readFileSync(new URL("../src/content/runtime/layout-cart-rendering.js", import.meta.url), "utf8");
const indexCss = fs.readFileSync(new URL("../src/styles/hub/index.css", import.meta.url), "utf8");
const backgroundSource = fs.readFileSync(new URL("../src/background/index.js", import.meta.url), "utf8");
assert.match(indexCss, /@import "\.\/picture-in-picture\.css";/, "mini player styles must ship in hub.css");
assert.match(menuSource, /createPictureInPictureMenuAction\(r\)/, "the music bar menu must offer the mini player");
assert.match(backgroundSource, /MESSAGES\.FETCH_ARTWORK\) return \{ ok: true, dataUrl: await fetchArtworkDataUrl\(message\.url\) \}/,
  "artwork is read by the worker so the canvas stays untainted");

function load({ supported = true } = {}) {
  const frames = [], handlers = {}, positions = [], listeners = new Set();
  const session = { playbackState: "none", setActionHandler: (action, fn) => { handlers[action] = fn; }, setPositionState: (state) => positions.push(state) };
  const document = new Element("document");
  Object.assign(document, { hidden: false, pictureInPictureEnabled: supported, pictureInPictureElement: null, exits: 0,
    exitPictureInPicture: async () => { document.exits++; } });
  const videos = [];
  document.createElement = (tag) => {
    const element = new Element(tag);
    if (tag === "canvas") element.getContext = () => (element.ctx = createContext2d());
    if (tag === "video") {
      Object.assign(element, { paused: true, readyState: 4, requests: 0,
        play: async () => { element.paused = false; },
        requestPictureInPicture: async () => { element.requests++; document.pictureInPictureElement = element; } });
      videos.push(element);
    }
    return element;
  };
  class FakeImage extends Element { set src(value) { this._src = value; this.width = 700; this.height = 700; queueMicrotask(() => this.emit("load")); } get src() { return this._src; } }
  class Generator { constructor() { this.stopped = false; this.writable = { getWriter: () => ({ write: async (frame) => frames.push(frame), close: async () => {} }) }; } stop() { this.stopped = true; } }
  const window = {
    HTMLCanvasElement: { prototype: { captureStream() {} } }, MediaStreamTrackGenerator: Generator,
    VideoFrame: class { constructor(canvas) { this.canvas = canvas; } }, MediaStream: class { constructor(tracks) { this.tracks = tracks; } },
    Image: FakeImage, setInterval: () => 1, clearInterval: () => {}
  };
  const context = vm.createContext({
    window, document, navigator: { mediaSession: session }, performance: { now: () => 1000 }, HTMLMediaElement: { HAVE_METADATA: 1 },
    Event: class { constructor(type) { this.type = type; } }, getComputedStyle: () => ({ color: "rgb(1, 2, 3)", fontFamily: "Test Sans" }),
    chrome: { runtime: { onMessage: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } } },
    MESSAGES: { FETCH_ARTWORK: "FETCH_ARTWORK", SEAMLESS_SET_MUTED: "SET_MUTED" }, asset: (name) => name,
    runtimeSeamless: { enabled: true }, formatDuration: (value) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`,
    createElement: (tag, className) => { const el = new Element(tag); if (className) el.className = className; return el; }
  });
  vm.runInContext(`${source.replace(/^import .*;\n/gm, "").replaceAll("export async function", "async function").replaceAll("export function", "function")}
    globalThis.api = { pictureInPictureSupported, createPictureInPictureMenuAction, togglePictureInPicturePlayer };`, context);
  return { api: context.api, document, frames, handlers, positions, listeners, session, videos };
}

function createRuntime(messages) {
  const player = new Element("player");
  const previous = new Element("previous"), next = new Element("next");
  player.queries = { ".hub-previous-button": previous, ".hub-next-button": next };
  const r = {
    $player: player, $playButton: new Element("play"), $scrubSlider: new Element("scrub"), $scrubControl: new Element("scrub-control"),
    $playerArt: Object.assign(new Element("art"), { src: "https://f4.bcbits.com/img/a1_16.jpg" }), $playerArtLink: new Element("art-link"),
    $playerTitle: Object.assign(new Element(), { textContent: "Track" }), $playerArtist: Object.assign(new Element(), { textContent: "Artist" }),
    $playerMoreMenu: new Element("menu"), $shadow: new Element("shadow"), $scrubDuration: 200,
    renders: 0, $playerRenderFrame: 0, $renderPlayer() { this.renders++; this.$playerRenderFrame = 0; },
    commands: [], $seamlessCommand: async (type, details) => { r.commands.push([type, details.muted]); },
    cleanups: [], $app: { registerCleanup: (fn) => r.cleanups.push(fn) }, $closePlayerMoreMenu() {},
    $runtimeMessage: async (message) => { messages.push(message); return { ok: true, dataUrl: "data:image/jpeg;base64,AA==" }; }
  };
  r.$scrubSlider.value = "250";
  player.classList.add("is-playing");
  return { r, previous, next };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

// Unsupported browsers get no menu entry at all.
const unsupported = load({ supported: false });
assert.equal(unsupported.api.createPictureInPictureMenuAction(createRuntime([]).r), null);

const env = load();
const messages = [];
const { r, previous, next } = createRuntime(messages);
const action = env.api.createPictureInPictureMenuAction(r);
assert.equal(action.querySelector(".hub-pip-menu-label").textContent, "Mini player");
action.emit("click");
await settle(); await settle();

const [video] = env.videos;
assert.equal(video.requests, 1, "the mini player opens as video Picture-in-Picture, which has no title bar");
assert.equal(video.muted, false, "the silent stream is not shown as muted");
assert.equal(r.$miniPlayer.video, video);
assert.equal(action.querySelector(".hub-pip-menu-label").textContent, "Close mini player");
assert.equal(r.cleanups.length, 1, "teardown closes the floating window");
assert.equal(messages[0]?.type, "FETCH_ARTWORK");
assert.equal(messages[0]?.url, "https://f4.bcbits.com/img/a1_16.jpg");
assert.ok(env.frames.length >= 2, "frames are pushed for the first draw and the loaded artwork");
const calls = r.$miniPlayer.ctx.calls;
assert.ok(calls.some(([name, src]) => name === "drawImage" && src === "data:image/jpeg;base64,AA=="), "artwork is drawn from the worker's data URL");
assert.ok(calls.some(([name, text]) => name === "fillText" && text === "Track"), "a new track shows its title");
assert.ok(calls.some(([name, text]) => name === "fillText" && text === "Artist"), "a new track shows its artist");
assert.ok(calls.some(([name, x, y, width]) => name === "roundRect" && x === 44 && y === 420 && width === 98), "progress line reflects the bar position");
assert.ok(calls.some(([name, text]) => name === "fillText" && text === "0:50"), "elapsed time is shown");
assert.ok(calls.some(([name, text]) => name === "fillText" && text === "\u22122:30"), "remaining time is shown");
assert.equal(env.session.playbackState, "playing");
assert.equal(JSON.stringify(env.positions.at(-1)), JSON.stringify({ duration: 200, playbackRate: 1, position: 50 }), "Chrome shows track time, not LIVE");

env.handlers.play();
assert.equal(r.$playButton.clicks, 0, "play while already playing is ignored");
env.handlers.pause();
assert.equal(r.$playButton.clicks, 1, "pause drives the music bar's play button");
env.handlers.nexttrack();
env.handlers.previoustrack();
assert.deepEqual([next.clicks, previous.clicks], [1, 1], "track skips drive the music bar's buttons");
env.handlers.seekto({ seekTime: 100 });
assert.equal(r.$scrubSlider.value, "500");
assert.deepEqual(r.$scrubSlider.dispatched, ["input", "change"], "seeks go through the bar's own scrub handlers");

video.muted = true;
video.emit("volumechange");
assert.deepEqual(r.commands, [["SET_MUTED", true]], "Chrome's speaker button mutes the music");

// A hidden tab renders the bar from the mini player; incoming playback
// messages drive it when timers are throttled.
env.document.hidden = true;
assert.equal(env.listeners.size, 1);
const rendersBefore = r.renders;
r.$miniPlayer.lastRender = -1000;
[...env.listeners][0]();
assert.equal(r.renders, rendersBefore + 1, "playback messages render the hidden bar");

const mini = r.$miniPlayer;
video.emit("leavepictureinpicture");
assert.equal(r.$miniPlayer, null);
assert.equal(env.handlers.play, null, "closing releases the media session controls");
assert.equal(env.positions.at(-1), undefined, "closing clears the position state");
assert.equal(mini.sink.stream.tracks[0].stopped, true);
assert.equal(env.listeners.size, 0);
assert.ok(!r.$shadow.children.includes(video), "the source video is removed");
assert.deepEqual(r.commands.at(-1), ["SET_MUTED", false], "closing never leaves the music muted");
assert.equal(action.querySelector(".hub-pip-menu-label").textContent, "Mini player");

console.log("Picture-in-picture mini player: support gate, video window, artwork, media controls, hidden-tab rendering and close passed.");
