-- On-site attendance: who is at school right now, for the Admin portal's On-Site Attendance card and screen.
--
-- Faculty (teachers and substitutes) and staff (staff and administrators) check themselves in when they arrive, from the
-- staff Planner, only at school (within campus_radius_m of the school's spot), and out when they leave (campus_checks).
-- The office (checkin.manage) can check anyone in or out for them, and signs visitors in and out at the front desk
-- (campus_visitors), with today's booked lunch visitors listed to sign in.
--
-- Students are here once their teacher marks them present or late (or the office checks them in late). They have gone
-- home once they're picked up in the car line, checked out by the office, released from a check-out list (an activity,
-- a field trip, or extended care) or marked gone home by their teacher at dismissal with how they went (dismissals).
--
-- Extended care: the office (people.family or checkin.manage) records which students stay and on which weekdays
-- (extended_care) and who the extended care staff are (profiles.extended_care_duty). Those staff run a daily Extended
-- care check-out list, releasing each child only to someone on their pickup list, like any check-out list.
--
-- After dismissal (dismissal_time, Central time), a student still here is at an activity (signed up for one of today's
-- activity events still going on), in extended care, or not sent home yet, which the office sees and follows up.

insert into app.settings (key, value) values ('campus_radius_m', '300') on conflict (key) do nothing;
insert into app.settings (key, value)
  select 'dismissal_time', coalesce((select value from app.settings where key = 'carline_start'), '15:00')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------
-- Faculty and staff: checking in and out
-- ----------------------------------------------------------------------

create table public.campus_checks (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity,                    -- the order they happened in, when two share a time
  person_id   uuid not null references public.profiles (id) on delete cascade,
  day         date not null default app.school_today(),
  kind        text not null check (kind in ('in', 'out')),
  recorded_by uuid references public.profiles (id) on delete set null,   -- themselves, or the office
  distance_m  int,                                                      -- how far from the school's spot, checking themselves in
  at          timestamptz not null default now()
);
create index on public.campus_checks (day, person_id, at desc);

alter table public.campus_checks enable row level security;
create policy "their own, and the office" on public.campus_checks for select to authenticated
  using (person_id = auth.uid() or app.has_permission('checkin.manage'));

/** Faculty (teachers and substitutes) or staff (staff and administrators); null for everyone else. */
create function app.campus_role(u uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as $$
  select case app.school_role(u) when 'teacher' then 'faculty' when 'substitute' then 'faculty'
                                 when 'staff' then 'staff' when 'admin' then 'staff' end
$$;

/** Is this person at school: their last check of the day was a check-in. */
create function app.on_campus(u uuid, d date default app.school_today()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select kind = 'in' from campus_checks where person_id = u and day = d order by at desc, seq desc limit 1), false)
$$;

/** Is this substitute (or anyone) covering a class on this day. */
create function app.subbing_on(u uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sub_assignments where substitute_id = u and d between starts_on and ends_on)
$$;

/** The faculty and staff expected on a day: everyone but substitutes, and substitutes covering a class that day or here anyway. */
create function app.campus_people(d date) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where app.campus_role(p.id) is not null and (p.school_role <> 'substitute' or app.subbing_on(p.id, d) or app.on_campus(p.id, d))
$$;

/** When the school day ends (dismissal_time on the school's clock). */
create function app.dismissal_at(d date) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (d + coalesce(app.setting('dismissal_time'), '15:00')::time) at time zone 'America/Chicago'
$$;

/** Checking in only counts at school: within campus_radius_m of the school's spot (the car line's), allowing for GPS accuracy. */
create function app.require_on_campus(p_lat float8, p_lng float8, p_accuracy float8) returns int
language plpgsql stable security definer set search_path = public as $$
declare d float8; r float8 := coalesce(app.setting('campus_radius_m')::float8, 300);
begin
  if p_lat is null or p_lng is null then
    raise exception 'Turn on location for % so it can tell you''re at school.', app.brand('app_name');
  end if;
  d := app.distance_m(p_lat, p_lng, app.setting('carline_latitude')::float8, app.setting('carline_longitude')::float8);
  if d > r + least(greatest(coalesce(p_accuracy, 0), 0), 100) then
    raise exception 'You''re about % from school. You can check in once you''re there.',
      case when d >= 1609 then round((d / 1609.34)::numeric, 1) || ' miles' else round(d * 3.28084) || ' feet' end;
  end if;
  return round(d)::int;
