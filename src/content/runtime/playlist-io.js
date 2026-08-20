import { runtimeSaveState, runtimeSeamless, runtimeState } from "./context.js";
import { escapeHtml, formatDuration, portableBandcampUrl, resolveImage, safeBandcampReleaseUrl, safeBandcampUrl } from "../core.js";
import { contrast, hexColor, hexString, luminance, mixColor, readableColor } from "../color.js";
import { BUILT_IN_THEMES, MAX_SAVED_THEMES, THEME_COLOR_KEYS } from "../state.js";
import { MESSAGES } from "../../shared/contracts.js";

function registerPlaylistIo1(r) {
r.$playPlaylistAt = async function playPlaylistAt(requestedIndex = 0, { forceRefresh = false } = {}) {
      r.$releaseExplicitPlaybackClear();
      if (!runtimeState.playlist.length) {
        r.$showToast("Add a streamable Bandcamp track to the playlist first.");
        return false;
      }
      const originalItems = runtimeState.playlist;
      const selectedIndex = Math.max(0, Math.min(runtimeState.playlist.length - 1, Number(requestedIndex) || 0));
      // Now Playing only represents the current track and Up Next. Choosing a
      // queued item consumes everything before it without reordering the rest.
      const nextItems = runtimeState.playlist.slice(selectedIndex);
      const queueChanged = nextItems.length !== runtimeState.playlist.length
        || nextItems.some((item, index) => item.playlistItemId !== runtimeState.playlist[index]?.playlistItemId);
      runtimeState.playlist = r.$normalizePlaylist(nextItems);
      const target = runtimeState.playlist[0];
      runtimeSaveState();
      if (String(target.id || "") === r.$suppressedFeedTrackId) r.$suppressedFeedTrackId = "";
      const playRequest = ++r.$playlistPlayRequest;
      r.$pendingPlaylistItemId = target.playlistItemId;
      if (queueChanged && r.$isNowPlayingView()) r.$render();
      else r.$syncCurrentPlaylistPlaybackUi();
      const activeQueueTrack = r.$matchingQueueTrack(runtimeSeamless.queue, target);
      const activeIndex = activeQueueTrack ? runtimeSeamless.queue.indexOf(activeQueueTrack) : -1;
      if (!forceRefresh && r.$playlistIsActive() && activeIndex >= 0) {
        const nextState = queueChanged
          ? await r.$seamlessCommand(MESSAGES.SEAMLESS_UPDATE_QUEUE, {
            queue: runtimeState.playlist.filter((track) => r.$isReusableStreamUrl(track.url)),
            selectedPlaylistItemId: target.playlistItemId,
            autoplay: true
          })
          : await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_INDEX, { index: activeIndex, autoplay: true });
        if (playRequest !== r.$playlistPlayRequest) return false;
        if (!nextState && r.$pendingPlaylistItemId === target.playlistItemId) r.$pendingPlaylistItemId = "";
        r.$syncCurrentPlaylistPlaybackUi();
        return Boolean(nextState);
      }
      r.$showToast("Refreshing the playlist from Bandcamp…");
      const hydrated = await r.$hydratePlaylist(runtimeState.playlist);
      if (playRequest !== r.$playlistPlayRequest) return false;
      runtimeState.playlist = r.$mergeHydratedPlaylist(runtimeState.playlist, hydrated.items);
      runtimeSaveState();
      const restoreOriginalOrder = () => {
        runtimeState.playlist = r.$mergeHydratedPlaylist(originalItems, runtimeState.playlist);
        runtimeSaveState();
      };
      const queue = runtimeState.playlist.filter((track) => r.$isReusableStreamUrl(track.url));
      if (!queue.length) {
        restoreOriginalOrder();
        if (r.$pendingPlaylistItemId === target.playlistItemId) r.$pendingPlaylistItemId = "";
        r.$syncCurrentPlaylistPlaybackUi();
        r.$render();
        r.$showToast(hydrated.error || "None of these tracks are currently streamable.");
        return false;
      }
      const index = queue.findIndex((track) => track.playlistItemId === target.playlistItemId);
      if (index < 0) {
        restoreOriginalOrder();
        if (r.$pendingPlaylistItemId === target.playlistItemId) r.$pendingPlaylistItemId = "";
        r.$syncCurrentPlaylistPlaybackUi();
        r.$render();
        r.$showToast(`${target.title} is not currently streamable.`);
        return false;
      }
      r.$playlistPlaybackStartingRequest = playRequest;
      r.$playlistPlaybackStarting = true;
      r.$stopModernPagePlayer();
      r.$pageMediaCommand("pause");
      const pageAudio = r.$getAudio();
      if (pageAudio && !pageAudio.paused) pageAudio.pause();
      try {
        const response = await r.$runtimeMessage({
          type: MESSAGES.SEAMLESS_ENABLE,
          queue,
          index,
          currentTime: 0,
          autoplay: true,
          rate: runtimeState.dj.rate,
          preservePitch: runtimeState.dj.preservePitch,
          filterValue: runtimeState.dj.filterValue,
          gainDb: runtimeState.dj.gainDb,
          eqLowDb: runtimeState.dj.eqLowDb,
          eqMidDb: runtimeState.dj.eqMidDb,
          eqHighDb: runtimeState.dj.eqHighDb
        });
        if (!response?.ok) {
          restoreOriginalOrder();
          if (r.$pendingPlaylistItemId === target.playlistItemId) r.$pendingPlaylistItemId = "";
          r.$syncCurrentPlaylistPlaybackUi();
          r.$showToast(response?.error || "The playlist could not start.");
          return false;
        }
        if (playRequest !== r.$playlistPlayRequest) return false;
        r.$applySeamlessState(response.state);
        if (r.$pendingPlaylistItemId === target.playlistItemId) r.$pendingPlaylistItemId = "";
        runtimeState.open = true;
        runtimeState.activeTab = "playlist";
        runtimeState.playlistView = "current";
        runtimeSaveState();
        r.$render();
        r.$showToast(`Playing ${queue.length} playlist track${queue.length === 1 ? "" : "s"}${hydrated.failed ? ` · ${hydrated.failed} unavailable` : ""}`);
        return true;
      } finally {
        if (r.$playlistPlaybackStartingRequest === playRequest) {
          r.$playlistPlaybackStartingRequest = 0;
          r.$playlistPlaybackStarting = false;
        }
      }
    };
