import { runtimeSeamless, runtimeState } from "./context.js";
import { asset, createElement, safeBandcampUrl } from "../core.js";
import { MESSAGES } from "../../shared/contracts.js";

function registerPageCommerceAnalysis1(r) {
r.$openPagePlaylistMenu = function openPagePlaylistMenu(anchor, selection, view = "destinations") {
      if (r.$pagePlaylistMenuAnchor === anchor) {
        r.$closePagePlaylistMenu();
        return;
      }
      r.$closePagePlaylistMenu();
      r.$pagePlaylistMenuAnchor = anchor;
      r.$pagePlaylistMenu = document.createElement("div");
      r.$pagePlaylistMenu.className = "bandcamp-hub-page-playlist-menu";
      r.$pagePlaylistMenu.setAttribute("role", "menu");
      r.$applyPageActionTheme(r.$pagePlaylistMenu);
      document.body.append(r.$pagePlaylistMenu);
      r.$syncPageTypography();
      anchor.classList.add("is-active");
      anchor.setAttribute("aria-expanded", "true");
      r.$pagePlaylistMenuRootView = view;
      r.$renderPagePlaylistMenu(selection, view);
      window.setTimeout(() => document.addEventListener("click", r.$closePagePlaylistMenu, { once: true }), 0);
    };
r.$createPagePlaylistButton = function createPagePlaylistButton(tagName = "button") {
      const button = document.createElement(tagName);
      button.className = "bandcamp-hub-page-playlist";
      button.style.setProperty("--hub-plus-icon", `url('${asset("icon-plus.svg")}')`);
      button.style.fontFamily = 'var(--hub-font-family, "Helvetica Neue", Helvetica, Arial, sans-serif)';
      r.$applyPageActionTheme(button);
      if (tagName === "button") button.type = "button";
      else {
        button.href = "#";
        button.setAttribute("role", "button");
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button._bandkitTracks?.length) {
          r.$openPagePlaylistMenu(button, { type: "bandkit-track-batch", tracks: button._bandkitTracks });
        } else if (button._bandkitTrack) {
          r.$openPagePlaylistMenu(button, button._bandkitOwned
            ? { type: "bandkit-owned-track", track: button._bandkitTrack }
            : button._bandkitTrack);
        }
      });
      return button;
    };
r.$createPageReleaseOverflowButton = function createPageReleaseOverflowButton() {
      const button = document.createElement("button");
      button.className = "bandcamp-hub-page-overflow";
      button.type = "button";
      button.style.setProperty("--hub-more-icon", `url('${asset("icon-more.svg")}')`);
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "More release actions");
      button.title = "More release actions";
      r.$setPageActionLabel(button, "More");
      r.$applyPageActionTheme(button);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const tracks = r.$buildSeamlessQueue();
        if (!tracks.length) return;
        r.$openPagePlaylistMenu(button, { type: "bandkit-track-batch", tracks }, "release-actions");
      });
      return button;
    };
r.$createPageCartButton = function createPageCartButton() {
      const button = document.createElement("button");
      button.className = "bandcamp-hub-page-cart";
      button.type = "button";
      button.style.setProperty("--hub-cart-icon", `url('${asset("icon-cart.svg")}')`);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        r.$openBandKitCart();
        if (button._bandkitPurchaseControl?.isConnected) {
          button._bandkitPurchaseControl.click();
        } else if (!r.$activateNativeTrackAction("cart")) {
          r.$showToast("Bandcamp's purchase options are not available for this item.");
        }
      });
      return button;
    };
r.$nativeGiftControl = function nativeGiftControl() {
      for (const match of document.querySelectorAll([
        ".buyItem.digital [data-test='send-tralbum-as-gift']",
        ".buyItem.digital .send-as-gift button",
        ".buyItem.digital .send-as-gift a"
      ].join(", "))) {
        if (!match.closest("#bandcamp-hub-extension-root, .bandcamp-hub-page-tools")) return match;
      }
      return null;
    };
