-- Lunch visits: two families booking the last seats at the same moment could both get in. The
-- lunch time was read "for share", which lets both bookings go ahead together; "for update" makes the
-- second one wait for the first, then count it. Everything else is as before.

create or replace function public.lunch_visit_book(p_window uuid, p_day date, p_student uuid, p_guests int default 0, p_note text default '',
  p_read_allergies boolean default false) returns public.lunch_visits
language plpgsql security definer set search_path = public as $$
declare w lunch_windows%rowtype; g int; r lunch_visits%rowtype; t uuid; kid text;
begin
  if p_student is null or p_student not in (select app.lunch_kids()) then
    raise exception 'Only a child''s parents and the family the school linked can visit at lunch.' using errcode = '42501';
  end if;
  if not coalesce(p_read_allergies, false) then raise exception 'Read the allergy notes and lunch rules first.'; end if;
  select * into w from lunch_windows where id = p_window and active for update;  -- one booking at a time, so the seats hold
  if not found then raise exception 'That lunch time isn''t offered.'; end if;
  select grade into g from profiles where id = p_student;
  if g is null or g not between w.grade_from and w.grade_to then raise exception 'That lunch isn''t for this child''s grade.'; end if;
  if p_day is null or p_day < app.school_today() or p_day > app.school_today() + 60 then raise exception 'Pick a day in the next two months.'; end if;
  if not (extract(isodow from p_day)::int = any (w.weekdays)) or app.lunch_closed(p_day) then raise exception 'Lunch visits aren''t open that day.'; end if;
  if p_day = app.school_today() and (now() at time zone 'America/Chicago')::time >= w.start_time then raise exception 'That lunch has already started.'; end if;
  if coalesce(p_guests, 0) not between 0 and 3 then raise exception 'Bring up to 3 guests.'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'Keep the note to 300 characters.'; end if;
  if exists (select 1 from lunch_visits where window_id = w.id and day = p_day and student_id = p_student and visitor_id = auth.uid() and status = 'booked') then
    raise exception 'You''re already coming that day.';
  end if;
  if app.lunch_taken(w.id, p_day) + 1 + coalesce(p_guests, 0) > w.capacity then raise exception 'That lunch is full. Try another day.'; end if;
  insert into lunch_visits (window_id, day, student_id, visitor_id, guests, note, allergy_ack_at)
  values (w.id, p_day, p_student, auth.uid(), coalesce(p_guests, 0), trim(coalesce(p_note, '')), now())
  returning * into r;
  select first_name into kid from profiles where id = p_student;
  for t in select app.teachers_of(p_student) loop
    perform app.notify_user(t, '🍎 ' || app.short_name(auth.uid()) || ' is coming to lunch with ' || kid,
      to_char(p_day, 'Dy Mon FMDD') || ', ' || w.name || ' (' || to_char(w.start_time, 'FMHH12:MI') || ')'
        || case when r.guests > 0 then ', with ' || r.guests || ' guest' || case when r.guests > 1 then 's' else '' end else '' end,
      jsonb_build_object('lunchVisitId', r.id));
  end loop;
  return r;
end $$;
