-- Automatic extraction: an admin turns it on and picks a time of day (Manila time). A scheduler (Supabase pg_cron, see
-- README) calls /api/cron/sync every 15 minutes; the first call at or after the chosen time claims the day's run by
-- setting auto_last_run_on, so it runs once a day. One row (id = 1) holds the settings.
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  auto_extract_enabled boolean not null default false,
  -- "HH:MM" in Manila time, in 15-minute steps.
  auto_extract_time text not null default '06:00' check (auto_extract_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'),
  -- Credits the automatic run (with its follow-up runs) may spend per day, within SERPER_DAILY_CREDIT_LIMIT.
  auto_extract_credit_limit integer not null default 300 check (auto_extract_credit_limit between 0 and 5000),
  -- Manila date of the last claimed automatic run, and when it was claimed.
  auto_last_run_on date,
  auto_last_run_at timestamptz,
  -- Last call from the scheduler (shows whether the Supabase job is set up).
  scheduler_last_tick_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_read on public.app_settings;
create policy app_settings_admin_read on public.app_settings for select to authenticated using (public.is_admin());

drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.app_settings from anon;
grant select, update on public.app_settings to authenticated;
