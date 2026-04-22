'use client';

import { useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import type { NewsItem } from '@reflect-live/shared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionTag } from '@/components/section-tag';
import { relativeTime } from '@/lib/format';
import { ExternalLink } from 'lucide-react';

const SOURCE_LABEL: Record<string, string> = {
  swimswam: 'SWIMSWAM',
};

function clockStamp(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * NewsFeed — "THE BROADCAST"
 *
 * A mini-newsroom ticker pulling external sport headlines. Each row is a
 * clipped time stamp, a small source badge, and a tight headline with a
 * two-line summary. Feels like an AP wire, not a social card.
 */
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
      const { data } = await sb
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(25);
      if (!cancelled && data) setItems(data as NewsItem[]);
    })();
    const ch = sb
      .channel('news')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_items' },
        (p) => {
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
        },
      )
      .subscribe();
    return () => {
      mountedRef.current = false;
      cancelled = true;
      sb.removeChannel(ch);
    };
  }, [sb]);

  return (
    <div className="panel overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <SectionTag
          code="04."
          name="The broadcast"
          right={
            <span className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
              {items.length} STORIES · 30M CYCLE
            </span>
          }
        />
        <p className="mt-2 text-xs text-[color:var(--bone-mute)]">
          External sport headlines. Refreshes every half-hour.
        </p>
      </div>

      {!items.length ? (
        <div className="border-t border-[color:var(--hairline)] px-6 py-10 text-center">
          <p className="mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
            — no stories yet —
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[440px] border-t border-[color:var(--hairline)]">
          <ul>
            {items.map((it) => (
              <li
                key={it.id}
                className={`border-b border-[color:var(--hairline)]/60 px-5 py-3 transition ${
                  newIds.has(it.id) ? 'slide-in-row' : ''
                }`}
              >
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-4"
                >
                  {/* Time column */}
                  <div className="shrink-0 w-[76px] text-right">
                    <div className="mono text-[0.7rem] text-[color:var(--heritage)] tabular">
                      {clockStamp(it.published_at ?? it.ingested_at)}
                    </div>
                    <div className="mono text-[0.6rem] text-[color:var(--bone-dim)] tabular mt-0.5">
                      {relativeTime(it.published_at ?? it.ingested_at, now)}
                    </div>
                  </div>

                  <div className="shrink-0 w-px self-stretch bg-[color:var(--hairline)]" />

                  {/* Image */}
                  {it.image_url && (
                    <img
                      src={it.image_url}
                      alt=""
                      className="size-14 shrink-0 rounded-sm object-cover border border-[color:var(--hairline)]"
                      loading="lazy"
                    />
                  )}

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[0.62rem] mono uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
                      <span>{SOURCE_LABEL[it.source] ?? it.source}</span>
                      <ExternalLink className="size-3 opacity-0 group-hover:opacity-70 transition" />
                    </div>
                    <div className="mt-1 text-sm font-semibold leading-snug text-[color:var(--bone)] group-hover:text-[color:var(--signal)] transition">
                      {it.title}
                    </div>
                    {it.summary && (
                      <p className="mt-1 text-xs text-[color:var(--bone-mute)] line-clamp-2 leading-snug">
                        {it.summary}
                      </p>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
