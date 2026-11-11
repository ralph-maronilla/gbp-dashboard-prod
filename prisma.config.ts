import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma CLI does not read Next's .env.local on its own.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Direct (non-pooled) connection for CLI commands such as `prisma db pull`.
    // Falls back to "" so `prisma generate` works without a database.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
