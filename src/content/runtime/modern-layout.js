import { discoverGenrePalette } from "../discover-colours.js";
import { runtimeState } from "./context.js";
import { asset } from "../core.js";
import { accessibleControlPalette, accessibleScrubberPalette, colorString, contrast, luminance, mixColor, parseColor, readableColor } from "../color.js";
import { BUILT_IN_THEMES } from "../state.js";
import { appearanceVisualizerColourDefaults, resolvedVisualizerColors, visualizerThemeVariables } from "../visualizer-theme.js";
import { registerModernReleaseLayout } from "./modern-release-layout.js";
function registerModernLayoutPurchases(r) {
r.$prepareModernPurchaseActions = function prepareModernPurchaseActions(purchaseList) {
      for (const item of purchaseList.querySelectorAll(":scope > .buyItem")) {
        const mainAction = item.querySelector(".compound-button.main-button");
        const buyControl = mainAction?.querySelector("button.buy-link, a.buy-link, button, a");
        const giftEntries = [...item.querySelectorAll(".compound-button.send-as-gift")]
          .map((action) => ({
            action,
            control: action.querySelector("button, a")
          }))
          .filter((entry) => entry.control)
          .map((entry) => ({
            ...entry,
            ariaLabel: entry.control.getAttribute("aria-label"),
            title: entry.control.getAttribute("title"),
            icon: entry.action.style.getPropertyValue("--bandkit-gift-icon"),
            iconPriority: entry.action.style.getPropertyPriority("--bandkit-gift-icon")
          }));
        const restoreGiftControls = () => {
          for (const { action, control, ariaLabel, title, icon, iconPriority } of giftEntries) {
            action.classList.remove("bandkit-modern-gift-action");
            control.classList.remove("bandkit-modern-gift-control");
            if (ariaLabel === null) control.removeAttribute("aria-label");
            else control.setAttribute("aria-label", ariaLabel);
            if (title === null) control.removeAttribute("title");
            else control.setAttribute("title", title);
            if (icon) action.style.setProperty("--bandkit-gift-icon", icon, iconPriority);
            else action.style.removeProperty("--bandkit-gift-icon");
          }
        };
        for (const { action, control } of giftEntries) {
          action.classList.add("bandkit-modern-gift-action");
          action.style.setProperty("--bandkit-gift-icon", `url('${asset("icon-gift.svg")}')`);
          control.classList.add("bandkit-modern-gift-control");
          control.setAttribute("aria-label", "Send as gift");
          control.title = "Send as gift";
        }
        if (!mainAction || !buyControl) {
          if (giftEntries.length) r.$modernReleaseCleanups.push(restoreGiftControls);
          continue;
        }
        const actionRow = r.$createModernReleaseShell("div", "bandkit-modern-purchase-actions");
        item.append(actionRow);
        r.$moveModernReleaseNode(mainAction, actionRow);
        mainAction.classList.add("bandkit-modern-buy-card");
        buyControl.classList.add("bandkit-modern-buy-control");
        const buyAriaLabel = buyControl.getAttribute("aria-label");
        const isTrackPurchase = item.classList.contains("digital")
          && r.$getBandcampPageData()?.tralbum?.current?.type === "track";
        mainAction.classList.toggle("is-track-purchase", isTrackPurchase);
        if (isTrackPurchase) buyControl.setAttribute("aria-label", "Buy");
        const labelNodes = [...buyControl.childNodes];
        const label = r.$createModernReleaseShell("span", "bandkit-modern-buy-label");
        buyControl.append(label);
        for (const node of labelNodes) r.$moveModernReleaseNode(node, label);
        const detailNodes = [...mainAction.children].filter((node) => node !== buyControl);
        const details = r.$createModernReleaseShell("span", "bandkit-modern-buy-details");
        mainAction.append(details);
        for (const node of detailNodes) r.$moveModernReleaseNode(node, details);
        const discount = [...item.querySelectorAll(":scope > [class*='discount' i], :scope > .ft > [class*='discount' i]")]
          .find((node) => node !== mainAction && !mainAction.contains(node));
        if (discount) r.$moveModernReleaseNode(discount, details);
        const detailTextRestores = [];
        const detailText = document.createTreeWalker(details, window.NodeFilter.SHOW_TEXT);
        while (detailText.nextNode()) {
          const node = detailText.currentNode;
          const compactText = node.nodeValue.replace(/\bor\s+more\b/gi, "+");
          if (compactText === node.nodeValue) continue;
          detailTextRestores.push([node, node.nodeValue]);
          node.nodeValue = compactText;
        }
        for (const { action } of giftEntries) r.$moveModernReleaseNode(action, actionRow);
        r.$modernReleaseCleanups.push(() => {
          mainAction.classList.remove("bandkit-modern-buy-card");
          mainAction.classList.remove("is-track-purchase");
          buyControl.classList.remove("bandkit-modern-buy-control");
          if (buyAriaLabel === null) buyControl.removeAttribute("aria-label");
          else buyControl.setAttribute("aria-label", buyAriaLabel);
          restoreGiftControls();
          for (const [node, text] of detailTextRestores) node.nodeValue = text;
        });
      }
    };
}
function registerModernLayoutSupporters(r) {
r.$prepareModernSupporters = function prepareModernSupporters(releaseBody) {
      const supporters = document.querySelector(".middleColumn > .collected-by, .collected-by.tralbum.collectors");
      if (supporters) {
        r.$moveModernReleaseNode(supporters, releaseBody);
        const profileSection = releaseBody.querySelector(":scope > .bandkit-modern-profile-section");
        if (profileSection) profileSection.after(supporters);
        else releaseBody.prepend(supporters);
        supporters.dataset.bandkitExpanded = "false";
        const minimizeSupporters = r.$createModernReleaseShell("button", "bandkit-modern-supporters-toggle");
        minimizeSupporters.type = "button";
        minimizeSupporters.textContent = "Minimize";
        minimizeSupporters.hidden = true;
        minimizeSupporters.setAttribute("aria-expanded", "false");
        supporters.append(minimizeSupporters);
        const supporterDetails = supporters.querySelector(".deets");
        if (supporterDetails) {
          const reviews = r.$createModernReleaseShell("div", "bandkit-modern-supporter-reviews");
          const supporterGrid = r.$createModernReleaseShell("div", "bandkit-modern-supporter-grid");
          supporterDetails.append(reviews, supporterGrid);
          for (const review of supporterDetails.querySelectorAll(":scope > .writing")) {
            r.$moveModernReleaseNode(review, reviews);
          }
          for (const selector of [":scope > .no-writing", ":scope > .more-thumbs"]) {
            const node = supporterDetails.querySelector(selector);
            if (node) r.$moveModernReleaseNode(node, supporterGrid);
          }
          const reviewItems = [...reviews.querySelectorAll(":scope > .writing")];
          let activeReview = 0;
          const showReview = (index) => {
            activeReview = (index + reviewItems.length) % reviewItems.length;
            reviewItems.forEach((review, reviewIndex) => {
              const active = reviewIndex === activeReview;
              review.classList.toggle("is-active", active);
              review.setAttribute("aria-hidden", String(!active));
            });
          };
          const stopReviewRotation = () => {
            if (r.$modernReleaseSupporterTimer) window.clearInterval(r.$modernReleaseSupporterTimer);
            r.$modernReleaseSupporterTimer = null;
          };
          const startReviewRotation = () => {
            stopReviewRotation();
            if (!reviewItems.length) return;
            showReview(activeReview);
            if (reviewItems.length > 1) {
              r.$modernReleaseSupporterTimer = window.setInterval(() => showReview(activeReview + 1), 6500);
            }
          };
          startReviewRotation();
          const moreSupporters = supporterGrid.querySelector(":scope > .more-thumbs");
          const avatarGrid = supporterGrid.querySelector(":scope > .no-writing");
          let supporterLayoutFrame = 0;
          const syncCompactSupporters = () => {
            if (!avatarGrid) return;
            const avatars = [...avatarGrid.querySelectorAll(":scope > .fan.pic")];
            const firstAvatar = avatars[0];
            if (!firstAvatar) return;
            const styles = getComputedStyle(avatarGrid);
            const gap = Number.parseFloat(styles.columnGap) || 8;
            const avatarWidth = firstAvatar.getBoundingClientRect().width || 42;
            const columns = Math.max(1, Math.floor((avatarGrid.clientWidth + gap) / (avatarWidth + gap)));
            const compactLimit = columns * 2;
            avatars.forEach((avatar, index) => {
              avatar.classList.toggle("bandkit-modern-supporter-overflow", index >= compactLimit);
            });
          };
          const scheduleCompactSupporters = () => {
            window.cancelAnimationFrame(supporterLayoutFrame);
            supporterLayoutFrame = window.requestAnimationFrame(syncCompactSupporters);
          };
          const supporterResizeObserver = new ResizeObserver(scheduleCompactSupporters);
          const supporterMutationObserver = new MutationObserver(scheduleCompactSupporters);
          if (avatarGrid) {
            supporterResizeObserver.observe(avatarGrid);
            supporterMutationObserver.observe(avatarGrid, { childList: true });
            scheduleCompactSupporters();
          }
          const setExpanded = (expanded) => {
            supporters.dataset.bandkitExpanded = String(expanded);
            minimizeSupporters.hidden = !expanded;
            minimizeSupporters.setAttribute("aria-expanded", String(expanded));
            moreSupporters?.setAttribute("aria-expanded", String(expanded));
            if (expanded) {
              stopReviewRotation();
              reviewItems.forEach((review) => review.setAttribute("aria-hidden", "false"));
            } else {
              startReviewRotation();
            }
          };
          const expandSupporters = () => setExpanded(true);
          const collapseSupporters = () => setExpanded(false);
          moreSupporters?.addEventListener("click", expandSupporters);
          minimizeSupporters.addEventListener("click", collapseSupporters);
          r.$modernReleaseCleanups.push(() => {
            stopReviewRotation();
            moreSupporters?.removeEventListener("click", expandSupporters);
            minimizeSupporters.removeEventListener("click", collapseSupporters);
            reviewItems.forEach((review) => {
              review.classList.remove("is-active");
              review.removeAttribute("aria-hidden");
            });
            window.cancelAnimationFrame(supporterLayoutFrame);
            supporterResizeObserver.disconnect();
            supporterMutationObserver.disconnect();
            avatarGrid?.querySelectorAll(".bandkit-modern-supporter-overflow").forEach((avatar) => {
              avatar.classList.remove("bandkit-modern-supporter-overflow");
            });
            delete supporters.dataset.bandkitExpanded;
          });
        }
      }
      return supporters;
    };
r.$prepareModernDiscography = function prepareModernDiscography() {
      const discography = document.querySelector("#discography");
      if (!discography) return null;
      const heading = discography.querySelector(":scope > h3.title");
      const headingLink = heading?.querySelector("a");
      const headingText = headingLink?.textContent || "";
      heading?.classList.add("bandkit-modern-section-title");
      if (headingLink) headingLink.textContent = "Discography";
      const showMore = discography.querySelector(":scope > .showMore");
      const showMoreLink = showMore?.querySelector("a[href]");
      const releaseItems = [...(discography.querySelector(":scope > ul")?.children || [])]
        .filter((item) => item.matches("li"));
      const extraReleases = releaseItems.slice(3);
      const moreLabel = showMoreLink?.textContent || "more releases...";
      const setExpanded = (expanded) => {
        discography.classList.toggle("bandkit-modern-discography-expanded", expanded);
        showMoreLink?.setAttribute("aria-expanded", String(expanded));
        if (showMoreLink) showMoreLink.textContent = expanded ? "fewer releases..." : moreLabel;
      };
      const toggleExtraReleases = (event) => {
        if (!extraReleases.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setExpanded(!discography.classList.contains("bandkit-modern-discography-expanded"));
      };
      showMore?.classList.add("bandkit-modern-discography-more-link");
      showMoreLink?.addEventListener("click", toggleExtraReleases, true);
      if (showMoreLink && extraReleases.length) setExpanded(false);
      r.$modernReleaseCleanups.push(() => {
        showMoreLink?.removeEventListener("click", toggleExtraReleases, true);
        discography.classList.remove("bandkit-modern-discography-expanded");
        showMoreLink?.removeAttribute("aria-expanded");
        if (showMoreLink) showMoreLink.textContent = moreLabel;
        heading?.classList.remove("bandkit-modern-section-title");
        if (headingLink) headingLink.textContent = headingText;
        showMore?.classList.remove("bandkit-modern-discography-more-link");
      });
      return discography;
    };
r.$prepareModernReleaseProfile = function prepareModernReleaseProfile(releaseBody, artistCard, discography) {
      if (!artistCard && !discography) return null;
      const section = r.$createModernReleaseShell("section", "bandkit-modern-profile-section");
      if (artistCard) {
        const artistColumn = r.$createModernReleaseShell("section", "bandkit-modern-profile-column bandkit-modern-artist-column");
        section.append(artistColumn);
        r.$moveModernReleaseNode(artistCard, artistColumn);
      }
      if (discography) {
        const discographyColumn = r.$createModernReleaseShell("section", "bandkit-modern-profile-column bandkit-modern-discography-column");
        section.append(discographyColumn);
        r.$moveModernReleaseNode(discography, discographyColumn);
      }
      section.classList.toggle("is-single", section.children.length === 1);
      releaseBody.append(section);
      return section;
    };
r.$prepareModernReleaseInfo = function prepareModernReleaseInfo(releaseBody, rightColumn) {
      const shows = rightColumn.querySelector(":scope > #showography");
      const contactHeading = rightColumn.querySelector(":scope > #contact-help");
      if (!shows && !contactHeading) return null;
      const section = r.$createModernReleaseShell("section", "bandkit-modern-info-section");
      if (shows) {
        const showsColumn = r.$createModernReleaseShell("section", "bandkit-modern-info-column bandkit-modern-shows-column", "Shows");
        section.append(showsColumn);
        r.$moveModernReleaseNode(shows, showsColumn);
      }
      if (contactHeading) {
        const contactColumn = r.$createModernReleaseShell("section", "bandkit-modern-info-column bandkit-modern-contact-column", "Contact & help");
        section.append(contactColumn);
        const contactNodes = [contactHeading];
        let next = contactHeading.nextElementSibling;
        while (next?.matches("p")) {
          contactNodes.push(next);
          next = next.nextElementSibling;
        }
        for (const node of contactNodes) r.$moveModernReleaseNode(node, contactColumn);
      }
      section.classList.toggle("is-single", section.children.length === 1);
      releaseBody.append(section);
      return section;
    };
}
function registerModernLayout2(r) {
r.$restoreModernReleaseLayout = function restoreModernReleaseLayout() {
      if (!r.$modernReleaseLayoutPrepared) return;
      if (r.$modernReleaseSupporterTimer) window.clearInterval(r.$modernReleaseSupporterTimer);
      r.$modernReleaseSupporterTimer = null;
      for (const cleanup of [...r.$modernReleaseCleanups].reverse()) cleanup();
      r.$modernReleaseCleanups = [];
      for (const { node, marker } of [...r.$modernReleaseMoveRecords].reverse()) {
        if (marker.isConnected) marker.replaceWith(node);
      }
      for (const shell of [...r.$modernReleaseShells].reverse()) shell.remove();
      r.$modernReleaseMoveRecords = [];
      r.$modernReleaseShells = [];
      r.$modernReleaseLayoutPrepared = false;
    };
r.$captureModernReleasePalette = function captureModernReleasePalette() {
      const fallbackBackground = { r: 255, g: 255, b: 255, a: 1 };
      const fallbackText = { r: 17, g: 24, b: 39, a: 1 };
      const background = r.$firstComputedColor(["body"], "backgroundColor") || fallbackBackground;
      const surface = r.$firstComputedColor(["#pgBd", "main", "body"], "backgroundColor") || background;
      const surfaceRaised = r.$firstComputedColor([".story-innards", ".collection-item-container", ".track_row_view", ".discover-player", "section.floating-player"], "backgroundColor") || surface;
      const text = r.$firstComputedColor([".primaryText", "#name-section .trackTitle", ".collection-item-title", ".story", "#pgBd", "body"], "color") || fallbackText;
      const secondary = r.$firstComputedColor([".secondaryText", ".collection-item-artist", ".story-date", ".track-number", ".time"], "color") || text;
      const link = r.$firstComputedColor(["#trackInfo a:not(.notSkinnable)", "#name-section a", "#community a", "#music-grid a", ".story a", "#rightColumn a", "a"], "color") || text;
      const navbar = r.$firstComputedColor(["#band-navbar"], "backgroundColor") || surface;
      const navbarText = r.$firstComputedColor(["#band-navbar a.active", "#band-navbar a"], "color") || text;
      const footerBackground = r.$firstComputedColor(["#pgFt", "#recommendations_container"], "backgroundColor") || background;
      const dark = luminance(surface) < 0.34;
      const white = { r: 255, g: 255, b: 255, a: 1 };
      const black = { r: 17, g: 24, b: 39, a: 1 };
      return {
        background,
        surface,
        surfaceRaised,
        text,
        secondary,
        link,
        navbar,
        navbarText,
        footerBackground,
        line: { ...text, a: dark ? 0.24 : 0.18 },
        accentSoft: { ...link, a: dark ? 0.16 : 0.1 },
        onAccent: contrast(link, white) >= contrast(link, black) ? white : black,
        preserveArtistColors: true,
        scheme: dark ? "dark" : "light"
      };
    };
r.$modernArtistForeground = function modernArtistForeground(preferred, background, minimum = 4.5) {
      if (contrast(preferred, background) >= minimum) return preferred;
      const channels = [preferred.r, preferred.g, preferred.b];
      const chroma = Math.max(...channels) - Math.min(...channels);
      const distance = Math.sqrt(
        ((preferred.r - background.r) ** 2)
        + ((preferred.g - background.g) ** 2)
        + ((preferred.b - background.b) ** 2)
      );

      // Modern Pages is primarily a layout option. Keep deliberate, strongly
      // chromatic artist colours (for example yellow secondary text on a blue
      // page) instead of normalising them into a different-looking hue. The
      // accessibility rescue remains active for near-invisible neutral colours,
      // which is the common failure mode on black artist themes.
      if (chroma >= 48 && distance >= 110) return preferred;
      return readableColor(preferred, [background], minimum).color;
    };
r.$accessibleModernPagePalette = function accessibleModernPagePalette(palette) {
      const white = { r: 255, g: 255, b: 255, a: 1 };
      const black = { r: 17, g: 24, b: 39, a: 1 };
      const opaque = (color, background) => {
        const source = color || background;
        const alpha = Math.max(0, Math.min(1, Number(source?.a ?? 1)));
        return alpha >= 0.999 ? { ...source, a: 1 } : mixColor(background, source, alpha);
      };
      const background = opaque(palette.background || white, white);
      const surface = opaque(palette.surface || background, background);
      const surfaceRaised = opaque(palette.surfaceRaised || surface, surface);
      const navbar = opaque(palette.navbar || surface, surface);
      const footerBackground = opaque(palette.footerBackground || background, background);
      const preferredText = palette.text || (luminance(surface) < 0.34 ? white : black);
      const preferredMuted = palette.secondary || preferredText;
      const preferredAccent = palette.link || preferredText;
      const foreground = (preferred, on, minimum = 7) => (
        readableColor(opaque(preferred, on), [on], minimum).color
      );
      const line = (on) => foreground(palette.line || { ...preferredText, a: 0.24 }, on, 3);
      const onAccent = (accent) => contrast(accent, white) >= contrast(accent, black) ? white : black;
      const role = (on) => {
        const text = foreground(preferredText, on);
        const secondary = palette.preserveArtistColors
          ? r.$modernArtistForeground(opaque(preferredMuted, on), on, 4.5)
          : foreground(preferredMuted, on, 4.5);
        const link = palette.preserveArtistColors
          ? r.$modernArtistForeground(opaque(preferredAccent, on), on, 4.5)
          : foreground(preferredAccent, on, 4.5);
        return {
          text,
          secondary,
          link,
          line: line(on),
          accentSoft: { ...link, a: luminance(on) < 0.34 ? 0.18 : 0.12 },
          onAccent: onAccent(link)
        };
      };
      const surfaceRole = role(surface);
      const raisedRole = role(surfaceRaised);
      const footerRole = role(footerBackground);
      const navbarText = foreground(palette.navbarText || preferredText, navbar);
      const navbarAccent = palette.preserveArtistColors
        ? r.$modernArtistForeground(opaque(preferredAccent, navbar), navbar, 3)
        : foreground(preferredAccent, navbar, 3);
      return {
        ...palette,
        background,
        surface,
        surfaceRaised,
        navbar,
        footerBackground,
        text: surfaceRole.text,
        secondary: surfaceRole.secondary,
        link: surfaceRole.link,
        line: surfaceRole.line,
        accentSoft: surfaceRole.accentSoft,
        onAccent: surfaceRole.onAccent,
        backgroundText: foreground(preferredText, background),
        raisedText: raisedRole.text,
        raisedSecondary: raisedRole.secondary,
        raisedLink: raisedRole.link,
        raisedLine: raisedRole.line,
        raisedAccentSoft: raisedRole.accentSoft,
        raisedOnAccent: raisedRole.onAccent,
        footerText: footerRole.text,
        footerSecondary: footerRole.secondary,
        footerLink: footerRole.link,
        footerLine: footerRole.line,
        footerAccentSoft: footerRole.accentSoft,
        footerOnAccent: footerRole.onAccent,
        navbarText,
        navbarAccent,
        navbarLine: line(navbar),
        scheme: luminance(background) < 0.34 ? "dark" : "light"
      };
    };
r.$setModernReleasePalette = function setModernReleasePalette(palette) {
      const variables = {
        "--bandkit-release-bg": colorString(palette.background),
        "--bandkit-release-surface": colorString(palette.surface),
        "--bandkit-release-surface-raised": colorString(palette.surfaceRaised || palette.surface),
        "--bandkit-release-background-ink": colorString(palette.backgroundText || palette.text),
        "--bandkit-release-ink": colorString(palette.text),
        "--bandkit-release-muted": colorString(palette.secondary),
        "--bandkit-release-line": colorString(palette.line),
        "--bandkit-release-accent": colorString(palette.link),
        "--bandkit-release-accent-soft": colorString(palette.accentSoft),
        "--bandkit-release-on-accent": colorString(palette.onAccent || palette.surface),
        "--bandkit-release-raised-ink": colorString(palette.raisedText || palette.text),
        "--bandkit-release-raised-muted": colorString(palette.raisedSecondary || palette.secondary),
        "--bandkit-release-raised-line": colorString(palette.raisedLine || palette.line),
        "--bandkit-release-raised-accent": colorString(palette.raisedLink || palette.link),
        "--bandkit-release-raised-accent-soft": colorString(palette.raisedAccentSoft || palette.accentSoft),
        "--bandkit-release-raised-on-accent": colorString(palette.raisedOnAccent || palette.onAccent || palette.surface),
        "--bandkit-release-navbar": colorString(palette.navbar),
        "--bandkit-release-navbar-text": colorString(palette.navbarText),
        "--bandkit-release-navbar-accent": colorString(palette.navbarAccent || palette.link),
        "--bandkit-release-navbar-line": colorString(palette.navbarLine || palette.line),
        "--bandkit-release-footer-bg": colorString(palette.footerBackground || palette.background),
        "--bandkit-release-footer-ink": colorString(palette.footerText || palette.text),
        "--bandkit-release-footer-muted": colorString(palette.footerSecondary || palette.secondary),
        "--bandkit-release-footer-line": colorString(palette.footerLine || palette.line),
        "--bandkit-release-footer-accent": colorString(palette.footerLink || palette.link),
        "--bandkit-release-footer-accent-soft": colorString(palette.footerAccentSoft || palette.accentSoft),
        "--bandkit-release-footer-on-accent": colorString(palette.footerOnAccent || palette.onAccent || palette.background),
        "--bandkit-release-scheme": palette.scheme
      };
      for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
    };
}

function bandcampFeedPalette(palette) {
  const accent = { r: 29, g: 160, b: 195, a: 1 };
  const accentSoft = { ...accent, a: palette.scheme === "dark" ? 0.18 : 0.12 };
  return { ...palette, link: accent, accentSoft, raisedLink: accent, raisedAccentSoft: accentSoft };
}

function pageAwareThemeSource(r) {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 17, g: 24, b: 39, a: 1 };
  const genre = discoverGenrePalette();
  const pageBackground = genre?.background || r.$firstComputedColor(["#pgBd", "#pgBdWrapper", ".page-bg", "body"], "backgroundColor") || white;
  const pageText = genre?.text || r.$firstComputedColor([".primaryText", "#name-section .title", ".track-title", "#pgBd", "body"], "color") || black;
  const pageSecondary = genre?.text || r.$firstComputedColor([".secondaryText", ".track-number", ".time", "body"], "color");
  const pageAccent = genre?.accent || r.$firstComputedColor(["a.primaryText", ".download-link", ".buy-link", "#track_table a", "a"], "color") || { r: 29, g: 160, b: 195, a: 1 };
  const darkPage = luminance(pageBackground) < 0.34;
  const panelColor = mixColor(pageBackground, darkPage ? white : black, darkPage ? 0.07 : 0.045);
  panelColor.a = 1;
  const panelCss = colorString(panelColor);
  const signature = [pageBackground, pageText, pageSecondary, pageAccent]
    .map((color) => color ? colorString(color) : "")
    .join("|");
  return { darkPage, pageAccent, pageSecondary, pageText, panelColor, panelCss, signature };
}

