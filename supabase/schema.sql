-- =====================================================================
-- Aardvark Pet Grooming Systems — database schema for Supabase (Postgres)
-- Run once in Supabase → SQL Editor. Safe to re-run: it drops nothing,
-- and every object uses "if not exists" / "or replace" where Postgres allows.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.vans (
  id          text primary key,                 -- e.g. 'van-1'
  name        text not null,                    -- 'Van 1'
  zone        text,                             -- 'Midtown Mobile'
  depot_lat   double precision,
  depot_lng   double precision,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- One row per person who can sign in to the app. Created automatically
-- when you add a user in Supabase → Authentication (see trigger below).
-- New rows start INACTIVE: an owner must set active = true before that
-- person can see any client data (so a stray sign-up can't get in).
create table if not exists public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'groomer' check (role in ('owner', 'groomer', 'student')),
  van_id      text references public.vans(id) on delete set null,
  active      boolean not null default false,
  email       text,
  created_at  timestamptz not null default now()
);
alter table public.staff add column if not exists active boolean not null default false;
alter table public.staff add column if not exists email text;

create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                    -- household / owner name
  phone       text,
  email       text,
  area        text,                             -- neighborhood, used for zone-day routing
  address     text,
  lat         double precision,
  lng         double precision,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.pets (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  name           text not null,
  species        text not null default 'Dog' check (species in ('Dog', 'Cat', 'Other')),
  breed          text,
  birth_year     int check (birth_year between 1990 and 2100),
  weight_lbs     numeric(5,1),
  coat           text,
  cadence_weeks  int not null default 6 check (cadence_weeks between 1 and 26),
  notes          text,
  tags           text[] not null default '{}',
  color          text,                          -- avatar color, e.g. '#d9a35b'
  created_at     timestamptz not null default now()
);
create index if not exists pets_client_idx on public.pets(client_id);
-- Optional rabies certificate (file lives in the private 'pet-docs' storage bucket)
alter table public.pets add column if not exists rabies_cert_path   text;
alter table public.pets add column if not exists rabies_expires     date;
alter table public.pets add column if not exists rabies_uploaded_at timestamptz;

create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  pet_id             uuid not null references public.pets(id) on delete cascade,
  van_id             text references public.vans(id) on delete set null,
  starts_at          timestamptz not null,
  service            text not null,
  price              numeric(8,2) not null default 0 check (price >= 0),
  duration_min       int not null default 60 check (duration_min > 0),
  drive_min          int,
  lat                double precision,          -- stop location (defaults to the client's)
  lng                double precision,
  status             text not null default 'Confirmed'
                     check (status in ('Confirmed', 'On the way', 'In progress', 'Done', 'Cancelled')),
  status_changed_at  timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists appointments_van_time_idx on public.appointments(van_id, starts_at);
create index if not exists appointments_pet_idx on public.appointments(pet_id, starts_at);

create table if not exists public.courses (
  id              text primary key,             -- e.g. 'skin'
  title           text not null,
  duration_label  text,                         -- '1h 20m'
  color           text,
  sort            int not null default 0
);

create table if not exists public.course_modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   text not null references public.courses(id) on delete cascade,
  sort        int not null default 0,
  title       text not null,
  video_url   text,
  unique (course_id, sort)
);

create table if not exists public.module_progress (
  staff_id    uuid not null default auth.uid() references public.staff(id) on delete cascade,
  module_id   uuid not null references public.course_modules(id) on delete cascade,
  done        boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (staff_id, module_id)
);

-- Public website waitlist (Phase 0: 150+ households with ZIP, breed, coat, weight)
create table if not exists public.waitlist (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  name              text not null check (char_length(name) between 1 and 120),
  zip               text not null check (zip ~ '^[0-9]{5}$'),
  contact           text not null check (char_length(contact) between 3 and 200),
  breed             text check (char_length(breed) <= 100),
  weight            text check (char_length(weight) <= 20),
  coat              text check (char_length(coat) <= 50),
  groomer_interest  boolean not null default false,
  source            text check (char_length(source) <= 100)
);

-- ---------- Views (run with the caller's permissions) -----------------

-- Each pet with its owner and last completed groom
-- (dropped and re-created so new pet columns can be added safely)
drop view if exists public.pet_overview;
create view public.pet_overview with (security_invoker = true) as
select p.*,
       c.name  as owner_name,
       c.phone as owner_phone,
       c.area  as owner_area,
       (select max(a.starts_at) from public.appointments a
         where a.pet_id = p.id and a.status = 'Done')                       as last_groom_at,
       (select min(a.starts_at) from public.appointments a
         where a.pet_id = p.id and a.status not in ('Done', 'Cancelled')
           and a.starts_at > now())                                         as next_appointment_at
from public.pets p
join public.clients c on c.id = p.client_id;

-- Completed grooms and revenue per week (Monday-start), for the Business tab
create or replace view public.weekly_stats with (security_invoker = true) as
select date_trunc('week', starts_at at time zone 'America/Chicago')::date as week_start,
       van_id,
       count(*)::int        as grooms,
       sum(price)::numeric  as revenue
from public.appointments
where status = 'Done'
group by 1, 2;

-- ---------- Helper functions -------------------------------------------

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and active);
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = auth.uid() and active and role = 'owner');
$$;

-- New sign-in users get an inactive 'groomer' staff row. Activate them (and make
-- yourself owner) with the SQL in SETUP.md, or in Table Editor → staff.
-- Who is signing up? Customers (account_type = 'customer', from the booking app)
-- get a client record — linked to any earlier guest bookings with the same email.
-- Everyone else (staff sign-up form, or users added in the Supabase dashboard)
-- gets an INACTIVE staff record that an owner approves on the Team screen.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nm text := coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1));
  cid uuid;
begin
  if meta->>'account_type' = 'customer' then
    select id into cid from public.clients
     where user_id is null and email is not null and lower(email) = lower(new.email)
     order by created_at desc limit 1;
    if cid is not null then
      update public.clients set user_id = new.id where id = cid;
    else
      insert into public.clients (user_id, name, email, phone)
      values (new.id, nm, new.email, nullif(trim(meta->>'phone'), ''));
    end if;
  else
    insert into public.staff (id, full_name, email)
    values (new.id, nm, new.email)
    on conflict (id) do update set email = excluded.email;
  end if;
  return new;
