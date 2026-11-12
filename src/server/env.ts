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
  /** PostgreSQL connection string for the app (the managed Lightsail database in production). Server-only. */
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /** Connections the app may hold open. One long-running server, so a modest fixed pool; keep it under the database's limit. */
  get dbPoolMax() {
    return clampInt(process.env.DATABASE_POOL_MAX, 10, 1, 100);
  },
  /** Signs session cookies and one-time tokens. 32+ random characters (`openssl rand -base64 32`). Server-only. */
  get authSecret() {
    const value = required("BETTER_AUTH_SECRET");
    if (value.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
    return value;
  },
  /** Outgoing mail (SMTP). Without SMTP_HOST, development prints emails to the server log; production refuses to run. */
  get smtp() {
    const host = process.env.SMTP_HOST || undefined;
    const port = clampInt(process.env.SMTP_PORT, 587, 1, 65535);
    return {
      host,
      port,
      // Port 465 is implicit TLS; 587 upgrades with STARTTLS (nodemailer does that on its own when offered).
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.SMTP_FROM || "GBP Review Dashboard <no-reply@localhost>",
    };
  },
  /** Where the server can reach itself (for automatic extraction to continue itself). Defaults to APP_URL. */
  get internalAppUrl(): string | undefined {
    return process.env.INTERNAL_APP_URL?.replace(/\/$/, "") || undefined;
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
  /** Bearer secret the scheduler (the systemd timer) sends to /api/cron/sync. */
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
  /** Serper's API origin. Only tests change it (to a local stub, so no credits are spent). */
  get serperBaseUrl() {
    return (process.env.SERPER_BASE_URL || "https://google.serper.dev").replace(/\/$/, "");
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
