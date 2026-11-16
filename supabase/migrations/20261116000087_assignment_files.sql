-- Students turn in work for a class assignment: documents (PDF, Word, PowerPoint, Excel, text) or photos of their
-- work, in the private 'assignment-files' bucket under their own folder ("<student id>/<assignment id>/<file>").
-- Only the student and the class's teachers (whoever assigned it, and the section's lead teacher) open them; never
-- other students, parents or the office. A student adds up to 10 files to an assignment and removes their own.
-- The file types are in both src/assignments/files.ts and the bucket below (tests/assignment-files.test.ts compares).

create table public.assignment_files (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  path          text not null unique,                -- 'assignment-files' bucket
  name          text not null check (char_length(name) between 1 and 200),
  mime_type     text not null,
  size_bytes    int not null check (size_bytes > 0),
  created_at    timestamptz not null default now()
);
create index on public.assignment_files (assignment_id, student_id);
create index on public.assignment_files (student_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-files', 'assignment-files', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

/** The class's teachers for an assignment: whoever assigned it and the section's lead teacher. */
create function app.grades_assignment(a uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments x join rosters r on r.id = x.roster_id
                 where x.id = a and (x.owner_id = u or r.lead_id = u) and app.is_staff(u))
$$;

alter table public.assignment_files enable row level security;
create policy "the student, and the class's teachers" on public.assignment_files for select to authenticated
  using (student_id = auth.uid() or app.grades_assignment(assignment_id));
grant select on public.assignment_files to authenticated;
revoke insert, update, delete on public.assignment_files from anon, authenticated;
grant all on public.assignment_files to service_role;

create policy "assignment files: students upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = auth.uid()::text and app.school_role() = 'student');
create policy "assignment files: the student and the class's teachers" on storage.objects for select to authenticated
  using (bucket_id = 'assignment-files' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.assignment_files f where f.path = objects.name and app.grades_assignment(f.assignment_id))));
create policy "assignment files: the student removes theirs" on storage.objects for delete to authenticated
  using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = auth.uid()::text);

/** A student turns in a file they uploaded for one of their class assignments (up to 10 each). */
create function public.assignment_file_add(p_assignment uuid, p_path text, p_name text, p_mime text, p_size int)
returns public.assignment_files
language plpgsql security definer set search_path = public as $$
declare a assignments%rowtype; f assignment_files%rowtype; clean text := left(trim(coalesce(p_name, '')), 200);
begin
  select * into a from assignments where id = p_assignment;
  if not found or a.roster_id is null or app.school_role() is distinct from 'student'
     or not exists (select 1 from roster_members where roster_id = a.roster_id and profile_id = auth.uid()) then
    raise exception 'You can turn in work for your classes'' assignments.' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text or split_part(p_path, '/', 2) <> p_assignment::text
     or not exists (select 1 from storage.objects where bucket_id = 'assignment-files' and name = p_path) then
    raise exception 'Upload the file first.';
  end if;
  if (select count(*) from assignment_files where assignment_id = p_assignment and student_id = auth.uid()) >= 10 then
    raise exception 'You can turn in up to 10 files for an assignment. Remove one first.';
  end if;
  insert into assignment_files (assignment_id, student_id, path, name, mime_type, size_bytes)
  values (p_assignment, auth.uid(), p_path, coalesce(nullif(clean, ''), 'File'), coalesce(p_mime, 'application/octet-stream'), greatest(coalesce(p_size, 1), 1))
  returning * into f;
  return f;
end $$;

/** A student takes back a file they turned in. Returns its storage path so the app removes the upload. */
create function public.assignment_file_remove(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p text;
begin
  delete from assignment_files where id = p_id and student_id = auth.uid() returning path into p;
  if p is null then raise exception 'Only the student who turned in a file can remove it.' using errcode = '42501'; end if;
  return p;
end $$;

/**
 * For the class's teachers: every student in the section, with the files they turned in (oldest first); null for
 * anyone else.
 */
create function public.assignment_work(p_assignment uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when app.grades_assignment(p_assignment) then (
    select coalesce(jsonb_agg(jsonb_build_object('studentId', p.id, 'name', trim(p.first_name || ' ' || p.last_name),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'mimeType', f.mime_type, 'size', f.size_bytes,
                  'path', f.path, 'at', f.created_at) order by f.created_at), '[]')
                from assignment_files f where f.assignment_id = p_assignment and f.student_id = p.id))
      order by p.last_name, p.first_name), '[]')
    from assignments a join roster_members m on m.roster_id = a.roster_id
    join profiles p on p.id = m.profile_id and p.school_role = 'student'
    where a.id = p_assignment) end
$$;

revoke all on function app.grades_assignment(uuid, uuid) from public, anon;
grant execute on function app.grades_assignment(uuid, uuid) to authenticated, service_role;
revoke all on function public.assignment_file_add(uuid, text, text, text, int), public.assignment_file_remove(uuid),
  public.assignment_work(uuid) from public, anon;
grant execute on function public.assignment_file_add(uuid, text, text, text, int), public.assignment_file_remove(uuid),
  public.assignment_work(uuid) to authenticated, service_role;
