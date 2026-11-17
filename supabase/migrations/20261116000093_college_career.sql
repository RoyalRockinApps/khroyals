-- College & Career (the College & Career app, app/college; students in 9th–12th grade): a checklist for each grade the
-- student checks off, the school's list of test dates (ACT, SAT, PSAT), scholarships and college events with their
-- deadlines, and transcript requests the counselor sends. The counselor holds the new College counseling permission
-- (college.manage; directors to start, who can give it to a counselor): they keep the dates and the checklist and send
-- the transcripts students ask for. Parents (never Family accounts) read their child's plan; only the student checks off
-- steps and asks for transcripts. A request tells the counselors, and a sent one tells the student and their parents.

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
    ('college.manage',   'College counseling',    'Keep the college test dates, scholarships and each grade''s checklist in College & Career, see every student''s plan, and send the transcripts students ask for.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('gallery.manage',   'Manage photo gallery',  'Change or remove any photo album or photo, not just your own.'),
    ('feedback.triage',  'Triage feedback',       'See every bug report and feature request sent from the app, set its status and priority, reply, and plan student workshops from them.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'college.manage'::text
where id = 'director' and not ('college.manage' = any (permissions));

/** Everyone holding a permission (an admin power), for telling them something. */
create function app.permission_holders(p text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles
  where school_role is not null and (admin_tier is not null or cardinality(permissions) > 0) and p = any (app.permissions(id))
$$;

/** A student College & Career is for: 9th–12th grade. */
create function app.college_student(s uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = s and school_role = 'student' and grade between 9 and 12)
$$;

/** Who reads a student's plan: the student, their parents (never Family accounts) and the counselors. */
create function app.reads_college_plan(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select s = u or (app.is_guardian_of(s, u) and not app.is_family(u)) or app.has_permission('college.manage', u)
$$;

create table public.college_dates (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('test', 'scholarship', 'event')),
  title       text not null check (char_length(trim(title)) between 1 and 120),
  day         date not null,                                -- the test, the scholarship's deadline, the event
  register_by date,                                         -- a test's registration deadline
  link        text check (link ~ '^https://' and char_length(link) <= 500),
  details     text not null default '' check (char_length(details) <= 1000),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on public.college_dates (day);

create table public.college_steps (
  id         uuid primary key default gen_random_uuid(),
  grade      int not null check (grade between 9 and 12),
  title      text not null check (char_length(trim(title)) between 1 and 120),
  details    text not null default '' check (char_length(details) <= 500),
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table public.college_steps_done (
  step_id    uuid not null references public.college_steps (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  done_at    timestamptz not null default now(),
  primary key (step_id, student_id)
);
create index on public.college_steps_done (student_id);

create table public.transcript_requests (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  send_to        text not null check (char_length(trim(send_to)) between 1 and 120),
  method         text not null check (method in ('portal', 'email', 'mail')),
  address        text not null default '' check (char_length(address) <= 300),
  needed_by      date,
  note           text not null default '' check (char_length(note) <= 500),
  status         text not null default 'requested' check (status in ('requested', 'sent', 'cancelled')),
  counselor_note text not null default '' check (char_length(counselor_note) <= 500),
  handled_by     uuid references public.profiles (id) on delete set null,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index on public.transcript_requests (student_id);
create index on public.transcript_requests (status, created_at);

alter table public.college_dates enable row level security;
alter table public.college_steps enable row level security;
alter table public.college_steps_done enable row level security;
alter table public.transcript_requests enable row level security;
create policy "everyone signed in" on public.college_dates for select to authenticated using (true);
create policy "everyone signed in" on public.college_steps for select to authenticated using (true);
create policy "the student, their parents and the counselors" on public.college_steps_done for select to authenticated using (app.reads_college_plan(student_id));
create policy "the student, their parents and the counselors" on public.transcript_requests for select to authenticated using (app.reads_college_plan(student_id));
grant select on public.college_dates, public.college_steps, public.college_steps_done, public.transcript_requests to authenticated;
revoke insert, update, delete on public.college_dates, public.college_steps, public.college_steps_done, public.transcript_requests from anon, authenticated;
grant all on public.college_dates, public.college_steps, public.college_steps_done, public.transcript_requests to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- The counselor keeps the dates and the checklist
-- ---------------------------------------------------------------------------------------------------------------

create function public.college_date_save(p_id uuid, p_kind text, p_title text, p_day date, p_register_by date default null,
  p_link text default null, p_details text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare did uuid; url text := nullif(trim(coalesce(p_link, '')), '');
begin
  perform app.require_permission('college.manage');
  if p_kind is null or p_kind not in ('test', 'scholarship', 'event') then raise exception 'Choose a test, a scholarship or an event.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Name it, like "ACT".'; end if;
  if p_day is null then raise exception 'Pick the day.'; end if;
  if p_register_by is not null and p_register_by > p_day then raise exception 'Registration closes before the test.'; end if;
  if url is not null and url !~ '^https://' then raise exception 'Links start with https://.'; end if;
  if p_id is null then
    insert into college_dates (kind, title, day, register_by, link, details, created_by)
    values (p_kind, trim(p_title), p_day, p_register_by, url, trim(coalesce(p_details, '')), auth.uid()) returning id into did;
  else
    update college_dates set kind = p_kind, title = trim(p_title), day = p_day, register_by = p_register_by, link = url,
      details = trim(coalesce(p_details, '')) where id = p_id returning id into did;
    if did is null then raise exception 'That date is gone.'; end if;
  end if;
  return did;
end $$;

create function public.college_date_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('college.manage');
  delete from college_dates where id = p_id;
end $$;

create function public.college_step_save(p_id uuid, p_grade int, p_title text, p_details text default '', p_position int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  perform app.require_permission('college.manage');
  if p_grade is null or p_grade not between 9 and 12 then raise exception 'Pick 9th to 12th grade.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Say what to do.'; end if;
  if p_id is null then
    insert into college_steps (grade, title, details, position)
    values (p_grade, trim(p_title), trim(coalesce(p_details, '')),
            coalesce(p_position, (select coalesce(max(position), 0) + 1 from college_steps where grade = p_grade)))
    returning id into sid;
  else
    update college_steps set grade = p_grade, title = trim(p_title), details = trim(coalesce(p_details, '')), position = coalesce(p_position, position)
    where id = p_id returning id into sid;
    if sid is null then raise exception 'That step is gone.'; end if;
  end if;
  return sid;
end $$;

create function public.college_step_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('college.manage');
  delete from college_steps where id = p_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- A student's plan
-- ---------------------------------------------------------------------------------------------------------------

/** A 9th–12th grader checks a step off (or back on). */
create function public.college_step_check(p_step uuid, p_done boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.college_student() then raise exception 'College & Career is for 9th to 12th graders.' using errcode = '42501'; end if;
  if not exists (select 1 from college_steps where id = p_step) then raise exception 'That step is gone.'; end if;
  if coalesce(p_done, true) then
    insert into college_steps_done (step_id, student_id) values (p_step, auth.uid()) on conflict do nothing;
  else
    delete from college_steps_done where step_id = p_step and student_id = auth.uid();
  end if;
end $$;

/**
 * A student's plan (theirs, or for a parent or counselor `p_student`): who they are, every grade's steps with when
 * they checked each off, and their transcript requests (newest first). Null for anyone else.
 */
create function public.college_plan(p_student uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with who as (select coalesce(p_student, auth.uid()) as id)
  select case when app.reads_college_plan(w.id) then jsonb_build_object(
    'student', (select jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'firstName', p.first_name, 'grade', p.grade)
                from profiles p where p.id = w.id),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'grade', s.grade, 'title', s.title, 'details', s.details,
                'doneAt', d.done_at) order by s.grade, s.position, s.created_at), '[]')
              from college_steps s left join college_steps_done d on d.step_id = s.id and d.student_id = w.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'sendTo', r.send_to, 'method', r.method, 'address', r.address,
                   'neededBy', r.needed_by, 'note', r.note, 'status', r.status, 'counselorNote', r.counselor_note, 'handledAt', r.handled_at,
                   'createdAt', r.created_at) order by r.created_at desc), '[]')
                 from transcript_requests r where r.student_id = w.id))
  end
  from who w
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Transcript requests
-- ---------------------------------------------------------------------------------------------------------------

/** A 9th–12th grader asks for a transcript to go somewhere; the counselors are told. */
create function public.transcript_request(p_send_to text, p_method text, p_address text default '', p_needed_by date default null,
  p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare r transcript_requests%rowtype; u uuid;
begin
  if not app.college_student() then raise exception 'Transcript requests are for 9th to 12th graders.' using errcode = '42501'; end if;
  if coalesce(trim(p_send_to), '') = '' then raise exception 'Say where it goes, like the college''s name.'; end if;
  if p_method is null or p_method not in ('portal', 'email', 'mail') then raise exception 'Choose how it''s sent.'; end if;
  if p_method in ('email', 'mail') and coalesce(trim(p_address), '') = '' then
    raise exception 'Add the % to send it to.', case when p_method = 'email' then 'email address' else 'mailing address' end;
  end if;
  if p_needed_by is not null and p_needed_by < app.school_today() then raise exception 'Pick today or a day coming up.'; end if;
  if (select count(*) from transcript_requests where student_id = auth.uid() and status = 'requested') >= 20 then
    raise exception 'You have 20 requests waiting. Wait for some to be sent first.';
  end if;
  insert into transcript_requests (student_id, send_to, method, address, needed_by, note)
  values (auth.uid(), trim(p_send_to), p_method, trim(coalesce(p_address, '')), p_needed_by, trim(coalesce(p_note, '')))
  returning * into r;
  for u in select app.permission_holders('college.manage') loop
    perform app.notify_user(u, '📄 Transcript request: ' || app.checkin_name(auth.uid()), 'To ' || r.send_to
      || coalesce(', needed by ' || to_char(r.needed_by, 'Dy, Mon FMDD'), '') || '.', jsonb_build_object('transcriptRequestId', r.id, 'counsel', true));
  end loop;
  return r.id;
end $$;

/** The student calls off a request the counselor hasn't sent yet. */
create function public.transcript_request_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update transcript_requests set status = 'cancelled' where id = p_id and student_id = auth.uid() and status = 'requested';
  if not found then raise exception 'Only a waiting request of yours can be called off.'; end if;
end $$;

/** A counselor marks a request sent (with an optional note); the student and their parents are told. */
create function public.transcript_request_sent(p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r transcript_requests%rowtype; first text;
begin
  perform app.require_permission('college.manage');
  update transcript_requests set status = 'sent', counselor_note = trim(coalesce(p_note, '')), handled_by = auth.uid(), handled_at = now()
  where id = p_id and status = 'requested' returning * into r;
  if r.id is null then raise exception 'That request isn''t waiting to be sent.'; end if;
  select first_name into first from profiles where id = r.student_id;
  perform app.notify_user(r.student_id, '📄 Your transcript went to ' || r.send_to, coalesce(nullif(r.counselor_note, ''), 'Sent by the school.'),
    jsonb_build_object('transcriptRequestId', r.id));
  perform app.notify_parents(r.student_id, '📄 ' || first || '''s transcript went to ' || r.send_to, coalesce(nullif(r.counselor_note, ''), 'Sent by the school.'),
    jsonb_build_object('transcriptRequestId', r.id));
end $$;

/** For the counselors: every request, waiting ones first (soonest needed), then the last 60 days' sent and called off. */
create function public.transcript_requests_all() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('college.manage');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'studentId', r.student_id,
      'student', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade, 'sendTo', r.send_to, 'method', r.method, 'address', r.address,
      'neededBy', r.needed_by, 'note', r.note, 'status', r.status, 'counselorNote', r.counselor_note, 'handledAt', r.handled_at,
      'createdAt', r.created_at)
      order by (r.status = 'requested') desc, r.needed_by nulls last, r.created_at), '[]')
    from transcript_requests r join profiles p on p.id = r.student_id
    where r.status = 'requested' or r.created_at > now() - interval '60 days');
end $$;

/** For the counselors: the 9th–12th graders, to open a student's plan. */
create function public.college_students() returns table (id uuid, name text, grade int, done int, waiting int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('college.manage');
  return query
    select p.id, trim(p.first_name || ' ' || p.last_name), p.grade,
           (select count(*)::int from college_steps_done d where d.student_id = p.id),
           (select count(*)::int from transcript_requests r where r.student_id = p.id and r.status = 'requested')
    from profiles p where p.school_role = 'student' and p.grade between 9 and 12
    order by p.grade desc, p.last_name, p.first_name;
end $$;

-- A starting checklist for each grade; the counselor changes it to the school's own.
insert into public.college_steps (grade, title, details, position) values
  (9, 'Meet your counselor', 'Talk about the classes you want to take in high school and what you might like to do after.', 1),
  (9, 'Plan your four years of classes', 'Map out the core classes colleges look for, and room for electives you enjoy.', 2),
  (9, 'Join a club, team or activity', 'Try something new; colleges like to see what you stick with.', 3),
  (9, 'Start a list of activities and awards', 'Write down activities, service, jobs and awards as they happen. It makes applications easier later.', 4),
  (10, 'Take the PSAT 10 or PreACT', 'Practice for the real tests and see where to grow.', 1),
  (10, 'Explore careers you''re curious about', 'Talk with people who do jobs you find interesting, or shadow one for a day.', 2),
  (10, 'Keep your grades strong', 'Colleges look at every year of high school.', 3),
  (11, 'Take the PSAT/NMSQT in October', 'It''s the National Merit Scholarship qualifying test.', 1),
  (11, 'Take the ACT or SAT this spring', 'Leave time to take it again in the fall if you want a higher score.', 2),
  (11, 'Visit colleges', 'Go in person or take virtual tours. Write down what you like about each.', 3),
  (11, 'Build your college list', 'A mix of reach, match and likely schools.', 4),
  (11, 'Ask two teachers for recommendation letters', 'Ask in the spring, so they have time over the summer.', 5),
  (12, 'Finish your college list and deadlines', 'Write down every school''s deadline: early action, early decision and regular.', 1),
  (12, 'Request your transcripts', 'Ask for them in the app, at least two weeks before each deadline.', 2),
  (12, 'Fill out the FAFSA', 'It opens October 1. Many colleges and scholarships use it.', 3),
  (12, 'Apply for scholarships', 'Check the scholarship list in College & Career often.', 4),
  (12, 'Send your final transcript', 'After graduation, to the college you choose.', 5);

revoke all on function app.permission_holders(text), app.college_student(uuid), app.reads_college_plan(uuid, uuid) from public, anon;
grant execute on function app.permission_holders(text), app.college_student(uuid), app.reads_college_plan(uuid, uuid) to authenticated, service_role;
revoke all on function public.college_date_save(uuid, text, text, date, date, text, text), public.college_date_delete(uuid),
  public.college_step_save(uuid, int, text, text, int), public.college_step_delete(uuid), public.college_step_check(uuid, boolean),
  public.college_plan(uuid), public.transcript_request(text, text, text, date, text), public.transcript_request_cancel(uuid),
  public.transcript_request_sent(uuid, text), public.transcript_requests_all(), public.college_students() from public, anon;
grant execute on function public.college_date_save(uuid, text, text, date, date, text, text), public.college_date_delete(uuid),
  public.college_step_save(uuid, int, text, text, int), public.college_step_delete(uuid), public.college_step_check(uuid, boolean),
  public.college_plan(uuid), public.transcript_request(text, text, text, date, text), public.transcript_request_cancel(uuid),
  public.transcript_request_sent(uuid, text), public.transcript_requests_all(), public.college_students() to authenticated, service_role;