r.$navigatePlayerQueue = async function navigatePlayerQueue(direction) {
      const step = direction < 0 ? -1 : 1;
      if (!runtimeSeamless.enabled) return false;

      const seamlessIndex = Math.max(0, Number(runtimeSeamless.index) || 0);
      const seamlessQueue = Array.isArray(runtimeSeamless.queue) ? runtimeSeamless.queue : [];
      const playlistIndex = runtimeSeamless.track
        ? runtimeState.playlist.findIndex((item) => Boolean(r.$matchingQueueTrack([item], runtimeSeamless.track)))
        : -1;

      // The visible Now Playing list can be larger than the currently hydrated
      // offscreen queue. Navigate that list so an expired/missing stream is
      // refreshed on demand instead of making the footer controls appear inert.
      if (playlistIndex >= 0 && runtimeState.playlist.length > seamlessQueue.length) {
        let targetIndex = playlistIndex + step;
        while (targetIndex >= 0 && targetIndex < runtimeState.playlist.length) {
          const targetItemId = runtimeState.playlist[targetIndex]?.playlistItemId;
          if (await r.$playPlaylistAt(targetIndex)) return true;
          const refreshedTarget = runtimeState.playlist.find((item) => item.playlistItemId === targetItemId);
          if (refreshedTarget && r.$isReusableStreamUrl(refreshedTarget.url)) return false;
          targetIndex += step;
        }
      }

      const targetIndex = seamlessIndex + step;
      if (targetIndex >= 0 && targetIndex < seamlessQueue.length) {
        return Boolean(await r.$seamlessCommand(MESSAGES.SEAMLESS_PLAY_INDEX, { index: targetIndex, autoplay: true }));
      }

      if (step < 0) {
        await r.$seamlessCommand(MESSAGES.SEAMLESS_SEEK, { currentTime: 0 });
        return true;
      }
      r.$showToast("You’re at the end of Now Playing.");
      return false;
    };
