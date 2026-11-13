import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssertion, getAccessToken, resetTokenCache } from "./google-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const account = { clientEmail: "mirror@project.iam.gserviceaccount.com", privateKey };
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("buildAssertion", () => {
  it("claims the service account, the Sheets scope and one hour, signed with its key", () => {
    const now = Date.UTC(2026, 10, 13, 8, 0, 0);
    const [head, claims, signature] = buildAssertion(account.clientEmail, privateKey, now).split(".") as [string, string, string];
    expect(decode(head)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: account.clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    expect(createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("getAccessToken", () => {
  beforeEach(() => resetTokenCache());
  afterEach(() => vi.unstubAllGlobals());

  it("exchanges the assertion for a token and reuses it until it is about to expire", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAccessToken(account)).toBe("tok-1");
    expect(await getAccessToken(account)).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect((init.body as URLSearchParams).get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
  });

  it("explains a refused account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }), { status: 400 })));
    await expect(getAccessToken(account)).rejects.toThrow(/did not accept the service account \(Invalid JWT Signature\.\)/);
  });

  it("explains an unreadable key without calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAccessToken({ clientEmail: "x@y", privateKey: "not a key" })).rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
