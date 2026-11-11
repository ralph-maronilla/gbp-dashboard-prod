/** Each browser reports in about once an hour, so "active" means a report within the hour plus a little slack. */
export const HEARTBEAT_MS = 60 * 60_000;
export const ACTIVE_WINDOW_MS = HEARTBEAT_MS + 5 * 60_000;
/** How far back the "recently seen" list looks. */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60_000;

export const isActive = (lastSeen: string | null | undefined, now = Date.now()): boolean =>
  !!lastSeen && now - new Date(lastSeen).getTime() <= ACTIVE_WINDOW_MS;

const PAGES: [prefix: string, label: string][] = [
  ["/dashboard", "Dashboard"],
  ["/locations", "Locations"],
  ["/extraction", "Extraction"],
  ["/admin/users", "Users"],
];

/** "/dashboard?tab=compare" → "Dashboard"; "/" is the overview. */
export function pageLabel(path: string | null | undefined): string {
  if (!path) return "";
  if (path === "/") return "Overview";
  return PAGES.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "App";
}

/**
 * Signed-in pages sign out after this long without activity (pointer, keys, scroll, touch), with a warning shortly
 * before. In development NEXT_PUBLIC_IDLE_MINUTES can shorten it for testing; production always uses 60 minutes.
 */
const devIdleMinutes = process.env.NODE_ENV !== "production" ? Number(process.env.NEXT_PUBLIC_IDLE_MINUTES) : NaN;
export const IDLE_LIMIT_MS = (devIdleMinutes > 0 ? devIdleMinutes : 60) * 60_000;
export const IDLE_WARNING_MS = IDLE_LIMIT_MS - Math.min(5 * 60_000, IDLE_LIMIT_MS / 6);

export type IdleState = "active" | "warn" | "expired";

export function idleState(lastActivity: number, now = Date.now()): IdleState {
  const idle = now - lastActivity;
  return idle >= IDLE_LIMIT_MS ? "expired" : idle >= IDLE_WARNING_MS ? "warn" : "active";
}
