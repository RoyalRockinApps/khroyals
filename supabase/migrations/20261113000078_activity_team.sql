-- Each activity's team space, on its page in Activities: the roster, the bulletin board, the parents' chat and the
-- photo album.
--
-- The team is the students registered (approved) for one of the activity's seasons that isn't over, and their
-- parents (guardians, never Family accounts). The activity's leaders (its coaches or directors, and activity
-- managers: app.can_manage_sport) run it.
--   Roster (sport_roster): the team's students with their grade and their parents' names, for the team and leaders.
--   Bulletin board (sport_bulletins): the leaders post, change, pin and remove (sport_bulletin_save / _delete); the
--     team reads, and its parents and students are told about each new post.
--   Parent chat (sport_chat_messages): the team's parents and the leaders talk (sport_chat_send); people remove
--     their own messages, and the leaders anyone's (sport_chat_delete). Students aren't in it.
--   Photo album: one per activity and school year (gallery_albums.sport_id + school_year), for everyone like event
--     albums; its leaders start it (sport_album), and everyone who sees it adds photos, as in every album.

-- ----------------------------------------------------------------------
-- Who's on the team
-- ----------------------------------------------------------------------

/** The students on an activity's team now: registered for one of its seasons that isn't over. */
create function app.team_students(s uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct r.student_id from sport_registrations r join sport_seasons se on se.id = r.season_id
  where se.sport_id = s and r.status = 'registered' and se.ends_on >= app.school_today()
$$;

/** A parent of a student on the team (never a Family account). */
create function app.team_parent(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.team_students(s) t where app.is_guardian_of(t, u))
$$;

/** Reads the roster and the bulletin board: the team's students and parents, and the activity's leaders. */
create function app.on_team(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_manage_sport(s, u) or u in (select app.team_students(s)) or app.team_parent(s, u)
$$;

/** In the parent chat: the team's parents and the activity's leaders. */
create function app.in_team_chat(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_manage_sport(s, u) or app.team_parent(s, u)
$$;

-- ----------------------------------------------------------------------
-- Roster
-- ----------------------------------------------------------------------

/** The team: each student with their grade, photo, seasons and parents, by last name. The team and leaders only. */
create function public.sport_roster(p_sport uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.on_team(p_sport) then
    raise exception 'The roster is for the team''s families and its coaches or directors.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'studentId', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'grade', p.grade, 'avatar', p.avatar_url,
      'seasons', (select coalesce(jsonb_agg(se.name order by se.starts_on), '[]') from sport_registrations r
                  join sport_seasons se on se.id = r.season_id
                  where r.student_id = p.id and se.sport_id = p_sport and r.status = 'registered' and se.ends_on >= app.school_today()),
      'parents', (select coalesce(jsonb_agg(g.first_name || ' ' || g.last_name order by g.last_name, g.first_name), '[]')
                  from guardians gd join profiles g on g.id = gd.guardian_id
                  where gd.student_id = p.id and app.is_guardian_of(p.id, g.id))
    ) order by p.last_name, p.first_name), '[]')
    from profiles p where p.id in (select app.team_students(p_sport))
  );
end $$;

-- ----------------------------------------------------------------------
-- Bulletin board
-- ----------------------------------------------------------------------

