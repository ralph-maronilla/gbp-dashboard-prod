-- Phase 1: enums, profiles, signup trigger, privileged-column guard

create type public.user_role   as enum ('admin', 'manager', 'viewer');
create type public.user_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.user_role   not null default 'viewer',
  status      public.user_status not null default 'pending',
  created_at  timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz
);

-- Every new auth user becomes viewer + pending, whatever the client sends.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper functions (security definer so policies never recurse into profiles RLS)
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved')
$$;

create function public.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved')
$$;

-- Defense in depth: only admins or the service role (auth.uid() is null) may change
-- privileged columns. Complements the missing non-admin UPDATE policy.
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.id, new.email, new.role, new.status, new.approved_by, new.approved_at)
         is distinct from
         (old.id, old.email, old.role, old.status, old.approved_by, old.approved_at) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();
