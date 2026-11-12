import "server-only";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

function sslConfig() {
  // Managed PostgreSQL (Lightsail) requires TLS. Verify it against the provider's CA bundle: the PEM text in
  // DATABASE_CA_CERT (newlines as \n) or a file path in DATABASE_CA_FILE.
  if (process.env.DATABASE_CA_CERT) return { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") };
  if (process.env.DATABASE_CA_FILE) return { ca: readFileSync(process.env.DATABASE_CA_FILE, "utf8") };
  // Development-only escape hatch for a local database that insists on TLS with a self-signed certificate.
  if (!env.isProd && process.env.DATABASE_SSL_NO_VERIFY === "true") return { rejectUnauthorized: false };
  return undefined;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    ssl: sslConfig(),
    // The adapter writes timestamps as UTC; pin the session to UTC so the server's own timezone never shifts them (as in production).
    options: "-c timezone=UTC",
    max: env.dbPoolMax,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Lazy so builds and CI without DATABASE_URL still succeed; connects on first use. */
export function getPrisma(): PrismaClient {
  const client = globalForPrisma.prisma ?? createClient();
  globalForPrisma.prisma = client; // reused across invocations and dev hot reloads
  return client;
}
