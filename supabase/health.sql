-- Gym Macro Tracker: Apple Health über einen iPhone-Kurzbefehl
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken. Kann mehrmals ausgeführt werden.
--
-- Ablauf:
--  * In der App erstellst du einen persönlichen Schlüssel (create_health_token). Gespeichert wird nur sein
--    Fingerabdruck (sha256) – den Schlüssel selbst sieht nur dein Kurzbefehl.
--  * Der Kurzbefehl ruft health_sync(token, payload, export_date) auf:
--      - Daten (Text aus Apple Health) landen als Dokument "hinbox:…" in deinem Konto; die App verarbeitet sie beim Sync.
--      - Zurück kommen die Summen (kcal, Makros) des angegebenen Tages, damit der Kurzbefehl sie in Health einträgt.
--        Jeder Tag wird nur einmal zurückgegeben (sonst stünde er doppelt in Health).
--  * Ohne gültigen Schlüssel passiert nichts.

create table if not exists public.health_tokens (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  last_used   timestamptz,
  last_export date
);

revoke all on public.health_tokens from anon;
revoke all on public.health_tokens from authenticated;
grant select, delete on public.health_tokens to authenticated;  -- nur Status sehen und Verbindung trennen
alter table public.health_tokens enable row level security;

drop policy if exists "eigene Health-Verbindung" on public.health_tokens;
create policy "eigene Health-Verbindung" on public.health_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Neuen Schlüssel erzeugen (ersetzt einen alten). Wird nur dieses eine Mal im Klartext zurückgegeben.
create or replace function public.create_health_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.health_tokens (user_id, token_hash) values (uid, encode(sha256(convert_to(tok, 'UTF8')), 'hex'))
    on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used = null, last_export = null;
  return tok;
end $$;

-- Wird vom Kurzbefehl aufgerufen (ohne Anmeldung, nur mit Schlüssel)
create or replace function public.health_sync(token text, payload text default '', export_date text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.health_tokens;
  lines int := 0;
  d date;
  tot jsonb := null;
begin
  if token is null or char_length(token) <> 64 then raise exception 'invalid token'; end if;
  select * into t from public.health_tokens where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
  if t.user_id is null then raise exception 'invalid token'; end if;
  if t.last_used is not null and t.last_used > now() - interval '15 seconds' then raise exception 'too fast'; end if;
  if char_length(coalesce(payload, '')) > 400000 then raise exception 'too much data'; end if;

  update public.health_tokens set last_used = now() where user_id = t.user_id;

  -- Rohdaten ablegen; die App verarbeitet und löscht sie beim nächsten Sync
  if coalesce(trim(payload), '') <> '' then
    lines := array_length(regexp_split_to_array(trim(payload), E'\n'), 1);
    insert into public.docs (user_id, key, data, deleted, client_ts)
    values (t.user_id, 'hinbox:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
            jsonb_build_object('text', payload, 'received', now()), false, now());
  end if;

  -- Summen eines Tages für Apple Health (jeden Tag nur einmal)
  if export_date ~ '^\d{4}-\d{2}-\d{2}$' then
    d := export_date::date;
    if t.last_export is null or d > t.last_export then
      select jsonb_build_object(
          'date', export_date,
          'kcal', round(coalesce(sum((x.data->'n'->>'kcal')::numeric), 0), 0),
          'protein', round(coalesce(sum((x.data->'n'->>'p')::numeric), 0), 1),
          'carbs', round(coalesce(sum((x.data->'n'->>'c')::numeric), 0), 1),
          'fat', round(coalesce(sum((x.data->'n'->>'f')::numeric), 0), 1),
          'fiber', round(coalesce(sum((x.data->'n'->>'fiber')::numeric), 0), 1),
          'sugar', round(coalesce(sum((x.data->'n'->>'sugar')::numeric), 0), 1),
          'salt', round(coalesce(sum((x.data->'n'->>'salt')::numeric), 0), 2),
          'entries', count(*))
        into tot
        from public.docs x
        where x.user_id = t.user_id and not x.deleted and x.key like 'entry:' || export_date || ':%';
      if (tot->>'entries')::int > 0 then
        update public.health_tokens set last_export = d where user_id = t.user_id;
      else
        tot := null; -- nichts gegessen eingetragen → nichts nach Health schreiben
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'lines', lines, 'export', tot, 'has_export', tot is not null);
end $$;

revoke execute on function public.create_health_token() from public, anon;
grant execute on function public.create_health_token() to authenticated;
revoke execute on function public.health_sync(text, text, text) from public;
grant execute on function public.health_sync(text, text, text) to anon, authenticated;
