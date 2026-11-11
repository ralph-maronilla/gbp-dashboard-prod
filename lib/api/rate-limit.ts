import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitRule {
  /** Namespace, e.g. "login" or "admin". */
  key: string;
  limit: number;
  windowSec: number;
}

/** Sign-in and account routes: when the shared limiter is down these are refused rather than left unlimited. */
const FAIL_CLOSED = new Set(["login-ip", "login-email", "signup", "forgot-ip", "forgot-email", "reset-password"]);

// Upstash when configured (shared across serverless instances); in-memory otherwise (dev only: per instance).
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const upstashLimiters = new Map<string, Ratelimit>();
const memoryHits = new Map<string, number[]>();
let warnedNoRedis = false;

function upstashFor(rule: RateLimitRule): Ratelimit {
  const id = `${rule.key}:${rule.limit}:${rule.windowSec}`;
  let limiter = upstashLimiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSec} s`),
      prefix: `rl:${rule.key}`,
    });
    upstashLimiters.set(id, limiter);
  }
  return limiter;
}

/** Returns true when the request is allowed. `identity` is an IP or a user id. */
export async function allowRequest(rule: RateLimitRule, identity: string): Promise<boolean> {
  if (redis) {
    try {
      return (await upstashFor(rule).limit(identity)).success;
    } catch {
      // A limiter outage must not take the whole app down (auth checks still apply), except where it guards sign-in.
      return !FAIL_CLOSED.has(rule.key);
    }
  }
  if (process.env.NODE_ENV === "production" && !warnedNoRedis) {
    warnedNoRedis = true;
    console.warn("[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set: limits are per server instance and weak on serverless. Set them.");
  }
  const now = Date.now();
  const id = `${rule.key}:${identity}`;
  const recent = (memoryHits.get(id) ?? []).filter((t) => now - t < rule.windowSec * 1000);
  if (recent.length >= rule.limit) {
    memoryHits.set(id, recent);
    return false;
  }
  recent.push(now);
  memoryHits.set(id, recent);
  if (memoryHits.size > 10_000) memoryHits.clear(); // crude bound for long-lived dev servers
  return true;
}

/** The caller's address from the header the platform sets itself; X-Forwarded-For is client-controlled behind any other proxy. */
export function clientIp(req: Request): string {
  const trusted = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip");
  if (trusted) return trusted.split(",")[0].trim();
  return process.env.NODE_ENV === "production" ? "unknown" : req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
