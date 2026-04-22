import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchNewsRss } from './news';

const SOURCES: Array<{ source: string; url: string }> = [
  { source: 'swimswam', url: 'https://swimswam.com/feed/' },
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(s: string | null, n: number): string | null {
  if (!s) return null;
  const clean = stripHtml(s);
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

export async function pollNewsOnce(sb: SupabaseClient): Promise<number> {
  let total = 0;
  for (const { source, url } of SOURCES) {
    try {
      const items = await fetchNewsRss(url);
      const rows = items.slice(0, 25).map((it) => ({
        source,
        title: it.title,
        url: it.link,
        summary: truncate(it.description, 280),
        image_url: it.imageUrl,
        published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      }));
      if (!rows.length) continue;

      const { error } = await sb
        .from('news_items')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: true });
      if (error) {
        console.error(`[news:${source}] upsert failed: ${error.message}`);
        continue;
      }
      total += rows.length;
    } catch (err) {
      console.error(`[news:${source}] fetch failed:`, err instanceof Error ? err.message : err);
    }
  }
  return total;
}
