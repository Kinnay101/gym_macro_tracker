-- Gym Macro Tracker: Datenbank-Setup für Supabase
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken.
-- Kann gefahrlos mehrmals ausgeführt werden.
--
-- Aufbau: Alle Daten eines Kontos liegen als kleine "Dokumente" in einer Tabelle:
--   key  = was es ist, z. B. 'profile', 'workout:<id>', 'entry:2026-11-22:<id>', 'weight:2026-11-22'
--   data = der Inhalt als JSON
-- So kann jedes Gerät genau die geänderten Teile hoch- und herunterladen.
-- Row Level Security sorgt dafür, dass jedes Konto nur seine eigenen Zeilen sieht.
-- (Für Freunde/Rangliste kommt später eine eigene Tabelle mit nur den geteilten Werten dazu.)

create table if not exists public.docs (
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key       text        not null check (char_length(key) <= 200),
  data      jsonb,                               -- null, wenn gelöscht
  deleted   boolean     not null default false,
  client_ts timestamptz not null,                -- wann das Gerät es geändert hat
  server_ts timestamptz not null default clock_timestamp(), -- wann es beim Server ankam (für "was ist neu?")
  primary key (user_id, key)
);
create index if not exists docs_user_server_ts on public.docs (user_id, server_ts);

-- server_ts setzt immer der Server (Geräte-Uhren können falsch gehen)
create or replace function public.docs_set_server_ts() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists docs_server_ts on public.docs;
create trigger docs_server_ts before insert or update on public.docs
  for each row execute function public.docs_set_server_ts();

-- Zugriff über die Data API: nur angemeldete Nutzer, keine Anonymen
revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

-- Row Level Security: nur eigene Zeilen
alter table public.docs enable row level security;

drop policy if exists "eigene Dokumente" on public.docs;
create policy "eigene Dokumente" on public.docs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
