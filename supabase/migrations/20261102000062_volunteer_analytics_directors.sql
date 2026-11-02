-- Volunteer analytics are for Volunteer Leaders and directors only.
--
-- Until now everyone with groups.manage (the office, administrators and directors) saw them too. Now only Volunteer
-- Leaders and directors see the analytics and anyone else's volunteer history, and only directors change how much is
-- a lot. Running check-in (marking who came, the QR codes) stays with the leaders and groups.manage. Being a director
-- counts only in an authenticator-verified session, like every admin power.

/** A director, in an authenticator-verified session (admin powers only count there). */
create function app.is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select app.mfa_ok() and exists (select 1 from profiles where id = auth.uid() and admin_tier = 'director' and school_role is not null)
$$;

/** Volunteer Leaders and directors see everyone's volunteering. */
create or replace function app.sees_volunteer_stats() returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_volunteer_lead() or app.is_director()
$$;

/** How much is a lot: hours and shifts in 30 days, and whether you can change them (directors). */
create or replace function public.volunteer_busy_limits() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hours', coalesce(nullif(app.setting('volunteer_busy_hours'), '')::int, 12),
    'shifts', coalesce(nullif(app.setting('volunteer_busy_shifts'), '')::int, 6),
    'canEdit', app.is_director())
$$;

/** Directors: change how much is a lot. */
create or replace function public.volunteer_set_busy_limits(p_hours int, p_shifts int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_director() then
    if exists (select 1 from profiles where id = auth.uid() and admin_tier = 'director') then
      raise exception 'MFA_REQUIRED: Verify with your authenticator app to use admin tools.' using errcode = '42501';
    end if;
    raise exception 'Only a director changes how much is a lot.' using errcode = '42501';
  end if;
  if p_hours is null or p_hours not between 1 and 200 then raise exception 'Hours go from 1 to 200.'; end if;
  if p_shifts is null or p_shifts not between 1 and 100 then raise exception 'Shifts go from 1 to 100.'; end if;
  insert into app.settings values ('volunteer_busy_hours', p_hours::text), ('volunteer_busy_shifts', p_shifts::text)
  on conflict (key) do update set value = excluded.value;
  perform app.audit(null, 'volunteer.busy_limits', null, jsonb_build_object('hours', p_hours, 'shifts', p_shifts));
end $$;

/**
 * Volunteer Leaders and directors: everyone who volunteered, led or said yes from p_from to p_to (null: from the
 * start; to today), with shifts done, hours, no-shows, past days nobody marked and days led; and, whatever the dates,
 * shifts and minutes (done or led) in the last 30 days, shifts coming in the next 30, and busy: either is over the
 * limits (volunteer_busy_limits).
 */
create or replace function public.volunteer_stats(p_from date default null, p_to date default null) returns table (
  user_id uuid, name text, school_role text, is_lead boolean,
  shifts int, minutes int, no_shows int, unmarked int, led int,
  recent_shifts int, recent_minutes int, upcoming int, last_day date, busy boolean
)
language plpgsql stable security definer set search_path = public as $$
declare today date := app.school_today(); upto date := least(coalesce(p_to, app.school_today()), app.school_today());
        lim jsonb := public.volunteer_busy_limits();
begin
  if not app.sees_volunteer_stats() then
    raise exception 'Volunteer analytics are for Volunteer Leaders and directors.' using errcode = '42501';
  end if;
  return query
    with d as (
      select v.*, (p_from is null or v.day >= p_from) and v.day <= upto as inside,
             v.day between today - 29 and today as recent, v.day between today + 1 and today + 30 as coming
      from app.volunteer_days() v
    ), per as (
      select d.user_id,
        (count(*) filter (where inside and d.status = 'done'))::int as shifts,
        coalesce(sum(d.minutes) filter (where inside and d.status = 'done'), 0)::int as minutes,
        (count(*) filter (where inside and d.status = 'no_show'))::int as no_shows,
        (count(*) filter (where inside and d.status is null and d.day < today))::int as unmarked,
        (count(*) filter (where inside and d.status = 'led'))::int as led,
        (count(*) filter (where recent and d.status in ('done', 'led')))::int as recent_shifts,
        coalesce(sum(d.minutes) filter (where recent and d.status in ('done', 'led')), 0)::int as recent_minutes,
        (count(*) filter (where coming and (d.status is null or d.status = 'led')))::int as upcoming,
        max(d.day) filter (where d.status = 'done') as last_day,
        bool_or(inside or coming) as shown
      from d group by d.user_id
    )
    select p.id, trim(p.first_name || ' ' || p.last_name), p.school_role, p.volunteer_lead,
           per.shifts, per.minutes, per.no_shows, per.unmarked, per.led,
           per.recent_shifts, per.recent_minutes, per.upcoming, per.last_day,
           per.recent_minutes >= (lim->>'hours')::int * 60 or per.recent_shifts >= (lim->>'shifts')::int
             or per.upcoming >= (lim->>'shifts')::int
    from per join profiles p on p.id = per.user_id
    where per.shown
    order by per.minutes desc, per.shifts desc, p.last_name, p.first_name;
end $$;

/**
 * One person's volunteering from p_from to p_to (null: no limit), newest first: each day they said yes to, were marked
 * on or led, and what happened ('done', 'no_show', 'here', 'missed': past and nobody marked it, 'coming', 'led').
 * Your own, or anyone's for Volunteer Leaders and directors.
 */
create or replace function public.volunteer_history(p_user uuid, p_from date default null, p_to date default null) returns table (
  opportunity_id uuid, title text, event_title text, day date, start_time time, end_time time, status text, minutes int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is distinct from auth.uid() and not app.sees_volunteer_stats() then
    raise exception 'Volunteer analytics are for Volunteer Leaders and directors.' using errcode = '42501';
  end if;
  return query
    select o.id, o.title, e.title, v.day, o.start_time, o.end_time,
           coalesce(v.status, case when v.day < app.school_today() then 'missed' else 'coming' end), v.minutes
    from app.volunteer_days() v
    join volunteer_opportunities o on o.id = v.opportunity_id
    left join volunteer_events e on e.id = o.event_id and e.status = 'open'
    where v.user_id = p_user and (p_from is null or v.day >= p_from) and (p_to is null or v.day <= p_to)
    order by v.day desc, o.start_time desc nulls last, o.title;
end $$;

revoke all on function app.is_director() from public, anon;
grant execute on function app.is_director() to authenticated, service_role;
