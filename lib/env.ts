function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  /** Publishable key (new name) or legacy anon key; both are safe to use with RLS. */
  get supabaseAnonKey() {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      required("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    );
  },
  /** Pooled Postgres connection string (Supabase "Transaction pooler"). Server-only. */
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /** Canonical origin of this app, used for the CSRF Origin check and email redirects. */
  get appUrl(): string | undefined {
    const url = process.env.APP_URL?.replace(/\/$/, "");
    // Without it the origin is taken from the Host header, which a caller controls: wrong for CSRF and email links.
    if (!url && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") throw new Error("Missing environment variable: APP_URL");
    return url;
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  /** Bearer secret Vercel Cron sends to /api/cron/sync. */
  get cronSecret() {
    return process.env.CRON_SECRET || undefined;
  },
  /** IANA time zone used for the CSV export's date column and date filters. */
  get exportTimeZone() {
    const tz = process.env.EXPORT_TIMEZONE || "Asia/Manila";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      return "Asia/Manila";
    }
  },
  /** Serper (google.serper.dev) key: the source of all review data. */
  get serperApiKey() {
    return process.env.SERPER_API_KEY || undefined;
  },
  /** Country / language Serper searches as (affects place matching and relative dates). */
  get serperGl() {
    return process.env.SERPER_GL || "ph";
  },
  get serperHl() {
    return process.env.SERPER_HL || "en";
  },
  /** Locations fetched in parallel within one run. */
  get serperConcurrency() {
    return clampInt(process.env.SERPER_CONCURRENCY, 4, 1, 10);
  },
  /** Hard stop on paid requests per run (1 credit = 1 page of 20 reviews). */
  get serperMaxCreditsPerRun() {
    return clampInt(process.env.SERPER_MAX_CREDITS_PER_RUN, 500, 1, 100_000);
  },
  /** Extraction (manual and automatic) stops for the day once this many credits were spent (UTC day). */
  get serperDailyCreditLimit() {
    return clampInt(process.env.SERPER_DAILY_CREDIT_LIMIT, 5000, 0, 10_000_000);
  },
  /** Credits one person may spend per UTC day (Extract and Google refresh), within the shared daily limit. */
  get serperUserDailyCreditLimit() {
    return clampInt(process.env.SERPER_USER_DAILY_CREDIT_LIMIT, 200, 0, 10_000_000);
  },
  /** How many runs may chain automatically after each other to finish a large backfill. */
  get syncMaxChain() {
    return clampInt(process.env.SYNC_MAX_CHAIN, 50, 0, 1000);
  },
};
