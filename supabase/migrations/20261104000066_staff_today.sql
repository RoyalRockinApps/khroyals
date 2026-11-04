-- "Needs you today" on a teacher's or staff member's Planner.
--
-- One call counts what's waiting on the person across the apps, so the Planner shows it without asking each app:
-- the roll still to take in the classes they lead, today's absence reports for their students (or, for the office,
-- the ones nobody has marked seen), questions assigned to them (and, for routers, ones to route), volunteer shifts
-- they lead that nobody marked, a sub covering their class today and today's lunch visitors. Admin counts (feedback
-- to triage, accounts and family requests waiting) come only with the permission, so only in a verified session.
-- Counts only: the screens they open show the details, with their own checks.

/**
 * What's waiting on the caller on p_day (today unless given): counts by key, each only where it applies to them
 * (teachers, staff and admins; everyone else gets {}). The Planner shows the ones above zero (src/info/needsYou.ts).
 */
create function public.staff_today(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d date := coalesce(p_day, app.school_today());
  me uuid := auth.uid();
  school_day boolean;
  mine text[];      -- the class sections they lead
  covered text[];   -- …that a sub has that day
begin
  if not app.is_staff() then return '{}'::jsonb; end if;
  school_day := extract(isodow from d) <= 5 and not exists (
    select 1 from events where group_id is null and category in ('No School', 'Teacher In-Service', 'E-Learning')
      and d between starts_on and coalesce(ends_on, starts_on));
  select coalesce(array_agg(id), '{}') into mine from rosters where kind = 'section' and lead_id = me;
  select coalesce(array_agg(distinct ss.section_id), '{}') into covered
    from sub_assignment_sections ss join sub_assignments a on a.id = ss.assignment_id
    where ss.section_id = any (mine) and d between a.starts_on and a.ends_on;

  return jsonb_strip_nulls(jsonb_build_object(
    -- Their classes whose roll nobody has started (not on a no-school day, nor where a sub takes it).
    'roll', case when school_day and cardinality(mine) > 0 then (
      select count(*) from unnest(mine) as s(id) cross join lateral app.attendance_counts(s.id, d) as c(v)
      where not s.id = any (covered) and (c.v->>'students')::int > 0 and (c.v->>'unmarked')::int = (c.v->>'students')::int) end,
    'subCovering', case when cardinality(covered) > 0 then cardinality(covered) end,
    -- Parents' reports for the day: their students' (teachers); the ones still to mark seen (the office).
    'absencesToday', case when cardinality(mine) > 0 then (
      select count(*) from absence_reports r where r.status = 'reported' and d between r.starts_on and r.ends_on
        and app.teaches(me, r.student_id)) end,
    'absencesToSee', case when app.has_permission('checkin.manage') then (
      select count(*) from absence_reports r where r.status = 'reported' and r.seen_at is null and r.ends_on >= d) end,
    'questionsAssigned', (select count(*) from school_questions where assignee_id = me and status in ('new', 'assigned')),
    'questionsToRoute', case when app.has_permission('questions.manage') then (
      select count(*) from school_questions where status = 'new' and assignee_id is null) end,
    'feedbackNew', case when app.has_permission('feedback.triage') then (select count(*) from feedback where status = 'new') end,
    'accountsWaiting', case when app.has_permission('people.approve') then (select count(*) from profiles where school_role is null) end,
    'familyRequests', case when app.has_permission('people.family') then (select count(*) from family_requests where status = 'pending') end,
    -- Lunch visitors that day: every one for the office, or the ones coming to see their students.
    'lunchVisitors', (select count(*) from lunch_visits v where v.day = d and v.status = 'booked'
      and (app.has_permission('lunch.manage') or app.has_permission('checkin.manage') or app.teaches(me, v.student_id))),
    -- Days in the last two weeks of help opportunities they lead where a volunteer who said yes is still unmarked.
    'volunteerToMark', (
      select count(*) from volunteer_signups s
      join volunteer_opportunities o on o.id = s.opportunity_id and o.kind = 'help' and o.status = 'open' and o.lead_id = me
      cross join lateral generate_series(greatest(o.starts_on, d - 14), least(coalesce(o.ends_on, o.starts_on), d - 1), interval '1 day') g
      where not exists (select 1 from volunteer_attendance a where a.opportunity_id = o.id and a.user_id = s.user_id and a.day = g::date))
  ));
end $$;

revoke all on function public.staff_today(date) from public, anon;
grant execute on function public.staff_today(date) to authenticated, service_role;
