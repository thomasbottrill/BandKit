import { runtimeState } from "./context.js";
import { STORAGE_KEYS } from "../../shared/contracts.js";
import { colorString, luminance, mixColor, readableColor } from "../color.js";
import { removeStyleProperty, setDatasetValue, setStyleProperty } from "../core.js";
import { SHADOW_HEADER_THEME_CSS } from "./appearance-header-theme.js";
import { collectCornerMutationRoots, collectShadowRoots, promotePendingHosts } from "./corner-mutations.js";

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
// The page stylesheet ships at document_start, but its colours are resolved
// from the user's theme and cannot be recomputed that early. Keeping the last
// resolved set in storage lets the bootstrap replay it before first paint, so a
// navigation no longer shows Bandcamp's own palette until the runtime starts.
r.$cacheBandcampPageTheme = function cacheBandcampPageTheme(enabled, variables) {
      const cache = { enabled, variables };
      const signature = JSON.stringify(cache);
      if (signature === r.$pageThemeCacheSignature) return;
      r.$pageThemeCacheSignature = signature;
      window.clearTimeout(r.$pageThemeCacheTimer);
      // Dragging a colour picker resolves a new theme every frame. Only the set
      // the drag settles on matters to the next navigation.
      r.$pageThemeCacheTimer = window.setTimeout(() => {
        try {
          // A settled theme resolves to the same set on every page, so read
          // before writing and leave storage alone when nothing moved.
          chrome.storage.local.get(STORAGE_KEYS.PAGE_THEME, (stored) => {
            if (chrome.runtime.lastError) return;
            if (JSON.stringify(stored?.[STORAGE_KEYS.PAGE_THEME]) === signature) return;
            chrome.storage.local.set({ [STORAGE_KEYS.PAGE_THEME]: cache });
          });
        } catch {}
      }, 400);
    };
