-- The Google account that was connected (shown on Overview). Captured at consent time via the `email` scope.
-- Existing connections have null until an admin reconnects once. Table stays service-role only.
alter table public.google_credentials add column google_email text;
