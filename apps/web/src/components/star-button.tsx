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
    const { data: pref } = await sb.from('user_preferences').select('clerk_user_id, watchlist').maybeSingle();
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
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60',
        starred
          ? 'bg-[color:var(--blue-soft)] border-[color:var(--blue-soft-2)] text-[color:var(--blue)] hover:bg-[color:var(--blue-soft-2)]'
          : 'border-[color:var(--border)] text-[color:var(--ink-soft)] hover:border-[color:var(--blue)] hover:text-[color:var(--blue)]',
      )}
    >
      <Star className={cn('size-3.5', starred && 'fill-current')} />
      {starred ? 'Starred' : 'Star'}
    </button>
  );
}
