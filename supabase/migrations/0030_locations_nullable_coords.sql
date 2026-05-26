-- 0030: make locations.lat / lon nullable so coaches can add events
-- from the UI without hunting down coordinates.
--
-- Coords were NOT NULL because every location seeded by
-- scripts/seed-locations.ts had them (they drive the weather poll).
-- Now that coaches add events themselves, an event is useful with
-- just a name + date; weather is opt-in. A location with null coords
-- is simply skipped by the worker's weather poll (see
-- apps/worker/src/poll-weather.ts — filters `lat is not null`).
--
-- When a coach DOES want weather, the /api/locations route geocodes
-- the place name via Open-Meteo's keyless geocoding API and fills
-- lat/lon, so the NOT NULL constraint was never actually protecting
-- a real invariant — it just blocked the no-coords case.

alter table locations
  alter column lat drop not null,
  alter column lon drop not null;

comment on column locations.lat is
  'Latitude for the weather poll. NULL = no weather tracking for this location (event still shows in the Events page).';
comment on column locations.lon is
  'Longitude for the weather poll. NULL = no weather tracking.';
