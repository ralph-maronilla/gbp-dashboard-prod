import "server-only";
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/**
 * The signed request a Google service account exchanges for an access token (a JWT, RS256): "I am `clientEmail`, I want
 * `SCOPE`, for the next hour". `now` is in milliseconds.
 */
export function buildAssertion(clientEmail: string, privateKey: string, now: number): string {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(privateKey);
  return `${head}.${claims}.${b64url(signature)}`;
}

let cached: { key: string; token: string; expires: number } | null = null;

/** An access token for the Sheets API, reused until a minute before it expires. */
export async function getAccessToken(account: { clientEmail: string; privateKey: string }, signal?: AbortSignal): Promise<string> {
  const now = Date.now();
  if (cached && cached.key === account.clientEmail && cached.expires - 60_000 > now) return cached.token;
  let assertion: string;
  try {
    assertion = buildAssertion(account.clientEmail, account.privateKey, now);
  } catch {
    throw new Error("The Google service account key could not be read. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
    signal,
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(`Google did not accept the service account (${body?.error_description ?? res.status}). Check its email and key.`);
  }
  cached = { key: account.clientEmail, token: body.access_token, expires: now + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Tests only: forget the cached token. */
export function resetTokenCache() {
  cached = null;
}
