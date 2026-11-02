-- The Student app's dashboard: each student's record from the school's student information system (FACTS,
-- Blackbaud and the like): general information, attendance, and each class's grade with every graded assignment.
--
-- The app keeps a read-only copy. A connector for the school's system (an Edge Function holding its API keys) maps what
-- it reads into one shape and hands it to sis_import (service role only), which matches each student to their profile
-- (the link made before, a profile id, or a unique name and birthday) and replaces that student's attendance, classes
-- and grades for the school year. Students it can't match are handed back, not guessed. Nothing is edited in the app.
--
-- Only the student and their parents read a record (app.reads_student_record; never Family accounts, substitutes or
-- other staff). student_record() gives the dashboard in one call: the students you can see, oldest first, and the
-- chosen one's (or the oldest's) information, attendance and classes; student_course() gives one class with all its
-- grades.

create table public.sis_students (
  student_id  uuid primary key references public.profiles (id) on delete cascade,
  sis_id      text not null unique check (char_length(sis_id) between 1 and 64),   -- the student's id in that system
  source      text not null check (source ~ '^[a-z][a-z0-9_]{0,31}$'),             -- 'facts', 'blackbaud', 'sample'
  school_year int not null,                                                         -- 2027 = 2026–27 (app.school_year_end)
  homeroom    text check (char_length(homeroom) <= 100),
  advisor     text check (char_length(advisor) <= 100),
  enrolled_on date,
  school_days int check (school_days between 0 and 366),   -- days the school has been in session this school year
  details     jsonb not null default '[]' check (jsonb_typeof(details) = 'array'),   -- anything else: [{label, value}]
  synced_at   timestamptz not null default now()
);

-- The school's grading terms (semesters or quarters), for each school year.
create table public.sis_terms (
  school_year int not null,
  name        text not null check (char_length(name) between 1 and 40),
  starts_on   date not null,
  ends_on     date not null,
  source      text not null,
  primary key (school_year, name),
  check (ends_on >= starts_on)
);

-- Days that weren't a plain day at school: absent, a half day, late, or left early.
create table public.sis_attendance (
  student_id uuid not null references public.sis_students (student_id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('absent', 'half_day', 'tardy', 'left_early')),
  excused    boolean not null default false,
  note       text check (char_length(note) <= 200),
  primary key (student_id, day, kind)
);

create table public.sis_courses (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.sis_students (student_id) on delete cascade,
  sis_id      text not null check (char_length(sis_id) between 1 and 64),
  school_year int not null,
  name        text not null check (char_length(name) between 1 and 100),
  subject     text check (char_length(subject) <= 40),         -- 'math', 'english'… (for its icon)
  teacher     text check (char_length(teacher) <= 100),
  average     numeric(5, 2) check (average between 0 and 200),  -- the system's current average, in percent
  letter      text check (char_length(letter) <= 4),
  categories  jsonb not null default '[]' check (jsonb_typeof(categories) = 'array'),   -- [{name, weight}], weights in percent
  position    int,
  unique (student_id, sis_id, school_year)
);

-- Each graded (or still to be graded) piece of work. Missing counts as zero; excused and not yet graded don't count.
create table public.sis_assignments (
  course_id uuid not null references public.sis_courses (id) on delete cascade,
  sis_id    text not null check (char_length(sis_id) between 1 and 64),
  title     text not null check (char_length(title) between 1 and 200),
  category  text check (char_length(category) <= 60),
  due_on    date not null,
  score     numeric(7, 2) check (score >= 0),
  max_score numeric(7, 2) check (max_score > 0),
  status    text not null default 'graded' check (status in ('graded', 'missing', 'excused', 'pending')),
  comment   text check (char_length(comment) <= 500),
  primary key (course_id, sis_id)
);

