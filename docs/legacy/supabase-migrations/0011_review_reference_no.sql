-- Reference # in the CSV is a 6-digit number (100000-999999) instead of Google's long review id. It is assigned once,
-- when a review is first saved, from a sequence, so it is unique and never changes. Existing reviews are numbered
-- oldest first. The sequence only advances for reviews that are really new (see upsertReviews).
-- 900,000 numbers are available; past that, inserts fail loudly rather than reuse a number.
create sequence if not exists public.reviews_reference_no_seq as integer minvalue 100000 maxvalue 999999 start 100000 no cycle;

alter table public.reviews add column if not exists reference_no integer;

with numbered as (
  select id, 99999 + row_number() over (order by create_time, id) as n
  from public.reviews
  where reference_no is null
)
update public.reviews r set reference_no = numbered.n from numbered where r.id = numbered.id;

select setval('public.reviews_reference_no_seq', greatest(100000, coalesce((select max(reference_no) from public.reviews), 100000)),
              (select count(*) > 0 from public.reviews));

alter table public.reviews alter column reference_no set default nextval('public.reviews_reference_no_seq');
alter table public.reviews alter column reference_no set not null;
create unique index if not exists reviews_reference_no_key on public.reviews (reference_no);
