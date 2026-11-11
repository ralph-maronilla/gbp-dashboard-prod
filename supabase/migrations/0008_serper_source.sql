-- Review extraction via Serper (until Business Profile API access is approved).
-- Serper locations are registered by admins and stored with gbp_location_id 'serper:<cid>'.
alter table public.locations
  add column sync_cursor           text,         -- next page token while a backfill is in progress
  add column backfill_completed_at timestamptz,  -- set once every page has been read
  add column source_review_count   integer;      -- Google's own review count, for a completeness check
alter table public.sync_runs
  add column credits_used integer not null default 0;
