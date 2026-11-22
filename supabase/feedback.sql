-- Gym Macro Tracker: Feedback (Bugs & Ideen)
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und "Run" klicken. Kann mehrmals ausgeführt werden.
--
-- Angemeldete Nutzer schreiben Bugs oder Ideen. Jeder sieht nur seine eigenen Einträge (inkl. Status und Antwort).
-- Admins (Tabelle app_admins) sehen alle Einträge und setzen Status und Antwort.
--
-- Dich selbst als Admin eintragen (einmal, E-Mail anpassen – NICHT ins Repo schreiben):
--   insert into public.app_admins (user_id) select id from auth.users where email = 'DEINE@EMAIL' on conflict do nothing;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
revoke all on public.app_admins from anon;
revoke all on public.app_admins from authenticated;
alter table public.app_admins enable row level security;  -- keine Regel = niemand liest/schreibt direkt

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text check (char_length(author_name) <= 30),
  kind        text not null check (kind in ('bug', 'idea')),
  body        text not null check (char_length(body) between 3 and 2000),
  app_version text check (char_length(app_version) <= 20),
  status      text not null default 'new' check (status in ('new', 'planned', 'done', 'rejected')),
  reply       text check (char_length(reply) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists feedback_created on public.feedback (created_at desc);
create index if not exists feedback_user on public.feedback (user_id);

revoke all on public.feedback from anon;
revoke all on public.feedback from authenticated;
grant select, insert, delete on public.feedback to authenticated;
grant update (status, reply, updated_at) on public.feedback to authenticated;  -- nur diese Spalten, und nur Admins (Regel unten)

alter table public.feedback enable row level security;

drop policy if exists "Feedback lesen" on public.feedback;
create policy "Feedback lesen" on public.feedback
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_app_admin()));

-- Neue Einträge: nur als man selbst, immer mit Status "new" und ohne Antwort
drop policy if exists "Feedback schreiben" on public.feedback;
create policy "Feedback schreiben" on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'new' and reply is null);

drop policy if exists "Feedback bearbeiten (Admin)" on public.feedback;
create policy "Feedback bearbeiten (Admin)" on public.feedback
  for update to authenticated using ((select public.is_app_admin())) with check ((select public.is_app_admin()));

drop policy if exists "Feedback löschen" on public.feedback;
create policy "Feedback löschen" on public.feedback
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_app_admin()));

-- Schutz gegen Spam: höchstens 20 Einträge pro Person und Tag
create or replace function public.feedback_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback f where f.user_id = new.user_id and f.created_at > now() - interval '1 day') >= 20 then
    raise exception 'feedback limit';
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists feedback_limit on public.feedback;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();
