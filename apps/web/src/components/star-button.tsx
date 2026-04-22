'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useSupabase } from '@/lib/supabase-browser';
import { cn } from '@/lib/utils';

export function StarButton({ playerId, initial }: { playerId: number; initial: boolean }) {
  const sb = useSupabase();
  const [starred, setStarred] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const { data: pref } = await sb
      .from('user_preferences')
      .select('clerk_user_id, watchlist')
      .maybeSingle();
    if (!pref) {
      setBusy(false);
      return;
    }
    const current: number[] = pref.watchlist ?? [];
    const next = starred ? current.filter((id) => id !== playerId) : [...current, playerId];
    await sb
      .from('user_preferences')
      .update({ watchlist: next, updated_at: new Date().toISOString() })
      .eq('clerk_user_id', pref.clerk_user_id);
    setStarred(!starred);
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-60',
        starred
          ? 'border-[color:var(--signal)] bg-[hsl(188_60%_20%_/_0.4)] text-[color:var(--signal)] hover:bg-[hsl(188_60%_26%_/_0.5)]'
          : 'border-[color:var(--hairline-strong)] text-[color:var(--bone-soft)] hover:border-[color:var(--signal)] hover:text-[color:var(--signal)]',
      )}
    >
      <Star className={cn('size-3.5', starred && 'fill-current')} />
      {starred ? 'Starred' : 'Star'}
    </button>
  );
}
