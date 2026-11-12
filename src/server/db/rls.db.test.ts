import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ID, owner, seed } from "../../../tests/db/helpers";
import { withRls } from "./with-rls";

// withRls is the real one; only the client it runs on is swapped for the test database.
vi.mock("./prisma", () => ({ getPrisma: () => owner }));

type Row = Record<string, unknown>;
const ids = (rows: Row[], key = "id") => rows.map((r) => r[key] as string).sort();
const sorted = (...a: string[]) => [...a].sort();

const as = <T>(user: string, fn: Parameters<typeof withRls<T>>[1]) => withRls(user, fn);
const q = (user: string, sql: string) => as(user, (tx) => tx.$queryRawUnsafe<Row[]>(sql));

beforeAll(seed);
afterAll(() => owner.$disconnect());

describe("who can see which locations, reviews and runs", () => {
  // user -> visible location ids
  const matrix: [string, string, string[]][] = [
    ["admin", ID.admin, [ID.loc1, ID.loc2, ID.loc3]],
    ["manager (direct assignment)", ID.manager, [ID.loc1]],
    ["viewer (via group)", ID.viewer, [ID.loc2]],
    ["approved, unassigned", ID.unassigned, []],
    ["pending, even if assigned", ID.pending, []],
    ["rejected, even if assigned", ID.rejected, []],
    ["admin role but still pending", ID.adminPending, []],
    ["id with no profile", ID.stranger, []],
  ];

  it.each(matrix)("%s", async (_name, user, locs) => {
    expect(ids(await q(user, "select id from public.locations"))).toEqual(sorted(...locs));
    expect(ids(await q(user, "select location_id from public.reviews"), "location_id")).toEqual(sorted(...locs));
    // sync_runs: the admin also sees the global run (location_id null); others only their locations' runs.
    const runs = await q(user, "select location_id from public.sync_runs");
    const runLocs = runs.map((r) => r.location_id as string | null);
    expect(runLocs.filter(Boolean).sort()).toEqual(sorted(...locs));
    expect(runLocs.includes(null)).toBe(user === ID.admin);
  });

  it("can_access_location agrees with the visibility matrix", async () => {
    for (const [, user, locs] of matrix) {
      for (const loc of [ID.loc1, ID.loc2, ID.loc3]) {
        const [row] = await q(user, `select public.can_access_location('${loc}') as ok`);
        expect(row.ok, `${user} -> ${loc}`).toBe(locs.includes(loc));
      }
    }
  });
});

describe("profiles", () => {
  it("a user sees only their own profile", async () => {
    expect(ids(await q(ID.viewer, "select id from public.profiles"))).toEqual([ID.viewer]);
    expect(ids(await q(ID.pending, "select id from public.profiles"))).toEqual([ID.pending]);
  });
  it("an approved admin sees every profile; a pending admin only their own", async () => {
    expect(await q(ID.admin, "select id from public.profiles")).toHaveLength(7);
    expect(ids(await q(ID.adminPending, "select id from public.profiles"))).toEqual([ID.adminPending]);
  });
  it("a non-admin cannot update any profile, including their own", async () => {
    const n = await as(ID.viewer, (tx) => tx.$executeRawUnsafe(`update public.profiles set role = 'admin', can_extract = true where id = '${ID.viewer}'`));
    expect(n).toBe(0);
    const [row] = await owner.$queryRawUnsafe<Row[]>(`select role, can_extract from public.profiles where id = '${ID.viewer}'`);
    expect(row).toEqual({ role: "viewer", can_extract: false });
  });
  it("an admin can update profiles", async () => {
    await as(ID.admin, (tx) => tx.$executeRawUnsafe(`update public.profiles set can_extract = true where id = '${ID.manager}'`));
    const [row] = await owner.$queryRawUnsafe<Row[]>(`select can_extract from public.profiles where id = '${ID.manager}'`);
    expect(row.can_extract).toBe(true);
    await owner.$executeRawUnsafe(`update public.profiles set can_extract = false where id = '${ID.manager}'`);
  });
  it("a pending admin cannot update profiles", async () => {
    const n = await as(ID.adminPending, (tx) => tx.$executeRawUnsafe(`update public.profiles set status = 'approved' where id = '${ID.pending}'`));
    expect(n).toBe(0);
  });
});