end $$;

-- Fill in emails for accounts created before the email column existed
update public.staff s set email = u.email
from auth.users u where u.id = s.id and s.email is distinct from u.email;

-- Never allow the last active owner to be removed, demoted or switched off
create or replace function public.staff_keep_an_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and old.active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active)
     and not exists (select 1 from public.staff where role = 'owner' and active and id <> old.id) then
    raise exception 'Aardvark needs at least one active owner. Make someone else an owner first.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists staff_keep_an_owner on public.staff;
create trigger staff_keep_an_owner before update or delete on public.staff
  for each row execute function public.staff_keep_an_owner();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stamp status changes, default stop location, and auto-rebook on completion
create or replace function public.appointments_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.lat is null or new.lng is null) then
    select c.lat, c.lng into new.lat, new.lng
    from public.pets p join public.clients c on c.id = p.client_id where p.id = new.pet_id;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists appointments_before_write on public.appointments;
create trigger appointments_before_write before insert or update on public.appointments
  for each row execute function public.appointments_before_write();

-- When a groom is marked Done, book the next one on the pet's cadence
-- (same weekday and time) unless a future appointment already exists.
create or replace function public.auto_rebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  weeks int;
begin
  if new.status = 'Done' and old.status is distinct from 'Done' then
    select cadence_weeks into weeks from public.pets where id = new.pet_id;
    if not exists (select 1 from public.appointments
                   where pet_id = new.pet_id and starts_at > now()
                     and status not in ('Done', 'Cancelled')) then
      insert into public.appointments (pet_id, van_id, starts_at, service, price, duration_min, lat, lng)
      values (new.pet_id, new.van_id, new.starts_at + make_interval(weeks => coalesce(weeks, 6)),
              replace(new.service, ' (free loyalty groom)', ''), new.price + coalesce(new.loyalty_discount, 0),
              new.duration_min, new.lat, new.lng);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointments_auto_rebook on public.appointments;
create trigger appointments_auto_rebook after update of status on public.appointments
  for each row execute function public.auto_rebook();

