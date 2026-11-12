-- Serper credits: reserve before spending, and a per-person daily cap.
-- Before, each run read "credits left today" once and spent from it, so two runs at the same moment could both spend
-- the same remainder, and one person could use the whole shared budget.

-- Who started a run (null for machine runs), and how many credits it has reserved so far. Today's spend counts
-- greatest(credits_used, credits_reserved) per run, so a reservation is "spent" until the run settles it.
alter table public.sync_runs add column if not exists credits_reserved integer not null default 0;
alter table public.sync_runs add column if not exists started_by uuid references public.profiles(id) on delete set null;
create index if not exists sync_runs_started_by_idx on public.sync_runs (started_by, started_at) where location_id is null;

-- Grants up to p_want credits to run p_run: never past the shared daily limit, nor (when p_user_daily is given and the
-- run has a starter) past that person's daily limit. One reservation at a time across all servers (advisory lock), so
-- concurrent runs cannot overshoot. Day = UTC day, like the rest of the credit accounting.
-- limited_by: 'daily' or 'user' when that limit cut the grant, else null.
create or replace function public.reserve_credits(p_run uuid, p_want integer, p_daily integer, p_user_daily integer,
                                                  out granted integer, out limited_by text)
language plpgsql security definer set search_path = '' as $$
declare
  v_day  timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_user uuid;
  v_left integer;
  v_user_left integer;
begin
  perform pg_advisory_xact_lock(hashtext('serper-credits'));
  select started_by into v_user from public.sync_runs where id = p_run;

  select p_daily - coalesce(sum(greatest(credits_used, credits_reserved)), 0) into v_left
  from public.sync_runs where location_id is null and started_at >= v_day;
  granted := least(p_want, v_left);
  limited_by := case when v_left < p_want then 'daily' end;

  if p_user_daily is not null and v_user is not null then
    select p_user_daily - coalesce(sum(greatest(credits_used, credits_reserved)), 0) into v_user_left
    from public.sync_runs where location_id is null and started_at >= v_day and started_by = v_user;
    if v_user_left < granted then
      granted := v_user_left;
      limited_by := 'user';
    end if;
  end if;

  granted := greatest(granted, 0);
  update public.sync_runs set credits_reserved = credits_reserved + granted where id = p_run;
end $$;

-- Server-side only (the extraction engine uses the privileged connection); no signed-in user may call it.
revoke all on function public.reserve_credits(uuid, integer, integer, integer) from public, anon, authenticated;
