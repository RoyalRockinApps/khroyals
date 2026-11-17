-- Tell Someone (the Tell Someone app, app/safety; every student): a student tells the school about bullying, someone who
-- might hurt themselves or others, or something unsafe, with what happened, where, when and who, and chooses whether to
-- include their name. Reports go to the holders of the new Safety reports permission (safety.reports; directors to
-- start, who can give it to a counselor), who are told at once (without the details), mark it seen (the student is
-- told) and close it with a note only they see. When the name is left off, the readers never see who sent it; the
-- database still keeps it (never shown, only so a student can follow their own reports and can't send more than 10 a
-- day). The app always says: if someone is in danger now, tell a teacher or call 911 (or 988).

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
    ('safety.reports',   'Safety reports',        'Read what students report in Tell Someone (bullying, someone who might be hurt, something unsafe), mark each seen and close it. A student may leave their name off.'),
    ('people.delete',    'Delete accounts',       'Permanently delete someone''s account, with their posts and comments. Deleting an admin also needs Manage admins.'),
    ('gallery.manage',   'Manage photo gallery',  'Change or remove any photo album or photo, not just your own.'),
    ('feedback.triage',  'Triage feedback',       'See every bug report and feature request sent from the app, set its status and priority, reply, and plan student workshops from them.'),
    ('audit.view',       'Activity log',          'Review the school-wide activity log.')
$$;

update public.admin_roles set permissions = permissions || 'safety.reports'::text
where id = 'director' and not ('safety.reports' = any (permissions));

create table public.safety_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,   -- never shown when `named` is false
  named       boolean not null default true,
  kind        text not null check (kind in ('bullying', 'self_harm', 'harm_others', 'unsafe', 'other')),
  what        text not null check (char_length(trim(what)) between 1 and 2000),
  place       text not null default '' check (char_length(place) <= 200),
  happened    text not null default '' check (char_length(happened) <= 120),   -- when, in the student's words
  people      text not null default '' check (char_length(people) <= 300),
  status      text not null default 'new' check (status in ('new', 'seen', 'closed')),
  staff_note  text not null default '' check (char_length(staff_note) <= 2000),
  seen_by     uuid references public.profiles (id) on delete set null,
  seen_at     timestamptz,
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.safety_reports (status, created_at);
create index on public.safety_reports (reporter_id);

-- Only through the functions below: the reporter column must never reach a reader when the name is left off.
alter table public.safety_reports enable row level security;
revoke all on public.safety_reports from anon, authenticated;
grant all on public.safety_reports to service_role;

/** Kinds that may mean someone is in danger. */
create function app.safety_urgent(kind text) returns boolean
language sql immutable as $$ select kind in ('self_harm', 'harm_others') $$;

/** A student tells the school; the readers are told at once (only that there's a report, never what it says). */
create function public.safety_report(p_kind text, p_what text, p_place text default '', p_when text default '', p_people text default '',
  p_named boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; u uuid;
begin
  if app.school_role() is distinct from 'student' then raise exception 'Tell Someone is for students.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('bullying', 'self_harm', 'harm_others', 'unsafe', 'other') then raise exception 'Choose what it''s about.'; end if;
  if coalesce(trim(p_what), '') = '' then raise exception 'Tell us what happened.'; end if;
  if char_length(trim(p_what)) > 2000 then raise exception 'Keep it to 2,000 characters.'; end if;
  if (select count(*) from safety_reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent 10 reports today. If someone is in danger, tell a teacher now or call 911.';
  end if;
  insert into safety_reports (reporter_id, named, kind, what, place, happened, people)
  values (auth.uid(), coalesce(p_named, true), p_kind, trim(p_what), left(trim(coalesce(p_place, '')), 200), left(trim(coalesce(p_when, '')), 120),
          left(trim(coalesce(p_people, '')), 300))
  returning id into rid;
  for u in select app.permission_holders('safety.reports') loop
    if u <> auth.uid() then
      perform app.notify_user(u, case when app.safety_urgent(p_kind) then '🛟 Urgent: a student reported someone may be in danger' else '🛟 New Tell Someone report' end,
        'Open Tell Someone reports to read it.', jsonb_build_object('safetyReportId', rid, 'reports', true));
    end if;
  end loop;
  -- Never the student as the sender, so the readers' bell doesn't name them.
  update notifications set created_by = null where data->>'safetyReportId' = rid::text;
  return rid;
end $$;

/** A student's own reports, newest first: what they said and where it stands (never the readers' notes). */
create function public.my_safety_reports() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'what', r.what, 'named', r.named, 'status', r.status,
    'seenAt', r.seen_at, 'closedAt', r.closed_at, 'createdAt', r.created_at) order by r.created_at desc), '[]')
  from safety_reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 year'
$$;

/** For the readers: every report from the last year, new ones first; the student's name only when they included it. */
create function public.safety_reports_all() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('safety.reports');
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'urgent', app.safety_urgent(r.kind), 'what', r.what,
      'place', r.place, 'when', r.happened, 'people', r.people, 'named', r.named,
      'reporter', case when r.named then (select trim(p.first_name || ' ' || p.last_name) from profiles p where p.id = r.reporter_id) end,
      'grade', case when r.named then (select p.grade from profiles p where p.id = r.reporter_id) end,
      'status', r.status, 'staffNote', r.staff_note, 'seenBy', case when r.seen_by is not null then app.checkin_name(r.seen_by) end,
      'seenAt', r.seen_at, 'closedAt', r.closed_at, 'createdAt', r.created_at)
      order by (r.status = 'new') desc, app.safety_urgent(r.kind) desc, r.created_at desc), '[]')
    from safety_reports r where r.created_at > now() - interval '1 year');
end $$;

/** A reader marks a report seen (the student is told the school has it), or closes it with a note only readers see. */
create function public.safety_report_update(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r safety_reports%rowtype;
begin
  perform app.require_permission('safety.reports');
  if p_status is null or p_status not in ('seen', 'closed') then raise exception 'Mark it seen or closed.'; end if;
  select * into r from safety_reports where id = p_id for update;
  if not found then raise exception 'That report is gone.'; end if;
  update safety_reports set status = p_status,
    seen_by = coalesce(seen_by, auth.uid()), seen_at = coalesce(seen_at, now()),
    closed_at = case when p_status = 'closed' then now() else null end,
    staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note)
  where id = p_id;
  if r.seen_at is null and r.reporter_id is not null then
    perform app.notify_user(r.reporter_id, '🛟 The school has your report', 'Thank you for telling someone. Someone at school has read it.',
      jsonb_build_object('safetyReportId', r.id));
  end if;
end $$;

revoke all on function app.safety_urgent(text) from public, anon;
grant execute on function app.safety_urgent(text) to authenticated, service_role;
revoke all on function public.safety_report(text, text, text, text, text, boolean), public.my_safety_reports(), public.safety_reports_all(),
  public.safety_report_update(uuid, text, text) from public, anon;
grant execute on function public.safety_report(text, text, text, text, text, boolean), public.my_safety_reports(), public.safety_reports_all(),
  public.safety_report_update(uuid, text, text) to authenticated, service_role;
