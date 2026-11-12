-- Class bulletins and teachers' notes, in parents' Folders. A teacher posts a bulletin to class sections they lead
-- (forms.send holders to any section), or writes a note to one student's parents (a teacher of one of the student's
-- sections, app.teaches). Only those students' parents (guardians, never Family accounts) read them, and the author;
-- each parent is told once. A parent's opening one marks it read for them, and they take it out of their own Folder
-- (folder_note_remove) or put it back. The author sees how many parents have read it, and deletes it.

create table public.folder_notes (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('bulletin', 'note')),
  student_id uuid references public.profiles (id) on delete cascade,   -- a note: the child it's about
  title      text not null default '' check (char_length(title) <= 120),
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check ((kind = 'note') = (student_id is not null))
);
create index on public.folder_notes (student_id);
create index on public.folder_notes (author_id, created_at desc);

/** A bulletin's classes. */
create table public.folder_note_sections (
  note_id    uuid not null references public.folder_notes (id) on delete cascade,
  section_id text not null references public.rosters (id) on delete cascade,
  primary key (note_id, section_id)
);
create index on public.folder_note_sections (section_id);

/** Each parent's own: when they opened it, and when they took it out of their Folder. */
create table public.folder_note_readers (
  note_id    uuid not null references public.folder_notes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  read_at    timestamptz,
  removed_at timestamptz,
  primary key (note_id, user_id)
);
create index on public.folder_note_readers (user_id);

