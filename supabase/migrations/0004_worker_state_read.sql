-- Phase 2.4 — allow authenticated reads of worker_state so the dashboard can render its health card
alter table worker_state enable row level security;
drop policy if exists "worker_state readable" on worker_state;
create policy "worker_state readable" on worker_state
  for select to authenticated using (true);
