-- Class times (My schedule): when and where each class section meets (the weekdays, the time and the room; a class may
-- meet at different times on different days). The class's lead teacher or the office (people.family or checkin.manage)
-- sets them (Classes → a class → the gear → Class times, app/attendance/times.tsx); later the FACTS connector can fill
-- them. Students see their week in the Student app (and their parents, a child's; never Family accounts), and students
-- get Now / Next class on the Planner, skipping No School, In-Service and E-Learning days.

create table public.section_meetings (
  id         uuid primary key default gen_random_uuid(),
  section_id text not null references public.rosters (id) on delete cascade,
  weekdays   int[] not null check (cardinality(weekdays) between 1 and 5 and weekdays <@ array[1, 2, 3, 4, 5]),  -- 1 Monday … 5 Friday
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  room       text not null default '' check (char_length(room) <= 40),
  created_at timestamptz not null default now()
);
create index on public.section_meetings (section_id);

/** A day without classes: a weekend, or a No School, Teacher In-Service or E-Learning day on the school calendar. */
create function app.no_school(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d) > 5
      or exists (select 1 from events where group_id is null and category in ('No School', 'Teacher In-Service', 'E-Learning')
                 and d between starts_on and coalesce(ends_on, starts_on))
$$;

/** Who sets a class's times: its lead teacher, and the office. */
create function app.edits_class_times(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rosters where id = sec and kind = 'section' and lead_id = u)
      or app.has_permission('people.family', u) or app.has_permission('checkin.manage', u)
$$;

/** Who reads a class's times: staff, its students, and their parents (never Family accounts). */
create function app.sees_class_times(sec text, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u)
      or exists (select 1 from roster_members m where m.roster_id = sec and (m.profile_id = u or (app.is_guardian_of(m.profile_id, u) and not app.is_family(u))))
$$;

alter table public.section_meetings enable row level security;
create policy "staff, its students and their parents" on public.section_meetings for select to authenticated using (app.sees_class_times(section_id));
grant select on public.section_meetings to authenticated;
revoke insert, update, delete on public.section_meetings from anon, authenticated;
grant all on public.section_meetings to service_role;

/** Add or change one of a class's meeting times. Returns its id. */
create function public.section_meeting_save(p_id uuid, p_section text, p_weekdays int[], p_start time, p_end time, p_room text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid; days int[];
begin
  if not exists (select 1 from rosters where id = p_section and kind = 'section') then raise exception 'Choose a class.'; end if;
  if not app.edits_class_times(p_section) then
    raise exception 'Only the class''s teacher or the office sets its times.' using errcode = '42501';
  end if;
  days := (select array_agg(distinct x order by x) from unnest(coalesce(p_weekdays, '{}')) x);
  if days is null or not (days <@ array[1, 2, 3, 4, 5]) then raise exception 'Pick the days it meets (Monday to Friday).'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'It ends after it starts.'; end if;
  if char_length(trim(coalesce(p_room, ''))) > 40 then raise exception 'Keep the room to 40 characters.'; end if;
  if p_id is null then
    insert into section_meetings (section_id, weekdays, start_time, end_time, room)
    values (p_section, days, p_start, p_end, trim(coalesce(p_room, ''))) returning id into mid;
  else
    update section_meetings set weekdays = days, start_time = p_start, end_time = p_end, room = trim(coalesce(p_room, ''))
    where id = p_id and section_id = p_section returning id into mid;
    if mid is null then raise exception 'That class time is gone.'; end if;
  end if;
  return mid;
end $$;

create function public.section_meeting_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sec text;
begin
  select section_id into sec from section_meetings where id = p_id;
  if sec is null then return; end if;
  if not app.edits_class_times(sec) then
    raise exception 'Only the class''s teacher or the office sets its times.' using errcode = '42501';
  end if;
  delete from section_meetings where id = p_id;
end $$;

/**
 * A week of classes: a student's own (or, for a parent, their child's: `p_student`), or with no student a teacher's,
 * the classes they lead. Each meeting time with its class, teacher and room, by the time it starts.
 */
create function public.class_schedule(p_student uuid default null)
returns table (meeting_id uuid, section_id text, class_name text, teacher text, weekdays int[], start_time text, end_time text, room text)
language sql stable security definer set search_path = public as $$
  select sm.id, r.id, r.name, case when r.lead_id is not null then app.checkin_name(r.lead_id) end, sm.weekdays,
         to_char(sm.start_time, 'HH24:MI'), to_char(sm.end_time, 'HH24:MI'), sm.room
  from section_meetings sm join rosters r on r.id = sm.section_id and r.kind = 'section'
  where case
    when p_student is null then
      exists (select 1 from roster_members m where m.roster_id = r.id and m.profile_id = auth.uid()) or r.lead_id = auth.uid()
    else (p_student = auth.uid() or (app.is_guardian_of(p_student) and not app.is_family()))
      and exists (select 1 from roster_members m where m.roster_id = r.id and m.profile_id = p_student)
  end
  order by sm.start_time, r.name, sm.weekdays[1]
$$;

/**
 * The student's class going on now (`now`) and the next one, over the coming week's school days, for the Planner. No
 * School, In-Service and E-Learning days are skipped.
 */
create function public.my_next_classes()
returns table (day date, class_name text, teacher text, start_time text, end_time text, room text, now boolean)
language sql stable security definer set search_path = public as $$
  with clock as (select app.school_today() as today, (now() at time zone 'America/Chicago')::time as t)
  select d::date, s.class_name, s.teacher, s.start_time, s.end_time, s.room,
         d::date = c.today and s.start_time::time <= c.t
  from clock c, generate_series(c.today, c.today + 7, interval '1 day') d
  join public.class_schedule() s on extract(isodow from d)::int = any (s.weekdays)
  where not app.no_school(d::date) and (d::date > c.today or s.end_time::time > c.t)
  order by d, s.start_time
  limit 2
$$;

revoke all on function app.no_school(date), app.edits_class_times(text, uuid), app.sees_class_times(text, uuid) from public, anon;
grant execute on function app.no_school(date), app.edits_class_times(text, uuid), app.sees_class_times(text, uuid) to authenticated, service_role;
revoke all on function public.section_meeting_save(uuid, text, int[], time, time, text), public.section_meeting_delete(uuid),
  public.class_schedule(uuid), public.my_next_classes() from public, anon;
grant execute on function public.section_meeting_save(uuid, text, int[], time, time, text), public.section_meeting_delete(uuid),
  public.class_schedule(uuid), public.my_next_classes() to authenticated, service_role;
