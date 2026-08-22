import { runtimeState } from "./context.js";
import { colorString, luminance, mixColor, readableColor } from "../color.js";

function registerAppearance1(r) {
r.$ensureBandcampThemeStyle = function ensureBandcampThemeStyle() {
      if (document.querySelector("#bandkit-bandcamp-theme")) return;
      const pageThemeStyle = document.createElement("style");
      pageThemeStyle.id = "bandkit-bandcamp-theme";
      pageThemeStyle.textContent = `
        html[data-bandkit-page-theme="true"] { background: var(--bandkit-page-background) !important; color-scheme: var(--bandkit-page-scheme); }
        html[data-bandkit-page-theme="true"] body { background: var(--bandkit-page-background) !important; background-image: none !important; color: var(--bandkit-page-background-text) !important; }
        html[data-bandkit-page-theme="true"] :is(#centerWrapper, #propOpenWrapper, #DiscoverApp, #DiscoverApp .discover-app, #PlaylistPage, .full-page-app-wrapper) { background-color: var(--bandkit-page-background) !important; background-image: none !important; color: var(--bandkit-page-background-text) !important; }
        html[data-bandkit-page-theme="true"] :is(main, #pgBd, #pgBdWrapper, #main, #fan-container, #collection-items, .page-bg, .collection-main, .feed-main, .discover-results, .discover-detail, #DiscoverApp main.app, #PlaylistPage .playlist-page, #music-grid, #merch-grid, #community) { background-color: var(--bandkit-page-surface) !important; background-image: none !important; color: var(--bandkit-page-text) !important; }
        html[data-bandkit-page-theme="true"] #DiscoverApp :is(.results-grid-item .content, .focused-result) { background-color: var(--bandkit-page-surface) !important; background-image: none !important; }
        html[data-bandkit-page-theme="true"] :is(.collection-item-container, .story-innards, .discover-player, section.floating-player, .popupmenu, .menu, #rightColumn > #bio-container, #rightColumn > #showography, #rightColumn > #discography, #rightColumn > .sidebar, #rightColumn > .widget, .artists-grid > .artists-grid-item, #music-grid > .music-grid-item, #merch-grid > .merch-grid-item, .video-list > .video-caption, .community-feed .story, .community-band-info .story, body.feed #sidebar, .inline_player, .bandkit-modern-purchase-panel, #recommendations_container .recommended-album) {
          background-color: var(--bandkit-page-card) !important;
          background-image: none !important;
          --bandkit-page-text: var(--bandkit-page-card-text);
          --bandkit-page-muted: var(--bandkit-page-card-muted);
          --bandkit-page-accent: var(--bandkit-page-card-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-card-accent-soft);
          --bandkit-page-border: var(--bandkit-page-card-border);
          --bandkit-page-on-accent: var(--bandkit-page-card-on-accent);
        }
        html[data-bandkit-page-theme="true"] :is(h1, h2, h3, h4, h5, h6, p, li, td, th, label, strong, .primaryText, .track-title, .title, .title-text, .item-title, .albumTitle, .trackTitle, :where(#name-section .title)):not(.ui-dialog):not(.ui-dialog *) { color: var(--bandkit-page-text) !important; }
        html[data-bandkit-page-theme="true"] :is(.secondaryText, .track-number, .time, .artist, .artist-name, .subhead, .itemsubtext, .genre, .location, .tralbumData, .credits):not(.ui-dialog):not(.ui-dialog *) { color: var(--bandkit-page-muted) !important; }
        html[data-bandkit-page-theme="true"] :is(a, a.primaryText, .buy-link, .download-link, button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-overflow):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button)):not(.ui-dialog):not(.ui-dialog *) { color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] #track_table a:not(.ui-dialog):not(.ui-dialog *) { color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, header[role="banner"]) :is(.bandcamp-logo-link, .logo > a, a[aria-label="Bandcamp"], a[aria-label="Bandcamp home"]) { color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] :is(input, select, textarea, .track_row_view, .collection-item-container, .item, .popupmenu, .menu):not(.ui-dialog):not(.ui-dialog *) { border-color: var(--bandkit-page-border) !important; }
        html[data-bandkit-page-theme="true"] :is(input, select, textarea, .popupmenu, .menu):not(.ui-dialog):not(.ui-dialog *) { background-color: var(--bandkit-page-card) !important; color: var(--bandkit-page-text) !important; }
        html[data-bandkit-page-theme="true"] button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-overflow):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button):not(.no-outline):not(.icon-only):not(.play-target):not(.over-image):not(.wishlist-button):not(.ui-dialog *) { background-color: var(--bandkit-page-card) !important; border-color: var(--bandkit-page-border) !important; }
        html[data-bandkit-page-theme="true"] :is(button.selected, button.is-selected, button.active, button[aria-pressed="true"]):not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-overflow):not(.ui-dialog *) { background-color: var(--bandkit-page-accent) !important; color: var(--bandkit-page-on-accent) !important; }
        html[data-bandkit-page-theme="true"] .ui-dialog.nu-dialog { color-scheme: light; }
        html[data-bandkit-page-theme="true"] :is(.band-navbar-wrapper, #band-navbar) { background-color: var(--bandkit-page-navbar) !important; }
        html[data-bandkit-page-theme="true"] #band-navbar a { color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, header[role="banner"]) { background-color: var(--bandkit-page-navbar) !important; color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] .follow-unfollow,
        html[data-bandkit-page-theme="true"] .follow-unfollow *,
        html[data-bandkit-page-theme="true"] .follow-band,
        html[data-bandkit-page-theme="true"] .follow-band * { background-color: var(--bandkit-page-accent) !important; background-image: none !important; border-color: var(--bandkit-page-accent) !important; box-shadow: none !important; color: var(--bandkit-page-on-accent) !important; }
        html[data-bandkit-page-theme="true"] .follow-unfollow { border: 0 !important; }
        html[data-bandkit-page-theme="true"] :is(.tag, .tags a, .collection-item-tags a) { background-color: var(--bandkit-page-accent-soft) !important; border-color: transparent !important; color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-add-to, .bandcamp-hub-page-playlist.is-feed-sidebar-action, .bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-feed-purchase-action, .bandkit-feed-hear-more-action, .bandkit-feed-wishlist-control, .bandkit-feed-wishlist-action .wishlist-msg, .bandkit-feed-wishlist-action .wishlisted-msg > span:first-child),
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-collection-download-action) { border-color: var(--bandkit-page-border) !important; color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-sidebar-action, .bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-feed-purchase-action, .bandkit-feed-hear-more-action, .bandkit-feed-wishlist-control, .bandkit-feed-wishlist-action .wishlist-msg, .bandkit-feed-wishlist-action .wishlisted-msg > span:first-child):is(:hover, :focus-visible),
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-collection-download-action):is(:hover, :focus-visible) { background: var(--bandkit-page-accent-soft) !important; border-color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] :is(hr, .track_row_view, .collection-item-container, section.floating-player) { border-color: var(--bandkit-page-border) !important; }
        html[data-bandkit-page-theme="true"] .track_row_view { background-color: transparent !important; background-image: none !important; }
        html[data-bandkit-page-theme="true"] :is(.page-banners, .banner-manager) .text-banner {
          --bandkit-page-text: var(--bandkit-page-surface-text);
          --bandkit-page-muted: var(--bandkit-page-surface-muted);
          --bandkit-page-accent: var(--bandkit-page-surface-accent);
          --bandkit-page-border: var(--bandkit-page-surface-border);
          background: var(--bandkit-page-surface) !important;
          border-color: var(--bandkit-page-border) !important;
          color: var(--bandkit-page-text) !important;
        }
        html[data-bandkit-page-theme="true"] :is(.page-banners, .banner-manager) .text-banner :is(p, span) { color: inherit !important; }
        html[data-bandkit-page-theme="true"] :is(.page-banners, .banner-manager) .text-banner .review-button {
          background: transparent !important;
          border: 0 !important;
          color: var(--bandkit-page-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner {
          --gray700: var(--bandkit-page-surface-text);
          --page-text-color: var(--bandkit-page-surface-text);
          --page-text-color-secondary: var(--bandkit-page-surface-muted);
          --border-color: var(--bandkit-page-surface-border);
          background: var(--bandkit-page-surface) !important;
          color: var(--bandkit-page-surface-text) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.genre-filter, .subgenre-filter, .format-filter, .more-filters-row, .tags-background, .horizontal-scroll-row) {
          background: transparent !important;
          background-image: none !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) {
          --gray700: var(--bandkit-page-card-text);
          --g-button-background-color: var(--bandkit-page-card);
          --g-button-text-color: var(--bandkit-page-card-text);
          --g-button-border-color: var(--bandkit-page-card-border);
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-card-border) !important;
          color: var(--bandkit-page-card-text) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.chip-button.selected-tag, .radio-item.active, .radio-item.selected, .radio-item[aria-checked="true"], [role="option"][aria-selected="true"]) {
          --gray700: var(--bandkit-page-on-accent);
          --g-button-background-color: var(--bandkit-page-accent);
          --g-button-text-color: var(--bandkit-page-on-accent);
          --g-button-border-color: var(--bandkit-page-accent);
          background: var(--bandkit-page-accent) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) :is(span, svg) { color: inherit !important; }
        html[data-bandkit-page-theme="true"] #DiscoverApp :is(.tag-search-wrapper, .filters-banner) input::placeholder {
          color: var(--bandkit-page-card-muted) !important;
          opacity: 1 !important;
        }
        html[data-bandkit-page-theme="true"] #PlaylistPage {
          --gray700: var(--bandkit-page-surface-text);
          --page-text-color: var(--bandkit-page-surface-text);
          --page-text-color-secondary: var(--bandkit-page-surface-muted);
          --page-background-color: var(--bandkit-page-surface);
          --border-color: var(--bandkit-page-surface-border);
          --border-color-subtle: var(--bandkit-page-surface-border);
          --elevated-background: transparent;
          --elevated-border: 1px solid var(--bandkit-page-surface-border);
        }
        html[data-bandkit-page-theme="true"] #PlaylistPage .tracklist-pane { background: var(--bandkit-page-surface) !important; }
        html[data-bandkit-page-theme="true"] #PlaylistPage :is(.play-pause-button.play-target, .play-pause-button.over-image, .wishlist-button, .wishlist-button.action) {
          background: transparent !important;
          background-image: none !important;
          border-color: transparent !important;
          box-shadow: none !important;
        }
        html[data-bandkit-page-theme="true"] #PlaylistPage .wishlist-button { --gray700: var(--bandkit-page-accent); color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] #PlaylistPage .track-meta .art > img {
          background: transparent !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp { background-color: var(--bandkit-page-background) !important; color: var(--bandkit-page-background-text) !important; }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section {
          --bandkit-page-text: var(--bandkit-page-background-text);
          --bandkit-page-muted: var(--bandkit-page-background-muted);
          --bandkit-page-accent: var(--bandkit-page-background-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-background-accent-soft);
          --bandkit-page-border: var(--bandkit-page-background-border);
          --bandkit-page-on-accent: var(--bandkit-page-background-on-accent);
          background-color: var(--bandkit-page-background) !important;
          color: var(--bandkit-page-text) !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section.inverted {
          --bandkit-page-text: var(--bandkit-page-surface-text);
          --bandkit-page-muted: var(--bandkit-page-surface-muted);
          --bandkit-page-accent: var(--bandkit-page-surface-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-surface-accent-soft);
          --bandkit-page-border: var(--bandkit-page-surface-border);
          --bandkit-page-on-accent: var(--bandkit-page-surface-on-accent);
          background-color: var(--bandkit-page-surface) !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section :is(.attribution, .attribution-meta, .byline, .date, .meta) { color: var(--bandkit-page-muted) !important; }
        html[data-bandkit-page-theme="true"] #HomepageApp :is(.play-pause-button, .play-button, .artwork-play-button).over-image {
          background-color: transparent !important;
          background-image: none !important;
          border-color: transparent !important;
        }
        html[data-bandkit-page-theme="true"] ::selection { background: var(--bandkit-page-accent); color: var(--bandkit-page-on-accent); }
      `;
      document.head.append(pageThemeStyle);
    };
}