r.$compactPagePrice = function compactPagePrice(value, currency = "USD", minimum = true) {
      const amount = Number(value);
      const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
      if (!Number.isFinite(amount) || amount < 0) return "";
      try {
        const formatted = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: code,
          currencyDisplay: "narrowSymbol",
          minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
          maximumFractionDigits: 2
        }).format(amount);
        return `${formatted}${minimum ? "+" : ""} ${code}`;
      } catch {
        return `${amount.toFixed(Number.isInteger(amount) ? 0 : 2)}${minimum ? "+" : ""} ${code}`;
      }
    };
r.$pageCartCurrency = function pageCartCurrency() {
      const visibleCurrency = document.querySelector(".buyItem.digital .buyItemExtra.secondaryText:not(.buyItemNyp)")?.textContent?.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(visibleCurrency || "")) return visibleCurrency;
      const bandCurrency = document.querySelector("script[data-band-currency]")?.getAttribute("data-band-currency")?.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(bandCurrency || "")) return bandCurrency;
      const cart = r.$parseJsonAttribute(document.querySelector("script[data-cart]"), "data-cart");
      const currency = String(cart?.currency || "").toUpperCase();
      return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
    };
r.$pageTrackPriceKey = function pageTrackPriceKey(track) {
      const url = safeBandcampUrl(track?.pageUrl);
      return url && new URL(url).pathname.includes("/track/") ? url : "";
    };
r.$localTrackPrice = function localTrackPrice(track) {
      const pageData = r.$getBandcampPageData()?.tralbum;
      const current = pageData?.current;
      const currentId = String(current?.id || current?.track_id || "");
      const matchesCurrentTrack = current?.type === "track" && (
        (currentId && currentId === String(track?.id || ""))
        || r.$normalizedTrackTitle(current?.title) === r.$normalizedTrackTitle(track?.title)
      );
      if (!matchesCurrentTrack) return null;
      return r.$digitalPurchaseDetails();
    };
r.$resolvedTrackPrice = function resolvedTrackPrice(track) {
      const local = r.$localTrackPrice(track);
      if (local) return local;
      const key = r.$pageTrackPriceKey(track);
      return key && r.$pageTrackPriceCache.has(key) ? r.$pageTrackPriceCache.get(key) : null;
    };
r.$resolveTrackPrice = function resolveTrackPrice(button, track) {
      const key = r.$pageTrackPriceKey(track);
      if (!key || r.$pageTrackPriceCache.has(key) || r.$pageTrackPricePending.has(key)) return;
      r.$pageTrackPricePending.add(key);
      void r.$runtimeMessage({ type: MESSAGES.RESOLVE_CART_METADATA, items: [{ url: key }] }).then((response) => {
        const metadata = response?.items?.[0];
        const price = metadata?.itemType === "track" ? r.$resolvedPurchaseMetadata(metadata) : null;
        r.$pageTrackPriceCache.set(key, price);
        if (button.isConnected && r.$pageTrackPriceKey(button._bandkitTrack) === key) {
          r.$updatePageCartButton(button, button._bandkitTrack);
        }
      }).catch(() => {
        r.$pageTrackPriceCache.set(key, null);
      }).finally(() => {
        r.$pageTrackPricePending.delete(key);
      });
    };
r.$fullAlbumPurchaseControl = function fullAlbumPurchaseControl() {
      for (const control of document.querySelectorAll("a[href], button, [role='button']")) {
        if (!/buy\s+the\s+full\s+digital\s+album/i.test(control.textContent || "")) continue;
        if (control.matches("a[href]") && !safeBandcampUrl(control.href)) continue;
        return control;
      }
      return null;
    };
r.$digitalPurchaseControl = function digitalPurchaseControl(digitalOffer) {
      return digitalOffer?.querySelector([
        ".ft.compound-button.main-button .buy-link",
        ".ft .main-button .buy-link",
        ".ft .buy-link:not([data-test='send-tralbum-as-gift'])"
      ].join(", ")) || null;
    };
}

