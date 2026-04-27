'use client';
import { useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import type { NewsItem } from '@reflect-live/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink } from 'lucide-react';
import { relativeTime } from '@/lib/format';

const SOURCE_LABEL: Record<string, string> = { swimswam: 'SwimSwam' };

export function NewsFeed() {
  const sb = useSupabase();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const { data } = await sb.from('news_items').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(25);
      if (!cancelled && data) setItems(data as NewsItem[]);
    })();
    const ch = sb
      .channel('news')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_items' }, (p) => {
        const next = p.new as NewsItem;
        setItems((prev) => [next, ...prev].slice(0, 50));
        setNewIds((prev) => new Set(prev).add(next.id));
        setTimeout(() => {
          if (!mountedRef.current) return;
          setNewIds((prev) => {
            const n = new Set(prev);
            n.delete(next.id);
            return n;
          });
        }, 2200);
      })
      .subscribe();
    return () => {
      mountedRef.current = false;
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [sb]);

  return (
    <section className="rounded-2xl bg-[color:var(--card)] border" style={{ borderColor: 'var(--border)' }}>
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-bold text-[color:var(--ink)]">News</h2>
        <span className="text-[11.5px] text-[color:var(--ink-mute)]">{items.length} · 30m cycle</span>
      </header>
      {!items.length ? (
        <div className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">— no stories yet —</div>
      ) : (
        <ScrollArea className="h-[460px]">
          {items.map((it) => (
            <a
              key={it.id}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-start gap-4 px-6 py-3.5 border-b last:border-b-0 transition hover:bg-[color:var(--card-hover)] ${newIds.has(it.id) ? 'slide-in-row' : ''}`}
              style={{ borderColor: 'var(--border)' }}
            >
              {it.image_url && (
                <img src={it.image_url} alt="" className="size-14 shrink-0 rounded-md object-cover border" style={{ borderColor: 'var(--border)' }} loading="lazy" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wide text-[color:var(--ink-mute)] font-semibold">
                  <span>{SOURCE_LABEL[it.source] ?? it.source}</span>
                  <span>·</span>
                  <span className="tabular">{relativeTime(it.published_at ?? it.ingested_at, now)}</span>
                </div>
                <div className="mt-1 text-[14px] font-semibold text-[color:var(--ink)] hover:text-[color:var(--blue)] transition">{it.title}</div>
                {it.summary && <p className="mt-1 text-[12.5px] text-[color:var(--ink-mute)] line-clamp-2 leading-snug">{it.summary}</p>}
              </div>
              <ExternalLink className="size-3.5 text-[color:var(--ink-mute)]" />
            </a>
          ))}
        </ScrollArea>
      )}
    </section>
  );
}
