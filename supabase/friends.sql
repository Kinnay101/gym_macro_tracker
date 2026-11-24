-- Gym Macro Tracker: Freunde & Rangliste
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken (nach setup.sql).
-- Kann gefahrlos mehrmals ausgeführt werden.
--
-- Grundsatz: Freunde sehen NIE die eigentlichen Daten (Tabelle docs bleibt privat).
-- Jedes Konto veröffentlicht nur eine kleine Zusammenfassung (shared_stats) – und nur die Bereiche,
-- die es freigibt. Lesen darf diese Zusammenfassung nur, wer mit dir in einer Gruppe ist.
-- Gruppen anlegen, beitreten und verlassen geht nur über die Funktionen unten (nicht direkt).

-- ---------- Tabellen ----------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members (user_id);

-- Zusammenfassung pro Konto: z. B. {"strength": {"Deadlift": 1.85}, "consistency": {...}, "volume": {...}, "prs": {...}}
-- Nicht geteilte Bereiche fehlen einfach. Kein Körpergewicht, keine absoluten Kilos bei Kraft.
create table if not exists public.shared_stats (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  stats        jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 20000),
  updated_at   timestamptz not null default now()
);

-- ---------- Hilfsfunktionen für die Regeln ----------
-- (security definer, damit die Regeln sich nicht gegenseitig im Kreis prüfen)
create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = (select auth.uid()));
$$;

create or replace function public.shares_group_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

-- ---------- Gruppen anlegen / beitreten / verlassen ----------
create or replace function public.create_group(group_name text, member_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne 0/O, 1/I
  g public.groups;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.groups where created_by = uid) >= 10 then raise exception 'too many groups'; end if;
  loop
    code := 'GYM-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  insert into public.groups (name, invite_code, created_by) values (trim(group_name), code, uid) returning * into g;
  insert into public.group_members (group_id, user_id, display_name) values (g.id, uid, trim(member_name));
  return g;
end $$;

create or replace function public.join_group(code text, member_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into g from public.groups where invite_code = upper(trim(code));
  if g.id is null then raise exception 'invalid code'; end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 50 then raise exception 'group full'; end if;
  insert into public.group_members (group_id, user_id, display_name) values (g.id, uid, trim(member_name))
    on conflict (group_id, user_id) do update set display_name = excluded.display_name;
  return g;
end $$;

-- Verlassen; ist danach niemand mehr drin, wird die Gruppe gelöscht
create or replace function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.group_members where group_id = gid and user_id = auth.uid();
  delete from public.groups g where g.id = gid and not exists (select 1 from public.group_members m where m.group_id = gid);
end $$;

-- Gruppe umbenennen (jedes Mitglied der Gruppe darf das)
create or replace function public.rename_group(gid uuid, group_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_group_member(gid) then raise exception 'not a member'; end if;
  if char_length(trim(coalesce(group_name, ''))) not between 1 and 40 then raise exception 'invalid name'; end if;
  update public.groups set name = trim(group_name) where id = gid returning * into g;
  return g;
end $$;

-- Anzeigename in allen eigenen Gruppen ändern
create or replace function public.set_display_name(member_name text) returns void
language sql security definer set search_path = '' as $$
  update public.group_members set display_name = trim(member_name) where user_id = auth.uid();
$$;

-- ---------- Zugriff ----------
revoke all on public.groups, public.group_members, public.shared_stats from anon;
revoke all on public.groups, public.group_members, public.shared_stats from authenticated;
grant select on public.groups, public.group_members to authenticated;
grant select, insert, update, delete on public.shared_stats to authenticated;

revoke execute on function public.is_group_member(uuid), public.shares_group_with(uuid),
  public.create_group(text, text), public.join_group(text, text), public.leave_group(uuid), public.set_display_name(text),
  public.rename_group(uuid, text)
  from public, anon;
grant execute on function public.is_group_member(uuid), public.shares_group_with(uuid),
  public.create_group(text, text), public.join_group(text, text), public.leave_group(uuid), public.set_display_name(text),
  public.rename_group(uuid, text)
  to authenticated;

-- ---------- Row Level Security ----------
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.shared_stats  enable row level security;

drop policy if exists "eigene Gruppen sehen" on public.groups;
create policy "eigene Gruppen sehen" on public.groups
  for select to authenticated using (public.is_group_member(id));

drop policy if exists "Mitglieder der eigenen Gruppen sehen" on public.group_members;
create policy "Mitglieder der eigenen Gruppen sehen" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "eigene Zusammenfassung schreiben" on public.shared_stats;
create policy "eigene Zusammenfassung schreiben" on public.shared_stats
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Zusammenfassung von Gruppenmitgliedern lesen" on public.shared_stats;
create policy "Zusammenfassung von Gruppenmitgliedern lesen" on public.shared_stats
  for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_group_with(user_id));
