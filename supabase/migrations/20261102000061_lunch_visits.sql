-- Lunch visits: parents and approved family (grandparents too) ask to come eat lunch with their
-- child. The office (lunch.manage: directors, administrators, office) sets when visits are open:
-- lunch windows by weekday, time and grades, each with how many visitors it takes a day, plus
-- closed days and the lunch rules. A visit is booked if there's room on a day the school is open;
-- before booking, the visitor reads the allergy notes for that lunch (the child's own, and the
-- allergies in those grades, never with names) and the rules, and says so. Teachers and staff see
-- the day's visitors with each child's allergies; the child's teachers are told when one is booked.

create or replace function public.permission_catalog() returns table (key text, label text, description text)
language sql immutable as $$
  values
    ('admins.manage',    'Manage admins',         'Make or remove admins, set tiers and grant permissions (director only).'),
    ('people.view',      'View people',           'See everyone''s contact email in the admin portal.'),
    ('people.approve',   'Approve sign-ups',      'Approve new accounts as parents, students or family.'),
    ('people.roles',     'Change roles',          'Set anyone''s school role, including teachers, staff and substitutes.'),
    ('people.family',    'Families & rosters',    'Link parents and family to students, set grades, manage classes, class/team rosters and car line duty.'),
    ('groups.manage',    'Manage all groups',     'Act as owner of every group: settings, members, moderation.'),
    ('calendar.school',  'School calendar',       'Add, change and remove school-wide calendar events.'),
    ('push.send',        'Send notifications',    'Send push notifications to everyone, a role or any group.'),
    ('checkin.manage',   'Check in & out',        'Check students in when they arrive late and out when they leave early (only to someone on their pickup list), see the day''s check-ins, and run any event check-out list.'),
    ('lunch.manage',     'Lunch visits',          'Set when families may come eat lunch with their children (days, times, grades, how many), close days, write the lunch rules, and cancel a visit.'),
    ('subs.manage',      'Schedule substitutes',  'Schedule a substitute for any class, with the days, hours and sub plans, and change or cancel any sub day.'),
    ('alerts.map',       'Alert map',             'Keep the map of the school''s Wi-Fi access points (which room or area each one is in) that shows critical alert senders where people answered from.'),
    ('alerts.send',      'Send critical alerts',  'Send critical alerts (severe weather, an active threat, a dangerous situation) to every teacher and staff member, see who''s safe, and give the all clear.'),
    ('questions.manage', 'Route questions',       'See every question sent to the school, assign it to faculty or staff, and answer it.'),
    ('messages.review',  'Student messages',      'Read every Ask the Teacher conversation between students and teachers, for safety.'),
    ('sports.manage',    'Manage activities',     'Add activities (sports, theater, music, art, clubs) and seasons, set schedules, assign coaches and directors, and approve sign-ups.'),
    ('forms.send',       'Send forms',            'Send forms (permission slips, releases, acknowledgments) to any class, activity, grade or the whole school, and see every form''s signatures.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('gallery.manage',   'Manage photo gallery',  'Change or remove any photo album or photo, not just your own.'),
    ('feedback.triage',  'Triage feedback',       'See every bug report and feature request sent from the app, set its status and priority, reply, and plan student workshops from them.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'lunch.manage'::text
where id in ('director', 'administrator', 'office') and not ('lunch.manage' = any (permissions));

insert into app.settings values ('lunch_rules',
  'Check in at the front office when you arrive, with your ID. Bring lunch for your child and you only, and please no nuts: some students have serious food allergies. Visits are about 30 minutes.')
on conflict (key) do nothing;

create table public.lunch_windows (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 60),   -- "K–2nd lunch"
  weekdays   int[] not null check (cardinality(weekdays) between 1 and 5 and weekdays <@ array[1, 2, 3, 4, 5]),  -- 1 Monday … 5 Friday
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  grade_from int not null check (grade_from between -3 and 12),
  grade_to   int not null check (grade_to between -3 and 12),
  capacity   int not null check (capacity between 1 and 200),   -- visitors a day, guests included
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (grade_to >= grade_from)
);

create table public.lunch_closed_days (
  day    date primary key,
  reason text not null default '' check (char_length(reason) <= 120)
);

create table public.lunch_visits (
  id             uuid primary key default gen_random_uuid(),
  window_id      uuid not null references public.lunch_windows (id) on delete cascade,
  day            date not null,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  visitor_id     uuid not null references public.profiles (id) on delete cascade,
  guests         int not null default 0 check (guests between 0 and 3),
  note           text not null default '' check (char_length(note) <= 300),
  allergy_ack_at timestamptz not null,
  status         text not null default 'booked' check (status in ('booked', 'cancelled')),
  cancelled_by   uuid references public.profiles (id) on delete set null,
  cancel_reason  text not null default '' check (char_length(cancel_reason) <= 200),
  created_at     timestamptz not null default now()
);
create unique index lunch_one_visit on public.lunch_visits (window_id, day, student_id, visitor_id) where status = 'booked';
create index on public.lunch_visits (day);

/** The children someone may visit at lunch: their own (parents) and the ones the office linked (family). */
create function app.lunch_kids(u uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select student_id from guardians where guardian_id = u and app.school_role(u) is not null
  union
  select student_id from family_pickups where family_id = u and app.school_role(u) is not null
$$;

/** No visits that day: a closed day, a weekend, or no school on the school calendar. */
create function app.lunch_closed(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d) > 5
      or exists (select 1 from lunch_closed_days where day = d)
      or exists (select 1 from events where group_id is null and category in ('No School', 'Teacher In-Service', 'E-Learning')
                 and d between starts_on and coalesce(ends_on, starts_on))
$$;

/** Visitors already booked for a window on a day (each visit counts its visitor and guests). */
create function app.lunch_taken(w uuid, d date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(1 + guests), 0)::int from lunch_visits where window_id = w and day = d and status = 'booked'
$$;

alter table public.lunch_windows enable row level security;
alter table public.lunch_closed_days enable row level security;
alter table public.lunch_visits enable row level security;
create policy "approved accounts" on public.lunch_windows for select to authenticated using (app.school_role() is not null);
create policy "approved accounts" on public.lunch_closed_days for select to authenticated using (app.school_role() is not null);
create policy "the visitor, staff, and the child's parents" on public.lunch_visits for select to authenticated
  using (visitor_id = auth.uid() or app.is_staff() or app.is_guardian_of(student_id));
grant select on public.lunch_windows, public.lunch_closed_days, public.lunch_visits to authenticated;
revoke insert, update, delete on public.lunch_windows, public.lunch_closed_days, public.lunch_visits from anon, authenticated;
grant all on public.lunch_windows, public.lunch_closed_days, public.lunch_visits to service_role;

-- ----------------------------------------------------------------------
-- The office sets it up
-- ----------------------------------------------------------------------

create function public.lunch_window_save(p_id uuid, p_name text, p_weekdays int[], p_start time, p_end time,
  p_grade_from int, p_grade_to int, p_capacity int, p_active boolean default true) returns public.lunch_windows
language plpgsql security definer set search_path = public as $$
declare row lunch_windows%rowtype;
begin
  perform app.require_permission('lunch.manage');
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the lunch, like "K–2nd lunch".'; end if;
  if p_weekdays is null or cardinality(p_weekdays) = 0 or not (p_weekdays <@ array[1, 2, 3, 4, 5]) then raise exception 'Pick the weekdays.'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'The lunch ends after it starts.'; end if;
  if p_grade_from is null or p_grade_to is null or p_grade_to < p_grade_from then raise exception 'Pick the grades.'; end if;
  if p_capacity is null or p_capacity not between 1 and 200 then raise exception 'How many visitors a day (1–200)?'; end if;
  if p_id is null then
    insert into lunch_windows (name, weekdays, start_time, end_time, grade_from, grade_to, capacity, active)
    values (trim(p_name), (select array_agg(distinct x order by x) from unnest(p_weekdays) x), p_start, p_end, p_grade_from, p_grade_to, p_capacity, coalesce(p_active, true))
    returning * into row;
  else
    update lunch_windows set name = trim(p_name), weekdays = (select array_agg(distinct x order by x) from unnest(p_weekdays) x),
      start_time = p_start, end_time = p_end, grade_from = p_grade_from, grade_to = p_grade_to, capacity = p_capacity, active = coalesce(p_active, true)
    where id = p_id returning * into row;
    if not found then raise exception 'That lunch is gone.'; end if;
  end if;
  return row;
end $$;

/** Remove a lunch window; visits already booked in it are cancelled and their visitors told. */
create function public.lunch_window_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  perform app.require_permission('lunch.manage');
  for v in select lv.id from lunch_visits lv where lv.window_id = p_id and lv.status = 'booked' and lv.day >= app.school_today() loop
    perform public.lunch_visit_cancel(v.id, 'That lunch time is no longer offered.');
  end loop;
  delete from lunch_windows where id = p_id;
end $$;

/** Close a day to visits (or open it again, `p_closed` false); visits that day are cancelled and their visitors told. */
create function public.lunch_close_day(p_day date, p_closed boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  perform app.require_permission('lunch.manage');
  if not p_closed then delete from lunch_closed_days where day = p_day; return; end if;
  insert into lunch_closed_days (day, reason) values (p_day, left(trim(coalesce(p_reason, '')), 120))
  on conflict (day) do update set reason = excluded.reason;
  for v in select id from lunch_visits where day = p_day and status = 'booked' loop
    perform public.lunch_visit_cancel(v.id, coalesce(nullif(trim(p_reason), ''), 'Lunch visits are closed that day.'));
  end loop;
end $$;

create function public.lunch_set_rules(p_rules text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('lunch.manage');
  if char_length(coalesce(p_rules, '')) > 2000 then raise exception 'Keep the rules to 2000 characters.'; end if;
  update app.settings set value = trim(coalesce(p_rules, '')) where key = 'lunch_rules';
end $$;

/** The lunch rules everyone reads before booking. */
create function public.lunch_rules() returns text
language sql stable security definer set search_path = public as $$ select coalesce(app.setting('lunch_rules'), '') $$;

-- ----------------------------------------------------------------------
-- Families book
-- ----------------------------------------------------------------------

/**
 * Open lunch times for one of the caller's children, from `p_from` for `p_days` days: each day and
 * window for the child's grade, with spots left and the caller's visit if they have one.
 */
create function public.lunch_slots(p_student uuid, p_from date default null, p_days int default 21)
returns table (day date, window_id uuid, name text, start_time text, end_time text, spots_left int, my_visit uuid)
language sql stable security definer set search_path = public as $$
  select d::date, w.id, w.name, to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI'),
         greatest(w.capacity - app.lunch_taken(w.id, d::date), 0),
         (select v.id from lunch_visits v where v.window_id = w.id and v.day = d::date and v.student_id = p_student
            and v.visitor_id = auth.uid() and v.status = 'booked')
  from generate_series(coalesce(p_from, app.school_today()), coalesce(p_from, app.school_today()) + least(greatest(coalesce(p_days, 21), 1), 60) - 1, interval '1 day') d
  join lunch_windows w on w.active and extract(isodow from d)::int = any (w.weekdays)
  join profiles p on p.id = p_student and p.grade between w.grade_from and w.grade_to
  where p_student in (select app.lunch_kids()) and not app.lunch_closed(d::date)
    and (d::date > app.school_today() or (d::date = app.school_today() and (now() at time zone 'America/Chicago')::time < w.start_time))
  order by 1, w.start_time
$$;

/**
 * What a visitor must know about allergies before a lunch: the child's own (parents only; it's
 * their child's record) and the allergies among students in that lunch's grades, without names.
 */
create function public.lunch_allergy_notes(p_window uuid, p_student uuid)
returns table (own text, others text[])
language sql stable security definer set search_path = public as $$
  select case when app.is_guardian_of(p_student) or app.is_staff() then nullif(trim((select allergies from student_details where student_id = p_student)), '') end,
         coalesce((select array_agg(distinct trim(d.allergies) order by trim(d.allergies))
           from student_details d join profiles p on p.id = d.student_id join lunch_windows w on w.id = p_window
           where p.school_role = 'student' and p.grade between w.grade_from and w.grade_to and trim(d.allergies) <> ''), '{}')
  where p_student in (select app.lunch_kids()) or app.is_staff()
$$;

/** Book a lunch visit (visitor plus up to 3 guests) after reading the allergy notes and rules (`p_read_allergies`). */
create function public.lunch_visit_book(p_window uuid, p_day date, p_student uuid, p_guests int default 0, p_note text default '',
  p_read_allergies boolean default false) returns public.lunch_visits
language plpgsql security definer set search_path = public as $$
declare w lunch_windows%rowtype; g int; r lunch_visits%rowtype; t uuid; kid text;
begin
  if p_student is null or p_student not in (select app.lunch_kids()) then
    raise exception 'Only a child''s parents and the family the school linked can visit at lunch.' using errcode = '42501';
  end if;
  if not coalesce(p_read_allergies, false) then raise exception 'Read the allergy notes and lunch rules first.'; end if;
  select * into w from lunch_windows where id = p_window and active for share;
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

/** The visitor calls it off, or lunch.manage cancels it with a reason (the visitor is told). */
create function public.lunch_visit_cancel(p_id uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v lunch_visits%rowtype; w lunch_windows%rowtype; mine boolean; t uuid;
begin
  select * into v from lunch_visits where id = p_id;
  if not found or v.status = 'cancelled' then return; end if;
  mine := v.visitor_id = auth.uid();
  if not mine then perform app.require_permission('lunch.manage'); end if;
  update lunch_visits set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = left(trim(coalesce(p_reason, '')), 200) where id = p_id;
  select * into w from lunch_windows where id = v.window_id;
  if not mine then
    perform app.notify_user(v.visitor_id, '🍎 Lunch visit cancelled',
      to_char(v.day, 'Dy Mon FMDD') || ', ' || w.name || coalesce(': ' || nullif(trim(p_reason), ''), ''), jsonb_build_object('lunchVisitId', v.id));
  else
    for t in select app.teachers_of(v.student_id) loop
      perform app.notify_user(t, '🍎 Lunch visit called off', app.short_name(auth.uid()) || ' isn''t coming ' || to_char(v.day, 'Dy Mon FMDD') || ' after all.',
        jsonb_build_object('lunchVisitId', v.id));
    end loop;
  end if;
end $$;

-- ----------------------------------------------------------------------
-- Who's coming
-- ----------------------------------------------------------------------

/** Teachers and staff: the day's visitors, by lunch, with each child's allergies. */
create function public.lunch_visitors(p_day date default null)
returns table (id uuid, window_name text, start_time text, end_time text, visitor text, relation text, student text, grade int,
               classes text, guests int, note text, allergies text, status text, cancel_reason text, booked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, w.name, to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI'), app.checkin_name(v.visitor_id),
         case when exists (select 1 from guardians g where g.guardian_id = v.visitor_id and g.student_id = v.student_id)
              then coalesce((select relation from guardians g where g.guardian_id = v.visitor_id and g.student_id = v.student_id), 'parent')
              else 'family' end,
         trim(p.first_name || ' ' || p.last_name), p.grade,
         (select string_agg(ro.name, ', ' order by ro.name) from rosters ro join roster_members m on m.roster_id = ro.id
           where ro.kind = 'section' and m.profile_id = v.student_id),
         v.guests, v.note, nullif(trim((select allergies from student_details where student_id = v.student_id)), ''),
         v.status, v.cancel_reason, v.created_at
  from lunch_visits v join lunch_windows w on w.id = v.window_id join profiles p on p.id = v.student_id
  where app.is_staff() and v.day = coalesce(p_day, app.school_today())
  order by w.start_time, v.status, p.last_name, p.first_name
$$;

/** The caller's own visits from today on (and their children's, booked by family). */
create function public.my_lunch_visits()
returns table (id uuid, day date, window_name text, start_time text, end_time text, student text, visitor text, guests int,
               note text, status text, cancel_reason text, mine boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.day, w.name, to_char(w.start_time, 'HH24:MI'), to_char(w.end_time, 'HH24:MI'),
         (select first_name from profiles where id = v.student_id), app.checkin_name(v.visitor_id), v.guests, v.note, v.status,
         v.cancel_reason, v.visitor_id = auth.uid()
  from lunch_visits v join lunch_windows w on w.id = v.window_id
  where v.day >= app.school_today() and (v.visitor_id = auth.uid() or app.is_guardian_of(v.student_id))
  order by v.day, w.start_time
$$;

/** The children the caller may visit at lunch, with their grades. */
create function public.lunch_my_kids() returns table (id uuid, first_name text, last_name text, grade int)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.grade from profiles p where p.id in (select app.lunch_kids()) order by p.grade, p.first_name
$$;
revoke all on function public.lunch_my_kids() from public, anon;
grant execute on function public.lunch_my_kids() to authenticated, service_role;

revoke all on function public.lunch_window_save(uuid, text, int[], time, time, int, int, int, boolean), public.lunch_window_delete(uuid),
  public.lunch_close_day(date, boolean, text), public.lunch_set_rules(text), public.lunch_rules(), public.lunch_slots(uuid, date, int),
  public.lunch_allergy_notes(uuid, uuid), public.lunch_visit_book(uuid, date, uuid, int, text, boolean), public.lunch_visit_cancel(uuid, text),
  public.lunch_visitors(date), public.my_lunch_visits() from public, anon;
grant execute on function public.lunch_window_save(uuid, text, int[], time, time, int, int, int, boolean), public.lunch_window_delete(uuid),
  public.lunch_close_day(date, boolean, text), public.lunch_set_rules(text), public.lunch_rules(), public.lunch_slots(uuid, date, int),
  public.lunch_allergy_notes(uuid, uuid), public.lunch_visit_book(uuid, date, uuid, int, text, boolean), public.lunch_visit_cancel(uuid, text),
  public.lunch_visitors(date), public.my_lunch_visits() to authenticated, service_role;