-- Letters for an average (the overall one; each class's comes from the system): the lowest percent for each.
insert into app.settings values ('grade_scale', '[{"letter":"A","min":90},{"letter":"B","min":80},{"letter":"C","min":70},{"letter":"D","min":60},{"letter":"F","min":0}]')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------
-- Who reads a record
-- ----------------------------------------------------------------------

/** The student themself, or one of their parents (app.is_guardian_of: never Family accounts). */
create function app.reads_student_record(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s = auth.uid() or app.is_guardian_of(s)
$$;

alter table public.sis_students enable row level security;
alter table public.sis_terms enable row level security;
alter table public.sis_attendance enable row level security;
alter table public.sis_courses enable row level security;
alter table public.sis_assignments enable row level security;
create policy "the student and their parents" on public.sis_students for select to authenticated using (app.reads_student_record(student_id));
create policy "everyone signed in" on public.sis_terms for select to authenticated using (true);
create policy "the student and their parents" on public.sis_attendance for select to authenticated using (app.reads_student_record(student_id));
create policy "the student and their parents" on public.sis_courses for select to authenticated using (app.reads_student_record(student_id));
create policy "the student and their parents" on public.sis_assignments for select to authenticated
  using (exists (select 1 from public.sis_courses c where c.id = course_id and app.reads_student_record(c.student_id)));

revoke all on public.sis_students, public.sis_terms, public.sis_attendance, public.sis_courses, public.sis_assignments from anon;
revoke insert, update, delete on public.sis_students, public.sis_terms, public.sis_attendance, public.sis_courses, public.sis_assignments from authenticated;
grant select on public.sis_students, public.sis_terms, public.sis_attendance, public.sis_courses, public.sis_assignments to authenticated;
grant all on public.sis_students, public.sis_terms, public.sis_attendance, public.sis_courses, public.sis_assignments to service_role;

-- ----------------------------------------------------------------------
-- Reads
-- ----------------------------------------------------------------------

/**
 * The dashboard: the students you can see (yourself, or your children), oldest first (by birthday, else by class),
 * and for p_student (or the oldest) the record from the school's system, if there is one: information, this school
 * year's attendance, the grading terms, each class with its average, letter and missing work, and the grade scale.
 */
create function public.student_record(p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who jsonb; pick uuid; st sis_students;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name, 'grade', p.grade,
           'gradeLabel', app.grade_label(p.grade), 'photoPath', p.avatar_url, 'birthday', d.birthday)
           order by coalesce(d.birthday, make_date(p.class_of - 18, 9, 1)) nulls last, p.first_name, p.id), '[]'::jsonb)
    into who
  from profiles p left join student_details d on d.student_id = p.id
  where p.school_role = 'student'
    and (p.id = auth.uid() or p.id in (select g.student_id from guardians g where g.guardian_id = auth.uid()))
    and app.reads_student_record(p.id);

  if p_student is not null and not app.reads_student_record(p_student) then
    raise exception 'You can only see your own or your children''s records.' using errcode = '42501';
  end if;
  pick := coalesce(p_student, (who->0->>'id')::uuid);
  select * into st from sis_students where student_id = pick;

  return jsonb_build_object(
    'students', who,
    'studentId', pick,
    'scale', coalesce(nullif(app.setting('grade_scale'), '')::jsonb, '[]'::jsonb),
    'record', case when st.student_id is null then null else jsonb_build_object(
      'sisId', st.sis_id, 'source', st.source, 'schoolYear', st.school_year, 'homeroom', st.homeroom, 'advisor', st.advisor,
      'enrolledOn', st.enrolled_on, 'schoolDays', st.school_days, 'details', st.details, 'syncedAt', st.synced_at,
      'birthday', (select birthday from student_details where student_id = pick),
      'terms', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'startsOn', t.starts_on, 'endsOn', t.ends_on) order by t.starts_on), '[]'::jsonb)
                from sis_terms t where t.school_year = st.school_year),
      'attendance', (select coalesce(jsonb_agg(jsonb_build_object('day', a.day, 'kind', a.kind, 'excused', a.excused, 'note', a.note)
                       order by a.day desc, a.kind), '[]'::jsonb)
                     from sis_attendance a where a.student_id = pick
                       and a.day between make_date(st.school_year - 1, 7, 1) and make_date(st.school_year, 6, 30)),
      'courses', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'subject', c.subject, 'teacher', c.teacher,
                    'average', c.average, 'letter', c.letter,
                    'missing', (select count(*) from sis_assignments x where x.course_id = c.id and x.status = 'missing'))
                    order by c.position nulls last, c.name), '[]'::jsonb)
                  from sis_courses c where c.student_id = pick and c.school_year = st.school_year)
    ) end);
