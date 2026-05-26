-- 0031: store the human-readable place label for a location.
--
-- Before this, picking a location in the Events dialog geocoded the
-- place to lat/lon (for the weather poll) but discarded the label —
-- so the UI could show a temperature chip but never WHERE the event
-- was. This column keeps the resolved label (e.g. "Chicago, Illinois,
-- US") so rows + the edit dialog can display the location.
--
-- Nullable: events without weather (no coords) have no label, and
-- legacy seeded events that baked the location into their `name`
-- (e.g. "NCAA DIII Nationals — Indianapolis") just leave it null.

alter table locations
  add column if not exists place_label text;

comment on column locations.place_label is
  'Human-readable resolved place (e.g. "Chicago, Illinois, US") captured when coords are set via the Events dialog geocoder. NULL when no weather location is set.';
