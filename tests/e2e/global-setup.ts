import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { E2E } from "./env";

export const USERS = {
  admin: { email: "admin@e2e.test", name: "Ada Admin", role: "admin", status: "approved", canExtract: true },
  manager: { email: "manager@e2e.test", name: "Mia Manager", role: "manager", status: "approved", canExtract: true },
  viewer: { email: "viewer@e2e.test", name: "Vic Viewer", role: "viewer", status: "approved", canExtract: false },
  nobody: { email: "nobody@e2e.test", name: "Nia Nobody", role: "viewer", status: "approved", canExtract: false },
  pending: { email: "pending@e2e.test", name: "Pat Pending", role: "viewer", status: "pending", canExtract: false },
  // May run manual extractions, for their own location only (Delta). The extraction tests use this person so the data other tests count on never changes.
  // Only the password-reset test uses this person, because a reset signs the account out everywhere.
  resetter: { email: "resetter@e2e.test", name: "Rae Resetter", role: "viewer", status: "approved", canExtract: false },
  extractor: { email: "extractor@e2e.test", name: "Eli Extractor", role: "viewer", status: "approved", canExtract: true },
} as const;

export const LOCATIONS = {
  alpha: { id: "00000000-0000-4000-8000-00000000a001", name: "Alpha Clinic", cid: "1000000000000000001" },
  beta: { id: "00000000-0000-4000-8000-00000000b002", name: "Beta Clinic", cid: "1000000000000000002" },
  gamma: { id: "00000000-0000-4000-8000-00000000c003", name: "Gamma Clinic", cid: "1000000000000000003" },
  delta: { id: "00000000-0000-4000-8000-00000000d004", name: "Delta Clinic", cid: "1000000000000000004" },
} as const;

export const GROUP_X = "00000000-0000-4000-8000-0000000000e1";

/** Wipes and rebuilds the e2e database from the migrations, then seeds the users, locations and reviews the tests rely on. */
export default async function globalSetup() {
  const url = new URL(E2E.dbUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) && !process.env.CI) {
    throw new Error(`Refusing to reset a database on "${url.hostname}": the e2e database must be local (set CI=1 to allow a CI service host)`);
  }
  if (!name.endsWith("_test")) throw new Error(`Refusing to reset "${name}": the e2e database name must end in _test`);

  // Create the database if this is the first run (connect to the server's maintenance database to do it).
  const admin = new Client({ connectionString: E2E.dbUrl.replace(/\/[^/]*$/, "/postgres") });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (exists.rowCount === 0) await admin.query(`create database "${name}"`);
  await admin.end();

  const db = new Client({ connectionString: E2E.dbUrl });
  await db.connect();
  try {
    await db.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
  } finally {
    await db.end();
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DIRECT_URL: E2E.dbUrl, DATABASE_URL: E2E.dbUrl } });

  const c = new Client({ connectionString: E2E.dbUrl });
  await c.connect();
  try {
    const hash = await bcrypt.hash(E2E.password, 10);
    for (const u of Object.values(USERS)) {
      const { rows } = await c.query(
        "insert into public.auth_user (name, email, email_verified) values ($1, $2, true) returning id",
        [u.name, u.email],
      );
      const id = rows[0].id as string;
      await c.query("insert into public.auth_account (account_id, provider_id, user_id, password, updated_at) values ($1::text, 'credential', $1::uuid, $2, now())", [id, hash]);
      // The sign-up trigger already created the profile (viewer, pending); set what this fixture needs.
      await c.query("update public.profiles set role = $2::user_role, status = $3::user_status, can_extract = $4, approved_at = case when $3::user_status = 'approved' then now() end where id = $1::uuid", [id, u.role, u.status, u.canExtract]);
    }

    for (const [i, l] of Object.values(LOCATIONS).entries()) {
      await c.query(
        "insert into public.locations (id, gbp_account_id, gbp_location_id, name, address, region, location_type, branch_prefix) values ($1, 'serper', $2, $3, $4, 'NCR', 'Clinic', $5)",
        [l.id, `serper:${l.cid}`, l.name, `${i + 1} Test Street, Manila`, ["ALP", "BET", "GAM", "DEL"][i]],
      );
      if (l === LOCATIONS.delta) continue; // Delta starts with no reviews: it is for the extraction tests
      // 12 reviews each, spread over the last ~11 weeks, with a mix of ratings, replies and theme words.
      await c.query(
        `insert into public.reviews (location_id, gbp_review_id, reviewer_name, rating, comment, create_time, reply_comment, reply_time, reply_time_source)
         select $1, 'seed:' || $2 || ':' || g, 'Reviewer ' || g,
                (array[5,4,3,2,5,1,4,5,3,4,2,5])[g],
                (array['Great doctor, very caring','Long waiting time at the counter','Staff were friendly and helpful','Billing was confusing','Clean and modern facilities','Rude staff, never again','Easy appointment booking','Excellent service','=SUM(1,1) average experience','Fast and professional','Waited too long for results','Highly recommended'])[g],
                now() - (g * interval '6 days'),
                case when g % 3 = 0 then 'Thank you for your feedback.' end,
                case when g % 3 = 0 then now() - (g * interval '6 days') + interval '1 day' end,
                case when g % 3 = 0 then 'observed' end
         from generate_series(1, 12) g`,
        [l.id, l.cid],
      );
    }

    // One client group (Beta only); assignments: manager -> Alpha directly, viewer -> client X (Beta).
    await c.query("insert into public.location_groups (id, name) values ($1, 'Client X')", [GROUP_X]);
    await c.query("insert into public.location_group_members (group_id, location_id) values ($1, $2)", [GROUP_X, LOCATIONS.beta.id]);
    const id = async (email: string) => (await c.query("select id from public.profiles where email = $1", [email])).rows[0].id as string;
    await c.query("insert into public.user_locations (user_id, location_id) values ($1, $2)", [await id(USERS.manager.email), LOCATIONS.alpha.id]);
    await c.query("insert into public.user_locations (user_id, group_id) values ($1, $2)", [await id(USERS.viewer.email), GROUP_X]);
    await c.query("insert into public.user_locations (user_id, location_id) values ($1, $2)", [await id(USERS.extractor.email), LOCATIONS.delta.id]);
  } finally {
    await c.end();
  }

  mkdirSync(path.dirname(E2E.outboxFile), { recursive: true });
  writeFileSync(E2E.outboxFile, "");

  // Sign every seeded person in once and keep their session cookie. Tests that are not about signing in reuse it
  // (helpers.loginViaApi), so the suite does not spend the per-address and per-email sign-in limits on setup.
  mkdirSync(E2E.sessionsDir, { recursive: true });
  let ip = 100;
  for (const u of Object.values(USERS)) {
    const res = await fetch(`${E2E.appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: E2E.appUrl, "X-Real-IP": `198.18.0.${ip++}` },
      body: JSON.stringify({ email: u.email, password: E2E.password }),
    });
    if (!res.ok) throw new Error(`could not sign in ${u.email} for the saved session: ${res.status}`);
    const cookies = res.headers.getSetCookie().map((c) => {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" as const, expires: Math.floor(Date.now() / 1000) + 6 * 86400 };
    });
    writeFileSync(path.join(E2E.sessionsDir, `${u.email}.json`), JSON.stringify(cookies));
  }
}