end $$;

/** The caller's day: whether they're faculty or staff (null: not for them), whether they're here, and today's checks. */
create function public.my_campus_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', app.campus_role(), 'here', app.on_campus(auth.uid()),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'at', c.at, 'byOffice', c.recorded_by is distinct from c.person_id)
        order by c.at, c.seq) from campus_checks c where c.person_id = auth.uid() and c.day = app.school_today()), '[]'::jsonb))
$$;

/** Faculty and staff: check yourself in (at school only) or out. Checking in or out twice in a row changes nothing. */
create function public.campus_check(p_kind text, p_lat float8 default null, p_lng float8 default null, p_accuracy float8 default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare dist int;
begin
  if app.campus_role() is null then raise exception 'Checking in is for teachers and staff.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('in', 'out') then raise exception 'Choose check in or check out.'; end if;
  if (p_kind = 'in') <> app.on_campus(auth.uid()) then
    if p_kind = 'in' then dist := app.require_on_campus(p_lat, p_lng, p_accuracy); end if;
    insert into campus_checks (person_id, kind, recorded_by, distance_m) values (auth.uid(), p_kind, auth.uid(), dist);
  end if;
  return public.my_campus_status();
end $$;

/** checkin.manage: check a teacher or staff member in or out for them (no phone with them, or they forgot). */
create function public.campus_check_for(p_person uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  if app.campus_role(p_person) is null then raise exception 'Choose a teacher or staff member.'; end if;
  if p_kind is null or p_kind not in ('in', 'out') then raise exception 'Choose check in or check out.'; end if;
  if (p_kind = 'in') <> app.on_campus(p_person) then
    insert into campus_checks (person_id, kind, recorded_by) values (p_person, p_kind, auth.uid());
    perform app.audit(null, 'campus.' || p_kind, p_person::text);
  end if;
end $$;

-- ----------------------------------------------------------------------
-- Visitors (the front office)
-- ----------------------------------------------------------------------

create table public.campus_visitors (
  id             uuid primary key default gen_random_uuid(),
  day            date not null default app.school_today(),
  name           text not null check (char_length(trim(name)) between 1 and 120),
  purpose        text not null default '' check (char_length(purpose) <= 200),   -- who they're here to see, or why
  guests         int not null default 0 check (guests between 0 and 10),          -- people with them
  person_id      uuid references public.profiles (id) on delete set null,       -- their account, when they have one
  lunch_visit_id uuid references public.lunch_visits (id) on delete set null,
  signed_in_at   timestamptz not null default now(),
  signed_in_by   uuid references public.profiles (id) on delete set null,
  signed_out_at  timestamptz,
  signed_out_by  uuid references public.profiles (id) on delete set null
);
create index on public.campus_visitors (day);
create unique index campus_visitors_one_lunch on public.campus_visitors (lunch_visit_id) where lunch_visit_id is not null;

alter table public.campus_visitors enable row level security;
create policy "the office" on public.campus_visitors for select to authenticated using (app.has_permission('checkin.manage'));

/** checkin.manage: sign a visitor in (name, who they're seeing or why, people with them), or one of today's lunch visitors. */
create function public.visitor_sign_in(p_name text, p_purpose text default '', p_guests int default 0, p_lunch_visit uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v lunch_visits; new_id uuid;
begin
  perform app.require_permission('checkin.manage');
  if p_lunch_visit is not null then
    select * into v from lunch_visits where id = p_lunch_visit and status = 'booked' and day = app.school_today();
    if not found then raise exception 'That lunch visit isn''t booked for today.'; end if;
    if exists (select 1 from campus_visitors where lunch_visit_id = p_lunch_visit) then
      raise exception '% is already signed in.', app.checkin_name(v.visitor_id);
    end if;
    insert into campus_visitors (name, purpose, guests, person_id, lunch_visit_id, signed_in_by)
    values (app.checkin_name(v.visitor_id), 'Lunch with ' || (select first_name from profiles where id = v.student_id),
            v.guests, v.visitor_id, v.id, auth.uid())
    returning id into new_id;
  else
    if coalesce(trim(p_name), '') = '' then raise exception 'Enter the visitor''s name.'; end if;
    if char_length(trim(p_name)) > 120 then raise exception 'Keep the name under 120 characters.'; end if;
    if char_length(trim(coalesce(p_purpose, ''))) > 200 then raise exception 'Keep the reason under 200 characters.'; end if;
    if coalesce(p_guests, 0) not between 0 and 10 then raise exception 'Up to 10 people can come with a visitor.'; end if;
    insert into campus_visitors (name, purpose, guests, signed_in_by)
    values (trim(p_name), trim(coalesce(p_purpose, '')), coalesce(p_guests, 0), auth.uid())
    returning id into new_id;
  end if;
  return new_id;
end $$;

/** checkin.manage: a visitor (and the people with them) leaves. */
create function public.visitor_sign_out(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  update campus_visitors set signed_out_at = now(), signed_out_by = auth.uid()
  where id = p_id and signed_out_at is null and day = app.school_today();
  if not found then raise exception 'That visitor has already signed out.'; end if;
end $$;

/** checkin.manage: take back today's sign-in (a mistake). */
create function public.visitor_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  delete from campus_visitors where id = p_id and day = app.school_today();
  if not found then raise exception 'Only today''s visitors can be removed.'; end if;
end $$;

/** checkin.manage: today's visitors (still here first) and the lunch visitors booked for today who haven't signed in. */
create function public.visitors_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  return jsonb_build_object(
    'visitors', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'purpose', v.purpose, 'guests', v.guests,
        'in', v.signed_in_at, 'out', v.signed_out_at, 'by', app.checkin_name(v.signed_in_by), 'lunch', v.lunch_visit_id is not null)
        order by (v.signed_out_at is not null), v.signed_in_at desc)
      from campus_visitors v where v.day = app.school_today()), '[]'::jsonb),
    'expected', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', app.checkin_name(l.visitor_id),
        'student', (select first_name || ' ' || last_name from profiles where id = l.student_id), 'guests', l.guests,
        'start', to_char(w.start_time, 'HH24:MI')) order by w.start_time, app.checkin_name(l.visitor_id))
      from lunch_visits l join lunch_windows w on w.id = l.window_id
      where l.day = app.school_today() and l.status = 'booked'
        and not exists (select 1 from campus_visitors c where c.lunch_visit_id = l.id)), '[]'::jsonb));