function syncPageAwareTheme(r) {
  if (!runtimeState.appearance.pageAware) return;
  const source = pageAwareThemeSource(r);
  const appliedPanel = r.$host.style.getPropertyValue("--hub-panel").trim();
  if (r.$pageAwareThemeSignature === source.signature && appliedPanel === source.panelCss) return;
  r.$updateThemeFromPage(source);
}

function setModernPageDataset(pageType) {
  document.documentElement.dataset.bandkitModernPage = "true";
  document.documentElement.dataset.bandkitModernPageType = pageType;
}

function registerModernLayout3(r) {
r.$themedModernReleasePalette = function themedModernReleasePalette(palette) {
      if (runtimeState.appearance.pageAware && !runtimeState.appearance.applyToPage) {
        return {
          ...palette,
          surfaceRaised: palette.surface,
          footerBackground: palette.background
        };
      }
      if (!runtimeState.appearance.applyToPage) return palette;
      const theme = r.$accessibleAppearanceTheme();
      const dark = luminance(theme.background) < 0.34;
      return {
        ...palette,
        background: theme.background,
        surface: theme.pageSurface,
        surfaceRaised: theme.card,
        text: theme.text,
        secondary: theme.muted,
        link: theme.accent,
        navbar: theme.navbar,
        navbarText: theme.navbarText,
        footerBackground: theme.background,
        line: theme.border,
        accentSoft: { ...theme.accent, a: dark ? 0.16 : 0.1 },
        onAccent: theme.onAccent,
        preserveArtistColors: false,
        scheme: dark ? "dark" : "light"
      };
    };
r.$clearModernReleasePalette = function clearModernReleasePalette() {
      for (const name of [
        "--bandkit-release-bg", "--bandkit-release-surface", "--bandkit-release-surface-raised",
        "--bandkit-release-background-ink",
        "--bandkit-release-ink", "--bandkit-release-muted", "--bandkit-release-line",
        "--bandkit-release-accent", "--bandkit-release-accent-soft", "--bandkit-release-on-accent",
        "--bandkit-release-raised-ink", "--bandkit-release-raised-muted", "--bandkit-release-raised-line",
        "--bandkit-release-raised-accent", "--bandkit-release-raised-accent-soft", "--bandkit-release-raised-on-accent",
        "--bandkit-release-navbar", "--bandkit-release-navbar-text", "--bandkit-release-navbar-accent", "--bandkit-release-navbar-line",
        "--bandkit-release-footer-bg", "--bandkit-release-footer-ink", "--bandkit-release-footer-muted",
        "--bandkit-release-footer-line", "--bandkit-release-footer-accent", "--bandkit-release-footer-accent-soft",
        "--bandkit-release-footer-on-accent",
        "--bandkit-release-scheme"
      ]) document.documentElement.style.removeProperty(name);
    };
r.$applyModernReleaseLayout = function applyModernReleaseLayout() {
      const pageType = r.$modernBandcampPageType();
      const modernStyling = Boolean(runtimeState.appearance.modernReleasePages);
      const enabled = Boolean(modernStyling && pageType);
      document.documentElement.dataset.bandkitModernStyling = String(modernStyling);
      if (enabled) {
        if (!r.$modernReleasePalette) r.$modernReleasePalette = r.$captureModernReleasePalette();
        if (pageType === "release") r.$prepareModernReleaseLayout();
        else r.$restoreModernReleaseLayout();
        if (r.$modernReleasePalette) {
          const palette = r.$accessibleModernPagePalette(r.$themedModernReleasePalette(r.$modernReleasePalette));
          r.$setModernReleasePalette(pageType === "feed" && !runtimeState.appearance.applyToPage
            ? bandcampFeedPalette(palette)
            : palette);
        }
        setModernPageDataset(pageType);
        document.documentElement.dataset.bandkitModernRelease = String(pageType === "release");
        return;
      }
      document.documentElement.dataset.bandkitModernPage = "false";
      delete document.documentElement.dataset.bandkitModernPageType;
      document.documentElement.dataset.bandkitModernRelease = "false";
      r.$restoreModernReleaseLayout();
      r.$clearModernReleasePalette();
    };
r.$firstComputedColor = function firstComputedColor(selectors, property) {
      for (const selector of selectors) {
        const element = selector === "body" ? document.body : document.querySelector(selector);
        if (!element || r.$host.contains(element)) continue;
        const parsed = parseColor(getComputedStyle(element)[property]);
        if (parsed && parsed.a > 0.05) return parsed;
      }
      return null;
    };
r.$setThemeVariables = function setThemeVariables(variables) {
      r.$pageActionThemeCache = null;
      for (const [name, value] of Object.entries(variables)) {
        r.$host.style.setProperty(name, value);
        for (const button of document.querySelectorAll(".bandkit-discover-tracklist, .bandcamp-hub-page-dj, .bandcamp-hub-page-overflow, .bandcamp-hub-page-playlist, .bandcamp-hub-page-cart, .bandcamp-hub-page-buy, .bandkit-modern-release-actions, .inline_player .play_cell > a, #track_table .play-col > a, .bandkit-page-skip-control, #DiscoverApp .results-grid-item .image-container > .play-pause-button, #DiscoverApp .results-grid-item .image-container > .play-button, #DiscoverApp .focused-result > .artwork-play-button, #DiscoverApp .focused-result > .play-pause-button, #DiscoverApp .focused-result > .play-button, #DiscoverApp .discover-detail > .play-pause-button, #DiscoverApp .discover-detail > .play-button")) button.style.setProperty(name, value);
      }
      for (const [panelRole, sourceRole] of Object.entries({
        "--hub-panel-accent": "--hub-accent",
        "--hub-panel-accent-soft": "--hub-accent-soft",
        "--hub-panel-ink": "--hub-ink",
        "--hub-panel-muted": "--hub-muted",
        "--hub-panel-faint": "--hub-faint",
        "--hub-panel-line": "--hub-line",
        "--hub-panel-on-accent": "--hub-on-accent"
      })) r.$host.style.setProperty(panelRole, variables[sourceRole]);
      r.$syncPageDjTheme?.();
    };
r.$syncPageAwareTheme = function syncCurrentPageAwareTheme() { syncPageAwareTheme(r); };
r.$syncPageDjTheme = function syncPageDjTheme() {
      if (!r.$pageDjHost) return;
      const page = getComputedStyle(document.documentElement);
      const hub = getComputedStyle(r.$host);
      const first = (...names) => names.map((name) => page.getPropertyValue(name).trim()).find(Boolean) || "";
      const surface = first("--bandkit-release-surface", "--bandkit-page-surface") || hub.getPropertyValue("--hub-card");
      const ink = first("--bandkit-release-ink", "--bandkit-page-surface-text") || hub.getPropertyValue("--hub-ink");
      const muted = first("--bandkit-page-surface-muted", "--bandkit-release-muted") || hub.getPropertyValue("--hub-muted");
      const line = first("--bandkit-page-surface-border", "--bandkit-release-line") || hub.getPropertyValue("--hub-line");
      const accent = first("--bandkit-page-surface-accent", "--bandkit-release-accent") || hub.getPropertyValue("--hub-accent");
      const accentSoft = first("--bandkit-page-surface-accent-soft", "--bandkit-release-accent-soft") || hub.getPropertyValue("--hub-accent-soft");
      const onAccent = first("--bandkit-page-surface-on-accent", "--bandkit-release-on-accent") || hub.getPropertyValue("--hub-on-accent");
      for (const [name, value] of Object.entries({
        "--hub-panel": surface, "--hub-card": surface, "--hub-card-footer": surface,
        "--hub-header": surface, "--hub-wash": surface, "--hub-ink": ink,
        "--hub-card-ink": ink, "--hub-muted": muted, "--hub-card-muted": muted,
        "--hub-faint": muted, "--hub-card-faint": muted, "--hub-line": line,
        "--hub-card-line": line, "--hub-accent": accent, "--hub-card-accent": accent,
        "--hub-accent-soft": accentSoft, "--hub-card-accent-soft": accentSoft,
        "--hub-on-accent": onAccent, "--hub-card-on-accent": onAccent,
        "--hub-scrub-accent": accent, "--hub-scrub-remaining": line,
        "--hub-scrub-surface": surface
      })) r.$pageDjHost.style.setProperty(name, value);
    };
}

