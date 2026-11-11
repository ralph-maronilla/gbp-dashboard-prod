import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "./prisma";

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction that behaves like a Supabase user-scoped request:
 * the role is switched to `authenticated` and the JWT claims carry the caller's id, so
 * `auth.uid()` works and every RLS policy applies. Everything user-driven must go through
 * this; `getPrisma()` itself connects as a privileged role and bypasses RLS.
 *
 * `userId` must come from a validated session (supabase.auth.getUser()), never from client input.
 */
export async function withRls<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error("withRls: invalid user id");
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return getPrisma().$transaction(
    async (tx) => {
      // set_config(..., true) is transaction-local, so nothing leaks to pooled connections.
      await tx.$executeRaw`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
      return fn(tx);
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}
