export const SHADOW_HEADER_THEME_CSS = `
  .menu-bar :is(
    .bandcamp-logo-link,
    .menu-items > li > a,
    .menu-items > li > button
  ) { color: var(--bandkit-page-navbar-text) !important; }
  .menu-bar :is(
    .bandcamp-logo-link,
    .menu-items > li > a,
    .menu-items > li > button
  ) svg { color: inherit !important; }
  .menu-bar :is(a, button):focus-visible { outline-color: var(--bandkit-page-navbar-accent) !important; }
  .menu-bar .site-search-form input { background-color: var(--menubar-search-input-background-color) !important; border-color: var(--bandkit-page-navbar-border) !important; caret-color: var(--bandkit-page-navbar-accent) !important; color: var(--bandkit-page-search-text) !important; }
  .menu-bar .site-search-form input::placeholder { color: var(--bandkit-page-search-muted) !important; opacity: 1 !important; }
  .menu-bar .site-search-form :is(.input-container, .clear-search) { color: var(--bandkit-page-search-text) !important; }
  .menu-bar .site-search-form .clear-search svg { color: inherit !important; fill: currentColor !important; opacity: 1 !important; }
  .menu-bar .search-instant-inline .genre-suggestions a.g-button { color: var(--g-button-text-color) !important; }
  .menu-bar .search-instant-inline .genre-suggestions a.g-button svg { color: inherit !important; fill: currentColor !important; }
  .menu-bar .search-instant-inline .results {
    --default-background-color: var(--bandkit-page-navbar); --page-background-color: var(--bandkit-page-navbar); --default-foreground-color: var(--bandkit-page-navbar-text); --page-text-color: var(--bandkit-page-navbar-text); --page-text-color-secondary: var(--bandkit-page-navbar-muted);
    --bc-link-color: var(--bandkit-page-navbar-text); --bandcamp-blue: var(--bandkit-page-navbar-accent); --gray700: var(--bandkit-page-navbar-text); --gray600: var(--bandkit-page-navbar-text); --gray500: var(--bandkit-page-navbar-muted); --gray400: var(--bandkit-page-navbar-muted);
    background: var(--bandkit-page-navbar) !important;
    border: 1px solid var(--bandkit-page-navbar-border) !important;
    color: var(--bandkit-page-navbar-text) !important;
  }
  .menu-bar .search-instant-inline .results :is(.search-results-filter, .tab-group, [role="tabpanel"], .result-links-list) { background: transparent !important; color: var(--bandkit-page-navbar-text) !important; }
  .menu-bar .search-instant-inline .results .tab { background: transparent !important; border-color: transparent transparent var(--bandkit-page-navbar-border) !important; color: var(--bandkit-page-navbar-text) !important; }
  .menu-bar .search-instant-inline .results .tab .title { color: inherit !important; }
  .menu-bar .search-instant-inline .results .tab.active { background: var(--bandkit-page-navbar-accent) !important; color: var(--bandkit-page-navbar-on-accent) !important; }
  .menu-bar .search-instant-inline .results .result-link { background: transparent !important; color: var(--bandkit-page-navbar-text) !important; }
  .menu-bar .search-instant-inline .results .result-link :is(.title, .subtitle) { color: inherit !important; }
  .menu-bar .search-instant-inline .results .result-link :is(.meta, .item-type) { color: var(--bandkit-page-navbar-muted) !important; }
  .menu-bar .search-instant-inline .results .cta-buttons .g-button { background: color-mix(in srgb, var(--bandkit-page-navbar-text) 8%, var(--bandkit-page-navbar)) !important; border-color: var(--bandkit-page-navbar-border) !important; color: var(--bandkit-page-navbar-text) !important; }
  @media (hover: hover) {
    .menu-bar .menu-items > li > :is(a, button):hover { background: var(--bandkit-page-navbar-accent-soft) !important; }
    .menu-bar .search-instant-inline .results .result-link:hover,
    .menu-bar .search-instant-inline .results .tab:not(.active):hover,
    .menu-bar .search-instant-inline .results .cta-buttons .g-button:hover {
      background: var(--bandkit-page-navbar-accent-soft) !important;
      color: var(--bandkit-page-navbar-text) !important;
    }
  }
  .menu-bar .search-instant-inline .results :is(.result-link, .tab, .cta-buttons .g-button):focus-visible {
    background: var(--bandkit-page-navbar-accent-soft) !important;
    color: var(--bandkit-page-navbar-text) !important;
    outline-color: var(--bandkit-page-navbar-accent) !important;
  }
`;
