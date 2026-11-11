import { NextResponse } from "next/server";
import type { ApiError } from "./errors";

/** Success envelope: { data }. Error envelope: { error: { code, message } }. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: ApiError) {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...error.extra } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}
