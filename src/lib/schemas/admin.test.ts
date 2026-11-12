import { describe, expect, it } from "vitest";
import { heartbeatSchema, listUsersQuerySchema, setUserLocationsSchema, updateUserSchema } from "./admin";
import { profileSchema } from "./common";

const ID = "3f2b8c1e-5a47-4d9e-8b6a-1c2d3e4f5a6b";

describe("updateUserSchema", () => {
  it("accepts approve, reject and set_role", () => {
    expect(updateUserSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ action: "reject" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ action: "set_role", role: "manager" }).success).toBe(true);
  });
  it("rejects an unknown role, a missing role and an unknown action", () => {
    expect(updateUserSchema.safeParse({ action: "set_role", role: "owner" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ action: "set_role" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ action: "delete" }).success).toBe(false);
  });
});

describe("listUsersQuerySchema", () => {
  it("applies defaults and coerces query strings", () => {
    expect(listUsersQuerySchema.parse({})).toEqual({ page: 0, pageSize: 25 });
    expect(listUsersQuerySchema.parse({ page: "2", pageSize: "50", status: "pending", q: "  ann " })).toEqual({ page: 2, pageSize: 50, status: "pending", q: "ann" });
  });
  it("limits page size to 100", () => {
    expect(listUsersQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(listUsersQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
  });
});

describe("setUserLocationsSchema", () => {
  it("requires uuids", () => {
    expect(setUserLocationsSchema.safeParse({ location_ids: [ID], group_ids: [] }).success).toBe(true);
    expect(setUserLocationsSchema.safeParse({ location_ids: ["x"], group_ids: [] }).success).toBe(false);
  });
});

describe("heartbeatSchema", () => {
  it("needs an in-app path", () => {
    expect(heartbeatSchema.safeParse({ path: "/dashboard" }).success).toBe(true);
    expect(heartbeatSchema.safeParse({ path: "https://evil.test" }).success).toBe(false);
    expect(heartbeatSchema.safeParse({ path: "/" + "a".repeat(200) }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts only known roles and statuses", () => {
    const ok = { id: ID, email: "a@b.co", full_name: null, role: "viewer", status: "pending", can_extract: false };
    expect(profileSchema.safeParse(ok).success).toBe(true);
    expect(profileSchema.safeParse({ ...ok, role: "root" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...ok, status: "banned" }).success).toBe(false);
  });
});
