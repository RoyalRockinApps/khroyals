-- Lunch Visits: every lunch time runs on every school day. The office no longer picks weekdays: a lunch time is open
-- Monday to Friday except the days app.lunch_closed closes (No School, Teacher In-Service and E-Learning days on the
-- school calendar, and the days the office closes). `weekdays` stays (always Monday to Friday) for app builds that
-- still read it and send it; lunch_window_save ignores what they send.

update public.lunch_windows set weekdays = array[1, 2, 3, 4, 5] where weekdays is distinct from array[1, 2, 3, 4, 5];
alter table public.lunch_windows alter column weekdays set default array[1, 2, 3, 4, 5];

create or replace function public.lunch_window_save(p_id uuid, p_name text, p_weekdays int[], p_start time, p_end time,
  p_grade_from int, p_grade_to int, p_capacity int, p_active boolean default true) returns public.lunch_windows
language plpgsql security definer set search_path = public as $$
declare row lunch_windows%rowtype;
begin
  perform app.require_permission('lunch.manage');
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the lunch, like "K–2nd lunch".'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'The lunch ends after it starts.'; end if;
  if p_grade_from is null or p_grade_to is null or p_grade_to < p_grade_from then raise exception 'Pick the grades.'; end if;
  if p_capacity is null or p_capacity not between 1 and 200 then raise exception 'How many visitors a day (1–200)?'; end if;
  if p_id is null then
    insert into lunch_windows (name, weekdays, start_time, end_time, grade_from, grade_to, capacity, active)
    values (trim(p_name), array[1, 2, 3, 4, 5], p_start, p_end, p_grade_from, p_grade_to, p_capacity, coalesce(p_active, true))
    returning * into row;
  else
    update lunch_windows set name = trim(p_name), weekdays = array[1, 2, 3, 4, 5],
      start_time = p_start, end_time = p_end, grade_from = p_grade_from, grade_to = p_grade_to, capacity = p_capacity, active = coalesce(p_active, true)
    where id = p_id returning * into row;
    if not found then raise exception 'That lunch is gone.'; end if;
  end if;
  return row;
end $$;

/** The open lunch times for a child: every school day (not app.lunch_closed) in the next `p_days`, for their grade. */
create or replace function public.lunch_slots(p_student uuid, p_from date default null, p_days int default 21)
returns table (day date, window_id uuid, name text, start_time text, end_time text, spots_left int, my_visit uuid)
language sql stable security definer set search_path = public as $$
  select d::date, w.id, w.name, to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI'),
         greatest(w.capacity - app.lunch_taken(w.id, d::date), 0),
         (select v.id from lunch_visits v where v.window_id = w.id and v.day = d::date and v.student_id = p_student
            and v.visitor_id = auth.uid() and v.status = 'booked')
  from generate_series(coalesce(p_from, app.school_today()), coalesce(p_from, app.school_today()) + least(greatest(coalesce(p_days, 21), 1), 60) - 1, interval '1 day') d
  join lunch_windows w on w.active
  join profiles p on p.id = p_student and p.grade between w.grade_from and w.grade_to
  where p_student in (select app.lunch_kids()) and not app.lunch_closed(d::date)
    and (d::date > app.school_today() or (d::date = app.school_today() and (now() at time zone 'America/Chicago')::time < w.start_time))
  order by 1, w.start_time
$$;

/** Book a lunch visit (visitor plus up to 3 guests) after reading the allergy notes and rules (`p_read_allergies`). */
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
  if app.lunch_closed(p_day) then raise exception 'Lunch visits aren''t open that day.'; end if;
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
