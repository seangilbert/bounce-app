import { lookup } from "node:dns/promises";

// Polite, steppable crawl of the operator's OWN public catalog site — the
// operator pastes their URL and confirms it's theirs; we fetch public pages
// only, same-host, sequentially, with an identified user-agent. State lives on
// the import job so each server-action step stays inside one invocation.

export interface CrawlPage {
  url: string;
  title: string;
  images: string[];
  text: string;
}

export interface CrawlState {
  queue: { url: string; depth: number }[];
  seen: string[];
  pages: CrawlPage[];
}

/** Total pages a crawl may collect. */
export const CRAWL_PAGE_CAP = 50;
/** Pages fetched per step call (~1–2s each incl. delay). */
export const CRAWL_BATCH_PAGES = 6;

const SKIP_EXT = /\.(pdf|jpe?g|png|webp|gif|svg|css|js|ico|xml|zip|mp4)$/i;
const SKIP_PATH = /(cart|checkout|login|account|privacy|terms|policy|blog|contact|about|review|faq|coupon|sitemap)/i;

/**
 * SSRF guard for the user-supplied start URL: http(s) only, and the hostname
 * must not resolve to loopback/private/link-local space — the server is about
 * to fetch it. (Subsequent crawling is already pinned to this same host.)
 */
export async function assertPublicSiteUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That doesn't look like a website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) sites can be imported.");
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That address isn't a public website.");
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error("We couldn't reach that website address.");
  }
  for (const { address, family } of addrs) {
    if (family === 4 && isPrivateV4(address)) throw new Error("That address isn't a public website.");
    if (family === 6 && isPrivateV6(address)) throw new Error("That address isn't a public website.");
  }
  return url;
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateV4(lower.slice(7)); // v4-mapped
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    /^fe[89ab]/.test(lower)
  );
}

export function initialCrawlState(startUrl: string): CrawlState {
  return { queue: [{ url: startUrl, depth: 0 }], seen: [], pages: [] };
}

/** Reduce one HTML document to the bits extraction needs. */
export function extractPage(html: string, baseUrl: string): Omit<CrawlPage, "url"> {
  const title = html.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim() ?? "";
  const images = new Set<string>();
  const og =
    html.match(/property=["']og:image["'][^>]+content=["']([^"']+)/i) ??
    html.match(/content=["']([^"']+)["'][^>]+property=["']og:image/i);
  if (og) {
    try {
      images.add(new URL(og[1], baseUrl).href);
    } catch {
      /* bad url */
    }
  }
  for (const m of html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl).href;
      if (/\.(jpe?g|png|webp)(\?|$)/i.test(u)) images.add(u);
    } catch {
      /* bad url */
    }
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  return { title, images: [...images].slice(0, 30), text };
}

/**
 * Fetch up to `batch` pages, breadth-first, same host as the start URL.
 * Mutates nothing; returns the next state and whether the crawl is finished.
 */
export async function crawlStep(
  state: CrawlState,
  batch = CRAWL_BATCH_PAGES,
): Promise<{ state: CrawlState; done: boolean }> {
  const queue = [...state.queue];
  const seen = new Set(state.seen);
  const pages = [...state.pages];
  const startHost = queue.length
    ? new URL(queue[0].url).host
    : pages.length
      ? new URL(pages[0].url).host
      : null;
  let fetched = 0;

  while (queue.length && pages.length < CRAWL_PAGE_CAP && fetched < batch) {
    const { url, depth } = queue.shift()!;
    const norm = url.split("#")[0].replace(/\?.*$/, "").replace(/\/$/, "");
    if (seen.has(norm)) continue;
    seen.add(norm);
    fetched++;
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "MovablesImport/0.1 (operator-requested catalog migration)" },
      });
    } catch {
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) continue;
    const html = await res.text();
    pages.push({ url: norm, ...extractPage(html, url) });
    if (depth < 2 && startHost) {
      for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
        try {
          const u = new URL(m[1], url);
          if (u.host !== startHost) continue;
          if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) continue;
          queue.push({ url: u.href, depth: depth + 1 });
        } catch {
          /* bad href */
        }
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  const done = queue.length === 0 || pages.length >= CRAWL_PAGE_CAP;
  return { state: { queue, seen: [...seen], pages }, done };
}