describe("guard_profile_update trigger (second layer, even if RLS let the row through)", () => {
  // The schema owner bypasses RLS, so setting app.user_id alone isolates the trigger.
  const guarded = (user: string, set: string) =>
    owner.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.user_id', ${user}, true)`;
      return tx.$executeRawUnsafe(`update public.profiles set ${set} where id = '${ID.viewer}'`);
    });

  it.each(["role = 'admin'", "status = 'rejected'", "can_extract = true", "email = 'x@t.test'", `approved_by = '${ID.admin}'`])(
    "blocks a non-admin changing %s",
    async (set) => {
      await expect(guarded(ID.viewer, set)).rejects.toThrow(/forbidden/);
    },
  );
  it("allows a non-admin changing harmless columns", async () => {
    await expect(guarded(ID.viewer, "full_name = 'Vee'")).resolves.toBe(1);
  });
  it("allows an admin and the privileged connection (no user id)", async () => {
    await expect(guarded(ID.admin, "can_extract = true")).resolves.toBe(1);
    await expect(owner.$executeRawUnsafe(`update public.profiles set can_extract = false where id = '${ID.viewer}'`)).resolves.toBe(1);
  });
});

describe("assignments and groups", () => {
  it("a user sees only their own assignments, and only while approved", async () => {
    expect(ids(await q(ID.manager, "select user_id from public.user_locations"), "user_id")).toEqual([ID.manager]);
    expect(await q(ID.pending, "select 1 from public.user_locations")).toHaveLength(0);
    expect(await q(ID.rejected, "select 1 from public.user_locations")).toHaveLength(0);
  });
  it("an admin sees all assignments", async () => {
    expect(await q(ID.admin, "select 1 from public.user_locations")).toHaveLength(4);
  });
  it("groups: members see their own group, admin all, others none", async () => {
    expect(ids(await q(ID.viewer, "select id from public.location_groups"))).toEqual([ID.group]);
    expect(ids(await q(ID.admin, "select id from public.location_groups"))).toEqual(sorted(ID.group, ID.emptyGroup));
    expect(await q(ID.unassigned, "select 1 from public.location_groups")).toHaveLength(0);
  });
  it("group members are visible only for locations the user can access", async () => {
    expect(await q(ID.viewer, "select 1 from public.location_group_members")).toHaveLength(1);
    expect(await q(ID.manager, "select 1 from public.location_group_members")).toHaveLength(0);
  });
  it("non-admins cannot write assignments, groups or members", async () => {
    await expect(as(ID.manager, (tx) => tx.$executeRawUnsafe(`insert into public.user_locations (user_id, location_id) values ('${ID.manager}', '${ID.loc3}')`))).rejects.toThrow(/row-level security/);
    await expect(as(ID.manager, (tx) => tx.$executeRawUnsafe(`insert into public.location_groups (name) values ('Mine')`))).rejects.toThrow(/row-level security/);
    await expect(as(ID.manager, (tx) => tx.$executeRawUnsafe(`insert into public.location_group_members (group_id, location_id) values ('${ID.group}', '${ID.loc1}')`))).rejects.toThrow(/row-level security/);
    expect(await as(ID.manager, (tx) => tx.$executeRawUnsafe(`delete from public.user_locations`))).toBe(0);
  });
  it("an admin can write them", async () => {
    await as(ID.admin, async (tx) => {
      await tx.$executeRawUnsafe(`insert into public.user_locations (user_id, location_id) values ('${ID.unassigned}', '${ID.loc3}')`);
      await tx.$executeRawUnsafe(`delete from public.user_locations where user_id = '${ID.unassigned}'`);
    });
  });
});

