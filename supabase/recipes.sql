-- Gym Macro Tracker: öffentliche Rezepte ("Entdecken")
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken. Kann mehrmals ausgeführt werden.
--
-- Private Rezepte bleiben in der Tabelle docs (nur für dich). Schaltest du ein Rezept auf "Öffentlich",
-- legt die App hier eine Kopie ab (Name, Zutaten, Nährwerte, Zubereitung, dein Anzeigename).
-- Lesen dürfen alle angemeldeten Nutzer der App, ändern/löschen nur du deine eigenen.

create table if not exists public.public_recipes (
  id          text primary key check (char_length(id) between 1 and 40),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text check (char_length(author_name) <= 30),
  name        text not null check (char_length(name) between 1 and 60),
  data        jsonb not null check (pg_column_size(data) < 60000),
  updated_at  timestamptz not null default now()
);
create index if not exists public_recipes_updated on public.public_recipes (updated_at desc);
create index if not exists public_recipes_user on public.public_recipes (user_id);

revoke all on public.public_recipes from anon;
revoke all on public.public_recipes from authenticated;
grant select, insert, update, delete on public.public_recipes to authenticated;

alter table public.public_recipes enable row level security;

drop policy if exists "öffentliche Rezepte lesen" on public.public_recipes;
create policy "öffentliche Rezepte lesen" on public.public_recipes
  for select to authenticated using (true);

drop policy if exists "eigene öffentliche Rezepte anlegen" on public.public_recipes;
create policy "eigene öffentliche Rezepte anlegen" on public.public_recipes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "eigene öffentliche Rezepte ändern" on public.public_recipes;
create policy "eigene öffentliche Rezepte ändern" on public.public_recipes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "eigene öffentliche Rezepte löschen" on public.public_recipes;
create policy "eigene öffentliche Rezepte löschen" on public.public_recipes
  for delete to authenticated using (user_id = (select auth.uid()));
