# Legacy Supabase migrations

`supabase-migrations/` holds the 21 SQL files (0001-0021) that built the production schema while the app ran on Supabase.
They are kept for reference only and nothing runs them. The schema now lives in `prisma/migrations/`: the baseline
migration is the production schema as of 2026-11-11, ported to plain PostgreSQL (see its header for what changed).