function registerModernLayout4(r) {
r.$accessibleSurfaceRole = function accessibleSurfaceRole(background, preferredText, preferredMuted, preferredAccent) {
      const white = { r: 255, g: 255, b: 255, a: 1 };
      const black = { r: 17, g: 24, b: 39, a: 1 };
      const opaque = (color) => {
        const source = color || black;
        const alpha = Math.max(0, Math.min(1, Number(source.a ?? 1)));
        return alpha >= 0.999 ? { ...source, a: 1 } : mixColor(background, source, alpha);
      };
      const text = readableColor(opaque(preferredText), [background], 7).color;
      const muted = readableColor(opaque(preferredMuted || preferredText), [background], 4.5).color;
      const accent = readableColor(opaque(preferredAccent || preferredText), [background], 4.5).color;
      const faint = readableColor(mixColor(muted, background, 0.25), [background], 4.5).color;
      const line = readableColor(mixColor(background, text, luminance(background) < 0.34 ? 0.24 : 0.16), [background], 3).color;
      const onAccent = contrast(accent, white) >= contrast(accent, black) ? white : black;
      return { text, muted, accent, faint, line, onAccent };
    };
r.$updateThemeFromPage = function updateThemeFromPage(source = pageAwareThemeSource(r)) {
      const { darkPage, pageAccent, pageSecondary, pageText, panelColor } = source;
      // Keep every Bandkit surface in one colour context, but lift it just far
      // enough from the page to preserve the player and panel boundaries.
      const cardColor = panelColor;
      const preferredMuted = pageSecondary || pageText;
      const panelRole = r.$accessibleSurfaceRole(panelColor, pageText, preferredMuted, pageAccent);
      const cardRole = r.$accessibleSurfaceRole(cardColor, pageText, preferredMuted, pageAccent);
      const cardFooterColor = panelColor;
      const cardFooterRole = r.$accessibleSurfaceRole(cardFooterColor, pageText, preferredMuted, pageAccent);
      const headerColor = panelColor;
      const headerRole = r.$accessibleSurfaceRole(headerColor, pageText, preferredMuted, pageAccent);
      const washColor = panelColor;
      const hoverColor = mixColor(cardColor, cardRole.accent, darkPage ? 0.22 : 0.12);
      const activeCardColor = mixColor(cardColor, cardRole.accent, 0.18);
      const controlPalette = accessibleControlPalette([panelColor, cardColor, activeCardColor], cardRole.accent);
      const scrubberPalette = accessibleScrubberPalette(cardRole.accent, cardColor);
      const scrubberRemaining = scrubberPalette.remaining;
      const themeVisualizerColours = appearanceVisualizerColourDefaults(runtimeState.appearance, [
        ...BUILT_IN_THEMES,
        ...(runtimeState.appearance.savedThemes || [])
      ]);
      const visualizerColors = resolvedVisualizerColors(
        [panelRole.accent, scrubberPalette.accent, mixColor(panelRole.accent, scrubberPalette.accent, 0.62)],
        runtimeState.appearance,
        themeVisualizerColours
      );

      const variables = {
        "--hub-accent": colorString(panelRole.accent),
        "--hub-accent-soft": colorString(panelRole.accent, darkPage ? 0.22 : 0.12),
        "--hub-ink": colorString(panelRole.text),
        "--hub-muted": colorString(panelRole.muted),
        "--hub-faint": colorString(panelRole.faint),
        "--hub-line": colorString(panelRole.line),
        "--hub-panel": colorString(panelColor),
        "--hub-card": colorString(cardColor),
        "--hub-card-accent": colorString(cardRole.accent),
        "--hub-card-accent-soft": colorString(cardRole.accent, luminance(cardColor) < 0.34 ? 0.22 : 0.12),
        "--hub-card-ink": colorString(cardRole.text),
        "--hub-card-muted": colorString(cardRole.muted),
        "--hub-card-faint": colorString(cardRole.faint),
        "--hub-card-line": colorString(cardRole.line),
        "--hub-card-on-accent": colorString(cardRole.onAccent),
        "--hub-card-footer": colorString(cardFooterColor),
        "--hub-card-footer-accent": colorString(cardFooterRole.accent),
        "--hub-card-footer-accent-soft": colorString(cardFooterRole.accent, luminance(cardFooterColor) < 0.34 ? 0.22 : 0.12),
        "--hub-card-footer-ink": colorString(cardFooterRole.text),
        "--hub-card-footer-muted": colorString(cardFooterRole.muted),
        "--hub-card-footer-faint": colorString(cardFooterRole.faint),
        "--hub-card-footer-line": colorString(cardFooterRole.line),
        "--hub-card-footer-on-accent": colorString(cardFooterRole.onAccent),
        "--hub-header": colorString(headerColor),
        "--hub-tab-foreground": colorString(headerRole.text),
        "--hub-tab-active-bg": colorString(headerRole.text, darkPage ? 0.16 : 0.08),
        "--hub-hover": colorString(hoverColor),
        "--hub-on-accent": colorString(panelRole.onAccent),
        "--hub-control-bg": colorString(controlPalette.background),
        "--hub-control-fg": colorString(controlPalette.foreground),
        "--hub-control-border": colorString(controlPalette.background),
        "--hub-control-focus": colorString(controlPalette.background),
        "--hub-scrub-accent": colorString(scrubberPalette.accent),
        "--hub-scrub-remaining": colorString(scrubberRemaining),
        "--hub-scrub-surface": colorString(scrubberPalette.surface),
        "--hub-scrub-halo": colorString(scrubberPalette.halo, 0.62),
        "--hub-wash": colorString(washColor)
      }; Object.assign(variables, visualizerThemeVariables(visualizerColors, darkPage));
      if (r.$modernBandcampPageType() === "feed" && !runtimeState.appearance.applyToPage) {
        const feedAccent = colorString({ r: 29, g: 160, b: 195, a: 1 });
        const feedAccentSoft = colorString({ r: 29, g: 160, b: 195, a: darkPage ? 0.22 : 0.12 });
        Object.assign(variables, {
          "--hub-accent": feedAccent,
          "--hub-accent-soft": feedAccentSoft,
          "--hub-card-accent": feedAccent,
          "--hub-card-accent-soft": feedAccentSoft,
          "--hub-card-footer-accent": feedAccent,
          "--hub-card-footer-accent-soft": feedAccentSoft,
          "--hub-control-bg": feedAccent,
          "--hub-control-border": feedAccent,
          "--hub-control-focus": feedAccent,
          "--hub-scrub-accent": feedAccent,
          ...visualizerThemeVariables(resolvedVisualizerColors(
            [feedAccent, feedAccent, feedAccent], runtimeState.appearance, themeVisualizerColours
          ), darkPage)
        });
      }
      r.$setThemeVariables(variables);
      r.$pageAwareThemeSignature = source.signature;
    };
}

