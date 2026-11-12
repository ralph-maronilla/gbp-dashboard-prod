# Review Dashboard

Next.js (App Router) app that extracts Google Maps reviews for any number of locations through
[Serper](https://serper.dev), shows them per client, and exports them in the CX Pulse upload layout. It runs as one
self-managed server (Node, behind Caddy) with a managed PostgreSQL database: no third-party platform at runtime.
**Everything is behind login; there are no public pages** (the only open routes are the sign-in pages, the email links and
`/api/health`).

Pages (menu order): **Overview** (`/`, KPIs and per-location table), **Dashboard** (`/dashboard`, built to the Healthway sample
dashboard: Review Overview, Reputation, Sentiment and Review Intelligence tabs), **Extraction** (`/extraction`, add locations, extract, browse and export reviews), **Users**
(`/admin/users`, approvals and client access), and **User guide** (`/guide`, at the bottom of the sidebar: how to use every page, by role, with a guided tour; content in `src/lib/guide/sections.ts`, tour steps in `src/lib/guide/tour-steps.ts`; keep them in step when screens change). `/overview` redirects to `/`. See [CHANGELOG.md](CHANGELOG.md).

## Setup (local development)

You need Node 24+ and a PostgreSQL 16+ server (Postgres.app works well on a Mac).

```bash
cp .env.example .env.local                 # then fill in DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, APP_URL
npm install
npx prisma migrate deploy                  # creates the schema in an EMPTY database
npm run dev                                # http://localhost:3000
```

With no `SMTP_HOST`, the confirmation and password-reset emails are printed in the terminal running `npm run dev`
(the link is in the text), so you can sign up without a mail server.

Optional, to work with a copy of the production data instead of an empty database: restore a clean dump of it into a
scratch database and run `scripts/import-supabase.sh <source-url> <target-url> [auth-schema]` against the migrated
target. It copies every table and every account with its existing password hash, then checks the counts. See the header of
the script.

### Promote the first admin
Sign up through the app and confirm the email link, then run against the database:

```sql
update public.profiles
set role = 'admin', status = 'approved', approved_at = now()
where email = 'you@example.com';
```

Every later account is created as `viewer` + `pending` and must be approved at `/admin/users`.

### Serper
Create an API key at serper.dev and set `SERPER_API_KEY`. Optional limits are listed in `.env.example`.

### Tests
```bash
npm test          # unit and component tests (no database needed)
npm run test:db   # row level security, sign-in flows, /api/health: needs a Postgres; uses (and wipes) a *_test database
npm run test:e2e  # browser tests (Playwright): sign-up to approval, sign-in, reset, access rules, extraction, exports, scheduler
npm run check     # security audit of production dependencies, type check, lint, npm test
```
`npm run test:db` rebuilds `gbp_dashboard_test` from the migrations on every run and refuses to touch a database whose
name does not end in `_test`. Set `TEST_DATABASE_URL` to use another server.

`npm run test:e2e` starts everything it needs: its own database (`gbp_dashboard_e2e_test`, rebuilt and seeded each run, local only), the app on port 3200 from a separate build folder (so a dev server you have open is not disturbed), and a stand-in for Serper (so no credits are ever spent). Emails are read from a file the app writes in development. First time only: `npx playwright install chromium`. On failure, screenshots and traces are in `test-results/` (`npx playwright show-trace <trace.zip>`).

### Production
One Lightsail instance runs the app (Next.js standalone build under systemd) behind Caddy, which terminates HTTPS and
passes the caller's address in `X-Real-IP`; the database is a managed Lightsail PostgreSQL. A systemd timer calls
`/api/cron/sync` every 15 minutes for automatic extraction. **The step-by-step guide is [deploy/RUNBOOK.md](deploy/RUNBOOK.md)**; the server files (Caddyfile, systemd units, `provision.sh`, `deploy.sh`, backup and rollback scripts) are in `deploy/`.
HTTPS is required: session cookies are `secure` and the app sends HSTS.

### Automatic extraction (optional)
An admin switches it on and picks a time (Manila time) on the Extraction page. The server's timer calls
`/api/cron/sync` with `Authorization: Bearer $CRON_SECRET` every 15 minutes; the first call at or after the chosen time
starts that day's run (once a day), so it starts within 15 minutes of the time. A call that is not due only updates one row
and returns. Set `CRON_SECRET` (`openssl rand -hex 32`) and `APP_URL`, then on the Extraction page switch it on, pick the
time and Save. Within 15 minutes the card shows "Scheduler connected". To stop it, switch it off (the timer keeps calling
but nothing runs).

## Architecture notes
- All data reads and writes go through Route Handlers in `src/app/api/**`; no server actions.
- Every handler is wrapped by `withAuth({ roles, ... })` ([src/server/api/with-auth.ts](src/server/api/with-auth.ts)): CSRF/content-type → rate limit → session → profile → approval → role → zod parsing. `roles` is mandatory; an empty list throws at load time. `publicRoute` is the explicit opt-out for signup, login and `/api/health`.
- **Sign-in** is [Better Auth](https://www.better-auth.com) running inside the app with its tables in our database (`auth_user`, `auth_session`, `auth_account`, `auth_verification`). Only our own routes are exposed (`/api/auth/{login,signup,logout,forgot,reset-password}` and the email link `/auth/verify`); Better Auth's own HTTP handler is not mounted. Passwords are bcrypt. Sessions last 7 days and extend as they are used, on top of the 1-hour idle sign-out in the browser. A password reset revokes every session. Email confirmation is required before the first sign-in, and sign-up and "forgot password" answer the same way whether or not the address has an account.
- **Authorization** lives in `profiles` (role admin / manager / viewer, status pending / approved / rejected, per-location and per-client access). A database trigger creates a pending viewer profile for every new account.
- Row Level Security is enabled on every table as a second layer; users cannot change their own role, status or `can_extract` (no policy, plus a guard trigger). The Better Auth tables have no access for the app's user role at all.
- **How RLS works here:** handlers query through `ctx.db(tx => ...)` ([src/server/db/with-rls.ts](src/server/db/with-rls.ts)), a transaction that switches to the no-login role `app_user` and sets `app.user_id` to the caller, so `app.uid()` and every policy apply. The plain `getPrisma()` client connects as the schema owner and bypasses RLS; it is reserved for server-only extraction code and admin-checked writes.
- Session cookies are `httpOnly`, `SameSite=Lax`, `secure` in production.
- `src/proxy.ts` (Next 16's replacement for middleware) only redirects for UX; the API enforces the same rules independently.
- **Rate limits** (`rate-limiter-flexible`) are kept in memory in the single server process: they reset when it restarts, and the limits themselves are unchanged. The caller's address comes from `X-Real-IP`, which Caddy sets (the app listens on localhost only).
- **Database schema** is managed by Prisma Migrate (`prisma/migrations/`). The SQL in those migrations is the source of truth for triggers, RLS policies and functions, which Prisma cannot model; `prisma/schema.prisma` is the query layer. Add a change with `npx prisma migrate dev --create-only`, edit the SQL, and always pass `DIRECT_URL` explicitly so you never point the CLI at the wrong database. The old Supabase migrations are kept for reference in `docs/legacy/`.
- `GET /api/health` returns `{"data":{"status":"ok"}}` when the app can reach the database, `503` otherwise, with no details.
- Server state: React Query. UI state only: Zustand.

## Clients and per-user access
- A client is a group of locations. Admins file locations under a client when adding them (pick one or type a new
  name) on the Extraction page.
- To limit a user to one client: Users → **Assign access** → pick that client. They see only its locations (and any
  added to it later); other locations return 404. Users can also be given individual locations.
- Admins can start extractions, and so can viewers and managers an admin allows on the Users page (**Manual extraction**,
  `profiles.can_extract`; only for their own locations). Everyone else sees when automatic extraction runs.
  Only admins change automatic extraction.

## CSV export
`GET /api/export/reviews` (**Export CSV** on the Extraction page's reviews table, the Overview and each location) downloads one CSV in the
CX Pulse upload layout (`REFERENCE #, DATETIME (MM/DD/YYYY H:MM), HOSPITAL CLINIC BRANCH (PREFIX), FIRST NAME,
MIDDLE NAME, LAST NAME, AGE, LOCATION, GENDER, RATING, COMMENTS`, plus a last `REVIEWER LINK` column with the reviewer's Google profile URL, empty when Google gave none; drop that column if your upload rejects extra columns). Without a location filter it consolidates every
location the user can access (admins: all) into a single file; optional filters are date range, client group,
location, rating and text search, the same as the reviews table. Max 100,000 rows per file.
- REFERENCE # is a unique 6-digit number (100000–999999) given to each review when it is first saved and never changed; LOCATION is the location address; the date is in `EXPORT_TIMEZONE`
  (default `Asia/Manila`).
- BRANCH (PREFIX) is the code an admin sets per location in the Extraction page's locations table (double-click
  the cell; falls back to the location name).
- Google reviews have no age or gender, so AGE and GENDER hold `N/A`. The middle name is filled only when the reviewer name
  ends in an initial (`N/A` otherwise). The reviewer name's last word is
  the last name (with a prefix like "dela" / "de la" and a trailing Jr./III), everything before it is the first name; one-word
  or missing names give `N/A` / `Anonymous`.
- Cells that would run as spreadsheet formulas (start with `= + - @`) are prefixed with an apostrophe.

## Extraction (Serper)
- **Add locations** (admin): paste Google Maps links or CIDs, one per line, optionally `Name | link` (free, up to 500
  at a time), and pick or type the client. Place IDs (`ChIJ…`) are not accepted: paste the Maps link instead.
- **No duplicates:** every location is stored under its Maps place's CID, so the same place pasted again (as a share
  link, a `?cid=` link, a full place link or a bare CID) is recognised and skipped. Names are unique too (ignoring case
  and spacing): a different place whose name is taken is added as `Name (City)` or `Name (CID tail)`, and renaming a
  location to a taken name is refused. The database enforces both rules (the baseline migration), so two admins adding at the
  same moment can't create a duplicate.
- **Edit / delete** (admin): the pencil on each location opens one dialog for name, address, branch prefix, active
  switch and clients. The trash icon permanently deletes the location with its reviews, extraction history and
  client/user assignments (you must type its name to confirm when it has reviews). A location that is being
  extracted right now can't be deleted until the extraction finishes.
- **Extract**: select locations (or all) and press Extract. The page keeps going until every review is saved and shows
  progress; Stop keeps what is done.
- **Automatic extraction** (admin, Extraction page): once a day at a chosen Manila time, all active locations
  (picks up new reviews; unfinished extractions continue), within its own daily credit limit (default 300) and the
  shared daily limit; not counted against anyone's personal limit. The card shows the next run, the last automatic
  run (credits, reviews saved, result) and whether the scheduler is calling. Setup: step 6 above.
- **Cost:** 1 credit per page of 20 reviews. The first extraction of a location reads every page (2,000 reviews ≈ 100
  credits). After that an extraction starts at the newest review and stops at the first one already saved: usually
  1 credit per location, which also refreshes edits and replies on the latest 20 reviews. Limits:
  `SERPER_MAX_CREDITS_PER_RUN` and `SERPER_DAILY_CREDIT_LIMIT`.
- **Credit safety (no runaway spending):** every loop that can spend credits is bounded. A read ends on the last page
  (an empty page token counts as the last), on a page with nothing new, on an unmoved cursor, after 50 pages of catching
  up, at `SERPER_MAX_CREDITS_PER_RUN`, and at `SERPER_DAILY_CREDIT_LIMIT`, which all runs share and which is re-checked
  while they run. Retries stop at the run's time budget. Automatic continuation only continues after a run that saved
  reviews or finished a location, never because credits were spent. The Extract button stops after 2 passes with no
  progress, after 240 passes, or when you leave the page.
- **Large volumes and many users:** every page is saved together with Serper's page token, so interrupted work resumes
  where it stopped. Each location is claimed by one extraction at a time (`locations.sync_locked_until`), so several
  users and the cron can extract at once without reading anything twice; locations run in parallel
  (`SERPER_CONCURRENCY`). Browsing and exporting only read the database.
- **Accuracy:** review date is exact, the comment is the full text, review ids are Google's own (no duplicates). Owner
  reply dates are approximate (Serper only gives "3 weeks ago"). The locations table shows reviews stored vs Google's
  count; Google's count includes rating-only reviews, so a small gap can be normal. Reviews deleted on Google stay.

## Dashboard
Four tabs, all filtered by the Period (a date-range picker: presets such as Last 28 days or Last 12 months, custom days, or All time, the default; with optional Compare to dates: every tab then shows ▲ / ▼ changes and Reputation's charts draw both ranges; Review Overview adds a side-by-side comparison), client, region, island group, type and location, with
the same access rules as the reviews table (the URL keeps the tab and filters, so a view can be shared):
- **Review Overview:** profiles surfaced / with reviews / without, total reviews, weighted rating, Location Performance
  with a signal (Strong ≥ 4.5★, Stable 4.0–4.4, Watch 3.0–3.9, Priority < 3.0), largest review volumes, readout.
  A switch shows either **Google totals** (Google's public rating and review count, like the guide) or **extracted
  reviews** for the selected period. Google totals come from **Refresh Google totals** on the Extraction page (admin,
  on demand, about 3 credits per location, counted in the daily credit limit); locations not refreshed yet show their
  extracted figures, marked *. Google's count includes rating-only reviews.
- **Reputation:** status cards, a table grouped by **Region**, **Island group** or **Type**, monthly highlights and
  charts. Charts pick month / quarter / year automatically (or by the switch) and always include every review.
  **Response speed** is *measured* when at least 20 replies in the period were caught within 3 days of being posted
  (Serper dates those as "5 hours ago" / "2 days ago"); otherwise it is the approximate median from "3 weeks ago" style
  dates, labelled approx. Only the newest page of each location is re-read daily, so only new reviews can be measured.
- **Sentiment / Review Intelligence:** reviews are sorted into themes (Waiting Time, Doctors / Care, Staff / Service,
  Billing, Facilities, Appointments / Contact, Diagnostics / Pharmacy, Positive Commendations) by English and Tagalog
  keywords in [src/lib/insights/themes.ts](src/lib/insights/themes.ts); a mention's sentiment is the review's stars (4–5
  positive, 3 mixed, 1–2 negative). Edit the keyword lists to tune detection; everything is recalculated on the fly.
  Thresholds live in [src/lib/insights/signals.ts](src/lib/insights/signals.ts), summaries in
  [src/lib/insights/narrative.ts](src/lib/insights/narrative.ts). No AI or external service is used.
  On Review Intelligence, clicking a theme tile opens a side panel with every review that mentions it under the current
  filters, grouped by location (most negative first; most positive for Positive Commendations), with the theme's words
  highlighted, Negative / Mixed / Positive / All chips and a search box (`GET /api/insights/themes/reviews`). Its
  counts equal the tile's mentions. The open theme is kept in the URL (`theme`, `theme_s`).
  **Export to Excel** (on the tab: all themes; in the panel: that theme with its sentiment and search) downloads a
  workbook (`GET /api/insights/themes/export`): a **Summary** tab (filters used, then each location × theme with
  mentions, positive / mixed / negative % and level, led by "All locations") and **one tab per location** (worst
  first) with one row per review per theme: Ref No, Date (Manila), Stars, Theme, Sentiment, Judged from (words or
  stars), Replied, Matched words, Review, Reviewer link. Written by `src/lib/export/xlsx.ts` (zipped with `fflate`).

**Regions** are the 18 official Philippine regions (NCR, CAR, I–XIII, IV-A, MIMAROPA, NIR, BARMM) with their island
group ([src/lib/ph-regions.ts](src/lib/ph-regions.ts)). Set them in Extraction → Edit location, or click **Auto-fill regions**
(free; detects from the address or branch name). Refresh Google totals also fills an empty address, region and type
from Google. Values you set are never overwritten.

## Activity tracking
Signed-in users' browsers report in when the app opens and about once an hour (page path and time only, one row per user, no history). Admins see this on the Users page as "active in the last hour". Tell your team this is on.

## Credits, sessions and security checks
- Serper credits: each person may spend `SERPER_USER_DAILY_CREDIT_LIMIT` (default 200) per UTC day, within the shared
  `SERPER_DAILY_CREDIT_LIMIT`. Admins see each person's use in the Users page's Credits column.
- Signed-in users are signed out after 1 hour without activity (warning 5 minutes before). The session itself lasts at
  most 7 days from the last time it was used.
- Run `npm run check` (and `npm run test:db`) before deploying. GitHub runs it on
  every push and weekly; Dependabot opens pull requests for outdated packages.
- Pages use a nonce-based Content Security Policy (set in `proxy.ts`). If a new feature's script is blocked, the browser
  console and the server log (`[csp]`) say which.