function registerPageCommerceAnalysis2(r) {
r.$visibleDigitalPrice = function visibleDigitalPrice(digitalOffer) {
      const footer = digitalOffer?.querySelector(".ft.compound-button.main-button, .ft .main-button, .ft");
      const priceCopy = footer?.textContent?.replace(/\s+/g, " ").trim() || "";
      const minimum = /or\s+more/i.test(priceCopy);
      const visibleAmount = footer?.querySelector(".base-text-color")?.textContent?.replace(/\s+/g, " ").trim() || "";
      const visibleCurrency = footer?.querySelector(".buyItemExtra.secondaryText:not(.buyItemNyp)")?.textContent?.replace(/\s+/g, " ").trim().toUpperCase() || "";
      if (visibleAmount && /^[A-Z]{3}$/.test(visibleCurrency)) {
        return { label: `${visibleAmount}${minimum ? "+" : ""} ${visibleCurrency}`, minimum };
      }
      const visiblePrice = priceCopy.match(/(?:(?:A|C|NZ|US)\$|[$£€¥])\s?\d[\d,.]*(?:\s*[A-Z]{3})?|\d[\d,.]*\s+[A-Z]{3}/)?.[0];
      if (!visiblePrice) return null;
      const normalizedPrice = visiblePrice.replace(/\s+/g, " ").trim().replace(/\+?\s+([A-Z]{3})$/, `${minimum ? "+" : ""} $1`);
      return { label: normalizedPrice, minimum };
    };
r.$resolvedPurchaseMetadata = function resolvedPurchaseMetadata(metadata) {
      const status = String(metadata?.purchaseStatus || "");
      const minimumPrice = Number(metadata?.minimumPrice);
      const currency = metadata?.currency || r.$pageCartCurrency();
      if (status === "free") return { status, label: "Free", actionLabel: "Download", minimumPrice: 0 };
      if (status === "name-your-price") return { status, label: "Name your price", actionLabel: "Buy", minimumPrice: 0 };
      if (status === "album-only") return { status, label: "Album only", actionLabel: "Buy album", minimumPrice: null };
      if (status === "unavailable") return { status, label: "Unavailable", actionLabel: "", disabled: true, minimumPrice: null };
      if (Number.isFinite(minimumPrice) && minimumPrice > 0) {
        return {
          status: status || "priced",
          label: r.$compactPagePrice(minimumPrice, currency, metadata?.priceIsMinimum !== false),
          actionLabel: status === "preorder" ? "Pre-order" : "Buy",
          minimumPrice,
          minimum: metadata?.priceIsMinimum !== false
        };
      }
      if (status === "preorder") return { status, label: "Pre-order", actionLabel: "Pre-order", minimumPrice: null };
      return { status: "buy", label: "Buy", actionLabel: "", minimumPrice: null };
    };
r.$digitalPurchaseDetails = function digitalPurchaseDetails() {
      const digitalOffer = document.querySelector(".buyItem.digital");
      const tralbum = r.$getBandcampPageData()?.tralbum;
      const current = tralbum?.current;
      const control = r.$digitalPurchaseControl(digitalOffer);
      const controlCopy = control?.textContent?.replace(/\s+/g, " ").trim() || "";
      const offerCopy = digitalOffer?.textContent?.replace(/\s+/g, " ").trim() || "";
      const albumControl = current?.type === "track" && !control ? r.$fullAlbumPurchaseControl() : null;
      if (!control) {
        if (albumControl) return { status: "album-only", label: "Album only", actionLabel: "Buy album", control: albumControl };
        if (tralbum?.is_purchased) return { status: "owned", label: "In collection", actionLabel: "", disabled: true };
        return { status: "unavailable", label: "Unavailable", actionLabel: "", disabled: true };
      }
      const free = /free\s+download/i.test(controlCopy)
        || Number(current?.download_pref) === Number(tralbum?.FREE);
      if (free) return { status: "free", label: "Free", actionLabel: "Download", control, minimumPrice: 0 };
      const preorder = /pre-?order/i.test(controlCopy)
        || tralbum?.is_preorder === true
        || tralbum?.album_is_preorder === true;
      const visiblePrice = r.$visibleDigitalPrice(digitalOffer);
      if (visiblePrice) {
        return {
          status: preorder ? "preorder" : "priced",
          label: visiblePrice.label,
          actionLabel: preorder ? "Pre-order" : "Buy",
          control,
          minimum: visiblePrice.minimum,
          minimumPrice: Number(current?.minimum_price)
        };
      }
      if (preorder) return { status: "preorder", label: "Pre-order", actionLabel: "Pre-order", control };
      if (digitalOffer.querySelector(".buyItemNyp") || /name\s+your\s+price/i.test(offerCopy) || Number(current?.minimum_price) === 0) {
        return { status: "name-your-price", label: "Name your price", actionLabel: "Buy", control, minimumPrice: 0 };
      }
      const minimumPrice = Number(current?.minimum_price);
      if (Number.isFinite(minimumPrice) && minimumPrice > 0) {
        const minimum = current?.is_set_price !== 1;
        return {
          status: "priced",
          label: r.$compactPagePrice(minimumPrice, r.$pageCartCurrency(), minimum),
          actionLabel: "Buy",
          control,
          minimum,
          minimumPrice
        };
      }
      return { status: "buy", label: "Buy", actionLabel: "", control };
    };
r.$updatePageCartButton = function updatePageCartButton(button, track) {
      button._bandkitTrack = track || null;
      button.hidden = false;
      r.$resolveTrackPrice(button, track);
      const purchase = track ? r.$resolvedTrackPrice(track) : r.$digitalPurchaseDetails();
      const detail = purchase?.label || "Unavailable";
      button.disabled = purchase?.disabled === true;
      button._bandkitPurchaseControl = purchase?.control || null;
      button.classList.toggle("has-price", Boolean(detail));
      r.$setPageActionLabel(button, purchase?.actionLabel || "");
      let priceLabel = button.querySelector(":scope > .bandcamp-hub-page-cart-price");
      if (detail) {
        if (!priceLabel) {
          priceLabel = document.createElement("span");
          priceLabel.className = "bandcamp-hub-page-cart-price";
          priceLabel.setAttribute("aria-hidden", "true");
          button.append(priceLabel);
        }
        priceLabel.textContent = detail;
      } else priceLabel?.remove();
      const itemLabel = track?.title ? `track ${track.title}` : "digital album";
      const status = purchase?.status || "unavailable";
      const label = status === "free"
        ? `Download ${itemLabel} for free`
        : status === "name-your-price"
          ? `Buy ${itemLabel} — name your price`
          : status === "album-only"
            ? "Buy the full digital album"
            : status === "unavailable"
              ? `Purchase unavailable for ${itemLabel}`
              : status === "owned"
                ? `${itemLabel} is already in your collection`
                : purchase?.minimumPrice > 0
                  ? `${status === "preorder" ? "Pre-order" : "Buy"} ${itemLabel} for ${detail}${purchase?.minimum ? " or more" : ""}`
                  : status === "preorder"
                    ? `Pre-order ${itemLabel}`
                    : `Buy ${itemLabel}`;
      button.title = label;
      button.setAttribute("aria-label", label);
    };
r.$pageAnalysisTrackKey = function pageAnalysisTrackKey(track) {
      return `${String(track?.id || "")}\u0000${String(track?.url || "")}`;
    };
r.$pageAnalysisSignature = function pageAnalysisSignature(tracks) {
      return tracks.map(r.$pageAnalysisTrackKey).join("\u0001");
    };
r.$pageAnalysisParts = function pageAnalysisParts(result) {
      if (!result) return null;
      const bpm = Number(result.bpm);
      const hasBpm = Number.isFinite(bpm) && bpm > 0;
      return {
        bpm: hasBpm ? `${Number.isInteger(bpm) ? bpm : bpm.toFixed(1)} BPM` : "— BPM",
        camelot: String(result.key?.camelot || ""),
        key: String(result.key?.shortName || ""),
        unavailable: Boolean(result.error || !hasBpm)
      };
    };
r.$pageAnalysisLabel = function pageAnalysisLabel(result) {
      const parts = r.$pageAnalysisParts(result);
      if (!parts) return "";
      return [
        parts.bpm,
        ...(runtimeState.showTrackKeys !== false ? [parts.camelot, parts.key] : [])
      ].filter(Boolean).join(" · ");
    };
r.$renderPageAnalysisLabel = function renderPageAnalysisLabel(label, result, analyzing = false) {
      label.replaceChildren();
      const parts = analyzing ? null : r.$pageAnalysisParts(result);
      label.classList.toggle("is-analyzing", analyzing);
      label.classList.toggle("is-unavailable", Boolean(parts?.unavailable));
      label.classList.toggle("has-key", runtimeState.showTrackKeys !== false && Boolean(result?.key));
      if (analyzing) {
        label.append(createElement("span", "bandkit-track-analysis-pending", "Analyzing…"));
        label.setAttribute("aria-label", "Analyzing track");
        label.removeAttribute("title");
        return;
      }
      if (!parts) return;
      if (parts.bpm) label.append(createElement("span", "bandkit-track-analysis-bpm", parts.bpm));
      if (runtimeState.showTrackKeys !== false && parts.camelot) {
        label.append(createElement("span", "bandkit-track-analysis-camelot", parts.camelot));
      }
      if (runtimeState.showTrackKeys !== false && parts.key) {
        label.append(createElement("span", "bandkit-track-analysis-key", parts.key));
      }
      const text = r.$pageAnalysisLabel(result);
      label.setAttribute("aria-label", parts.unavailable
        ? `Track analysis: BPM unavailable${text.replace(/^— BPM(?: · )?/, "").trim() ? ` · ${text.replace(/^— BPM(?: · )?/, "")}` : ""}`
        : `Track analysis: ${text}`);
      if (parts.unavailable) {
        const reason = String(result?.error || "").trim();
        label.title = `BPM could not be detected for this track${reason ? `: ${reason}` : ""}`;
      }
      else if (result.key?.name && runtimeState.showTrackKeys !== false) label.title = `${text} · ${result.key.name}`;
      else label.removeAttribute("title");
    };
}