end $$;

-- ----------------------------------------------------------------------
-- Extended care
-- ----------------------------------------------------------------------

alter table public.profiles add column extended_care_duty boolean not null default false;

create table public.extended_care (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  weekdays   int[] not null check (cardinality(weekdays) between 1 and 5 and weekdays <@ array[1, 2, 3, 4, 5]),  -- 1 Monday … 5 Friday
  note       text not null default '' check (char_length(note) <= 200),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

/** Runs extended care: a teacher or staff member the office marked as extended care staff. */
create function app.extended_care_staff(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select extended_care_duty from profiles where id = u), false) and app.is_staff(u)
$$;

/** Keeps the extended care roster and its staff: people.family or checkin.manage (admin powers, so aal2). */
create function app.manages_extended_care(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_permission('people.family', u) or app.has_permission('checkin.manage', u)
$$;

/** Does this student stay for extended care on this day (one of their weekdays). */
create function app.in_extended_care(s uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from extended_care where student_id = s and extract(isodow from d)::int = any (weekdays))
$$;

alter table public.extended_care enable row level security;
create policy "the office, extended care staff, and the child's parents" on public.extended_care for select to authenticated
  using (app.manages_extended_care() or app.extended_care_staff() or app.is_guardian_of(student_id));

/** The office: a student stays for extended care on these weekdays (none takes them off), with a note. */
create function public.extended_care_set(p_student uuid, p_weekdays int[], p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare days int[] := array(select distinct x from unnest(coalesce(p_weekdays, '{}')) x order by x);
begin
  if not app.manages_extended_care() then perform app.require_permission('people.family'); end if;
  if not exists (select 1 from profiles where id = p_student and school_role = 'student') then raise exception 'Choose a student.'; end if;
  if char_length(coalesce(p_note, '')) > 200 then raise exception 'Keep the note under 200 characters.'; end if;
  if cardinality(days) = 0 then
    delete from extended_care where student_id = p_student;
    if found then perform app.audit(null, 'extended_care.removed', p_student::text); end if;
    return;
  end if;
  if not (days <@ array[1, 2, 3, 4, 5]) then raise exception 'Choose school days, Monday to Friday.'; end if;
  insert into extended_care (student_id, weekdays, note, updated_by) values (p_student, days, trim(coalesce(p_note, '')), auth.uid())
  on conflict (student_id) do update set weekdays = excluded.weekdays, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(null, 'extended_care.set', p_student::text, jsonb_build_object('weekdays', days));
end $$;

/** The office and extended care staff: the students in extended care, with their days and whether today is one. */
create function public.extended_care_roster() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.extended_care_staff() and not app.manages_extended_care() then perform app.require_permission('people.family'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
      'weekdays', e.weekdays, 'note', e.note, 'today', app.in_extended_care(p.id, app.school_today())) order by p.last_name, p.first_name)
    from extended_care e join profiles p on p.id = e.student_id where p.school_role = 'student'), '[]'::jsonb);
