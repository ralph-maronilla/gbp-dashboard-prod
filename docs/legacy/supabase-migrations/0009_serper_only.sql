-- Serper is the only review source: remove mock data and the Business Profile API parts,
-- and lock per location so several extractions can run at the same time on different locations.

-- 1. Mock data (reviews and sync_runs have no ON DELETE CASCADE, so they go first).
delete from public.reviews   where location_id in (select id from public.locations where gbp_location_id like 'mock:%');
delete from public.sync_runs where location_id in (select id from public.locations where gbp_location_id like 'mock:%');
delete from public.locations where gbp_location_id like 'mock:%'; -- cascades group members and user assignments
delete from public.location_groups where name like '[mock] %';

-- 2. Business Profile API.
drop table if exists public.google_credentials;
alter table public.location_groups drop column if exists gbp_account_id;

-- 3. Per-location claim: a location is extracted by one run at a time; expired claims free themselves.
alter table public.locations add column if not exists sync_locked_until timestamptz;
