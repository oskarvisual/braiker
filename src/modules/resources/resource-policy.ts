export const resourceCategories = ["MACRO", "NEWS", "FILINGS", "EARNINGS", "SENTIMENT", "ETF_ROTATION", "TECHNICAL"] as const;
export type ResourceCategory = typeof resourceCategories[number];

const privateIpv4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

/** Cheap synchronous gate; the fetcher must still DNS-validate every redirect. */
export function assessResourceUrl(rawUrl: string, trustedDomains: readonly string[]) {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch { return { accepted: false as const, autoActivate: false, reason: "INVALID_URL" }; }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:") return { accepted: false as const, autoActivate: false, reason: "HTTPS_REQUIRED" };
  if (url.username || url.password || hostname === "localhost" || hostname.endsWith(".localhost") || privateIpv4.test(hostname) || hostname === "::1") {
    return { accepted: false as const, autoActivate: false, reason: "PRIVATE_HOST" };
  }
  const autoActivate = trustedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  return { accepted: true as const, autoActivate, hostname, canonicalUrl: url.toString() };
}

export const trustedResourceDomains = [
  "federalreserve.gov", "bls.gov", "bea.gov", "sec.gov", "alpaca.markets", "cboe.com", "finra.org"
] as const;
