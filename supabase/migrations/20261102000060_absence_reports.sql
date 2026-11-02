-- Report an absence: a child's parent tells the school, from the app, that the child is out
-- (for a day or several), will be late, or leaves early, and why. The office (checkin.manage)
-- and the teachers of the child's class sections are told, and see it on the day's list and
-- on the class roll; the office marks it seen, and the parents hear back. Parents change their
-- mind with Cancel. Only parents (guardians, never Family accounts) report; dates from today on.
-- Reasons are listed in both src/absences/labels.ts and the check below.

create table public.absence_reports (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('absent', 'late', 'early')),
  starts_on   date not null,
  ends_on     date not null,
  at_time     time,            -- late: when they'll arrive; early: when they'll be picked up
  reason      text not null check (reason in ('sick', 'appointment', 'family', 'travel', 'other')),
  note        text not null default '' check (char_length(note) <= 500),
  reported_by uuid references public.profiles (id) on delete set null,
  status      text not null default 'reported' check (status in ('reported', 'cancelled')),
  seen_by     uuid references public.profiles (id) on delete set null,
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (kind = 'absent' or (ends_on = starts_on and at_time is not null))
);
create index on public.absence_reports (starts_on, ends_on);
create index on public.absence_reports (student_id, starts_on);

/** The office: who sees every report and marks it seen. */
create function app.office_team() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles
  where school_role is not null and (admin_tier is not null or cardinality(permissions) > 0)
    and 'checkin.manage' = any (app.permissions(id))
$$;

