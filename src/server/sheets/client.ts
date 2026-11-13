import "server-only";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export interface SheetTab {
  id: number;
  title: string;
  index: number;
}

export interface TabValues {
  /** A1 range of the top-left cell, e.g. `'Makati'!A1`. */
  range: string;
  values: (string | number)[][];
}

/** A failed Sheets API call, with a message an admin can act on. */
export class SheetsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The three Sheets API calls the mirror needs, for one spreadsheet. Every call stops at `signal`. */
export function sheetsClient(spreadsheetId: string, token: string, signal?: AbortSignal) {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${BASE}/${encodeURIComponent(spreadsheetId)}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!res.ok) {
      const hint =
        res.status === 404
          ? "The spreadsheet was not found. Check GOOGLE_SHEETS_SPREADSHEET_ID."
          : res.status === 403
            ? "Google refused access. Share the sheet with the service account's email as Editor, and enable the Google Sheets API."
            : (json?.error?.message ?? `Google Sheets answered ${res.status}`);
      throw new SheetsError(res.status, hint);
    }
    return json as T;
  };

  return {
    /** The spreadsheet's tabs, left to right. */
    async tabs(): Promise<SheetTab[]> {
      const data = await call<{ sheets?: { properties: { sheetId: number; title: string; index: number } }[] }>("?fields=sheets.properties(sheetId,title,index)");
      return (data.sheets ?? []).map((s) => ({ id: s.properties.sheetId, title: s.properties.title, index: s.properties.index }));
    },
    /** Structural changes (add, rename, delete, resize, reorder tabs), applied in order, all or nothing. */
    async batchUpdate(requests: object[]): Promise<void> {
      if (requests.length > 0) await call(":batchUpdate", { requests });
    },
    /** Writes cell values exactly as given (RAW: text starting with "=" stays text and never runs as a formula). */
    async writeValues(data: TabValues[]): Promise<void> {
      if (data.length > 0) await call("/values:batchUpdate", { valueInputOption: "RAW", data });
    },
  };
}

export type SheetsClient = ReturnType<typeof sheetsClient>;
