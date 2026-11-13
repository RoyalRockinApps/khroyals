-- Bulletin boards (the Boards tab, once Connect): a main board for each academy (a school's divisions by grade; a
-- school's own file lists them) and a board for each teacher. Like a classroom's, a board is decorated (background,
-- border trim, title) and has notes and student work pinned to it, a strip of photos from a linked album, the
-- teacher's announcements, and (teacher boards) a chat for the class's parents.
--
-- Who's on a board is worked out, never stored: a teacher board's students are the ones in the class sections its
-- teacher leads; an academy board's, the students in its grades. Its students and their parents (guardians, so never
-- Family accounts) and all staff read it; substitutes don't. Its editors (the teacher; for academy boards the staff
-- groups.manage holders name; and groups.manage holders themselves) pin, post and decorate. The chat is for the
-- class's parents and the editors only, never students or other staff.

create table public.academies (
  id        text primary key,
  name      text not null check (char_length(trim(name)) between 1 and 60),
  min_grade int not null,
  max_grade int not null check (max_grade >= min_grade),
  position  int not null default 0
);
alter table public.academies enable row level security;
create policy "approved accounts" on public.academies for select to authenticated using (app.school_role() is not null);
grant select on public.academies to authenticated;
revoke insert, update, delete on public.academies from anon, authenticated;
grant all on public.academies to service_role;

