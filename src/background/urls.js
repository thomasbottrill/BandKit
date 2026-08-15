export function isBandcampUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "bandcamp.com" || url.hostname.endsWith(".bandcamp.com"));
  } catch {
    return false;
  }
}

export function isSupportedBandKitPage(value) {
  try {
    const url = new URL(value);
    if (!isBandcampUrl(url.href)) return false;
    if (["blog.bandcamp.com", "daily.bandcamp.com", "get.bandcamp.com", "help.bandcamp.com", "www.bandcamp.com"].includes(url.hostname)) return false;
    return url.hostname !== "bandcamp.com" || !/^\/(?:about|buttons|copyright|developer|help|privacy|terms_of_use)(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isPublicReleaseUrl(value) {
  if (isBandcampUrl(value)) return true;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
    const privateIpv4 = ipv4 && (ipv4.some((part) => part > 255)
      || ipv4[0] === 10
      || ipv4[0] === 127
      || (ipv4[0] === 169 && ipv4[1] === 254)
      || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
      || (ipv4[0] === 192 && ipv4[1] === 168));
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && hostname
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && !hostname.endsWith(".local")
      && !hostname.includes(":")
      && !privateIpv4
      && /^\/(?:album|track)\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}
