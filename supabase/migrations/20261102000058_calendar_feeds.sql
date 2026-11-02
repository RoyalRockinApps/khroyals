-- Calendar subscriptions: each person gets one private link that Google Calendar, Outlook, Yahoo
-- and Apple Calendar subscribe to, and that keeps itself up to date (a moved or cancelled game
-- changes there too). The calendar-feed Edge Function turns calendar_feed_events() into the
-- standard calendar format; the link is the only key, so a new link turns the old one off.
--
-- What's in it, for the person the link belongs to:
--   - the school calendar (everyone);
--   - their own events and the activity items they plan to go to (teachers and staff, My calendar);
--   - the activities of their children, or their own as a student (registered seasons).
-- Names stay in the app: the feed carries what, when and where, never a student's name.

create table public.calendar_feeds (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  token        text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.calendar_feeds enable row level security;
create policy "your own link" on public.calendar_feeds for select to authenticated using (user_id = auth.uid());
grant select on public.calendar_feeds to authenticated;
revoke insert, update, delete on public.calendar_feeds from anon, authenticated;
grant all on public.calendar_feeds to service_role;

create function app.new_feed_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

/** Your calendar link's key (made the first time); `p_new` makes a new one, which turns the old link off. */
create function public.calendar_feed_token(p_new boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if app.school_role() is null then raise exception 'Sign in with an approved account first.' using errcode = '42501'; end if;
  if p_new then
    insert into calendar_feeds (user_id, token) values (auth.uid(), app.new_feed_token())
    on conflict (user_id) do update set token = excluded.token, created_at = now(), last_used_at = null
    returning token into t;
  else
    insert into calendar_feeds (user_id, token) values (auth.uid(), app.new_feed_token()) on conflict (user_id) do nothing;
    select token into t from calendar_feeds where user_id = auth.uid();
  end if;
  return t;
end $$;

/**
 * The events behind a calendar link, from 60 days ago to a year ahead. Times are exact moments;
 * all-day events have dates instead (`end_date` is the last day). No student names.
 */
create function public.calendar_feed_events(p_token text)
returns table (uid text, title text, starts_at timestamptz, ends_at timestamptz, start_date date, end_date date,
               location text, details text, cancelled boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare u uuid; tz constant text := 'America/Chicago'; since date := app.school_today() - 60; until date := app.school_today() + 366;
begin
  update calendar_feeds set last_used_at = now() where token = p_token returning user_id into u;
  if u is null or app.school_role(u) is null then return; end if;   -- a link turned off, or an account no longer approved

  return query
  -- The school calendar.
  select 'school-' || e.id, e.title,
         case when e.all_day or e.start_time is null then null else (e.starts_on + e.start_time) at time zone tz end,
         case when e.all_day or e.start_time is null or e.end_time is null then null
              else (coalesce(e.ends_on, e.starts_on) + e.end_time) at time zone tz end,
         case when e.all_day or e.start_time is null then e.starts_on end,
         case when e.all_day or e.start_time is null then coalesce(e.ends_on, e.starts_on) end,
         e.location, e.category, false, e.created_at
  from events e
  where e.group_id is null and coalesce(e.ends_on, e.starts_on) >= since and e.starts_on <= until

  union all
  -- My calendar: their own events (teachers and staff).
  select 'mine-' || pe.id, pe.title,
         case when pe.start_time is null then null else (pe.starts_on + pe.start_time) at time zone tz end,
         case when pe.end_time is null then null else (pe.starts_on + pe.end_time) at time zone tz end,
         case when pe.start_time is null then pe.starts_on end,
         case when pe.start_time is null then pe.starts_on end,
         pe.location, nullif(pe.notes, ''), false, pe.updated_at
  from personal_events pe
  where pe.owner_id = u and pe.sport_event_id is null and app.is_staff(u) and pe.starts_on between since and until

  union all
  -- Activity items: the ones they plan to go to (staff), and their children's or their own (registered).
  select 'activity-' || e.id, app.sport_label(se.sport_id) || ' · ' || e.title,
         e.starts_at, coalesce(e.ends_at, e.starts_at + interval '2 hours'), null::date, null::date,
         concat_ws(', ', nullif(e.location, ''), nullif(e.address, '')), nullif(e.notes, ''), e.cancelled, e.updated_at
  from sport_events e
  join sport_seasons se on se.id = e.season_id
  where (e.starts_at at time zone tz)::date between since and until
    and (exists (select 1 from personal_events pe where pe.owner_id = u and pe.sport_event_id = e.id and app.is_staff(u))
         or exists (select 1 from sport_registrations r where r.season_id = e.season_id and r.status = 'registered'
                    and r.student_id in (select app.my_students(u))));
end $$;

revoke all on function public.calendar_feed_token(boolean), public.calendar_feed_events(text) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated, service_role;
-- The link works without signing in: calendar apps can't sign in. The key in it is the only way in.
grant execute on function public.calendar_feed_events(text) to anon, authenticated, service_role;

/** The app's name, for naming the subscribed calendar ("KH Royals"). Public. */
create function public.school_app_name() returns text
language sql stable security definer set search_path = app as $$ select app.brand('app_name') $$;
grant execute on function public.school_app_name() to anon, authenticated, service_role;

/**
 * One school-calendar or activity event, for "Add to calendar" ('school-<id>' or 'activity-<id>').
 * Both are public already (anyone can read the school calendar and activity schedules).
 */
create function public.calendar_event(p_uid text)
returns table (uid text, title text, starts_at timestamptz, ends_at timestamptz, start_date date, end_date date,
               location text, details text, cancelled boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'school-' || e.id, e.title,
         case when e.all_day or e.start_time is null then null else (e.starts_on + e.start_time) at time zone 'America/Chicago' end,
         case when e.all_day or e.start_time is null or e.end_time is null then null
              else (coalesce(e.ends_on, e.starts_on) + e.end_time) at time zone 'America/Chicago' end,
         case when e.all_day or e.start_time is null then e.starts_on end,
         case when e.all_day or e.start_time is null then coalesce(e.ends_on, e.starts_on) end,
         e.location, e.category, false, e.created_at
  from events e where p_uid = 'school-' || e.id and e.group_id is null
  union all
  select 'activity-' || e.id, app.sport_label(se.sport_id) || ' · ' || e.title, e.starts_at, coalesce(e.ends_at, e.starts_at + interval '2 hours'),
         null::date, null::date, concat_ws(', ', nullif(e.location, ''), nullif(e.address, '')), nullif(e.notes, ''), e.cancelled, e.updated_at
  from sport_events e join sport_seasons se on se.id = e.season_id where p_uid = 'activity-' || e.id
$$;
grant execute on function public.calendar_event(text) to anon, authenticated, service_role;
