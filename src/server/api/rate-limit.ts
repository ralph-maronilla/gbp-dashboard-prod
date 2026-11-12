import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

export interface RateLimitRule {
  /** Namespace, e.g. "login" or "admin". */
  key: string;
  limit: number;
  windowSec: number;
}

// One app server process, so the counters live in memory. They reset when the server restarts, which only ever lets
// an attacker try again, never locks anyone out. (Behind several servers this would need a shared store.)
const limiters = new Map<string, RateLimiterMemory>();

function limiterFor(rule: RateLimitRule): RateLimiterMemory {
  const id = `${rule.key}:${rule.limit}:${rule.windowSec}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new RateLimiterMemory({ keyPrefix: rule.key, points: rule.limit, duration: rule.windowSec });
    limiters.set(id, limiter);
  }
  return limiter;
}

/** Returns true when the request is allowed. `identity` is an IP, an email or a user id. */
export async function allowRequest(rule: RateLimitRule, identity: string): Promise<boolean> {
  try {
    await limiterFor(rule).consume(identity);
    return true;
  } catch (rejected) {
    // rate-limiter-flexible rejects with a RateLimiterRes when the limit is hit (and with an Error on a real fault).
    if (rejected instanceof Error) {
      console.error("[rate-limit] limiter error:", rejected.message);
      return false; // fail closed: an unexpected fault must not switch the limit off
    }
    return false;
  }
}

/**
 * The caller's address. In production the app listens only on localhost behind Caddy, which sets X-Real-IP to the real
 * peer address and overwrites anything the client sent, so that header can be trusted. X-Forwarded-For is
 * client-controlled and is only read in development, where there is no proxy.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.split(",")[0].trim();
  return process.env.NODE_ENV === "production" ? "unknown" : req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