r.$savePlaylistSnapshot = function savePlaylistSnapshot(items = runtimeState.playlist) {
      const playlistItems = r.$normalizePlaylist(items);
      if (!playlistItems.length) {
        r.$showToast("There is no playlist to save yet.");
        return;
      }
      if (!r.$requireDataHome()) return;
      if (!r.$hasSavedPlaylistCapacity()) return;
      const now = new Date();
      const suggestedName = `Playlist — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const name = window.prompt("Name this saved playlist", suggestedName)?.trim();
      if (!name) return;
      runtimeState.savedPlaylists.unshift({
        id: `saved-playlist-${Date.now()}`,
        name: name.slice(0, 120),
        savedAt: now.toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        items: structuredClone(playlistItems)
      });
      runtimeState.savedPlaylists = r.$normalizeSavedPlaylists(runtimeState.savedPlaylists);
      runtimeSaveState();
      r.$render();
      r.$showToast(`Saved “${name}”`);
    };
}

function registerPlaylistIo2(r) {
r.$restoreSavedPlaylist = function restoreSavedPlaylist(snapshot, mode = "replace", { syncPlayback = true } = {}) {
      const incoming = r.$normalizePlaylist(snapshot?.items);
      if (!incoming.length) return;
      r.$playlistPlayRequest += 1;
      r.$playlistPlaybackStartingRequest = 0;
      r.$playlistPlaybackStarting = false;
      r.$pendingPlaylistItemId = "";
      runtimeState.playlistMode = "manual";
      let addedCount = incoming.length;
      if (mode === "replace") {
        runtimeState.playlist = incoming;
      } else {
        addedCount = r.$addTracksToPlaylist(incoming, { quiet: true });
      }
      runtimeState.playlistView = "current";
      runtimeSaveState();
      r.$render();
      if (syncPlayback) void r.$syncActivePlaylistQueue();
      r.$showToast(mode === "replace"
        ? `Loaded “${snapshot.name}” into Now Playing`
        : addedCount
          ? `Added ${addedCount} track${addedCount === 1 ? "" : "s"} from “${snapshot.name}” to Now Playing`
          : `No new tracks from “${snapshot.name}” were added`);
    };
r.$shareFileName = function shareFileName(value, fallback) {
      const name = String(value || "").trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72);
      return name || fallback;
    };
r.$sharedCollectionDocument = function sharedCollectionDocument({ title, eyebrow, summary, rows, embeddedPayload, embeddedId }) {
      const emptyState = '<div class="empty">There are no items in this collection.</div>';
      const embeddedData = embeddedPayload && embeddedId
        ? `<script type="application/json" id="${escapeHtml(embeddedId)}">${embeddedPayload}<\/script>`
        : "";
      return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root{color-scheme:light;--ink:#17202a;--muted:#66737f;--line:#dfe5e8;--accent:#1687a7;--surface:#fff;--wash:#f3f6f7}
      *{box-sizing:border-box}body{background:var(--wash);color:var(--ink);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:42px 20px}main{margin:auto;max-width:820px}header{margin-bottom:24px}.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(28px,5vw,44px);letter-spacing:-.035em;line-height:1.05;margin:7px 0 10px}.summary{color:var(--muted);margin:0}.collection{display:grid;gap:12px}.item{align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;display:grid;gap:18px;grid-template-columns:96px minmax(0,1fr);padding:14px}.art,.art-placeholder{aspect-ratio:1;background:#e9eef0;border-radius:8px;display:block;object-fit:cover;overflow:hidden;width:96px}.art-placeholder{align-items:center;color:#8a969f;display:flex;font-size:11px;font-weight:700;justify-content:center;text-align:center}.kind{color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.item h2{font-size:19px;line-height:1.2;margin:2px 0}.item a{color:inherit;text-decoration-color:color-mix(in srgb,var(--accent) 55%,transparent);text-underline-offset:3px}.item h2 a{text-decoration:none}.item h2 a:hover{color:var(--accent)}.byline,.album{color:var(--muted);margin:3px 0}.album strong{color:var(--ink)}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.chip{background:#edf6f8;border:1px solid #cbe3e9;border-radius:999px;color:#226477;font-size:11px;font-weight:700;padding:2px 8px}.empty{background:var(--surface);border:1px solid var(--line);border-radius:12px;color:var(--muted);padding:28px;text-align:center}.footer{color:var(--muted);font-size:11px;margin-top:22px}.footer a{color:var(--accent)}
      @media(max-width:520px){body{padding:24px 12px}.item{align-items:start;gap:12px;grid-template-columns:72px minmax(0,1fr);padding:11px}.art,.art-placeholder{width:72px}.item h2{font-size:16px}}
    </style>
  </head>
  <body>
    <main>
      <header><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1><p class="summary">${escapeHtml(summary)}</p></header>
      <section class="collection">${rows || emptyState}</section>
      <p class="footer">Shared from Bandcamp with Bandkit. Open any title to view it on Bandcamp.</p>
    </main>
    ${embeddedData}
  </body>
  </html>`;
    };