function registerModernLayout5(r) {
r.$applySelectedTheme = function applySelectedTheme() {
      const accessible = r.$accessibleAppearanceTheme();
      const surface = accessible.panel;
      const accent = accessible.panelAccent;
      const dark = luminance(surface) < 0.34;
      const ink = accessible.panelText;
      const card = accessible.card;
      const muted = accessible.panelMuted;
      const panelRole = r.$accessibleSurfaceRole(surface, ink, muted, accent);
      const cardRole = r.$accessibleSurfaceRole(card, accessible.cardText, accessible.cardMuted, accessible.cardAccent);
      const cardFooter = mixColor(card, surface, 0.12);
      const cardFooterRole = r.$accessibleSurfaceRole(cardFooter, accessible.cardText, accessible.cardMuted, accessible.cardAccent);
      const header = surface;
      const headerRole = r.$accessibleSurfaceRole(header, ink, muted, accent);
      const activeCard = mixColor(card, cardRole.accent, 0.18);
      const controlPalette = accessibleControlPalette([surface, card, activeCard], cardRole.accent);
      const scrubberPalette = accessibleScrubberPalette(accessible.preferredScrubAccent, card);
      const scrubberRemaining = scrubberPalette.remaining; r.$setThemeVariables({
        "--hub-accent": colorString(panelRole.accent),
        "--hub-accent-soft": colorString(panelRole.accent, dark ? 0.24 : 0.13),
        "--hub-ink": colorString(panelRole.text),
        "--hub-muted": colorString(panelRole.muted),
        "--hub-faint": colorString(panelRole.faint),
        "--hub-line": colorString(panelRole.line),
        "--hub-panel": colorString(surface),
        "--hub-card": colorString(card),
        "--hub-card-accent": colorString(cardRole.accent),
        "--hub-card-accent-soft": colorString(cardRole.accent, luminance(card) < 0.34 ? 0.24 : 0.13),
        "--hub-card-ink": colorString(cardRole.text),
        "--hub-card-muted": colorString(cardRole.muted),
        "--hub-card-faint": colorString(cardRole.faint),
        "--hub-card-line": colorString(cardRole.line),
        "--hub-card-on-accent": colorString(cardRole.onAccent),
        "--hub-card-footer": colorString(cardFooter),
        "--hub-card-footer-accent": colorString(cardFooterRole.accent),
        "--hub-card-footer-accent-soft": colorString(cardFooterRole.accent, luminance(cardFooter) < 0.34 ? 0.24 : 0.13),
        "--hub-card-footer-ink": colorString(cardFooterRole.text),
        "--hub-card-footer-muted": colorString(cardFooterRole.muted),
        "--hub-card-footer-faint": colorString(cardFooterRole.faint),
        "--hub-card-footer-line": colorString(cardFooterRole.line),
        "--hub-card-footer-on-accent": colorString(cardFooterRole.onAccent),
        "--hub-header": colorString(header),
        "--hub-tab-foreground": colorString(headerRole.text),
        "--hub-tab-active-bg": colorString(headerRole.text, dark ? 0.16 : 0.08),
        "--hub-hover": colorString(mixColor(card, cardRole.accent, dark ? 0.24 : 0.13)),
        "--hub-on-accent": colorString(panelRole.onAccent),
        "--hub-control-bg": colorString(controlPalette.background),
        "--hub-control-fg": colorString(controlPalette.foreground),
        "--hub-control-border": colorString(controlPalette.background),
        "--hub-control-focus": colorString(controlPalette.background),
        "--hub-scrub-accent": colorString(scrubberPalette.accent),
        "--hub-scrub-remaining": colorString(scrubberRemaining),
        "--hub-scrub-surface": colorString(scrubberPalette.surface),
        "--hub-scrub-halo": colorString(scrubberPalette.halo, 0.62),
        ...visualizerThemeVariables(accessible.preferredVisualizerColors, dark),
        "--hub-wash": colorString(surface)
      });
    };
}
export const registerModernLayout = [
  registerModernLayoutSupporters, registerModernLayoutPurchases, registerModernReleaseLayout,
  registerModernLayout2, registerModernLayout3, registerModernLayout4, registerModernLayout5
];