create table public.boards (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid unique references public.profiles (id) on delete cascade,
  academy_id text unique references public.academies (id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 60),    -- "1st Grade" (blank: worked out in the app)
  byline     text not null default '' check (char_length(byline) <= 60),   -- "Mrs. Smith" (blank: the teacher's name)
  background text not null default 'cork' check (background in ('cork', 'navy', 'red', 'yellow', 'green', 'sky', 'chalk')),
  border     text not null default 'scallop-red'
             check (border in ('scallop-red', 'scallop-gold', 'scallop-blue', 'scallop-green', 'rainbow', 'wood', 'none')),
  album_id   uuid references public.gallery_albums (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((teacher_id is null) <> (academy_id is null))
);

/** Staff a groups.manage holder put in charge of a board (an academy's leaders, a co-teacher). */
create table public.board_editors (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (board_id, user_id)
);

-- Every teacher has a board, and every academy.
insert into public.boards (teacher_id) select id from public.profiles where school_role = 'teacher' on conflict do nothing;

create function app.board_for_teacher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.school_role = 'teacher' then insert into boards (teacher_id) values (new.id) on conflict do nothing; end if;
  return new;
end $$;
create trigger board_for_teacher after insert or update of school_role on public.profiles
  for each row execute function app.board_for_teacher();

create function app.board_for_academy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into boards (academy_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger board_for_academy after insert on public.academies for each row execute function app.board_for_academy();

-- ----------------------------------------------------------------------
-- Who's on a board
-- ----------------------------------------------------------------------

/** A board's students: its teacher's class sections, or its academy's grades. */
create function app.board_students(b uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.profile_id from boards x
    join rosters r on r.kind = 'section' and r.lead_id = x.teacher_id
    join roster_members m on m.roster_id = r.id
    join profiles p on p.id = m.profile_id and p.school_role = 'student'
  where x.id = b
  union
  select p.id from boards x
    join academies a on a.id = x.academy_id
    join profiles p on p.school_role = 'student' and p.grade between a.min_grade and a.max_grade
  where x.id = b
$$;

/** Its teacher, the staff put in charge of it, and groups.manage holders. */
create function app.board_editor(b uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.school_role(u) is not null and not app.is_substitute(u) and (
    exists (select 1 from boards where id = b and teacher_id = u)
    or exists (select 1 from board_editors e where e.board_id = b and e.user_id = u and app.is_staff(u))
    or app.has_permission('groups.manage', u))
$$;

/** The board's students and their parents (the caller's own family on it). */
create function app.board_family(b uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.board_students(b) s where s = u or app.is_guardian_of(s, u))
$$;

/** Who reads a board: all staff, its editors, its students and their parents. Never Family accounts or substitutes. */
create function app.sees_board(b uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.school_role(u) is not null and app.school_role(u) not in ('family', 'substitute')
     and (app.is_staff(u) or app.board_editor(b, u) or app.board_family(b, u))
$$;

/** A teacher board's chat: the class's parents and the board's editors (no students, no other staff). */
create function app.in_board_chat(b uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from boards where id = b and teacher_id is not null)
     and (app.board_editor(b, u) or exists (select 1 from app.board_students(b) s where app.is_guardian_of(s, u)))
$$;

/** What notifications call a board: its title, else its academy or its teacher. */
create function app.board_label(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(x.title, ''), a.name, nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Bulletin board')
  from boards x left join academies a on a.id = x.academy_id left join profiles p on p.id = x.teacher_id
  where x.id = b
$$;

/**
 * The photos on a board: the album its editors linked, else (a teacher board) this school year's grade album when its
 * students are all in one grade.
 */
create function app.board_album(b uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select album_id from boards where id = b),
    (select g.id from gallery_albums g
     where g.school_year = app.school_year_end() and g.grade = (
       select min(p.grade) from app.board_students(b) s join profiles p on p.id = s
       having count(distinct p.grade) = 1)
       and exists (select 1 from boards where id = b and teacher_id is not null)))
$$;

alter table public.boards enable row level security;
alter table public.board_editors enable row level security;
create policy "whoever reads the board" on public.boards for select to authenticated using (app.sees_board(id));
create policy "whoever reads the board" on public.board_editors for select to authenticated using (app.sees_board(board_id));
grant select on public.boards, public.board_editors to authenticated;
revoke insert, update, delete on public.boards, public.board_editors from anon, authenticated;
grant all on public.boards, public.board_editors to service_role;

-- ----------------------------------------------------------------------
-- Pinned to the board: notes and student work
-- ----------------------------------------------------------------------

create table public.board_items (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  kind       text not null check (kind in ('note', 'photo')),
  body       text not null default '' check (char_length(body) <= 300),    -- the note, or the photo's caption
  color      text not null default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green', 'white', 'orange')),
  image      text,                                                          -- 'boards' bucket: "<uploader id>/<file>.jpg"
  position   int not null default 0,                                        -- highest first
  created_at timestamptz not null default now(),
  check ((kind = 'photo') = (image is not null)),
  check (kind = 'photo' or char_length(trim(body)) > 0)
);
create index on public.board_items (board_id, position desc);
alter table public.board_items enable row level security;
create policy "whoever reads the board" on public.board_items for select to authenticated using (app.sees_board(board_id));
grant select on public.board_items to authenticated;
revoke insert, update, delete on public.board_items from anon, authenticated;
grant all on public.board_items to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boards', 'boards', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "board photos: staff upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'boards' and (storage.foldername(name))[1] = auth.uid()::text and app.is_staff());
create policy "board photos: whoever reads the board" on storage.objects for select to authenticated
  using (bucket_id = 'boards' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.board_items i where i.image = objects.name)));
create policy "board photos: the uploader removes theirs" on storage.objects for delete to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = auth.uid()::text);

/**
 * Editors pin a note (its words and paper color) or a photo of student work they uploaded to their own folder (with a
 * caption) to the front of the board. A board holds 40 things.
 */
create function public.board_pin(p_board uuid, p_kind text, p_body text, p_color text default 'yellow', p_image text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid; b text := trim(coalesce(p_body, ''));
begin
  if not app.board_editor(p_board) then
    raise exception 'Only the board''s teacher or its editors pin things to it.' using errcode = '42501';
  end if;
  if p_kind not in ('note', 'photo') then raise exception 'Pin a note or a photo.'; end if;
  if p_kind = 'note' and b = '' then raise exception 'Write something on the note.'; end if;
  if char_length(b) > 300 then raise exception 'Keep it to 300 characters.'; end if;
  if p_kind = 'photo' and (p_image is null or split_part(p_image, '/', 1) <> auth.uid()::text
      or not exists (select 1 from storage.objects where bucket_id = 'boards' and name = p_image)) then
    raise exception 'Upload the photo first.';
  end if;
  if (select count(*) from board_items where board_id = p_board) >= 40 then
    raise exception 'The board is full (40 things). Take something down first.';
  end if;
  insert into board_items (board_id, author_id, kind, body, color, image, position)
  values (p_board, auth.uid(), p_kind, b, coalesce(p_color, 'yellow'), case when p_kind = 'photo' then p_image end,
          coalesce((select max(position) from board_items where board_id = p_board), 0) + 1)
  returning id into n;
  update boards set updated_at = now() where id = p_board;
  return n;
end $$;

/** Editors move something to the front of the board. */
create function public.board_item_front(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select board_id into b from board_items where id = p_item;
  if not found then raise exception 'That was taken down.'; end if;
  if not app.board_editor(b) then raise exception 'Only the board''s teacher or its editors move things.' using errcode = '42501'; end if;
  update board_items set position = (select max(position) from board_items where board_id = b) + 1 where id = p_item;
end $$;

/** Editors take something down. Returns its photo, so the app can remove the file. */
create function public.board_unpin(p_item uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i board_items%rowtype;
begin
  select * into i from board_items where id = p_item;
  if not found then return null; end if;
  if not app.board_editor(i.board_id) then
    raise exception 'Only the board''s teacher or its editors take things down.' using errcode = '42501';
  end if;
  delete from board_items where id = p_item;
  return i.image;
end $$;

-- ----------------------------------------------------------------------
-- Announcements
-- ----------------------------------------------------------------------

create table public.board_posts (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  title      text not null default '' check (char_length(title) <= 80),
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.board_posts (board_id, created_at desc);
alter table public.board_posts enable row level security;
create policy "whoever reads the board" on public.board_posts for select to authenticated using (app.sees_board(board_id));
grant select on public.board_posts to authenticated;
revoke insert, update, delete on public.board_posts from anon, authenticated;
grant all on public.board_posts to service_role;

/**
 * Editors announce something (no id) or change an announcement. A new one tells the board's parents and its students
 * who have a login. Returns its id.
 */
create function public.board_post_save(p_id uuid, p_board uuid, p_title text, p_body text, p_pinned boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid := p_board; t text := trim(coalesce(p_title, '')); x text := trim(coalesce(p_body, '')); n uuid; u uuid;
begin
  if p_id is not null then
    select board_id into b from board_posts where id = p_id;
    if not found then raise exception 'That announcement was removed.'; end if;
  end if;
  if b is null or not exists (select 1 from boards where id = b) then raise exception 'That board is gone.'; end if;
  if not app.board_editor(b) then
    raise exception 'Only the board''s teacher or its editors make announcements.' using errcode = '42501';
  end if;
  if x = '' then raise exception 'Write the announcement first.'; end if;
  if char_length(x) > 4000 then raise exception 'Keep an announcement to 4,000 characters.'; end if;
  if char_length(t) > 80 then raise exception 'Keep the title to 80 characters.'; end if;

  if p_id is not null then
    update board_posts set title = t, body = x, pinned = coalesce(p_pinned, false), updated_at = now() where id = p_id;
    return p_id;
  end if;
  insert into board_posts (board_id, author_id, title, body, pinned) values (b, auth.uid(), t, x, coalesce(p_pinned, false))
  returning id into n;
  for u in
    select y.id from (
      select s as id from app.board_students(b) s
      union select gd.guardian_id from guardians gd
            where gd.student_id in (select app.board_students(b)) and app.is_guardian_of(gd.student_id, gd.guardian_id)
    ) y join profiles p on p.id = y.id
    where not p.managed and p.school_role is not null and y.id is distinct from auth.uid()
  loop
    perform app.notify_user(u, '📣 ' || app.board_label(b) || ': ' || coalesce(nullif(t, ''), 'new announcement'),
      left(regexp_replace(x, '\s+', ' ', 'g'), 140), jsonb_build_object('boardId', b, 'boardPostId', n));
  end loop;
  return n;
end $$;

/** Editors take an announcement down. */
create function public.board_post_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select board_id into b from board_posts where id = p_id;
  if not found then return; end if;
  if not app.board_editor(b) then
    raise exception 'Only the board''s teacher or its editors change its announcements.' using errcode = '42501';
  end if;
  delete from board_posts where id = p_id;
end $$;

-- ----------------------------------------------------------------------
-- Parent chat (teacher boards)
-- ----------------------------------------------------------------------

create table public.board_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.board_chat_messages (board_id, created_at);
alter table public.board_chat_messages enable row level security;
create policy "the class's parents and the board's editors" on public.board_chat_messages for select to authenticated
  using (app.in_board_chat(board_id));
grant select on public.board_chat_messages to authenticated;
revoke insert, update, delete on public.board_chat_messages from anon, authenticated;
grant all on public.board_chat_messages to service_role;

/** A class parent or the board's teacher writes in its chat. */
create function public.board_chat_send(p_board uuid, p_body text) returns public.board_chat_messages
language plpgsql security definer set search_path = public as $$
declare r board_chat_messages%rowtype; b text := trim(coalesce(p_body, ''));
begin
  if not app.in_board_chat(p_board) then
    raise exception 'The chat is for the class''s parents and its teacher.' using errcode = '42501';
  end if;
  if b = '' then raise exception 'Write a message first.'; end if;
  if char_length(b) > 1000 then raise exception 'Keep a message to 1,000 characters.'; end if;
  if (select count(*) from board_chat_messages where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'That''s a lot of messages at once. Wait a minute and try again.';
  end if;
  insert into board_chat_messages (board_id, author_id, body) values (p_board, auth.uid(), b) returning * into r;
  return r;
end $$;

/** Remove a message: your own, or (the board's editors) anyone's. */
create function public.board_chat_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m board_chat_messages%rowtype;
begin
  select * into m from board_chat_messages where id = p_id;
  if not found then return; end if;
  if not (m.author_id = auth.uid() and app.in_board_chat(m.board_id) or app.board_editor(m.board_id)) then
    raise exception 'You can only remove your own messages.' using errcode = '42501';
  end if;
  delete from board_chat_messages where id = p_id;
end $$;

-- ----------------------------------------------------------------------
-- The boards someone sees, and one board
-- ----------------------------------------------------------------------

/** One board as the app shows it, for the caller. */
create function app.board_summary(b uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', x.id, 'kind', case when x.teacher_id is null then 'academy' else 'teacher' end,
    'academyId', a.id, 'academyName', a.name, 'minGrade', a.min_grade, 'maxGrade', a.max_grade, 'position', a.position,
    'teacherId', x.teacher_id, 'teacherName', nullif(trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), ''),
    'teacherAvatar', t.avatar_url,
    'title', x.title, 'byline', x.byline, 'background', x.background, 'border', x.border,
    'editor', app.board_editor(x.id), 'family', app.board_family(x.id), 'chat', app.in_board_chat(x.id),
    'leads', coalesce(x.teacher_id = auth.uid(), false) or exists (select 1 from board_editors e where e.board_id = x.id and e.user_id = auth.uid()),
    'children', coalesce((select jsonb_agg(p.first_name order by p.first_name) from app.board_students(x.id) s
                          join profiles p on p.id = s where app.is_guardian_of(s, auth.uid())), '[]'),
    'grades', coalesce((select jsonb_agg(distinct p.grade) from app.board_students(x.id) s join profiles p on p.id = s
                        where p.grade is not null), '[]'),
    'sections', coalesce((select jsonb_agg(r.name order by r.name) from rosters r where r.kind = 'section' and r.lead_id = x.teacher_id), '[]'),
    'items', (select count(*) from board_items i where i.board_id = x.id),
    'lastPostAt', (select max(created_at) from board_posts p where p.board_id = x.id),
    'albumId', app.board_album(x.id), 'linkedAlbumId', x.album_id)
  from boards x left join academies a on a.id = x.academy_id left join profiles t on t.id = x.teacher_id
  where x.id = b
$$;

/** Every board the caller reads: academies in order, then teachers by name. */
create function public.my_boards() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(app.board_summary(x.id) order by (x.academy_id is null), a.position, a.name, t.last_name, t.first_name), '[]')
  from boards x left join academies a on a.id = x.academy_id left join profiles t on t.id = x.teacher_id
  where app.sees_board(x.id)
$$;

/** One board (null when the caller can't read it). */
create function public.board_view(p_board uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when app.sees_board(p_board) then app.board_summary(p_board) end
$$;

/**
 * Editors decorate the board: its title and byline (blank: worked out from the class), background, border trim and
 * the photo album it shows (one they can see; null: the class's grade album, if any).
 */
create function public.board_decorate(p_board uuid, p_title text, p_byline text, p_background text, p_border text, p_album uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.board_editor(p_board) then
    raise exception 'Only the board''s teacher or its editors decorate it.' using errcode = '42501';
  end if;
  if p_album is not null and not app.sees_album(p_album) then raise exception 'That album isn''t one you can see.'; end if;
  if char_length(trim(coalesce(p_title, ''))) > 60 or char_length(trim(coalesce(p_byline, ''))) > 60 then
    raise exception 'Keep the title and the name under it to 60 characters.';
  end if;
  update boards set title = trim(coalesce(p_title, '')), byline = trim(coalesce(p_byline, '')),
                    background = coalesce(p_background, background), border = coalesce(p_border, border),
                    album_id = p_album, updated_at = now()
  where id = p_board;
end $$;

/** groups.manage holders put a staff member in charge of a board, or take them off. */
create function public.board_editor_set(p_board uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_permission('groups.manage') then
    raise exception 'Only admins with Groups choose who runs a board.' using errcode = '42501';
  end if;
  if not exists (select 1 from boards where id = p_board) then raise exception 'That board is gone.'; end if;
  if p_on then
    if not app.is_staff(p_user) then raise exception 'Boards are run by teachers and staff.'; end if;
    insert into board_editors (board_id, user_id) values (p_board, p_user) on conflict do nothing;
  else
    delete from board_editors where board_id = p_board and user_id = p_user;
  end if;
end $$;

-- ----------------------------------------------------------------------
-- Privileges and realtime
-- ----------------------------------------------------------------------

revoke all on function app.board_students(uuid), app.board_editor(uuid, uuid), app.board_family(uuid, uuid), app.sees_board(uuid, uuid),
  app.in_board_chat(uuid, uuid), app.board_label(uuid), app.board_album(uuid), app.board_summary(uuid),
  app.board_for_teacher(), app.board_for_academy() from public, anon;
grant execute on function app.board_students(uuid), app.board_editor(uuid, uuid), app.board_family(uuid, uuid), app.sees_board(uuid, uuid),
  app.in_board_chat(uuid, uuid), app.board_label(uuid), app.board_album(uuid), app.board_summary(uuid) to authenticated, service_role;
revoke all on function public.my_boards(), public.board_view(uuid), public.board_decorate(uuid, text, text, text, text, uuid),
  public.board_editor_set(uuid, uuid, boolean), public.board_pin(uuid, text, text, text, text), public.board_item_front(uuid),
  public.board_unpin(uuid), public.board_post_save(uuid, uuid, text, text, boolean), public.board_post_delete(uuid),
  public.board_chat_send(uuid, text), public.board_chat_delete(uuid) from public, anon;
grant execute on function public.my_boards(), public.board_view(uuid), public.board_decorate(uuid, text, text, text, text, uuid),
  public.board_editor_set(uuid, uuid, boolean), public.board_pin(uuid, text, text, text, text), public.board_item_front(uuid),
  public.board_unpin(uuid), public.board_post_save(uuid, uuid, text, text, boolean), public.board_post_delete(uuid),
  public.board_chat_send(uuid, text), public.board_chat_delete(uuid) to authenticated, service_role;

alter publication supabase_realtime add table public.board_items, public.board_posts, public.board_chat_messages;
