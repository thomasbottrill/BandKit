Object.assign(window.fixtureScenarios, {
  async "theme-management"(root) {
    const selectedLabel = root?.querySelector(".hub-theme-combobox-label")?.textContent;
    const managementActions = [...(root?.querySelectorAll(".hub-theme-management-action") || [])];
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;
    let renamed = false;
    let cancelledDelete = false;
    let deleted = false;
    try {
      window.prompt = () => "Renamed Night";
      managementActions.find((button) => button.textContent.includes("Rename"))?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      renamed = root?.querySelector(".hub-theme-combobox-label")?.textContent === "Renamed Night"
        && window.fixtureStored.bandcampHubState?.appearance?.savedThemes?.[0]?.label === "Renamed Night";
      window.confirm = () => false;
      root?.querySelector(".hub-theme-management-action.is-danger")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      cancelledDelete = window.fixtureStored.bandcampHubState?.appearance?.savedThemes?.length === 1;
      window.confirm = () => true;
      root?.querySelector(".hub-theme-management-action.is-danger")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      deleted = window.fixtureStored.bandcampHubState?.appearance?.savedThemes?.length === 0
        && window.fixtureStored.bandcampHubState?.appearance?.preset === "custom"
        && root?.querySelector('.hub-custom-theme-panel input[aria-label="Accent colour"]')?.value === "#7c3aed"
        && root?.querySelector('.hub-custom-theme-panel input[aria-label="Track scrub colour"]')?.value === "#ec4899";
    } finally {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    }
    document.title = selectedLabel === "Fixture Night"
      && managementActions.length === 2
      && renamed
      && cancelledDelete
      && deleted
      ? "PASS: saved theme management fixture"
      : `FAIL: theme management ${selectedLabel}/${managementActions.length}/${renamed}/${cancelledDelete}/${deleted}`;
    return;
  },
  async "page-playlist-placement"(root) {
    const tools = document.querySelector(".inline_player > .bandcamp-hub-page-tools");
    const playerPlaylist = tools?.querySelector(".bandcamp-hub-page-playlist.is-player-control");
    const playerCart = tools?.querySelector(".bandcamp-hub-page-cart");
    const pageDj = tools?.querySelector(".bandcamp-hub-page-dj");
    const listActions = [...document.querySelectorAll(".track_row_view .bandcamp-hub-page-playlist.is-track-action")];
    const firstBuy = document.querySelector(".track_row_view .buy-link:not(.bandcamp-hub-page-playlist)");
    const hiddenOpacity = listActions[0] ? getComputedStyle(listActions[0]).opacity : "";
    listActions[0]?.focus();
    const focusedOpacity = listActions[0] ? getComputedStyle(listActions[0]).opacity : "";
    listActions[0]?.blur();
    root?.querySelector(".hub-close")?.click();
    const nativeHeaderCart = document.querySelector("#fixture-header-cart");
    const nativeHeaderCartSuppressed = nativeHeaderCart?.hidden
      && nativeHeaderCart.closest("li")?.hidden
      && getComputedStyle(nativeHeaderCart).display === "none";
    nativeHeaderCart?.click();
    const nativeHeaderCartWorks = !root?.querySelector(".hub-panel")?.classList.contains("is-hidden")
      && root?.querySelector('.hub-tab[data-tab="cart"]')?.getAttribute("aria-current") === "page";
    root?.querySelector(".hub-close")?.click();
    const panelClosedBeforeCart = root?.querySelector(".hub-panel")?.classList.contains("is-hidden");
    playerCart?.click();
    const cartNavigationWorks = panelClosedBeforeCart
      && !root?.querySelector(".hub-panel")?.classList.contains("is-hidden")
      && root?.querySelector('.hub-tab[data-tab="cart"]')?.getAttribute("aria-current") === "page"
      && !document.querySelector(".bandcamp-hub-page-cart-menu")
      && window.fixturePurchaseClicks === 1;
    window.fixtureRuntimeListener?.({
      type: "BANDCAMP_HUB_SEAMLESS_STATE",
      state: {
        enabled: true,
        status: "playing",
        isPlaying: true,
        currentTime: 10,
        duration: 180,
        index: 0,
        track: { title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track" },
        queue: []
      }
    }, {}, () => {});
    const playPauseCommandsBefore = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE").length;
    playerPlaylist?.click();
    const playerPlaylistMenuWorksDuringPlayback = document.querySelector(".bandcamp-hub-page-playlist-menu")?.textContent.includes("Add to Now Playing")
      && window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE").length === playPauseCommandsBefore;
    playerPlaylist?.click();
    listActions[0]?.click();
    const destinationMenu = document.querySelector(".bandcamp-hub-page-playlist-menu");
    const activeTopTabIcon = root?.querySelector(".hub-tab.is-active .hub-tab-icon");
    const inactiveTopTabIcon = root?.querySelector(".hub-tab:not(.is-active) .hub-tab-icon");
    document.title = tools?.children[0] === playerPlaylist
      && tools?.children[1] === playerCart
      && tools?.children[2] === pageDj
      && getComputedStyle(playerPlaylist).width === getComputedStyle(pageDj).width
      && getComputedStyle(playerPlaylist).height === getComputedStyle(pageDj).height
      && getComputedStyle(playerPlaylist).backgroundColor === getComputedStyle(pageDj).backgroundColor
      && getComputedStyle(playerPlaylist).borderColor === getComputedStyle(pageDj).borderColor
      && getComputedStyle(playerCart).width === getComputedStyle(pageDj).width
      && getComputedStyle(playerCart).height === getComputedStyle(pageDj).height
      && getComputedStyle(playerCart).backgroundColor === getComputedStyle(pageDj).backgroundColor
      && getComputedStyle(playerCart).borderColor === getComputedStyle(pageDj).borderColor
      && playerCart?.style.getPropertyValue("--hub-cart-icon").includes("icon-cart.svg")
      && playerCart?.getAttribute("aria-label") === "Open Bandcamp purchase options and Bandkit cart"
      && nativeHeaderCartSuppressed
      && nativeHeaderCartWorks
      && cartNavigationWorks
      && playerPlaylistMenuWorksDuringPlayback
      && getComputedStyle(playerPlaylist).fontFamily === getComputedStyle(document.body).fontFamily
      && listActions.length === 2
      && listActions[0]?.nextElementSibling === firstBuy
      && firstBuy?.classList.contains("bandcamp-hub-page-buy")
      && firstBuy?.getAttribute("aria-label") === "Buy Fixture Track"
      && firstBuy?.style.getPropertyValue("--hub-buy-icon").includes("icon-cart.svg")
      && getComputedStyle(firstBuy).width === getComputedStyle(listActions[0]).width
      && getComputedStyle(firstBuy).height === getComputedStyle(listActions[0]).height
      && getComputedStyle(firstBuy).backgroundColor === getComputedStyle(listActions[0]).backgroundColor
      && getComputedStyle(firstBuy).borderColor === getComputedStyle(listActions[0]).borderColor
      && getComputedStyle(firstBuy).textDecorationLine === "none"
      && !playerPlaylist?.textContent.trim()
      && playerPlaylist?.style.getPropertyValue("--hub-plus-icon").includes("icon-plus.svg")
      && listActions.every((action) => !action.textContent.trim()
        && !action.classList.contains("bandcamp-hub-page-buy")
        && action.style.getPropertyValue("--hub-plus-icon").includes("icon-plus.svg")
        && getComputedStyle(action).borderRadius === "4px"
        && getComputedStyle(action).marginRight === "8px"
        && getComputedStyle(action).textDecorationLine === "none")
      && destinationMenu?.textContent.includes("Add to Now Playing")
      && destinationMenu?.textContent.includes("Add to Playlist")
      && destinationMenu?.textContent.includes("Add to Cart")
      && getComputedStyle(activeTopTabIcon).backgroundColor === "rgb(255, 255, 255)"
      && getComputedStyle(activeTopTabIcon).opacity === "1"
      && Number(getComputedStyle(inactiveTopTabIcon).opacity) < 0.7
      && hiddenOpacity === "0"
      && focusedOpacity === "1"
      ? "PASS: page playlist placement fixture"
      : `FAIL: page playlist placement ${listActions.length}/${hiddenOpacity}/${focusedOpacity}/cart:${cartNavigationWorks}/purchase:${window.fixturePurchaseClicks}/plus:${playerPlaylistMenuWorksDuringPlayback}/label:${playerCart?.getAttribute("aria-label")}`;
    return;
  },
  async "page-unknown-track"(root) {
    const pageAudio = document.querySelector(".inline_player audio");
    document.querySelector(".inline_player .title").textContent = "Unknown Dynamic Track";
    Object.defineProperties(pageAudio, {
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      currentTime: { configurable: true, get: () => 11 },
      duration: { configurable: true, get: () => 180 }
    });
    pageAudio.dispatchEvent(new Event("play"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    const enables = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
    document.title = enables.length === 0
      ? "PASS: unknown artist-page track does not fall back fixture"
      : `FAIL: unknown artist-page track enabled ${enables.at(-1)?.queue?.[enables.at(-1)?.index || 0]?.title || "unknown"}`;
    return;
  },
  async "cart-ui"(root) {
    const savedTab = root?.querySelector('.hub-cart-view-tab[aria-selected="true"]');
    const savedCards = [...(root?.querySelectorAll(".hub-saved-cart-card") || [])];
    const autoSavedCard = savedCards.find((card) => card.textContent.includes("Auto-saved cart"));
    const namedCard = savedCards.find((card) => card.textContent.includes("Bandcamp Friday shortlist"));
    const openButton = namedCard?.querySelector(".hub-saved-cart-open-button");
    const cardActions = [...(namedCard?.querySelectorAll(".hub-saved-playlist-icon-button") || [])];
    const cardFooter = namedCard?.querySelector(".hub-saved-cart-actions");
    const cardSingleSurface = cardFooter
      && getComputedStyle(cardFooter).borderTopWidth === "0px"
      && getComputedStyle(cardFooter).backgroundColor === getComputedStyle(namedCard).backgroundColor;
    const cardActionsBare = cardActions.every((button) => getComputedStyle(button).backgroundColor === "rgba(0, 0, 0, 0)"
      && getComputedStyle(button).borderTopColor === "rgba(0, 0, 0, 0)");
    cardActions[0]?.focus();
    const focusedCardActionBacked = getComputedStyle(cardActions[0]).backgroundColor !== "rgba(0, 0, 0, 0)"
      && getComputedStyle(cardActions[0]).borderTopColor !== "rgba(0, 0, 0, 0)";
    const listMatchesPlaylists = namedCard?.classList.contains("hub-saved-playlist-card")
      && namedCard?.querySelector(".hub-saved-playlist-open")
      && namedCard?.querySelector(".hub-playlist-mosaic")
      && openButton?.textContent.trim() === "Open"
      && openButton?.querySelector(".hub-button-icon")?.style.getPropertyValue("--hub-icon").includes("icon-open.svg")
      && getComputedStyle(openButton).backgroundColor !== "rgba(0, 0, 0, 0)"
      && cardActions.length === 4
      && cardActions.some((button) => button.getAttribute("aria-label") === "Restore Bandcamp Friday shortlist")
      && cardActions.some((button) => button.getAttribute("aria-label") === "Rename Bandcamp Friday shortlist")
      && cardActions.some((button) => button.getAttribute("aria-label") === "Share Bandcamp Friday shortlist as HTML")
      && cardActions.some((button) => button.getAttribute("aria-label") === "Delete Bandcamp Friday shortlist")
      && cardActions.every((button) => !button.textContent.trim() && button.querySelector(".hub-button-icon"))
      && cardSingleSurface
      && cardActionsBare
      && focusedCardActionBacked;
    openButton?.click();
    const detailToolbar = root?.querySelector(".hub-saved-cart-detail-toolbar.hub-saved-playlist-detail-toolbar");
    const detailActions = [...(root?.querySelectorAll(".hub-saved-cart-detail-action-row .hub-saved-playlist-icon-button") || [])];
    const backButton = detailToolbar?.querySelector(".hub-saved-cart-back");
    const detailMatchesPlaylists = detailToolbar?.querySelector(".hub-saved-playlist-detail-title")?.textContent === "Bandcamp Friday shortlist"
      && backButton?.querySelector(".hub-button-icon")
      && detailToolbar?.querySelector(".hub-close")
      && !root?.querySelector(".hub-cart-view-tabs")
      && !root?.querySelector(".hub-saved-cart-detail-heading")
      && root?.querySelector(".hub-saved-cart-detail-action-row .hub-cart-backup-time")?.textContent.includes("3 items")
      && detailActions.length === 4
      && detailActions.every((button) => getComputedStyle(button).width === "30px" && getComputedStyle(button).height === "30px" && getComputedStyle(button).borderRadius === "5px")
      && getComputedStyle(root?.querySelector(".hub-saved-cart-detail-action-row .hub-saved-playlist-icon-actions")).gap === "6px"
      && root?.querySelectorAll(".hub-card .hub-cart-remove-button").length === 3;
    const originalPrompt = window.prompt;
    const originalConfirm = window.confirm;
    let editActionsWork = false;
    try {
      window.prompt = () => "Release weekend";
      detailActions.find((button) => button.getAttribute("aria-label") === "Rename Bandcamp Friday shortlist")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const renamed = root?.querySelector(".hub-saved-playlist-detail-title")?.textContent === "Release weekend";
      let removalPrompt = "";
      window.confirm = (message) => {
        removalPrompt = message;
        return true;
      };
      root?.querySelector(".hub-card .hub-cart-remove-button")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const removedOne = root?.querySelectorAll(".hub-card .hub-cart-remove-button").length === 2
        && root?.querySelector(".hub-saved-cart-detail-action-row .hub-cart-backup-time")?.textContent.includes("2 items")
        && removalPrompt.includes("Cloud Studies")
        && removalPrompt.includes("Release weekend");
      let deletePrompt = "";
      window.confirm = (message) => {
        deletePrompt = message;
        return false;
      };
      [...(root?.querySelectorAll(".hub-saved-cart-detail-action-row .hub-saved-playlist-icon-button") || [])]
        .find((button) => button.getAttribute("aria-label") === "Delete Release weekend")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const cancelledDelete = root?.querySelector(".hub-saved-playlist-detail-title")?.textContent === "Release weekend"
        && deletePrompt.includes("Release weekend");
      editActionsWork = renamed && removedOne && cancelledDelete;
    } finally {
      window.prompt = originalPrompt;
      window.confirm = originalConfirm;
    }
    root?.querySelector(".hub-saved-cart-back")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 }));
    document.title = savedTab?.textContent.includes("Saved")
      && autoSavedCard?.textContent.includes("Auto-saved")
      && listMatchesPlaylists
      && detailMatchesPlaylists
      && editActionsWork
      && root?.querySelector(".hub-saved-cart-card")
      && !root?.querySelector(".hub-saved-cart-detail-toolbar")
      ? "PASS: Bandkit cart fixture"
      : "FAIL: Bandkit cart fixture";
    return;
  },
  async "cross-tab-queue-sync"(root) {
    const incomingPlaylist = [
      ...window.fixtureStored.bandcampHubState.playlist,
      { id: "cross-tab-two", playlistItemId: "cross-tab-two", title: "Cross-tab Two", artist: "Fixture", pageUrl: "https://fixture.bandcamp.com/track/cross-tab-two", duration: 140, url: "https://t4.bcbits.com/stream/cross-tab-two" }
    ];
    window.fixtureStorageListener?.({ bandcampHubState: { newValue: { ...window.fixtureStored.bandcampHubState, playlist: incomingPlaylist } } }, "local");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const cards = [...(root?.querySelectorAll(".hub-playlist-track") || [])];
    document.title = cards.length === 2
      && cards[1]?.textContent.includes("Cross-tab Two")
      && root?.querySelector(".hub-now-playing-count")?.textContent === "2"
      ? "PASS: cross-tab Now Playing queue sync fixture"
      : `FAIL: cross-tab queue sync ${cards.length}/${root?.querySelector(".hub-now-playing-count")?.textContent || "missing"}`;
    return;
  },
  async "idle-player"(root) {
    const playerTrack = root?.querySelector(".hub-player-track");
    const playerArt = root?.querySelector(".hub-player-art");
    const emptyMessage = root?.querySelector(".hub-empty");
    document.title = !root?.querySelector(".hub-now-card")
      && playerTrack?.classList.contains("is-empty")
      && !playerArt?.getAttribute("src")
      && !root?.querySelector(".hub-player-title")?.textContent
      && emptyMessage?.textContent.includes("Play a Bandcamp track")
      ? "PASS: empty Bandkit player fixture"
      : "FAIL: empty Bandkit player fixture";
    return;
  },
  async "track-actions"(root) {
    window.fixtureRuntimeListener?.({
      type: "BANDCAMP_HUB_SEAMLESS_STATE",
      state: {
        enabled: true,
        status: "playing",
        isPlaying: true,
        currentTime: 12,
        duration: 180,
        index: 0,
        track: { title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track", url: "https://t4.bcbits.com/stream/fixture-track" },
        queue: [
          { title: "Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/fixture-track", url: "https://t4.bcbits.com/stream/fixture-track" },
          { title: "Next Fixture Track", artist: "Fixture Artist", pageUrl: "https://fixture-artist.bandcamp.com/track/next-fixture-track", url: "https://t4.bcbits.com/stream/next-fixture-track" }
        ]
      }
    }, {}, () => {});
    const queueActions = root?.querySelectorAll(".hub-queue-item .hub-queue-action");
    const footerMore = root?.querySelector(".hub-player-more-button");
    const footerDj = root?.querySelector(".hub-dj-player-button");
    const footerPlay = root?.querySelector(".hub-play-button");
    const footerPlayStyle = footerPlay ? getComputedStyle(footerPlay) : null;
    const footerPlayGlyph = footerPlay?.querySelector(".hub-play-glyph, .hub-pause-glyph");
    const footerPlayGlyphStyle = footerPlayGlyph ? getComputedStyle(footerPlayGlyph) : null;
    const parseRgb = (value) => (String(value).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value) => parseRgb(value).reduce((total, channel, index) => {
      const normalized = channel / 255;
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      return total + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const playContrast = footerPlayStyle
      ? (Math.max(luminance(footerPlayStyle.backgroundColor), luminance(footerPlayStyle.color)) + 0.05)
        / (Math.min(luminance(footerPlayStyle.backgroundColor), luminance(footerPlayStyle.color)) + 0.05)
      : 0;
    const nowPlayingHeading = root?.querySelector(".hub-now-playing-header");
    document.title = queueActions?.length >= 3
      && [...queueActions].every((button) => !button.disabled)
      && [...queueActions].every((button) => getComputedStyle(button).width === "30px" && getComputedStyle(button).height === "30px" && getComputedStyle(button).borderRadius === "5px" && button.querySelector(".hub-button-icon"))
      && [...(root?.querySelectorAll(".hub-queue-actions") || [])].every((actions) => getComputedStyle(actions).gap === "6px")
      && [footerMore, footerDj].every((button) => button && getComputedStyle(button).width === "32px" && getComputedStyle(button).height === "32px" && getComputedStyle(button).borderRadius === "5px")
      && footerPlayStyle?.borderRadius === "5px"
      && Boolean(footerPlayGlyphStyle && (
        footerPlayGlyph?.classList.contains("hub-play-glyph")
          ? footerPlayGlyphStyle.borderLeftColor === footerPlayStyle?.color
          : footerPlayGlyphStyle.backgroundImage.includes(footerPlayStyle?.color || "__missing__")
      ))
      && playContrast >= 4.5
      && nowPlayingHeading?.textContent.includes("Now Playing")
      && !footerMore?.disabled
      ? "PASS: resolved track actions fixture"
      : "FAIL: unresolved track actions fixture";
    return;
  },
  async "queue-footer-navigation"(root) {
    const next = root?.querySelector(".hub-next-button");
    const previous = root?.querySelector(".hub-previous-button");
    next?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const advanced = root?.querySelector(".hub-player-title")?.textContent === "Queue Two"
      && window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX" && message.index === 1);
    previous?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const returned = root?.querySelector(".hub-player-title")?.textContent === "Queue One"
      && window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX" && message.index === 0);
    document.title = advanced && returned
      ? "PASS: footer queue navigation fixture"
      : `FAIL: footer queue navigation ${root?.querySelector(".hub-player-title")?.textContent || "missing"}`;
    return;
  },
  async "queue-skip-unavailable"(root) {
    root?.querySelector(".hub-next-button")?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const playIndex = window.fixtureRuntimeMessages.findLast((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX");
    const resolvedMissing = window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_RESOLVE_PLAYLIST_ITEMS"
      && message.items?.some((item) => item.playlistItemId === "skip-missing"));
    document.title = root?.querySelector(".hub-player-title")?.textContent === "Skip Three"
      && playIndex?.index === 1
      && resolvedMissing
      ? "PASS: footer skips unavailable refreshed track fixture"
      : `FAIL: footer unavailable skip ${root?.querySelector(".hub-player-title")?.textContent || "missing"}/${playIndex?.index ?? "none"}`;
    return;
  },
  async "queue-single-card-controls"(root) {
    const card = root?.querySelector(".hub-playlist-track");
    const toggle = card?.querySelector(".hub-playlist-media-toggle");
    const initialActive = root?.querySelectorAll(".hub-playlist-track").length === 1
      && card?.classList.contains("is-actively-playing")
      && toggle?.getAttribute("aria-label") === "Pause Queue One";
    toggle?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 91 }));
    const dragSuspendedForControl = card?.draggable === false;
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 91 }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const dragRestoredAfterControl = card?.draggable === true;
    const buttonRect = toggle?.getBoundingClientRect();
    const documentHit = buttonRect ? document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2) : null;
    const stackingHeader = document.querySelector(".fixture-stacking-header");
    const stackingLayerWorked = stackingHeader?.hasAttribute("data-bandkit-extension-stacking")
      && stackingHeader.style.getPropertyPriority("z-index") === "important"
      && Number(getComputedStyle(stackingHeader).zIndex) > 100
      && !documentHit?.classList.contains("fixture-overlapping-sidebar");
    const commandsBeforePositionClick = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE").length;
    card?.querySelector(".hub-playlist-media-toggle")?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const positionHitAreaWorked = toggle?.getAttribute("aria-label") === "Resume Queue One"
      && window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE").length === commandsBeforePositionClick + 1;
    toggle?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    let transitionsWorked = true;
    for (let cycle = 0; cycle < 6; cycle += 1) {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const shouldPlay = cycle % 2 === 1;
      transitionsWorked &&= toggle?.getAttribute("aria-label") === `${shouldPlay ? "Pause" : "Resume"} Queue One`
        && card?.classList.contains("is-actively-playing") === shouldPlay;
    }
    const commands = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE").length;
    const didNotRestart = !window.fixtureRuntimeMessages.some((message) => ["BANDCAMP_HUB_SEAMLESS_PLAY_INDEX", "BANDCAMP_HUB_SEAMLESS_ENABLE"].includes(message.type));
    document.title = initialActive && dragSuspendedForControl && dragRestoredAfterControl && stackingLayerWorked && positionHitAreaWorked && transitionsWorked && commands === 8 && didNotRestart
      ? "PASS: single Now Playing card pause resume fixture"
      : `FAIL: single card initial:${initialActive}/drag:${dragSuspendedForControl}/${dragRestoredAfterControl}/stack:${stackingLayerWorked}/${documentHit?.className || documentHit?.tagName || "none"}/hit:${positionHitAreaWorked}/transitions:${transitionsWorked}/commands:${commands}/restart:${!didNotRestart}/${toggle?.getAttribute("aria-label") || "missing"}`;
    return;
  },
  async "queue-row-controls"(root) {
    const cards = [...(root?.querySelectorAll(".hub-playlist-track") || [])];
    const initialOrder = cards.map((card) => card.dataset.playlistItemId).join(",");
    const secondCard = cards[1];
    const playIndexBeforeCardClick = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX").length;
    secondCard?.click();
    const cardStayedReorderOnly = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_INDEX").length === playIndexBeforeCardClick;
    secondCard?.querySelector(".hub-playlist-media-toggle")?.click();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const updatedCards = [...(root?.querySelectorAll(".hub-playlist-track") || [])];
    const updatedSecond = updatedCards.find((card) => card.dataset.playlistItemId === "playlist-two");
    const loadingLabel = updatedSecond?.querySelector(".hub-playlist-media-toggle")?.getAttribute("aria-label");
    const loadingRemainsClickable = !updatedSecond?.querySelector(".hub-playlist-media-toggle")?.disabled;
    const broadcastTrack = location.search.includes("queue-row-controls-stale-identity")
      ? { ...window.fixtureQueueNavigationTracks[1], playlistItemId: "" }
      : window.fixtureQueueNavigationTracks[1];
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: { enabled: true, status: "playing", isPlaying: true, currentTime: 12, duration: 130, index: 1, track: broadcastTrack, queue: window.fixtureQueueNavigationTracks } }, {}, () => {});
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: { enabled: true, status: "playing", isPlaying: true, currentTime: 13, duration: 130, index: 1, track: broadcastTrack, queue: window.fixtureQueueNavigationTracks } }, {}, () => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stableSecond = [...(root?.querySelectorAll(".hub-playlist-track") || [])]
      .find((card) => card.dataset.playlistItemId === "playlist-two");
    const selectedStateSynced = updatedSecond?.classList.contains("is-playing")
      && updatedSecond?.classList.contains("is-actively-playing")
      && updatedSecond?.getAttribute("aria-current") === "true"
      && updatedSecond?.querySelector(".hub-playlist-media-toggle")?.getAttribute("aria-label") === "Pause Queue Two";
    const toggle = stableSecond?.querySelector(".hub-playlist-media-toggle");
    const mediaArt = toggle?.querySelector(".hub-playlist-media-art");
    const mediaIcon = toggle?.querySelector(".hub-playlist-media-icon");
    const mediaReplacementStructure = Boolean(mediaArt && mediaIcon)
      && getComputedStyle(toggle).width === "40px"
      && getComputedStyle(toggle).height === "40px"
      && getComputedStyle(mediaIcon).width === "40px"
      && getComputedStyle(mediaIcon).height === "40px";
    const passed = updatedCards.map((card) => card.dataset.playlistItemId).join(",") === "playlist-two,playlist-one"
      && cardStayedReorderOnly
      && ["Loading Queue Two", "Pause Queue Two"].includes(loadingLabel)
      && loadingRemainsClickable
      && selectedStateSynced
      && updatedSecond?.querySelectorAll(".hub-playlist-track-actions .hub-playlist-icon-button").length === 1
      && !updatedSecond?.querySelector(".hub-playlist-position, .hub-playlist-number")
      && getComputedStyle(updatedSecond).padding === "12px"
      && getComputedStyle(updatedSecond?.querySelector(".hub-playlist-media-toggle")).width === "40px"
      && getComputedStyle(updatedSecond?.querySelector(".hub-playlist-media-toggle")).height === "40px"
      && mediaReplacementStructure
      && window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE"
        && message.queue?.[0]?.title === "Queue Two");
    document.title = passed
      ? "PASS: queue row controls fixture"
      : `FAIL: queue row controls order:${updatedCards.map((card) => card.dataset.playlistItemId).join(",")}/reorder:${cardStayedReorderOnly}/loading:${loadingLabel}/${loadingRemainsClickable}/selected:${selectedStateSynced}/media:${mediaReplacementStructure}/${updatedSecond?.className || "missing"}/${updatedSecond?.querySelector(".hub-playlist-media-toggle")?.getAttribute("aria-label") || "no control"}`;
    return;
  },
  async "collection-now-playing-append"(root) {
    document.querySelector('.collection-item-container[data-trackid="collection-album"] .track_play_auxiliary')?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const initiallyPlaying = window.fixtureStored.bandcampHubState?.playlist?.length === 1
      && window.fixtureStored.bandcampHubState.playlist[0]?.title === "Honey Be"
      && root?.querySelector(".hub-now-playing-count")?.textContent === "1"
      && root?.querySelector(".hub-playlist-track")?.classList.contains("is-actively-playing");
    document.querySelector('.collection-item-container[data-trackid="second-track"] .bandcamp-hub-page-playlist')?.click();
    const addOption = [...document.querySelectorAll(".bandcamp-hub-page-playlist-menu button")]
      .find((button) => button.textContent.includes("Add to Now Playing"));
    addOption?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const cards = [...(root?.querySelectorAll(".hub-playlist-track") || [])];
    const queueUpdate = window.fixtureRuntimeMessages.findLast((message) => message.type === "BANDCAMP_HUB_SEAMLESS_UPDATE_QUEUE");
    const appendedWithoutReplacing = window.fixtureStored.bandcampHubState?.playlist?.map((item) => item.title).join(",") === "Honey Be,Second Track"
      && cards.length === 2
      && cards[0]?.classList.contains("is-actively-playing")
      && !cards[1]?.classList.contains("is-playing")
      && queueUpdate?.queue?.map((item) => item.title).join(",") === "Honey Be"
      && root?.querySelector(".hub-now-playing-count")?.textContent === "2"
      && root?.querySelector(".hub-player-title")?.textContent === "Honey Be"
      && !window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_SEAMLESS_PLAY_PAUSE");
    document.title = initiallyPlaying && appendedWithoutReplacing
      ? "PASS: collection play persists and add appends fixture"
      : `FAIL: collection queue init:${initiallyPlaying}/append:${appendedWithoutReplacing}/update:${queueUpdate?.queue?.map((item) => item.title).join(",") || "none"}/${window.fixtureStored.bandcampHubState?.playlist?.map((item) => item.title).join(",") || "empty"}/${cards.map((card) => card.className).join("|")}`;
    return;
  },
  async "collection-rapid-switch"(root) {
    const firstControl = document.querySelector('.collection-item-container[data-trackid="collection-album"] .track_play_auxiliary');
    const secondControl = document.querySelector('.collection-item-container[data-trackid="second-track"] .track_play_auxiliary');
    firstControl?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    secondControl?.click();
    await new Promise((resolve) => setTimeout(resolve, 320));
    const enableMessages = window.fixtureRuntimeMessages.filter((message) => message.type === "BANDCAMP_HUB_SEAMLESS_ENABLE");
    const activeTrack = enableMessages.at(-1)?.queue?.[enableMessages.at(-1)?.index];
    const queueTitles = window.fixtureStored.bandcampHubState?.playlist?.map((item) => item.title).join(",") || "";
    document.title = enableMessages.length === 1
      && activeTrack?.title === "Second Track"
      && queueTitles === "Second Track"
      && window.fixtureStored.bandcampHubState?.playlistMode === "browse"
      ? "PASS: rapid collection switch keeps latest request fixture"
      : `FAIL: rapid collection switch ${enableMessages.length}/${activeTrack?.title || "none"}/${queueTitles || "empty"}`;
    return;
  },
  async "last-item-clear"(root) {
    const remove = root?.querySelector(".hub-playlist-track .hub-playlist-icon-button:not(.is-play-action)");
    remove?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: { enabled: true, status: "playing", isPlaying: true, currentTime: 18, duration: 120, index: 0, track: window.fixtureLastItem, queue: [window.fixtureLastItem] } }, {}, () => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    const cleared = (window.fixtureStored.bandcampHubState?.playlist || []).length === 0
      && window.fixtureRuntimeMessages.some((message) => message.type === "BANDCAMP_HUB_CLEAR_PLAYBACK")
      && root?.querySelector(".hub-player-track")?.classList.contains("is-empty")
      && !root?.querySelector(".hub-player-title")?.textContent
      && root?.querySelector(".hub-now-playing-count")?.textContent === "0"
      && root?.querySelector(".hub-play-button")?.disabled;
    if (location.search.includes("last-item-clear-replay")) {
      const replay = document.createElement("button");
      replay.className = "track_play_auxiliary";
      document.body.append(replay);
      replay.click();
      window.fixtureRuntimeListener?.({ type: "BANDCAMP_HUB_SEAMLESS_STATE", state: { enabled: true, status: "playing", isPlaying: true, currentTime: 0, duration: 120, index: 0, track: window.fixtureLastItem, queue: [window.fixtureLastItem] } }, {}, () => {});
      await new Promise((resolve) => setTimeout(resolve, 20));
      const restored = root?.querySelector(".hub-player-title")?.textContent === "Last Queue Item"
        && !root?.querySelector(".hub-player-track")?.classList.contains("is-empty")
        && !root?.querySelector(".hub-play-button")?.disabled;
      document.title = cleared && restored
        ? "PASS: cleared track can be replayed fixture"
        : `FAIL: cleared track replay ${root?.querySelector(".hub-player-title")?.textContent || "missing"}`;
      return;
    }
    document.title = cleared
      ? "PASS: last Now Playing item clears player fixture"
      : `FAIL: last item clear ${root?.querySelector(".hub-player-title")?.textContent || "stale player"}`;
    return;
  },
  async "page-dj-persist"(root) {
    const pageDjButton = document.querySelector(".bandcamp-hub-page-dj");
    const pageDjHost = document.querySelector(".inline_player > .bandcamp-hub-page-dj-host");
    document.title = pageDjButton?.classList.contains("is-active")
      && pageDjButton?.getAttribute("aria-expanded") === "true"
      && pageDjButton?.getAttribute("aria-label") === "Hide DJ tools on this page"
      && !pageDjHost?.hidden
      && Boolean(pageDjHost?.shadowRoot?.querySelector(".hub-dj-card"))
      ? "PASS: persisted page DJ fixture"
      : "FAIL: persisted page DJ fixture";
    return;
  }
});
