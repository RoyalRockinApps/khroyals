-- Missing work and grade alerts, from the student records the school's system sends (sis_import): work marked missing
-- this school year, and classes whose average is below the `grade_alert_below` setting (70% to start). The Student app
-- shows them at the top of a student's record and students see them on their Planner (`student_alerts`); the student
-- and their parents (never Family accounts) are told once about each newly missing piece of work, and once when a class
-- drops below the line (again only after it has come back up). An hourly job sends them (app.send_student_alerts).
-- Everything already missing or low when this arrives counts as told, so nobody gets a pile of old news.

insert into app.settings values ('grade_alert_below', '70') on conflict (key) do nothing;

/** What each student has been told about: a missing piece of work, or a class below the line (by the system's ids). */
create table public.sis_alerts_sent (
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('missing', 'low')),
  course_key text not null,          -- "<school year>:<course sis_id>"
  item_key   text not null default '',  -- the assignment's sis_id ('' for a low class)
  sent_at    timestamptz not null default now(),
  primary key (student_id, kind, course_key, item_key)
);
alter table public.sis_alerts_sent enable row level security;
revoke all on public.sis_alerts_sent from anon, authenticated;
grant all on public.sis_alerts_sent to service_role;

create function app.grade_alert_below() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(app.setting('grade_alert_below'), '')::numeric, 70)
$$;

/** This school year's missing work and classes below the line, for every student (or one). */
create function app.student_alert_items(s uuid default null)
returns table (student_id uuid, kind text, course_key text, item_key text, course text, title text, due_on date, average numeric, letter text)
language sql stable security definer set search_path = public as $$
  select c.student_id, 'missing', c.school_year || ':' || c.sis_id, a.sis_id, c.name, a.title, a.due_on, null::numeric, null::text
  from sis_courses c join sis_assignments a on a.course_id = c.id
  where a.status = 'missing' and c.school_year = app.school_year_end() and (s is null or c.student_id = s)
  union all
  select c.student_id, 'low', c.school_year || ':' || c.sis_id, '', c.name, null, null, c.average, c.letter
  from sis_courses c
  where c.average is not null and c.average < app.grade_alert_below() and c.school_year = app.school_year_end() and (s is null or c.student_id = s)
$$;

/**
 * For a student (or a parent's child, `p_student`): their missing work (most recent first) and the classes below the
 * line, with the line itself. Empty lists when there's nothing, or no record.
 */
create function public.student_alerts(p_student uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with who as (select coalesce(p_student, auth.uid()) as id)
  select case when app.reads_student_record((select id from who)) then jsonb_build_object(
    'below', app.grade_alert_below(),
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('course', i.course, 'title', i.title, 'dueOn', i.due_on) order by i.due_on desc, i.course), '[]')
                from app.student_alert_items((select id from who)) i where i.kind = 'missing'),
    'low', (select coalesce(jsonb_agg(jsonb_build_object('course', i.course, 'average', i.average, 'letter', i.letter) order by i.average, i.course), '[]')
            from app.student_alert_items((select id from who)) i where i.kind = 'low'))
  end
$$;

/** Tells students and their parents about new missing work and classes newly below the line. Returns how many. */
create function app.send_student_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare i record; n int := 0; first text; data jsonb;
begin
  -- A class back at or above the line can alert again if it drops later.
  delete from sis_alerts_sent t where t.kind = 'low'
    and not exists (select 1 from app.student_alert_items(t.student_id) x where x.kind = 'low' and x.course_key = t.course_key);
  for i in select x.* from app.student_alert_items() x
           where not exists (select 1 from sis_alerts_sent t where t.student_id = x.student_id and t.kind = x.kind
                             and t.course_key = x.course_key and t.item_key = x.item_key) loop
    insert into sis_alerts_sent (student_id, kind, course_key, item_key) values (i.student_id, i.kind, i.course_key, i.item_key);
    select first_name into first from profiles where id = i.student_id;
    data := jsonb_build_object('studentRecord', i.student_id);
    if i.kind = 'missing' then
      perform app.notify_user(i.student_id, '📌 Missing in ' || i.course || ': ' || i.title, 'It was due ' || to_char(i.due_on, 'Dy, Mon FMDD') || '.', data);
      perform app.notify_parents(i.student_id, '📌 ' || first || ': missing in ' || i.course, i.title || ', due ' || to_char(i.due_on, 'Dy, Mon FMDD') || '.', data);
    else
      perform app.notify_user(i.student_id, '📉 ' || i.course || ' is at ' || round(i.average) || '%', 'Below ' || round(app.grade_alert_below()) || '%. Ask your teacher how to bring it up.', data);
      perform app.notify_parents(i.student_id, '📉 ' || first || ': ' || i.course || ' is at ' || round(i.average) || '%',
        'Below ' || round(app.grade_alert_below()) || '%' || coalesce(' (' || i.letter || ')', '') || '.', data);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- What's missing or low already counts as told.
insert into sis_alerts_sent (student_id, kind, course_key, item_key)
select student_id, kind, course_key, item_key from app.student_alert_items() on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('student-alerts', '20 * * * *', 'select app.send_student_alerts()');
  end if;
end $$;

revoke all on function app.grade_alert_below(), app.student_alert_items(uuid), app.send_student_alerts() from public, anon, authenticated;
grant execute on function app.grade_alert_below(), app.student_alert_items(uuid) to authenticated, service_role;
grant execute on function app.send_student_alerts() to service_role;
revoke all on function public.student_alerts(uuid) from public, anon;
grant execute on function public.student_alerts(uuid) to authenticated, service_role;
