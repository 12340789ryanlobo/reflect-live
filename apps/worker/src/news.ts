/**
 * Minimal RSS 2.0 parser — just enough to consume SwimSwam's feed.
 * Avoids pulling in a whole xml library; the feed format is stable enough
 * for regex extraction.
 */

export interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
  imageUrl: string | null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function textOf(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return m ? decodeEntities(stripCdata(m[1])) : null;
}

function extractImage(item: string): string | null {
  const mediaMatch = /<media:(?:content|thumbnail)[^>]*\surl="([^"]+)"/i.exec(item);
  if (mediaMatch) return mediaMatch[1];
  const enclosureMatch = /<enclosure[^>]*\surl="([^"]+)"/i.exec(item);
  if (enclosureMatch) return enclosureMatch[1];
  const imgMatch = /<img[^>]*\ssrc="([^"]+)"/i.exec(item);
  if (imgMatch) return imgMatch[1];
  return null;
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = textOf(block, 'title');
    const link = textOf(block, 'link');
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: textOf(block, 'pubDate'),
      description: textOf(block, 'description'),
      imageUrl: extractImage(block),
    });
  }
  return items;
}

export async function fetchNewsRss(url: string, f: typeof fetch = fetch): Promise<RssItem[]> {
  const res = await f(url, {
    headers: {
      // SwimSwam returns a full feed only with a UA
      'User-Agent': 'reflect-live/1.0 (news poller for UChicago Swim & Dive dashboard)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`);
  return parseRss(await res.text());
}