/** Who reads a child's reports: their parents, the teachers of their sections, and the office. */
create function app.reads_absences(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_guardian_of(s, u) or app.teaches(u, s) or app.has_permission('checkin.manage', u)
$$;

alter table public.absence_reports enable row level security;
create policy "the child's parents, teachers and the office" on public.absence_reports for select to authenticated
  using (app.reads_absences(student_id));
grant select on public.absence_reports to authenticated;
revoke insert, update, delete on public.absence_reports from anon, authenticated;
grant all on public.absence_reports to service_role;

create function app.absence_line(r public.absence_reports) returns text
language sql stable security definer set search_path = public as $$
  select trim((select first_name from profiles where id = r.student_id)) || ' · '
    || case r.kind when 'absent' then 'absent' when 'late' then 'arriving late' else 'leaving early' end
    || ' ' || case when r.ends_on > r.starts_on then to_char(r.starts_on, 'Dy Mon FMDD') || '–' || to_char(r.ends_on, 'Dy Mon FMDD')
                   when r.starts_on = app.school_today() then 'today'
                   when r.starts_on = app.school_today() + 1 then 'tomorrow'
                   else to_char(r.starts_on, 'Dy Mon FMDD') end
    || coalesce(case r.kind when 'late' then ', at ' when 'early' then ', at ' end || to_char(r.at_time, 'FMHH12:MI AM'), '')
    || ' (' || case r.reason when 'sick' then 'sick' when 'appointment' then 'appointment' when 'family' then 'family'
                             when 'travel' then 'travel' else 'other' end || ')'
$$;

/** A parent reports an absence, a late arrival or an early pickup. The office and the child's teachers are told. */
create function public.absence_report(p_student uuid, p_kind text, p_starts_on date, p_ends_on date default null,
  p_at time default null, p_reason text default 'sick', p_note text default '') returns public.absence_reports
language plpgsql security definer set search_path = public as $$
declare r absence_reports%rowtype; u uuid; line text;
begin
  if not app.is_guardian_of(p_student) or app.is_family() then
    raise exception 'Only a child''s parents report an absence.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('absent', 'late', 'early') then raise exception 'Choose absent, late or leaving early.'; end if;
  if p_reason is null or p_reason not in ('sick', 'appointment', 'family', 'travel', 'other') then raise exception 'Choose a reason.'; end if;
  if p_starts_on is null or p_starts_on < app.school_today() then raise exception 'Pick today or a day ahead.'; end if;
  if p_starts_on > app.school_today() + 90 then raise exception 'Report up to 90 days ahead.'; end if;
  if p_kind <> 'absent' and p_at is null then raise exception 'What time?'; end if;
  if coalesce(p_ends_on, p_starts_on) < p_starts_on then raise exception 'The last day can''t be before the first.'; end if;
  if coalesce(p_ends_on, p_starts_on) > p_starts_on + 30 then raise exception 'Report up to 30 days at once.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Keep the note to 500 characters.'; end if;
  insert into absence_reports (student_id, kind, starts_on, ends_on, at_time, reason, note, reported_by)
  values (p_student, p_kind, p_starts_on, case when p_kind = 'absent' then coalesce(p_ends_on, p_starts_on) else p_starts_on end,
          case when p_kind = 'absent' then null else p_at end, p_reason, trim(coalesce(p_note, '')), auth.uid())
  returning * into r;
  line := app.absence_line(r);
  for u in select app.office_team() union select app.teachers_of(p_student) loop
    if u <> auth.uid() then
      perform app.notify_user(u, '📝 ' || line, coalesce(nullif(r.note, ''), 'Reported by ' || app.checkin_name(auth.uid())),
        jsonb_build_object('absenceId', r.id));
    end if;
  end loop;
  return r;
end $$;

/** The parent who reported (or the child's other parent) calls it off; the office and teachers are told. */
create function public.absence_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r absence_reports%rowtype; u uuid;
begin
  select * into r from absence_reports where id = p_id;
  if not found or not app.is_guardian_of(r.student_id) or app.is_family() then raise exception 'That report isn''t yours to change.' using errcode = '42501'; end if;
  if r.status = 'cancelled' then return; end if;
  update absence_reports set status = 'cancelled' where id = p_id;
  for u in select app.office_team() union select app.teachers_of(r.student_id) loop
    if u <> auth.uid() then
      perform app.notify_user(u, '↩️ Called off: ' || app.absence_line(r), 'Reported by mistake, or plans changed.', jsonb_build_object('absenceId', r.id));
    end if;
  end loop;
end $$;

/** The office marks a report seen; the parents hear the school has it. */
create function public.absence_seen(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r absence_reports%rowtype;
begin
  perform app.require_permission('checkin.manage');
  update absence_reports set seen_by = auth.uid(), seen_at = now() where id = p_id and seen_at is null returning * into r;
  if not found then return; end if;
  perform app.notify_parents(r.student_id, '✅ The office got it', app.absence_line(r), jsonb_build_object('absenceId', r.id));
end $$;

/**
 * Reports the caller may see covering a day (or from it for `p_days`): the office sees all; teachers
 * their students'; parents their children's. Newest days first within each day by child name.
 */
create function public.absence_list(p_from date default null, p_days int default 1)
returns table (id uuid, student_id uuid, student text, grade int, kind text, starts_on date, ends_on date, at_time text,
               reason text, note text, status text, reported_by text, created_at timestamptz, seen_by text, seen_at timestamptz, classes text)
language sql stable security definer set search_path = public as $$
  select r.id, r.student_id, trim(p.first_name || ' ' || p.last_name), p.grade, r.kind, r.starts_on, r.ends_on, to_char(r.at_time, 'HH24:MI'),
         r.reason, r.note, r.status, app.checkin_name(r.reported_by), r.created_at,
         case when r.seen_by is not null then app.checkin_name(r.seen_by) end, r.seen_at,
         (select string_agg(ro.name, ', ' order by ro.name) from rosters ro join roster_members m on m.roster_id = ro.id
           where ro.kind = 'section' and m.profile_id = r.student_id)
  from absence_reports r join profiles p on p.id = r.student_id
  where app.reads_absences(r.student_id)
    and r.ends_on >= coalesce(p_from, app.school_today())
    and r.starts_on <= coalesce(p_from, app.school_today()) + greatest(coalesce(p_days, 1), 1) - 1
  order by r.starts_on, p.last_name, p.first_name, r.created_at
$$;

revoke all on function public.absence_report(uuid, text, date, date, time, text, text), public.absence_cancel(uuid),
  public.absence_seen(uuid), public.absence_list(date, int) from public, anon;
grant execute on function public.absence_report(uuid, text, date, date, time, text, text), public.absence_cancel(uuid),
  public.absence_seen(uuid), public.absence_list(date, int) to authenticated, service_role;

-- The class roll shows what the parents reported for the day.
create or replace function public.class_attendance_roll(p_section text, p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_day, app.school_today());
begin
  if not app.takes_roll(p_section) then
    raise exception 'Only the class''s teacher and the office can see its attendance.' using errcode = '42501';
  end if;
  if not app.keeps_roll(p_section) and d <> app.school_today() then raise exception 'Substitutes see today''s roll only.'; end if;
  return (select jsonb_build_object('id', r.id, 'name', r.name, 'teacher', case when r.lead_id is not null then app.checkin_name(r.lead_id) end,
      'day', d, 'canMark', d between app.school_today() - 14 and app.school_today(), 'otherDays', app.keeps_roll(r.id),
      'students', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
          'mark', a.status, 'markedBy', case when a.marked_by is not null then app.checkin_name(a.marked_by) end,
          'state', app.attendance_state(r.id, p.id, d), 'left', app.left_school(p.id, d),
          'reported', (select jsonb_build_object('kind', ar.kind, 'reason', ar.reason, 'at', to_char(ar.at_time, 'HH24:MI'), 'note', ar.note,
              'by', app.checkin_name(ar.reported_by))
            from absence_reports ar where ar.student_id = p.id and ar.status = 'reported' and d between ar.starts_on and ar.ends_on
            order by ar.created_at desc limit 1),
          'checks', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'at', c.at, 'reason', c.reason,
              'person', case when c.person_id is not null then app.checkin_name(c.person_id) end) order by c.at)
            from school_checks c where c.student_id = p.id and c.day = d), '[]'::jsonb))
          order by p.last_name, p.first_name)
        from app.section_students(r.id) s join profiles p on p.id = s
        left join class_attendance a on a.section_id = r.id and a.student_id = p.id and a.day = d), '[]'::jsonb))
    from rosters r where r.id = p_section);
end $$;