r.$collectionArtwork = function collectionArtwork(imageUrl, title, pageUrl) {
      const art = resolveImage(imageUrl);
      if (!art) return '<div class="art-placeholder">No artwork</div>';
      const image = `<img class="art" src="${escapeHtml(art)}" alt="Artwork for ${escapeHtml(title)}" loading="lazy">`;
      return pageUrl ? `<a href="${escapeHtml(pageUrl)}">${image}</a>` : image;
    };
r.$createPlaylistDocument = function createPlaylistDocument(items = runtimeState.playlist, playlistName = "Bandkit playlist") {
      const playlistItems = r.$normalizePlaylist(items).map(r.$portablePlaylistItem).filter(Boolean);
      const exportedAt = new Date();
      const safeName = String(playlistName || "Bandkit playlist").trim().slice(0, 120) || "Bandkit playlist";
      const payload = {
        format: "bandkit-playlist",
        version: 1,
        name: safeName,
        exportedAt: exportedAt.toISOString(),
        sourcePage: portableBandcampUrl(location.href),
        items: playlistItems
      };
      const embeddedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
      const rows = playlistItems.map((item) => {
        const pageUrl = safeBandcampReleaseUrl(item.pageUrl);
        const artistUrl = safeBandcampUrl(item.artistUrl) || pageUrl;
        const title = pageUrl ? `<a href="${escapeHtml(pageUrl)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
        const artist = artistUrl ? `<a href="${escapeHtml(artistUrl)}">${escapeHtml(item.artist)}</a>` : escapeHtml(item.artist);
        const chips = [
          item.duration ? formatDuration(item.duration) : "",
          r.$formatPlaylistBpm(item.bpm),
          [item.key?.camelot, item.key?.shortName].filter(Boolean).join(" · ")
        ].filter(Boolean).map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("");
        return `<article class="item">${r.$collectionArtwork(item.art, item.title, pageUrl)}<div><div class="kind">Track</div><h2>${title}</h2><p class="byline">by ${artist}</p>${item.album ? `<p class="album"><strong>Album:</strong> ${escapeHtml(item.album)}</p>` : ""}${chips ? `<div class="chips">${chips}</div>` : ""}</div></article>`;
      }).join("");
      return {
        count: playlistItems.length,
        filename: `${r.$shareFileName(safeName, "bandkit-playlist")}.html`,
        title: safeName,
        text: `${playlistItems.length} track${playlistItems.length === 1 ? "" : "s"} shared from Bandkit`,
        html: r.$sharedCollectionDocument({
          title: safeName,
          eyebrow: "Shared playlist",
          summary: `${playlistItems.length} track${playlistItems.length === 1 ? "" : "s"} · Shared ${exportedAt.toLocaleString()}`,
          rows,
          embeddedPayload,
          embeddedId: "bandkit-playlist-data"
        })
      };
    };
r.$downloadHtmlDocument = function downloadHtmlDocument(documentData, message) {
      const blobUrl = URL.createObjectURL(new Blob([documentData.html], { type: "text/html" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = documentData.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      r.$showToast(message);
    };
r.$shareHtmlDocument = async function shareHtmlDocument(documentData, label) {
      const file = new File([documentData.html], documentData.filename, { type: "text/html" });
      try {
        const canShareFile = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
        if (typeof navigator.share === "function" && canShareFile) {
          await navigator.share({ title: documentData.title, text: documentData.text, files: [file] });
          r.$showToast(`Shared ${label}`);
          return;
        }
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
      r.$downloadHtmlDocument(documentData, `Sharing is unavailable here · downloaded ${label} instead`);
    };
r.$exportPlaylist = function exportPlaylist(items = runtimeState.playlist, playlistName = "Bandkit playlist") {
      const documentData = r.$createPlaylistDocument(items, playlistName);
      r.$downloadHtmlDocument(documentData, `Downloaded ${documentData.count} playlist track${documentData.count === 1 ? "" : "s"}`);
    };
r.$sharePlaylist = function sharePlaylist(items = runtimeState.playlist, playlistName = "Bandkit playlist") {
      const documentData = r.$createPlaylistDocument(items, playlistName);
      return r.$shareHtmlDocument(documentData, `“${documentData.title}”`);
    };
}

function registerPlaylistIo3(r) {
r.$parsePlaylistBackup = function parsePlaylistBackup(text) {
      const source = String(text || "").trim();
      if (!source) throw new Error("The selected file is empty.");
      let payload;
      if (source.startsWith("{")) {
        payload = JSON.parse(source);
      } else {
        const documentNode = new DOMParser().parseFromString(source, "text/html");
        const embedded = documentNode.querySelector("#bandkit-playlist-data")?.textContent;
        if (embedded) {
          payload = JSON.parse(embedded);
        } else {
          const heading = documentNode.querySelector("h1")?.textContent?.trim() || documentNode.title.trim();
          const legacyRows = [...documentNode.querySelectorAll("ol > li, ul > li")];
          const items = legacyRows.map((row, index) => {
            const title = row.querySelector("strong")?.textContent?.trim() || "";
            let pageUrl = row.querySelector("a[href]")?.href || "";
            try {
              const candidate = new URL(pageUrl);
              if (candidate.protocol === "http:" && (candidate.hostname === "bandcamp.com" || candidate.hostname.endsWith(".bandcamp.com"))) {
                candidate.protocol = "https:";
                pageUrl = candidate.href;
              }
            } catch {
              pageUrl = "";
            }
            const safePageUrl = safeBandcampReleaseUrl(pageUrl);
            if (!title || !safePageUrl) return null;
            const details = row.cloneNode(true);
            details.querySelectorAll("strong, a, br").forEach((node) => node.remove());
            let byline = details.textContent.replace(/\s+/g, " ").trim().replace(/^by\s+/i, "");
            const durationMatch = byline.match(/\s*\((\d+):(\d{2})\)\s*$/);
            const duration = durationMatch ? (Number(durationMatch[1]) * 60) + Number(durationMatch[2]) : 0;
            if (durationMatch) byline = byline.slice(0, durationMatch.index).trim();
            const [artist = "Bandcamp", ...albumParts] = byline.split(/\s+—\s+/);
            return {
              id: `legacy-import-${index}-${safePageUrl}`,
              title,
              artist: artist.trim() || "Bandcamp",
              album: albumParts.join(" — ").trim(),
              pageUrl: safePageUrl,
              duration
            };
          }).filter(Boolean);
          if (!items.length) throw new Error("This HTML file does not contain recognizable Bandkit playlist tracks.");
          payload = {
            format: "bandkit-playlist",
            version: 1,
            name: heading || "Bandkit playlist",
            exportedAt: new Date().toISOString(),
            sourcePage: "",
            items
          };
        }
      }
      if (payload?.format !== "bandkit-playlist" || Number(payload.version) !== 1 || !Array.isArray(payload.items)) {
        throw new Error("This is not a supported Bandkit playlist.");
      }
      const items = r.$normalizePlaylist(payload.items);
      if (!items.length) throw new Error("The playlist does not contain any valid Bandcamp tracks.");
      return {
        name: String(payload.name || "Imported playlist").trim().slice(0, 120) || "Imported playlist",
        savedAt: Number.isNaN(new Date(payload.exportedAt).getTime()) ? new Date().toISOString() : new Date(payload.exportedAt).toISOString(),
        sourcePage: portableBandcampUrl(payload.sourcePage),
        items
      };
    };
r.$importPlaylist = async function importPlaylist(file, button) {
      if (!file) return;
      if (!r.$requireDataHome()) return;
      if (!r.$hasSavedPlaylistCapacity()) return;
      button.disabled = true;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("Playlist files must be smaller than 5 MB.");
        const imported = r.$parsePlaylistBackup(await file.text());
        const fallbackName = String(file.name || "Imported playlist").replace(/\.(?:html?|json)$/i, "").replace(/^bandkit-playlist-?/i, "").trim();
        const snapshot = {
          id: `playlist-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: imported.name === "Bandkit playlist" && fallbackName ? fallbackName.slice(0, 120) : imported.name,
          savedAt: imported.savedAt,
          sourcePage: imported.sourcePage,
          items: imported.items
        };
        runtimeState.savedPlaylists.unshift(snapshot);
        runtimeState.savedPlaylists = r.$normalizeSavedPlaylists(runtimeState.savedPlaylists);
        runtimeSaveState();
        r.$render();
        r.$showToast(`Imported “${snapshot.name}” with ${snapshot.items.length} track${snapshot.items.length === 1 ? "" : "s"}`);
      } catch (error) {
        r.$showToast(error?.message || "The playlist could not be imported.");
      } finally {
        button.disabled = false;
      }
    };
