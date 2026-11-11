import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { getPrisma } from "@/server/db/prisma";
import { nameKey, uniqueLocationName } from "@/server/data/locations-admin";
import { isShortMapsLink, looksLikePlaceId, parseMapsInput } from "@/server/serper/maps-input";
import { SERPER_PREFIX } from "@/server/sync/engine";
import { addLocationsSchema, type AddLocationsResult } from "@/lib/schemas/serper";
import { Prisma } from "@/generated/prisma/client";

/** Expands maps.app.goo.gl links with one redirect lookup (no Serper credit). Only Google short-link hosts are fetched. */
async function expand(input: string): Promise<string> {
  if (!isShortMapsLink(input)) return input;
  try {
    const res = await fetch(input.trim(), { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return res.headers.get("location") ?? input;
  } catch {
    return input;
  }
}

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Registers locations from pasted Maps links / CIDs (bulk, free), filed under a client (existing group
 * or a new name). No location is ever added twice:
 *  - the same Maps place (same CID, whatever link form it came in) is recognised and skipped;
 *  - a different place with a name that is already taken is added under a distinct name (city, then CID tail);
 *  - both rules are also enforced by the database, so two admins adding at the same moment can't create a duplicate.
 */
export const POST = withAuth(
  { roles: ["admin"], body: addLocationsSchema, rateLimit: { key: "admin", limit: 30, windowSec: 60 } },
  async ({ ctx, body }) => {
    const prisma = getPrisma(); // locations inserts have no RLS policy (service role only); route is admin-checked
    if (body.group_id && !(await prisma.location_groups.findUnique({ where: { id: body.group_id }, select: { id: true } }))) {
      throw Errors.badRequest("Unknown client");
    }

    // 1. Resolve every input to a CID; the same place pasted twice (even as link + CID) collapses to one entry.
    const invalid: string[] = [];
    const wanted = new Map<string, (typeof body.items)[number] & { linkName: string | null }>();
    for (const item of body.items) {
      const info = parseMapsInput(await expand(item.input));
      if (!info) {
        invalid.push(looksLikePlaceId(item.input) ? `${item.input} (place IDs are not supported: paste the Maps link or CID)` : item.input);
        continue;
      }
      const prev = wanted.get(info.cid);
      // Several inputs for one place: keep the one that carries the most information (a picked search result has a name).
      if (!prev || (!prev.name && item.name)) wanted.set(info.cid, { ...item, linkName: info.name });
    }

    // 2. Existing places and names.
    const gbpIds = [...wanted.keys()].map((cid) => `${SERPER_PREFIX}${cid}`);
    const existing = new Set(
      (await prisma.locations.findMany({ where: { gbp_location_id: { in: gbpIds } }, select: { gbp_location_id: true } })).map((l) => l.gbp_location_id),
    );
    const takenNames = new Set((await prisma.locations.findMany({ select: { name: true } })).map((l) => nameKey(l.name)));

    // 3. Create what is new. One row at a time: a unique violation (another admin got there first) is handled per
    //    row instead of failing the whole batch, so this can't be one transaction; the audit entry is written in
    //    `finally` instead, recording what was added even when the batch fails half-way.
    let added = 0;
    let alreadyAdded = 0;
    const renamed: AddLocationsResult["renamed"] = [];
    const created: string[] = [];
    let groupId = body.group_id ?? null;
    try {
      for (const [cid, item] of wanted) {
        const gbpId = `${SERPER_PREFIX}${cid}`;
        if (existing.has(gbpId)) {
          alreadyAdded++;
          continue;
        }
        const wantedName = item.name || item.linkName || `Location ${cid}`;
        for (let attempt = 0; attempt < 5; attempt++) {
          const { name, renamed: didRename } = uniqueLocationName(wantedName, item.address ?? null, cid, takenNames);
          try {
            await prisma.locations.create({
              data: { gbp_location_id: gbpId, gbp_account_id: "serper", name, address: item.address || null },
            });
            added++;
            created.push(gbpId);
            if (didRename) renamed.push({ from: wantedName, to: name });
            break;
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            // Either the place or the name was taken a moment ago. Re-check which, then retry with fresh data.
            if (await prisma.locations.findUnique({ where: { gbp_location_id: gbpId }, select: { id: true } })) {
              alreadyAdded++;
              break;
            }
            for (const l of await prisma.locations.findMany({ select: { name: true } })) takenNames.add(nameKey(l.name));
          }
        }
      }

      // 4. File under the client (existing places too, so re-pasting a link moves it to the chosen client).
      if (!groupId && body.client_name) {
        groupId = (await prisma.location_groups.upsert({ where: { name: body.client_name }, create: { name: body.client_name, created_by: ctx.profile.id }, update: {}, select: { id: true } })).id;
      }
      if (groupId) {
        const all = await prisma.locations.findMany({ where: { gbp_location_id: { in: gbpIds } }, select: { id: true } });
        await prisma.location_group_members.createMany({ data: all.map((l) => ({ group_id: groupId as string, location_id: l.id })), skipDuplicates: true });
      }
    } finally {
      await ctx.db((tx) =>
        tx.audit_log.create({
          data: { actor_id: ctx.profile.id, action: "location.added", target: groupId, details: { added, already_added: alreadyAdded, invalid: invalid.length, renamed: renamed.length, created } },
        }),
      );
    }
    const response: AddLocationsResult = { added, already_added: alreadyAdded, invalid, renamed };
    return ok(response, 201);
  },
);
