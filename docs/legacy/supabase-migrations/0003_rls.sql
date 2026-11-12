-- Phase 1: Row Level Security (second layer behind API checks)

alter table public.profiles               enable row level security;
alter table public.locations              enable row level security;
alter table public.location_groups        enable row level security;
alter table public.location_group_members enable row level security;
alter table public.user_locations         enable row level security;
alter table public.reviews                enable row level security;
alter table public.sync_runs              enable row level security;
alter table public.audit_log              enable row level security;
alter table public.google_credentials     enable row level security; -- no policies: service role only

-- profiles: own row, admins all. No INSERT/DELETE policy; no non-admin UPDATE policy.
create policy profiles_read_own     on public.profiles for select using (id = auth.uid());
create policy profiles_admin_read   on public.profiles for select using (public.is_admin());
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- locations / reviews: approved users, scoped by assignment; admins see all
create policy locations_read on public.locations for select using (public.can_access_location(id));
create policy locations_admin_update on public.locations for update
  using (public.is_admin()) with check (public.is_admin());
create policy reviews_read on public.reviews for select using (public.can_access_location(location_id));

-- groups
create policy groups_read on public.location_groups for select using (
  public.is_admin() or exists (
    select 1 from public.user_locations ul
    where ul.user_id = auth.uid() and ul.group_id = location_groups.id));
create policy groups_admin_write on public.location_groups for all
  using (public.is_admin()) with check (public.is_admin());
create policy members_read on public.location_group_members for select
  using (public.can_access_location(location_id));
create policy members_admin_write on public.location_group_members for all
  using (public.is_admin()) with check (public.is_admin());

-- user_locations: own rows (if approved), admins manage
create policy ul_read_own  on public.user_locations for select
  using (user_id = auth.uid() and public.is_approved());
create policy ul_admin_all on public.user_locations for all
  using (public.is_admin()) with check (public.is_admin());

-- sync_runs: approved users read; the API redacts `error` for non-admins. Writes: service role only.
create policy sync_runs_read on public.sync_runs for select using (public.is_approved());

-- audit_log: admin read + admin insert as self. No update/delete.
create policy audit_admin_read   on public.audit_log for select using (public.is_admin());
create policy audit_admin_insert on public.audit_log for insert
  with check (public.is_admin() and actor_id = auth.uid());

-- reviews / locations (insert) / sync_runs writes: no policies => service role only.

-- Belt and braces: no direct table privileges for anon on anything.
revoke all on all tables in schema public from anon;