end $$;

/** The office: students by name, to add to extended care (with their days when they're in it already). */
create function public.extended_care_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.manages_extended_care() then perform app.require_permission('people.family'); end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
      'weekdays', (select weekdays from extended_care where student_id = p.id)) as x
    from profiles p
    where p.school_role = 'student' and coalesce(trim(p_query), '') <> ''
      and (p.first_name || ' ' || p.last_name) ilike '%' || trim(p_query) || '%'
    order by p.last_name, p.first_name limit 30) q), '[]'::jsonb);
end $$;

/** The office: every teacher and staff member, and whether they're extended care staff. */
create function public.extended_care_staff_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.manages_extended_care() then perform app.require_permission('people.family'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name),
      'role', p.school_role, 'on', p.extended_care_duty) order by p.extended_care_duty desc, p.last_name, p.first_name)
    from profiles p where app.is_staff(p.id)), '[]'::jsonb);
end $$;

/** The office: make a teacher or staff member extended care staff, or not. */
create function public.extended_care_set_staff(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.manages_extended_care() then perform app.require_permission('people.family'); end if;
  if coalesce(p_on, false) and not app.is_staff(p_user) then raise exception 'Extended care staff must be teachers or staff.'; end if;
  update profiles set extended_care_duty = coalesce(p_on, false) where id = p_user;
  if not found then raise exception 'No such person.'; end if;
  perform app.audit(null, case when p_on then 'extended_care.staff_on' else 'extended_care.staff_off' end, p_user::text);
end $$;

-- Extended care's daily check-out list: a check-out list like any other, run by extended care staff and the office.
alter table public.checkout_lists add column extended_care boolean not null default false;
create unique index checkout_lists_extended_care_day on public.checkout_lists (day) where extended_care;

create or replace function app.manages_checkout(l uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from checkout_lists c
    left join sport_events e on e.id = c.sport_event_id
    left join sport_seasons ss on ss.id = e.season_id
    where c.id = l and (
      (app.is_staff(u) and (c.created_by = u or app.has_permission('checkin.manage', u)
                            or (ss.sport_id is not null and app.can_manage_sport(ss.sport_id, u))))
      or (c.extended_care and app.extended_care_staff(u))
      or (c.created_by = u and c.day = app.school_today() and app.on_duty(u))))
$$;

-- ----------------------------------------------------------------------
-- Students: arriving, staying and going home
-- ----------------------------------------------------------------------

create table public.dismissals (
  student_id uuid not null references public.profiles (id) on delete cascade,
  day        date not null default app.school_today(),
  how        text not null check (how in ('walked', 'drove', 'bus', 'other')),
  note       text not null default '' check (char_length(note) <= 200),
  marked_by  uuid references public.profiles (id) on delete set null,
  at         timestamptz not null default now(),
  primary key (student_id, day)
);

alter table public.dismissals enable row level security;
create policy "the office, the child's teachers, the child's parents and the child" on public.dismissals for select to authenticated
  using (app.has_permission('checkin.manage') or app.is_guardian_of(student_id) or student_id = auth.uid()
         or exists (select 1 from roster_members m join rosters r on r.id = m.roster_id
                    where m.profile_id = student_id and r.kind = 'section' and app.takes_roll(r.id)));

create function app.dismissal_how(h text) returns text
language sql immutable as $$
  select case h when 'walked' then 'Walked' when 'drove' then 'Drove' when 'bus' then 'Bus' else 'Other' end
$$;

/**
 * How a student went home on a day, if they have since the office last checked them in: the latest of a car line
 * pickup, an office check-out, a release from a check-out list (extended care among them) or their teacher's mark at
 * dismissal. {how, at, person (who took them), by (who recorded it), title (the list)}, or null.
 */
create function app.gone_home(s uuid, d date) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(x) from (
    select 'carline' as how, c.picked_up_at as at, app.checkin_name(c.guardian_id) as person,
           case when c.picked_up_by is not null then app.checkin_name(c.picked_up_by) end as "by", null::text as title
      from carline_pickups c where c.student_id = s and c.day = d and c.status = 'picked_up' and c.picked_up_at is not null
    union all
    select 'office', k.at, case when k.person_id is not null then app.checkin_name(k.person_id) end,
           case when k.recorded_by is not null then app.checkin_name(k.recorded_by) end, null
      from school_checks k where k.student_id = s and k.day = d and k.kind = 'out'
    union all
    select case when l.extended_care then 'extended_care' else 'list' end, r.at, app.checkin_name(r.released_to),
           case when r.released_by is not null then app.checkin_name(r.released_by) end, l.title
      from checkout_releases r join checkout_lists l on l.id = r.list_id where r.student_id = s and l.day = d
    union all
    select x.how, x.at, null, case when x.marked_by is not null then app.checkin_name(x.marked_by) end, null
      from dismissals x where x.student_id = s and x.day = d
  ) x
  where x.at > coalesce((select max(k.at) from school_checks k where k.student_id = s and k.day = d and k.kind = 'in'), '-infinity'::timestamptz)
  order by x.at desc limit 1
$$;

/**
 * Where a student stands on a day: 'home' (gone home, above), 'here' (their teacher marked them present or late, or the
 * office checked them in), 'absent' (marked absent, or their parents reported them absent) or 'unmarked'.
 */
create function app.student_state(s uuid, d date) returns text
language sql stable security definer set search_path = public as $$
  select case
    when app.gone_home(s, d) is not null then 'home'
    when exists (select 1 from class_attendance where student_id = s and day = d and status in ('present', 'late'))
      or exists (select 1 from school_checks where student_id = s and day = d and kind = 'in') then 'here'
    when exists (select 1 from class_attendance where student_id = s and day = d and status = 'absent')
      or exists (select 1 from absence_reports where student_id = s and status = 'reported' and kind = 'absent'
                 and d between starts_on and ends_on) then 'absent'
    else 'unmarked' end
$$;

/**
 * Why a student stays after dismissal: one of the day's activity events they're signed up for that's still going on
 * then ({kind: 'activity', title, away}), or extended care ({kind: 'extended_care'}). Null when neither.
 */
create function app.staying_for(s uuid, d date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('kind', 'activity', 'title', sp.name || ': ' || e.title, 'away', coalesce(e.home = false, false))
       from sport_registrations r join sport_events e on e.season_id = r.season_id
       join sport_seasons ss on ss.id = e.season_id join sports sp on sp.id = ss.sport_id
       where r.student_id = s and r.status = 'registered' and not e.cancelled
         and (e.starts_at at time zone 'America/Chicago')::date = d
         and coalesce(e.ends_at, e.starts_at + interval '2 hours') > app.dismissal_at(d)
       order by e.starts_at limit 1),
    case when app.in_extended_care(s, d) then jsonb_build_object('kind', 'extended_care', 'title', 'Extended care') end)
