-- Security hardening (review of Nov 2026). Safe to run once; every statement can be re-run.

-- 1) Extraction runs: admins see all; others only runs of locations they can access (a run without a location is
--    admin-only). Before, any approved user could read every run, including error text, straight from Supabase's Data API.
drop policy if exists sync_runs_read on public.sync_runs;
create policy sync_runs_read on public.sync_runs for select
  using (public.is_admin() or location_id in (select public.accessible_location_ids()));

-- 2) Groups: only approved users (a rejected user with leftover assignments could read group names).
drop policy if exists groups_read on public.location_groups;
create policy groups_read on public.location_groups for select using (
  public.is_admin() or (public.is_approved() and exists (
    select 1 from public.user_locations ul
    where ul.user_id = auth.uid() and ul.group_id = location_groups.id)));

-- 3) Managers run extractions but have no INSERT right on audit_log (admins only), so the audit write after a paid run
--    failed. This function lets any approved user record exactly one kind of entry, as themselves.
create or replace function public.log_action(p_action text, p_target text, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target, details)
  select auth.uid(), p_action, left(p_target, 100), p_details
  where public.is_approved() and p_action = 'extract.run'
$$;

-- 4) Helper functions: callable by signed-in users only (policies need that), never by the anonymous role.
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_admin()', 'public.is_approved()', 'public.can_access_location(uuid)',
    'public.touch_last_seen(text)', 'public.log_action(text, text, jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

-- 5) A name typed straight into Supabase Auth is capped like the app's own signup form (100 characters).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(new.raw_user_meta_data ->> 'full_name', 100));
  return new;
end $$;
