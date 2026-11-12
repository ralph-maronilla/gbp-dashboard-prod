-- The app reads and updates exactly one settings row (id = 1, enforced by a check constraint). Production already has it;
-- a new database starts without, which made the automatic-extraction settings fail. Create it here, with the column defaults
-- (automatic extraction off, 06:00, 300 credits). Existing databases keep their row.
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
