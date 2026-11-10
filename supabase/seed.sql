-- =====================================================================
-- Aardvark sample data: one van, 7 pets, today's route, 8 weeks of history
-- and the Academy courses. Run AFTER schema.sql, in Supabase → SQL Editor.
-- Re-running adds today's route again for the current day only if it is empty.
-- Delete the sample clients any time: delete from clients where notes = 'sample';
-- =====================================================================

insert into public.vans (id, name, zone, depot_lat, depot_lng)
values ('van-1', 'Van 1', 'Midtown Mobile', 30.6990, -88.1520)
on conflict (id) do nothing;

-- Courses (real curriculum outline — safe to keep)
insert into public.courses (id, title, duration_label, color, sort) values
  ('skin',   'Canine Skin & Coat Health',       '1h 20m', '#d9a35b', 1),
  ('bath',   'Professional Bathing Techniques', '55m',    '#c9a27e', 2),
  ('feline', 'Feline Grooming Basics',          '1h 45m', '#8a8f99', 3),
  ('comms',  'Client Communication',            '30m',    '#c7a98f', 4),
  ('tools',  'Tool Mechanics',                  '1h 10m', '#7f8c84', 5),
  ('shadow', 'Prep, Safety & Shadowing',        '16 hrs/wk', '#2f7d62', 6)
on conflict (id) do nothing;

insert into public.course_modules (course_id, sort, title) values
  ('skin', 1, 'Skin anatomy & coat types'),
  ('skin', 2, 'Spotting hot spots & parasites'),
  ('skin', 3, 'Matting: causes and safe removal'),
  ('skin', 4, 'When to refer to a vet'),
  ('bath', 1, 'Water temperature & pre-rinse'),
  ('bath', 2, 'Shampoo selection by coat'),
  ('bath', 3, 'High-velocity drying safely'),
  ('feline', 1, 'Reading feline body language'),
  ('feline', 2, 'Safe handling & towel wraps'),
  ('feline', 3, 'Nail trims'),
  ('feline', 4, 'Lion cuts & sanitary trims'),
  ('feline', 5, 'Low-stress cat bathing'),
  ('comms', 1, 'Doorstep check-in script'),
  ('comms', 2, 'Talking about matting & shave-downs'),
  ('tools', 1, 'Clipper blades & guard combs'),
  ('tools', 2, 'Scissors, shears & thinners'),
  ('tools', 3, 'Reading the grooming manual'),
  ('tools', 4, 'Tool mechanics quiz'),
  ('shadow', 1, 'Shadowing your mentor groomer'),
  ('shadow', 2, 'Nail grinding'),
  ('shadow', 3, 'Sanitary trim'),
  ('shadow', 4, 'Bath & blowout')
on conflict (course_id, sort) do nothing;

-- Sample clients and pets (fictional; 555 phone numbers)
do $$
declare
  rec record;
  cid uuid;
begin
  if exists (select 1 from public.clients where notes = 'sample') then
    return;
  end if;
  for rec in select * from (values
    ('The Whitfields',  '(251) 555-0142', 'Spring Hill',     30.6935, -88.1310, 'Luna',    'Dog', 'Golden Retriever',    2022, 68, 'Heavy double coat',   6, 'Loves the dryer on low. Check ears.',              '{}'::text[],                  '#d9a35b'),
    ('Dana R.',         '(251) 555-0187', 'Midtown',         30.6873, -88.1105, 'Mochi',   'Dog', 'Poodle',              2023, 22, 'Curly, kept short',   5, 'Sensitive skin — hypoallergenic shampoo only.',    '{Regular,"Sensitive skin"}', '#c9a27e'),
    ('M. Alvarez',      '(251) 555-0119', 'Oakleigh',        30.6810, -88.0935, 'Harper',  'Cat', 'Domestic Shorthair',  2019, 11, 'Short',               8, 'Nail trim only. Use towel wrap.',                  '{}',                          '#8a8f99'),
    ('Chris & Pat L.',  '(251) 555-0163', 'Leinkauf',        30.6845, -88.0705, 'Ranger',  'Dog', 'Australian Shepherd', 2021, 52, 'Heavy double coat',   6, 'De-shed treatment add-on every visit.',            '{}',                          '#5b6a7d'),
    ('Gloria T.',       '(251) 555-0131', 'De Tonti Square', 30.6912, -88.0478, 'Bella',   'Dog', 'Shih Tzu',            2017, 14, 'Long, prone to mats', 5, 'Senior — short table sessions, breaks as needed.', '{Senior}',                    '#c7a98f'),
    ('The Nguyens',     '(251) 555-0175', 'Spring Hill',     30.6950, -88.1250, 'Biscuit', 'Dog', 'Goldendoodle',        2024, 48, 'Fleece, mats easily', 5, 'Teddy bear cut, 1/2" body.',                       '{}',                          '#d8b48a'),
    ('R. Daniels',      '(251) 555-0108', 'Midtown',         30.6860, -88.1050, 'Pepper',  'Dog', 'Miniature Schnauzer', 2020, 17, 'Wiry',                6, 'Classic schnauzer pattern.',                       '{}',                          '#7d7f80')
  ) as t(owner, phone, area, lat, lng, pet, species, breed, born, lbs, coat, cadence, notes, tags, color)
  loop
    insert into public.clients (name, phone, area, lat, lng, notes)
    values (rec.owner, rec.phone, rec.area, rec.lat, rec.lng, 'sample') returning id into cid;
    insert into public.pets (client_id, name, species, breed, birth_year, weight_lbs, coat, cadence_weeks, notes, tags, color)
    values (cid, rec.pet, rec.species, rec.breed, rec.born, rec.lbs, rec.coat, rec.cadence, rec.notes, rec.tags, rec.color);
  end loop;

  -- 8 weeks of completed grooms (growing from ~16 to ~44 a week) for the Business charts
  insert into public.appointments (pet_id, van_id, starts_at, service, price, duration_min, status)
  select p.id, 'van-1',
         (((now() at time zone 'America/Chicago')::date - (w * 7 + (n % 5))) + time '08:00' + make_interval(mins => (n % 6) * 90)) at time zone 'America/Chicago',
         case when p.species = 'Cat' then 'Nail Trim' else 'Bath + Full Groom' end,
         case when p.species = 'Cat' then 35 when p.weight_lbs > 40 then 95 else 75 end,
         60, 'Done'
  from generate_series(1, 8) w
  cross join lateral generate_series(1, 44 - w * 3 - (w % 2)) n
  cross join lateral (select * from public.pets where name in ('Luna','Mochi','Harper','Ranger','Bella','Biscuit','Pepper')
                      order by name offset (n % 7) limit 1) p;