describe("locations, reviews and sync runs are read-only for non-admins", () => {
  it("a non-admin cannot update a location they can see", async () => {
    expect(await as(ID.manager, (tx) => tx.$executeRawUnsafe(`update public.locations set name = 'Hacked' where id = '${ID.loc1}'`))).toBe(0);
  });
  it("an admin can update a location", async () => {
    expect(await as(ID.admin, (tx) => tx.$executeRawUnsafe(`update public.locations set region = 'NCR' where id = '${ID.loc1}'`))).toBe(1);
    await owner.$executeRawUnsafe(`update public.locations set region = null where id = '${ID.loc1}'`);
  });
  it("app_user has no write access at all to reviews, sync_runs or locations inserts", async () => {
    for (const sql of [
      `insert into public.reviews (location_id, gbp_review_id, rating, create_time) values ('${ID.loc1}', 'x', 5, now())`,
      `insert into public.sync_runs (status) values ('running')`,
      `insert into public.locations (gbp_account_id, gbp_location_id, name) values ('a', 'gx', 'X')`,
      `delete from public.reviews`,
      `update public.reviews set rating = 1`,
    ]) {
      await expect(as(ID.admin, (tx) => tx.$executeRawUnsafe(sql)), sql).rejects.toThrow(/permission denied/);
    }
  });
});

describe("audit_log", () => {
  it("only an approved admin can read it", async () => {
    expect(await q(ID.admin, "select 1 from public.audit_log")).toHaveLength(1);
    for (const u of [ID.manager, ID.viewer, ID.adminPending]) expect(await q(u, "select 1 from public.audit_log")).toHaveLength(0);
  });
  it("an admin can insert only as themselves", async () => {
    await as(ID.admin, (tx) => tx.$executeRawUnsafe(`insert into public.audit_log (actor_id, action) values ('${ID.admin}', 'ok')`));
    await expect(as(ID.admin, (tx) => tx.$executeRawUnsafe(`insert into public.audit_log (actor_id, action) values ('${ID.manager}', 'forged')`))).rejects.toThrow(/row-level security/);
  });
  it("a non-admin cannot insert directly", async () => {
    await expect(as(ID.manager, (tx) => tx.$executeRawUnsafe(`insert into public.audit_log (actor_id, action) values ('${ID.manager}', 'x')`))).rejects.toThrow(/row-level security/);
  });
  it("log_action records extract.run for approved users, as themselves, and nothing else", async () => {
    const before = await owner.$queryRawUnsafe<Row[]>(`select 1 from public.audit_log`);
    await as(ID.manager, (tx) => tx.$executeRawUnsafe(`select public.log_action('extract.run', 'run-1', '{}'::jsonb)`));
    await as(ID.manager, (tx) => tx.$executeRawUnsafe(`select public.log_action('user.deleted', 'x', '{}'::jsonb)`));
    await as(ID.pending, (tx) => tx.$executeRawUnsafe(`select public.log_action('extract.run', 'run-2', '{}'::jsonb)`));
    const after = await owner.$queryRawUnsafe<Row[]>(`select actor_id, action, target from public.audit_log where target like 'run-%'`);
    expect(after).toEqual([{ actor_id: ID.manager, action: "extract.run", target: "run-1" }]);
    expect(before.length).toBeGreaterThan(0);
  });
});