r.$applyBandcampPageTheme = function applyBandcampPageTheme() {
      const enabled = Boolean(runtimeState.appearance.applyToPage);
      document.documentElement.dataset.bandkitPageTheme = String(enabled);
      document.documentElement.dataset.bandkitCheckoutPage = String(location.pathname.startsWith("/cart/checkout"));
      document.documentElement.dataset.bandkitCheckoutError = String(location.pathname === "/cart/checkout_booboo");
      if (!enabled) {
        for (const name of ["--bandkit-page-background", "--bandkit-page-surface", "--bandkit-page-card", "--bandkit-page-navbar", "--bandkit-page-navbar-text", "--bandkit-page-navbar-muted", "--bandkit-page-navbar-accent", "--bandkit-page-navbar-accent-soft", "--bandkit-page-navbar-border", "--bandkit-page-navbar-on-accent", "--menubar-search-input-background-color", "--bandkit-page-search-background", "--bandkit-page-search-text", "--bandkit-page-search-muted", "--bandkit-page-text", "--bandkit-page-background-text", "--bandkit-page-background-muted", "--bandkit-page-background-accent", "--bandkit-page-background-accent-soft", "--bandkit-page-background-border", "--bandkit-page-background-on-accent", "--bandkit-page-surface-text", "--bandkit-page-surface-muted", "--bandkit-page-surface-accent", "--bandkit-page-surface-accent-soft", "--bandkit-page-surface-border", "--bandkit-page-surface-on-accent", "--bandkit-page-muted", "--bandkit-page-accent", "--bandkit-page-accent-soft", "--bandkit-page-border", "--bandkit-page-on-accent", "--bandkit-page-card-text", "--bandkit-page-card-muted", "--bandkit-page-card-accent", "--bandkit-page-card-accent-soft", "--bandkit-page-card-border", "--bandkit-page-card-on-accent", "--bandkit-page-discover-glass-text", "--bandkit-page-discover-glass-muted", "--bandkit-page-scheme"]) {
          removeStyleProperty(document.documentElement.style, name);
        }
        r.$cacheBandcampPageTheme(false, {});
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
      for (const [name, value] of Object.entries(variables)) setStyleProperty(document.documentElement.style, name, value);
      r.$cacheBandcampPageTheme(true, variables);
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
      setDatasetValue(control, "bandkitLabel", label);
      if (!visibleLabel) {
        visibleLabel = document.createElement("span");
        visibleLabel.className = "bandkit-page-action-label";
        visibleLabel.setAttribute("aria-hidden", "true");
        control.append(visibleLabel);
      }
      setDatasetValue(visibleLabel, "bandkitLabelText", label);
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
r.$pageCornerStyleText = `
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="square"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon),
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="square"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon)::before,
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="square"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon):not(.hub-play-button.is-loading)::after { border-radius: 0 !important; }
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="custom"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon),
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="custom"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon)::before,
              :host-context(html[data-bandkit-modern-styling="true"][data-bandkit-corner-style="custom"]) :where(*):not(#bandkit-shadow-corner-a):not(#bandkit-shadow-corner-b):not(#bandkit-shadow-corner-c):not(.hub-player-art-link):not(.hub-player-art):not(.hub-button-icon):not(.hub-play-button.is-loading)::after { border-radius: var(--bandkit-page-corner-radius, 12px) !important; }
            `;
// The stylesheet keys off html[data-bandkit-corner-style] and a custom property,
// so a shadow root only ever needs it once; corner changes need no re-injection.
r.$stylePageCornerRoot = function stylePageCornerRoot(shadow) {
      if (!shadow) return;
      if (!shadow.querySelector('style[data-bandkit-page-corners="true"]')) {
        const style = document.createElement("style");
        style.dataset.bandkitPageCorners = "true";
        style.textContent = r.$pageCornerStyleText;
        shadow.append(style);
      }
      r.$pageCornerStyledRoots.add(shadow);
      r.$pageCornerShadowObserver?.observe(shadow, { childList: true, subtree: true });
    };
r.$syncPageCornerShadowRoots = function syncPageCornerShadowRoots(remove = false) {
      if (remove) {
        const visit = (root) => {
          for (const host of root.querySelectorAll("*")) {
            const shadow = host.shadowRoot;
            if (!shadow) continue;
            shadow.querySelector('style[data-bandkit-page-corners="true"]')?.remove();
            visit(shadow);
          }
        };
        visit(document);
        return;
      }
      const styled = r.$pageCornerStyledRoots;
      const pending = r.$pageCornerPendingHosts;
      r.$pageCornerLastFullScan = Date.now();
      const roots = collectShadowRoots(document, { styled, pending });
      promotePendingHosts(pending, { styled, roots });
      for (const shadow of roots) r.$stylePageCornerRoot(shadow);
    };
r.$syncPageCornerShadowRootsIn = function syncPageCornerShadowRootsIn(nodes) {
      const styled = r.$pageCornerStyledRoots;
      const pending = r.$pageCornerPendingHosts;
      const roots = [];
      for (const node of nodes) {
        if (!node.isConnected) continue;
        collectShadowRoots(node, { styled, pending, roots });
      }
      promotePendingHosts(pending, { styled, roots });
      for (const shadow of roots) r.$stylePageCornerRoot(shadow);
    };
// Walking only the inserted subtrees misses a shadow root attached to an
// element that was already in the document, which no childList mutation
// reports. A rescan bounded to this interval restores that discovery without
// returning to a full document traversal on every mutation.
r.$PAGE_CORNER_RESCAN_INTERVAL_MS = 2000;
r.$schedulePageCornerShadowSync = function schedulePageCornerShadowSync(records) {
      if (records) collectCornerMutationRoots(records, r.$pageCornerPendingRoots);
      if (r.$pageCornerShadowFrame) return;
      r.$pageCornerShadowFrame = requestAnimationFrame(() => {
        r.$pageCornerShadowFrame = 0;
        const queued = [...r.$pageCornerPendingRoots];
        r.$pageCornerPendingRoots.clear();
        // A full rescan skips roots it has already styled, so queued subtrees are
        // still handled separately: they can contain roots nested inside one.
        const due = Date.now() - r.$pageCornerLastFullScan >= r.$PAGE_CORNER_RESCAN_INTERVAL_MS;
        if (queued.length) r.$syncPageCornerShadowRootsIn(queued);
        if (due || !queued.length) r.$syncPageCornerShadowRoots();
      });
    };
}

function setupAppearance1(r) {
  r.$pageCornerShadowFrame = 0;
  r.$pageCornerLastFullScan = 0;
  r.$pageCornerStyledRoots = new WeakSet();
  r.$pageCornerPendingHosts = new Set();
  r.$pageCornerPendingRoots = new Set();
  r.$pageCornerShadowObserver = new MutationObserver(r.$schedulePageCornerShadowSync);
  r.$pageCornerShadowObserver.observe(document.body, { childList: true, subtree: true });
  r.$syncPageCornerShadowRoots();
  // Custom elements defined after their host was inserted attach a shadow root
  // without a childList mutation, so a few bounded settle passes stand in for
  // the old rescan-on-every-mutation behaviour.
  const settleTimers = [100, 500, 1500].map((delay) => window.setTimeout(() => r.$syncPageCornerShadowRoots(), delay));
  // Scheduling runs on an animation frame, which a hidden tab never fires, so a
  // root that appears while hidden is only discovered once the tab is shown.
  const syncOnVisible = () => { if (!document.hidden) r.$syncPageCornerShadowRoots(); };
  document.addEventListener("visibilitychange", syncOnVisible);
  r.$app.registerCleanup(() => {
    document.removeEventListener("visibilitychange", syncOnVisible);
    settleTimers.forEach((timer) => window.clearTimeout(timer));
    r.$pageCornerShadowObserver?.disconnect();
    window.cancelAnimationFrame(r.$pageCornerShadowFrame);
    r.$syncPageCornerShadowRoots(true);
  });
}

export const registerAppearance = [registerAppearance2, registerAppearance3, registerAppearance4, registerAppearance5];

export const setupAppearance = [setupAppearance1];
