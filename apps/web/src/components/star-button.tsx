'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/lib/supabase-browser';

export function StarButton({ playerId, initial }: { playerId: number; initial: boolean }) {
  const sb = useSupabase();
  const [starred, setStarred] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const { data: pref } = await sb.from('user_preferences').select('clerk_user_id, watchlist').maybeSingle();
    if (!pref) { setBusy(false); return; }
    const current: number[] = pref.watchlist ?? [];
    const next = starred ? current.filter((id) => id !== playerId) : [...current, playerId];
    await sb.from('user_preferences').update({ watchlist: next, updated_at: new Date().toISOString() }).eq('clerk_user_id', pref.clerk_user_id);
    setStarred(!starred);
    setBusy(false);
  }

  return (
    <Button variant={starred ? 'default' : 'outline'} size="sm" onClick={toggle} disabled={busy}>
      <Star className={`size-4 ${starred ? 'fill-current' : ''}`} />
      {starred ? 'Starred' : 'Star'}
    </Button>
  );
}