end $$;

/** One class: its average, categories and every assignment, oldest first, with the year's grading terms. */
create function public.student_course(p_course uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c sis_courses;
begin
  select * into c from sis_courses where id = p_course;
  if c.id is null or not app.reads_student_record(c.student_id) then
    raise exception 'That class isn''t on your or your children''s records.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', c.id, 'studentId', c.student_id, 'name', c.name, 'subject', c.subject, 'teacher', c.teacher,
    'average', c.average, 'letter', c.letter, 'categories', c.categories, 'schoolYear', c.school_year,
    'scale', coalesce(nullif(app.setting('grade_scale'), '')::jsonb, '[]'::jsonb),
    'terms', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'startsOn', t.starts_on, 'endsOn', t.ends_on) order by t.starts_on), '[]'::jsonb)
              from sis_terms t where t.school_year = c.school_year),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.sis_id, 'title', a.title, 'category', a.category, 'dueOn', a.due_on,
                      'score', a.score, 'maxScore', a.max_score, 'status', a.status, 'comment', a.comment) order by a.due_on, a.title), '[]'::jsonb)
                    from sis_assignments a where a.course_id = c.id));
end $$;

-- ----------------------------------------------------------------------
-- Import (the connector, with the service role)
-- ----------------------------------------------------------------------

