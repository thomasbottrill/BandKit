import { asset } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";

// Release composition is installed as one reversible transaction with one cleanup stack.
// eslint-disable-next-line max-lines-per-function
export function registerModernReleaseLayout(r) {
// eslint-disable-next-line max-lines-per-function
r.$prepareModernReleaseLayout = function prepareModernReleaseLayout() {
      if (r.$modernReleaseLayoutPrepared || !r.$isClassicReleasePage()) return;
      const release = document.querySelector(".trackView");
      const trackInfoInner = document.querySelector("#trackInfoInner");
      const commands = trackInfoInner?.querySelector(":scope > .tralbumCommands");
      const rightColumn = document.querySelector("#rightColumn");
      const trackTable = document.querySelector("#track_table");
      if (!release || !trackInfoInner || !rightColumn) return;
      if (commands) {
        const addTrigger = [...commands.querySelectorAll("button, a")].find((control) => {
          const text = control.textContent?.trim() || "";
          const accessibleName = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""}`.trim();
          return text === "+" || /^add to(?: collection)?$/i.test(accessibleName);
        });
        if (addTrigger) {
          const hiddenTrigger = addTrigger.closest("li") || addTrigger;
          hiddenTrigger.classList.add("bandkit-modern-add-trigger");
          r.$modernReleaseCleanups.push(() => hiddenTrigger.classList.remove("bandkit-modern-add-trigger"));
        }
      }
      const purchasePanel = r.$createModernReleaseShell("section", "bandkit-modern-purchase-panel");
      const purchaseList = r.$createModernReleaseShell("ul", "bandkit-modern-purchase-list");
      purchasePanel.append(purchaseList);
      const artistCard = rightColumn.querySelector(":scope > #bio-container");
      if (artistCard) artistCard.after(purchasePanel);
      else rightColumn.prepend(purchasePanel);
      for (const item of commands?.querySelectorAll(":scope > .buyItem") || []) {
        r.$moveModernReleaseNode(item, purchaseList);
      }
      r.$prepareModernPurchaseActions(purchaseList);
      r.$prepareModernReleaseCart(purchasePanel, purchaseList);
      if (commands && [...commands.children].every((item) => item.classList.contains("bandkit-modern-add-trigger"))) {
        commands.classList.add("bandkit-modern-commands-empty");
        r.$modernReleaseCleanups.push(() => commands.classList.remove("bandkit-modern-commands-empty"));
      }
      r.$markModernTrackAvailability(trackTable);

      const releasePrimary = r.$createModernReleaseShell("section", "bandkit-modern-release-primary");
      const musicColumn = r.$createModernReleaseShell("div", "bandkit-modern-music-column");
      const artColumn = r.$createModernReleaseShell("div", "bandkit-modern-art-column");
      releasePrimary.append(musicColumn, artColumn);
      release.append(releasePrimary);
      for (const node of [
        document.querySelector("#name-section"),
        document.querySelector("#trackInfo")
      ]) {
        if (node) r.$moveModernReleaseNode(node, musicColumn);
      }
      const artworkColumn = document.querySelector(".middleColumn");
      const featuredVideo = [...(artworkColumn?.children || [])].find((node) => (
        node.matches(".col-span")
        && node.querySelector("iframe.video-generic-iframe, video:not(.hidden-video-mobile-player)")
      ));
      if (featuredVideo) {
        const videoSection = r.$createModernReleaseShell("section", "bandkit-modern-video-section");
        r.$moveModernReleaseNode(featuredVideo, videoSection);
        releasePrimary.before(videoSection);
      }
      if (artworkColumn) r.$moveModernReleaseNode(artworkColumn, artColumn);
      const albumActions = artworkColumn?.querySelector(".share-collect-controls");
      if (albumActions) {
        albumActions.classList.add("bandkit-modern-release-actions");
        const albumActionThemeNames = Object.keys(r.$pageActionThemeValues());
        r.$applyPageActionTheme(albumActions);
        albumActions.style.setProperty("--bandkit-release-share-icon", `url('${asset("icon-share.svg")}')`);
        albumActions.style.setProperty("--bandkit-release-wishlist-icon", `url('${asset("icon-wishlist.svg")}')`);
        albumActions.style.setProperty("--bandkit-release-wishlist-filled-icon", `url('${asset("icon-wishlist-filled.svg")}')`);
        const collectItem = albumActions.querySelector("#collect-item");
        const purchasedLink = collectItem?.querySelector("#purchased-msg a");
        const originalOwnershipText = purchasedLink?.textContent;
        const originalOwnershipLabel = purchasedLink?.getAttribute("aria-label");
        const originalOwnershipTitle = purchasedLink?.getAttribute("title");
        let ownershipApplied = false;
        let ownershipDisposed = false;
        const applyCollectionOwnership = () => {
          if (!collectItem?.isConnected || !purchasedLink?.isConnected || ownershipApplied || ownershipDisposed) return;
          ownershipApplied = true;
          collectItem.classList.add("bandkit-modern-owned");
          purchasedLink.classList.add("bandkit-modern-collection-link");
          purchasedLink.textContent = "In Collection";
          purchasedLink.setAttribute("aria-label", "View this release in your collection");
          purchasedLink.setAttribute("title", "View in collection");
        };
        if (collectItem?.classList.contains("purchased")) {
          applyCollectionOwnership();
        } else if (collectItem && purchasedLink) {
          const pageBlob = r.$parseJsonAttribute(document.querySelector("#pagedata"), "data-blob");
          const fanTralbum = pageBlob?.fan_tralbum_data;
          const tralbum = r.$getBandcampPageData()?.tralbum;
          const current = tralbum?.current;
          const fanId = Number(fanTralbum?.fan_id);
          const itemId = Number(current?.id);
          const searchKey = String(current?.artist || tralbum?.artist || "").trim();
          if (fanTralbum?.is_purchased === true) {
            applyCollectionOwnership();
          } else if (Number.isInteger(fanId) && fanId > 0 && Number.isInteger(itemId) && itemId > 0 && searchKey && ["album", "track"].includes(current?.type)) {
            void r.$runtimeMessage({
              type: MESSAGES.RESOLVE_COLLECTION_MEMBERSHIP,
              fanId,
              bandId: Number(fanTralbum?.band_id) || 0,
              searchKey,
              itemType: current.type,
              itemId,
              albumId: Number(current?.album_id) || (current.type === "album" ? itemId : 0)
            }).then((response) => {
              if (response?.ok && response.owned === true) applyCollectionOwnership();
            });
          }
        }
        if (collectItem && purchasedLink) {
          r.$modernReleaseCleanups.push(() => {
            ownershipDisposed = true;
            if (!ownershipApplied) return;
            collectItem.classList.remove("bandkit-modern-owned");
            purchasedLink.classList.remove("bandkit-modern-collection-link");
            purchasedLink.textContent = originalOwnershipText;
            if (originalOwnershipLabel == null) purchasedLink.removeAttribute("aria-label");
            else purchasedLink.setAttribute("aria-label", originalOwnershipLabel);
            if (originalOwnershipTitle == null) purchasedLink.removeAttribute("title");
            else purchasedLink.setAttribute("title", originalOwnershipTitle);
          });
        }
        const shareButton = albumActions.querySelector(".share-embed-label > button");
        const clearShareActive = (event) => {
          if (event?.type !== "keydown" && event?.target instanceof window.Node && shareButton?.contains(event.target)) return;
          shareButton?.classList.remove("is-active");
          document.removeEventListener("pointerdown", clearShareActive, true);
          document.removeEventListener("keydown", clearShareActive, true);
        };
        const markShareActive = () => {
          shareButton?.classList.add("is-active");
          window.setTimeout(() => {
            document.addEventListener("pointerdown", clearShareActive, true);
            document.addEventListener("keydown", clearShareActive, true);
          }, 0);
        };
        shareButton?.addEventListener("click", markShareActive);
        r.$modernReleaseCleanups.push(() => {
          shareButton?.removeEventListener("click", markShareActive);
          clearShareActive();
          albumActions.classList.remove("bandkit-modern-release-actions");
          for (const name of [
            ...albumActionThemeNames,
            "--bandkit-release-share-icon",
            "--bandkit-release-wishlist-icon",
            "--bandkit-release-wishlist-filled-icon"
          ]) albumActions.style.removeProperty(name);
        });
      }

      const releaseBody = r.$createModernReleaseShell("section", "bandkit-modern-release-body");
      const notesPanel = r.$createModernReleaseShell("section", "bandkit-modern-notes-panel", "Release notes");
      if (trackTable) {
        r.$moveModernReleaseNode(trackTable, trackInfoInner);
        const inlinePlayer = trackInfoInner.querySelector(":scope > .inline_player");
        if (inlinePlayer) inlinePlayer.after(trackTable);
      } else {
        releaseBody.classList.add("is-single-track");
      }
      artColumn.append(notesPanel);
      release.append(releaseBody);

      const discography = r.$prepareModernDiscography();
      r.$prepareModernReleaseProfile(releaseBody, artistCard, discography);
      const supporters = r.$prepareModernSupporters(releaseBody);

      for (const selector of [
        ".about-label", ".tralbum-about", ".credits-label", ".tralbum-credits",
        ".license-label", "#license"
      ]) {
        const node = document.querySelector(selector);
        if (node && !notesPanel.contains(node)) r.$moveModernReleaseNode(node, notesPanel);
      }

      const tagsLabel = document.querySelector(".tags-label");
      const tags = document.querySelector(".tralbum-tags");
      let tagsPanel = null;
      if (tagsLabel || tags) {
        tagsPanel = r.$createModernReleaseShell("section", "bandkit-modern-tags-panel", "Tags");
        releaseBody.append(tagsPanel);
        if (tagsLabel) r.$moveModernReleaseNode(tagsLabel, tagsPanel);
        if (tags) r.$moveModernReleaseNode(tags, tagsPanel);

        if (supporters) {
          let tagsWidthFrame = 0;
          const syncTagsWidth = () => {
            window.cancelAnimationFrame(tagsWidthFrame);
            tagsWidthFrame = window.requestAnimationFrame(() => {
              const width = supporters.getBoundingClientRect().width;
              if (width > 0) {
                tagsPanel.style.setProperty("width", `${width}px`, "important");
                tagsPanel.style.setProperty("max-width", `${width}px`, "important");
              }
            });
          };
          const tagsWidthObserver = new ResizeObserver(syncTagsWidth);
          tagsWidthObserver.observe(supporters);
          syncTagsWidth();
          r.$modernReleaseCleanups.push(() => {
            window.cancelAnimationFrame(tagsWidthFrame);
            tagsWidthObserver.disconnect();
            tagsPanel.style.removeProperty("width");
            tagsPanel.style.removeProperty("max-width");
          });
        }
      }

      r.$prepareModernReleaseInfo(releaseBody, rightColumn);

      const recommendations = document.querySelector("#recommendations_container");
      if (recommendations) {
        const recommendationsTitle = r.$createModernReleaseShell("h2", "bandkit-modern-recommendations-title");
        recommendationsTitle.textContent = "More to explore";
        recommendations.prepend(recommendationsTitle);

        const activateRecommendationCard = (event) => {
          const target = event.target instanceof Element ? event.target : null;
          const card = target?.closest(".recommended-album");
          if (!card || !recommendations.contains(card)) return;
          recommendations.querySelectorAll(".recommended-album.selected").forEach((candidate) => {
            candidate.classList.toggle("selected", candidate === card);
          });
          card.classList.add("selected");
          card.closest(".first-row")?.classList.add("expanded");
        };
        recommendations.addEventListener("pointerover", activateRecommendationCard);
        recommendations.addEventListener("focusin", activateRecommendationCard);
        r.$modernReleaseCleanups.push(() => {
          recommendations.removeEventListener("pointerover", activateRecommendationCard);
          recommendations.removeEventListener("focusin", activateRecommendationCard);
        });
      }

      r.$modernReleaseLayoutPrepared = true;
    };
}
