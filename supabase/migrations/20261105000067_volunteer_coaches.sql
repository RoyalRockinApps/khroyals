-- Coaches post in Volunteer.
--
-- An activity's coaches and directors (sport_coaches, who are staff) post volunteer opportunities and start volunteer
-- events the way Volunteer Leaders do: concession stand helpers for a game, drivers to an away meet, a cast party.
-- They lead what they post (check-in, invites, marking who came). Volunteer analytics stay with Volunteer Leaders
-- and directors (app.sees_volunteer_stats).

/** Coaches or directs an activity: on its sport_coaches (staff only, as app.can_manage_sport). */
create function app.is_coach(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_staff(u) and exists (select 1 from sport_coaches where user_id = u)
$$;

/** Posts volunteer opportunities and starts volunteer events: Volunteer Leaders and coaches. */
create function app.posts_volunteer(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_volunteer_lead(u) or app.is_coach(u)
$$;

/** Posting an opportunity: Volunteer Leaders and coaches (as before otherwise). */
create or replace function public.volunteer_post(
  p_title text, p_description text, p_starts_on date, p_ends_on date default null,
  p_start_time time default null, p_end_time time default null, p_location text default null, p_spots int default null,
  p_kind text default 'help', p_item text default null, p_quantity int default null, p_event uuid default null,
  p_invite_only boolean default false
) returns public.volunteer_opportunities
language plpgsql security definer set search_path = public as $$
declare r volunteer_opportunities%rowtype; items boolean := coalesce(p_kind, 'help') = 'items';
begin
  if not app.posts_volunteer() then
    raise exception 'Only Volunteer Leaders and coaches can post opportunities.' using errcode = '42501';
  end if;
  if items and nullif(trim(p_item), '') is null then raise exception 'Say what you need, like "boxes of tissues".'; end if;
  if items and coalesce(p_quantity, 0) < 1 then raise exception 'Say how many you need.'; end if;
  if items and coalesce(p_invite_only, false) then raise exception 'Item requests go to everyone; invite people to help instead.'; end if;
  if p_event is not null and not exists (select 1 from volunteer_events where id = p_event and status = 'open') then
    raise exception 'That event isn''t open anymore.';
  end if;
  insert into volunteer_opportunities (lead_id, title, description, starts_on, ends_on, start_time, end_time, location, spots,
                                       kind, item, quantity, event_id, invite_only)
  values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_starts_on, p_ends_on, p_start_time, p_end_time,
          nullif(trim(p_location), ''), case when items then null else p_spots end,
          case when items then 'items' else 'help' end, case when items then trim(p_item) end, case when items then p_quantity end, p_event,
          coalesce(p_invite_only, false))
  returning * into r;
  return r;
end $$;

/** Volunteer Leaders and coaches: start an event (p_id null) or change one you started. */
create or replace function public.volunteer_event_save(p_id uuid, p_title text, p_description text, p_starts_on date,
                                            p_ends_on date default null, p_location text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not app.posts_volunteer() then raise exception 'Only Volunteer Leaders and coaches can start events.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the event a name, like "Harvest Fest".'; end if;
  if p_starts_on is null then raise exception 'Choose the day of the event.'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'The event has to end on or after the day it starts.'; end if;
  if p_id is null then
    insert into volunteer_events (lead_id, title, description, starts_on, ends_on, location)
    values (auth.uid(), trim(p_title), coalesce(trim(p_description), ''), p_starts_on, p_ends_on, nullif(trim(p_location), ''))
    returning id into new_id;
    return new_id;
  end if;
  update volunteer_events set title = trim(p_title), description = coalesce(trim(p_description), ''), starts_on = p_starts_on,
    ends_on = p_ends_on, location = nullif(trim(p_location), '')
  where id = p_id and lead_id = auth.uid() and status = 'open';
  if not found then raise exception 'You can only change events you started.' using errcode = '42501'; end if;
  return p_id;
end $$;

revoke all on function app.is_coach(uuid), app.posts_volunteer(uuid) from public, anon;
grant execute on function app.is_coach(uuid), app.posts_volunteer(uuid) to authenticated, service_role;
