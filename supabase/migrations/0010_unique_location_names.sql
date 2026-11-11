-- No two locations may share a name (ignoring case and surrounding spaces): the name is what the locations table and
-- the CSV's branch column show when no branch prefix is set, so duplicates would be indistinguishable.
-- (The same Maps place can't be added twice either: gbp_location_id is already unique and holds the place's CID.)
-- Fails if existing locations already share a name: rename one of them first.
create unique index if not exists locations_name_unique on public.locations (lower(btrim(name)));
