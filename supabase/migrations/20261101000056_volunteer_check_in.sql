-- Volunteer check-in, hours and analytics.
--
-- Volunteers who said yes scan a QR code when they arrive and again when they're done, on each day the opportunity
-- runs: check-in opens an hour before it starts and closes when it ends (any time that day without times). Its leaders
-- show or print the code: one per opportunity, or one for a whole event (Harvest Fest), which checks people in to
-- whichever of its opportunities they said yes to is open. Scanning again asks them to confirm they're done, then checks
-- them out. As it starts, everyone who said yes and hasn't checked in is reminded. The opportunity's leader (its event's
-- leader, or groups.manage) marks anyone here, done (with their hours) or a no-show, for today or an earlier day, and
-- corrects hours. Anyone still checked in overnight is checked out at the scheduled end time. Item requests have no
-- check-in.
--
-- Volunteer Leaders and groups.manage holders see the analytics: who volunteered and finished, their hours,
-- no-shows and days nobody marked, what they lead, and who's doing a lot (more shifts or hours in the last 30 days
-- than the school's limits, or more shifts than that signed up for in the next 30). Everyone sees their own history.

create table public.volunteer_attendance (
  opportunity_id uuid not null references public.volunteer_opportunities (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  day            date not null,
  status         text not null check (status in ('here', 'done', 'no_show')),
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  minutes        int check (minutes between 0 and 1440),    -- a finished shift's time; null: not known (no end time)
  marked_by      uuid references public.profiles (id) on delete set null,   -- the last change: the volunteer, a leader, or null overnight
  updated_at     timestamptz not null default now(),
  primary key (opportunity_id, user_id, day),
  check (status <> 'here' or (checked_in_at is not null and checked_out_at is null and minutes is null)),
  check (status <> 'no_show' or (checked_in_at is null and checked_out_at is null and minutes is null))
);
create index on public.volunteer_attendance (user_id, day);

-- Who was reminded to check in, so it's once a day each.
create table app.volunteer_reminders (
  opportunity_id uuid not null references public.volunteer_opportunities (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  day            date not null,
  primary key (opportunity_id, user_id, day)
);
revoke all on app.volunteer_reminders from public, anon, authenticated;

-- The check-in QR codes (VOL-<code>): one per opportunity, or one for a whole event. Only its leaders read them.
create table app.volunteer_codes (
  code           text primary key default replace(gen_random_uuid()::text, '-', ''),   -- 122 random bits
  opportunity_id uuid unique references public.volunteer_opportunities (id) on delete cascade,
  event_id       uuid unique references public.volunteer_events (id) on delete cascade,
  created_at     timestamptz not null default now(),
  check ((opportunity_id is null) <> (event_id is null))
);
revoke all on app.volunteer_codes from public, anon, authenticated;

-- Doing a lot: this many hours or shifts in 30 days.
insert into app.settings values ('volunteer_busy_hours', '12'), ('volunteer_busy_shifts', '6') on conflict (key) do nothing;

-- ----------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------

/** The opportunity's leader, its event's leader, or groups.manage: marks who came. */
create function app.runs_volunteer(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from volunteer_opportunities v left join volunteer_events e on e.id = v.event_id
                 where v.id = o and auth.uid() in (v.lead_id, e.lead_id))
      or app.has_permission('groups.manage')
$$;

/** The event's leader, or groups.manage: shows the event's check-in code. */
create function app.runs_volunteer_event(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from volunteer_events where id = e and lead_id = auth.uid()) or app.has_permission('groups.manage')
$$;

/** Volunteer Leaders and groups.manage holders see everyone's volunteering. */
create function app.sees_volunteer_stats() returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_volunteer_lead() or app.has_permission('groups.manage')
$$;

/** The moment a day's time happens on the school's clock. */
create function app.school_moment(d date, t time) returns timestamptz
language sql stable as $$ select (d + t) at time zone 'America/Chicago' $$;

/** A shift's scheduled length in minutes, or null without both times. */
create function app.shift_minutes(t1 time, t2 time) returns int
language sql immutable as $$ select case when t2 > t1 then (extract(epoch from t2 - t1) / 60)::int end $$;

/** Minutes from one moment to another, kept to a day. */
create function app.minutes_between(a timestamptz, b timestamptz) returns int
language sql immutable as $$ select least(greatest(round(extract(epoch from b - a) / 60), 0), 1440)::int $$;

/** Whether volunteers can check themselves in at p_at: a day it runs, from an hour before it starts until it ends. */
create function app.volunteer_check_in_open(o public.volunteer_opportunities, p_at timestamptz default now()) returns boolean
language sql stable as $$
  select d between o.starts_on and coalesce(o.ends_on, o.starts_on)
     and (o.start_time is null or p_at >= app.school_moment(d, o.start_time) - interval '1 hour')
     and (o.end_time is null or o.end_time <= o.start_time or p_at < app.school_moment(d, o.end_time))
  from (select (p_at at time zone 'America/Chicago')::date as d) x
$$;

-- ----------------------------------------------------------------------
-- Checking in and out
-- ----------------------------------------------------------------------

/**
 * Its leaders: the check-in code of an opportunity (p_opportunity) or a whole event (p_event), made the first time.
 * p_new replaces it, so the old one (a printed sign, say) stops working.
 */
create function public.volunteer_check_in_code(p_opportunity uuid default null, p_event uuid default null, p_new boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if (p_opportunity is null) = (p_event is null) then raise exception 'Choose an opportunity or an event.'; end if;
  if p_opportunity is not null then
    if not exists (select 1 from volunteer_opportunities where id = p_opportunity and kind = 'help' and status = 'open') then
      raise exception 'This opportunity has no check-in.';
    end if;
    if not app.runs_volunteer(p_opportunity) then raise exception 'Only its leaders show the check-in code.' using errcode = '42501'; end if;
  else
    if not exists (select 1 from volunteer_events where id = p_event and status = 'open') then raise exception 'That event is gone.'; end if;
    if not app.runs_volunteer_event(p_event) then raise exception 'Only its leaders show the check-in code.' using errcode = '42501'; end if;
  end if;
  if p_new then delete from app.volunteer_codes where opportunity_id = p_opportunity or event_id = p_event; end if;
  select code into c from app.volunteer_codes where opportunity_id = p_opportunity or event_id = p_event;
  if c is null then
    insert into app.volunteer_codes (opportunity_id, event_id) values (p_opportunity, p_event) returning code into c;
  end if;
  return c;
end $$;

/**
 * A volunteer scans a check-in code (the QR's text, or the short code printed under it). Arriving, it checks them in to
 * the opportunity they said yes to that's open for check-in now (with an event's code, the one starting first). Once
 * they're checked in, scanning again asks them to confirm they're done (action 'confirm'); with p_done it checks them
 * out. Returns {action: 'in' | 'confirm' | 'out', opportunityId, title, since (checked in), minutes (checked out)}.
 */
create function public.volunteer_scan(p_code text, p_done boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));   -- "VOL-" isn't hex, so it goes too
        k app.volunteer_codes%rowtype; o volunteer_opportunities%rowtype; a volunteer_attendance%rowtype;
        today date := app.school_today(); m int;
begin
  if char_length(c) < 8 then raise exception 'That isn''t a volunteer check-in code.'; end if;
  -- Only the codes of opportunities (or events) this person said yes to.
  select x.* into k from app.volunteer_codes x
  where x.code like c || '%' and exists (
    select 1 from volunteer_signups s join volunteer_opportunities v on v.id = s.opportunity_id
    where s.user_id = auth.uid() and v.kind = 'help' and (v.id = x.opportunity_id or v.event_id = x.event_id))
  limit 1;
  if not found then raise exception 'That code isn''t for anything you said yes to.'; end if;

  -- Checked in already: this scan finishes it, once they confirm.
  select d.* into a from volunteer_attendance d join volunteer_opportunities v on v.id = d.opportunity_id
  where d.user_id = auth.uid() and d.day = today and d.status = 'here' and (v.id = k.opportunity_id or v.event_id = k.event_id)
  limit 1;
  if found then
    select * into o from volunteer_opportunities where id = a.opportunity_id;
    if not coalesce(p_done, false) then
      return jsonb_build_object('action', 'confirm', 'opportunityId', o.id, 'title', o.title, 'since', a.checked_in_at);
    end if;
    m := app.minutes_between(a.checked_in_at, now());
    update volunteer_attendance set status = 'done', checked_out_at = now(), minutes = m, marked_by = auth.uid(), updated_at = now()
    where opportunity_id = o.id and user_id = auth.uid() and day = today;
    return jsonb_build_object('action', 'out', 'opportunityId', o.id, 'title', o.title, 'minutes', m);
  end if;

  -- Arriving: what they said yes to that's open for check-in now and they haven't finished today.
  select v.* into o from volunteer_opportunities v join volunteer_signups s on s.opportunity_id = v.id and s.user_id = auth.uid()
  where (v.id = k.opportunity_id or v.event_id = k.event_id) and v.status = 'open' and v.kind = 'help' and app.volunteer_check_in_open(v)
    and not exists (select 1 from volunteer_attendance d where d.opportunity_id = v.id and d.user_id = auth.uid() and d.day = today and d.status = 'done')
  order by v.start_time nulls last, v.title
  limit 1;
  if not found then
    if exists (select 1 from volunteer_attendance d join volunteer_opportunities v on v.id = d.opportunity_id
               where d.user_id = auth.uid() and d.day = today and d.status = 'done' and (v.id = k.opportunity_id or v.event_id = k.event_id)) then
      raise exception 'You''ve already checked out today. Thank you!';
    end if;
    if exists (select 1 from volunteer_opportunities v join volunteer_signups s on s.opportunity_id = v.id and s.user_id = auth.uid()
               where (v.id = k.opportunity_id or v.event_id = k.event_id) and v.status = 'open' and v.kind = 'help'
                 and today between v.starts_on and coalesce(v.ends_on, v.starts_on) and v.start_time is not null
                 and now() < app.school_moment(today, v.start_time) - interval '1 hour') then
      raise exception 'Check-in opens an hour before it starts.';
    end if;
    raise exception 'Nothing you said yes to is open for check-in right now.';
  end if;
  insert into volunteer_attendance (opportunity_id, user_id, day, status, checked_in_at, marked_by)
  values (o.id, auth.uid(), today, 'here', now(), auth.uid())
  on conflict (opportunity_id, user_id, day) do update
    set status = 'here', checked_in_at = now(), checked_out_at = null, minutes = null, marked_by = auth.uid(), updated_at = now();
  return jsonb_build_object('action', 'in', 'opportunityId', o.id, 'title', o.title);
end $$;

/**
 * The leader marks a volunteer for a day it ran: 'here' (checks them in now; today only), 'done' (checks them out now
 * if they're here, otherwise records the shift: p_minutes, else its scheduled length), 'no_show', or null to clear the
 * day. 'done' with p_minutes also corrects a finished shift's time.
 */
create function public.volunteer_mark(p_opportunity uuid, p_user uuid, p_day date, p_status text, p_minutes int default null) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; a volunteer_attendance%rowtype; m int;
begin
  select * into o from volunteer_opportunities where id = p_opportunity;
  if not found then raise exception 'This opportunity is gone.'; end if;
  if not app.runs_volunteer(o.id) then raise exception 'Only the leader marks who came.' using errcode = '42501'; end if;
  if o.kind <> 'help' then raise exception 'Item requests don''t need a check-in.'; end if;
  if p_day is null or p_day not between o.starts_on and coalesce(o.ends_on, o.starts_on) then
    raise exception 'That isn''t one of its days.';
  end if;
  if p_day > app.school_today() then raise exception 'Mark a day once it comes.'; end if;
  if p_status is not null and p_status not in ('here', 'done', 'no_show') then raise exception 'Mark them here, done or a no-show.'; end if;
  if p_minutes is not null and p_minutes not between 0 and 1440 then raise exception 'Hours go from 0 to 24.'; end if;
  select * into a from volunteer_attendance where opportunity_id = o.id and user_id = p_user and day = p_day for update;
  if not found and not exists (select 1 from volunteer_signups where opportunity_id = o.id and user_id = p_user) then
    raise exception 'They haven''t said yes to this opportunity.';
  end if;

  if p_status is null then
    delete from volunteer_attendance where opportunity_id = o.id and user_id = p_user and day = p_day;
  elsif p_status = 'here' then
    if p_day <> app.school_today() then raise exception 'Check people in on the day. For an earlier day, mark them done or a no-show.'; end if;
    insert into volunteer_attendance (opportunity_id, user_id, day, status, checked_in_at, marked_by)
    values (o.id, p_user, p_day, 'here', now(), auth.uid())
    on conflict (opportunity_id, user_id, day) do update
      set status = 'here', checked_in_at = now(), checked_out_at = null, minutes = null, marked_by = auth.uid(), updated_at = now();
  elsif p_status = 'no_show' then
    insert into volunteer_attendance (opportunity_id, user_id, day, status, marked_by)
    values (o.id, p_user, p_day, 'no_show', auth.uid())
    on conflict (opportunity_id, user_id, day) do update
      set status = 'no_show', checked_in_at = null, checked_out_at = null, minutes = null, marked_by = auth.uid(), updated_at = now();
  elsif found and a.status = 'here' then
    update volunteer_attendance set status = 'done', checked_out_at = now(),
           minutes = coalesce(p_minutes, app.minutes_between(a.checked_in_at, now())), marked_by = auth.uid(), updated_at = now()
    where opportunity_id = o.id and user_id = p_user and day = p_day;
  else
    m := coalesce(p_minutes, case when a.status = 'done' then a.minutes end, app.shift_minutes(o.start_time, o.end_time));
    insert into volunteer_attendance (opportunity_id, user_id, day, status, minutes, marked_by)
    values (o.id, p_user, p_day, 'done', m, auth.uid())
    on conflict (opportunity_id, user_id, day) do update set status = 'done', minutes = m, marked_by = auth.uid(), updated_at = now();
  end if;
end $$;

/** Overnight: anyone still checked in on an earlier day is checked out at its end time (time unknown without one). */
create function app.close_volunteer_days() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update volunteer_attendance a set status = 'done',
         checked_out_at = greatest(a.checked_in_at, coalesce(app.school_moment(a.day, o.end_time), a.checked_in_at)),
         minutes = case when o.end_time is not null then app.minutes_between(a.checked_in_at, app.school_moment(a.day, o.end_time)) end,
         marked_by = null, updated_at = now()
  from volunteer_opportunities o
  where o.id = a.opportunity_id and a.status = 'here' and a.day < app.school_today();
  get diagnostics n = row_count;
  return n;
end $$;

/** Every few minutes: as an opportunity starts, everyone who said yes and hasn't checked in is reminded (once a day). */
create function app.volunteer_check_in_reminders(p_at timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; d date := (p_at at time zone 'America/Chicago')::date;
begin
  for r in
    select o.id, o.title, o.start_time, o.location, s.user_id
    from volunteer_opportunities o join volunteer_signups s on s.opportunity_id = o.id
    where o.status = 'open' and o.kind = 'help' and o.start_time is not null
      and d between o.starts_on and coalesce(o.ends_on, o.starts_on)
      and p_at >= app.school_moment(d, o.start_time) - interval '15 minutes'
      and p_at < app.school_moment(d, o.start_time) + interval '30 minutes'
      and not exists (select 1 from volunteer_attendance a where a.opportunity_id = o.id and a.user_id = s.user_id and a.day = d)
      and not exists (select 1 from app.volunteer_reminders m where m.opportunity_id = o.id and m.user_id = s.user_id and m.day = d)
  loop
    insert into app.volunteer_reminders values (r.id, r.user_id, d);
    perform app.notify_user(r.user_id, '📍 Check in: ' || r.title,
      'It starts at ' || to_char(r.start_time, 'FMHH12:MI AM') || coalesce(' at ' || r.location, '') || '. Scan the check-in QR code when you get there.',
      jsonb_build_object('opportunityId', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ----------------------------------------------------------------------
-- Analytics
-- ----------------------------------------------------------------------

/** How much is a lot: hours and shifts in 30 days, and whether you can change them (groups.manage). */
create function public.volunteer_busy_limits() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hours', coalesce(nullif(app.setting('volunteer_busy_hours'), '')::int, 12),
    'shifts', coalesce(nullif(app.setting('volunteer_busy_shifts'), '')::int, 6),
    'canEdit', app.has_permission('groups.manage'))
$$;

/** groups.manage: change how much is a lot. */
create function public.volunteer_set_busy_limits(p_hours int, p_shifts int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('groups.manage');
  if p_hours is null or p_hours not between 1 and 200 then raise exception 'Hours go from 1 to 200.'; end if;
  if p_shifts is null or p_shifts not between 1 and 100 then raise exception 'Shifts go from 1 to 100.'; end if;
  insert into app.settings values ('volunteer_busy_hours', p_hours::text), ('volunteer_busy_shifts', p_shifts::text)
  on conflict (key) do update set value = excluded.value;
  perform app.audit(null, 'volunteer.busy_limits', null, jsonb_build_object('hours', p_hours, 'shifts', p_shifts));
end $$;

/**
 * Every day someone said yes to, checked in on or led (help opportunities), with what happened: 'done', 'no_show',
 * 'here', null (nobody marked it yet) or 'led'. Cancelled opportunities only count the days somebody was marked.
 */
create function app.volunteer_days() returns table (
  user_id uuid, opportunity_id uuid, day date, status text, minutes int
)
language sql stable security definer set search_path = public as $$
  with signed as (
    select s.user_id, o.id as opportunity_id, d::date as day
    from volunteer_signups s
    join volunteer_opportunities o on o.id = s.opportunity_id and o.kind = 'help' and o.status = 'open'
    cross join lateral generate_series(o.starts_on, coalesce(o.ends_on, o.starts_on), interval '1 day') d
  )
  select coalesce(sg.user_id, a.user_id), coalesce(sg.opportunity_id, a.opportunity_id), coalesce(sg.day, a.day), a.status, a.minutes
  from signed sg full join volunteer_attendance a
    on a.opportunity_id = sg.opportunity_id and a.user_id = sg.user_id and a.day = sg.day
  union all
  select o.lead_id, o.id, d::date, 'led', app.shift_minutes(o.start_time, o.end_time)
  from volunteer_opportunities o
  cross join lateral generate_series(o.starts_on, coalesce(o.ends_on, o.starts_on), interval '1 day') d
  where o.kind = 'help' and o.status = 'open'
$$;

/**
 * Volunteer Leaders and groups.manage: everyone who volunteered, led or said yes from p_from to p_to (null: from the
 * start; to today), with shifts done, hours, no-shows, past days nobody marked and days led; and, whatever the dates,
 * shifts and minutes (done or led) in the last 30 days, shifts coming in the next 30, and busy: either is over the
 * limits (volunteer_busy_limits).
 */
create function public.volunteer_stats(p_from date default null, p_to date default null) returns table (
  user_id uuid, name text, school_role text, is_lead boolean,
  shifts int, minutes int, no_shows int, unmarked int, led int,
  recent_shifts int, recent_minutes int, upcoming int, last_day date, busy boolean
)
language plpgsql stable security definer set search_path = public as $$
declare today date := app.school_today(); upto date := least(coalesce(p_to, app.school_today()), app.school_today());
        lim jsonb := public.volunteer_busy_limits();
begin
  if not app.sees_volunteer_stats() then
    raise exception 'Volunteer analytics are for Volunteer Leaders and the office.' using errcode = '42501';
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
 * Your own, or anyone's for Volunteer Leaders and groups.manage.
 */
create function public.volunteer_history(p_user uuid, p_from date default null, p_to date default null) returns table (
  opportunity_id uuid, title text, event_title text, day date, start_time time, end_time time, status text, minutes int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is distinct from auth.uid() and not app.sees_volunteer_stats() then
    raise exception 'Volunteer analytics are for Volunteer Leaders and the office.' using errcode = '42501';
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

-- ----------------------------------------------------------------------
-- Reads, schedules and privileges
-- ----------------------------------------------------------------------

alter table public.volunteer_attendance enable row level security;
create policy "your own, or the opportunities you run" on public.volunteer_attendance for select to authenticated
  using (user_id = auth.uid() or app.runs_volunteer(opportunity_id));

revoke all on public.volunteer_attendance from anon;
revoke insert, update, delete on public.volunteer_attendance from authenticated;
grant select on public.volunteer_attendance to authenticated;
grant all on public.volunteer_attendance to service_role;
alter publication supabase_realtime add table public.volunteer_attendance;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('volunteer-reminders', '*/5 * * * *', 'select app.volunteer_check_in_reminders()');
    perform cron.schedule('close-volunteer-days', '10 7 * * *', 'select app.close_volunteer_days()');
  end if;
end $$;

revoke all on function app.runs_volunteer(uuid), app.runs_volunteer_event(uuid), app.sees_volunteer_stats(), app.school_moment(date, time), app.shift_minutes(time, time),
  app.minutes_between(timestamptz, timestamptz), app.volunteer_check_in_open(public.volunteer_opportunities, timestamptz) from public, anon;
grant execute on function app.runs_volunteer(uuid), app.runs_volunteer_event(uuid), app.sees_volunteer_stats(), app.school_moment(date, time), app.shift_minutes(time, time),
  app.minutes_between(timestamptz, timestamptz), app.volunteer_check_in_open(public.volunteer_opportunities, timestamptz) to authenticated, service_role;
revoke all on function app.close_volunteer_days(), app.volunteer_check_in_reminders(timestamptz), app.volunteer_days()
  from public, anon, authenticated;
revoke all on function public.volunteer_check_in_code(uuid, uuid, boolean), public.volunteer_scan(text, boolean),
  public.volunteer_mark(uuid, uuid, date, text, int), public.volunteer_busy_limits(), public.volunteer_set_busy_limits(int, int),
  public.volunteer_stats(date, date), public.volunteer_history(uuid, date, date) from public, anon;
grant execute on function public.volunteer_check_in_code(uuid, uuid, boolean), public.volunteer_scan(text, boolean),
  public.volunteer_mark(uuid, uuid, date, text, int), public.volunteer_busy_limits(), public.volunteer_set_busy_limits(int, int),
  public.volunteer_stats(date, date), public.volunteer_history(uuid, date, date) to authenticated, service_role;
