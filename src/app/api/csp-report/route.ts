import type { NextRequest } from "next/server";
import { allowRequest, clientIp } from "@/server/api/rate-limit";

/**
 * Browsers report blocked content here (CSP `report-uri`, see proxy.ts). No session (the browser sends it on its own),
 * so it only logs a trimmed summary, rate-limited per IP, and always answers 204.
 */
export async function POST(req: NextRequest) {
  if (!(await allowRequest({ key: "csp-report", limit: 20, windowSec: 60 }, clientIp(req)))) return new Response(null, { status: 204 });
  try {
    const body = (await req.json()) as { "csp-report"?: Record<string, unknown> };
    const r = body["csp-report"] ?? {};
    const pick = (k: string) => String(r[k] ?? "").slice(0, 200);
    console.warn("[csp]", pick("violated-directive") || pick("effective-directive"), "blocked:", pick("blocked-uri"), "on:", pick("document-uri"));
  } catch {
    // not JSON: ignore
  }
  return new Response(null, { status: 204 });
}
