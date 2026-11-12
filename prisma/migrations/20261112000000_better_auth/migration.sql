-- Better Auth tables (accounts, sessions, passwords, one-time tokens), plus the link to `profiles`.
-- `profiles` stays the authorization table (role, status, per-location access); these tables only prove who someone is.
-- app_user gets NO access to them: only the privileged app connection (Better Auth itself) reads or writes them.

CREATE TABLE public.auth_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT auth_user_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX auth_user_email_key ON public.auth_user USING btree (email);

CREATE TABLE public.auth_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id uuid NOT NULL,
    CONSTRAINT auth_session_pkey PRIMARY KEY (id),
    CONSTRAINT auth_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX auth_session_token_key ON public.auth_session USING btree (token);
CREATE INDEX auth_session_user_id_idx ON public.auth_session USING btree (user_id);

CREATE TABLE public.auth_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp(3) with time zone,
    refresh_token_expires_at timestamp(3) with time zone,
    scope text,
    password text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone NOT NULL,
    CONSTRAINT auth_account_pkey PRIMARY KEY (id),
    CONSTRAINT auth_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_account_user_id_idx ON public.auth_account USING btree (user_id);

CREATE TABLE public.auth_verification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT auth_verification_pkey PRIMARY KEY (id)
);
CREATE INDEX auth_verification_identifier_idx ON public.auth_verification USING btree (identifier);

-- Defense in depth: no policies, so even a role that somehow gained table privileges sees nothing.
ALTER TABLE public.auth_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_user, public.auth_session, public.auth_account, public.auth_verification FROM PUBLIC;

-- Every account gets a profile: viewer + pending until an admin approves it (as handle_new_user() did on Supabase).
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, left(nullif(btrim(new.name), ''), 100));
  return new;
end $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON public.auth_user
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- A profile cannot outlive its account.
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.auth_user(id) ON DELETE CASCADE;
