/** What an admin sees of the Google Sheet mirror of the reviews (GET /api/admin/sheet-sync). */
export interface SheetSyncStatus {
  /** The spreadsheet and service account are set in the server's environment. */
  configured: boolean;
  /** Link to open the spreadsheet (null when not configured). */
  sheet_url: string | null;
  /** When the sheet was last written successfully, and how many reviews it then held. */
  synced_at: string | null;
  rows: number | null;
  /** Reviews or locations changed since: the scheduler writes the sheet at its next call. */
  pending: boolean;
  /** Why the last attempt failed (null after a success). */
  error: string | null;
}
