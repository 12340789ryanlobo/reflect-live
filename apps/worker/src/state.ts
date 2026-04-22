import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkerState } from '@reflect-live/shared';

export async function getWorkerState(sb: SupabaseClient): Promise<WorkerState> {
  const { data, error } = await sb.from('worker_state').select('*').eq('id', 1).single();
  if (error) throw error;
  return data as WorkerState;
}

export async function updateWorkerState(
  sb: SupabaseClient,
  patch: Partial<Omit<WorkerState, 'id'>>,
): Promise<void> {
  const { error } = await sb.from('worker_state').update(patch).eq('id', 1);
  if (error) throw error;
}
