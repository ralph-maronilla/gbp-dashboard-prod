-- Baseline: the production schema as of 2026-11-11 (docs/legacy/supabase-migrations 0001-0021), ported to plain PostgreSQL.
--
-- What changed from the Supabase version:
--   * auth.uid()                    -> app.uid(), which reads the transaction-local setting `app.user_id`.
--   * the `authenticated` role      -> `app_user` (NOLOGIN). The app connects as the schema owner (bypasses RLS) and
--                                      switches to `app_user` inside a transaction for user-driven queries (withRls).
--   * profiles.id -> auth.users FK, handle_new_user() and the rls_auto_enable event trigger are NOT here: the auth
--     tables arrive with Better Auth in the next migration, and event triggers need superuser rights.
-- Everything else (tables, constraints, indexes, function bodies, policies) is identical to production.

-- ---------------------------------------------------------------------------------------------------------------
-- Roles and the per-request user id
-- ---------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOINHERIT;
  END IF;
END $$;

-- The migration owner (the role the app connects as) must be able to SET ROLE app_user.
GRANT app_user TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- The caller's id for RLS. NULL when unset (the privileged app connection, migrations, the scheduler).
CREATE FUNCTION app.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app.uid() TO app_user;

-- ---------------------------------------------------------------------------------------------------------------
-- Types, sequence, tables
-- ---------------------------------------------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'viewer');
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'rejected');

CREATE SEQUENCE public.reviews_reference_no_seq
    AS integer START WITH 100000 INCREMENT BY 1 MINVALUE 100000 MAXVALUE 999999 CACHE 1;

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.user_role DEFAULT 'viewer'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'pending'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    last_path text,
    can_extract boolean DEFAULT false NOT NULL
);

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gbp_account_id text NOT NULL,
    gbp_location_id text NOT NULL,
    name text NOT NULL,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_synced_at timestamp with time zone,
    removed_at timestamp with time zone,
    branch_prefix text,
    sync_cursor text,
    backfill_completed_at timestamp with time zone,
    source_review_count integer,
    sync_locked_until timestamp with time zone,
    region text,
    location_type text,
    google_rating numeric(2,1),
    google_checked_at timestamp with time zone,
    CONSTRAINT locations_region_valid CHECK (((region IS NULL) OR (region = ANY (ARRAY['NCR'::text, 'CAR'::text, 'I'::text, 'II'::text, 'III'::text, 'IV-A'::text, 'MIMAROPA'::text, 'V'::text, 'VI'::text, 'VII'::text, 'VIII'::text, 'NIR'::text, 'IX'::text, 'X'::text, 'XI'::text, 'XII'::text, 'XIII'::text, 'BARMM'::text])))),
    CONSTRAINT locations_type_len CHECK (((location_type IS NULL) OR ((char_length(location_type) >= 1) AND (char_length(location_type) <= 50))))
);

CREATE TABLE public.location_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.location_group_members (
    group_id uuid NOT NULL,
    location_id uuid NOT NULL
);

CREATE TABLE public.user_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    location_id uuid,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_locations_check CHECK (((location_id IS NULL) <> (group_id IS NULL)))
);

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id uuid NOT NULL,
    gbp_review_id text NOT NULL,
    reviewer_name text,
    rating smallint NOT NULL,
    comment text,
    create_time timestamp with time zone NOT NULL,
    update_time timestamp with time zone,
    reply_comment text,
    reply_time timestamp with time zone,
    reference_no integer DEFAULT nextval('public.reviews_reference_no_seq'::regclass) NOT NULL,
    reviewer_url text,
    reply_seen_at timestamp with time zone,
    reply_time_source text,
    reply_hours double precision GENERATED ALWAYS AS ((EXTRACT(epoch FROM (reply_time - create_time)) / 3600.0)) STORED,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_reply_time_source_valid CHECK (((reply_time_source IS NULL) OR (reply_time_source = ANY (ARRAY['observed'::text, 'relative'::text]))))
);

