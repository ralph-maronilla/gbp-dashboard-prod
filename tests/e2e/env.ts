import { userInfo } from "node:os";
import path from "node:path";

const dbBase = process.env.E2E_DATABASE_URL ?? `postgresql://${userInfo().username}@localhost:5432/gbp_dashboard_e2e_test`;

/** Shared by the Playwright config, global setup and the tests. */
export const E2E = {
  appPort: 3200,
  appUrl: "http://localhost:3200",
  serperPort: 4010,
  serperUrl: "http://127.0.0.1:4010",
  dbUrl: dbBase,
  sessionsDir: path.resolve(__dirname, ".tmp/sessions"),
  outboxFile: path.resolve(__dirname, ".tmp/outbox.jsonl"),
  cronSecret: "e2e-cron-secret-e2e-cron-secret-0123",
  password: "E2e-passw0rd!",
} as const;
