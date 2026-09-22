import type { ResearchPage } from './judge';

const INTEREST = /contact|refer|provider|physician|doctor|about|team|staff|fax|location/i;
const MAX_PAGES = 3;
const MAX_PAGE_CHARS = 200_000;
const PAGE_TIMEOUT_MS = 8_000;

export interface PageBundle {
  pages: ResearchPage[];
  links: string[];
  text: string;
  error?: string;
}

export function practiceUrl(website: string | null | undefined): string | null {
  if (!website) return null;
  const trimmed = website.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return publicHttpUrl(withScheme);
}

export function publicHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (isBlockedHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function htmlToText(html: string): string {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const text = withoutCode
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.replace(/\s+/g, ' ').trim();
}

export function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const pattern = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const href = resolveLink(match[1], baseUrl);
    if (!href) continue;
    links.push({ href, text: htmlToText(match[2]).slice(0, 160) });
  }
  return links;
}

function resolveLink(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || /^mailto:|^tel:|^javascript:/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    return publicHttpUrl(url.toString());
  } catch {
    return null;
  }
}

export async function fetchPracticePages(
  startUrl: string,
  deps?: { fetch?: typeof fetch },
): Promise<PageBundle> {
  const fetchImpl = deps?.fetch ?? fetch;
  const first = publicHttpUrl(startUrl);
  if (!first) return { pages: [], links: [], text: '', error: 'Website is not a public http(s) URL' };

  const pages: ResearchPage[] = [];
  const seen = new Set<string>();
  const allLinks: string[] = [];
  const queue = [first];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const loaded = await fetchHtml(url, fetchImpl);
    if (!loaded) {
      if (pages.length === 0) return { pages: [], links: [], text: '', error: `Could not read ${url}` };
      continue;
    }
    const text = htmlToText(loaded.html).slice(0, 8_000);
    if (text) pages.push({ url: loaded.finalUrl, text });
    const links = extractLinks(loaded.html, loaded.finalUrl);
    for (const link of links) {
      if (!allLinks.includes(link.href)) allLinks.push(link.href);
      if (pages.length + queue.length >= MAX_PAGES) continue;
      if (seen.has(link.href) || queue.includes(link.href)) continue;
      if (!sameHost(loaded.finalUrl, link.href)) continue;
      if (INTEREST.test(`${link.href} ${link.text}`)) queue.push(link.href);
    }
  }

  const text = pages.map((page) => page.text).join('\n').slice(0, 12_000);
  if (!text) return { pages: [], links: allLinks, text: '', error: 'Page had no readable text' };
  return { pages, links: allLinks, text };
}

async function fetchHtml(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ finalUrl: string; html: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'referral-genie-research/1.0 (practice marketing pages)',
      },
    });
    if (!response.ok) return null;
    const finalUrl = publicHttpUrl(response.url || url);
    if (!finalUrl) return null;
    const type = response.headers.get('content-type') || '';
    if (type && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) return null;
    const html = (await response.text()).slice(0, MAX_PAGE_CHARS);
    return { finalUrl, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sameHost(left: string, right: string): boolean {
  try {
    return new URL(left).hostname === new URL(right).hostname;
  } catch {
    return false;
  }
}
