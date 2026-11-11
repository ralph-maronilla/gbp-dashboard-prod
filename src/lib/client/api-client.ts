export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
  get isForbidden() {
    return this.status === 403;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skip the global 401 → /login redirect (used by the login form itself). */
  skipAuthRedirect?: boolean;
}

/** Typed fetch wrapper. Unwraps `{ data }`, throws ApiClientError for `{ error }`. */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const method = opts.method ?? "GET";
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(opts.body),
  });

  let payload: { data?: T; error?: { code?: string; message?: string } } | null = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const err = new ApiClientError(
      res.status,
      payload?.error?.code ?? "UNKNOWN",
      payload?.error?.message ?? "Request failed",
    );
    if (res.status === 401 && !opts.skipAuthRedirect) window.location.assign("/login");
    if (res.status === 403 && err.code === "NOT_APPROVED") window.location.assign("/pending-approval");
    throw err;
  }
  return payload?.data as T;
}
