-- Notes from parents to teachers, from the Class Folder's + button. A child's parent (a guardian, never a Family
-- account) writes to one of the teachers of the child's class sections (app.teachers_of) about that child; the teacher
-- is told, reads it (which the parent sees as Seen) and can answer with a note of their own into the parents' Folder
-- (folder_note_send). Only the parent who wrote it and that teacher read it.

create table public.parent_notes (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index on public.parent_notes (teacher_id, created_at desc);
create index on public.parent_notes (author_id, created_at desc);

alter table public.parent_notes enable row level security;
create policy "the parent who wrote it and its teacher" on public.parent_notes for select to authenticated
  using (author_id = auth.uid() or teacher_id = auth.uid());
grant select on public.parent_notes to authenticated;
revoke insert, update, delete on public.parent_notes from anon, authenticated;
grant all on public.parent_notes to service_role;

/** For a parent: each of their children with the teachers of the child's classes, to pick whom to write to. */
create function public.parent_note_teachers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('studentId', s.id, 'name', s.first_name,
    'teachers', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', app.checkin_name(t.id),
        'classes', (select coalesce(jsonb_agg(r.name order by r.name), '[]') from rosters r join roster_members m on m.roster_id = r.id
                    where r.kind = 'section' and r.lead_id = t.id and m.profile_id = s.id)) order by app.checkin_name(t.id)), '[]')
      from profiles t where t.id in (select app.teachers_of(s.id)))) order by s.first_name), '[]')
  from profiles s
  where not app.is_family() and app.is_guardian_of(s.id) and s.school_role = 'student'
$$;

/** A parent writes to one of their child's teachers; the teacher is told. Returns the note's id. */
create function public.parent_note_send(p_student uuid, p_teacher uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid; b text := trim(coalesce(p_body, '')); child text;
begin
  if app.is_family() or not app.is_guardian_of(p_student) then
    raise exception 'Only a child''s parents write to their teachers.' using errcode = '42501';
  end if;
  if not app.teaches(p_teacher, p_student) then raise exception 'Pick one of your child''s teachers.'; end if;
  if b = '' then raise exception 'Write what you want to say.'; end if;
  if char_length(b) > 2000 then raise exception 'Keep it to 2,000 characters.'; end if;
  insert into parent_notes (author_id, student_id, teacher_id, body) values (auth.uid(), p_student, p_teacher, b) returning id into n;
  select first_name into child from profiles where id = p_student;
  perform app.notify_user(p_teacher, '✉️ A note about ' || child, 'From ' || app.checkin_name(auth.uid()), jsonb_build_object('parentNoteId', n));
  return n;
end $$;

/** The teacher opened it (the parent sees it was seen). */
create function public.parent_note_read(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update parent_notes set read_at = coalesce(read_at, now()) where id = p_id and teacher_id = auth.uid();
  if not found then raise exception 'That note isn''t to you.' using errcode = '42501'; end if;
end $$;

/**
 * Notes from the last 90 days, newest first: to a teacher, the ones written to them; to a parent, the ones they wrote.
 * Each with the child, who wrote it and whom to, and when the teacher saw it.
 */
create function public.parent_notes_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'body', n.body, 'sentAt', n.created_at, 'readAt', n.read_at, 'mine', n.author_id = auth.uid(),
    'studentId', n.student_id, 'student', app.checkin_name(n.student_id),
    'from', app.checkin_name(n.author_id), 'to', app.checkin_name(n.teacher_id),
    'classes', (select coalesce(jsonb_agg(r.name order by r.name), '[]') from rosters r join roster_members m on m.roster_id = r.id
                where r.kind = 'section' and r.lead_id = n.teacher_id and m.profile_id = n.student_id))
    order by n.created_at desc), '[]')
  from parent_notes n
  where (n.author_id = auth.uid() or n.teacher_id = auth.uid()) and n.created_at > now() - interval '90 days'
$$;

revoke all on function public.parent_note_teachers(), public.parent_note_send(uuid, uuid, text), public.parent_note_read(uuid),
  public.parent_notes_list() from public, anon;
grant execute on function public.parent_note_teachers(), public.parent_note_send(uuid, uuid, text), public.parent_note_read(uuid),
  public.parent_notes_list() to authenticated, service_role;