$$;

/** The On-Site Attendance group a student is in: class (before dismissal), activities, extendedCare or notHome (after), or home, absent, unmarked. */
create function app.on_site_bucket(state text, staying jsonb, after boolean) returns text
language sql immutable as $$
  select case when state <> 'here' then state when not after then 'class'
    when staying ->> 'kind' = 'activity' then 'activities' when staying ->> 'kind' = 'extended_care' then 'extendedCare'
    else 'notHome' end
$$;

/** Extended care staff or the office: today's Extended care check-out list, with today's students who are here (added as they arrive). */
create function public.extended_care_list() returns uuid
language plpgsql security definer set search_path = public as $$
declare list uuid; d date := app.school_today();
begin
  if not app.extended_care_staff() and not (app.is_staff() and app.has_permission('checkin.manage')) then
    if app.is_staff() then perform app.require_permission('checkin.manage'); end if;
    raise exception 'Only extended care staff and the office run extended care.' using errcode = '42501';
  end if;
  insert into checkout_lists (title, day, extended_care) values ('Extended care', d, true)
  on conflict (day) where extended_care do nothing;
  select id into list from checkout_lists where day = d and extended_care;
  insert into checkout_list_students (list_id, student_id)
  select list, e.student_id from extended_care e join profiles p on p.id = e.student_id
  where p.school_role = 'student' and app.in_extended_care(e.student_id, d) and app.student_state(e.student_id, d) = 'here'
  on conflict do nothing;
  return list;