function registerAppearance2(r) {
r.$applyBandcampPageTheme = function applyBandcampPageTheme() {
      r.$ensureBandcampThemeStyle();
      const enabled = Boolean(runtimeState.appearance.applyToPage);
      document.documentElement.dataset.bandkitPageTheme = String(enabled);
      if (!enabled) {
        for (const name of ["--bandkit-page-background", "--bandkit-page-surface", "--bandkit-page-card", "--bandkit-page-navbar", "--bandkit-page-navbar-text", "--bandkit-page-text", "--bandkit-page-background-text", "--bandkit-page-background-muted", "--bandkit-page-background-accent", "--bandkit-page-background-accent-soft", "--bandkit-page-background-border", "--bandkit-page-background-on-accent", "--bandkit-page-surface-text", "--bandkit-page-surface-muted", "--bandkit-page-surface-accent", "--bandkit-page-surface-accent-soft", "--bandkit-page-surface-border", "--bandkit-page-surface-on-accent", "--bandkit-page-muted", "--bandkit-page-accent", "--bandkit-page-accent-soft", "--bandkit-page-border", "--bandkit-page-on-accent", "--bandkit-page-card-text", "--bandkit-page-card-muted", "--bandkit-page-card-accent", "--bandkit-page-card-accent-soft", "--bandkit-page-card-border", "--bandkit-page-card-on-accent", "--bandkit-page-scheme"]) {
          document.documentElement.style.removeProperty(name);
        }
        return;
      }
      const theme = r.$accessibleAppearanceTheme();
      const dark = luminance(theme.background) < 0.34;
      const variables = {
        "--bandkit-page-background": colorString(theme.background),
        "--bandkit-page-surface": colorString(theme.pageSurface),
        "--bandkit-page-card": colorString(theme.pageSurface),
        "--bandkit-page-navbar": colorString(theme.navbar),
        "--bandkit-page-navbar-text": colorString(theme.navbarText),
        "--bandkit-page-text": colorString(theme.text),
        "--bandkit-page-background-text": colorString(theme.backgroundText),
        "--bandkit-page-background-muted": colorString(theme.backgroundMuted),
        "--bandkit-page-background-accent": colorString(theme.backgroundAccent),
        "--bandkit-page-background-accent-soft": colorString(theme.backgroundAccent, luminance(theme.background) < 0.34 ? 0.16 : 0.1),
        "--bandkit-page-background-border": colorString(theme.backgroundBorder),
        "--bandkit-page-background-on-accent": colorString(theme.backgroundOnAccent),
        "--bandkit-page-surface-text": colorString(theme.text),
        "--bandkit-page-surface-muted": colorString(theme.muted),
        "--bandkit-page-surface-accent": colorString(theme.accent),
        "--bandkit-page-surface-accent-soft": colorString(theme.accent, luminance(theme.pageSurface) < 0.34 ? 0.16 : 0.1),
        "--bandkit-page-surface-border": colorString(theme.border),
        "--bandkit-page-surface-on-accent": colorString(theme.onAccent),
        "--bandkit-page-muted": colorString(theme.muted),
        "--bandkit-page-accent": colorString(theme.accent),
        "--bandkit-page-accent-soft": colorString(theme.accent, dark ? 0.16 : 0.1),
        "--bandkit-page-border": colorString(theme.border),
        "--bandkit-page-on-accent": colorString(theme.onAccent),
        "--bandkit-page-card-text": colorString(theme.text),
        "--bandkit-page-card-muted": colorString(theme.muted),
        "--bandkit-page-card-accent": colorString(theme.accent),
        "--bandkit-page-card-accent-soft": colorString(theme.accent, luminance(theme.pageSurface) < 0.34 ? 0.16 : 0.1),
        "--bandkit-page-card-border": colorString(theme.border),
        "--bandkit-page-card-on-accent": colorString(theme.onAccent),
        "--bandkit-page-scheme": dark ? "dark" : "light"
      };
      for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
    };
r.$applyShadowHeaderTheme = function applyShadowHeaderTheme() {
      const menuBar = document.querySelector("menu-bar");
      if (!menuBar?.shadowRoot) return;
      const propertyNames = [
        "--default-background-color", "--page-background-color", "--menubar-background-color",
        "--elevated-background-color-1", "--elevated-background-color-2", "--elevated-background-color-3", "--elevated-background-color-4",
        "--default-foreground-color", "--page-text-color", "--page-text-color-secondary", "--bc-link-color",
        "--menubar-search-input-background-color", "--border-color", "--border-color-strong", "--border-color-subtle",
        "--bandcamp-blue", "--artist-blue", "--blue400", "--disabled-text-color", "color-scheme"
      ];
      if (!runtimeState.appearance.applyToPage) {
        for (const name of propertyNames) menuBar.style.removeProperty(name);
        return;
      }
      const theme = r.$accessibleAppearanceTheme();
      const dark = luminance(theme.navbar) < 0.34;
      const navbarAccent = readableColor(theme.accent, [theme.navbar], 4.5).color;
      const navbarMuted = readableColor(theme.muted, [theme.navbar], 4.5).color;
      const navbarBorder = readableColor(
        mixColor(theme.navbar, theme.navbarText, dark ? 0.24 : 0.16),
        [theme.navbar],
        3
      ).color;
      const searchBackground = mixColor(theme.navbar, theme.navbarText, dark ? 0.16 : 0.08);
      const variables = {
        "--default-background-color": colorString(theme.navbar),
        "--page-background-color": colorString(theme.navbar),
        "--menubar-background-color": colorString(theme.navbar),
        "--elevated-background-color-1": colorString(theme.navbar),
        "--elevated-background-color-2": colorString(theme.navbar),
        "--elevated-background-color-3": colorString(theme.navbar),
        "--elevated-background-color-4": colorString(theme.navbar),
        "--default-foreground-color": colorString(theme.navbarText),
        "--page-text-color": colorString(theme.navbarText),
        "--page-text-color-secondary": colorString(navbarMuted),
        "--bc-link-color": colorString(theme.navbarText),
        "--menubar-search-input-background-color": colorString(searchBackground),
        "--border-color": colorString(navbarBorder),
        "--border-color-strong": colorString(theme.navbarText),
        "--border-color-subtle": colorString(navbarBorder, 0.55),
        "--bandcamp-blue": colorString(theme.navbarText),
        "--artist-blue": colorString(navbarAccent),
        "--blue400": colorString(navbarAccent),
        "--disabled-text-color": colorString(navbarMuted),
        "color-scheme": dark ? "dark" : "light"
      };
      for (const [name, value] of Object.entries(variables)) menuBar.style.setProperty(name, value, "important");
    };
r.$isClassicReleasePage = function isClassicReleasePage() {
      return Boolean(
        document.body?.classList.contains("tralbum-page")
        && document.querySelector("#trackInfo")
        && document.querySelector("#tralbumArt")
        && document.querySelector(".trackView")
      );
    };
r.$modernBandcampPageType = function modernBandcampPageType() {
      const pathname = location.pathname.replace(/\/+$/, "") || "/";
      const isBandcampHome = location.hostname === "bandcamp.com" && pathname === "/";
      const isDiscover = Boolean(document.querySelector("#DiscoverApp")) || /^\/discover(?:\/|$)/.test(pathname);
      const isFanCollection = Boolean(document.querySelector("#fan-container, #collection-grid"))
        && !document.body?.classList.contains("feed")
        && !/\/feed$/.test(pathname);
      if (isBandcampHome || isDiscover || isFanCollection) return "";
      if (r.$isClassicReleasePage()) return "release";
      if (document.body?.classList.contains("feed") || /\/feed$/.test(pathname)) return "feed";
      if (document.querySelector(".video-list") || pathname === "/video") return "video";
      if (document.querySelector("#community")) return "community";
      if (document.querySelector("#music-grid, .artists-grid") || pathname === "/artists") return "music";
      if (document.querySelector("#merch-grid, .merch-grid")) return "merch";
      return "";
    };
r.$moveModernReleaseNode = function moveModernReleaseNode(node, destination) {
      if (!node || !destination) return;
      const marker = document.createComment("bandkit-modern-release-position");
      node.before(marker);
      destination.append(node);
      r.$modernReleaseMoveRecords.push({ node, marker });
    };
r.$createModernReleaseShell = function createModernReleaseShell(tagName, className, heading = "") {
      const shell = document.createElement(tagName);
      shell.className = className;
      if (heading) {
        const title = document.createElement("h2");
        title.className = "bandkit-modern-section-title";
        title.textContent = heading;
        shell.append(title);
      }
      r.$modernReleaseShells.push(shell);
      return shell;
    };
r.$pageActionThemeValues = function pageActionThemeValues() {
      if (r.$pageActionThemeCache) return r.$pageActionThemeCache;
      const styles = getComputedStyle(r.$host);
      r.$pageActionThemeCache = Object.fromEntries([
        "--hub-card", "--hub-ink", "--hub-muted", "--hub-faint", "--hub-accent", "--hub-accent-soft", "--hub-line", "--hub-on-accent", "--hub-font-family"
      ].map((name) => [name, styles.getPropertyValue(name)]));
      return r.$pageActionThemeCache;
    };
r.$applyPageActionTheme = function applyPageActionTheme(control) {
      if (!control) return;
      for (const [name, value] of Object.entries(r.$pageActionThemeValues())) {
        if (value) control.style.setProperty(name, value);
      }
    };
r.$setPageActionLabel = function setPageActionLabel(control, label) {
      if (!control) return;
      let visibleLabel = control.querySelector(":scope > .bandkit-page-action-label");
      if (!label) {
        delete control.dataset.bandkitLabel;
        visibleLabel?.remove();
        return;
      }
      control.dataset.bandkitLabel = label;
      if (!visibleLabel) {
        visibleLabel = document.createElement("span");
        visibleLabel.className = "bandkit-page-action-label";
        visibleLabel.setAttribute("aria-hidden", "true");
        control.append(visibleLabel);
      }
      visibleLabel.dataset.bandkitLabelText = label;
    };
r.$pageActionControlText = function pageActionControlText(control) {
      if (!(control instanceof Element)) return "";
      const copy = control.cloneNode(true);
      copy.querySelectorAll(".bandkit-page-action-label").forEach((label) => label.remove());
      return String(copy.textContent || "").replace(/\s+/g, " ").trim();
    };
r.$syncPageActionLabelMode = function syncPageActionLabelMode() {
      document.documentElement.dataset.bandkitPageActionLabels = String(Boolean(runtimeState.pageActionLabels));
    };
r.$syncTrackKeyVisibilityMode = function syncTrackKeyVisibilityMode() {
      document.documentElement.dataset.bandkitShowTrackKeys = String(runtimeState.showTrackKeys !== false);
    };
}