end $$;

-- Today's route for Van 1 (skips if Van 1 already has stops today)
insert into public.appointments (pet_id, van_id, starts_at, service, price, duration_min, drive_min)
select p.id, 'van-1', ((now() at time zone 'America/Chicago')::date + t.at) at time zone 'America/Chicago', t.service, t.price, t.mins, t.drive
from (values
  ('Luna',   time '08:00', 'Bath + Full Groom',    95,  90, 12),
  ('Mochi',  time '09:30', 'Bath + Trim',          80,  75,  8),
  ('Harper', time '11:00', 'Nail Trim',            35,  20, 12),
  ('Ranger', time '13:00', 'Full Groom + De-shed', 105, 105, 10),
  ('Bella',  time '15:00', 'Bath + Tidy',          70,  60,  9)
) as t(pet, at, service, price, mins, drive)
join public.pets p on p.name = t.pet
join public.clients c on c.id = p.client_id and c.notes = 'sample'
where not exists (
  select 1 from public.appointments a
  where a.van_id = 'van-1' and a.drive_min is not null
    and (a.starts_at at time zone 'America/Chicago')::date = (now() at time zone 'America/Chicago')::date
);

-- ---------------------------------------------------------------------
-- Online booking defaults (safe to re-run; edit prices in Table Editor →
-- services, and hours in the app under Business → Availability)
-- Prices are PLACEHOLDERS based on the Strategic Master Plan tiers.
-- ---------------------------------------------------------------------
insert into public.services (id, name, description, species, min_weight, max_weight, duration_min, price, is_addon, sort) values
  ('dog-small',  'Full groom · small dog',   'Bath, blow-dry, haircut, nails, ears and sanitary trim. Up to 20 lb.',            'Dog', 0,   20,  75, 70,  false, 10),
  ('dog-medium', 'Full groom · medium dog',  'Bath, blow-dry, haircut, nails, ears and sanitary trim. 21–50 lb.',               'Dog', 21,  50,  90, 90,  false, 20),
  ('dog-large',  'Full groom · large dog',   'Bath, blow-dry, haircut, nails, ears and sanitary trim. 51–80 lb.',               'Dog', 51,  80, 105, 110, false, 30),
  ('dog-xl',     'Full groom · XL or doodle','For 80 lb+ dogs, doodles and heavy coats that need extra time.',                  'Dog', 81, 300, 120, 140, false, 40),
  ('bath-small', 'Bath & tidy · up to 40 lb','Bath, blow-dry, brush-out, nails, ears and a face/feet/sanitary tidy. No haircut.', 'Dog', 0,   40,  50, 55,  false, 50),
  ('bath-large', 'Bath & tidy · 41 lb+',     'Bath, blow-dry, brush-out, nails, ears and a face/feet/sanitary tidy. No haircut.', 'Dog', 41, 300,  65, 70,  false, 60),
  ('cat-groom',  'Cat groom',                'Gentle bath, dry, brush-out, nails and sanitary trim.',                           'Cat', 0,  100,  75, 95,  false, 70),
  ('nails',      'Nail trim & file',         'Quick nail trim and smoothing, dogs or cats.',                                    'Any', 0,  300,  15, 25,  false, 80),
  ('addon-deshed',  'De-shedding treatment', 'Loosens and removes undercoat. Great for double coats.', 'Any', null, null, 15, 15, true, 110),
  ('addon-demat',   'Dematting',             'Extra time for tangles and mats.',                       'Any', null, null, 20, 20, true, 120),
  ('addon-teeth',   'Teeth brushing',        'Enzymatic toothpaste and fresh breath.',                 'Any', null, null,  5, 10, true, 130),
  ('addon-facial',  'Blueberry facial',      'Brightening face wash.',                                 'Dog', null, null,  5,  8, true, 140),
  ('addon-pawbalm', 'Paw balm',              'Soothes and protects paw pads.',                         'Any', null, null,  5,  8, true, 150)
on conflict (id) do nothing;

-- Van 1 works Monday–Friday, 8:00 AM – 5:00 PM (change in the app)
insert into public.van_hours (van_id, weekday, start_time, end_time)
select 'van-1', d, time '08:00', time '17:00' from generate_series(1, 5) d
on conflict (van_id, weekday) do nothing;