r.$reportDiagnostic = function reportDiagnostic(status, error = "") {
      r.$persistLocal({
        bandcampHubDiagnostic: {
          status,
          error: String(error || ""),
          url: location.href,
          at: new Date().toISOString(),
          version: chrome.runtime.getManifest().version
        }
      }, false);
    };
r.$selectedAppearanceTheme = function selectedAppearanceTheme() {
      const selectedTheme = [...BUILT_IN_THEMES, ...(runtimeState.appearance.savedThemes || [])].find((theme) => theme.id === runtimeState.appearance.preset);
      if (runtimeState.appearance.preset === "custom") {
        return {
          id: "custom",
          label: "Custom",
          accent: runtimeState.appearance.customAccent,
          scrubAccent: runtimeState.appearance.customScrubAccent || runtimeState.appearance.customAccent,
          surface: runtimeState.appearance.customSurface,
          card: runtimeState.appearance.customCard,
          background: runtimeState.appearance.customPageBackground,
          pageSurface: runtimeState.appearance.customPageSurface,
          navbar: runtimeState.appearance.customNavbar,
          text: runtimeState.appearance.customText,
          secondaryText: runtimeState.appearance.customSecondaryText
        };
      }
      return selectedTheme || BUILT_IN_THEMES[0];
    };
