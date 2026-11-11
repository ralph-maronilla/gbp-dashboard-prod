-- Hours from a review to its owner reply, kept up to date by Postgres (null when there is no reply). Lets the Extraction
-- reviews table filter by reply time (within a day / 1-7 days / over 7 days). Approximate when the reply's date came from
-- Google's "3 weeks ago" (reply_time_source = 'relative'). Safe to run more than once.
alter table public.reviews
  add column if not exists reply_hours double precision
  generated always as (extract(epoch from (reply_time - create_time)) / 3600.0) stored;
