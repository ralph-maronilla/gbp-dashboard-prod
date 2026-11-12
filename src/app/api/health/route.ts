import { publicRoute } from "@/server/api/with-auth";
import { ok, failure } from "@/server/api/response";
import { ApiError } from "@/server/api/errors";
import { getPrisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

/**
 * Liveness + database check for deploy scripts and uptime monitors. Public by design, so it answers only "ok" or
 * "unavailable": no versions, no error text, nothing about the database.
 */
export const GET = publicRoute({ rateLimit: { key: "health", limit: 60, windowSec: 60 } }, async () => {
  try {
    await Promise.race([
      getPrisma().$queryRaw`select 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : "unknown error");
    return failure(new ApiError(503, "INTERNAL", "unavailable"));
  }
  const res = ok({ status: "ok" });
  res.headers.set("Cache-Control", "no-store");
  return res;
});
