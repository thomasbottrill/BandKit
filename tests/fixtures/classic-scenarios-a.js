window.fixtureScenarios = {
  async "album-switch-performance"(root) {
    window.fixtureRuntimeMessages.length = 0;
    window.fixtureNativeMediaPaused.fill(false);
    window.fixtureAlbumSwitchStartedAt = performance.now();
    document.querySelectorAll(".track_row_view .play_status")[1]?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const enableMessages = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
    const resolveMessages = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS");
    const elapsed = window.fixtureAlbumSwitchFinishedAt - window.fixtureAlbumSwitchStartedAt;
    const currentTitle = root?.querySelector(".hub-player-title")?.textContent || "";
    const firstSilencePass = window.fixtureNativeMediaPaused.every(Boolean)
      && window.fixtureNativeMediaPauseCounts.every((count) => count >= 1);
    window.fixtureNativeMediaPaused.fill(false);
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: { enabled: true, status: "paused", isPlaying: false, currentTime: 0, duration: 200, index: 1, track: window.fixtureAlbumPerformanceQueue[1], queue: window.fixtureAlbumPerformanceQueue } }, {}, () => {});
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    const watchdogSilencePass = window.fixtureNativeMediaPaused.every(Boolean)
      && window.fixtureNativeMediaPauseCounts.every((count) => count >= 2);
    document.title = enableMessages.length === 1
      && enableMessages[0].index === 0
      && enableMessages[0].queue?.map((track) => track.title).join(",") === "Next Fixture Track"
      && resolveMessages.length === 0
      && elapsed >= 0
      && elapsed < 100
      && currentTitle.includes("Next Fixture Track")
      && firstSilencePass
      && watchdogSilencePass
      ? `PASS: album track switches in ${Math.round(elapsed)}ms with single playback owner`
      : `FAIL: album switch enable:${enableMessages.length} resolve:${resolveMessages.length} elapsed:${Math.round(elapsed)} title:${currentTitle} silence:${firstSilencePass}/${watchdogSilencePass}`;
    return;
  },
  async "dj-bpm-range-reset"(root) {
    root?.querySelector(".hub-dj-player-button")?.click();
    const bpmState = {
      enabled: true,
      status: "playing",
      isPlaying: true,
      rate: 1,
      preservePitch: true,
      detectedBpm: 140,
      automaticBpm: 140,
      bpmSource: "auto",
      bpmStatus: "ready",
      track: { title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track" },
      queue: []
    };
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: bpmState }, {}, () => {});
    const bpmInput = root?.querySelector(".hub-dj-bpm-input");
    if (bpmInput) {
      bpmInput.focus();
      bpmInput.value = "50";
      bpmInput.dispatchEvent(new Event("input", { bubbles: true }));
      bpmInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const lowRateMessage = window.fixtureRuntimeMessages.find((message) => message.type === "BANDCAMP_HUB_SEAMLESS_SET_RATE" && message.rate < 0.5);
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: { ...bpmState, rate: 0.35 } }, {}, () => {});
    root?.querySelector(".hub-dj-bpm-reset")?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const resetIndex = window.fixtureRuntimeMessages.findIndex((message) => message.type === "BANDCAMP_HUB_SEAMLESS_RESET_BPM");
    const neutralRateAfterReset = window.fixtureRuntimeMessages.slice(resetIndex + 1).some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_SET_RATE" && message.rate === 1);
    document.title = Math.abs((lowRateMessage?.rate || 0) - (50 / 140)) < 0.001
      && resetIndex >= 0
      && neutralRateAfterReset
      ? "PASS: extended BPM range and reset fixture"
      : `FAIL: BPM rate ${lowRateMessage?.rate || "missing"}, reset ${resetIndex}/${neutralRateAfterReset}`;
    return;
  },
  async "feed-home-setting"(root) {
    const toggle = root?.querySelector(".hub-feed-home-toggle");
    const enabledByDefault = toggle?.getAttribute("aria-checked") === "true";
    toggle?.click();
    document.title = enabledByDefault
      && window.fixtureStored.bandcampHubState?.openHomeToFeed === false
      ? "PASS: feed homepage setting fixture"
      : "FAIL: feed homepage setting fixture";
    return;
  },
  async "header-shadow-cart"(root) {
    const nativeCart = window.fixtureMenuShadow?.querySelector('button[aria-label="Cart"]');
    const nativeCartWrapper = nativeCart?.closest("li");
    const hiddenByDefault = getComputedStyle(nativeCart).display === "none"
      && getComputedStyle(nativeCartWrapper).display === "none"
      && nativeCart.style.getPropertyValue("display") === "none"
      && nativeCart.style.getPropertyPriority("display") === "important"
      && window.fixtureMenuShadow.querySelector("#bandkit-native-header-cart-style");
    root?.querySelector('.hub-header-shortcut[data-tab="settings"]')?.click();
    root?.querySelector('[role="switch"][aria-label="Hide shopping cart"]')?.click();
    const restored = getComputedStyle(nativeCart).display === "flex"
      && getComputedStyle(nativeCartWrapper).display === "flex"
      && !nativeCart.hasAttribute("hidden")
      && !nativeCartWrapper.hasAttribute("hidden")
      && nativeCart.style.getPropertyValue("display") === ""
      && window.fixtureStored.bandcampHubState?.appearance?.hidePageCart === false
      && window.fixtureStored.bandcampHubState?.appearance?.hideHeaderCart === false;
    root?.querySelector('[role="switch"][aria-label="Hide shopping cart"]')?.click();
    const hiddenAgain = getComputedStyle(nativeCart).display === "none"
      && getComputedStyle(nativeCartWrapper).display === "none"
      && window.fixtureStored.bandcampHubState?.appearance?.hidePageCart === true
      && window.fixtureStored.bandcampHubState?.appearance?.hideHeaderCart === true;
    document.title = hiddenByDefault && restored && hiddenAgain
      ? "PASS: shadow header cart visibility fixture"
      : `FAIL: shadow cart ${getComputedStyle(nativeCart).display}/${getComputedStyle(nativeCartWrapper).display}`;
    return;
  },
  async "page-footer-space"(root) {
    const spacer = document.querySelector("#bandcamp-hub-player-spacer");
    const pageFooter = document.querySelector("page-footer");
    const playerHeight = Math.round(root?.querySelector(".hub-player")?.getBoundingClientRect().height || 0);
    const reserved = spacer?.parentElement?.id === "propOpenWrapper"
      && spacer.previousElementSibling === pageFooter
      && Math.round(spacer.getBoundingClientRect().height) === playerHeight
      && getComputedStyle(spacer.parentElement).scrollPaddingBottom === `${playerHeight}px`;
    document.title = reserved
      ? "PASS: page footer player space fixture"
      : `FAIL: footer space ${spacer?.parentElement?.id || "missing"}/${spacer?.previousElementSibling?.tagName || "none"}`;
    return;
  },
  async "panel-header-unify"(root) {
    const closeParent = () => root?.querySelector(".hub-close")?.parentElement;
    const placements = {};
    const titleMetrics = {};
    const captureTitleMetrics = (name, selector) => {
      const label = root?.querySelector(selector);
      const rect = label?.getBoundingClientRect();
      const style = label ? getComputedStyle(label) : null;
      titleMetrics[name] = label && rect && style ? {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight
      } : null;
    };
    placements.settings = closeParent()?.matches(".hub-section-heading.hub-panel-content-header");
    captureTitleMetrics("settings", ".hub-section-heading-label");
    for (const tab of ["cart", "activity", "playlist"]) {
      root?.querySelector(`.hub-header-shortcut[data-tab="${tab}"]`)?.click();
      placements[tab] = closeParent()?.classList.contains("hub-panel-content-header");
      captureTitleMetrics(tab, tab === "cart" ? ".hub-cart-view-tab.is-active" : ".hub-section-heading-label");
    }
    root?.querySelector(".hub-now-playing-button")?.click();
    placements.nowPlaying = closeParent()?.matches(".hub-now-playing-header.hub-panel-content-header");
    captureTitleMetrics("nowPlaying", ".hub-section-heading-label");
    const nowPlayingHeader = closeParent();
    const nowPlayingToolbar = root?.querySelector(".hub-now-playing-toolbar");
    const toolbarActions = [...(nowPlayingToolbar?.querySelectorAll(".hub-playlist-toolbar-icon") || [])];
    const unified = getComputedStyle(root?.querySelector(".hub-header")).display === "none"
      && Object.values(placements).every(Boolean)
      && Object.values(titleMetrics).every((metrics) => metrics && JSON.stringify(metrics) === JSON.stringify(titleMetrics.cart))
      && getComputedStyle(root?.querySelector(".hub-section-heading-label"), "::after").visibility === "hidden"
      && !nowPlayingHeader?.querySelector(".hub-playlist-toolbar-icon")
      && nowPlayingToolbar?.querySelector(".hub-cart-backup-time")?.textContent.includes("song")
      && toolbarActions.length === 2
      && toolbarActions.every((button) => getComputedStyle(button).width === "30px" && getComputedStyle(button).height === "30px" && getComputedStyle(button).borderRadius === "5px" && getComputedStyle(button.querySelector(".hub-button-icon")).width === "14px")
      && nowPlayingToolbar?.querySelectorAll(".hub-toolbar-menu-action").length === 4
      && getComputedStyle(nowPlayingToolbar?.querySelector(".hub-toolbar")).gap === "6px"
      && getComputedStyle(nowPlayingHeader?.querySelector(".hub-close")).width === "30px";
    document.title = unified
      ? "PASS: unified panel headers fixture"
      : `FAIL: panel headers ${JSON.stringify(placements)}`;
    return;
  },
  async "cart-roundtrip"(root) {
    root?.querySelectorAll(".hub-cart-view-tab").forEach((button) => {
      if (button.textContent.includes("Cart")) button.click();
    });
    const downloadButton = root?.querySelector('.hub-cart-backup [aria-label="Download cart"]');
    const importInput = root?.querySelector('.hub-cart-backup input[type="file"]');
    const importButton = root?.querySelector('.hub-cart-backup [aria-label="Import cart"]');
    const shareButton = root?.querySelector('.hub-cart-backup [aria-label="Share cart"]');
    const cartRemoveButtons = [...(root?.querySelectorAll(".hub-cart-remove-button") || [])];
    const cartActionButtons = [...(root?.querySelectorAll(".hub-cart-backup .hub-playlist-toolbar-icon") || [])];
    const cartActionToolbar = root?.querySelector(".hub-cart-backup .hub-toolbar");
    downloadButton?.click();
    const download = window.fixtureDownloads.at(-1);
    const exportedHtml = download ? await download.blob.text() : "";
    const exportedDocument = new DOMParser().parseFromString(exportedHtml, "text/html");
    const embeddedText = exportedDocument.querySelector("#bandkit-cart-data")?.textContent || "";
    let payload = null;
    try { payload = JSON.parse(embeddedText); } catch {}
    shareButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const sharedFile = window.fixtureShares[0]?.files?.[0];
    const sharedHtml = sharedFile ? await sharedFile.text() : "";
    const sharedDocument = new DOMParser().parseFromString(sharedHtml, "text/html");
    if (importInput && download) {
      const file = new File([download.blob], download.filename, { type: "text/html" });
      Object.defineProperty(importInput, "files", { configurable: true, value: [file] });
      importInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const importedSnapshot = window.fixtureStored.bandcampHubState?.savedCarts?.find((snapshot) => String(snapshot.id).startsWith("cart-import-"));
    document.title = download?.filename.endsWith(".html")
      && payload?.format === "bandkit-cart"
      && payload?.version === 1
      && payload?.items?.length === 3
      && importButton
      && shareButton
      && sharedFile?.name.endsWith(".html")
      && sharedFile?.type === "text/html"
      && sharedDocument.querySelectorAll(".item").length === 3
      && exportedDocument.querySelectorAll(".item").length === 3
      && exportedDocument.querySelectorAll("img.art").length === 3
      && exportedDocument.querySelector(".item .byline")?.textContent.includes("Fixture Artist")
      && exportedDocument.querySelector('.item h2 a[href*="/album/"]')
      && cartRemoveButtons.length === 3
      && cartRemoveButtons.every((button) => !button.textContent.trim() && button.querySelector(".hub-button-icon") && getComputedStyle(button).color !== "rgb(239, 68, 68)")
      && cartActionButtons.length === 2
      && cartActionButtons.every((button) => getComputedStyle(button).width === "30px" && getComputedStyle(button).height === "30px" && getComputedStyle(button).borderRadius === "5px" && getComputedStyle(button.querySelector(".hub-button-icon")).width === "14px")
      && root?.querySelectorAll(".hub-cart-overflow .hub-toolbar-menu-action").length === 3
      && getComputedStyle(cartActionToolbar).gap === "6px"
      && importedSnapshot?.items?.length === 3
      ? "PASS: cart backup round trip"
      : `FAIL: cart backup round trip ${payload?.format || "no payload"}/${payload?.items?.length || 0}/${importedSnapshot?.items?.length || 0}`;
    return;
  },
  async "navigation-reconnect"(root) {
    const currentItem = root?.querySelector(".hub-queue-item");
    const pause = currentItem?.querySelector('.hub-queue-action[aria-label^="Pause"]');
    pause?.click();
    document.title = currentItem?.textContent.includes("Previous Page Track")
      && root?.querySelector(".hub-player-title")?.textContent === "Previous Page Track"
      && root?.querySelector(".hub-play-button .hub-pause-glyph")
      && window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE")
      ? "PASS: navigation reconnects active playback"
      : "FAIL: navigation lost active playback";
    return;
  },
  async "page-stale-playback"(root) {
    const staleTrack = {
      id: "stale", title: "Stale Track", artist: "Previous Artist",
      pageUrl: "https://previous-artist.bandcamp.com/track/stale-track",
      duration: 200, url: "https://t4.bcbits.com/stream/stale-track"
    };
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: {
      enabled: true, status: "playing", isPlaying: true, currentTime: 20, duration: 200,
      index: 0, track: staleTrack, queue: [staleTrack]
    } }, {}, () => {});
    const titleBeforeClick = document.querySelector(".inline_player .title")?.textContent;
    document.querySelector(".fixture-native-play")?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const enableRequest = window.fixtureRuntimeMessages.findLast((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
    document.title = titleBeforeClick === "Fixture Track"
      && enableRequest?.queue?.[enableRequest.index]?.title === "Fixture Track"
      ? "PASS: stale playback switches to clicked page track"
      : `FAIL: stale playback ${titleBeforeClick}/${enableRequest?.queue?.[enableRequest.index]?.title || "no handoff"}`;
    return;
  },
  async "page-playing-sync"(root) {
    const queue = [
      { id: "1", title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track", duration: 180, url: "https://t4.bcbits.com/stream/fixture-track" },
      { id: "2", title: "Next Fixture Track (Bandkit)", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/next-fixture-track", duration: 210, url: "https://t4.bcbits.com/stream/next-fixture-track" }
    ];
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: {
      enabled: true, status: "playing", isPlaying: true, currentTime: 42, duration: 210, progress: 0.2,
      index: 1, track: queue[1], queue
    } }, {}, () => {});
    const inlinePlayer = document.querySelector(".inline_player");
    const inlineControl = inlinePlayer?.querySelector(".playbutton");
    const inlineAction = inlineControl?.closest("button, a, [role='button']");
    const rows = [...document.querySelectorAll(".track_row_view")];
    const firstControl = rows[0]?.querySelector(".play_status");
    const currentControl = rows[1]?.querySelector(".play_status");
    const synced = inlinePlayer?.querySelector(".title")?.textContent === "Next Fixture Track (Bandkit)"
      && inlinePlayer?.classList.contains("bandcamp-hub-is-playing")
      && inlineControl?.classList.contains("playing")
      && inlineAction?.getAttribute("aria-label") === "Pause"
      && !firstControl?.classList.contains("playing")
      && currentControl?.classList.contains("playing")
      && currentControl?.getAttribute("aria-label") === "Pause"
      && rows[1]?.classList.contains("bandcamp-hub-current")
      && rows[1]?.classList.contains("bandcamp-hub-is-playing")
      && inlinePlayer?.querySelector(".time_elapsed")?.textContent === "0:42"
      && inlinePlayer?.querySelector(".time_total")?.textContent === "3:30"
      && inlinePlayer?.querySelector(".progbar_fill")?.style.width === "20%"
      && inlinePlayer?.querySelector(".thumb")?.style.left === "20%";
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: {
      enabled: false, status: "idle", isPlaying: false
    } }, {}, () => {});
    const cleaned = !document.querySelector("[data-bandkit-playback-state]")
      && !inlineControl?.classList.contains("playing")
      && !currentControl?.classList.contains("playing")
      && currentControl?.getAttribute("aria-label") === null
      && inlinePlayer?.querySelector(".title")?.textContent === "Fixture Track"
      && inlinePlayer?.querySelector(".time_elapsed")?.textContent === "0:00"
      && inlinePlayer?.querySelector(".time_total")?.textContent === "3:00"
      && inlinePlayer?.querySelector(".progbar_fill")?.style.width === "0%"
      && inlinePlayer?.querySelector(".thumb")?.style.left === "0%";
    document.title = synced && cleaned
      ? "PASS: page playing state sync fixture"
      : `FAIL: page playing state sync ${inlinePlayer?.querySelector(".title")?.textContent}/${inlineControl?.className}/${currentControl?.className}`;
    return;
  },
  async "page-unrelated-playing-sync"(root) {
    const pageQueue = [
      { id: "1", title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track", duration: 180, url: "https://t4.bcbits.com/stream/fixture-track" },
      { id: "2", title: "Next Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/next-fixture-track", duration: 210, url: "https://t4.bcbits.com/stream/next-fixture-track" }
    ];
    const remoteTrack = { id: "remote", title: "Hatching", artist: "MOULD", pageUrl: "https://moulditsmould.bandcamp.com/track/hatching", duration: 263, url: "https://t4.bcbits.com/stream/hatching" };
    const setPlayback = (track, queue, currentTime, duration) => window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: {
      enabled: true, status: "playing", isPlaying: true, currentTime, duration, progress: currentTime / duration,
      index: Math.max(0, queue.indexOf(track)), track, queue
    } }, {}, () => {});
    const inlinePlayer = document.querySelector(".inline_player");
    const untouched = () => inlinePlayer?.querySelector(".title")?.textContent === "Fixture Track"
      && inlinePlayer?.querySelector(".time_elapsed")?.textContent === "0:00"
      && inlinePlayer?.querySelector(".time_total")?.textContent === "3:00"
      && inlinePlayer?.querySelector(".progbar_fill")?.style.width === "0%"
      && inlinePlayer?.querySelector(".thumb")?.style.left === "0%"
      && !inlinePlayer?.classList.contains("bandcamp-hub-current")
      && !inlinePlayer?.classList.contains("bandcamp-hub-is-playing")
      && !document.body.classList.contains("bandcamp-hub-remote-playing");
    setPlayback(remoteTrack, [remoteTrack], 88, 263);
    const unrelatedStayedNative = untouched();
    setPlayback(pageQueue[1], pageQueue, 42, 210);
    const matchingTrackSynced = inlinePlayer?.classList.contains("bandcamp-hub-is-playing")
      && inlinePlayer?.querySelector(".title")?.textContent === "Next Fixture Track";
    setPlayback(remoteTrack, [remoteTrack], 90, 263);
    const restoredAfterLeavingPage = untouched();
    document.title = unrelatedStayedNative && matchingTrackSynced && restoredAfterLeavingPage
      ? "PASS: unrelated playback leaves album player native"
      : `FAIL: unrelated playback ${inlinePlayer?.querySelector(".title")?.textContent}/${inlinePlayer?.querySelector(".time_elapsed")?.textContent}/${inlinePlayer?.className}`;
    return;
  },
  async "appearance-reskin"(root) {
    const parseRgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value) => parseRgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => (Math.max(luminance(first), luminance(second)) + 0.05) / (Math.min(luminance(first), luminance(second)) + 0.05);
    const bodyStyles = getComputedStyle(document.body);
    const pageStyles = getComputedStyle(document.querySelector("#pgBd"));
    const secondaryStyles = getComputedStyle(document.querySelector(".secondaryText"));
    const linkStyles = getComputedStyle(document.querySelector("a.track-title"));
    const colourFields = root?.querySelectorAll('.hub-custom-theme-panel input[type="color"]');
    const accessibility = root?.querySelector(".hub-theme-accessibility");
    const themed = document.documentElement.dataset.bandkitPageTheme === "true"
      && bodyStyles.backgroundColor === "rgb(247, 247, 247)"
      && pageStyles.backgroundColor === "rgb(17, 17, 17)"
      && ratio(bodyStyles.color, bodyStyles.backgroundColor) >= 4.5
      && ratio(linkStyles.color, pageStyles.backgroundColor) >= 3
      && secondaryStyles.color === "rgb(176, 176, 176)"
      && colourFields?.length === 9
      && root?.querySelector('input[aria-label="Bandkit content colour"]')
      && root?.querySelector('input[aria-label="Artist navigation colour"]')
      && root?.querySelector('input[aria-label="Secondary text colour"]')
      && !root?.textContent.includes("Reset panel and launcher positions")
      && !root?.textContent.includes("Local data")
      && accessibility?.textContent.includes("Contrast adjusted automatically");
    document.title = themed
      ? "PASS: Bandcamp appearance reskin fixture"
      : `FAIL: Bandcamp appearance reskin ${bodyStyles.backgroundColor}/${pageStyles.backgroundColor}/${colourFields?.length}`;
    return;
  },
  async "single-track-cart"(root) {
    document.dispatchEvent(new CustomEvent("bandkit:cart-state", { detail: {
      items: [{
        item_type: "t", item_id: 501, item_title: "Hyperfixated", unit_price: 3.5,
        currency: "AUD", quantity: 1,
        releases: [{ artist_name: "amwa", art_id: 987654321, item_art_url: "http://127.0.0.1:8765/tests/fixtures/assets/art-clouds.png", url: "https://amwa.bandcamp.com/track/hyperfixated" }]
      }],
      summary: { subtotal: 3.5, currency: "AUD" }
    } }));
    const cartCard = root?.querySelector(".hub-product-main");
    const art = cartCard?.querySelector(".hub-art");
    const artist = cartCard?.querySelector(".hub-track-artist");
    document.title = art?.src.includes("tests/fixtures/assets/art-clouds.png")
      && artist?.textContent === "amwa"
      && artist?.href === "https://amwa.bandcamp.com/"
      ? "PASS: single digital track cart artwork fixture"
      : `FAIL: single track cart ${art?.src || "no art"} / ${artist?.textContent || "no artist"}`;
    return;
  },
  async "cart-artist-metadata"(root) {
    document.dispatchEvent(new CustomEvent("bandkit:cart-state", { detail: {
      items: [{
        item_type: "a", item_id: 701, item_title: "Artist Metadata Album",
        unit_price: 8, currency: "AUD", quantity: 1,
        url: "https://resolved-cart-artist.bandcamp.com/album/artist-metadata-album"
      }],
      summary: { subtotal: 8, currency: "AUD" }
    } }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    root?.querySelector('.hub-header-shortcut[data-tab="cart"]')?.click();
    const artist = root?.querySelector(".hub-product-details .hub-track-artist")?.textContent;
    document.title = artist === "Resolved Cart Artist"
      ? "PASS: cart artist metadata fixture"
      : `FAIL: cart artist ${artist || "missing"}`;
    return;
  }
};
