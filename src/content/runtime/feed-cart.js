import { MESSAGES } from "../../shared/contracts.js";
import { safeBandcampUrl } from "../core.js";

// A feed story's buy control is an ordinary Bandcamp link, so following it takes
// the listener off the feed and only opens the release page's purchase panel.
// Bandkit already knows how to add a release to the cart, so the control can do
// that here instead, asking for an amount when the release is name-your-price.
export function registerFeedCart(r) {
  r.$feedPurchaseMetadata = async function feedPurchaseMetadata(pageUrl) {
    const url = safeBandcampUrl(pageUrl);
    if (!url) return null;
    if (r.$feedPurchases.has(url)) return r.$feedPurchases.get(url);
    if (!r.$feedPurchaseRequests.has(url)) {
      r.$feedPurchaseRequests.set(url, r.$runtimeMessage({ type: MESSAGES.RESOLVE_CART_METADATA, items: [{ url }] })
        .then((response) => {
          const metadata = response?.items?.[0] || null;
          if (metadata) r.$feedPurchases.set(url, metadata);
          return metadata;
        })
        .catch(() => null)
        .finally(() => r.$feedPurchaseRequests.delete(url)));
    }
    return r.$feedPurchaseRequests.get(url);
  };

  r.$prefetchFeedPurchase = function prefetchFeedPurchase(pageUrl) {
    // Reading the release once on hover keeps the click itself immediate.
    void r.$feedPurchaseMetadata(pageUrl);
  };

  r.$releaseCartTrack = function releaseCartTrack(track) {
    const releaseUrl = safeBandcampUrl(track?.releaseUrl) || safeBandcampUrl(track?.pageUrl);
    return {
      ...track,
      title: track?.album || track?.title,
      pageUrl: releaseUrl,
      releaseUrl
    };
  };

  r.$addReleaseToCart = async function addReleaseToCart(track, unitPrice = null) {
    const albumTrack = r.$releaseCartTrack(track);
    if (!albumTrack.pageUrl) {
      r.$showToast("This release does not expose a Bandcamp page to buy from.");
      return false;
    }
    r.$showToast(`Adding “${albumTrack.title}” to your cart…`);
    const items = await r.$cartItemsForTracks([albumTrack], "a");
    if (!items.length) return false;
    if (unitPrice !== null) {
      for (const item of items) {
        item.price = Math.max(0, Number(unitPrice) || 0);
        if (item.restore) item.restore.unit_price = item.price;
      }
    }
    const result = await r.$restoreSavedCart(items);
    return result.ok === true;
  };

  r.$requestReleaseCartAdd = async function requestReleaseCartAdd(anchor, track) {
    const albumTrack = r.$releaseCartTrack(track);
    const metadata = await r.$feedPurchaseMetadata(albumTrack.pageUrl);
    const purchase = r.$resolvedPurchaseMetadata(metadata);
    if (purchase.status === "unavailable" || purchase.status === "album-only") {
      void r.$openTrackAction(albumTrack, "cart");
      return;
    }
    // A free release has no cart to add to; Bandcamp only offers its download.
    if (purchase.status === "free") {
      r.$showToast("This release is a free download on Bandcamp.");
      void r.$openTrackAction(albumTrack, "cart");
      return;
    }
    // A release the buyer sets the price for must not be added at an amount
    // Bandkit chose for them, so ask here rather than on the release page. The
    // amount also has to clear Bandcamp's own collection minimum, or the cart
    // item it creates is rejected at checkout as a changed price.
    const namesOwnPrice = purchase.status === "name-your-price" || purchase.minimum === true;
    if (namesOwnPrice) {
      const floor = Math.max(
        Math.max(0, Number(purchase.minimumPrice) || 0),
        Math.max(0, Number(metadata?.cartMinimum) || 0)
      );
      r.$openPagePriceMenu(anchor, albumTrack, {
        currency: metadata?.currency || "USD",
        minimumPrice: floor
      });
      return;
    }
    await r.$addReleaseToCart(albumTrack);
  };

  r.$resolveFeedReleaseTracks = async function resolveFeedReleaseTracks(track) {
    // A story only becomes an album action once its tracks are known. The feed's
    // own list resolves them lazily, so a control pressed before that happens
    // asks for the same release rather than falling back to the featured track.
    const pageUrl = safeBandcampUrl(track?.releaseUrl) || safeBandcampUrl(track?.pageUrl);
    if (!pageUrl || !/\/album\//.test(pageUrl)) return [];
    if (r.$feedReleaseTracks.has(pageUrl)) return r.$feedReleaseTracks.get(pageUrl);
    if (!r.$feedReleaseRequests.has(pageUrl)) {
      r.$feedReleaseRequests.set(pageUrl, r.$runtimeMessage({ type: MESSAGES.RESOLVE_DISCOVER_RELEASE, pageUrl })
        .then((response) => {
          const tracks = r.$normalizePlaylist(response?.release?.tracks || []);
          if (tracks.length) r.$feedReleaseTracks.set(pageUrl, tracks);
          return tracks;
        })
        .catch(() => [])
        .finally(() => r.$feedReleaseRequests.delete(pageUrl)));
    }
    return r.$feedReleaseRequests.get(pageUrl);
  };

  r.$openPagePriceMenu = function openPagePriceMenu(anchor, track, price) {
    r.$pagePriceRequest = { track, ...price };
    r.$openPagePlaylistMenu(anchor, { type: "bandkit-release", tracks: [track] }, "name-your-price");
  };

}
