import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/server/env";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/server/supabase/server";
import { withRls, type Tx } from "@/server/db/with-rls";
import { profileSchema, type Profile, type Role } from "@/lib/schemas/common";
import { ApiError, Errors } from "./errors";
import { failure } from "./response";
import { allowRequest, clientIp, type RateLimitRule } from "./rate-limit";

type Opt = z.ZodType | undefined;
type Out<S> = S extends z.ZodType ? z.output<S> : undefined;

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };
type RouteHandler = (req: NextRequest, route: RouteContext) => Promise<Response>;

export interface AuthContext {
  user: { id: string };
  profile: Profile;
  /** Supabase client for auth operations only (sign out). Data access goes through `db`. */
  supabase: SupabaseServerClient;
  /** Runs `fn` in an RLS-scoped Prisma transaction as the caller (see lib/db/with-rls.ts). */
  db: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  ip: string;
}

interface Schemas<P extends Opt, Q extends Opt, B extends Opt> {
  params?: P;
  query?: Q;
  body?: B;
  /** Per-user limit (and per-IP for public routes). Defaults apply to authed routes. */
  rateLimit?: RateLimitRule;
}

export interface AuthOptions<P extends Opt, Q extends Opt, B extends Opt> extends Schemas<P, Q, B> {
  /** Required and non-empty. There is deliberately no default: no roles list, no route. */
  roles: readonly [Role, ...Role[]];
  /** Defaults to true. Only /api/me and logout turn this off. */
  requireApproved?: boolean;
}

export interface PublicOptions<P extends Opt, Q extends Opt, B extends Opt> extends Schemas<P, Q, B> {
  rateLimit: RateLimitRule; // mandatory for unauthenticated routes
}

interface Args<P extends Opt, Q extends Opt, B extends Opt> {
  req: NextRequest;
  params: Out<P>;
  query: Out<Q>;
  body: Out<B>;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IP_RULE: RateLimitRule = { key: "api-ip", limit: 300, windowSec: 60 };
const USER_RULE: RateLimitRule = { key: "api-user", limit: 120, windowSec: 60 };

function checkCsrfAndContentType(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const expected = env.appUrl ?? req.nextUrl.origin;
  if (req.headers.get("origin") !== expected) {
    throw new ApiError(403, "CSRF", "Cross-origin request rejected");
  }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
}

function parseWith<S extends Opt>(schema: S, input: unknown): Out<S> {
  if (!schema) return undefined as Out<S>;
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid request", {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data as Out<S>;
}

async function parseInputs<P extends Opt, Q extends Opt, B extends Opt>(
  opts: Schemas<P, Q, B>,
  req: NextRequest,
  route: RouteContext,
): Promise<Args<P, Q, B>> {
  const params = parseWith(opts.params as P, await route.params);
  const query = parseWith(
    opts.query as Q,
    Object.fromEntries(req.nextUrl.searchParams),
  );
  let body: Out<B> = undefined as Out<B>;
  if (opts.body) {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw Errors.badRequest("Malformed JSON body");
    }
    body = parseWith(opts.body as B, raw);
  }
  return { req, params, query, body };
}

/** Database errors can echo input values in their message, so those are logged by class and code only. */
function errorCode(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  return code ? `${(err as object).constructor.name} ${code}` : errorMessage(err);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return "unknown error";
}

function toResponse(req: NextRequest, err: unknown): Response {
  if (err instanceof ApiError) return failure(err);
  // Never leak internals to the client; log only the message server-side.
  console.error("[api]", req.method, req.nextUrl.pathname, errorCode(err));
  return failure(new ApiError(500, "INTERNAL", "Something went wrong"));
}

async function enforce(rule: RateLimitRule, identity: string) {
  if (!(await allowRequest(rule, identity))) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests, please try again later");
  }
}

/**
 * Wraps a route handler with: CSRF/content-type → IP rate limit → session (validated with Supabase) →
 * profile → approval → role → per-user rate limit → zod parsing. Handler code runs only after all pass.
 */
export function withAuth<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
>(
  opts: AuthOptions<P, Q, B>,
  handler: (args: Args<P, Q, B> & { ctx: AuthContext }) => Promise<Response>,
): RouteHandler {
  // Fail closed at module load: a route with no roles must never exist.
  if (!Array.isArray(opts.roles) || opts.roles.length === 0) {
    throw new Error("withAuth: `roles` must be a non-empty list");
  }
  return async (req, route) => {
    try {
      checkCsrfAndContentType(req);
      const ip = clientIp(req);
      await enforce(IP_RULE, ip);

      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw Errors.unauthenticated();

      const userId = data.user.id;
      const row = await withRls(userId, (tx) =>
        tx.profiles.findUnique({
          where: { id: userId },
          select: { id: true, email: true, full_name: true, role: true, status: true },
        }),
      );
      const parsed = profileSchema.safeParse(row);
      if (!parsed.success) throw Errors.forbidden();
      const profile = parsed.data;

      if ((opts.requireApproved ?? true) && profile.status !== "approved") throw Errors.notApproved();
      if (!opts.roles.includes(profile.role)) throw Errors.forbidden();

      await enforce(opts.rateLimit ?? USER_RULE, profile.id);

      const inputs = await parseInputs(opts, req, route);
      const ctx: AuthContext = {
        user: { id: profile.id },
        profile,
        supabase,
        db: (fn) => withRls(profile.id, fn),
        ip,
      };
      return await handler({ ...inputs, ctx });
    } catch (err) {
      return toResponse(req, err);
    }
  };
}

/** Explicit opt-out for unauthenticated routes (signup, login). Still CSRF-checked and rate-limited per IP. */
export function publicRoute<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
>(
  opts: PublicOptions<P, Q, B>,
  handler: (args: Args<P, Q, B> & { ip: string }) => Promise<Response>,
): RouteHandler {
  return async (req, route) => {
    try {
      checkCsrfAndContentType(req);
      const ip = clientIp(req);
      await enforce(IP_RULE, ip);
      await enforce(opts.rateLimit, ip);
      const inputs = await parseInputs(opts, req, route);
      return await handler({ ...inputs, ip });
    } catch (err) {
      return toResponse(req, err);
    }
  };
}
