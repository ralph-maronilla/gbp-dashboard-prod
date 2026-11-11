import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * User-scoped Supabase client (anon key + the caller's session cookies), so RLS applies.
 * Cookies are httpOnly + SameSite=Lax: the browser never needs to read the session,
 * because all data goes through /api route handlers.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: { sameSite: "lax", secure: env.isProd, httpOnly: true, path: "/" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a context where cookies are read-only; the proxy refreshes the session.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
