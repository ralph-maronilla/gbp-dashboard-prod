import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { TEST_DB_URL } from "./url";

/** Privileged connection (schema owner): bypasses RLS, like the app's own getPrisma(). One connection, so a leaked role/setting would show. */
export const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DB_URL, max: 1, options: "-c timezone=UTC" }) });

export const ID = {
  admin: "00000000-0000-4000-8000-0000000000a1",
  adminPending: "00000000-0000-4000-8000-0000000000a2",
  manager: "00000000-0000-4000-8000-0000000000b1",
  viewer: "00000000-0000-4000-8000-0000000000c1",
  pending: "00000000-0000-4000-8000-0000000000d1",
  rejected: "00000000-0000-4000-8000-0000000000e1",
  unassigned: "00000000-0000-4000-8000-0000000000f1",
  stranger: "00000000-0000-4000-8000-0000000000f9", // has no profile at all
  loc1: "00000000-0000-4000-8000-000000000101",
  loc2: "00000000-0000-4000-8000-000000000102",
  loc3: "00000000-0000-4000-8000-000000000103",
  group: "00000000-0000-4000-8000-000000000201",
  emptyGroup: "00000000-0000-4000-8000-000000000202",
};

/**
 * Fixture:
 *   admin (approved admin) sees everything.       adminPending (admin, still pending) is NOT an admin.
 *   manager  -> loc1 directly.                    viewer -> group (which contains loc2).
 *   pending / rejected -> assigned loc1 but must see nothing.   unassigned -> approved, no assignment.
 *   loc3 is assigned to nobody.
 */
export async function seed() {
  await owner.$executeRawUnsafe(`
    truncate public.audit_log, public.user_locations, public.location_group_members, public.location_groups,
             public.reviews, public.sync_runs, public.locations, public.app_settings, public.profiles,
             public.auth_user restart identity cascade;

    -- Accounts first: the on_auth_user_created trigger creates each profile as viewer + pending, as in production.
    insert into public.auth_user (id, name, email, email_verified) values
      ('${ID.admin}',        'Admin',        'admin@t.test',        true),
      ('${ID.adminPending}', 'AdminPending', 'adminpending@t.test', true),
      ('${ID.manager}',      'Manager',      'manager@t.test',      true),
      ('${ID.viewer}',       'Viewer',       'viewer@t.test',       true),
      ('${ID.pending}',      'Pending',      'pending@t.test',      true),
      ('${ID.rejected}',     'Rejected',     'rejected@t.test',     true),
      ('${ID.unassigned}',   'Unassigned',   'unassigned@t.test',   true);
    update public.profiles set role = 'admin',   status = 'approved' where id = '${ID.admin}';
    update public.profiles set role = 'admin'                       where id = '${ID.adminPending}';
    update public.profiles set role = 'manager', status = 'approved' where id = '${ID.manager}';
    update public.profiles set                   status = 'approved' where id in ('${ID.viewer}', '${ID.unassigned}');
    update public.profiles set                   status = 'rejected' where id = '${ID.rejected}';

    insert into public.locations (id, gbp_account_id, gbp_location_id, name) values
      ('${ID.loc1}', 'a', 'g1', 'Loc One'), ('${ID.loc2}', 'a', 'g2', 'Loc Two'), ('${ID.loc3}', 'a', 'g3', 'Loc Three');

    insert into public.location_groups (id, name) values ('${ID.group}', 'Group A'), ('${ID.emptyGroup}', 'Empty');
    insert into public.location_group_members (group_id, location_id) values ('${ID.group}', '${ID.loc2}');

    insert into public.user_locations (user_id, location_id, group_id) values
      ('${ID.manager}', '${ID.loc1}', null),
      ('${ID.viewer}', null, '${ID.group}'),
      ('${ID.pending}', '${ID.loc1}', null),
      ('${ID.rejected}', '${ID.loc1}', null);

    insert into public.reviews (location_id, gbp_review_id, rating, create_time) values
      ('${ID.loc1}', 'r1', 5, now()), ('${ID.loc2}', 'r2', 4, now()), ('${ID.loc3}', 'r3', 3, now());
    insert into public.sync_runs (status, location_id) values ('success', '${ID.loc1}'), ('success', '${ID.loc2}'), ('success', '${ID.loc3}'), ('success', null);
    insert into public.audit_log (actor_id, action) values ('${ID.admin}', 'seed');
    insert into public.app_settings (id) values (1);
  `);
}
