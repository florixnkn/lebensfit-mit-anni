-- ============================================================
-- Lebensfit mit Anni – Supabase Setup
-- Im Supabase SQL Editor ausführen (einmalig).
-- Sicherheitsmodell:
--   * Öffentlich: nur Lesen (Kurse, Studios, veröffentlichte Bewertungen)
--   * Schreiben: ausschließlich über SECURITY-DEFINER-Funktionen,
--     die das Admin-Passwort serverseitig (bcrypt) prüfen
--   * Passwort-Hash liegt in admin_settings (für Clients unsichtbar)
--   * Brute-Force-Schutz: Sperre nach 5 Fehlversuchen für 15 Minuten
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tabellen ----------

create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Indoor Cycling',
  weekday smallint not null check (weekday between 1 and 7), -- 1 = Montag
  start_time time not null,
  duration_minutes int not null default 60 check (duration_minutes between 10 and 240),
  studio_id uuid references public.studios(id) on delete set null,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  rating smallint not null check (rating between 1 and 5),
  text text not null,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_settings (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_login_attempts (
  id bigserial primary key,
  attempted_at timestamptz not null default now(),
  success boolean not null
);

-- ---------- Row Level Security ----------

alter table public.studios enable row level security;
alter table public.courses enable row level security;
alter table public.reviews enable row level security;
alter table public.admin_settings enable row level security;
alter table public.admin_login_attempts enable row level security;

-- Öffentliches Lesen
drop policy if exists "public read studios" on public.studios;
create policy "public read studios" on public.studios for select using (true);

drop policy if exists "public read courses" on public.courses;
create policy "public read courses" on public.courses for select using (true);

drop policy if exists "public read published reviews" on public.reviews;
create policy "public read published reviews" on public.reviews for select using (published = true);

-- admin_settings / login_attempts: KEINE Policies => kein Zugriff über die API
revoke all on public.admin_settings from anon, authenticated;
revoke all on public.admin_login_attempts from anon, authenticated;

-- Direkte Schreibrechte entziehen (Schreiben nur via Funktionen)
revoke insert, update, delete on public.studios from anon, authenticated;
revoke insert, update, delete on public.courses from anon, authenticated;
revoke insert, update, delete on public.reviews from anon, authenticated;

-- ---------- Admin-Funktionen ----------

-- Interne Passwortprüfung mit Brute-Force-Sperre
create or replace function public._check_admin(p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_failed int;
begin
  select count(*) into v_failed
  from public.admin_login_attempts
  where success = false and attempted_at > now() - interval '15 minutes';

  if v_failed >= 5 then
    raise exception 'Zu viele Fehlversuche. Bitte 15 Minuten warten.';
  end if;

  select password_hash into v_hash from public.admin_settings where id = 1;

  if v_hash is null or crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into public.admin_login_attempts (success) values (false);
    raise exception 'Falsches Passwort.';
  end if;

  insert into public.admin_login_attempts (success) values (true);
  delete from public.admin_login_attempts where attempted_at < now() - interval '1 day';
end;
$$;

-- Login-Check für die Admin-Oberfläche
create or replace function public.admin_verify(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public._check_admin(p_password);
  return true;
end;
$$;

create or replace function public.admin_change_password(p_old text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public._check_admin(p_old);
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'Neues Passwort muss mindestens 8 Zeichen haben.';
  end if;
  update public.admin_settings
     set password_hash = crypt(p_new, gen_salt('bf')), updated_at = now()
   where id = 1;
  return true;
end;
$$;

-- Kurse
create or replace function public.admin_save_course(
  p_password text, p_id uuid, p_title text, p_weekday smallint,
  p_start_time time, p_duration int, p_studio_id uuid, p_note text, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  perform public._check_admin(p_password);
  if p_id is null then
    insert into public.courses (title, weekday, start_time, duration_minutes, studio_id, note, active)
    values (p_title, p_weekday, p_start_time, p_duration, p_studio_id, p_note, p_active)
    returning id into v_id;
  else
    update public.courses
       set title = p_title, weekday = p_weekday, start_time = p_start_time,
           duration_minutes = p_duration, studio_id = p_studio_id, note = p_note, active = p_active
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_course(p_password text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public._check_admin(p_password);
  delete from public.courses where id = p_id;
  return true;
end;
$$;

-- Bewertungen
create or replace function public.admin_save_review(
  p_password text, p_id uuid, p_author text, p_rating smallint, p_text text, p_published boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  perform public._check_admin(p_password);
  if p_id is null then
    insert into public.reviews (author, rating, text, published)
    values (p_author, p_rating, p_text, p_published)
    returning id into v_id;
  else
    update public.reviews
       set author = p_author, rating = p_rating, text = p_text, published = p_published
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Alle Bewertungen (auch versteckte) – nur mit Passwort
create or replace function public.admin_list_reviews(p_password text)
returns setof public.reviews
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public._check_admin(p_password);
  return query select * from public.reviews order by created_at desc;
end;
$$;

create or replace function public.admin_delete_review(p_password text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public._check_admin(p_password);
  delete from public.reviews where id = p_id;
  return true;
end;
$$;

-- Studios
create or replace function public.admin_save_studio(
  p_password text, p_id uuid, p_name text, p_address text, p_website text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  perform public._check_admin(p_password);
  if p_id is null then
    insert into public.studios (name, address, website)
    values (p_name, p_address, p_website)
    returning id into v_id;
  else
    update public.studios set name = p_name, address = p_address, website = p_website
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_studio(p_password text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform public._check_admin(p_password);
  delete from public.studios where id = p_id;
  return true;
end;
$$;

-- Nur die Admin-Funktionen für die API freigeben
revoke execute on function public._check_admin(text) from anon, authenticated, public;
grant execute on function public.admin_verify(text) to anon;
grant execute on function public.admin_change_password(text, text) to anon;
grant execute on function public.admin_save_course(text, uuid, text, smallint, time, int, uuid, text, boolean) to anon;
grant execute on function public.admin_delete_course(text, uuid) to anon;
grant execute on function public.admin_save_review(text, uuid, text, smallint, text, boolean) to anon;
grant execute on function public.admin_list_reviews(text) to anon;
grant execute on function public.admin_delete_review(text, uuid) to anon;
grant execute on function public.admin_save_studio(text, uuid, text, text, text) to anon;
grant execute on function public.admin_delete_studio(text, uuid) to anon;

-- ---------- Startdaten ----------

-- Startpasswort: "lebensfit-start" => nach dem ersten Login SOFORT ändern!
insert into public.admin_settings (id, password_hash)
values (1, crypt('lebensfit-start', gen_salt('bf')))
on conflict (id) do nothing;

insert into public.studios (name, address, website)
select 'AlphaClub Neufahrn', 'Auweg 100, 85375 Neufahrn b. Freising', 'https://alphaclub-nf.de'
where not exists (select 1 from public.studios where name = 'AlphaClub Neufahrn');

-- Kurszeiten AlphaClub (über /admin anpassbar)
insert into public.courses (title, weekday, start_time, duration_minutes, studio_id)
select v.title, v.weekday, v.start_time::time, 60, s.id
from (values
  ('Indoor Cycling', 3::smallint, '18:00'),
  ('Indoor Cycling', 4::smallint, '19:45'),
  ('Indoor Cycling', 7::smallint, '16:00')
) as v(title, weekday, start_time)
cross join (select id from public.studios where name = 'AlphaClub Neufahrn' limit 1) s
where not exists (select 1 from public.courses);
