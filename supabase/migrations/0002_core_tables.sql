-- Phase 1: locations, groups, assignments, reviews, sync_runs, audit_log, google_credentials

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  gbp_account_id  text not null,
  gbp_location_id text not null unique,
  name            text not null,
  address         text,
  is_active       boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  last_synced_at  timestamptz,
  removed_at      timestamptz
);

create table public.location_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.location_group_members (
  group_id    uuid not null references public.location_groups(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (group_id, location_id)
);

-- An assignment row targets exactly one location OR one group.
create table public.user_locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  group_id    uuid references public.location_groups(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check ((location_id is null) <> (group_id is null)),
  unique nulls not distinct (user_id, location_id, group_id)
);
create index user_locations_user_idx on public.user_locations (user_id);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id),
  gbp_review_id text not null unique,
  reviewer_name text,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  create_time   timestamptz not null,
  update_time   timestamptz,
  reply_comment text,
  reply_time    timestamptz
);
create index reviews_location_time_idx   on public.reviews (location_id, create_time desc);
create index reviews_location_rating_idx on public.reviews (location_id, rating);

create table public.sync_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null check (status in ('running', 'success', 'partial', 'failed')),
  location_id      uuid references public.locations(id), -- null = discovery / whole run
  error            text,
  reviews_upserted integer not null default 0
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id),
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- Single row, service role only.
create table public.google_credentials (
  singleton               boolean primary key default true check (singleton),
  encrypted_refresh_token text not null,
  connected_by            uuid references public.profiles(id),
  updated_at              timestamptz not null default now()
);

create function public.can_access_location(loc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_approved() and exists (
      select 1 from public.user_locations ul
      where ul.user_id = auth.uid()
        and (ul.location_id = loc
             or ul.group_id in (select group_id from public.location_group_members where location_id = loc))
    ))
$$;