-- ---------- Row Level Security ----------------------------------------
-- Rule of thumb: signed-in staff can see and work the schedule; only owners
-- can delete or change setup data; the public can only add themselves to
-- the waitlist (and can't read it back).

alter table public.vans            enable row level security;
alter table public.staff           enable row level security;
alter table public.clients         enable row level security;
alter table public.pets            enable row level security;
alter table public.appointments    enable row level security;
alter table public.courses         enable row level security;
alter table public.course_modules  enable row level security;
alter table public.module_progress enable row level security;
alter table public.waitlist        enable row level security;

-- Table access ("grants"). New Supabase projects don't expose tables to the
-- app automatically, so each one is listed here. Grants decide WHICH tables a
-- role can reach; the RLS policies below decide WHICH ROWS. Re-run this file
-- after adding a table, and add the table here.
grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from anon;
grant insert on public.waitlist to anon;

grant select, insert, update, delete on
  public.vans, public.staff, public.clients, public.pets, public.appointments,
  public.courses, public.course_modules, public.module_progress
  to authenticated;
grant select, insert, delete on public.waitlist to authenticated;
grant select on public.pet_overview, public.weekly_stats to authenticated;

grant all on all tables in schema public to service_role;  -- dashboard / admin scripts

grant execute on function public.is_staff(), public.is_owner() to anon, authenticated, service_role;

do $$
declare t text;
begin
  -- Staff read; owners full control
  foreach t in array array['vans', 'courses', 'course_modules'] loop
    execute format('drop policy if exists "%1$s staff read" on public.%1$I', t);
    execute format('create policy "%1$s staff read" on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('drop policy if exists "%1$s owner write" on public.%1$I', t);
    execute format('create policy "%1$s owner write" on public.%1$I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;

  -- Staff read/add/edit; owners delete
  foreach t in array array['clients', 'pets', 'appointments'] loop
    execute format('drop policy if exists "%1$s staff read" on public.%1$I', t);
    execute format('create policy "%1$s staff read" on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('drop policy if exists "%1$s staff insert" on public.%1$I', t);
    execute format('create policy "%1$s staff insert" on public.%1$I for insert to authenticated with check (public.is_staff())', t);
    execute format('drop policy if exists "%1$s staff update" on public.%1$I', t);
    execute format('create policy "%1$s staff update" on public.%1$I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('drop policy if exists "%1$s owner delete" on public.%1$I', t);
    execute format('create policy "%1$s owner delete" on public.%1$I for delete to authenticated using (public.is_owner())', t);
  end loop;
end $$;

drop policy if exists "read own staff row" on public.staff;
create policy "read own staff row" on public.staff for select to authenticated using (id = auth.uid());
drop policy if exists "staff read team" on public.staff;
create policy "staff read team" on public.staff for select to authenticated using (public.is_staff());
drop policy if exists "owner manages team" on public.staff;
create policy "owner manages team" on public.staff for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "own progress" on public.module_progress;
create policy "own progress" on public.module_progress for all to authenticated
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

drop policy if exists "anyone can join waitlist" on public.waitlist;
create policy "anyone can join waitlist" on public.waitlist for insert to anon, authenticated with check (true);
drop policy if exists "owner reads waitlist" on public.waitlist;
create policy "owner reads waitlist" on public.waitlist for select to authenticated using (public.is_owner());
drop policy if exists "owner deletes waitlist" on public.waitlist;
create policy "owner deletes waitlist" on public.waitlist for delete to authenticated using (public.is_owner());

-- =====================================================================
-- ONLINE BOOKING
-- Customers book from the public app. Every time offered is checked against
-- the van's working hours, time off, the day's other stops, and the drive
-- time between GPS coordinates, so the groomer can actually make every stop.
-- =====================================================================

-- ---------- Settings (one row) — owners edit these in the app ----------
create table if not exists public.booking_settings (
  id                    int primary key default 1 check (id = 1),
  timezone              text    not null default 'America/Chicago',
  slot_step_min         int     not null default 30  check (slot_step_min between 5 and 120),
  buffer_min            int     not null default 10  check (buffer_min between 0 and 60),   -- park, set up, pack up between stops
  avg_speed_mph         numeric not null default 28  check (avg_speed_mph between 5 and 70), -- typical city driving speed
  road_factor           numeric not null default 1.35 check (road_factor between 1 and 3),  -- roads aren't straight: GPS distance × this
  service_radius_miles  numeric not null default 25  check (service_radius_miles > 0),
  lead_time_hours       int     not null default 18  check (lead_time_hours >= 0),
  booking_window_days   int     not null default 21  check (booking_window_days between 1 and 90),
  max_stops_per_day     int     not null default 6   check (max_stops_per_day between 1 and 20),
  trip_fee              numeric(8,2) not null default 10 check (trip_fee >= 0),
  extra_pet_discount    numeric(8,2) not null default 5  check (extra_pet_discount >= 0),
  min_cancel_hours      int     not null default 24  check (min_cancel_hours >= 0)
);
insert into public.booking_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Service menu ----------
create table if not exists public.services (
  id           text primary key,
  name         text not null,
  description  text,
  species      text not null default 'Dog' check (species in ('Dog', 'Cat', 'Any')),
  min_weight   numeric,                 -- lbs; helps suggest the right size tier
  max_weight   numeric,
  duration_min int  not null check (duration_min between 5 and 480),
  price        numeric(8,2) not null check (price >= 0),
  is_addon     boolean not null default false,
  active       boolean not null default true,
  sort         int not null default 0
);

-- ---------- Groomer / van schedules ----------
create table if not exists public.van_hours (
  van_id      text not null references public.vans(id) on delete cascade,
  weekday     int  not null check (weekday between 0 and 6),   -- 0 = Sunday … 6 = Saturday
  start_time  time not null,
  end_time    time not null,
  primary key (van_id, weekday),
  check (end_time > start_time)
);

create table if not exists public.time_off (
  id         uuid primary key default gen_random_uuid(),
  van_id     text not null references public.vans(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists time_off_van_idx on public.time_off(van_id, starts_at);

-- ---------- Columns for customer accounts and online bookings ----------
alter table public.clients add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.clients add column if not exists street text;
alter table public.clients add column if not exists city   text;
alter table public.clients add column if not exists state  text;
alter table public.clients add column if not exists zip    text;
alter table public.appointments add column if not exists booking_id     uuid;
alter table public.appointments add column if not exists source         text not null default 'staff';
alter table public.appointments add column if not exists customer_notes text;
alter table public.appointments add column if not exists address        text;
create index if not exists appointments_booking_idx on public.appointments(booking_id);

-- ---------- Distance + drive time from GPS coordinates ----------
create or replace function public.gps_miles(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 3958.8 * 2 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

-- Estimated driving minutes between two stops (0 = same address).
-- Unknown locations are treated as 20 minutes away, to stay on the safe side.
create or replace function public.travel_minutes(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns int language sql stable set search_path = public as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then 20
    when public.gps_miles(lat1, lng1, lat2, lng2) < 0.05 then 0
    else ceil(public.gps_miles(lat1, lng1, lat2, lng2) * s.road_factor / s.avg_speed_mph * 60)::int
  end
  from public.booking_settings s where s.id = 1;
$$;

-- Can van v take a job of dur minutes at time t, at this location?
-- p_exclude: a booking (or appointment) to ignore, used when rescheduling it.
-- p_ignore_lead: staff may book inside the usual advance-notice window.
create or replace function public.slot_is_free_ex(v text, t timestamptz, dur int, p_lat float8, p_lng float8,
                                                  p_exclude uuid default null, p_ignore_lead boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  st public.booking_settings;
  local_day date;
  h public.van_hours;
  win_start timestamptz; win_end timestamptz;
  e timestamptz := t + make_interval(mins => dur);
  prev record; nxt record;
  gap int;
begin
  select * into st from public.booking_settings where id = 1;
  if t < now() then return false; end if;
  if not p_ignore_lead and t < now() + make_interval(hours => st.lead_time_hours) then return false; end if;
  local_day := (t at time zone st.timezone)::date;
  select * into h from public.van_hours where van_id = v and weekday = extract(dow from local_day)::int;
  if not found then return false; end if;
  win_start := (local_day + h.start_time) at time zone st.timezone;
  win_end   := (local_day + h.end_time)   at time zone st.timezone;
  if t < win_start or e > win_end then return false; end if;

  if exists (select 1 from public.time_off o where o.van_id = v and o.starts_at < e and o.ends_at > t) then
    return false;
  end if;

  -- Daily stop limit (several pets at one address count as one stop)
  if (select count(distinct (round(a.lat::numeric, 4), round(a.lng::numeric, 4)))
        from public.appointments a
       where a.van_id = v and a.status <> 'Cancelled'
         and (p_exclude is null or (a.id <> p_exclude and a.booking_id is distinct from p_exclude))
         and a.starts_at >= win_start and a.starts_at < win_end)
     >= st.max_stops_per_day
     and not exists (select 1 from public.appointments a
                      where a.van_id = v and a.status <> 'Cancelled'
         and (p_exclude is null or (a.id <> p_exclude and a.booking_id is distinct from p_exclude))
                        and a.starts_at >= win_start and a.starts_at < win_end
                        and public.travel_minutes(a.lat, a.lng, p_lat, p_lng) = 0) then
    return false;
  end if;

  -- No overlap with another job
  if exists (select 1 from public.appointments a
              where a.van_id = v and a.status <> 'Cancelled'
         and (p_exclude is null or (a.id <> p_exclude and a.booking_id is distinct from p_exclude))
                and a.starts_at < e and a.starts_at + make_interval(mins => a.duration_min) > t) then
    return false;
  end if;

  -- Enough time to drive here from the previous stop…
  select a.lat, a.lng, a.starts_at + make_interval(mins => a.duration_min) as ends_at into prev
    from public.appointments a
   where a.van_id = v and a.status <> 'Cancelled'
         and (p_exclude is null or (a.id <> p_exclude and a.booking_id is distinct from p_exclude))
     and a.starts_at >= win_start and a.starts_at + make_interval(mins => a.duration_min) <= t
   order by a.starts_at + make_interval(mins => a.duration_min) desc limit 1;
  if found then
    gap := public.travel_minutes(prev.lat, prev.lng, p_lat, p_lng);
    if gap > 0 then gap := gap + st.buffer_min; end if;
    if prev.ends_at + make_interval(mins => gap) > t then return false; end if;
  end if;

  -- …and from here to the next stop
  select a.lat, a.lng, a.starts_at into nxt
    from public.appointments a
   where a.van_id = v and a.status <> 'Cancelled'
         and (p_exclude is null or (a.id <> p_exclude and a.booking_id is distinct from p_exclude))
     and a.starts_at >= e and a.starts_at < win_end
   order by a.starts_at asc limit 1;
  if found then
    gap := public.travel_minutes(p_lat, p_lng, nxt.lat, nxt.lng);
    if gap > 0 then gap := gap + st.buffer_min; end if;
    if e + make_interval(mins => gap) > nxt.starts_at then return false; end if;
  end if;

  return true;
end $$;

create or replace function public.slot_is_free(v text, t timestamptz, dur int, p_lat float8, p_lng float8)
returns boolean language sql stable security definer set search_path = public as $$
  select public.slot_is_free_ex(v, t, dur, p_lat, p_lng, null, false);
$$;

-- Is this location inside the service area? Returns distance to the nearest van base.
create or replace function public.check_service_area(p_lat float8, p_lng float8)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'miles', round(min(public.gps_miles(v.depot_lat, v.depot_lng, p_lat, p_lng))::numeric, 1),
    'ok',    coalesce(min(public.gps_miles(v.depot_lat, v.depot_lng, p_lat, p_lng)) <= max(s.service_radius_miles), false),
    'radius', max(s.service_radius_miles))
  from public.vans v cross join public.booking_settings s
  where v.active and v.depot_lat is not null and s.id = 1;
$$;

-- Bookable start times for a job of dur minutes at a location (any van).
-- Only times are returned — never other customers' details.
drop function if exists public.get_available_slots(float8, float8, int, date, int);
create or replace function public.get_available_slots(p_lat float8, p_lng float8, p_dur int, p_from date default null,
                                                      p_days int default null, p_exclude uuid default null)
returns table (slot timestamptz) language plpgsql stable security definer set search_path = public as $$
declare
  st public.booking_settings;
  d date; v record; h public.van_hours; t timestamptz; win_end timestamptz;
  from_d date; n_days int;
  staff boolean := public.is_staff();
begin
  select * into st from public.booking_settings where id = 1;
  if p_dur is null or p_dur < 5 or p_dur > 480 then raise exception 'Invalid duration'; end if;
  if p_lat is null or p_lng is null then raise exception 'Location required'; end if;
  if not coalesce((public.check_service_area(p_lat, p_lng)->>'ok')::boolean, false) then return; end if;
  from_d := greatest(coalesce(p_from, (now() at time zone st.timezone)::date), (now() at time zone st.timezone)::date);
  n_days := least(coalesce(p_days, st.booking_window_days), st.booking_window_days);
  for d in select generate_series(from_d, from_d + n_days - 1, interval '1 day')::date loop
    if d > (now() at time zone st.timezone)::date + st.booking_window_days then exit; end if;
    for v in select id from public.vans where active order by id loop
      select * into h from public.van_hours where van_id = v.id and weekday = extract(dow from d)::int;
      continue when not found;
      t := (d + h.start_time) at time zone st.timezone;
      win_end := (d + h.end_time) at time zone st.timezone;
      while t + make_interval(mins => p_dur) <= win_end loop
        if public.slot_is_free_ex(v.id, t, p_dur, p_lat, p_lng, case when staff then p_exclude end, staff) then
          slot := t; return next;
        end if;
        t := t + make_interval(mins => st.slot_step_min);
      end loop;
    end loop;
  end loop;
end $$;

-- Book it. Re-checks the slot inside a lock so two people can't take the same time.
-- p = { starts_at, contact:{name,email,phone}, address:{street,city,state,zip,lat,lng,label},
--       pets:[{pet_id? | name,species,breed,weight,coat}, service_id, addon_ids[]], notes, save_details }
create or replace function public.book_appointment(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  st public.booking_settings;
  uid uuid := auth.uid();
  staff boolean := public.is_staff();   -- staff booking on a customer's behalf (phone bookings)
  t timestamptz := (p->>'starts_at')::timestamptz;
  v_lat float8 := (p->'address'->>'lat')::float8;
  v_lng float8 := (p->'address'->>'lng')::float8;
  cname text := left(trim(p->'contact'->>'name'), 120);
  cemail text := lower(left(trim(p->'contact'->>'email'), 200));
  cphone text := left(trim(p->'contact'->>'phone'), 40);
  addr text := left(trim(coalesce(p->'address'->>'label', '')), 300);
  pet jsonb; svc public.services; addon public.services;
  cid uuid; pid uuid; vid text; bid uuid := gen_random_uuid();
  total_dur int := 0; total_price numeric := 0; n int := 0;
  plan jsonb := '[]'::jsonb; item jsonb;
  cursor_t timestamptz; price numeric; dur int; label text;
  ids uuid[] := '{}'; new_id uuid;
  want_free boolean := coalesce((p->>'use_free_groom')::boolean, false);
  free_idx int := -1; k int := 0; free_amt numeric := 0; disc numeric;
begin
  select * into st from public.booking_settings where id = 1;
  if t is null or v_lat is null or v_lng is null then raise exception 'Please choose a time and confirm your address.'; end if;
  if coalesce(cname, '') = '' then raise exception 'Please enter your name.'; end if;
  if coalesce(cphone, '') = '' or length(regexp_replace(cphone, '\D', '', 'g')) < 10 then raise exception 'Please enter a phone number we can text on the day.'; end if;
  if staff and coalesce(cemail, '') = '' then cemail := null;
  elsif coalesce(cemail, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email.'; end if;
  if jsonb_typeof(p->'pets') <> 'array' or jsonb_array_length(p->'pets') not between 1 and 4 then
    raise exception 'Choose between 1 and 4 pets.';
  end if;
  if not coalesce((public.check_service_area(v_lat, v_lng)->>'ok')::boolean, false) then
    raise exception 'Sorry — that address is outside our service area. Join the waitlist and we''ll let you know when we expand.';
  end if;

  -- Work out each pet's service, time and price
  for pet in select * from jsonb_array_elements(p->'pets') loop
    select * into svc from public.services where id = pet->>'service_id' and active and not is_addon;
    if not found then raise exception 'Please choose a service for each pet.'; end if;
    dur := svc.duration_min; price := svc.price; label := svc.name;
    for addon in select * from public.services
                where active and is_addon and id in (select jsonb_array_elements_text(coalesce(pet->'addon_ids', '[]'::jsonb))) loop
      dur := dur + addon.duration_min; price := price + addon.price; label := label || ' + ' || addon.name;
    end loop;
    if n = 0 then price := price + st.trip_fee; else price := greatest(price - st.extra_pet_discount, 0); end if;
    plan := plan || jsonb_build_object('pet', pet, 'dur', dur, 'price', price, 'label', label, 'base', svc.price);
    total_dur := total_dur + dur; total_price := total_price + price; n := n + 1;
  end loop;

  -- One booking at a time, so the availability check below can't race
  perform pg_advisory_xact_lock(hashtext('aardvark-booking'));
  select id into vid from public.vans
   where active and public.slot_is_free_ex(id, t, total_dur, v_lat, v_lng, null, staff) order by id limit 1;
  if vid is null then raise exception 'Sorry, that time was just taken. Please pick another time.'; end if;

  -- Find or create the client
  if staff then
    -- Staff: use the chosen client, or match an existing client by phone (and email when given)
    uid := null;
    if p ? 'client_id' then
      select id into cid from public.clients where id = (p->>'client_id')::uuid;
    end if;
    if cid is null then
      select id into cid from public.clients
       where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(cphone, '\D', '', 'g')
         and (cemail is null or email is null or lower(email) = cemail)
       order by created_at desc limit 1;
    end if;
  elsif uid is not null then
    select id into cid from public.clients where user_id = uid;
  end if;
  if cid is null and uid is null and not staff then
    -- Guests: reuse a guest record only when both email and phone match; never edit it
    select id into cid from public.clients
     where user_id is null and lower(email) = cemail
       and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(cphone, '\D', '', 'g')
     order by created_at desc limit 1;
    if (select count(*) from public.appointments a join public.pets pp on pp.id = a.pet_id
          join public.clients c on c.id = pp.client_id
         where lower(c.email) = cemail and c.user_id is null and a.source = 'online'
           and a.status <> 'Cancelled' and a.starts_at > now()) >= 6 then
      raise exception 'You already have several upcoming bookings. Please create an account or call us to book more.';
    end if;
  end if;
  if cid is null then
    insert into public.clients (user_id, name, email, phone, street, city, state, zip, address, lat, lng, area)
    values (uid, cname, cemail, cphone, p->'address'->>'street', p->'address'->>'city', p->'address'->>'state',
            p->'address'->>'zip', addr, v_lat, v_lng, p->'address'->>'city')
    returning id into cid;
  elsif uid is not null and coalesce((p->>'save_details')::boolean, true) then
    update public.clients set name = cname, phone = cphone, address = addr, lat = v_lat, lng = v_lng,
           street = p->'address'->>'street', city = p->'address'->>'city', state = p->'address'->>'state',
           zip = p->'address'->>'zip', area = coalesce(p->'address'->>'city', area)
     where id = cid;
  end if;

  -- Loyalty card: one free groom (the pet's main service) when the card is full
  if want_free and (uid is not null or staff) then
    if coalesce((public.loyalty_for_client(cid)->>'available')::int, 0) < 1 then
      raise exception 'There''s no free groom on this loyalty card yet.';
    end if;
    select coalesce(min(i - 1), 0) into free_idx
      from jsonb_array_elements(plan) with ordinality as x(e, i)
     where coalesce((e->'pet'->>'free')::boolean, false);
  end if;

  -- Pets + appointments, back to back at the same address
  cursor_t := t;
  for item in select * from jsonb_array_elements(plan) loop
    pet := item->'pet'; pid := null; disc := null;
    if k = free_idx then
      disc := least((item->>'base')::numeric, (item->>'price')::numeric);
      item := jsonb_set(item, '{price}', to_jsonb((item->>'price')::numeric - disc));
      free_amt := disc; total_price := total_price - disc;
    end if;
    k := k + 1;
    if pet ? 'pet_id' and (uid is not null or staff) then
      select pp.id into pid from public.pets pp where pp.id = (pet->>'pet_id')::uuid and pp.client_id = cid;
    end if;
    if pid is null then
      if coalesce(trim(pet->>'name'), '') = '' then raise exception 'Please give each pet a name.'; end if;
      insert into public.pets (client_id, name, species, breed, weight_lbs, coat)
      values (cid, left(trim(pet->>'name'), 60),
              case when pet->>'species' in ('Dog', 'Cat') then pet->>'species' else 'Dog' end,
              left(pet->>'breed', 80), nullif(pet->>'weight', '')::numeric, left(pet->>'coat', 60))
      returning id into pid;
    end if;
    insert into public.appointments (pet_id, van_id, starts_at, service, price, duration_min, lat, lng,
                                     status, booking_id, source, customer_notes, address, loyalty_discount)
    values (pid, vid, cursor_t, item->>'label' || case when disc is not null then ' (free loyalty groom)' else '' end,
            (item->>'price')::numeric, (item->>'dur')::int, v_lat, v_lng,
            'Confirmed', bid, 'online', left(p->>'notes', 500), addr, disc)
    returning id into new_id;
    ids := ids || new_id;
    cursor_t := cursor_t + make_interval(mins => (item->>'dur')::int);
  end loop;

  if coalesce((p->>'sms_opt_in')::boolean, false) then
    update public.clients set sms_opt_in = true where id = cid;
  end if;
  perform public.queue_notification('booking_confirmed', bid,
    jsonb_build_object('by', case when staff then 'staff' else 'customer' end,
                       'notify_customer', coalesce((p->>'notify_customer')::boolean, true)));

  return jsonb_build_object('booking_id', bid, 'starts_at', t, 'ends_at', cursor_t,
                            'total', total_price, 'duration_min', total_dur, 'appointments', to_jsonb(ids),
                            'free_groom', free_amt > 0, 'free_amount', free_amt);
end $$;

-- Customers cancel their own booking (up to min_cancel_hours before)
create or replace function public.cancel_my_booking(b uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare st public.booking_settings; first_start timestamptz;
begin
  select * into st from public.booking_settings where id = 1;
  select min(a.starts_at) into first_start
    from public.appointments a join public.pets p on p.id = a.pet_id join public.clients c on c.id = p.client_id
   where a.booking_id = b and c.user_id = auth.uid() and a.status <> 'Cancelled';
  if first_start is null then raise exception 'Booking not found.'; end if;
  if first_start < now() + make_interval(hours => st.min_cancel_hours) then
    raise exception 'Bookings can be cancelled online up to % hours ahead. Please call or text us.', st.min_cancel_hours;
  end if;
  update public.appointments a set status = 'Cancelled'
    from public.pets p, public.clients c
   where a.booking_id = b and p.id = a.pet_id and c.id = p.client_id and c.user_id = auth.uid();
  perform public.queue_notification('booking_cancelled', b, jsonb_build_object('by', 'customer', 'notify_customer', true));
end $$;

-- ---------- Access for booking ----------
alter table public.booking_settings enable row level security;
alter table public.services         enable row level security;
alter table public.van_hours        enable row level security;
alter table public.time_off         enable row level security;

grant select on public.services, public.booking_settings to anon;
grant select, insert, update, delete on public.services, public.booking_settings, public.van_hours, public.time_off to authenticated;
grant all on public.services, public.booking_settings, public.van_hours, public.time_off to service_role;
grant execute on function public.gps_miles(float8, float8, float8, float8),
                          public.travel_minutes(float8, float8, float8, float8),
                          public.check_service_area(float8, float8),
                          public.get_available_slots(float8, float8, int, date, int, uuid),
                          public.book_appointment(jsonb)
  to anon, authenticated, service_role;
grant execute on function public.cancel_my_booking(uuid) to authenticated, service_role;
revoke execute on function public.slot_is_free(text, timestamptz, int, float8, float8) from public, anon;
grant execute on function public.slot_is_free(text, timestamptz, int, float8, float8) to authenticated, service_role;
revoke execute on function public.slot_is_free_ex(text, timestamptz, int, float8, float8, uuid, boolean) from public, anon;
grant execute on function public.slot_is_free_ex(text, timestamptz, int, float8, float8, uuid, boolean) to authenticated, service_role;

drop policy if exists "public reads services" on public.services;
create policy "public reads services" on public.services for select to anon, authenticated using (active or public.is_staff());
drop policy if exists "owner manages services" on public.services;
create policy "owner manages services" on public.services for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "public reads booking settings" on public.booking_settings;
create policy "public reads booking settings" on public.booking_settings for select to anon, authenticated using (true);
drop policy if exists "owner edits booking settings" on public.booking_settings;
create policy "owner edits booking settings" on public.booking_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

do $$
declare t text;
begin
  foreach t in array array['van_hours', 'time_off'] loop
    execute format('drop policy if exists "%1$s staff read" on public.%1$I', t);
    execute format('create policy "%1$s staff read" on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('drop policy if exists "%1$s owner write" on public.%1$I', t);
    execute format('create policy "%1$s owner write" on public.%1$I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
  -- Groomers can block their own time too (e.g. "block this afternoon")
  drop policy if exists "time_off staff write" on public.time_off;
  create policy "time_off staff write" on public.time_off for all to authenticated using (public.is_staff()) with check (public.is_staff());
end $$;

-- Customers see (and edit) only their own records
drop policy if exists "customer reads own client" on public.clients;
create policy "customer reads own client" on public.clients for select to authenticated using (user_id = auth.uid());
drop policy if exists "customer updates own client" on public.clients;
create policy "customer updates own client" on public.clients for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "customer reads own pets" on public.pets;
create policy "customer reads own pets" on public.pets for select to authenticated
  using (exists (select 1 from public.clients c where c.id = pets.client_id and c.user_id = auth.uid()));
drop policy if exists "customer updates own pets" on public.pets;
create policy "customer updates own pets" on public.pets for update to authenticated
  using (exists (select 1 from public.clients c where c.id = pets.client_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.clients c where c.id = pets.client_id and c.user_id = auth.uid()));

drop policy if exists "customer reads own appointments" on public.appointments;
create policy "customer reads own appointments" on public.appointments for select to authenticated
  using (exists (select 1 from public.pets p join public.clients c on c.id = p.client_id
                  where p.id = appointments.pet_id and c.user_id = auth.uid()));


-- =====================================================================
-- NOTIFICATIONS + STAFF BOOKING TOOLS
-- Every booking change adds one row to `notifications`. If the sender is
-- connected (see SETUP.md: Edge Function + two Vault secrets), a trigger
-- calls it straight away; otherwise rows simply wait, and nothing breaks.
-- =====================================================================

alter table public.clients add column if not exists sms_opt_in boolean not null default false;
alter table public.staff   add column if not exists alerts boolean not null default true;   -- email me new bookings / cancellations

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('booking_confirmed', 'booking_cancelled', 'booking_rescheduled', 'reminder')),
  booking_ref uuid not null,               -- booking_id, or the appointment id for single staff-made appointments
  meta        jsonb not null default '{}'::jsonb,
  status      text not null default 'queued' check (status in ('queued', 'sent', 'partial', 'skipped', 'error')),
  attempts    int not null default 0,
  last_error  text,
  sent_at     timestamptz
);
create index if not exists notifications_ref_idx on public.notifications(booking_ref, kind);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
drop policy if exists "owner reads notifications" on public.notifications;
create policy "owner reads notifications" on public.notifications for select to authenticated using (public.is_owner());

create or replace function public.queue_notification(p_kind text, p_ref uuid, p_meta jsonb default '{}'::jsonb)
returns uuid language sql volatile security definer set search_path = public as $$
  insert into public.notifications (kind, booking_ref, meta) values (p_kind, p_ref, coalesce(p_meta, '{}'::jsonb)) returning id;
$$;

-- Call the Edge Function when a notification is queued (only if it's been connected)
create or replace function public.notifications_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  begin
    select decrypted_secret into url    from vault.decrypted_secrets where name = 'aardvark_notify_url'    limit 1;
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'aardvark_notify_secret' limit 1;
  exception when others then
    return new;     -- Vault not available: leave it queued
  end;
  if url is null or secret is null then return new; end if;
  begin
    perform net.http_post(url := url,
                          headers := jsonb_build_object('Content-Type', 'application/json', 'x-aardvark-secret', secret),
                          body := jsonb_build_object('id', new.id));
  exception when others then
    null;           -- pg_net not enabled: leave it queued; a booking must never fail because of email
  end;
  return new;
end $$;

drop trigger if exists notifications_dispatch on public.notifications;
create trigger notifications_dispatch after insert on public.notifications
  for each row execute function public.notifications_dispatch();

-- Everything the sender needs for one notification (service role only)
create or replace function public.get_notification(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n public.notifications; out jsonb;
begin
  select * into n from public.notifications where id = p_id;
  if not found then return null; end if;
  select jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'status', n.status, 'meta', n.meta, 'booking_ref', n.booking_ref,
    'timezone', (select timezone from public.booking_settings where id = 1),
    'starts_at', min(a.starts_at),
    'ends_at', max(a.starts_at + make_interval(mins => a.duration_min)),
    'address', min(a.address),
    'notes', min(a.customer_notes),
    'total', sum(a.price),
    'status_now', min(a.status),
    'source', min(a.source),
    'customer', (select jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'sms_opt_in', c.sms_opt_in)
                   from public.clients c where c.id = min(p.client_id::text)::uuid),
    'items', jsonb_agg(jsonb_build_object('pet', p.name, 'service', a.service, 'price', a.price,
                                          'starts_at', a.starts_at) order by a.starts_at),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', st.full_name, 'email', st.email)), '[]'::jsonb)
                from public.staff st where st.active and st.alerts and st.role in ('owner', 'groomer') and st.email is not null)
  ) into out
  from public.appointments a join public.pets p on p.id = a.pet_id
  where a.booking_id = n.booking_ref or a.id = n.booking_ref;
  return out;
end $$;

create or replace function public.mark_notification(p_id uuid, p_status text, p_error text default null)
returns void language sql volatile security definer set search_path = public as $$
  update public.notifications
     set status = p_status, last_error = p_error, attempts = attempts + 1,
         sent_at = case when p_status in ('sent', 'partial') then now() else sent_at end
   where id = p_id;
$$;

-- Queue tomorrow's reminders (run daily by pg_cron; safe to run more than once)
create or replace function public.queue_reminders()
returns int language plpgsql volatile security definer set search_path = public as $$
declare st public.booking_settings; tomorrow date; r record; n int := 0;
begin
  select * into st from public.booking_settings where id = 1;
  tomorrow := (now() at time zone st.timezone)::date + 1;
  for r in
    select coalesce(a.booking_id, a.id) as ref
      from public.appointments a
     where a.status = 'Confirmed' and (a.starts_at at time zone st.timezone)::date = tomorrow
     group by coalesce(a.booking_id, a.id)
  loop
    if not exists (select 1 from public.notifications where booking_ref = r.ref and kind = 'reminder') then
      perform public.queue_notification('reminder', r.ref, '{"notify_customer": true}'::jsonb);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Staff: cancel a whole booking (or a single staff-made appointment)
create or replace function public.staff_cancel_booking(p_ref uuid, p_notify boolean default true)
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Only Aardvark staff can do that.'; end if;
  update public.appointments set status = 'Cancelled'
   where (booking_id = p_ref or id = p_ref) and status <> 'Cancelled' and status <> 'Done';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing to cancel: the visit is already done or cancelled.'; end if;
  perform public.queue_notification('booking_cancelled', p_ref,
    jsonb_build_object('by', 'staff', 'notify_customer', coalesce(p_notify, true)));
  return n;
end $$;

-- Staff: move a booking to a new start time (checked against drive times, ignoring itself)
create or replace function public.staff_reschedule(p_ref uuid, p_start timestamptz, p_notify boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  total_dur int; v_lat float8; v_lng float8; cur_van text; vid text; old_start timestamptz;
  a record; cursor_t timestamptz := p_start;
begin
  if not public.is_staff() then raise exception 'Only Aardvark staff can do that.'; end if;
  select sum(duration_min), min(starts_at), (array_agg(lat order by starts_at))[1], (array_agg(lng order by starts_at))[1],
         (array_agg(van_id order by starts_at))[1]
    into total_dur, old_start, v_lat, v_lng, cur_van
    from public.appointments where (booking_id = p_ref or id = p_ref) and status not in ('Cancelled', 'Done');
  if total_dur is null then raise exception 'Nothing to reschedule.'; end if;
  perform pg_advisory_xact_lock(hashtext('aardvark-booking'));
  select id into vid from public.vans
   where active and public.slot_is_free_ex(id, p_start, total_dur, v_lat, v_lng, p_ref, true)
   order by (id = cur_van) desc, id limit 1;
  if vid is null then raise exception 'That time doesn''t fit: it clashes with another stop or the drive time, or it''s outside working hours.'; end if;
  for a in select id, duration_min from public.appointments
            where (booking_id = p_ref or id = p_ref) and status not in ('Cancelled', 'Done') order by starts_at loop
    update public.appointments set starts_at = cursor_t, van_id = vid where id = a.id;
    cursor_t := cursor_t + make_interval(mins => a.duration_min);
  end loop;
  perform public.queue_notification('booking_rescheduled', p_ref,
    jsonb_build_object('by', 'staff', 'notify_customer', coalesce(p_notify, true), 'old_start', old_start));
  return jsonb_build_object('starts_at', p_start, 'van', vid);
end $$;

-- Owner: remove the sample clients, pets and appointments loaded by seed.sql
create or replace function public.owner_remove_sample_data()
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.is_owner() then raise exception 'Only owners can do that.'; end if;
  delete from public.clients where notes = 'sample';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.staff_cancel_booking(uuid, boolean), public.staff_reschedule(uuid, timestamptz, boolean),
                          public.owner_remove_sample_data() to authenticated, service_role;
revoke execute on function public.queue_notification(text, uuid, jsonb), public.get_notification(uuid),
                           public.mark_notification(uuid, text, text), public.queue_reminders() from public, anon, authenticated;
grant execute on function public.queue_notification(text, uuid, jsonb), public.get_notification(uuid),
                          public.mark_notification(uuid, text, text), public.queue_reminders() to service_role;

-- =====================================================================
-- LOYALTY CARD + PET DOCUMENTS + MORE ACADEMY COURSES
-- Loyalty: every completed, paid groom adds a stamp. A full card (10 stamps by
-- default) earns one free groom — the pet's main service. Free grooms don't
-- earn stamps. Cancelling a free groom gives it back automatically.
-- Rabies certificates: optional photo/PDF per pet in a private storage bucket.
-- =====================================================================
alter table public.booking_settings add column if not exists loyalty_enabled boolean not null default true;
alter table public.booking_settings add column if not exists loyalty_goal int not null default 10;
do $$ begin
  alter table public.booking_settings add constraint booking_settings_loyalty_goal_chk check (loyalty_goal between 3 and 30);
exception when duplicate_object then null; end $$;

alter table public.appointments add column if not exists loyalty_discount numeric(8,2);  -- set when this was a free groom

-- (pet rabies certificate columns are added near the top, next to the pets table)

-- Card status for one client (internal; the app calls loyalty_status)
create or replace function public.loyalty_for_client(p_client uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with st as (select loyalty_enabled as enabled, loyalty_goal as goal from public.booking_settings where id = 1),
  c as (
    select count(*) filter (where a.status = 'Done' and a.loyalty_discount is null and a.price > 0) as stamps,
           count(*) filter (where a.loyalty_discount is not null and a.status <> 'Cancelled')     as used,
           count(*) filter (where a.loyalty_discount is not null and a.status = 'Done')           as redeemed
      from public.appointments a join public.pets p on p.id = a.pet_id
     where p.client_id = p_client
  )
  select jsonb_build_object(
    'enabled', st.enabled, 'goal', st.goal, 'stamps', c.stamps,
    'progress', c.stamps % st.goal, 'earned', c.stamps / st.goal, 'used', c.used, 'redeemed', c.redeemed,
    'available', case when st.enabled then greatest(c.stamps / st.goal - c.used, 0) else 0 end)
  from st, c
$$;
revoke execute on function public.loyalty_for_client(uuid) from public, anon, authenticated;
grant execute on function public.loyalty_for_client(uuid) to service_role;

-- Customers get their own card; staff can look up any client's card
create or replace function public.loyalty_status(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid;
begin
  if p_client is null then
    select id into cid from public.clients where user_id = auth.uid();
  elsif public.is_staff() or exists (select 1 from public.clients where id = p_client and user_id = auth.uid()) then
    cid := p_client;
  end if;
  if cid is null then
    return (select jsonb_build_object('enabled', loyalty_enabled, 'goal', loyalty_goal, 'stamps', 0, 'progress', 0,
                                      'earned', 0, 'used', 0, 'redeemed', 0, 'available', 0)
              from public.booking_settings where id = 1);
  end if;
  return public.loyalty_for_client(cid);
end $$;
revoke execute on function public.loyalty_status(uuid) from public, anon;
grant execute on function public.loyalty_status(uuid) to authenticated, service_role;

-- ---------- Pet documents (private storage bucket) ----------
-- Files live at  pet-docs/<client id>/<pet id>/<file>.  Customers can only
-- reach their own pets' folders; staff can see every file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-docs', 'pet-docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.owns_pet_folder(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pets p join public.clients c on c.id = p.client_id
     where c.user_id = auth.uid()
       and c.id::text = split_part(p_name, '/', 1)
       and p.id::text = split_part(p_name, '/', 2))
$$;
grant execute on function public.owns_pet_folder(text) to authenticated, service_role;

drop policy if exists "pet docs: customers read own" on storage.objects;
create policy "pet docs: customers read own" on storage.objects for select to authenticated
  using (bucket_id = 'pet-docs' and (public.is_staff() or public.owns_pet_folder(name)));
drop policy if exists "pet docs: customers upload own" on storage.objects;
create policy "pet docs: customers upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-docs' and (public.is_staff() or public.owns_pet_folder(name)));
drop policy if exists "pet docs: customers replace own" on storage.objects;
create policy "pet docs: customers replace own" on storage.objects for update to authenticated
  using (bucket_id = 'pet-docs' and (public.is_staff() or public.owns_pet_folder(name)))
  with check (bucket_id = 'pet-docs' and (public.is_staff() or public.owns_pet_folder(name)));
drop policy if exists "pet docs: customers delete own" on storage.objects;
create policy "pet docs: customers delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-docs' and (public.is_staff() or public.owns_pet_folder(name)));

-- Keep the stored path pointing at the pet's own folder
create or replace function public.pets_check_doc_path() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.rabies_cert_path is not null
     and new.rabies_cert_path not like new.client_id::text || '/' || new.id::text || '/%' then
    raise exception 'Certificate file must be stored in this pet''s folder.';
  end if;
  if new.rabies_cert_path is distinct from old.rabies_cert_path then
    new.rabies_uploaded_at := case when new.rabies_cert_path is null then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists pets_check_doc_path on public.pets;
create trigger pets_check_doc_path before update of rabies_cert_path on public.pets
  for each row execute function public.pets_check_doc_path();

-- ---------- More Academy courses (curriculum outline — safe to keep) ----------
insert into public.courses (id, title, duration_label, color, sort) values
  ('tools',  'Tool Mechanics',           '1h 10m',    '#7f8c84', 5),
  ('shadow', 'Prep, Safety & Shadowing', '16 hrs/wk', '#2f7d62', 6)
on conflict (id) do nothing;
insert into public.course_modules (course_id, sort, title) values
  ('tools', 1, 'Clipper blades & guard combs'),
  ('tools', 2, 'Scissors, shears & thinners'),
  ('tools', 3, 'Reading the grooming manual'),
  ('tools', 4, 'Tool mechanics quiz'),
  ('shadow', 1, 'Shadowing your mentor groomer'),
  ('shadow', 2, 'Nail grinding'),
  ('shadow', 3, 'Sanitary trim'),
  ('shadow', 4, 'Bath & blowout')
on conflict (course_id, sort) do nothing;
