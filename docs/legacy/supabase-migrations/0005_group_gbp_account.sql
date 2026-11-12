-- A group can mirror one Google Business Profile account (a "client"). Sync creates these and keeps their
-- membership up to date; null = a group an admin created by hand. Existing RLS policies apply unchanged.
alter table public.location_groups add column gbp_account_id text unique;
