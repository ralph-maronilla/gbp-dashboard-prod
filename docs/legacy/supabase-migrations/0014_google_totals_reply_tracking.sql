-- 1) Google's public rating and total review count per location, refreshed on demand by an admin (Serper Maps lookup).
--    The total goes in the existing source_review_count column.
alter table public.locations add column if not exists google_rating numeric(2,1);
alter table public.locations add column if not exists google_checked_at timestamptz;

-- 2) Region is one of the 18 Philippine regions (codes from lib/ph-regions.ts). Anything else is cleared first.
update public.locations set region = null
where region is not null
  and region not in ('NCR','CAR','I','II','III','IV-A','MIMAROPA','V','VI','VII','VIII','NIR','IX','X','XI','XII','XIII','BARMM');
alter table public.locations drop constraint if exists locations_region_len;
alter table public.locations drop constraint if exists locations_region_valid;
alter table public.locations add constraint locations_region_valid check (
  region is null or region in ('NCR','CAR','I','II','III','IV-A','MIMAROPA','V','VI','VII','VIII','NIR','IX','X','XI','XII','XIII','BARMM')
);

-- 3) Measured reply times: when an extraction first sees an owner reply on a review it had already saved without one,
--    the reply time is that moment ('observed', accurate to the extraction interval). Replies that were already there
--    when the review was first saved only have Serper's "3 weeks ago" ('relative').
alter table public.reviews add column if not exists reply_seen_at timestamptz;
alter table public.reviews add column if not exists reply_time_source text;
alter table public.reviews drop constraint if exists reviews_reply_time_source_valid;
alter table public.reviews add constraint reviews_reply_time_source_valid check (reply_time_source is null or reply_time_source in ('observed', 'relative'));
update public.reviews set reply_time_source = 'relative' where reply_comment is not null and reply_time_source is null;

-- 4) Runs that spend Serper credits: extraction runs and Google-totals refreshes. Both count toward the daily credit
--    budget; only extraction runs show as the "last extraction".
alter table public.sync_runs add column if not exists kind text not null default 'extract';
alter table public.sync_runs drop constraint if exists sync_runs_kind_valid;
alter table public.sync_runs add constraint sync_runs_kind_valid check (kind in ('extract', 'google_refresh'));