end $$;

/** A class's teacher (or the office, or a sub on duty): mark students gone home today and how (null takes it back). Parents are told. */
create function public.dismissal_mark(p_section text, p_students uuid[], p_how text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare s uuid; d date := app.school_today(); kid text;
begin
  if not app.takes_roll(p_section) then
    raise exception 'Only the class''s teacher and the office can mark who went home.' using errcode = '42501';
  end if;
  if p_how is not null and p_how not in ('walked', 'drove', 'bus', 'other') then raise exception 'Choose how they went home.'; end if;
  if char_length(coalesce(p_note, '')) > 200 then raise exception 'Keep the note under 200 characters.'; end if;
  foreach s in array coalesce(p_students, '{}') loop
    if not exists (select 1 from app.section_students(p_section) x where x = s) then
      raise exception '% isn''t in this class.', app.checkin_name(s);
    end if;
  end loop;
  foreach s in array coalesce(p_students, '{}') loop
    if p_how is null then
      delete from dismissals where student_id = s and day = d;
    else
      insert into dismissals (student_id, day, how, note, marked_by) values (s, d, p_how, trim(coalesce(p_note, '')), auth.uid())
      on conflict (student_id, day) do update set how = excluded.how, note = excluded.note, marked_by = excluded.marked_by, at = now();
      kid := app.checkin_name(s);
      perform app.notify_parents(s, '🏠 ' || kid || ' went home',
        concat_ws(' · ', app.dismissal_how(p_how), app.checkin_time(now()), 'marked by ' || app.checkin_name(auth.uid())),
        jsonb_build_object('dismissal', true, 'children', true));
    end if;
  end loop;
end $$;

-- The class roll also shows who has gone home and how, who's staying (an activity, extended care), and the dismissal time.
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
      'canDismiss', d = app.school_today(), 'dismissal', to_char(app.dismissal_at(d) at time zone 'America/Chicago', 'HH24:MI'),
      'students', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'grade', p.grade,
          'mark', a.status, 'markedBy', case when a.marked_by is not null then app.checkin_name(a.marked_by) end,
          'state', app.attendance_state(r.id, p.id, d), 'left', app.left_school(p.id, d),
          'home', app.gone_home(p.id, d), 'staying', app.staying_for(p.id, d),
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

-- ----------------------------------------------------------------------
-- The Admin portal's On-Site Attendance (checkin.manage)
-- ----------------------------------------------------------------------

/** Counts only: faculty and staff here (of those expected), visitors here (with the people with them), and students by group. */
create function public.on_site_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := app.school_today(); after boolean := now() >= app.dismissal_at(app.school_today()); students jsonb;
begin
  perform app.require_permission('checkin.manage');
  select jsonb_build_object('total', count(*), 'here', count(*) filter (where x.state = 'here'),
      'class', count(*) filter (where x.bucket = 'class'), 'activities', count(*) filter (where x.bucket = 'activities'),
      'extendedCare', count(*) filter (where x.bucket = 'extendedCare'), 'notHome', count(*) filter (where x.bucket = 'notHome'),
      'home', count(*) filter (where x.state = 'home'), 'absent', count(*) filter (where x.state = 'absent'),
      'unmarked', count(*) filter (where x.state = 'unmarked'))
    into students
  from (select y.state, app.on_site_bucket(y.state, case when y.state = 'here' and after then app.staying_for(y.id, d) end, after) as bucket
        from (select p.id, app.student_state(p.id, d) as state from profiles p where p.school_role = 'student') y) x;
  return jsonb_build_object('day', d, 'dismissal', to_char(app.dismissal_at(d) at time zone 'America/Chicago', 'HH24:MI'),
    'afterDismissal', after, 'students', students,
    'faculty', (select jsonb_build_object('here', count(*) filter (where app.on_campus(c, d)), 'total', count(*))
      from app.campus_people(d) c where app.campus_role(c) = 'faculty'),
    'staff', (select jsonb_build_object('here', count(*) filter (where app.on_campus(c, d)), 'total', count(*))
      from app.campus_people(d) c where app.campus_role(c) = 'staff'),
    'visitors', (select jsonb_build_object('here', coalesce(sum(1 + v.guests) filter (where v.signed_out_at is null), 0),
        'today', coalesce(sum(1 + v.guests), 0)) from campus_visitors v where v.day = d));
end $$;

/** Who: each teacher and staff member expected today (here or not, and when they came and went), and each student with where they stand. */
create function public.on_site_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := app.school_today(); after boolean := now() >= app.dismissal_at(app.school_today());
begin
  perform app.require_permission('checkin.manage');
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', trim(p.first_name || ' ' || p.last_name),
        'role', app.campus_role(p.id), 'schoolRole', p.school_role, 'here', app.on_campus(p.id, d),
        'in', (select min(k.at) from campus_checks k where k.person_id = p.id and k.day = d and k.kind = 'in'),
        'out', (select max(k.at) from campus_checks k where k.person_id = p.id and k.day = d and k.kind = 'out'))
        order by p.last_name, p.first_name)
      from profiles p where p.id in (select app.campus_people(d))), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'grade', y.grade, 'state', y.state,
        'bucket', app.on_site_bucket(y.state, y.staying, after), 'home', y.home, 'staying', y.staying) order by y.last, y.first)
      from (select p.id, trim(p.first_name || ' ' || p.last_name) as name, p.grade, p.first_name as first, p.last_name as last,
                   app.student_state(p.id, d) as state, app.gone_home(p.id, d) as home, app.staying_for(p.id, d) as staying
            from profiles p where p.school_role = 'student') y), '[]'::jsonb));
