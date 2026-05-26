-- 0032: let coaches flag key events. Mirrors reflect's is_pinned —
-- pinned events surface in a 'Key events' group at the top of the
-- Events timeline (and read as more important) rather than sitting in
-- their normal time bucket.
--
-- Boolean, default false: existing events stay unpinned.

alter table locations
  add column if not exists is_pinned boolean not null default false;

comment on column locations.is_pinned is
  'Coach-flagged key event. Pinned events render in a highlighted "Key events" group at the top of the Events page.';
