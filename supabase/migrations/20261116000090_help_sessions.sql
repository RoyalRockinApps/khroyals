-- Help sessions (Ask the Teacher → Help sessions, app/teachers/help.tsx): a teacher offers extra help for the classes
-- they lead ("Algebra help", Tuesday 3:15–4:00, Room 204, 8 spots), and students in those classes book a spot or give
-- it back until it starts. The students are told when one is offered, and the ones booked when it's called off. Only the
-- teacher sees who booked; students see how many spots are left. Never parents, Family accounts or substitutes.

create table public.help_sessions (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 80),
  details      text not null default '' check (char_length(details) <= 1000),
  day          date not null,
  start_time   time not null,
  end_time     time not null check (end_time > start_time),
  place        text not null default '' check (char_length(place) <= 80),
  spots        int not null check (spots between 1 and 60),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.help_sessions (teacher_id, day);
create index on public.help_sessions (day);

create table public.help_session_sections (
  session_id uuid not null references public.help_sessions (id) on delete cascade,
  section_id text not null references public.rosters (id) on delete cascade,
  primary key (session_id, section_id)
);
create index on public.help_session_sections (section_id);

create table public.help_session_bookings (
  session_id uuid not null references public.help_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  booked_at  timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index on public.help_session_bookings (student_id);

/** The students a session is for: the students (with a login or not) in its classes now. */
create function app.help_session_students(s uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct m.profile_id from help_session_sections hs
    join rosters r on r.id = hs.section_id and r.kind = 'section'
    join roster_members m on m.roster_id = r.id
    join profiles p on p.id = m.profile_id and p.school_role = 'student'
  where hs.session_id = s
$$;

/** Whether this person sees a session: its teacher, and the students in its classes. */
create function app.sees_help_session(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from help_sessions where id = s and teacher_id = u) or u in (select app.help_session_students(s))
$$;

/** Over: its day has passed, or it's today and it has started. */
create function app.help_session_started(h public.help_sessions) returns boolean
language sql stable as $$
  select h.day < app.school_today() or (h.day = app.school_today() and (now() at time zone 'America/Chicago')::time >= h.start_time)
$$;

alter table public.help_sessions enable row level security;
alter table public.help_session_sections enable row level security;
alter table public.help_session_bookings enable row level security;
create policy "its teacher and its students" on public.help_sessions for select to authenticated using (app.sees_help_session(id));
create policy "its teacher and its students" on public.help_session_sections for select to authenticated using (app.sees_help_session(session_id));
create policy "the student, and the teacher" on public.help_session_bookings for select to authenticated
  using (student_id = auth.uid() or exists (select 1 from help_sessions h where h.id = session_id and h.teacher_id = auth.uid()));
grant select on public.help_sessions, public.help_session_sections, public.help_session_bookings to authenticated;
revoke insert, update, delete on public.help_sessions, public.help_session_sections, public.help_session_bookings from anon, authenticated;
grant all on public.help_sessions, public.help_session_sections, public.help_session_bookings to service_role;

/** "Tue, Nov 17, 3:15–4:00 PM · Room 204 · with Ms. Taylor". */
create function app.help_session_line(h public.help_sessions) returns text
language sql stable security definer set search_path = public as $$
  select to_char(h.day, 'Dy, Mon FMDD') || ', ' || to_char(h.start_time, 'FMHH12:MI') || '–' || to_char(h.end_time, 'FMHH12:MI AM')
    || coalesce(nullif(' · ' || trim(h.place), ' · '), '') || ' · with ' || app.checkin_name(h.teacher_id)
$$;

/**
 * A teacher offers (or changes) a help session for classes they lead. A new one tells the students in those classes.
 * A change keeps its bookings, but never below the spots already booked.
 */
create function public.help_session_save(p_id uuid, p_title text, p_details text, p_day date, p_start time, p_end time,
  p_place text, p_spots int, p_sections text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare h help_sessions%rowtype; sec text; u uuid; booked int;
begin
  if not app.is_staff() then raise exception 'Teachers offer help sessions.' using errcode = '42501'; end if;
  if coalesce(cardinality(p_sections), 0) = 0 then raise exception 'Choose at least one of your classes.'; end if;
  foreach sec in array p_sections loop
    if not exists (select 1 from rosters where id = sec and kind = 'section' and lead_id = auth.uid()) then
      raise exception 'Choose classes you teach.' using errcode = '42501';
    end if;
  end loop;
  if coalesce(trim(p_title), '') = '' then raise exception 'Name it, like "Algebra help".'; end if;
  if p_day is null or p_day < app.school_today() then raise exception 'Pick today or a day coming up.'; end if;
  if p_day > app.school_today() + 120 then raise exception 'Pick a day in the next four months.'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'It ends after it starts.'; end if;
  if p_day = app.school_today() and (now() at time zone 'America/Chicago')::time >= p_start then raise exception 'Pick a time that hasn''t started yet.'; end if;
  if p_spots is null or p_spots not between 1 and 60 then raise exception 'How many students can come (1–60)?'; end if;
  if p_id is null then
    insert into help_sessions (teacher_id, title, details, day, start_time, end_time, place, spots)
    values (auth.uid(), trim(p_title), trim(coalesce(p_details, '')), p_day, p_start, p_end, trim(coalesce(p_place, '')), p_spots)
    returning * into h;
  else
    select * into h from help_sessions where id = p_id and teacher_id = auth.uid() for update;
    if not found then raise exception 'That help session isn''t yours.' using errcode = '42501'; end if;
    if h.cancelled_at is not null then raise exception 'That help session was called off.'; end if;
    select count(*) into booked from help_session_bookings where session_id = p_id;
    if p_spots < booked then raise exception '% students have booked; keep at least that many spots.', booked; end if;
    update help_sessions set title = trim(p_title), details = trim(coalesce(p_details, '')), day = p_day, start_time = p_start,
      end_time = p_end, place = trim(coalesce(p_place, '')), spots = p_spots where id = p_id returning * into h;
    delete from help_session_sections where session_id = h.id;
  end if;
  insert into help_session_sections (session_id, section_id) select h.id, x from unnest(p_sections) x on conflict do nothing;
  if p_id is null then
    for u in select app.help_session_students(h.id) loop
      perform app.notify_user(u, '🙋 Help session: ' || h.title, app.help_session_line(h), jsonb_build_object('helpSessionId', h.id));
    end loop;
  end if;
  return h.id;
end $$;

/** The teacher calls a session off; the students who booked are told. */
create function public.help_session_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h help_sessions%rowtype; u uuid;
begin
  select * into h from help_sessions where id = p_id and teacher_id = auth.uid() for update;
  if not found then raise exception 'That help session isn''t yours.' using errcode = '42501'; end if;
  if h.cancelled_at is not null then return; end if;
  update help_sessions set cancelled_at = now() where id = p_id;
  for u in select student_id from help_session_bookings where session_id = p_id loop
    perform app.notify_user(u, '❌ Called off: ' || h.title, app.help_session_line(h), jsonb_build_object('helpSessionId', h.id));
  end loop;
end $$;

/** A student in its classes books a spot (`p_book`) or gives it back, until it starts. */
create function public.help_session_book(p_id uuid, p_book boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare h help_sessions%rowtype;
begin
  select * into h from help_sessions where id = p_id for update;   -- one booking at a time, so the spots hold
  if not found or app.school_role() is distinct from 'student' or auth.uid() not in (select app.help_session_students(p_id)) then
    raise exception 'Help sessions are for the students in the teacher''s classes.' using errcode = '42501';
  end if;
  if h.cancelled_at is not null then raise exception 'That help session was called off.'; end if;
  if app.help_session_started(h) then raise exception 'That help session has already started.'; end if;
  if coalesce(p_book, true) then
    if exists (select 1 from help_session_bookings where session_id = p_id and student_id = auth.uid()) then return; end if;
    if (select count(*) from help_session_bookings where session_id = p_id) >= h.spots then raise exception 'That help session is full.'; end if;
    insert into help_session_bookings (session_id, student_id) values (p_id, auth.uid());
  else
    delete from help_session_bookings where session_id = p_id and student_id = auth.uid();
  end if;
end $$;

/**
 * Help sessions for the person asking, soonest first: a student's (for their classes, from today on, and called-off ones
 * they had booked) with the spots left and whether they're booked; a teacher's own from a week ago on, with who booked.
 */
create function public.help_sessions_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title, 'details', h.details, 'day', h.day, 'startTime', to_char(h.start_time, 'HH24:MI'),
    'endTime', to_char(h.end_time, 'HH24:MI'), 'place', h.place, 'spots', h.spots,
    'taken', (select count(*) from help_session_bookings b where b.session_id = h.id),
    'teacherId', h.teacher_id, 'teacher', app.checkin_name(h.teacher_id), 'cancelled', h.cancelled_at is not null,
    'started', app.help_session_started(h),
    'classes', (select coalesce(jsonb_agg(r.name order by r.name), '[]') from help_session_sections hs join rosters r on r.id = hs.section_id
                where hs.session_id = h.id),
    'sectionIds', (select coalesce(jsonb_agg(hs.section_id order by hs.section_id), '[]') from help_session_sections hs where hs.session_id = h.id),
    'booked', exists (select 1 from help_session_bookings b where b.session_id = h.id and b.student_id = auth.uid()),
    'students', case when h.teacher_id = auth.uid() then (
      select coalesce(jsonb_agg(trim(p.first_name || ' ' || p.last_name) order by b.booked_at, p.last_name, p.first_name), '[]')
      from help_session_bookings b join profiles p on p.id = b.student_id where b.session_id = h.id) end
  ) order by h.day, h.start_time), '[]')
  from help_sessions h
  where (h.teacher_id = auth.uid() and h.day >= app.school_today() - 7)
     or (auth.uid() in (select app.help_session_students(h.id)) and h.day >= app.school_today()
         and (h.cancelled_at is null or exists (select 1 from help_session_bookings b where b.session_id = h.id and b.student_id = auth.uid())))
$$;

revoke all on function app.help_session_students(uuid), app.sees_help_session(uuid, uuid), app.help_session_started(public.help_sessions),
  app.help_session_line(public.help_sessions) from public, anon;
grant execute on function app.help_session_students(uuid), app.sees_help_session(uuid, uuid), app.help_session_started(public.help_sessions),
  app.help_session_line(public.help_sessions) to authenticated, service_role;
revoke all on function public.help_session_save(uuid, text, text, date, time, time, text, int, text[]), public.help_session_cancel(uuid),
  public.help_session_book(uuid, boolean), public.help_sessions_mine() from public, anon;
grant execute on function public.help_session_save(uuid, text, text, date, time, time, text, int, text[]), public.help_session_cancel(uuid),
  public.help_session_book(uuid, boolean), public.help_sessions_mine() to authenticated, service_role;