create table public.sport_bulletins (
  id         uuid primary key default gen_random_uuid(),
  sport_id   uuid not null references public.sports (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 80),
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sport_bulletins (sport_id, created_at desc);

alter table public.sport_bulletins enable row level security;
create policy "the team and its leaders" on public.sport_bulletins for select to authenticated using (app.on_team(sport_id));
grant select on public.sport_bulletins to authenticated;
revoke insert, update, delete on public.sport_bulletins from anon, authenticated;
grant all on public.sport_bulletins to service_role;

/**
 * The leaders post on the board (no id) or change a post (title, text, pinned). A new post tells the team's parents
 * and its students who have a login. Returns the post's id.
 */
create function public.sport_bulletin_save(p_id uuid, p_sport uuid, p_title text, p_body text, p_pinned boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid := p_sport; t text := trim(coalesce(p_title, '')); b text := trim(coalesce(p_body, '')); n uuid; u uuid;
begin
  if p_id is not null then
    select sport_id into s from sport_bulletins where id = p_id;
    if not found then raise exception 'That post was removed.'; end if;
  end if;
  if s is null or not exists (select 1 from sports where id = s) then raise exception 'That activity is gone.'; end if;
  if not app.can_manage_sport(s) then
    raise exception 'Only the activity''s coaches or directors post on its board.' using errcode = '42501';
  end if;
  if b = '' then raise exception 'Write something to post.'; end if;
  if char_length(b) > 2000 then raise exception 'Keep a post to 2,000 characters.'; end if;
  if char_length(t) > 80 then raise exception 'Keep the title to 80 characters.'; end if;

  if p_id is not null then
    update sport_bulletins set title = t, body = b, pinned = coalesce(p_pinned, false), updated_at = now() where id = p_id;
    return p_id;
  end if;
  insert into sport_bulletins (sport_id, author_id, title, body, pinned) values (s, auth.uid(), t, b, coalesce(p_pinned, false))
  returning id into n;
  for u in
    select x.id from (
      select t2 as id from app.team_students(s) t2
      union select gd.guardian_id from guardians gd where gd.student_id in (select app.team_students(s)) and app.is_guardian_of(gd.student_id, gd.guardian_id)
    ) x join profiles p on p.id = x.id
    where not p.managed and x.id is distinct from auth.uid()
  loop
    perform app.notify_user(u, app.sport_label(s) || ': ' || coalesce(nullif(t, ''), 'new post on the board'),
      left(regexp_replace(b, '\s+', ' ', 'g'), 140), jsonb_build_object('sportId', s, 'bulletinId', n));
  end loop;
  return n;
end $$;

/** The leaders take a post off the board. */
create function public.sport_bulletin_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  select sport_id into s from sport_bulletins where id = p_id;
  if not found then return; end if;
  if not app.can_manage_sport(s) then
    raise exception 'Only the activity''s coaches or directors change its board.' using errcode = '42501';
  end if;
  delete from sport_bulletins where id = p_id;
end $$;

-- ----------------------------------------------------------------------
-- Parent chat
-- ----------------------------------------------------------------------

create table public.sport_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  sport_id   uuid not null references public.sports (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.sport_chat_messages (sport_id, created_at);

alter table public.sport_chat_messages enable row level security;
create policy "the team's parents and its leaders" on public.sport_chat_messages for select to authenticated
  using (app.in_team_chat(sport_id));
grant select on public.sport_chat_messages to authenticated;
revoke insert, update, delete on public.sport_chat_messages from anon, authenticated;
grant all on public.sport_chat_messages to service_role;

/** A team parent or leader writes in the chat. */
create function public.sport_chat_send(p_sport uuid, p_body text) returns public.sport_chat_messages
language plpgsql security definer set search_path = public as $$
declare r sport_chat_messages%rowtype; b text := trim(coalesce(p_body, ''));
begin
  if not app.in_team_chat(p_sport) then
    raise exception 'The chat is for the team''s parents and its coaches or directors.' using errcode = '42501';
  end if;
  if b = '' then raise exception 'Write a message first.'; end if;
  if char_length(b) > 1000 then raise exception 'Keep a message to 1,000 characters.'; end if;
  if (select count(*) from sport_chat_messages where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'That''s a lot of messages at once. Wait a minute and try again.';
  end if;
  insert into sport_chat_messages (sport_id, author_id, body) values (p_sport, auth.uid(), b) returning * into r;
  return r;
end $$;

/** Remove a message: your own, or (the leaders) anyone's. */
create function public.sport_chat_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m sport_chat_messages%rowtype;
begin
  select * into m from sport_chat_messages where id = p_id;
  if not found then return; end if;
  if not (m.author_id = auth.uid() and app.in_team_chat(m.sport_id) or app.can_manage_sport(m.sport_id)) then
    raise exception 'You can only remove your own messages.' using errcode = '42501';
  end if;
  delete from sport_chat_messages where id = p_id;
end $$;

-- ----------------------------------------------------------------------
-- Photo album: one per activity and school year
-- ----------------------------------------------------------------------

alter table public.gallery_albums
  add column sport_id uuid references public.sports (id) on delete set null,
  drop constraint grade_albums_have_a_year,
  add constraint grade_albums_have_a_year check (grade is null or school_year is not null);
create unique index gallery_albums_sport_year on public.gallery_albums (sport_id, school_year) where sport_id is not null;

/**
 * This school year's album for an activity ("Volleyball 2026–27"): returns it, or, for the activity's leaders, makes
 * it. It's for everyone, in the gallery category that fits the activity.
 */
create function public.sport_album(p_sport uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sp sports%rowtype; yr int := app.school_year_end(); cat uuid; a uuid;
begin
  select * into sp from sports where id = p_sport;
  if not found then raise exception 'That activity is gone.'; end if;
  select id into a from gallery_albums where sport_id = p_sport and school_year = yr;
  if a is not null then return a; end if;
  if not app.can_manage_sport(p_sport) then
    raise exception 'The activity''s coaches or directors start its photo album.' using errcode = '42501';
  end if;
  select id into cat from gallery_categories
  where name = case sp.category when 'sports' then 'Sports' when 'clubs' then 'Clubs' else 'Fine Arts' end;
  if cat is null then select id into cat from gallery_categories where name = 'Events'; end if;
  insert into gallery_albums (title, description, taken_on, created_by, category_id, visibility, sport_id, school_year)
  values (left(sp.name, 72) || ' ' || (yr - 1) || '–' || right(yr::text, 2), '', app.school_today(), auth.uid(), cat, 'everyone', p_sport, yr)
  on conflict (sport_id, school_year) where sport_id is not null do nothing;
  select id into a from gallery_albums where sport_id = p_sport and school_year = yr;
  return a;
end $$;

-- ----------------------------------------------------------------------
-- Privileges and realtime
-- ----------------------------------------------------------------------

revoke all on function app.team_students(uuid), app.team_parent(uuid, uuid), app.on_team(uuid, uuid), app.in_team_chat(uuid, uuid)
  from public, anon;
grant execute on function app.team_students(uuid), app.team_parent(uuid, uuid), app.on_team(uuid, uuid), app.in_team_chat(uuid, uuid)
  to authenticated, service_role;
revoke all on function public.sport_roster(uuid), public.sport_bulletin_save(uuid, uuid, text, text, boolean),
  public.sport_bulletin_delete(uuid), public.sport_chat_send(uuid, text), public.sport_chat_delete(uuid), public.sport_album(uuid)
  from public, anon;
grant execute on function public.sport_roster(uuid), public.sport_bulletin_save(uuid, uuid, text, text, boolean),
  public.sport_bulletin_delete(uuid), public.sport_chat_send(uuid, text), public.sport_chat_delete(uuid), public.sport_album(uuid)
  to authenticated, service_role;

alter publication supabase_realtime add table public.sport_bulletins, public.sport_chat_messages;
