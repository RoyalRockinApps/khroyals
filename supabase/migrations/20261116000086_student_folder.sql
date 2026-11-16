-- Students get the Class Folder on their Main Page too, read-only (src/schoolForms/MainFolder.tsx): the newsletter, the
-- bulletins posted to their classes, and the forms sent for them. They never remove papers, sign forms or write notes,
-- and teachers' notes to their parents stay the parents' own.

/** Whether this person reads a bulletin or note: its parents, and for a class bulletin the students it went to. */
create function app.reads_folder_note(n uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.gets_folder_note(n, u)
      or (exists (select 1 from folder_notes x where x.id = n and x.kind = 'bulletin') and u in (select app.folder_note_students(n)))
$$;

drop policy "its author and its parents" on public.folder_notes;
drop policy "its author and its parents" on public.folder_note_sections;
create policy "its author, its parents and a bulletin's students" on public.folder_notes for select to authenticated
  using (author_id = auth.uid() or app.reads_folder_note(id));
create policy "its author, its parents and a bulletin's students" on public.folder_note_sections for select to authenticated
  using (exists (select 1 from folder_notes n where n.id = note_id and (n.author_id = auth.uid() or app.reads_folder_note(n.id))));

/** Opened (a parent, or a student opening their class's bulletin). Teachers' "opened by" counts stay parents only. */
create or replace function public.folder_note_read(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.reads_folder_note(p_id) then raise exception 'That isn''t in your folder.' using errcode = '42501'; end if;
  insert into folder_note_readers (note_id, user_id, read_at) values (p_id, auth.uid(), now())
  on conflict (note_id, user_id) do update set read_at = coalesce(folder_note_readers.read_at, excluded.read_at);
end $$;
-- folder_note_remove stays parents only (app.gets_folder_note): a student's Folder is read-only.

/**
 * A parent's bulletins and notes from the last 60 days, newest first (and a student's class bulletins): what it says,
 * who wrote it, which of their children it's for (and a bulletin's classes), and when they opened it or took it out
 * of their Folder.
 */
create or replace function public.my_folder_notes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'from', app.folder_note_from(n), 'sentAt', n.created_at,
    'children', (select coalesce(jsonb_agg(p.first_name order by p.first_name), '[]') from profiles p
                 where p.id in (select app.folder_note_students(n.id)) and app.is_guardian_of(p.id)),
    'classes', (select coalesce(jsonb_agg(r.name order by r.name), '[]') from folder_note_sections s join rosters r on r.id = s.section_id
                where s.note_id = n.id),
    'readAt', x.read_at, 'removedAt', x.removed_at) order by n.created_at desc), '[]')
  from folder_notes n left join folder_note_readers x on x.note_id = n.id and x.user_id = auth.uid()
  where n.created_at > now() - interval '60 days' and app.reads_folder_note(n.id)
$$;

/**
 * A parent's forms: each of their children it went to, with the signature and payment. A student's own: the form, and
 * only when a parent answered it (`answeredAt`), never the answers, signature, agree or decline, or payment.
 */
create or replace function public.my_forms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.due_on, t.title), '[]') from (
    select f.due_on, f.title, app.form_json(f) || jsonb_build_object(
      'removedAt', (select x.at from form_removals x where x.form_id = f.id and x.user_id = auth.uid()),
      'children', (
      select jsonb_agg(jsonb_build_object('studentId', r.student_id, 'name', s.first_name,
        'response', case when x.student_id is null then null else jsonb_build_object(
          'agreed', x.agreed, 'answers', x.answers, 'signature', x.signature, 'signedAt', x.signed_at,
          'signedBy', (select trim(first_name || ' ' || last_name) from profiles where id = x.signed_by)) end,
        'payment', app.form_payment_json(pay, false))
        order by s.first_name)
      from form_recipients r join profiles s on s.id = r.student_id
      left join form_responses x on x.form_id = r.form_id and x.student_id = r.student_id
      left join form_payments pay on pay.form_id = r.form_id and pay.student_id = r.student_id
      where r.form_id = f.id and app.is_guardian_of(r.student_id))) as j
    from forms f
    where exists (select 1 from form_recipients r where r.form_id = f.id and app.is_guardian_of(r.student_id))
    union all
    select f.due_on, f.title, app.form_json(f) || jsonb_build_object('removedAt', null, 'readOnly', true,
      'children', jsonb_build_array(jsonb_build_object('studentId', s.id, 'name', s.first_name, 'response', null, 'payment', null,
        'answeredAt', (select x.signed_at from form_responses x where x.form_id = f.id and x.student_id = s.id))))
    from forms f join form_recipients r on r.form_id = f.id and r.student_id = auth.uid()
    join profiles s on s.id = r.student_id and s.school_role = 'student'
  ) t
$$;

-- A student reads the forms that went to them and their own recipient row (never the responses or payments).
create policy "the student it went to" on public.forms for select to authenticated
  using (exists (select 1 from form_recipients r where r.form_id = forms.id and r.student_id = auth.uid()));
create policy "the student it went to" on public.form_recipients for select to authenticated
  using (student_id = auth.uid());
