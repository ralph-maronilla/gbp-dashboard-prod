-- Link to the reviewer's Google profile (Serper returns it with every review, no extra credits). Shown in the reviews
-- table and added as the last CSV column. Reviews saved before this migration get it the next time they are re-read.
alter table public.reviews add column if not exists reviewer_url text;
