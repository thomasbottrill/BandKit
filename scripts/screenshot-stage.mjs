#!/usr/bin/env node
// Local screenshot harness. Serves the repository so the built content script
// can run outside the extension, and proxies Bandcamp metadata, artwork and
// audio so the stage page can analyse a real stream from a same-origin URL.
// bcbits.com sends no Access-Control-Allow-Origin, so a cross-origin <audio>
// would taint the AudioContext and the visualiser would read pure silence.
import esbuild from "esbuild";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.STAGE_PORT) || 8765;
const DEFAULT_TRACK = "https://amuwa.bandcamp.com/track/angle-of-incidence";
const LIBRARY_LIMIT = 5;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

const sessionCache = new Map();

// The offscreen analysis and visualiser modules are shared with the extension
// but pull in a bare npm specifier, so the browser cannot import them raw.
// Bundle them on demand instead of committing another build artifact.
let analysisBundle = null;
async function buildAnalysisBundle() {
  if (analysisBundle) return analysisBundle;
  const result = await esbuild.build({
    stdin: {
      contents: [
        'export { buildWaveform, createTrackAudioDecoder, estimateBpmDetailsCooperatively, estimateKeyCooperatively } from "./src/offscreen/analysis.js";',
        'export { startVisualizerSignal } from "./src/offscreen/visualizer.js";'
      ].join("\n"),
      resolveDir: ROOT,
      sourcefile: "stage-analysis.js"
    },
    bundle: true,
    format: "esm",
    write: false,
    logLevel: "silent"
  });
  analysisBundle = result.outputFiles[0].text;
  return analysisBundle;
}

function isBandcampPage(value) {
  try {
    const { protocol, hostname } = new URL(value);
    return protocol === "https:" && (hostname === "bandcamp.com" || hostname.endsWith(".bandcamp.com"));
  } catch {
    return false;
  }
}

// Mirrors the extension's own media restriction: only Bandcamp's stream and
// image hosts are ever proxied, never an arbitrary third-party URL.
function isBandcampMedia(value) {
  try {
    const { protocol, hostname } = new URL(value);
    return protocol === "https:" && (hostname === "bcbits.com" || hostname.endsWith(".bcbits.com"));
  } catch {
    return false;
  }
}

async function fetchPage(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "en" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function decodeEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function metaContent(html, property) {
  const match = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`))
    || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`));
  return match ? decodeEntities(match[1]) : "";
}

// Bandcamp publishes the release payload as a data-tralbum attribute on both
// classic and modern pages. The first streamable track is what the stage plays.
async function resolveTrack(pageUrl) {
  const html = await fetchPage(pageUrl);
  const attribute = html.match(/data-tralbum="([^"]*)"/);
  if (!attribute) throw new Error(`No release data found on ${pageUrl}`);
  const tralbum = JSON.parse(decodeEntities(attribute[1]));
  const entry = (tralbum.trackinfo || []).find((item) => item?.file?.["mp3-128"]);
  if (!entry) throw new Error(`No streamable track on ${pageUrl}`);
  const artist = tralbum.artist || metaContent(html, "og:site_name") || "";
  const album = tralbum.current?.type === "album" ? tralbum.current?.title || "" : tralbum.album_title || "";
  const artwork = metaContent(html, "og:image");
  const origin = new URL(pageUrl).origin;
  return {
    id: String(entry.track_id || entry.id || pageUrl),
    title: entry.title || tralbum.current?.title || "Untitled",
    artist,
    album,
    duration: Number(entry.duration) || 0,
    art: artwork,
    pageUrl: entry.title_link ? new URL(entry.title_link, origin).href : pageUrl,
    artistUrl: origin,
    stream: entry.file["mp3-128"]
  };
}

// Extra real releases so the queue, playlists, cart and activity screens hold
// genuine titles and artwork rather than invented placeholder rows.
async function resolveLibrary(artistOrigin, skipPageUrl) {
  const html = await fetchPage(`${artistOrigin}/music`);
  const hrefs = [...html.matchAll(/<li[^>]*data-item-id="[^"]*"[\s\S]*?href="([^"]+)"/g)]
    .map((match) => new URL(decodeEntities(match[1]), artistOrigin).href)
    .filter((href) => href !== skipPageUrl);
  const unique = [...new Set(hrefs)].slice(0, LIBRARY_LIMIT);
  const resolved = await Promise.all(unique.map((href) => resolveTrack(href).catch(() => null)));
  return resolved.filter(Boolean);
}

async function buildSession(trackUrl) {
  if (sessionCache.has(trackUrl)) return sessionCache.get(trackUrl);
  const track = await resolveTrack(trackUrl);
  const library = await resolveLibrary(track.artistUrl, track.pageUrl).catch(() => []);
  const session = { track, library };
  sessionCache.set(trackUrl, session);
  return session;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": CONTENT_TYPES[".json"], "cache-control": "no-store" });
  response.end(payload);
}

// Range headers are forwarded so the stage <audio> can seek, which the DJ
// waveform and scrubbing screenshots both depend on.
async function proxyMedia(request, response, target) {
  if (!isBandcampMedia(target)) {
    sendJson(response, 400, { error: "Only Bandcamp media hosts can be proxied." });
    return;
  }
  const headers = { "user-agent": USER_AGENT };
  if (request.headers.range) headers.range = request.headers.range;
  const upstream = await fetch(target, { headers });
  const outgoing = { "access-control-allow-origin": "*", "accept-ranges": "bytes" };
  for (const name of ["content-type", "content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) outgoing[name] = value;
  }
  response.writeHead(upstream.status, outgoing);
  if (!upstream.body) {
    response.end();
    return;
  }
  for await (const chunk of upstream.body) response.write(chunk);
  response.end();
}

function serveStatic(requestPath, response) {
  const relative = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, relative);
  if (!resolved.startsWith(ROOT)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(resolved, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": CONTENT_TYPES[path.extname(resolved)] || "application/octet-stream"
    });
    fs.createReadStream(resolved).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") {
      response.writeHead(302, { location: "/tests/screenshot-stage.html" }).end();
      return;
    }
    if (url.pathname === "/stage/session") {
      const trackUrl = url.searchParams.get("track") || DEFAULT_TRACK;
      if (!isBandcampPage(trackUrl)) {
        sendJson(response, 400, { error: "Only Bandcamp release pages can be staged." });
        return;
      }
      sendJson(response, 200, await buildSession(trackUrl));
      return;
    }
    if (url.pathname === "/stage/analysis.js") {
      response.writeHead(200, { "content-type": CONTENT_TYPES[".js"], "cache-control": "no-store" });
      response.end(await buildAnalysisBundle());
      return;
    }
    if (url.pathname === "/stage/media") {
      await proxyMedia(request, response, url.searchParams.get("u") || "");
      return;
    }
    serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 502, { error: String(error?.message || error) });
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Bandkit screenshot stage: http://localhost:${PORT}/tests/screenshot-stage.html\n`);
  process.stdout.write(`Stage another release with ?track=<bandcamp release url>\n`);
});
