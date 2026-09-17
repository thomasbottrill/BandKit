import { runtimeState } from "./context.js";
import { colorString, luminance, mixColor, readableColor } from "../color.js";
import { SHADOW_HEADER_THEME_CSS } from "./appearance-header-theme.js";

/* eslint-disable max-lines-per-function -- the page-theme stylesheet stays together so its cascade order is auditable. */
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
        html[data-bandkit-page-theme="true"] :is(.collection-item-container, .story-innards, .discover-player, section.floating-player, .popupmenu, .menu, #rightColumn > #bio-container, #rightColumn > #showography, #rightColumn > #discography, #rightColumn > .sidebar, #rightColumn > .widget, .artists-grid > .artists-grid-item, #music-grid > .music-grid-item, #merch-grid > .merch-grid-item, .video-list > .video-caption, .community-feed .story, .community-band-info .story, body.feed #sidebar, #recommendations_container .recommended-album) {
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
        html[data-bandkit-page-theme="true"] :is(a, a.primaryText, .buy-link, .download-link, button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-overflow):not(.bandcamp-hub-page-buy):not(.bandcamp-hub-page-playlist-menu button)):not(.save-button):not(.skip-link):not(.ui-dialog):not(.ui-dialog *):not(.bandkit-modern-release-actions *) { color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] #track_table a:not(.ui-dialog):not(.ui-dialog *) { color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, .menu-bar, header[role="banner"]) :is(.bandcamp-logo-link, .logo > a, a[aria-label="Bandcamp"], a[aria-label="Bandcamp home"]) { color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] :is(input, select, textarea, .track_row_view, .collection-item-container, .item, .popupmenu, .menu):not(.ui-dialog):not(.ui-dialog *) { border-color: var(--bandkit-page-border) !important; }
        html[data-bandkit-page-theme="true"] :is(input, select, textarea, .popupmenu, .menu):not(.ui-dialog):not(.ui-dialog *) { background-color: var(--bandkit-page-card) !important; color: var(--bandkit-page-text) !important; }
        html[data-bandkit-page-theme="true"] button:not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-cart):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-overflow):not(.bandcamp-hub-page-buy):not(.bandkit-page-skip-control):not(.bandcamp-hub-page-playlist-menu button):not(.no-outline):not(.icon-only):not(.play-target):not(.over-image):not(.wishlist-button):not(.ui-dialog *):not(.bandkit-modern-release-actions *) { background-color: var(--bandkit-page-card) !important; border-color: var(--bandkit-page-border) !important; }
        html[data-bandkit-page-theme="true"] :is(button.selected, button.is-selected, button.active, button[aria-pressed="true"]):not(.bandcamp-hub-page-playlist):not(.bandcamp-hub-page-dj):not(.bandcamp-hub-page-overflow):not(.ui-dialog *) { background-color: var(--bandkit-page-accent) !important; color: var(--bandkit-page-on-accent) !important; }
        html[data-bandkit-page-theme="true"] .ui-dialog.nu-dialog { color-scheme: light; }
        html[data-bandkit-page-theme="true"] .ui-dialog.nu-dialog :is(.checkout-button-wrapper, .cart-button-wrapper) > button {
          background: var(--bandkit-page-accent) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout > .content {
          --bandkit-page-text: var(--bandkit-page-surface-text);
          --bandkit-page-muted: var(--bandkit-page-surface-muted);
          --bandkit-page-accent: var(--bandkit-page-surface-accent);
          --bandkit-page-border: var(--bandkit-page-surface-border);
          background: var(--bandkit-page-surface) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-surface-border) !important;
          color: var(--bandkit-page-surface-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout > .content :is(.header, .body, .checkout-order-vm, .group, .order-recap, .card-payment-group, .footer-button) {
          background: transparent !important;
          background-image: none !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout > .content .body {
          border-color: var(--bandkit-page-surface-border) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout .spinny-overlay {
          background: var(--bandkit-page-surface) !important;
          background-image: none !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout .order-entry-panel {
          --bandkit-page-text: var(--bandkit-page-card-text);
          --bandkit-page-muted: var(--bandkit-page-card-muted);
          --bandkit-page-accent: var(--bandkit-page-card-accent);
          --bandkit-page-border: var(--bandkit-page-card-border);
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-card-border) !important;
          color: var(--bandkit-page-card-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout .order-entry-panel :is(.title, .pricing, .item-total, .value) {
          color: var(--bandkit-page-card-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-page="true"] #checkout .order-entry-panel :is(.detail, .label) {
          color: var(--bandkit-page-card-muted) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-error="true"] #pgBd :is(div, section) {
          --bandkit-page-text: var(--bandkit-page-surface-text);
          --bandkit-page-muted: var(--bandkit-page-surface-muted);
          --bandkit-page-accent: var(--bandkit-page-surface-accent);
          --bandkit-page-border: var(--bandkit-page-surface-border);
          background-color: transparent !important;
          background-image: none !important;
          border-color: var(--bandkit-page-surface-border) !important;
          color: var(--bandkit-page-surface-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-error="true"] #pgBd :is(h1, h2, h3, p, span, li, strong) {
          color: var(--bandkit-page-surface-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-checkout-error="true"] #pgBd a {
          color: var(--bandkit-page-surface-accent) !important;
        }
        html[data-bandkit-page-theme="true"] :is(.band-navbar-wrapper, #band-navbar) { background-color: var(--bandkit-page-navbar) !important; }
        html[data-bandkit-page-theme="true"] #band-navbar a { color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, .menu-bar, header[role="banner"]) { background-color: var(--bandkit-page-navbar) !important; color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, .menu-bar, header[role="banner"]) {
          --default-background-color: var(--bandkit-page-navbar);
          --page-background-color: var(--bandkit-page-navbar);
          --default-foreground-color: var(--bandkit-page-navbar-text);
          --page-text-color: var(--bandkit-page-navbar-text);
          --page-text-color-secondary: var(--bandkit-page-navbar-muted);
          --bandcamp-blue: var(--bandkit-page-navbar-text);
          --artist-blue: var(--bandkit-page-navbar-text);
          --gray700: var(--bandkit-page-navbar-text);
          --gray600: var(--bandkit-page-navbar-text);
          --gray500: var(--bandkit-page-navbar-muted);
          --gray400: var(--bandkit-page-navbar-muted);
          --border-color: var(--bandkit-page-navbar-border);
          --border-color-subtle: var(--bandkit-page-navbar-border);
        }
        html[data-bandkit-page-theme="true"] :is(#menubar-wrapper, .menubar-wrapper, .bandcamp-menubar, .menu-bar, header[role="banner"]) :is(a, button, [role="menuitem"]) { color: var(--bandkit-page-navbar-text) !important; }
        html[data-bandkit-page-theme="true"] .menu-bar .site-search-form input {
          background-color: var(--menubar-search-input-background-color) !important;
          border-color: var(--bandkit-page-navbar-border) !important;
          caret-color: var(--bandkit-page-navbar-accent) !important;
          color: var(--bandkit-page-search-text) !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .site-search-form input::placeholder {
          color: var(--bandkit-page-search-muted) !important;
          opacity: 1 !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .site-search-form :is(.input-container, .clear-search) { color: var(--bandkit-page-search-text) !important; }
        html[data-bandkit-page-theme="true"] .menu-bar .site-search-form .clear-search svg { color: inherit !important; fill: currentColor !important; opacity: 1 !important; }
        html[data-bandkit-page-theme="true"] :is(#HomepageApp, #DiscoverApp, body) .menu-bar .search-instant-inline .genre-suggestions a.g-button {
          color: var(--g-button-text-color) !important;
        }
        html[data-bandkit-page-theme="true"] :is(#HomepageApp, #DiscoverApp, body) .menu-bar .search-instant-inline .genre-suggestions a.g-button svg {
          color: inherit !important;
          fill: currentColor !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results {
          --default-background-color: var(--bandkit-page-navbar);
          --page-background-color: var(--bandkit-page-navbar);
          --default-foreground-color: var(--bandkit-page-navbar-text);
          --page-text-color: var(--bandkit-page-navbar-text);
          --page-text-color-secondary: var(--bandkit-page-navbar-muted);
          --bc-link-color: var(--bandkit-page-navbar-text);
          --bandcamp-blue: var(--bandkit-page-navbar-accent);
          --gray700: var(--bandkit-page-navbar-text);
          --gray600: var(--bandkit-page-navbar-text);
          --gray500: var(--bandkit-page-navbar-muted);
          --gray400: var(--bandkit-page-navbar-muted);
          background: var(--bandkit-page-navbar) !important;
          border: 1px solid var(--bandkit-page-navbar-border) !important;
          color: var(--bandkit-page-navbar-text) !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results :is(.search-results-filter, .tab-group, [role="tabpanel"], .result-links-list) {
          background: transparent !important;
          color: var(--bandkit-page-navbar-text) !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .tab {
          background: transparent !important;
          border-color: transparent transparent var(--bandkit-page-navbar-border) !important;
          color: var(--bandkit-page-navbar-text) !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .tab .title { color: inherit !important; }
        html[data-bandkit-page-theme="true"] :is(#HomepageApp, body) .menu-bar .search-instant-inline .results .tab.active {
          background: var(--bandkit-page-navbar-accent) !important;
          color: var(--bandkit-page-navbar-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"] :is(#HomepageApp, body) .menu-bar .search-instant-inline .results .tab.active .title { color: var(--bandkit-page-navbar-on-accent) !important; }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .result-link {
          background: transparent !important;
          color: var(--bandkit-page-navbar-text) !important;
        }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .result-link :is(.title, .subtitle) { color: inherit !important; }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .result-link :is(.meta, .item-type) { color: var(--bandkit-page-navbar-muted) !important; }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .cta-buttons .g-button {
          background: color-mix(in srgb, var(--bandkit-page-navbar-text) 8%, var(--bandkit-page-navbar)) !important;
          border-color: var(--bandkit-page-navbar-border) !important;
          color: var(--bandkit-page-navbar-text) !important;
        }
        @media (hover: hover) {
          html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .result-link:hover,
          html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .tab:not(.active):hover,
          html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results .cta-buttons .g-button:hover {
            background: var(--bandkit-page-navbar-accent-soft) !important;
            color: var(--bandkit-page-navbar-text) !important;
          }
        }
        html[data-bandkit-page-theme="true"] .menu-bar .search-instant-inline .results :is(.result-link, .tab, .cta-buttons .g-button):focus-visible {
          background: var(--bandkit-page-navbar-accent-soft) !important;
          color: var(--bandkit-page-navbar-text) !important;
          outline-color: var(--bandkit-page-navbar-accent) !important;
        }
        html[data-bandkit-page-theme="true"] .follow-unfollow,
        html[data-bandkit-page-theme="true"] :is(.follow-band, .follow-fan) { background-color: var(--bandkit-page-accent) !important; background-image: none !important; border-color: var(--bandkit-page-accent) !important; box-shadow: none !important; color: var(--bandkit-page-on-accent) !important; }
        html[data-bandkit-page-theme="true"] .follow-unfollow *,
        html[data-bandkit-page-theme="true"] :is(.follow-band, .follow-fan) * { background-color: transparent !important; background-image: none !important; border-color: transparent !important; box-shadow: none !important; color: inherit !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .follow-unfollow { align-items: center !important; background-color: var(--bandkit-page-accent) !important; border: 0 !important; box-sizing: border-box !important; color: var(--bandkit-page-on-accent) !important; display: inline-flex !important; gap: 7px !important; justify-content: center !important; line-height: 1 !important; min-height: 32px !important; padding: 7px 12px !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .follow-unfollow > :is(.plus, .checkmark) { align-items: center; justify-content: center; line-height: 0; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .follow-unfollow :is(svg, svg *) { color: inherit !important; fill: currentColor !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #grid-tabs-sticky {
          background: var(--bandkit-page-surface) !important;
          border-color: var(--bandkit-page-border) !important;
          color: var(--bandkit-page-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #grid-tabs > li.active { border-bottom-color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #grid-tabs > li:not(.active):is(:hover, :focus-visible, :focus-within) {
          background: var(--bandkit-page-accent-soft) !important;
          border-bottom-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #grid-tabs .tab-new-badge {
          background: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] .collection-item-why :is(.question-link, .question-link a) {
          color: var(--bandkit-page-accent) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] .collection-item-container :is(.save-button, .save-button.disabled) {
          background: var(--bandkit-page-accent) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] .collection-item-container .save-button.disabled { opacity: 0.52; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] .collection-item-container .just-hint {
          background: var(--bandkit-page-accent-soft) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-text) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] .collection-item-container .just-hint a { color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"] :is(.tag, .tags a, .collection-item-tags a) { background-color: var(--bandkit-page-accent-soft) !important; border-color: transparent !important; color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-add-to, .bandcamp-hub-page-playlist.is-feed-sidebar-action, .bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-feed-purchase-action, .bandkit-feed-hear-more-action, .bandkit-feed-wishlist-control, .bandkit-feed-wishlist-action .wishlist-msg, .bandkit-feed-wishlist-action .wishlisted-msg > span:first-child) { background: transparent !important; border-color: transparent !important; color: var(--bandkit-page-card-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-collection-download-action) { background: transparent !important; border-color: transparent !important; color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-add-to, .bandcamp-hub-page-playlist.is-feed-sidebar-action, .bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-feed-purchase-action, .bandkit-feed-hear-more-action, .bandkit-feed-wishlist-control, .bandkit-feed-wishlist-action .wishlist-msg, .bandkit-feed-wishlist-action .wishlisted-msg > span:first-child):is(:hover, :focus-visible) { background: color-mix(in srgb, var(--bandkit-page-card-accent) 9%, var(--bandkit-page-card)) !important; border-color: transparent !important; color: var(--bandkit-page-card-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] :is(.bandcamp-hub-page-playlist.is-feed-compact-action, .bandkit-collection-download-action):is(:hover, :focus-visible) { background: color-mix(in srgb, var(--bandkit-page-accent) 9%, var(--bandkit-page-card)) !important; border-color: transparent !important; }
        html[data-bandkit-page-theme="true"] :is(hr, .track_row_view, .collection-item-container, section.floating-player) { border-color: var(--bandkit-page-border) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container :is(#collection-items, #wishlist-items) .collection-grid > .collection-item-container {
          --bandkit-page-text: var(--bandkit-page-surface-text);
          --bandkit-page-muted: var(--bandkit-page-surface-muted);
          --bandkit-page-accent: var(--bandkit-page-surface-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-surface-accent-soft);
          --bandkit-page-border: var(--bandkit-page-surface-border);
          --bandkit-page-on-accent: var(--bandkit-page-surface-on-accent);
          background: transparent !important;
          border-color: transparent !important;
          border-radius: 6px;
          box-sizing: border-box;
          height: auto;
          min-height: 0;
          vertical-align: top;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container :is(#collection-items, #wishlist-items) .collection-grid > .collection-item-container:is(:hover, :focus-within) {
          --bandkit-page-text: var(--bandkit-page-card-text);
          --bandkit-page-muted: var(--bandkit-page-card-muted);
          --bandkit-page-accent: var(--bandkit-page-card-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-card-accent-soft);
          --bandkit-page-border: var(--bandkit-page-card-border);
          --bandkit-page-on-accent: var(--bandkit-page-card-on-accent);
          background: var(--bandkit-page-card) !important;
          border-color: var(--bandkit-page-card-border) !important;
        }
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
        html[data-bandkit-page-theme="true"] #DiscoverApp .breadcrumbs-bar.dark-mode {
          --default-foreground-color: var(--bandkit-page-discover-glass-text);
          --page-text-color: var(--bandkit-page-discover-glass-text);
          --page-text-color-secondary: var(--bandkit-page-discover-glass-muted);
          --gray700: var(--bandkit-page-discover-glass-text);
          --gray600: var(--bandkit-page-discover-glass-text);
          --gray500: var(--bandkit-page-discover-glass-muted);
          color: var(--bandkit-page-discover-glass-text) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .breadcrumbs-bar.dark-mode :is(.crumbs, .crumb) {
          color: var(--bandkit-page-discover-glass-text) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .breadcrumbs-bar.dark-mode .result-count-display {
          color: var(--bandkit-page-discover-glass-muted) !important;
          opacity: 1;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.genre-filter, .subgenre-filter, .format-filter, .more-filters-row, .tags-background, .horizontal-scroll-row) {
          background: transparent !important;
          background-image: none !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) {
          --gray700: var(--bandkit-page-card-text);
          --g-button-background-color: var(--bandkit-page-card);
          --g-button-text-color: var(--bandkit-page-card-text);
          --g-button-border-color: var(--bandkit-page-card-border);
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-card-border) !important;
          color: var(--bandkit-page-card-text) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.chip-button.selected-tag, .radio-item.active, .radio-item.selected, .radio-item[aria-checked="true"], [role="option"][aria-selected="true"]) {
          --gray700: var(--bandkit-page-on-accent);
          --g-button-background-color: var(--bandkit-page-accent);
          --g-button-text-color: var(--bandkit-page-on-accent);
          --g-button-border-color: var(--bandkit-page-accent);
          background: var(--bandkit-page-accent) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) :is(span, svg) { color: inherit !important; }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) svg { fill: currentColor !important; stroke: currentColor !important; }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) svg *:not([fill="none"]) { fill: currentColor !important; }
        html[data-bandkit-page-theme="true"] #DiscoverApp .filters-banner:not(.genre-theme) :is(.chip-button, .filter-button, .follow-button, .radio-item, [role="option"]) svg *:not([stroke="none"]) { stroke: currentColor !important; }
        html[data-bandkit-page-theme="true"] #DiscoverApp :is(.tag-search-wrapper, .filters-banner) input::placeholder {
          color: var(--bandkit-page-card-muted) !important;
          opacity: 1 !important;
        }
        html[data-bandkit-page-theme="true"] #DiscoverApp .buy-button.buy-tralbum-button,
        html[data-bandkit-page-theme="true"] .skip-link.bc-visible-focus-only {
          background: var(--bandkit-page-accent) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"] .searchresult :is(.itemtype, .tags.data-search) {
          color: var(--bandkit-page-muted) !important;
        }
        html[data-bandkit-page-theme="true"] .pager :is(.pagenum, .nextprev) {
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-card-border) !important;
          color: var(--bandkit-page-card-accent) !important;
        }
        html[data-bandkit-page-theme="true"] .pager .pagenum.chosen {
          background: var(--bandkit-page-accent) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"] .pager :is(.pagenum, .nextprev):is(:hover, :focus-visible) {
          background: var(--bandkit-page-accent-soft) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #gift-card-vm .gift-redeem {
          color: var(--bandkit-page-text) !important;
        }
        html[data-bandkit-page-theme="true"] #gift-card-vm .preset-values > li,
        html[data-bandkit-page-theme="true"] #gift-card-vm .delivery-option {
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-card-border) !important;
          color: var(--bandkit-page-card-text) !important;
        }
        html[data-bandkit-page-theme="true"] #gift-card-vm .preset-values > li .dollar-hint,
        html[data-bandkit-page-theme="true"] #gift-card-vm .delivery-option .hint {
          color: var(--bandkit-page-card-muted) !important;
        }
        html[data-bandkit-page-theme="true"] #gift-card-vm .preset-values > li.selected {
          background: var(--bandkit-page-accent) !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #gift-card-vm .preset-values > li.selected :is(span, .dollar-hint),
        html[data-bandkit-page-theme="true"] #gift-card-vm .delivery-option :is(.label-wrapper, span) {
          color: inherit !important;
        }
        html[data-bandkit-page-theme="true"] #gift-card-vm .delivery-option.selected {
          border-color: var(--bandkit-page-accent) !important;
          box-shadow: 0 0 0 1px var(--bandkit-page-accent) inset !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .collected-by-header {
          color: var(--bandkit-page-muted) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .fan-location {
          color: var(--bandkit-page-muted) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .banner-inner {
          background: var(--bandkit-page-accent) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-on-accent) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .edit-profile > a {
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border-color: var(--bandkit-page-card-border) !important;
          color: var(--bandkit-page-card-accent) !important;
        }
        html[data-bandkit-page-theme="true"][data-bandkit-collection-page="true"] #fan-container .edit-profile > a :is(span, svg) {
          color: inherit !important;
          fill: currentColor !important;
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
          --default-background-color: var(--bandkit-page-background);
          --page-background-color: var(--bandkit-page-background);
          --default-foreground-color: var(--bandkit-page-background-text);
          --page-text-color: var(--bandkit-page-background-text);
          --page-text-color-secondary: var(--bandkit-page-background-muted);
          --bandcamp-blue: var(--bandkit-page-background-accent);
          --artist-blue: var(--bandkit-page-background-accent);
          --gray700: var(--bandkit-page-background-text);
          --gray600: var(--bandkit-page-background-text);
          --gray500: var(--bandkit-page-background-muted);
          --gray400: var(--bandkit-page-background-muted);
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
          --default-background-color: var(--bandkit-page-surface);
          --page-background-color: var(--bandkit-page-surface);
          --default-foreground-color: var(--bandkit-page-surface-text);
          --page-text-color: var(--bandkit-page-surface-text);
          --page-text-color-secondary: var(--bandkit-page-surface-muted);
          --bandcamp-blue: var(--bandkit-page-surface-accent);
          --artist-blue: var(--bandkit-page-surface-accent);
          --gray700: var(--bandkit-page-surface-text);
          --gray600: var(--bandkit-page-surface-text);
          --gray500: var(--bandkit-page-surface-muted);
          --gray400: var(--bandkit-page-surface-muted);
          background-color: var(--bandkit-page-surface) !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section .dark-mode {
          --default-background-color: transparent;
          --page-background-color: transparent;
          --default-foreground-color: var(--bandkit-page-text);
          --page-text-color: var(--bandkit-page-text);
          --page-text-color-secondary: var(--bandkit-page-muted);
          --text-color-dark: var(--bandkit-page-text);
          --bandcamp-blue: var(--bandkit-page-accent);
          --artist-blue: var(--bandkit-page-accent);
          --gray700: var(--bandkit-page-text);
          --gray600: var(--bandkit-page-text);
          --gray500: var(--bandkit-page-muted);
          --gray400: var(--bandkit-page-muted);
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .discover-tags .g-pill {
          --default-background-color: var(--bandkit-page-card);
          --default-foreground-color: var(--bandkit-page-card-text);
          --page-background-color: var(--bandkit-page-card);
          --page-text-color: var(--bandkit-page-card-text);
          --bandcamp-blue: var(--bandkit-page-card-text);
          background: var(--bandkit-page-card) !important;
          background-image: none !important;
          border: 1px solid var(--bandkit-page-card-border) !important;
          box-shadow: none !important;
          color: var(--bandkit-page-card-text) !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .discover-tags .g-pill:is(:hover, :focus-visible) {
          background: color-mix(in srgb, var(--bandkit-page-card-accent) 10%, var(--bandkit-page-card)) !important;
          border-color: var(--bandkit-page-card-accent) !important;
          color: var(--bandkit-page-card-text) !important;
          outline-color: var(--bandkit-page-card-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section time { color: var(--bandkit-page-muted) !important; }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section .text-badge {
          background: transparent !important;
          border: 1px solid var(--bandkit-page-accent) !important;
          color: var(--bandkit-page-accent) !important;
        }
        html[data-bandkit-page-theme="true"] #HomepageApp .g-section :is(.attribution, .attribution-meta, .byline, .date, .meta) { color: var(--bandkit-page-muted) !important; }
        html[data-bandkit-page-theme="true"] #HomepageApp :is(.play-pause-button, .play-button, .artwork-play-button).over-image {
          background-color: transparent !important;
          background-image: none !important;
          border-color: transparent !important;
        }
        html[data-bandkit-page-theme="true"] #page-footer {
          --bandkit-page-text: var(--bandkit-page-navbar-text);
          --bandkit-page-muted: var(--bandkit-page-navbar-muted);
          --bandkit-page-accent: var(--bandkit-page-navbar-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-navbar-accent-soft);
          --bandkit-page-border: var(--bandkit-page-navbar-border);
          --bandkit-page-on-accent: var(--bandkit-page-navbar-on-accent);
          --default-background-color: var(--bandkit-page-navbar);
          --page-background-color: var(--bandkit-page-navbar);
          --default-foreground-color: var(--bandkit-page-navbar-text);
          --page-text-color: var(--bandkit-page-navbar-text);
          --page-text-color-secondary: var(--bandkit-page-navbar-muted);
          --text-color-dark: var(--bandkit-page-navbar-text);
          --bandcamp-blue: var(--bandkit-page-navbar-accent);
          --artist-blue: var(--bandkit-page-navbar-accent);
          --gray700: var(--bandkit-page-navbar-text);
          --gray600: var(--bandkit-page-navbar-text);
          --gray500: var(--bandkit-page-navbar-muted);
          --gray400: var(--bandkit-page-navbar-muted);
          background: var(--bandkit-page-navbar) !important;
          color: var(--bandkit-page-navbar-text) !important;
        }
        html[data-bandkit-page-theme="true"] #page-footer :is(h1, h2, h3, h4, p, li, label, strong, span) { color: var(--bandkit-page-text) !important; }
        html[data-bandkit-page-theme="true"] #page-footer :is(a, button) { color: var(--bandkit-page-accent) !important; }
        html[data-bandkit-page-theme="true"][data-bandkit-feed-page="true"] body.feed #pgBd {
          --bandkit-page-text: var(--bandkit-page-background-text);
          --bandkit-page-muted: var(--bandkit-page-background-muted);
          --bandkit-page-accent: var(--bandkit-page-background-accent);
          --bandkit-page-accent-soft: var(--bandkit-page-background-accent-soft);
          --bandkit-page-border: var(--bandkit-page-background-border);
          --bandkit-page-on-accent: var(--bandkit-page-background-on-accent);
          background: var(--bandkit-page-background) !important;
          color: var(--bandkit-page-background-text) !important;
        }
        html[data-bandkit-page-theme="true"] ::selection { background: var(--bandkit-page-accent); color: var(--bandkit-page-on-accent); }
      `;
      document.head.append(pageThemeStyle);
    };
}
/* eslint-enable max-lines-per-function */

function registerAppearance2(r) {
r.$applyCollectionPlaylistsTheme = function applyCollectionPlaylistsTheme() {
      const host = document.querySelector("collection-playlists-tab");
      if (!host) return;
      const values = {
        "--default-foreground-color": "var(--bandkit-page-text)",
        "--page-text-color": "var(--bandkit-page-text)",
        "--page-text-color-secondary": "var(--bandkit-page-muted)",
        "--default-background-color": "var(--bandkit-page-surface)",
        "--page-background-color": "var(--bandkit-page-surface)",
        "--elevated-background-color-1": "var(--bandkit-page-card)",
        "--elevated-background-color-2": "var(--bandkit-page-card)",
        "--elevated-background-color-3": "var(--bandkit-page-card)",
        "--elevated-background-color-4": "var(--bandkit-page-card)",
        "--border-color": "var(--bandkit-page-border)",
        "--border-color-strong": "var(--bandkit-page-text)",
        "--border-color-subtle": "var(--bandkit-page-border)",
        "--blue600": "var(--bandkit-page-accent)",
        "--blue500": "var(--bandkit-page-accent)",
        "--blue400": "var(--bandkit-page-accent)",
        "--bandcamp-blue": "var(--bandkit-page-accent)",
        "--artist-blue": "var(--bandkit-page-accent)",
        "--bc-link-color": "var(--bandkit-page-accent)",
        "--gray700": "var(--bandkit-page-text)",
        "--gray600": "var(--bandkit-page-text)",
        "--gray500": "var(--bandkit-page-muted)",
        "--gray400": "var(--bandkit-page-muted)",
        "--gray300": "var(--bandkit-page-border)",
        "--gray200": "var(--bandkit-page-accent-soft)",
        "--primary-transparency-dark": "var(--bandkit-page-accent-soft)",
        "--secondary-transparency-dark": "var(--bandkit-page-accent-soft)",
        "color-scheme": "var(--bandkit-page-scheme)"
      };
      if (!runtimeState.appearance.applyToPage) {
        for (const name of Object.keys(values)) host.style.removeProperty(name);
        return;
      }
      for (const [name, value] of Object.entries(values)) host.style.setProperty(name, value, "important");
    };
r.$applyBandcampPageTheme = function applyBandcampPageTheme() {
      r.$ensureBandcampThemeStyle();
      const enabled = Boolean(runtimeState.appearance.applyToPage);
      document.documentElement.dataset.bandkitPageTheme = String(enabled);
      document.documentElement.dataset.bandkitCheckoutPage = String(location.pathname.startsWith("/cart/checkout"));
      document.documentElement.dataset.bandkitCheckoutError = String(location.pathname === "/cart/checkout_booboo");
      if (!enabled) {
        for (const name of ["--bandkit-page-background", "--bandkit-page-surface", "--bandkit-page-card", "--bandkit-page-navbar", "--bandkit-page-navbar-text", "--bandkit-page-navbar-muted", "--bandkit-page-navbar-accent", "--bandkit-page-navbar-accent-soft", "--bandkit-page-navbar-border", "--bandkit-page-navbar-on-accent", "--menubar-search-input-background-color", "--bandkit-page-search-background", "--bandkit-page-search-text", "--bandkit-page-search-muted", "--bandkit-page-text", "--bandkit-page-background-text", "--bandkit-page-background-muted", "--bandkit-page-background-accent", "--bandkit-page-background-accent-soft", "--bandkit-page-background-border", "--bandkit-page-background-on-accent", "--bandkit-page-surface-text", "--bandkit-page-surface-muted", "--bandkit-page-surface-accent", "--bandkit-page-surface-accent-soft", "--bandkit-page-surface-border", "--bandkit-page-surface-on-accent", "--bandkit-page-muted", "--bandkit-page-accent", "--bandkit-page-accent-soft", "--bandkit-page-border", "--bandkit-page-on-accent", "--bandkit-page-card-text", "--bandkit-page-card-muted", "--bandkit-page-card-accent", "--bandkit-page-card-accent-soft", "--bandkit-page-card-border", "--bandkit-page-card-on-accent", "--bandkit-page-discover-glass-text", "--bandkit-page-discover-glass-muted", "--bandkit-page-scheme"]) {
          document.documentElement.style.removeProperty(name);
        }
        r.$applyCollectionPlaylistsTheme();
        return;
      }
      const theme = r.$accessibleAppearanceTheme();
      const dark = luminance(theme.background) < 0.34;
      const navbarDark = luminance(theme.navbar) < 0.34;
      const navbarMuted = readableColor(theme.muted, [theme.navbar], 4.5).color;
      const navbarAccent = readableColor(theme.accent, [theme.navbar], 4.5).color;
      const navbarBorder = readableColor(
        mixColor(theme.navbar, theme.navbarText, navbarDark ? 0.24 : 0.16),
        [theme.navbar],
        3
      ).color;
      const navbarOnAccent = readableColor(theme.navbarText, [navbarAccent], 4.5).color;
      const searchBackground = mixColor(theme.navbar, theme.navbarText, navbarDark ? 0.16 : 0.08);
      const searchText = readableColor(theme.navbarText, [searchBackground], 4.5).color;
      const searchMuted = readableColor(theme.muted, [searchBackground], 4.5).color;
      const discoverGlassSurfaces = [
        { r: 34, g: 34, b: 34, a: 1 },
        { r: 96, g: 96, b: 96, a: 1 }
      ];
      const discoverGlassText = readableColor(theme.text, discoverGlassSurfaces, 4.5).color;
      const discoverGlassMuted = readableColor(theme.muted, discoverGlassSurfaces, 4.5).color;
      const variables = {
        "--bandkit-page-background": colorString(theme.background),
        "--bandkit-page-surface": colorString(theme.pageSurface),
        "--bandkit-page-card": colorString(theme.card),
        "--bandkit-page-navbar": colorString(theme.navbar),
        "--bandkit-page-navbar-text": colorString(theme.navbarText),
        "--bandkit-page-navbar-muted": colorString(navbarMuted),
        "--bandkit-page-navbar-accent": colorString(navbarAccent),
        "--bandkit-page-navbar-accent-soft": colorString(navbarAccent, navbarDark ? 0.16 : 0.1),
        "--bandkit-page-navbar-border": colorString(navbarBorder),
        "--bandkit-page-navbar-on-accent": colorString(navbarOnAccent),
        "--bandkit-page-search-background": colorString(searchBackground),
        "--menubar-search-input-background-color": colorString(searchBackground),
        "--bandkit-page-search-text": colorString(searchText),
        "--bandkit-page-search-muted": colorString(searchMuted),
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
        "--bandkit-page-card-text": colorString(theme.cardText),
        "--bandkit-page-card-muted": colorString(theme.cardMuted),
        "--bandkit-page-card-accent": colorString(theme.cardAccent),
        "--bandkit-page-card-accent-soft": colorString(theme.cardAccent, luminance(theme.card) < 0.34 ? 0.16 : 0.1),
        "--bandkit-page-card-border": colorString(theme.cardBorder),
        "--bandkit-page-card-on-accent": colorString(theme.cardOnAccent),
        "--bandkit-page-discover-glass-text": colorString(discoverGlassText),
        "--bandkit-page-discover-glass-muted": colorString(discoverGlassMuted),
        "--bandkit-page-scheme": dark ? "dark" : "light"
      };
      for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
      r.$applyCollectionPlaylistsTheme();
    };
}

// eslint-disable-next-line max-lines-per-function -- Related page-header and release appearance rules share this registration scope.
function registerAppearance3(r) {
r.$applyShadowHeaderTheme = function applyShadowHeaderTheme() {
      const menuBar = document.querySelector("menu-bar");
      const pageFooter = document.querySelector("page-footer");
      if (!menuBar?.shadowRoot && !pageFooter?.shadowRoot) return;
      const themeTargets = [
        menuBar,
        menuBar?.shadowRoot?.querySelector?.(".full-page-app-wrapper"),
        menuBar?.shadowRoot?.querySelector?.(".menu-bar"),
        pageFooter
      ].filter(Boolean);
      const menuRoot = menuBar?.shadowRoot;
      const headerThemeStyle = menuRoot?.querySelector?.("#bandkit-shadow-header-theme");
      const footerRoot = pageFooter?.shadowRoot;
      const footerThemeStyle = footerRoot?.querySelector?.("#bandkit-shadow-footer-theme");
      const propertyNames = [
        "--default-background-color", "--page-background-color", "--menubar-background-color",
        "--elevated-background-color-1", "--elevated-background-color-2", "--elevated-background-color-3", "--elevated-background-color-4",
        "--default-foreground-color", "--page-text-color", "--page-text-color-secondary", "--bc-link-color",
        "--menubar-search-input-background-color", "--bandkit-page-search-text", "--bandkit-page-search-muted", "--border-color", "--border-color-strong", "--border-color-subtle",
        "--g-button-text-color", "--g-button-hover-background-color", "--g-button-border-color",
        "--gray700", "--gray600", "--gray500", "--gray400", "--text-color-dark",
        "--bandcamp-blue", "--artist-blue", "--blue400", "--disabled-text-color", "color-scheme"
      ];
      if (!runtimeState.appearance.applyToPage) {
        for (const target of themeTargets) {
          for (const name of propertyNames) target.style.removeProperty(name);
        }
        headerThemeStyle?.remove();
        footerThemeStyle?.remove();
        return;
      }
      const theme = r.$accessibleAppearanceTheme();
      const dark = luminance(theme.navbar) < 0.34;
      const navbarMuted = readableColor(theme.muted, [theme.navbar], 4.5).color;
      const navbarBorder = readableColor(
        mixColor(theme.navbar, theme.navbarText, dark ? 0.24 : 0.16),
        [theme.navbar],
        3
      ).color;
      const searchBackground = mixColor(theme.navbar, theme.navbarText, dark ? 0.16 : 0.08);
      const searchText = readableColor(theme.navbarText, [searchBackground], 4.5).color;
      const searchMuted = readableColor(theme.muted, [searchBackground], 4.5).color;
      const buttonHover = mixColor(theme.navbar, theme.navbarText, dark ? 0.16 : 0.08);
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
        "--bandkit-page-search-text": colorString(searchText),
        "--bandkit-page-search-muted": colorString(searchMuted),
        "--border-color": colorString(navbarBorder),
        "--border-color-strong": colorString(theme.navbarText),
        "--border-color-subtle": colorString(navbarBorder, 0.55),
        "--g-button-text-color": colorString(theme.navbarText),
        "--g-button-hover-background-color": colorString(buttonHover),
        "--g-button-border-color": colorString(navbarBorder),
        "--gray700": colorString(theme.navbarText),
        "--gray600": colorString(theme.navbarText),
        "--gray500": colorString(navbarMuted),
        "--gray400": colorString(navbarMuted),
        "--text-color-dark": colorString(theme.navbarText),
        "--bandcamp-blue": colorString(theme.navbarText),
        "--artist-blue": colorString(theme.navbarText),
        "--blue400": colorString(theme.navbarText),
        "--disabled-text-color": colorString(navbarMuted),
        "color-scheme": dark ? "dark" : "light"
      };
      for (const target of themeTargets) {
        for (const [name, value] of Object.entries(variables)) {
          if (target.style.getPropertyValue(name) !== value || target.style.getPropertyPriority(name) !== "important") {
            target.style.setProperty(name, value, "important");
          }
        }
      }
      if (menuRoot && document.createElement && menuRoot.append) {
        const style = headerThemeStyle || document.createElement("style");
        style.id = "bandkit-shadow-header-theme";
        if (style.textContent !== SHADOW_HEADER_THEME_CSS) style.textContent = SHADOW_HEADER_THEME_CSS;
        if (!headerThemeStyle) menuRoot.append(style);
      }
      if (footerRoot && document.createElement && footerRoot.append) {
        const style = footerThemeStyle || document.createElement("style");
        style.id = "bandkit-shadow-footer-theme";
        const footerCss = `
          :is(.vue-page-footer, footer#page-footer) {
            background: var(--bandkit-page-navbar) !important;
            color: var(--bandkit-page-navbar-text) !important;
          }
          :is(.vue-page-footer, footer#page-footer) * {
            --default-foreground-color: var(--bandkit-page-navbar-text) !important;
            --page-text-color: var(--bandkit-page-navbar-text) !important;
            --page-text-color-secondary: var(--bandkit-page-navbar-muted) !important;
            --bc-link-color: var(--bandkit-page-navbar-accent) !important;
            --bandcamp-blue: var(--bandkit-page-navbar-accent) !important;
            --gray700: var(--bandkit-page-navbar-text) !important;
            --gray600: var(--bandkit-page-navbar-text) !important;
            --gray500: var(--bandkit-page-navbar-muted) !important;
            --gray400: var(--bandkit-page-navbar-muted) !important;
            --border-color: var(--bandkit-page-navbar-border) !important;
            --border-color-subtle: var(--bandkit-page-navbar-border) !important;
          }
          :is(.vue-page-footer, footer#page-footer) :is(a, button) {
            color: var(--bandkit-page-navbar-accent) !important;
          }
        `;
        if (style.textContent !== footerCss) style.textContent = footerCss;
        if (!footerThemeStyle) footerRoot.append(style);
      }
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
      if (document.querySelector("#community-inner > .community-view.active #subscribe")) return "subscribe";
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
r.$syncTrackKeyVisibilityMode = function syncTrackKeyVisibilityMode() {
      document.documentElement.dataset.bandkitShowTrackKeys = String(runtimeState.showTrackKeys !== false);
      document.documentElement.dataset.bandkitShowCamelot = String(runtimeState.showCamelotNotation === true);
    };
}

function registerAppearance4(r) {
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

function registerAppearance5(r) {
r.$syncPageCornerShadowRoots = function syncPageCornerShadowRoots(remove = false) {
      const visit = (root) => {
        for (const host of root.querySelectorAll("*")) {
          const shadow = host.shadowRoot;
          if (!shadow) continue;
          const existing = shadow.querySelector('style[data-bandkit-page-corners="true"]');
          if (remove) existing?.remove();
          else if (!existing) {
            const style = document.createElement("style");
            style.dataset.bandkitPageCorners = "true";
            style.textContent = `
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="square"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon),
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="square"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon)::before,
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="square"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon):not(.hub-play-button.is-loading)::after { border-radius: 0 !important; }
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="custom"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon),
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="custom"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon)::before,
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="custom"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon):not(.hub-play-button.is-loading)::after { border-radius: var(--bandkit-page-corner-radius, 12px) !important; }
            `;
            shadow.append(style);
          }
          r.$pageCornerShadowObserver?.observe(shadow, { childList: true, subtree: true });
          visit(shadow);
        }
      };
      visit(document);
    };
r.$schedulePageCornerShadowSync = function schedulePageCornerShadowSync() {
      if (r.$pageCornerShadowFrame) return;
      r.$pageCornerShadowFrame = requestAnimationFrame(() => {
        r.$pageCornerShadowFrame = 0;
        r.$syncPageCornerShadowRoots();
      });
    };
}

function setupAppearance1(r) {
  r.$pageCornerShadowFrame = 0;
  r.$pageCornerShadowObserver = new MutationObserver(r.$schedulePageCornerShadowSync);
  r.$pageCornerShadowObserver.observe(document.body, { childList: true, subtree: true });
  r.$schedulePageCornerShadowSync();
  r.$app.registerCleanup(() => {
    r.$pageCornerShadowObserver?.disconnect();
    window.cancelAnimationFrame(r.$pageCornerShadowFrame);
    r.$syncPageCornerShadowRoots(true);
  });
}

export const registerAppearance = [registerAppearance1, registerAppearance2, registerAppearance3, registerAppearance4, registerAppearance5];

export const setupAppearance = [setupAppearance1];