describe("app_settings", () => {
  it("only an approved admin can read or update", async () => {
    expect(await q(ID.admin, "select 1 from public.app_settings")).toHaveLength(1);
    for (const u of [ID.manager, ID.viewer, ID.pending]) expect(await q(u, "select 1 from public.app_settings")).toHaveLength(0);
    expect(await as(ID.admin, (tx) => tx.$executeRawUnsafe(`update public.app_settings set auto_extract_enabled = true`))).toBe(1);
    expect(await as(ID.manager, (tx) => tx.$executeRawUnsafe(`update public.app_settings set auto_extract_enabled = false`))).toBe(0);
    await owner.$executeRawUnsafe(`update public.app_settings set auto_extract_enabled = false`);
  });
  it("auto_extract_schedule is readable by any approved user, not by pending or rejected", async () => {
    for (const u of [ID.admin, ID.manager, ID.viewer, ID.unassigned]) {
      expect(await q(u, "select * from public.auto_extract_schedule()"), u).toEqual([{ enabled: false, run_time: "06:00" }]);
    }
    for (const u of [ID.pending, ID.rejected, ID.stranger]) expect(await q(u, "select * from public.auto_extract_schedule()")).toHaveLength(0);
  });
});

describe("touch_last_seen", () => {
  it("updates the caller's own row when approved, and nothing for pending users", async () => {
    await as(ID.viewer, (tx) => tx.$executeRawUnsafe(`select public.touch_last_seen('/dashboard')`));
    await as(ID.pending, (tx) => tx.$executeRawUnsafe(`select public.touch_last_seen('/dashboard')`));
    const rows = await owner.$queryRawUnsafe<Row[]>(`select id, last_path from public.profiles where last_path is not null`);
    expect(rows).toEqual([{ id: ID.viewer, last_path: "/dashboard" }]);
  });
});

describe("privileges", () => {
  it("reserve_credits is not callable by app_user but works on the privileged connection", async () => {
    await expect(as(ID.admin, (tx) => tx.$queryRawUnsafe(`select * from public.reserve_credits(gen_random_uuid(), 10, 100, null)`))).rejects.toThrow(/permission denied/);
    const [run] = await owner.$queryRawUnsafe<{ id: string }[]>(`insert into public.sync_runs (status, started_by) values ('running', '${ID.admin}') returning id`);
    const [res] = await owner.$queryRawUnsafe<Row[]>(`select * from public.reserve_credits('${run.id}'::uuid, 40, 100, null)`);
    expect(res).toEqual({ granted: 40, limited_by: null });
    const [cap] = await owner.$queryRawUnsafe<Row[]>(`select * from public.reserve_credits('${run.id}'::uuid, 80, 100, null)`);
    expect(cap).toEqual({ granted: 60, limited_by: "daily" });
  });
  it("app_user cannot read Prisma's bookkeeping table or call the trigger function", async () => {
    await expect(as(ID.admin, (tx) => tx.$queryRawUnsafe(`select 1 from public._prisma_migrations`))).rejects.toThrow(/permission denied/);
    await expect(as(ID.admin, (tx) => tx.$queryRawUnsafe(`select public.guard_profile_update()`))).rejects.toThrow(/permission denied/);
  });
});

describe("withRls itself", () => {
  it("rejects anything that is not a UUID", async () => {
    await expect(withRls("x'; drop table public.profiles; --", async () => 1)).rejects.toThrow(/invalid user id/);
    await expect(withRls("", async () => 1)).rejects.toThrow(/invalid user id/);
  });
  it("does not leak the role or user id to the next query on the same pooled connection", async () => {
    await as(ID.admin, (tx) => tx.$queryRawUnsafe(`select 1`));
    const [row] = await owner.$queryRawUnsafe<Row[]>(`select current_user = session_user as is_owner, app.uid() as uid`);
    expect(row).toEqual({ is_owner: true, uid: null });
    expect(await owner.$queryRawUnsafe<Row[]>(`select 1 from public.locations`)).toHaveLength(3); // RLS no longer applies
  });
  it("rolls back on error and still resets", async () => {
    await expect(as(ID.admin, async (tx) => { await tx.$executeRawUnsafe(`update public.locations set region = 'NCR'`); throw new Error("boom"); })).rejects.toThrow("boom");
    const [row] = await owner.$queryRawUnsafe<Row[]>(`select count(*)::int as n from public.locations where region = 'NCR'`);
    expect(row.n).toBe(0);
  });
});