CREATE TABLE public.sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    location_id uuid,
    error text,
    reviews_upserted integer DEFAULT 0 NOT NULL,
    credits_used integer DEFAULT 0 NOT NULL,
    kind text DEFAULT 'extract'::text NOT NULL,
    credits_reserved integer DEFAULT 0 NOT NULL,
    started_by uuid,
    CONSTRAINT sync_runs_kind_valid CHECK ((kind = ANY (ARRAY['extract'::text, 'google_refresh'::text]))),
    CONSTRAINT sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial'::text, 'failed'::text])))
);

CREATE TABLE public.audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_settings (
    id smallint DEFAULT 1 NOT NULL,
    auto_extract_enabled boolean DEFAULT false NOT NULL,
    auto_extract_time text DEFAULT '06:00'::text NOT NULL,
    auto_extract_credit_limit integer DEFAULT 300 NOT NULL,
    auto_last_run_on date,
    auto_last_run_at timestamp with time zone,
    scheduler_last_tick_at timestamp with time zone,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_settings_auto_extract_credit_limit_check CHECK (((auto_extract_credit_limit >= 0) AND (auto_extract_credit_limit <= 5000))),
    CONSTRAINT app_settings_auto_extract_time_check CHECK ((auto_extract_time ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'::text)),
    CONSTRAINT app_settings_id_check CHECK ((id = 1))
);

-- ---------------------------------------------------------------------------------------------------------------
-- Keys, indexes, foreign keys
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE ONLY public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.location_group_members ADD CONSTRAINT location_group_members_pkey PRIMARY KEY (group_id, location_id);
ALTER TABLE ONLY public.location_groups ADD CONSTRAINT location_groups_name_key UNIQUE (name);
ALTER TABLE ONLY public.location_groups ADD CONSTRAINT location_groups_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.locations ADD CONSTRAINT locations_gbp_location_id_key UNIQUE (gbp_location_id);
ALTER TABLE ONLY public.locations ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_gbp_review_id_key UNIQUE (gbp_review_id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sync_runs ADD CONSTRAINT sync_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_locations ADD CONSTRAINT user_locations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_locations ADD CONSTRAINT user_locations_user_id_location_id_group_id_key UNIQUE NULLS NOT DISTINCT (user_id, location_id, group_id);

CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at DESC);
CREATE UNIQUE INDEX locations_name_unique ON public.locations USING btree (lower(btrim(name)));
CREATE INDEX reviews_location_rating_idx ON public.reviews USING btree (location_id, rating);
CREATE INDEX reviews_location_time_idx ON public.reviews USING btree (location_id, create_time DESC);
CREATE UNIQUE INDEX reviews_reference_no_key ON public.reviews USING btree (reference_no);
CREATE INDEX sync_runs_started_by_idx ON public.sync_runs USING btree (started_by, started_at) WHERE (location_id IS NULL);
CREATE INDEX user_locations_user_idx ON public.user_locations USING btree (user_id);

ALTER TABLE ONLY public.app_settings ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.location_group_members ADD CONSTRAINT location_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.location_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.location_group_members ADD CONSTRAINT location_group_members_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.location_groups ADD CONSTRAINT location_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);
ALTER TABLE ONLY public.sync_runs ADD CONSTRAINT sync_runs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);
ALTER TABLE ONLY public.sync_runs ADD CONSTRAINT sync_runs_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.user_locations ADD CONSTRAINT user_locations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.location_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_locations ADD CONSTRAINT user_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_locations ADD CONSTRAINT user_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------
-- Functions (SECURITY DEFINER, empty search_path, as in production; auth.uid() -> app.uid())
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.profiles
    where id = app.uid() and role = 'admin' and status = 'approved')
$$;

CREATE FUNCTION public.is_approved() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.profiles
    where id = app.uid() and status = 'approved')
$$;

CREATE FUNCTION public.accessible_location_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- admins: every location
  select l.id from public.locations l where public.is_admin()
  union
  -- directly assigned locations
  select ul.location_id from public.user_locations ul
  where ul.user_id = app.uid() and ul.location_id is not null and public.is_approved()
  union
  -- locations inside assigned groups
  select m.location_id
  from public.user_locations ul
  join public.location_group_members m on m.group_id = ul.group_id
  where ul.user_id = app.uid() and public.is_approved()
$$;

