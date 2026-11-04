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
create or replace view public.pet_overview with (security_invoker = true) as
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
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff (id, full_name, email)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)), new.email)
  on conflict (id) do update set email = excluded.email;
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
              new.service, new.price, new.duration_min, new.lat, new.lng);
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
