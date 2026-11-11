# Phase 1 design: auth, approval, RBAC

Approved decisions (2026-10-06):
1. `user_locations` rows target exactly one location OR one group (check constraint).
2. Minimal Phase 1 data model; `settings` table and sync progress cursor deferred to Phase 3 (ask first).
3. `sync_runs.error` visible to admins only (API-level redaction).
4. Rate limiting: Upstash when configured, in-memory fallback otherwise.
5. Supabase email confirmation stays on.

SQL lives in `supabase/migrations/`; the `withAuth` design is documented in `lib/api/with-auth.ts` and the README.
Additions beyond the original list: `GET /api/admin/assignable` (options for the assignment dialog) .
6. Prisma as ORM, query layer only: SQL migrations stay the source of truth; per-request RLS via `withRls` (role `authenticated` + JWT claims). `replace_user_assignments()` was dropped; the replace is a Prisma transaction.
