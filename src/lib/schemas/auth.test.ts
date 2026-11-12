import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "./auth";

describe("signupSchema", () => {
  it("trims and lower-cases the email", () => {
    const r = signupSchema.parse({ email: "  Jane@Example.COM ", password: "longenough" });
    expect(r.email).toBe("jane@example.com");
  });
  it("requires 8 to 72 characters", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "a@b.co", password: "x".repeat(72) }).success).toBe(true);
    expect(signupSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
  it("limits the name to 100 characters and allows leaving it out", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", password: "longenough" }).success).toBe(true);
    expect(signupSchema.safeParse({ email: "a@b.co", password: "longenough", full_name: "x".repeat(101) }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "a@b.co", password: "longenough", full_name: "   " }).success).toBe(false);
  });
  it("rejects a bad email", () => {
    expect(signupSchema.safeParse({ email: "nope", password: "longenough" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts any non-empty password up to 72 characters", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });
});

describe("forgotPasswordSchema / resetPasswordSchema", () => {
  it("normalises the email", () => {
    expect(forgotPasswordSchema.parse({ email: " A@B.co " }).email).toBe("a@b.co");
  });
  it("applies the signup password rules on reset", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", password: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t", password: "longenough" }).success).toBe(true);
  });
  it("needs the emailed token", () => {
    expect(resetPasswordSchema.safeParse({ password: "longenough" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "", password: "longenough" }).success).toBe(false);
  });
  it("rejects passwords over 72 bytes, which bcrypt would silently cut", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", password: "é".repeat(36) }).success).toBe(true); // 72 bytes
    expect(signupSchema.safeParse({ email: "a@b.co", password: "é".repeat(37) }).success).toBe(false); // 74 bytes
  });
});
