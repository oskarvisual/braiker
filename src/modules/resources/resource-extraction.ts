import { createHash } from "node:crypto";

const MAX_EXCERPT_LENGTH = 12_000;

function decodeHtml(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"');
}

/** Deliberately simple, inert extraction: pages are evidence, never instructions. */
export function extractResourceEvidence(html: string) {
  const title = decodeHtml((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "Untitled resource").replace(/<[^>]+>/g, " ").trim()).slice(0, 500) || "Untitled resource";
  const withoutActiveContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<([a-z0-9]+)\s+[^>]*hidden(?:\s|=[^\s>]+)?[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<([a-z0-9]+)\b[^>]*\baria-hidden=(?:"true"|'true'|true)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const excerpt = decodeHtml(withoutActiveContent.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, MAX_EXCERPT_LENGTH);
  return { title, excerpt, contentHash: createHash("sha256").update(excerpt).digest("hex") };
}
