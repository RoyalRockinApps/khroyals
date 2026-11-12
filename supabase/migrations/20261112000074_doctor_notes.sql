-- A doctor's note for a reported absence: the child's parents attach a photo or PDF of the official excuse (when
-- they report it, or up to 30 days after the absence ends), replace it or take it off. The file is in the private
-- 'absence-notes' bucket under the uploader's own folder. It's medical, so only the child's parents and the office
-- (checkin.manage) open it; the child's teachers only see that there is one. The office is told when one arrives.

alter table public.absence_reports
  add column doctor_note    text,          -- 'absence-notes' bucket: "<uploader id>/<report id>/<file>"
  add column doctor_note_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absence-notes', 'absence-notes', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

/** Who opens a child's doctor's notes: their parents (never Family accounts) and the office. */
create function app.reads_doctor_notes(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select (app.is_guardian_of(s, u) and not app.is_family(u)) or app.has_permission('checkin.manage', u)
$$;

create policy "absence notes: parents upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'absence-notes' and (storage.foldername(name))[1] = auth.uid()::text and not app.is_family());
create policy "absence notes: the child's parents and the office" on storage.objects for select to authenticated
  using (bucket_id = 'absence-notes' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.absence_reports r where r.doctor_note = objects.name and app.reads_doctor_notes(r.student_id))));
create policy "absence notes: the uploader removes theirs" on storage.objects for delete to authenticated
  using (bucket_id = 'absence-notes' and (storage.foldername(name))[1] = auth.uid()::text);

/**
 * A parent attaches a doctor's note they uploaded to a report (or takes it off with null). Returns the file it
 * replaces, if any, so the app can remove it. The office is told when a note arrives.
 */
create function public.absence_attach_note(p_id uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare r absence_reports%rowtype; old text; u uuid;
begin
  select * into r from absence_reports where id = p_id;
  if not found or not app.is_guardian_of(r.student_id) or app.is_family() then
    raise exception 'That report isn''t yours to change.' using errcode = '42501';
  end if;
  if r.status = 'cancelled' then raise exception 'That report was called off.'; end if;
  if p_path is not null then
    if r.ends_on < app.school_today() - 30 then raise exception 'Add a doctor''s note within 30 days of the absence.'; end if;
    if split_part(p_path, '/', 1) <> auth.uid()::text or split_part(p_path, '/', 2) <> p_id::text
       or not exists (select 1 from storage.objects where bucket_id = 'absence-notes' and name = p_path) then
      raise exception 'Upload the doctor''s note first.';
    end if;
  end if;
  old := r.doctor_note;
  update absence_reports set doctor_note = p_path, doctor_note_at = case when p_path is null then null else now() end where id = p_id;
  if p_path is not null then
    for u in select app.office_team() loop
      if u <> auth.uid() then
        perform app.notify_user(u, '🩺 Doctor''s note: ' || app.absence_line(r), 'From ' || app.checkin_name(auth.uid()),
          jsonb_build_object('absenceId', r.id));
      end if;
    end loop;
  end if;
  return nullif(old, p_path);
end $$;

-- The list says whether there's a doctor's note, and gives its file only to those who may open it.
drop function public.absence_list(date, int);
create function public.absence_list(p_from date default null, p_days int default 1)
returns table (id uuid, student_id uuid, student text, grade int, kind text, starts_on date, ends_on date, at_time text,
               reason text, note text, status text, reported_by text, created_at timestamptz, seen_by text, seen_at timestamptz, classes text,
               doctor_note text, doctor_note_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.student_id, trim(p.first_name || ' ' || p.last_name), p.grade, r.kind, r.starts_on, r.ends_on, to_char(r.at_time, 'HH24:MI'),
         r.reason, r.note, r.status, app.checkin_name(r.reported_by), r.created_at,
         case when r.seen_by is not null then app.checkin_name(r.seen_by) end, r.seen_at,
         (select string_agg(ro.name, ', ' order by ro.name) from rosters ro join roster_members m on m.roster_id = ro.id
           where ro.kind = 'section' and m.profile_id = r.student_id),
         case when app.reads_doctor_notes(r.student_id) then r.doctor_note end, r.doctor_note_at
  from absence_reports r join profiles p on p.id = r.student_id
  where app.reads_absences(r.student_id)
    and r.ends_on >= coalesce(p_from, app.school_today())
    and r.starts_on <= coalesce(p_from, app.school_today()) + greatest(coalesce(p_days, 1), 1) - 1
  order by r.starts_on, p.last_name, p.first_name, r.created_at
$$;

revoke all on function public.absence_attach_note(uuid, text), public.absence_list(date, int) from public, anon;
grant execute on function public.absence_attach_note(uuid, text), public.absence_list(date, int) to authenticated, service_role;
