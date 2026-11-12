-- Reporting groups for the Dashboard (Reputation and Review Intelligence tabs): where a location is (Metro North,
-- Visayas, ...) and what it is (Hospital, Clinic, ...). Set by admins in the location edit dialog; null = Unassigned.
alter table public.locations add column if not exists region text;
alter table public.locations add column if not exists location_type text;
alter table public.locations drop constraint if exists locations_region_len;
alter table public.locations add constraint locations_region_len check (region is null or char_length(region) between 1 and 50);
alter table public.locations drop constraint if exists locations_type_len;
alter table public.locations add constraint locations_type_len check (location_type is null or char_length(location_type) between 1 and 50);
