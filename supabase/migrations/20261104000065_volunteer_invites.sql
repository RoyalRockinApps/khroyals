-- Volunteer invites.
--
-- A Volunteer Leader asks particular people to help with an opportunity (help, not item requests). Each
-- invite is answered Say Yes! (they're signed up, and it's in their My sign-ups) or Deny; the leader is told
-- either way and follows each one (waiting, said yes, then their check-in). After a Deny the leader invites
-- someone else, or deletes the opportunity.
--
-- An opportunity posted "Only people I invite" (invite_only) is a draft nobody else sees: only its leaders, the
-- people with an open or accepted invite and its volunteers. It can't be deleted with a reason the volunteers see
-- until someone said yes, so a draft is deleted without one. On an opportunity everyone sees, an invite holds its
-- spot: others can't take the spots that open invites are waiting on.

alter table public.volunteer_opportunities add column invite_only boolean not null default false;
alter table public.volunteer_opportunities add constraint volunteer_invite_only_help check (not invite_only or kind = 'help');

create table public.volunteer_invites (
  opportunity_id uuid not null references public.volunteer_opportunities (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  invited_by     uuid references public.profiles (id) on delete set null,
  -- pending: waiting for an answer; accepted: said yes (declined again if they later remove themselves);
  -- declined: Deny; cancelled: the leader called it off, or the opportunity was deleted.
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  note           text check (char_length(note) <= 300),
  created_at     timestamptz not null default now(),
  answered_at    timestamptz,
  primary key (opportunity_id, user_id)
);
create index on public.volunteer_invites (user_id, status);

alter table public.volunteer_invites enable row level security;

-- ======================================================================
-- Helpers
-- ======================================================================

/** Has an invite to this opportunity that's waiting or that they said yes to. */
create function app.invited_to(o uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from volunteer_invites where opportunity_id = o and user_id = u and status in ('pending', 'accepted'))
$$;

/** "Tue, Nov 10": an opportunity's first day, for notifications. */
create function app.volunteer_day(o public.volunteer_opportunities) returns text
language sql stable as $$
  select to_char(o.starts_on, 'FMDy, FMMon FMDD') || case when o.ends_on is not null and o.ends_on <> o.starts_on
    then ' – ' || to_char(o.ends_on, 'FMDy, FMMon FMDD') else '' end
$$;

-- Invite-only opportunities: only their leaders, the people invited and their volunteers see them.
drop policy "open opportunities, or ones you're part of" on public.volunteer_opportunities;
create policy "open opportunities, or ones you're part of" on public.volunteer_opportunities for select to authenticated
  using (app.can_volunteer() and ((status = 'open' and not invite_only) or app.in_volunteer_chat(id) or app.invited_to(id) or app.runs_volunteer(id))
         or app.has_permission('groups.manage'));

-- Who said yes, for the opportunities you can see (so an invite-only one's volunteers stay private too).
drop policy "everyone who can volunteer sees who signed up" on public.volunteer_signups;
create policy "everyone who can volunteer sees who signed up" on public.volunteer_signups for select to authenticated
  using (app.can_volunteer() and exists (select 1 from volunteer_opportunities o where o.id = opportunity_id)
         or app.has_permission('groups.manage'));

create policy "your own invites, or the opportunities you run" on public.volunteer_invites for select to authenticated
  using (user_id = auth.uid() or app.runs_volunteer(opportunity_id));

-- ======================================================================
-- API
-- ======================================================================

-- Posting takes "Only people I invite" (p_invite_only, last so older calls still work).
drop function public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int, uuid);
create function public.volunteer_post(
  p_title text, p_description text, p_starts_on date, p_ends_on date default null,
  p_start_time time default null, p_end_time time default null, p_location text default null, p_spots int default null,
  p_kind text default 'help', p_item text default null, p_quantity int default null, p_event uuid default null,
  p_invite_only boolean default false
) returns public.volunteer_opportunities
language plpgsql security definer set search_path = public as $$
declare r volunteer_opportunities%rowtype; items boolean := coalesce(p_kind, 'help') = 'items';
begin
  if not app.is_volunteer_lead() then
    raise exception 'Only Volunteer Leaders can post opportunities.' using errcode = '42501';
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

/**
 * Say Yes! (until it's full). An invite-only opportunity takes only the people invited, and on one everyone sees,
 * the spots open invites wait on are held for them. Saying yes answers your invite. The leader hears about it.
 */
create or replace function public.volunteer_say_yes(p_opportunity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; taken int; held int; invited boolean;
begin
  if not app.can_volunteer() then raise exception 'Volunteering is for parents and staff.' using errcode = '42501'; end if;
  select * into o from volunteer_opportunities where id = p_opportunity for update;  -- one sign-up at a time, so spots hold
  if not found or o.status <> 'open' then raise exception 'This opportunity isn''t available anymore.'; end if;
  if o.kind = 'items' then raise exception 'Choose how many you''ll bring.'; end if;
  if coalesce(o.ends_on, o.starts_on) < app.school_today() then raise exception 'This opportunity is over.'; end if;
  if o.lead_id = auth.uid() then raise exception 'You''re leading this one.'; end if;
  invited := exists (select 1 from volunteer_invites where opportunity_id = o.id and user_id = auth.uid() and status = 'pending');
  if o.invite_only and not invited then raise exception 'This opportunity is by invitation only.' using errcode = '42501'; end if;
  select count(*) into taken from volunteer_signups where opportunity_id = o.id;
  select count(*) into held from volunteer_invites i where i.opportunity_id = o.id and i.status = 'pending' and i.user_id <> auth.uid()
    and not exists (select 1 from volunteer_signups s where s.opportunity_id = o.id and s.user_id = i.user_id);
  if o.spots is not null and taken >= o.spots then raise exception 'All spots are filled.'; end if;
  if o.spots is not null and not invited and taken + held >= o.spots then
    raise exception 'All spots are filled or held for people who were invited.';
  end if;
  insert into volunteer_signups (opportunity_id, user_id) values (o.id, auth.uid());
  update volunteer_invites set status = 'accepted', answered_at = now()
    where opportunity_id = o.id and user_id = auth.uid() and status = 'pending';
  perform app.notify_user(o.lead_id, '🙋 ' || app.short_name(auth.uid()) || ' said yes',
    o.title || coalesce(' · ' || (taken + 1) || ' of ' || o.spots || ' spots filled', ' · ' || (taken + 1) || ' signed up') || '.',
    jsonb_build_object('opportunityId', o.id));
exception when unique_violation then
  raise exception 'You''ve already said yes.';
end $$;

/** A volunteer removes themselves; the leader is told. An invite they'd said yes to counts as declined again. */
create or replace function public.volunteer_withdraw(p_opportunity uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; q int;
begin
  delete from volunteer_signups where opportunity_id = p_opportunity and user_id = auth.uid() returning quantity into q;
  if not found then raise exception 'You''re not signed up for this.'; end if;
  update volunteer_invites set status = 'declined', answered_at = now()
    where opportunity_id = p_opportunity and user_id = auth.uid() and status = 'accepted';
  select * into o from volunteer_opportunities where id = p_opportunity;
  if o.status = 'open' and o.kind = 'items' then
    perform app.notify_user(o.lead_id, app.short_name(auth.uid()) || ' took back their pledge',
      app.short_name(auth.uid()) || ' won''t bring the ' || q || ' ' || o.item || ' for ' || o.title || '.', jsonb_build_object('opportunityId', o.id));
  elsif o.status = 'open' then
    perform app.notify_user(o.lead_id, app.short_name(auth.uid()) || ' can''t make it',
      app.short_name(auth.uid()) || ' removed themselves from ' || o.title || '.', jsonb_build_object('opportunityId', o.id));
  end if;
end $$;

/**
 * The leader (or an admin) deletes an opportunity: every volunteer gets the reason, and anyone still invited is
 * told it's called off. Until someone has said yes (a draft waiting on invites) no reason is needed.
 */
create or replace function public.volunteer_delete(p_opportunity uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; v record; why text := nullif(trim(p_reason), ''); volunteers boolean;
begin
  select * into o from volunteer_opportunities where id = p_opportunity for update;
  if not found or o.status <> 'open' then raise exception 'This opportunity is already gone.'; end if;
  if o.lead_id <> auth.uid() and not app.has_permission('groups.manage') then
    raise exception 'Only the leader can delete this opportunity.' using errcode = '42501';
  end if;
  volunteers := exists (select 1 from volunteer_signups where opportunity_id = o.id);
  if why is null and volunteers then raise exception 'Say why you''re deleting it; volunteers will see the reason.'; end if;
  update volunteer_opportunities set status = 'deleted', delete_reason = coalesce(why, 'Deleted before anyone said yes.') where id = o.id;
  for v in select user_id from volunteer_signups where opportunity_id = o.id loop
    perform app.notify_user(v.user_id, 'Cancelled: ' || o.title,
      app.short_name(auth.uid()) || ' cancelled this volunteer opportunity: ' || why, jsonb_build_object('opportunityId', o.id));
  end loop;
  for v in update volunteer_invites set status = 'cancelled', answered_at = now()
           where opportunity_id = o.id and status = 'pending' returning user_id loop
    perform app.notify_user(v.user_id, 'Invite called off: ' || o.title,
      app.short_name(auth.uid()) || ' doesn''t need help with ' || o.title || ' anymore.' || coalesce(' ' || why, ''),
      jsonb_build_object('opportunityId', o.id, 'volunteerList', true));
  end loop;
  if o.lead_id <> auth.uid() then
    perform app.audit(null, 'volunteer.deleted', o.lead_id::text, jsonb_build_object('opportunity', o.id, 'title', o.title, 'reason', why));
  end if;
end $$;

/**
 * Its leaders (the opportunity's or its event's leader, or groups.manage) invite people who can volunteer, with an
 * optional note; each is told. Someone who said no before can be asked again. On an opportunity with spots, open
 * invites and volunteers together can't be more than the spots. Returns how many were invited.
 */
create function public.volunteer_invite(p_opportunity uuid, p_users uuid[], p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; u uuid; n int := 0; taken int; why text := nullif(trim(p_note), '');
begin
  select * into o from volunteer_opportunities where id = p_opportunity for update;
  if not found or o.status <> 'open' then raise exception 'This opportunity isn''t available anymore.'; end if;
  if not app.runs_volunteer(o.id) then raise exception 'Only its leader can invite people.' using errcode = '42501'; end if;
  if o.kind = 'items' then raise exception 'Item requests go to everyone; invite people to help instead.'; end if;
  if coalesce(o.ends_on, o.starts_on) < app.school_today() then raise exception 'This opportunity is over.'; end if;
  if coalesce(cardinality(p_users), 0) = 0 then raise exception 'Choose who to invite.'; end if;
  if char_length(why) > 300 then raise exception 'Keep the note under 300 characters.'; end if;
  foreach u in array (select array_agg(distinct x) from unnest(p_users) x) loop
    if u = o.lead_id then raise exception 'You lead this one.'; end if;
    if not app.can_volunteer(u) then raise exception '% can''t volunteer.', app.short_name(u); end if;
    if exists (select 1 from volunteer_signups where opportunity_id = o.id and user_id = u) then
      raise exception '% already said yes.', app.short_name(u);
    end if;
    if exists (select 1 from volunteer_invites where opportunity_id = o.id and user_id = u and status = 'pending') then
      raise exception '% is already invited.', app.short_name(u);
    end if;
    insert into volunteer_invites (opportunity_id, user_id, invited_by, note)
    values (o.id, u, auth.uid(), why)
    on conflict (opportunity_id, user_id) do update
      set status = 'pending', invited_by = auth.uid(), note = why, created_at = now(), answered_at = null;
    perform app.notify_user(u, '✉️ ' || app.short_name(auth.uid()) || ' invited you to volunteer',
      o.title || ' on ' || app.volunteer_day(o) || '.' || coalesce(' "' || why || '"', ''),
      jsonb_build_object('opportunityId', o.id));
    n := n + 1;
  end loop;
  select (select count(*) from volunteer_signups where opportunity_id = o.id)
       + (select count(*) from volunteer_invites where opportunity_id = o.id and status = 'pending') into taken;
  if o.spots is not null and taken > o.spots then
    raise exception 'That''s more people than the % spot(s): invite fewer, or add spots.', o.spots;
  end if;
  return n;
end $$;

/**
 * Answer an invite: Say Yes! signs you up (as volunteer_say_yes, which tells the leader), Deny tells whoever invited
 * you, so they can invite someone else.
 */
create function public.volunteer_invite_answer(p_opportunity uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype; i volunteer_invites%rowtype; who uuid;
begin
  select * into i from volunteer_invites where opportunity_id = p_opportunity and user_id = auth.uid();
  if not found then raise exception 'You don''t have an invite to this.'; end if;
  if i.status <> 'pending' then
    raise exception '%', case i.status when 'accepted' then 'You''ve already said yes.' when 'declined' then 'You already said no to this one.'
      else 'This invite was called off.' end;
  end if;
  select * into o from volunteer_opportunities where id = p_opportunity;
  who := coalesce(i.invited_by, o.lead_id);
  if p_yes then
    perform public.volunteer_say_yes(p_opportunity);
    -- The leader heard from volunteer_say_yes; someone else who sent it (the event's leader) hears too.
    if who <> o.lead_id then
      perform app.notify_user(who, '🙋 ' || app.short_name(auth.uid()) || ' said yes to your invite',
        o.title || ' on ' || app.volunteer_day(o) || '.', jsonb_build_object('opportunityId', o.id));
    end if;
    return;
  end if;
  update volunteer_invites set status = 'declined', answered_at = now() where opportunity_id = o.id and user_id = auth.uid();
  if o.status = 'open' then
    perform app.notify_user(who, app.short_name(auth.uid()) || ' can''t help with ' || o.title,
      case when o.invite_only and not exists (select 1 from volunteer_signups where opportunity_id = o.id)
        then 'Invite someone else, or delete the draft.' else 'Invite someone else from the opportunity.' end,
      jsonb_build_object('opportunityId', o.id));
  end if;
end $$;

/** Its leaders call off an invite that's still waiting; the person is told. */
create function public.volunteer_invite_cancel(p_opportunity uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o volunteer_opportunities%rowtype;
begin
  select * into o from volunteer_opportunities where id = p_opportunity;
  if not found or not app.runs_volunteer(o.id) then raise exception 'Only its leader can call off an invite.' using errcode = '42501'; end if;
  update volunteer_invites set status = 'cancelled', answered_at = now()
    where opportunity_id = o.id and user_id = p_user and status = 'pending';
  if not found then raise exception 'That invite isn''t waiting for an answer.'; end if;
  perform app.notify_user(p_user, 'Invite called off: ' || o.title,
    app.short_name(auth.uid()) || ' called off the invite to ' || o.title || '.',
    jsonb_build_object('opportunityId', o.id, 'volunteerList', true));
end $$;

/**
 * For inviting: people who can volunteer whose name matches (names and roles only, never email), with where they
 * stand on this opportunity: invited (pending / accepted / declined), signed up, or nothing yet. Its leaders only.
 */
create function public.volunteer_invite_people(p_opportunity uuid, p_search text default '')
returns table (id uuid, name text, school_role text, invite text, signed_up boolean)
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(trim(coalesce(p_search, '')));
begin
  if not app.runs_volunteer(p_opportunity) then raise exception 'Only its leader can invite people.' using errcode = '42501'; end if;
  return query
  select p.id, trim(p.first_name || ' ' || p.last_name), p.school_role, i.status,
         exists (select 1 from volunteer_signups s where s.opportunity_id = p_opportunity and s.user_id = p.id)
  from profiles p
  left join volunteer_invites i on i.opportunity_id = p_opportunity and i.user_id = p.id and i.status <> 'cancelled'
  where app.can_volunteer(p.id) and p.id <> auth.uid()
    and p.id <> (select lead_id from volunteer_opportunities where volunteer_opportunities.id = p_opportunity)
    and (q = '' or lower(p.first_name || ' ' || p.last_name) like '%' || q || '%' or lower(p.last_name) like q || '%')
  order by p.last_name, p.first_name
  limit 25;
end $$;

-- ======================================================================
-- Privileges
-- ======================================================================

revoke all on function app.invited_to(uuid, uuid), app.volunteer_day(public.volunteer_opportunities) from public, anon;
grant execute on function app.invited_to(uuid, uuid), app.volunteer_day(public.volunteer_opportunities) to authenticated, service_role;

revoke all on function public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int, uuid, boolean),
  public.volunteer_invite(uuid, uuid[], text), public.volunteer_invite_answer(uuid, boolean),
  public.volunteer_invite_cancel(uuid, uuid), public.volunteer_invite_people(uuid, text)
  from public, anon;
grant execute on function public.volunteer_post(text, text, date, date, time, time, text, int, text, text, int, uuid, boolean),
  public.volunteer_invite(uuid, uuid[], text), public.volunteer_invite_answer(uuid, boolean),
  public.volunteer_invite_cancel(uuid, uuid), public.volunteer_invite_people(uuid, text)
  to authenticated, service_role;

grant select on public.volunteer_invites to authenticated;
grant all on public.volunteer_invites to service_role;

alter publication supabase_realtime add table public.volunteer_invites;
