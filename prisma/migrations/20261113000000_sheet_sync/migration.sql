-- Google Sheet mirror of the reviews (src/server/sheets). All on the one settings row:
--   sheet_dirty_at    set when reviews or locations changed since the last sync; the scheduler tick syncs and clears it
--   sheet_synced_at   when the sheet was last written successfully, and how many reviews it then held (sheet_rows)
--   sheet_sync_error  why the last attempt failed (null after a success)
--   sheet_tabs        the tabs the app created: {"all": <tab id>, "locations": {"<location id>": <tab id>}}.
--                     A renamed location keeps its tab; a deleted location's tab is removed; other tabs are never touched.
ALTER TABLE public.app_settings
  ADD COLUMN sheet_dirty_at timestamptz,
  ADD COLUMN sheet_synced_at timestamptz,
  ADD COLUMN sheet_rows integer,
  ADD COLUMN sheet_sync_error text,
  ADD COLUMN sheet_tabs jsonb;
