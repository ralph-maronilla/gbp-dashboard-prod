-- Manual extraction is for admins and for the users an admin allows (profiles.can_extract). Everyone starts without it,
-- managers included. Automatic extraction stays admin-only; other users can only read when it runs.

alter table public.profiles add column if not exists can_extract boolean not null default false;

-- Only admins (or the service role) may change privileged columns; can_extract is one of them now.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.id, new.email, new.role, new.status, new.approved_by, new.approved_at, new.can_extract)
         is distinct from
         (old.id, old.email, old.role, old.status, old.approved_by, old.approved_at, old.can_extract) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

-- Whether automatic extraction is on and its time (Manila), for any approved user. app_settings itself stays admin-only
-- (it also holds the credit limit and run history).
create or replace function public.auto_extract_schedule()
returns table (enabled boolean, run_time text)
language sql stable security definer set search_path = '' as $$
  select s.auto_extract_enabled, s.auto_extract_time
  from public.app_settings s
  where s.id = 1 and public.is_approved()
$$;

revoke all on function public.auto_extract_schedule() from public, anon;
grant execute on function public.auto_extract_schedule() to authenticated;
