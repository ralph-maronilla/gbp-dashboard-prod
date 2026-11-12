#!/usr/bin/env bash
#
# Copies a Supabase database into a freshly migrated database of this app:
#   - every Supabase user becomes a Better Auth account (same id, email, confirmed flag and bcrypt password hash),
#   - every public table is copied as is (same ids, so profiles, assignments, reviews and runs still line up).
#
# Usage:  scripts/import-supabase.sh <SOURCE_URL> <TARGET_URL> [auth-schema]
#   SOURCE_URL   the Supabase database (read-only use), or a restored copy of it.
#   TARGET_URL   the new database, after `prisma migrate deploy`. Must be EMPTY.
#   auth-schema  "auth" on live Supabase (default); "supabase_auth" in the clean dump made for this project.
#
# Safe to rehearse: it only reads the source, refuses a non-empty target, and runs the whole copy in one transaction.
set -euo pipefail

SRC="${1:?source url}"; DST="${2:?target url}"; AUTH_SCHEMA="${3:-auth}"
PSQL=${PSQL:-psql}; PG_DUMP=${PG_DUMP:-pg_dump}
q() { "$PSQL" "$1" -X -At -v ON_ERROR_STOP=1 -c "$2"; }

echo "== Checking the target is empty"
for t in auth_user profiles reviews locations; do
  n=$(q "$DST" "select count(*) from public.$t")
  [ "$n" = "0" ] || { echo "Target table $t has $n rows. Import into an empty, freshly migrated database only." >&2; exit 1; }
done
q "$DST" "select 1 from pg_roles where rolname = 'app_user'" | grep -q 1 || { echo "Target is not migrated (no app_user role)." >&2; exit 1; }

echo "== Reading the source"
q "$SRC" "select count(*) from $AUTH_SCHEMA.users" >/dev/null
SRC_USERS=$(q "$SRC" "select count(*) from $AUTH_SCHEMA.users where deleted_at is null")
SRC_NOPASS=$(q "$SRC" "select count(*) from $AUTH_SCHEMA.users where deleted_at is null and coalesce(encrypted_password, '') = ''")
SRC_PROVIDERS=$(q "$SRC" "select string_agg(distinct provider, ', ') from $AUTH_SCHEMA.identities")
echo "   users: $SRC_USERS (without a password: $SRC_NOPASS), identity providers: ${SRC_PROVIDERS:-none}"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# Users: copied out as CSV, then loaded below. `name` is the full name the user gave at sign-up (may be empty).
"$PSQL" "$SRC" -X -v ON_ERROR_STOP=1 -c "\copy (
  select id, coalesce(left(btrim(raw_user_meta_data ->> 'full_name'), 100), ''), lower(email), email_confirmed_at is not null,
         coalesce(created_at, now()), coalesce(updated_at, created_at, now()), nullif(encrypted_password, '')
  from $AUTH_SCHEMA.users where deleted_at is null order by created_at
) to '$TMP/users.csv' csv"

# Public tables in dependency order. --data-only keeps the COPY format and the exact values (ids, timestamps).
ORDER="profiles locations location_groups location_group_members user_locations reviews sync_runs audit_log app_settings"
for t in $ORDER; do "$PG_DUMP" "$SRC" -a -t "public.$t" --no-owner --no-privileges -f "$TMP/$t.sql"; done

echo "== Importing (one transaction)"
{
  echo "begin;"
  echo "set local timezone = 'UTC';"
  # The sign-up trigger would create a second, blank profile for each user; profiles are copied from the source instead.
  # The migrations create the one blank settings row; the source's row (the real schedule) replaces it.
  echo "delete from public.app_settings;"
  echo "alter table public.auth_user disable trigger on_auth_user_created;"
  echo "create temp table _u (id uuid, name text, email text, verified boolean, created_at timestamptz, updated_at timestamptz, pw text) on commit drop;"
  echo "\\copy _u from '$TMP/users.csv' csv"
  echo "insert into public.auth_user (id, name, email, email_verified, created_at, updated_at) select id, name, email, verified, created_at, updated_at from _u;"
  # Better Auth's credential account: account_id is the user id, password is the existing bcrypt hash, kept untouched.
  echo "insert into public.auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) select gen_random_uuid(), id::text, 'credential', id, pw, created_at, updated_at from _u where pw is not null;"
  echo "alter table public.auth_user enable trigger on_auth_user_created;"
  for t in $ORDER; do
    # pg_dump wraps COPY data in SET lines and a final setval; keep only what loads rows.
    grep -vE '^(SET|SELECT pg_catalog\.set_config|--|\\restrict|\\unrestrict)' "$TMP/$t.sql" | grep -v '^$'
  done
  # Sequences that are not tied to a column default: continue after the highest value already used.
  echo "select setval('public.reviews_reference_no_seq', greatest((select coalesce(max(reference_no), 100000) from public.reviews), 100000));"
  echo "select setval(pg_get_serial_sequence('public.audit_log', 'id'), greatest((select coalesce(max(id), 1) from public.audit_log), 1));"
  echo "commit;"
} > "$TMP/load.sql"
"$PSQL" "$DST" -X -v ON_ERROR_STOP=1 -q -f "$TMP/load.sql" >/dev/null

echo "== Verifying"
FAIL=0
check() { # name, source count, target count
  if [ "$2" = "$3" ]; then printf '   %-24s %6s  ok\n' "$1" "$3"; else printf '   %-24s source %s, target %s  MISMATCH\n' "$1" "$2" "$3"; FAIL=1; fi
}
for t in $ORDER; do check "$t" "$(q "$SRC" "select count(*) from public.$t")" "$(q "$DST" "select count(*) from public.$t")"; done
check "auth_user" "$SRC_USERS" "$(q "$DST" "select count(*) from public.auth_user")"
check "credentials (passwords)" "$((SRC_USERS - SRC_NOPASS))" "$(q "$DST" "select count(*) from public.auth_account where password is not null")"
check "profiles with an account" "$(q "$DST" "select count(*) from public.profiles")" "$(q "$DST" "select count(*) from public.profiles p join public.auth_user u on u.id = p.id")"
check "unverified accounts" "$(q "$SRC" "select count(*) from $AUTH_SCHEMA.users where deleted_at is null and email_confirmed_at is null")" "$(q "$DST" "select count(*) from public.auth_user where not email_verified")"
check "reply_hours filled" "$(q "$SRC" "select count(*) from public.reviews where reply_time is not null")" "$(q "$DST" "select count(*) from public.reviews where reply_hours is not null")"
[ "$FAIL" = "0" ] || { echo "Verification FAILED: do not use this database." >&2; exit 1; }
echo "== Done"
