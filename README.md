# Review Dashboard

Next.js (App Router) app that extracts Google Maps reviews for any number of locations through
[Serper](https://serper.dev), shows them per client, and exports them in the CX Pulse upload layout. Supabase for
auth and data, Vercel for hosting. **Everything is behind login; there are no public pages.**

Pages (menu order): **Overview** (`/`, KPIs and per-location table), **Dashboard** (`/dashboard`, built to the Healthway sample
dashboard: Review Overview, Reputation, Sentiment and Review Intelligence tabs), **Extraction** (`/extraction`, add locations, extract, browse and export reviews), **Users**
(`/admin/users`, approvals and client access). `/overview` redirects to `/`. See [CHANGELOG.md](CHANGELOG.md).

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. **Authentication → Providers → Email**: enabled. Leave "Confirm email" on (recommended).
3. **Authentication → URL Configuration**: set Site URL to your app URL (`http://localhost:3000` locally, your Vercel URL in production) and add `<APP_URL>/login` to Redirect URLs.
4. Run the migrations in order (SQL editor, or `supabase db push` with the CLI):
   `supabase/migrations/0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` → `0008` → `0009` → `0010` → `0011` → `0012` → `0013` → `0014` → `0015` → `0016` → `0017` → `0018` → `0019` → `0020`.
5. Copy the project URL, publishable key and the two Postgres connection strings (the **Connect** button; see `.env.example`) into `.env.local` (see `.env.example`).

### 2. Promote the first admin
Sign up through the app and confirm your email, then run in the Supabase SQL editor (service role context):

```sql
update public.profiles
set role = 'admin', status = 'approved', approved_at = now()
where email = 'you@example.com';
```

Every later account is created as `viewer` + `pending` and must be approved at `/admin/users`.

### 3. Run locally
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

### 4. Vercel
Import the repo, set the same environment variables (`APP_URL` = the production URL, required for the CSRF
check), and deploy. For production rate limiting add an Upstash Redis database and set
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; without them an in-memory limiter is used, which is per
serverless instance and only suitable for development.

### 5. Serper
Create an API key at serper.dev and set `SERPER_API_KEY` (locally and in Vercel). Optional limits are listed in
`.env.example`.

### 6. Automatic extraction (optional)
An admin switches it on and picks a time (Manila time) on the Extraction page. Supabase pg_cron calls
`/api/cron/sync` every 15 minutes; the first call at or after the chosen time starts that day's run (once a day), so
it starts within 15 minutes of the time. A call that is not due only updates one row and returns. One-time setup:

1. Vercel: set `CRON_SECRET` (`openssl rand -hex 32`) and `APP_URL` (the production URL), and redeploy.
2. Supabase → SQL editor: apply migration `0018_auto_extract.sql`.
3. Supabase → Database → Extensions: enable `pg_cron` and `pg_net`.
4. Supabase → SQL editor (put in your real secret and URL; they are stored encrypted in Vault, not in the job):
   ```sql
   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
   select cron.schedule('auto-extract', '*/15 * * * *', $$
     select net.http_get(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/sync',
       headers := jsonb_build_object('Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       timeout_milliseconds := 60000)
   $$);
   ```
5. Extraction page → Automatic extraction: switch on, pick the time, Save. Within 15 minutes the card shows
   "Scheduler connected".

To stop it, switch it off (the job keeps calling but nothing runs), or remove the job with
`select cron.unschedule('auto-extract');`. Calls are listed in `cron.job_run_details` and `net._http_response`.

## Architecture notes
- All data reads and writes go through Route Handlers in `app/api/**`; no server actions.
- Every handler is wrapped by `withAuth({ roles, ... })` ([lib/api/with-auth.ts](lib/api/with-auth.ts)): CSRF/content-type → rate limit → session → profile → approval → role → zod parsing. `roles` is mandatory; an empty list throws at load time. `publicRoute` is the explicit opt-out for signup and login.
- RLS is enabled on every table as a second layer; users cannot change their own role or status (no policy, plus a guard trigger).
- The browser never talks to Supabase directly; session cookies are `httpOnly`, `SameSite=Lax`.
- `proxy.ts` (Next 16's replacement for middleware) only redirects for UX; the API enforces the same rules independently.
- **Prisma** is the query layer. The SQL migrations stay the source of truth for schema, triggers and RLS; `prisma/schema.prisma` mirrors them (check drift with `npx prisma db pull --print`; never run `migrate` or `db push`). Handlers query through `ctx.db(tx => ...)` ([lib/db/with-rls.ts](lib/db/with-rls.ts)), a transaction that switches to the `authenticated` role with the caller's JWT claims, so RLS still applies. The plain `getPrisma()` client bypasses RLS and is reserved for server-only extraction code and admin-checked writes.
- Supabase Auth (via `@supabase/ssr`) still handles sessions. `proxy.ts` validates the session with Supabase and reads the profile through the same RLS-scoped Prisma path as the API.
- Server state: React Query. UI state only: Zustand.

## Clients and per-user access
- A client is a group of locations. Admins file locations under a client when adding them (pick one or type a new
  name) on the Extraction page.
- To limit a user to one client: Users → **Assign access** → pick that client. They see only its locations (and any
  added to it later); other locations return 404. Users can also be given individual locations.
- Admins and managers can start extractions (managers only for their own locations); viewers browse and export.

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
  location to a taken name is refused. The database enforces both rules (migration 0010), so two admins adding at the
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
Four tabs, all filtered by period (3/6/12/24 months or all time), client, region, island group, type and location, with
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
  keywords in [lib/insights/themes.ts](lib/insights/themes.ts); a mention's sentiment is the review's stars (4–5
  positive, 3 mixed, 1–2 negative). Edit the keyword lists to tune detection; everything is recalculated on the fly.
  Thresholds live in [lib/insights/signals.ts](lib/insights/signals.ts), summaries in
  [lib/insights/narrative.ts](lib/insights/narrative.ts). No AI or external service is used.
  On Review Intelligence, clicking a theme tile opens a side panel with every review that mentions it under the current
  filters, grouped by location (most negative first; most positive for Positive Commendations), with the theme's words
  highlighted, Negative / Mixed / Positive / All chips and a search box (`GET /api/insights/themes/reviews`). Its
  counts equal the tile's mentions. The open theme is kept in the URL (`theme`, `theme_s`).
  **Export to Excel** (on the tab: all themes; in the panel: that theme with its sentiment and search) downloads a
  workbook (`GET /api/insights/themes/export`): a **Summary** tab (filters used, then each location × theme with
  mentions, positive / mixed / negative % and level, led by "All locations") and **one tab per location** (worst
  first) with one row per review per theme: Ref No, Date (Manila), Stars, Theme, Sentiment, Judged from (words or
  stars), Replied, Matched words, Review, Reviewer link. Written by `lib/export/xlsx.ts` (zipped with `fflate`).

**Regions** are the 18 official Philippine regions (NCR, CAR, I–XIII, IV-A, MIMAROPA, NIR, BARMM) with their island
group ([lib/ph-regions.ts](lib/ph-regions.ts)). Set them in Extraction → Edit location, or click **Auto-fill regions**
(free; detects from the address or branch name). Refresh Google totals also fills an empty address, region and type
from Google. Values you set are never overwritten.

## Activity tracking
Signed-in users' browsers report in when the app opens and about once an hour (page path and time only, one row per user, no history). Admins see this on the Users page as "active in the last hour". Tell your team this is on.

## Credits, sessions and security checks
- Serper credits: each person may spend `SERPER_USER_DAILY_CREDIT_LIMIT` (default 200) per UTC day, within the shared
  `SERPER_DAILY_CREDIT_LIMIT`. Admins see each person's use in the Users page's Credits column.
- Signed-in users are signed out after 1 hour without activity (warning 5 minutes before). For a server-side backstop,
  also set Supabase Authentication → Sessions → Inactivity timeout (Pro plan).
- Run `npm run check` before deploying (security audit of production dependencies, type check, lint). GitHub runs it on
  every push and weekly; Dependabot opens pull requests for outdated packages.
- Pages use a nonce-based Content Security Policy (set in `proxy.ts`). If a new feature's script is blocked, the browser
  console and the server log (`[csp]`) say which.