end $$;

/** checkin.manage: when the school day ends (after it, students still here are at activities, extended care, or not sent home yet). */
create function public.on_site_set_dismissal(p_time time) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('checkin.manage');
  if p_time is null or p_time not between '11:00' and '18:00' then raise exception 'Choose a time between 11 AM and 6 PM.'; end if;
  insert into app.settings (key, value) values ('dismissal_time', to_char(p_time, 'HH24:MI'))
  on conflict (key) do update set value = excluded.value;
  perform app.audit(null, 'onsite.dismissal', null, jsonb_build_object('time', to_char(p_time, 'HH24:MI')));
end $$;

-- ----------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------

grant select on public.campus_checks, public.campus_visitors, public.extended_care, public.dismissals to authenticated;
grant all on public.campus_checks, public.campus_visitors, public.extended_care, public.dismissals to service_role;

grant execute on function app.extended_care_staff(uuid), app.manages_extended_care(uuid), app.campus_role(uuid)
  to authenticated, service_role;

revoke all on function public.my_campus_status(), public.campus_check(text, float8, float8, float8), public.campus_check_for(uuid, text),
  public.visitor_sign_in(text, text, int, uuid), public.visitor_sign_out(uuid), public.visitor_remove(uuid), public.visitors_today(),
  public.extended_care_set(uuid, int[], text), public.extended_care_roster(), public.extended_care_search(text),
  public.extended_care_staff_list(), public.extended_care_set_staff(uuid, boolean), public.extended_care_list(),
  public.dismissal_mark(text, uuid[], text, text), public.on_site_today(), public.on_site_list(), public.on_site_set_dismissal(time)
  from public, anon;
grant execute on function public.my_campus_status(), public.campus_check(text, float8, float8, float8), public.campus_check_for(uuid, text),
  public.visitor_sign_in(text, text, int, uuid), public.visitor_sign_out(uuid), public.visitor_remove(uuid), public.visitors_today(),
  public.extended_care_set(uuid, int[], text), public.extended_care_roster(), public.extended_care_search(text),
  public.extended_care_staff_list(), public.extended_care_set_staff(uuid, boolean), public.extended_care_list(),
  public.dismissal_mark(text, uuid[], text, text), public.on_site_today(), public.on_site_list(), public.on_site_set_dismissal(time)
  to authenticated, service_role;