r.$portableAppearanceTheme = function portableAppearanceTheme(theme = r.$selectedAppearanceTheme()) {
      const surfaceColor = hexColor(theme.surface, { r: 255, g: 255, b: 255, a: 1 });
      const pageSurface = theme.pageSurface || theme.surface;
      const text = theme.text || (luminance(hexColor(pageSurface, surfaceColor)) < 0.34 ? "#f8fafc" : "#111827");
      return {
        label: String(theme.label || "Custom").trim().slice(0, 28) || "Custom",
        accent: theme.accent,
        scrubAccent: theme.scrubAccent || theme.accent,
        surface: theme.surface,
        card: theme.card || hexString(luminance(surfaceColor) < 0.34
          ? mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.07)
          : mixColor(surfaceColor, { r: 255, g: 255, b: 255, a: 1 }, 0.4)),
        background: theme.background || theme.surface,
        pageSurface,
        navbar: theme.navbar || pageSurface,
        text,
        secondaryText: theme.secondaryText || hexString(mixColor(
          hexColor(text, { r: 17, g: 24, b: 39, a: 1 }),
          hexColor(pageSurface, surfaceColor),
          luminance(hexColor(pageSurface, surfaceColor)) < 0.34 ? 0.35 : 0.42
        ))
      };
    };
r.$validThemeHex = function validThemeHex(value) {
      return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
    };
r.$parseThemeBackup = function parseThemeBackup(text) {
      const source = String(text || "").trim();
      if (!source) throw new Error("The selected theme file is empty.");
      let payload;
      try {
        payload = JSON.parse(source);
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }
      if (payload?.format !== "bandkit-theme" || Number(payload.version) !== 1 || !payload.theme || typeof payload.theme !== "object") {
        throw new Error("This is not a supported Bandkit theme.");
      }
      const label = String(payload.name || payload.theme.label || "Imported theme").trim().slice(0, 28) || "Imported theme";
      const theme = { label };
      for (const key of THEME_COLOR_KEYS) {
        if (!r.$validThemeHex(payload.theme[key])) throw new Error(`The theme has an invalid ${key} colour.`);
        theme[key] = payload.theme[key].toLowerCase();
      }
      if (payload.theme.scrubAccent != null && !r.$validThemeHex(payload.theme.scrubAccent)) {
        throw new Error("The theme has an invalid scrubAccent colour.");
      }
      theme.scrubAccent = (payload.theme.scrubAccent || theme.accent).toLowerCase();
      return theme;
    };
