import { userInfo } from "node:os";

/** Test database. Defaults to the local Postgres.app database; CI sets TEST_DATABASE_URL. Never read from .env.local. */
export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? `postgresql://${userInfo().username}@localhost:5432/gbp_dashboard_test`;
