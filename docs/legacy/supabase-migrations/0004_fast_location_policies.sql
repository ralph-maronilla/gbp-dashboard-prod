-- Performance: evaluate the caller's accessible locations ONCE per query instead of calling
-- can_access_location() for every review row. Same access rules, flat cost as review volume grows.
-- (Measured: 27k reviews 5.1s -> 0.44s.)

create function public.accessible_location_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  -- admins: every location
  select l.id from public.locations l where public.is_admin()
  union
  -- directly assigned locations
  select ul.location_id from public.user_locations ul
  where ul.user_id = auth.uid() and ul.location_id is not null and public.is_approved()
  union
  -- locations inside assigned groups
  select m.location_id
  from public.user_locations ul
  join public.location_group_members m on m.group_id = ul.group_id
  where ul.user_id = auth.uid() and public.is_approved()
$$;

revoke all on function public.accessible_location_ids() from public, anon;
grant execute on function public.accessible_location_ids() to authenticated;

drop policy reviews_read on public.reviews;
create policy reviews_read on public.reviews for select
  using (location_id in (select public.accessible_location_ids()));

drop policy locations_read on public.locations;
create policy locations_read on public.locations for select
  using (id in (select public.accessible_location_ids()));

drop policy members_read on public.location_group_members;
create policy members_read on public.location_group_members for select
  using (location_id in (select public.accessible_location_ids()));
