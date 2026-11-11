-- Short branch code an admin sets per location (e.g. "HMN-QC"); used in the review CSV export.
-- Existing RLS applies: locations_admin_update lets only admins change it.
alter table public.locations add column branch_prefix text;
