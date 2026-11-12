import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { owner } from "../../../../tests/db/helpers";

vi.mock("@/server/db/prisma", () => ({ getPrisma: () => owner }));
import { GET } from "./route";

afterAll(() => owner.$disconnect());

const call = () => GET(new NextRequest("http://localhost:3000/api/health"), { params: Promise.resolve({}) });

describe("GET /api/health", () => {
  it("answers ok without a session when the database is reachable, and says nothing else", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ data: { status: "ok" } });
  });

  it("answers 503 'unavailable' without details when the database fails", async () => {
    const spy = vi.spyOn(owner, "$queryRaw").mockRejectedValueOnce(new Error("password authentication failed for user secret_user"));
    const res = await call();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret_user|password/);
    spy.mockRestore();
  });
});