/** The students a bulletin or note is for: a note's child, or the students in a bulletin's classes now. */
create function app.folder_note_students(n uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select student_id from folder_notes where id = n and student_id is not null
  union
  select m.profile_id from folder_note_sections s
    join rosters r on r.id = s.section_id and r.kind = 'section'
    join roster_members m on m.roster_id = r.id
    join profiles p on p.id = m.profile_id and p.school_role = 'student'
  where s.note_id = n
$$;

/** The parents it goes to (never Family accounts). */
create function app.folder_note_parents(n uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct g.guardian_id from guardians g
  where g.student_id in (select app.folder_note_students(n)) and not app.is_family(g.guardian_id)
$$;

/** Whether this person is one of its parents. */
create function app.gets_folder_note(n uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select u in (select app.folder_note_parents(n))
$$;

alter table public.folder_notes enable row level security;
alter table public.folder_note_sections enable row level security;
alter table public.folder_note_readers enable row level security;
create policy "its author and its parents" on public.folder_notes for select to authenticated
  using (author_id = auth.uid() or app.gets_folder_note(id));
create policy "its author and its parents" on public.folder_note_sections for select to authenticated
  using (exists (select 1 from folder_notes n where n.id = note_id and (n.author_id = auth.uid() or app.gets_folder_note(n.id))));
create policy "their own, and the author" on public.folder_note_readers for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from folder_notes n where n.id = note_id and n.author_id = auth.uid()));
grant select on public.folder_notes, public.folder_note_sections, public.folder_note_readers to authenticated;
revoke insert, update, delete on public.folder_notes, public.folder_note_sections, public.folder_note_readers from anon, authenticated;
grant all on public.folder_notes, public.folder_note_sections, public.folder_note_readers to service_role;

create function app.folder_note_clean(p_title text, p_body text, need_title boolean) returns text[]
language plpgsql immutable as $$
declare t text := trim(coalesce(p_title, '')); b text := trim(coalesce(p_body, ''));
begin
  if need_title and t = '' then raise exception 'Give the bulletin a title.'; end if;
  if char_length(t) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if b = '' then raise exception 'Write what you want to say.'; end if;
  if char_length(b) > 4000 then raise exception 'Keep it to 4,000 characters.'; end if;
  return array[t, b];
end $$;

/** A teacher posts a bulletin to class sections they lead; every parent of their students is told once. */
create function public.folder_bulletin_send(p_sections text[], p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid; sec text; clean text[]; u uuid; names text;
begin
  if not app.is_staff() then raise exception 'Teachers post class bulletins.' using errcode = '42501'; end if;
  if coalesce(cardinality(p_sections), 0) = 0 then raise exception 'Pick at least one of your classes.'; end if;
  foreach sec in array p_sections loop
    if not exists (select 1 from rosters where id = sec and kind = 'section') then raise exception 'Pick one of your classes.'; end if;
    if not exists (select 1 from rosters where id = sec and lead_id = auth.uid()) and not app.has_permission('forms.send') then
      raise exception 'You can post bulletins to the classes you teach.' using errcode = '42501';
    end if;
  end loop;
  clean := app.folder_note_clean(p_title, p_body, true);
  insert into folder_notes (author_id, kind, title, body) values (auth.uid(), 'bulletin', clean[1], clean[2]) returning id into n;
  insert into folder_note_sections (note_id, section_id) select distinct n, x from unnest(p_sections) x;
  if not exists (select 1 from app.folder_note_students(n)) then raise exception 'There are no students in those classes yet.'; end if;
  select string_agg(name, ', ' order by name) into names from rosters where id = any (p_sections);
  for u in select app.folder_note_parents(n) loop
    if u <> auth.uid() then
      perform app.notify_user(u, '📌 ' || clean[1], 'Class bulletin from ' || app.checkin_name(auth.uid()) || ' · ' || names,
        jsonb_build_object('folderNoteId', n));
    end if;
  end loop;
  return n;
end $$;

/** A teacher writes a note to one of their students' parents; each parent is told (the note itself stays in the app). */
create function public.folder_note_send(p_student uuid, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid; clean text[]; u uuid; child text;
begin
  if not app.is_staff() or not app.teaches(auth.uid(), p_student) then
    raise exception 'You can write to the parents of students in your classes.' using errcode = '42501';
  end if;
  clean := app.folder_note_clean(p_title, p_body, false);
  insert into folder_notes (author_id, kind, student_id, title, body) values (auth.uid(), 'note', p_student, clean[1], clean[2]) returning id into n;
  if not exists (select 1 from app.folder_note_parents(n)) then raise exception 'No parent is linked to this student yet.'; end if;
  select first_name into child from profiles where id = p_student;
  for u in select app.folder_note_parents(n) loop
    if u <> auth.uid() then
      perform app.notify_user(u, '✉️ A note about ' || child, 'From ' || app.checkin_name(auth.uid()) || coalesce(': ' || nullif(clean[1], ''), ''),
        jsonb_build_object('folderNoteId', n));
    end if;
  end loop;
  return n;
end $$;

/** The author deletes their bulletin or note: it leaves every Folder. */
create function public.folder_note_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from folder_notes where id = p_id and author_id = auth.uid();
  if not found then raise exception 'That isn''t yours to delete.' using errcode = '42501'; end if;
end $$;

/** A parent opened it. */
create function public.folder_note_read(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.gets_folder_note(p_id) then raise exception 'That isn''t in your folder.' using errcode = '42501'; end if;
  insert into folder_note_readers (note_id, user_id, read_at) values (p_id, auth.uid(), now())
  on conflict (note_id, user_id) do update set read_at = coalesce(folder_note_readers.read_at, excluded.read_at);
end $$;

/** A parent takes it out of their own Folder (or puts it back with p_removed false). */
create function public.folder_note_remove(p_id uuid, p_removed boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.gets_folder_note(p_id) then raise exception 'That isn''t in your folder.' using errcode = '42501'; end if;
  insert into folder_note_readers (note_id, user_id, removed_at) values (p_id, auth.uid(), case when p_removed then now() end)
  on conflict (note_id, user_id) do update set removed_at = excluded.removed_at;
end $$;

/** Who wrote it, as parents see it. */
create function app.folder_note_from(n public.folder_notes) returns text
language sql stable security definer set search_path = public as $$ select app.checkin_name(n.author_id) $$;

/**
 * A parent's bulletins and notes from the last 60 days, newest first: what it says, who wrote it, which of their
 * children it's for (and a bulletin's classes), and when they opened it or took it out of their Folder.
 */
create function public.my_folder_notes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'from', app.folder_note_from(n), 'sentAt', n.created_at,
    'children', (select coalesce(jsonb_agg(p.first_name order by p.first_name), '[]') from profiles p
                 where p.id in (select app.folder_note_students(n.id)) and app.is_guardian_of(p.id)),
    'classes', (select coalesce(jsonb_agg(r.name order by r.name), '[]') from folder_note_sections s join rosters r on r.id = s.section_id
                where s.note_id = n.id),
    'readAt', x.read_at, 'removedAt', x.removed_at) order by n.created_at desc), '[]')
  from folder_notes n left join folder_note_readers x on x.note_id = n.id and x.user_id = auth.uid()
  where n.created_at > now() - interval '60 days' and app.gets_folder_note(n.id)
$$;

/** A teacher's own bulletins and notes from the last 90 days, newest first, with how many parents have opened each. */
create function public.sent_folder_notes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'sentAt', n.created_at,
    'to', case when n.kind = 'note' then (select trim(first_name || ' ' || last_name) from profiles where id = n.student_id) || '''s parents'
               else (select string_agg(r.name, ', ' order by r.name) from folder_note_sections s join rosters r on r.id = s.section_id where s.note_id = n.id) end,
    'parents', (select count(*) from app.folder_note_parents(n.id)),
    'read', (select count(*) from folder_note_readers x where x.note_id = n.id and x.read_at is not null
               and x.user_id in (select app.folder_note_parents(n.id)))) order by n.created_at desc), '[]')
  from folder_notes n
  where n.author_id = auth.uid() and n.created_at > now() - interval '90 days'
$$;

revoke all on function public.folder_bulletin_send(text[], text, text), public.folder_note_send(uuid, text, text),
  public.folder_note_delete(uuid), public.folder_note_read(uuid), public.folder_note_remove(uuid, boolean),
  public.my_folder_notes(), public.sent_folder_notes() from public, anon;
grant execute on function public.folder_bulletin_send(text[], text, text), public.folder_note_send(uuid, text, text),
  public.folder_note_delete(uuid), public.folder_note_read(uuid), public.folder_note_remove(uuid, boolean),
  public.my_folder_notes(), public.sent_folder_notes() to authenticated, service_role;