function registerPageCommerceAnalysis3(r) {
r.$syncPageTrackAnalysisUi = function syncPageTrackAnalysisUi() {
      const queue = r.$buildSeamlessQueue();
      const trackInfo = r.$getBandcampPageData()?.tralbum?.trackinfo || [];
      for (const [index, row] of [...document.querySelectorAll(".track_row_view")].entries()) {
        const title = r.$elementText(row, [".track-title", ".title"]);
        const trackNumber = Number((row.getAttribute("rel") || "").match(/(?:^|[&;\s])tracknum=(\d+)/i)?.[1] || 0);
        const sourceTrack = trackInfo[trackNumber > 0 ? trackNumber - 1 : index];
        const track = r.$matchingQueueTrack(queue, { id: sourceTrack?.track_id || sourceTrack?.id, title });
        const result = track ? r.$pageTrackAnalysis.get(r.$pageAnalysisTrackKey(track)) : null;
        const text = r.$pageAnalysisLabel(result) || (track && r.$pageTrackAnalysisStatus === "analyzing" ? "Analyzing…" : "");
        let label = row.querySelector(".bandkit-track-analysis");
        const analysisLayout = row.querySelector(".title-col .title");
        if (!text) {
          label?.remove();
          analysisLayout?.classList.remove("bandkit-has-track-analysis");
          continue;
        }
        if (!label) {
          label = document.createElement("span");
          label.className = "bandkit-track-analysis";
          const duration = row.querySelector(".title-col .time, .title .time, .time");
          if (duration) duration.after(label);
          else (row.querySelector(".title-col .title, .title-col, .title") || row).append(label);
        }
        analysisLayout?.classList.add("bandkit-has-track-analysis");
        r.$renderPageAnalysisLabel(label, result, !result);
      }

      const inlinePlayer = document.querySelector(".inline_player");
      const inlineTrack = r.$currentInlinePlaylistTrack();
      const inlineResult = inlineTrack ? r.$pageTrackAnalysis.get(r.$pageAnalysisTrackKey(inlineTrack)) : null;
      const inlineText = r.$pageAnalysisLabel(inlineResult)
        || (inlineTrack && r.$pageTrackAnalysisStatus === "analyzing" ? "Analyzing…" : "");
      let inlineLabel = inlinePlayer?.querySelector(":scope .bandkit-track-analysis.is-inline");
      if (!inlineText) inlineLabel?.remove();
      else if (inlinePlayer) {
        if (!inlineLabel) {
          inlineLabel = document.createElement("span");
          inlineLabel.className = "bandkit-track-analysis is-inline";
          const duration = inlinePlayer.querySelector(".track_info > .time, .time");
          if (duration) duration.after(inlineLabel);
        }
        if (inlineLabel) {
          r.$renderPageAnalysisLabel(inlineLabel, inlineResult, !inlineResult);
        }
      }
    };
r.$syncActivePageTrackAnalysis = function syncActivePageTrackAnalysis() {
      const bpm = Number(runtimeSeamless.detectedBpm);
      if (!runtimeSeamless.enabled || runtimeSeamless.bpmStatus !== "ready"
        || !runtimeSeamless.track || !Number.isFinite(bpm) || bpm <= 0) return false;
      const pageTrack = r.$matchingQueueTrack(r.$buildSeamlessQueue(), runtimeSeamless.track);
      if (!pageTrack) return false;
      const mapKey = r.$pageAnalysisTrackKey(pageTrack);
      const result = {
        id: pageTrack.id,
        url: pageTrack.url,
        bpm,
        key: runtimeSeamless.detectedKey || null
      };
      const previous = r.$pageTrackAnalysis.get(mapKey);
      if (Number(previous?.bpm) === bpm
        && JSON.stringify(previous?.key || null) === JSON.stringify(result.key)) return false;
      r.$pageTrackAnalysis.set(mapKey, result);
      r.$syncPageTrackAnalysisUi();
      return true;
    };
r.$analyzePageTracks = async function analyzePageTracks({ manual = false, force = false } = {}) {
      const tracks = r.$buildSeamlessQueue();
      if (!tracks.length || r.$pageTrackAnalysisStatus === "analyzing") return;
      const signature = r.$pageAnalysisSignature(tracks);
      if (signature !== r.$pageTrackAnalysisSignature) r.$pageTrackAnalysis = new Map();
      r.$pageTrackAnalysisSignature = signature;
      r.$pageTrackAnalysisStatus = "analyzing";
      const request = ++r.$pageTrackAnalysisRequest;
      r.$syncPageTrackAnalysisUi();
      if (manual) r.$showToast(`Analyzing ${tracks.length} track${tracks.length === 1 ? "" : "s"}…`);
      try {
        let cursor = 0;
        const worker = async () => {
          while (cursor < tracks.length) {
            const track = tracks[cursor];
            cursor += 1;
            const response = await r.$runtimeMessage({ type: MESSAGES.ANALYZE_TRACKS, tracks: [track], force });
            if (request !== r.$pageTrackAnalysisRequest || signature !== r.$pageTrackAnalysisSignature) return;
            const result = response?.ok
              ? response.results?.[0]
              : { id: track.id, url: track.url, error: response?.error || "Track analysis failed." };
            r.$pageTrackAnalysis.set(r.$pageAnalysisTrackKey(track), result || {
              id: track.id,
              url: track.url,
              error: "Track analysis returned no result."
            });
            r.$syncPageTrackAnalysisUi();
          }
        };
        const concurrency = Math.min(r.$PAGE_TRACK_ANALYSIS_CONCURRENCY, tracks.length);
        await Promise.all(Array.from({ length: concurrency }, worker));
        if (request !== r.$pageTrackAnalysisRequest || signature !== r.$pageTrackAnalysisSignature) return;
        r.$pageTrackAnalysisStatus = "ready";
        const completed = [...r.$pageTrackAnalysis.values()].filter((result) => !result.error).length;
        if (manual) r.$showToast(`Analyzed ${completed} of ${tracks.length} track${tracks.length === 1 ? "" : "s"}`);
      } catch (error) {
        if (request !== r.$pageTrackAnalysisRequest) return;
        r.$pageTrackAnalysisStatus = "error";
        if (manual) r.$showToast(error.message || "Track analysis failed.");
      }
      r.$syncPageTrackAnalysisUi();
    };
}

export const registerPageCommerceAnalysis = [registerPageCommerceAnalysis1, registerPageCommerceAnalysis2, registerPageCommerceAnalysis3];

export const setupPageCommerceAnalysis = [];
