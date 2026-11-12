import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "./prisma";

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction scoped to one user: the role is switched to `app_user` and the
 * transaction-local setting `app.user_id` carries the caller's id, so `app.uid()` works and every
 * RLS policy applies. Everything user-driven must go through this; `getPrisma()` itself connects
 * as the schema owner and bypasses RLS.
 *
 * `userId` must come from a validated session, never from client input.
 */
export async function withRls<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error("withRls: invalid user id");
  return getPrisma().$transaction(
    async (tx) => {
      // set_config(..., true) is transaction-local, so nothing leaks to pooled connections.
      await tx.$executeRaw`select set_config('app.user_id', ${userId}, true), set_config('role', 'app_user', true)`;
      return fn(tx);
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}
