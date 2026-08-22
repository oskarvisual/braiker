import { lookup as dnsLookup } from "node:dns/promises";
import { extractResourceEvidence } from "./resource-extraction";
import { assessResourceUrl, trustedResourceDomains } from "./resource-policy";

const MAX_BYTES = 1_000_000;
type Address = { address: string; family: number };
type Lookup = (hostname: string) => Promise<Address[]>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function isPrivateAddress(address: string) {
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(address) || address === "::1" || /^f[cd]/i.test(address) || /^fe80:/i.test(address);
}

async function publicDns(hostname: string, lookup: Lookup) {
  const addresses = await lookup(hostname);
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("PRIVATE_HOST");
}

/** URL retrieval is intentionally inert: no scripts, cookies, credentials, or automatic cross-host redirects. */
export async function fetchSafeResource(rawUrl: string, overrides: { lookup?: Lookup; fetchImpl?: FetchLike } = {}) {
  const assessed = assessResourceUrl(rawUrl, trustedResourceDomains);
  if (!assessed.accepted) throw new Error(assessed.reason);
  const lookup: Lookup = overrides.lookup ?? ((hostname) => dnsLookup(hostname, { all: true, verbatim: true }));
  const fetchImpl = overrides.fetchImpl ?? fetch;
  await publicDns(assessed.hostname, lookup);
  const response = await fetchImpl(assessed.canonicalUrl, { redirect: "manual", headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": "BrAIker-Resources/1.0" }, signal: AbortSignal.timeout(8_000) });
  if (response.status >= 300 && response.status < 400) throw new Error("REDIRECT_REQUIRES_REVIEW");
  if (!response.ok) throw new Error(`RESOURCE_FETCH_FAILED_${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("UNSUPPORTED_RESOURCE_CONTENT");
  const declaredSize = Number(response.headers.get("content-length") ?? "0");
  if (declaredSize > MAX_BYTES) throw new Error("RESOURCE_TOO_LARGE");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BYTES) throw new Error("RESOURCE_TOO_LARGE");
  const evidence = extractResourceEvidence(body);
  if (!evidence.excerpt) throw new Error("RESOURCE_EMPTY");
  return { canonicalUrl: assessed.canonicalUrl, ...evidence };
}
