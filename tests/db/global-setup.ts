import { execSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DB_URL } from "./url";

/**
 * Refuses to touch anything that is not obviously a throwaway test database, rebuilds it from the migrations
 * (so every run starts from the exact schema a fresh server would get), and leaves it ready for the tests.
 */
export default async function setup() {
  const name = new URL(TEST_DB_URL).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) throw new Error(`Refusing to run DB tests against "${name}": the database name must end in _test`);

  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  try {
    await client.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
  } finally {
    await client.end();
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DIRECT_URL: TEST_DB_URL, DATABASE_URL: TEST_DB_URL },
  });
}
