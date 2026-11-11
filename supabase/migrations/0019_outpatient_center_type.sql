-- Location type "Clinic" is now called "Outpatient Center" (Dashboard segment "Outpatient Centers"). Renames the stored
-- value on every location; safe to run more than once.
update public.locations
set location_type = 'Outpatient Center'
where lower(btrim(location_type)) = 'clinic';
