-- Volunteer time slots: an opportunity for people's time can run at several times (book fair helpers Monday 3–5 and
-- Tuesday 3–5), each with its own spots. Each extra slot is its own opportunity posted with the first (slot_of), with
-- the same title, details, place, event, photo, privacy and leader, so sign-ups, invites, check-in, reminders and hours
-- work per slot as before. The app shows them as one opportunity with its time slots. Item requests have a bring-by
-- date instead, so they have no slots.

alter table public.volunteer_opportunities
  add column slot_of uuid references public.volunteer_opportunities (id) on delete cascade;   -- null: the first slot
create index on public.volunteer_opportunities (slot_of);

/** The opportunity a time slot belongs with: the first one posted (itself, for the first). */
create function app.volunteer_series(o uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(slot_of, id) from volunteer_opportunities where id = o
$$;

/**
 * Its leader (its event's leader, groups.manage) adds a time slot: another day or time for the same help, with its own
 * spots (null: no limit). Returns the new slot.
 */
create function public.volunteer_add_slot(p_opportunity uuid, p_starts_on date, p_ends_on date default null,
                                          p_start_time time default null, p_end_time time default null, p_spots int default null)
returns public.volunteer_opportunities
language plpgsql security definer set search_path = public as $$
declare r volunteer_opportunities%rowtype; slot volunteer_opportunities%rowtype; series uuid; ends date := nullif(p_ends_on, p_starts_on);
begin
  select * into r from volunteer_opportunities where id = p_opportunity;
  if not found or not app.runs_volunteer(p_opportunity) then
    raise exception 'Only its leader can add time slots.' using errcode = '42501';
  end if;
  if r.status <> 'open' then raise exception 'That opportunity isn''t open anymore.'; end if;
  if r.kind = 'items' then raise exception 'Item requests have a bring-by date, not time slots.'; end if;
  if p_starts_on is null then raise exception 'Choose the day of the time slot.'; end if;
  if p_starts_on < app.school_today() then raise exception 'A time slot can''t be in the past.'; end if;
  if ends < p_starts_on then raise exception 'The end date must be on or after the start.'; end if;
  if ends is null and p_end_time <= p_start_time then raise exception 'The end time must be after the start time.'; end if;
  if p_spots is not null and p_spots not between 1 and 500 then raise exception 'Spots must be from 1 to 500, or no limit.'; end if;
  series := coalesce(r.slot_of, r.id);
  if exists (select 1 from volunteer_opportunities
             where coalesce(slot_of, id) = series and status = 'open' and starts_on = p_starts_on
               and coalesce(ends_on, starts_on) = coalesce(ends, p_starts_on)
               and start_time is not distinct from p_start_time and end_time is not distinct from p_end_time) then
    raise exception 'That time slot is already there.';
  end if;
  insert into volunteer_opportunities (lead_id, title, description, starts_on, ends_on, start_time, end_time, location, spots,
                                       kind, event_id, position, invite_only, image, slot_of)
  values (r.lead_id, r.title, r.description, p_starts_on, ends, p_start_time, p_end_time, r.location, p_spots,
          'help', r.event_id, r.position, r.invite_only, r.image, series)
  returning * into slot;
  return slot;
end $$;

/** Moving an opportunity into or out of an event moves all its time slots. */
create or replace function public.volunteer_set_event(p_opportunity uuid, p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event is not null and not exists (select 1 from volunteer_events where id = p_event and status = 'open') then
    raise exception 'That event isn''t open anymore.';
  end if;
  update volunteer_opportunities set event_id = p_event, position = null
  where coalesce(slot_of, id) = app.volunteer_series(p_opportunity) and lead_id = auth.uid() and status = 'open';
  if not found then raise exception 'You can only move opportunities you lead.' using errcode = '42501'; end if;
end $$;

/** An event's order: an opportunity's place (by any of its slots' ids, or its first's) holds for all its time slots. */
create or replace function public.volunteer_event_reorder(p_event uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from volunteer_events where id = p_event and status = 'open'
                 and (lead_id = auth.uid() or app.has_permission('groups.manage'))) then
    raise exception 'Only the event''s leader can change the order.' using errcode = '42501';
  end if;
  update volunteer_opportunities o set position = (
    select min(array_position(p_order, x.id)) from volunteer_opportunities x where coalesce(x.slot_of, x.id) = coalesce(o.slot_of, o.id))
  where o.event_id = p_event;
end $$;

/** The cover photo goes on all its open time slots. */
create or replace function public.volunteer_set_image(p_opportunity uuid, p_image text) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not app.runs_volunteer(p_opportunity) then
    raise exception 'Only its leader can change its photo.' using errcode = '42501';
  end if;
  perform app.check_volunteer_image(p_image);
  select image into old from volunteer_opportunities where id = p_opportunity and status = 'open' for update;
  if not found then raise exception 'That opportunity isn''t open anymore.'; end if;
  update volunteer_opportunities set image = p_image
  where coalesce(slot_of, id) = app.volunteer_series(p_opportunity) and status = 'open';
  return app.unused_volunteer_image(old, p_image);
end $$;

revoke all on function app.volunteer_series(uuid), public.volunteer_add_slot(uuid, date, date, time, time, int) from public, anon;
grant execute on function public.volunteer_add_slot(uuid, date, date, time, time, int) to authenticated, service_role;
