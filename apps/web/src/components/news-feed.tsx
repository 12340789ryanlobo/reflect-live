'use client';

import { useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/lib/supabase-browser';
import type { NewsItem } from '@reflect-live/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { relativeTime } from '@/lib/format';
import { ExternalLink, Newspaper } from 'lucide-react';

const SOURCE_LABEL: Record<string, string> = {
  swimswam: 'SwimSwam',
};

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
    const ch = sb.channel('news').on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'news_items' },
      (p) => {
        const next = p.new as NewsItem;
        setItems((prev) => [next, ...prev].slice(0, 50));
        setNewIds((prev) => new Set(prev).add(next.id));
        setTimeout(() => {
          if (!mountedRef.current) return;
          setNewIds((prev) => { const n = new Set(prev); n.delete(next.id); return n; });
        }, 2200);
      }).subscribe();
    return () => { mountedRef.current = false; cancelled = true; sb.removeChannel(ch); };
  }, [sb]);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="h-serif text-lg flex items-center gap-2">
              <Newspaper className="size-4 text-primary" />
              Swim news
            </CardTitle>
            <CardDescription>Pulled from SwimSwam every 30 minutes</CardDescription>
          </div>
          <Badge variant="outline">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!items.length ? (
          <p className="px-6 pb-6 text-sm italic text-muted-foreground">No headlines yet. The worker pulls fresh stories on a 30-minute cycle.</p>
        ) : (
          <ScrollArea className="h-[440px]">
            <ul className="divide-y">
              {items.map((it) => (
                <li
                  key={it.id}
                  className={`px-5 py-3 transition ${newIds.has(it.id) ? 'slide-in-row' : ''}`}
                >
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3"
                  >
                    {it.image_url && (
                      <img
                        src={it.image_url}
                        alt=""
                        className="size-14 shrink-0 rounded-md object-cover border bg-muted"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="uppercase tracking-wide font-medium">{SOURCE_LABEL[it.source] ?? it.source}</span>
                        <span>·</span>
                        <span className="tabular">{relativeTime(it.published_at ?? it.ingested_at, now)}</span>
                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-70 transition" />
                      </div>
                      <div className="mt-0.5 text-sm font-medium leading-snug group-hover:underline">{it.title}</div>
                      {it.summary && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-snug">
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
      </CardContent>
    </Card>
  );
}