r.$hasSavedThemeCapacity = function hasSavedThemeCapacity() {
      if ((runtimeState.appearance.savedThemes || []).length < MAX_SAVED_THEMES) return true;
      r.$showToast(`You can save up to ${MAX_SAVED_THEMES} themes. Delete one before creating or importing another.`);
      return false;
    };
}

function registerPlaylistIo4(r) {
r.$exportAppearanceTheme = function exportAppearanceTheme() {
      const theme = r.$portableAppearanceTheme();
      const exportedAt = new Date();
      const payload = {
        format: "bandkit-theme",
        version: 1,
        name: theme.label,
        exportedAt: exportedAt.toISOString(),
        theme: {
          ...Object.fromEntries(THEME_COLOR_KEYS.map((key) => [key, theme[key]])),
          scrubAccent: theme.scrubAccent
        }
      };
      const blobUrl = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
      const link = document.createElement("a");
      const slug = theme.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "custom";
      link.href = blobUrl;
      link.download = `bandkit-theme-${slug}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      r.$showToast(`Downloaded theme “${theme.label}”`);
    };
r.$importAppearanceTheme = async function importAppearanceTheme(file, button) {
      if (!file) return;
      button.disabled = true;
      try {
        if (!r.$hasSavedThemeCapacity()) return;
        if (file.size > 128 * 1024) throw new Error("Theme files must be smaller than 128 KB.");
        const imported = r.$parseThemeBackup(await file.text());
        const savedTheme = {
          id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ...imported
        };
        runtimeState.appearance.savedThemes = [...(runtimeState.appearance.savedThemes || []), savedTheme];
        runtimeState.appearance.preset = savedTheme.id;
        runtimeState.appearance.pageAware = false;
        runtimeState.appearance.customAccent = savedTheme.accent;
        runtimeState.appearance.customScrubAccent = savedTheme.scrubAccent === savedTheme.accent ? null : savedTheme.scrubAccent;
        runtimeState.appearance.customSurface = savedTheme.surface;
        runtimeState.appearance.customCard = savedTheme.card;
        runtimeState.appearance.customPageBackground = savedTheme.background;
        runtimeState.appearance.customPageSurface = savedTheme.pageSurface;
        runtimeState.appearance.customNavbar = savedTheme.navbar;
        runtimeState.appearance.customText = savedTheme.text;
        runtimeState.appearance.customSecondaryText = savedTheme.secondaryText;
        r.$applyAppearance();
        runtimeSaveState();
        r.$render();
        r.$showToast(`Imported and saved theme “${savedTheme.label}”`);
      } catch (error) {
        r.$showToast(error?.message || "The theme could not be imported.");
      } finally {
        button.disabled = false;
      }
    };
r.$accessibleAppearanceTheme = function accessibleAppearanceTheme(theme = r.$selectedAppearanceTheme()) {
      const white = { r: 255, g: 255, b: 255, a: 1 };
      const black = { r: 17, g: 24, b: 39, a: 1 };
      const panel = hexColor(theme.surface, white);
      const panelIsDark = luminance(panel) < 0.34;
      const card = hexColor(theme.card, panelIsDark ? mixColor(panel, white, 0.07) : mixColor(panel, white, 0.4));
      const background = hexColor(theme.background, luminance(panel) < 0.34 ? mixColor(panel, black, 0.38) : mixColor(panel, white, 0.28));
      const pageSurface = hexColor(theme.pageSurface, panel);
      const navbar = hexColor(theme.navbar, pageSurface);
      const preferredText = hexColor(theme.text, luminance(pageSurface) < 0.34 ? white : black);
      const panelTextResult = readableColor(preferredText, [panel], 7);
      const cardTextResult = readableColor(preferredText, [card], 7);
      const textResult = readableColor(preferredText, [pageSurface], 7);
      const backgroundTextResult = readableColor(preferredText, [background], 7);
      const navbarTextResult = readableColor(preferredText, [navbar], 7);
      const preferredSecondaryText = hexColor(theme.secondaryText, mixColor(preferredText, pageSurface, luminance(pageSurface) < 0.34 ? 0.35 : 0.42));
      const mutedResult = readableColor(preferredSecondaryText, [pageSurface], 4.5);
      const backgroundMutedResult = readableColor(preferredSecondaryText, [background], 4.5);
      const panelMutedResult = readableColor(preferredSecondaryText, [panel], 4.5);
      const cardMutedResult = readableColor(preferredSecondaryText, [card], 4.5);
      const preferredAccent = hexColor(theme.accent, { r: 29, g: 160, b: 195, a: 1 });
      const preferredScrubAccent = hexColor(theme.scrubAccent || theme.accent, preferredAccent);
      const panelAccentResult = readableColor(preferredAccent, [panel], 4.5);
      const cardAccentResult = readableColor(preferredAccent, [card], 4.5);
      const accentResult = readableColor(preferredAccent, [pageSurface], 4.5);
      const backgroundAccentResult = readableColor(preferredAccent, [background], 4.5);
      const text = textResult.color;
      const accent = accentResult.color;
      const panelAccent = panelAccentResult.color;
      const muted = mutedResult.color;
      const border = readableColor(mixColor(pageSurface, text, luminance(pageSurface) < 0.34 ? 0.24 : 0.16), [pageSurface], 3).color;
      const backgroundBorder = readableColor(mixColor(background, backgroundTextResult.color, luminance(background) < 0.34 ? 0.24 : 0.16), [background], 3).color;
      const panelBorder = readableColor(mixColor(panel, panelTextResult.color, luminance(panel) < 0.34 ? 0.24 : 0.16), [panel], 3).color;
      const cardBorder = readableColor(mixColor(card, cardTextResult.color, luminance(card) < 0.34 ? 0.24 : 0.16), [card], 3).color;
      const onAccent = contrast(accent, white) >= contrast(accent, black) ? white : black;
      const backgroundOnAccent = contrast(backgroundAccentResult.color, white) >= contrast(backgroundAccentResult.color, black) ? white : black;
      const panelOnAccent = contrast(panelAccent, white) >= contrast(panelAccent, black) ? white : black;
      const cardOnAccent = contrast(cardAccentResult.color, white) >= contrast(cardAccentResult.color, black) ? white : black;
      return {
        panel, card, background, pageSurface, navbar, text,
        panelText: panelTextResult.color, cardText: cardTextResult.color,
        panelMuted: panelMutedResult.color, cardMuted: cardMutedResult.color,
        backgroundText: backgroundTextResult.color, backgroundMuted: backgroundMutedResult.color,
        backgroundAccent: backgroundAccentResult.color, backgroundBorder, backgroundOnAccent,
        navbarText: navbarTextResult.color,
        accent, panelAccent, cardAccent: cardAccentResult.color, preferredScrubAccent, muted,
        border, panelBorder, cardBorder, onAccent, panelOnAccent, cardOnAccent,
        adjusted: panelTextResult.adjusted || cardTextResult.adjusted || textResult.adjusted || backgroundTextResult.adjusted || navbarTextResult.adjusted || mutedResult.adjusted || backgroundMutedResult.adjusted || panelMutedResult.adjusted || cardMutedResult.adjusted || panelAccentResult.adjusted || cardAccentResult.adjusted || accentResult.adjusted || backgroundAccentResult.adjusted,
        textContrast: Math.min(contrast(panelTextResult.color, panel), contrast(cardTextResult.color, card), contrast(text, pageSurface), contrast(backgroundTextResult.color, background), contrast(navbarTextResult.color, navbar)),
        accentContrast: Math.min(contrast(panelAccent, panel), contrast(cardAccentResult.color, card), contrast(accent, pageSurface))
      };
    };
}

export const registerPlaylistIo = [registerPlaylistIo1, registerPlaylistIo2, registerPlaylistIo3, registerPlaylistIo4];

export const setupPlaylistIo = [];