CREATE FUNCTION public.can_access_location(loc uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin() or (
    public.is_approved() and exists (
      select 1 from public.user_locations ul
      where ul.user_id = app.uid()
        and (ul.location_id = loc
             or ul.group_id in (select group_id from public.location_group_members where location_id = loc))
    ))
$$;

CREATE FUNCTION public.auto_extract_schedule() RETURNS TABLE(enabled boolean, run_time text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.auto_extract_enabled, s.auto_extract_time
  from public.app_settings s
  where s.id = 1 and public.is_approved()
$$;

CREATE FUNCTION public.log_action(p_action text, p_target text, p_details jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.audit_log (actor_id, action, target, details)
  select app.uid(), p_action, left(p_target, 100), p_details
  where public.is_approved() and p_action = 'extract.run'
$$;

CREATE FUNCTION public.touch_last_seen(p_path text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.profiles
     set last_seen_at = now(), last_path = left(p_path, 200)
   where id = app.uid() and status = 'approved'
$$;

-- Only admins (or the privileged connection, where app.uid() is NULL) may change privileged profile columns.
CREATE FUNCTION public.guard_profile_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if app.uid() is not null and not public.is_admin()
     and (new.id, new.email, new.role, new.status, new.approved_by, new.approved_at, new.can_extract)
         is distinct from
         (old.id, old.email, old.role, old.status, old.approved_by, old.approved_at, old.can_extract) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- Credit reservation: privileged connection only (no grant to app_user).
CREATE FUNCTION public.reserve_credits(p_run uuid, p_want integer, p_daily integer, p_user_daily integer, OUT granted integer, OUT limited_by text) RETURNS record
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_admin_read ON public.app_settings FOR SELECT TO app_user USING (public.is_admin());
CREATE POLICY app_settings_admin_update ON public.app_settings FOR UPDATE TO app_user USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY audit_admin_insert ON public.audit_log FOR INSERT WITH CHECK ((public.is_admin() AND (actor_id = app.uid())));
CREATE POLICY audit_admin_read ON public.audit_log FOR SELECT USING (public.is_admin());

CREATE POLICY groups_admin_write ON public.location_groups USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY groups_read ON public.location_groups FOR SELECT USING ((public.is_admin() OR (public.is_approved() AND (EXISTS ( SELECT 1
   FROM public.user_locations ul
  WHERE ((ul.user_id = app.uid()) AND (ul.group_id = location_groups.id)))))));

CREATE POLICY locations_admin_update ON public.locations FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY locations_read ON public.locations FOR SELECT USING ((id IN ( SELECT public.accessible_location_ids() AS accessible_location_ids)));

CREATE POLICY members_admin_write ON public.location_group_members USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY members_read ON public.location_group_members FOR SELECT USING ((location_id IN ( SELECT public.accessible_location_ids() AS accessible_location_ids)));

CREATE POLICY profiles_admin_read ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY profiles_read_own ON public.profiles FOR SELECT USING ((id = app.uid()));

CREATE POLICY reviews_read ON public.reviews FOR SELECT USING ((location_id IN ( SELECT public.accessible_location_ids() AS accessible_location_ids)));

CREATE POLICY sync_runs_read ON public.sync_runs FOR SELECT USING ((public.is_admin() OR (location_id IN ( SELECT public.accessible_location_ids() AS accessible_location_ids))));

CREATE POLICY ul_admin_all ON public.user_locations USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ul_read_own ON public.user_locations FOR SELECT USING (((user_id = app.uid()) AND public.is_approved()));

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges for app_user (least privilege; the policies above still decide which rows)
-- ---------------------------------------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT SELECT ON public.profiles, public.locations, public.location_groups, public.location_group_members,
                public.user_locations, public.reviews, public.sync_runs, public.audit_log, public.app_settings TO app_user;
GRANT UPDATE ON public.profiles, public.locations, public.app_settings TO app_user;
GRANT INSERT, UPDATE, DELETE ON public.location_groups, public.location_group_members, public.user_locations TO app_user;
GRANT INSERT ON public.audit_log TO app_user;

GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_approved(), public.accessible_location_ids(),
                          public.can_access_location(uuid), public.auto_extract_schedule(),
                          public.log_action(text, text, jsonb), public.touch_last_seen(text) TO app_user;
