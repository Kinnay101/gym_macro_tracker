-- Gym Macro Tracker: "Lebenszeichen" für Supabase
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken. Kann mehrmals ausgeführt werden.
--
-- Supabase pausiert Gratis-Projekte nach etwa einer Woche ohne Aktivität. Ein GitHub-Workflow
-- (.github/workflows/keepalive.yml) ruft darum zweimal pro Woche diese Funktion auf.
-- Sie liest und schreibt keine Daten, gibt nur "true" zurück – darum darf sie auch ohne Anmeldung aufgerufen werden.

create or replace function public.ping() returns boolean
language sql stable set search_path = '' as $$
  select true;
$$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