function registerAppearance3(r) {
r.$markModernTrackAvailability = function markModernTrackAvailability(trackTable) {
      if (!trackTable) return;
      const trackInfo = r.$getBandcampPageData()?.tralbum?.trackinfo || [];
      const rows = [...trackTable.querySelectorAll(".track_row_view")];
      for (const [index, row] of rows.entries()) {
        const playCell = row.querySelector(".play-col");
        const control = row.querySelector(".play-col > a");
        r.$applyPageActionTheme(control);
        const relation = row.getAttribute("rel") || "";
        const trackNumber = Number(relation.match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
        const displayedTrackNumber = Number.parseInt(row.querySelector(".track_number")?.textContent || "", 10);
        if (playCell) playCell.dataset.bandkitTrackNumber = String(trackNumber || displayedTrackNumber || index + 1);
        const track = trackInfo[trackNumber > 0 ? trackNumber - 1 : index];
        const hasTrackAvailability = Boolean(track && Object.prototype.hasOwnProperty.call(track, "file"));
        const hasPlayableFile = Boolean(track?.file && Object.values(track.file).some((value) => typeof value === "string" && value.trim()));
        const nativeStyle = control ? getComputedStyle(control) : null;
        const nativelyUnavailable = !control
          || control.hidden
          || control.getAttribute("aria-disabled") === "true"
          || nativeStyle?.display === "none"
          || nativeStyle?.visibility === "hidden";
        row.classList.toggle("bandkit-modern-track-unplayable", hasTrackAvailability ? !hasPlayableFile : nativelyUnavailable);
      }
      r.$modernReleaseCleanups.push(() => rows.forEach((row) => {
        row.classList.remove("bandkit-modern-track-unplayable");
        delete row.querySelector(".play-col")?.dataset.bandkitTrackNumber;
      }));
    };
}

export const registerAppearance = [registerAppearance1, registerAppearance2, registerAppearance3];

export const setupAppearance = [];