/** The profile a student from the school's system is: linked before, the profile id given, or a unique name and birthday. */
create function app.sis_match(s jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare hit uuid; n int;
begin
  select student_id into hit from sis_students where sis_id = s->>'sisId';
  if hit is not null then return hit; end if;
  if s->>'profileId' is not null then
    select id into hit from profiles where id = (s->>'profileId')::uuid and school_role = 'student';
    if hit is not null then return hit; end if;
  end if;
  if s->>'birthday' is null then return null; end if;
  select count(*), min(p.id::text)::uuid into n, hit
  from profiles p join student_details d on d.student_id = p.id
  where p.school_role = 'student' and d.birthday = (s->>'birthday')::date
    and app.norm_name(p.first_name) = app.norm_name(s->>'firstName') and app.norm_name(p.last_name) = app.norm_name(s->>'lastName');
  return case when n = 1 then hit end;
end $$;

/**
 * Service role only: a school year from the school's system, in one shape whatever the system:
 *   { source, schoolYear?, scale?: [{letter, min}], terms?: [{name, startsOn, endsOn}],
 *     students: [{ sisId, profileId?, firstName, lastName, birthday?, homeroom?, advisor?, enrolledOn?, schoolDays?,
 *                  details?: [{label, value}], attendance?: [{day, kind, excused?, note?}],
 *                  courses?: [{ sisId, name, subject?, teacher?, average?, letter?, categories?: [{name, weight}],
 *                               grades?: [{sisId, title, category?, dueOn, score?, maxScore?, status?, comment?}] }] }] }
 * Each matched student's attendance, classes and grades for that school year are replaced; the ones it can't match
 * come back in "unmatched".
 */
create function public.sis_import(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare src text := p->>'source'; yr int := coalesce((p->>'schoolYear')::int, app.school_year_end());
        s jsonb; c jsonb; who uuid; course uuid; done int := 0; missed jsonb := '[]'::jsonb; i int;
begin
  if src is null or src !~ '^[a-z][a-z0-9_]{0,31}$' then raise exception 'Say which system it comes from (source).'; end if;
  if p ? 'scale' then
    insert into app.settings values ('grade_scale', (p->'scale')::text) on conflict (key) do update set value = excluded.value;
  end if;
  if p ? 'terms' then
    delete from sis_terms where school_year = yr;
    insert into sis_terms (school_year, name, starts_on, ends_on, source)
      select yr, t->>'name', (t->>'startsOn')::date, (t->>'endsOn')::date, src from jsonb_array_elements(p->'terms') t;
  end if;

  for s in select * from jsonb_array_elements(coalesce(p->'students', '[]'::jsonb)) loop
    who := app.sis_match(s);
    if who is null then
      missed := missed || jsonb_build_object('sisId', s->>'sisId', 'name', trim(concat_ws(' ', s->>'firstName', s->>'lastName')));
      continue;
    end if;
    insert into sis_students (student_id, sis_id, source, school_year, homeroom, advisor, enrolled_on, school_days, details, synced_at)
    values (who, s->>'sisId', src, yr, s->>'homeroom', s->>'advisor', (s->>'enrolledOn')::date, (s->>'schoolDays')::int,
            coalesce(s->'details', '[]'::jsonb), now())
    on conflict (student_id) do update set sis_id = excluded.sis_id, source = excluded.source, school_year = excluded.school_year,
      homeroom = excluded.homeroom, advisor = excluded.advisor, enrolled_on = excluded.enrolled_on,
      school_days = excluded.school_days, details = excluded.details, synced_at = excluded.synced_at;

    delete from sis_attendance where student_id = who and day between make_date(yr - 1, 7, 1) and make_date(yr, 6, 30);
    insert into sis_attendance (student_id, day, kind, excused, note)
      select who, (a->>'day')::date, a->>'kind', coalesce((a->>'excused')::boolean, false), nullif(a->>'note', '')
      from jsonb_array_elements(coalesce(s->'attendance', '[]'::jsonb)) a
    on conflict do nothing;

    delete from sis_courses where student_id = who and school_year = yr
      and sis_id not in (select x->>'sisId' from jsonb_array_elements(coalesce(s->'courses', '[]'::jsonb)) x);
    i := 0;
    for c in select * from jsonb_array_elements(coalesce(s->'courses', '[]'::jsonb)) loop
      i := i + 1;
      insert into sis_courses (student_id, sis_id, school_year, name, subject, teacher, average, letter, categories, position)
      values (who, c->>'sisId', yr, c->>'name', c->>'subject', c->>'teacher', (c->>'average')::numeric, c->>'letter',
              coalesce(c->'categories', '[]'::jsonb), i)
      on conflict (student_id, sis_id, school_year) do update set name = excluded.name, subject = excluded.subject,
        teacher = excluded.teacher, average = excluded.average, letter = excluded.letter, categories = excluded.categories,
        position = excluded.position
      returning id into course;
      delete from sis_assignments where course_id = course;
      insert into sis_assignments (course_id, sis_id, title, category, due_on, score, max_score, status, comment)
        select course, g->>'sisId', g->>'title', g->>'category', (g->>'dueOn')::date, (g->>'score')::numeric, (g->>'maxScore')::numeric,
               coalesce(g->>'status', 'graded'), nullif(g->>'comment', '')
        from jsonb_array_elements(coalesce(c->'grades', '[]'::jsonb)) g;
    end loop;
    done := done + 1;
  end loop;
  return jsonb_build_object('students', done, 'unmatched', missed);
end $$;

revoke all on function app.reads_student_record(uuid) from public, anon;
grant execute on function app.reads_student_record(uuid) to authenticated, service_role;
revoke all on function app.sis_match(jsonb), public.sis_import(jsonb) from public, anon, authenticated;
grant execute on function app.sis_match(jsonb), public.sis_import(jsonb) to service_role;
revoke all on function public.student_record(uuid), public.student_course(uuid) from public, anon;
grant execute on function public.student_record(uuid), public.student_course(uuid) to authenticated, service_role;
