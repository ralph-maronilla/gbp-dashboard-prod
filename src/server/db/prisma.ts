import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

function sslConfig() {
  // Prefer the real Supabase CA (set DATABASE_CA_CERT to the PEM, newlines as \n).
  if (process.env.DATABASE_CA_CERT) return { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") };
  // Dev-only escape hatch for "self-signed certificate in certificate chain" errors.
  if (!env.isProd && process.env.DATABASE_SSL_NO_VERIFY === "true") return { rejectUnauthorized: false };
  return undefined;
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.databaseUrl,
    ssl: sslConfig(),
    max: env.isProd ? 3 : 10, // serverless: keep per-instance pools small
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
