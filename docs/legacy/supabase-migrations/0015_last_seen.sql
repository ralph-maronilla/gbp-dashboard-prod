-- Who is using the app: each signed-in browser reports in about once an hour (and when the app is opened).
-- last_seen_at is when, last_path is which page. One row per user, overwritten: no history is kept.
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists last_path text;

-- Users have no UPDATE policy on profiles (only admins do), so this narrow function is the one thing a user may write
-- about themselves. It touches only these two columns of the caller's own row and ignores anyone who is not approved.
create or replace function public.touch_last_seen(p_path text) returns void
language sql security definer set search_path = '' as $$
  update public.profiles
     set last_seen_at = now(), last_path = left(p_path, 200)
   where id = auth.uid() and status = 'approved'
$$;

revoke all on function public.touch_last_seen(text) from public;
grant execute on function public.touch_last_seen(text) to authenticated;
