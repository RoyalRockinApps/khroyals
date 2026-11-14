-- Announcements (the staff Announcements app; push.send holders, an admin power): one message sent as a phone push and
-- to the bell, and/or shown as a splash page, a full-screen graphic people see once when they open the app between two
-- dates and close to carry on. To everyone, roles, grades or academies (their students and/or parents), classes (a
-- teacher board's students and/or parents), a group, or picked people; now or at a set time (Central). Tapping it opens
-- a screen in the app, or the announcement itself. Results are counts only, never who.

create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid references public.profiles (id) on delete set null,
  title            text not null check (char_length(trim(title)) between 1 and 80),
  body             text not null default '' check (char_length(body) <= 1000),
  audience         jsonb not null,
  audience_label   text not null default '' check (char_length(audience_label) <= 200),  -- "Parents · 8th" for the history
  urgent           boolean not null default false,  -- the push ignores quiet hours and the person's settings
  link             text check (link is null or link ~ '^/[A-Za-z][A-Za-z0-9/_?=&.-]*$'),     -- a screen in the app, never a website
  push             boolean not null default true,   -- a push and a bell notification
  send_at          timestamptz not null default now(),
  sent_at          timestamptz,
  reach            int,
  cancelled_at     timestamptz,
  splash           boolean not null default false,
  splash_image     text,   -- 'announcements' bucket: an uploaded graphic, "<uploader id>/<file>.jpg"
  splash_template  text check (splash_template in ('navy', 'gold', 'red', 'confetti')),
  splash_photo     text,   -- a template's photo, same bucket
  splash_headline  text not null default '' check (char_length(splash_headline) <= 60),
  splash_text      text not null default '' check (char_length(splash_text) <= 300),
  splash_button    text not null default '' check (char_length(splash_button) <= 30),
  splash_starts_on date,
  splash_ends_on   date,
  created_at       timestamptz not null default now(),
  check (push or splash),
  check (not push or char_length(trim(body)) > 0),
  check (not splash or ((splash_image is not null) <> (splash_template is not null)
                        and splash_starts_on is not null and splash_ends_on >= splash_starts_on))
);
create index on public.announcements (send_at) where sent_at is null and cancelled_at is null;

/** Who saw, closed or tapped a splash page (each person once; counts only leave this table). */
create table public.announcement_views (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  seen_at         timestamptz not null default now(),
  closed_at       timestamptz,
  tapped_at       timestamptz,
  primary key (announcement_id, user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_views enable row level security;
create policy "senders" on public.announcements for select to authenticated using (app.has_permission('push.send'));
create policy "only their own" on public.announcement_views for select to authenticated using (user_id = auth.uid());
revoke all on public.announcements, public.announcement_views from anon;
grant select on public.announcements, public.announcement_views to authenticated;
revoke insert, update, delete on public.announcements, public.announcement_views from authenticated;
grant all on public.announcements, public.announcement_views to service_role;

-- ----------------------------------------------------------------------
-- Who an announcement is for
-- ----------------------------------------------------------------------

/**
 * The audience, as the app sends it: {kind: 'everyone'} | {kind: 'roles', roles: [...]} | {kind: 'grades', grades: [...]}
 * | {kind: 'academies', academies: [...]} | {kind: 'classes', boards: [...]} (each with parents and/or students) |
 * {kind: 'group', group} | {kind: 'people', people: [...]}. Raises when it's not one of these.
 */
create function app.check_audience(a jsonb) returns void
language plpgsql immutable as $$
declare k text := a->>'kind';
begin
  if k is null or k not in ('everyone', 'roles', 'grades', 'academies', 'classes', 'group', 'people') then
    raise exception 'Choose who it''s for.';
  end if;
  if k = 'roles' and jsonb_array_length(coalesce(a->'roles', '[]')) = 0 then raise exception 'Pick at least one role.'; end if;
  if k = 'grades' and jsonb_array_length(coalesce(a->'grades', '[]')) = 0 then raise exception 'Pick at least one grade.'; end if;
  if k = 'academies' and jsonb_array_length(coalesce(a->'academies', '[]')) = 0 then raise exception 'Pick at least one academy.'; end if;
  if k = 'classes' and jsonb_array_length(coalesce(a->'boards', '[]')) = 0 then raise exception 'Pick at least one class.'; end if;
  if k = 'group' and a->>'group' is null then raise exception 'Pick a group.'; end if;
  if k = 'people' and jsonb_array_length(coalesce(a->'people', '[]')) = 0 then raise exception 'Pick at least one person.'; end if;
  if k in ('grades', 'academies', 'classes') and not (coalesce((a->>'parents')::boolean, false) or coalesce((a->>'students')::boolean, false)) then
    raise exception 'Send it to their parents, the students, or both.';
  end if;
end $$;

/** Is this approved account (with a login) in the audience? */
create function app.in_audience(a jsonb, u uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p profiles%rowtype; k text := a->>'kind'; par boolean := coalesce((a->>'parents')::boolean, false);
        stu boolean := coalesce((a->>'students')::boolean, false); grades int[];
begin
  select * into p from profiles where id = u;
  if not found or p.school_role is null or p.managed then return false; end if;
  if k = 'everyone' then return true; end if;
  if k = 'roles' then return p.school_role in (select jsonb_array_elements_text(a->'roles')); end if;
  if k = 'people' then return u::text in (select jsonb_array_elements_text(a->'people')); end if;
  if k = 'group' then return exists (select 1 from memberships m where m.group_id = (a->>'group')::uuid and m.user_id = u); end if;
  if k in ('grades', 'academies') then
    grades := case when k = 'grades' then array(select jsonb_array_elements_text(a->'grades')::int)
              else array(select generate_series(x.min_grade, x.max_grade) from academies x
                         where x.id in (select jsonb_array_elements_text(a->'academies'))) end;
    return (stu and p.school_role = 'student' and p.grade = any (grades))
        or (par and exists (select 1 from guardians g join profiles c on c.id = g.student_id
                            where g.guardian_id = u and c.school_role = 'student' and c.grade = any (grades)
                              and app.is_guardian_of(c.id, u)));
  end if;
  if k = 'classes' then
    return exists (select 1 from jsonb_array_elements_text(a->'boards') b, app.board_students(b::uuid) s
                   where (stu and s = u) or (par and app.is_guardian_of(s, u)));
  end if;
  return false;
end $$;

/** Everyone it reaches (the sender left out). */
create function app.announcement_targets(a jsonb, sender uuid default auth.uid()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p where p.school_role is not null and not p.managed and p.id is distinct from sender and app.in_audience(a, p.id)
$$;

/** How many people an audience reaches, before sending. */
create function public.announcement_reach(p_audience jsonb) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  perform app.check_audience(p_audience);
  return (select count(*) from app.announcement_targets(p_audience));
end $$;

-- ----------------------------------------------------------------------
-- Sending
-- ----------------------------------------------------------------------

/**
 * Sends an announcement whose time has come: counts who it reaches and (with push) puts it on their bells and phones:
 * one notification for everyone or roles or a group, one each for the rest. Tapping it opens its link, else the
 * announcement (data.announcementId).
 */
create function app.deliver_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a announcements%rowtype; d jsonb; k text; u uuid;
begin
  select * into a from announcements where id = p_id and sent_at is null and cancelled_at is null for update;
  if not found then return; end if;
  update announcements set sent_at = now(), reach = (select count(*) from app.announcement_targets(a.audience, a.created_by))
  where id = p_id;
  if not a.push then return; end if;
  d := jsonb_build_object('announcementId', a.id) || case when a.link is null then '{}'::jsonb else jsonb_build_object('link', a.link) end;
  k := a.audience->>'kind';
  if k = 'everyone' then
    insert into notifications (audience, title, body, data, urgent, created_by)
    values ('everyone', a.title, a.body, d, a.urgent, a.created_by);
  elsif k = 'roles' then
    insert into notifications (audience, roles, title, body, data, urgent, created_by)
    values ('roles', array(select jsonb_array_elements_text(a.audience->'roles')), a.title, a.body, d, a.urgent, a.created_by);
  elsif k = 'group' then
    insert into notifications (audience, group_id, title, body, data, urgent, created_by)
    values ('group', (a.audience->>'group')::uuid, a.title, a.body, d, true, a.created_by);
  else
    for u in select * from app.announcement_targets(a.audience, a.created_by) loop
      insert into notifications (audience, user_id, title, body, data, urgent, created_by)
      values ('user', u, a.title, a.body, d, a.urgent, a.created_by);
    end loop;
  end if;
end $$;

/** Every minute: the scheduled ones whose time has come. */
create function app.send_due_announcements() returns int
language plpgsql security definer set search_path = public as $$
declare x uuid; n int := 0;
begin
  for x in select id from announcements where sent_at is null and cancelled_at is null and send_at <= now() order by send_at loop
    perform app.deliver_announcement(x);
    n := n + 1;
  end loop;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('send-announcements', '* * * * *', 'select app.send_due_announcements()');
  end if;
end $$;

/** A graphic the caller uploaded to their own folder of the 'announcements' bucket (or none). */
create function app.check_announcement_file(p text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p is not null and (split_part(p, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects where bucket_id = 'announcements' and name = p)) then
    raise exception 'Upload the picture first.';
  end if;
end $$;

/**
 * push.send holders send an announcement: now, or at a time (`p_send_on` + `p_send_time`, Central). `p_splash`, for a
 * splash page: {image} (an uploaded graphic) or {template, photo, headline, text}, with {button, startsOn, endsOn}.
 * Returns its id.
 */
create function public.announcement_send(
  p_title text, p_body text, p_audience jsonb, p_audience_label text default '', p_urgent boolean default false,
  p_link text default null, p_push boolean default true, p_send_on date default null, p_send_time time default null,
  p_splash jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid; at timestamptz := now(); s jsonb := p_splash;
begin
  perform app.require_permission('push.send');
  perform app.check_audience(p_audience);
  if nullif(trim(p_title), '') is null then raise exception 'Give it a title.'; end if;
  if coalesce(p_push, true) and nullif(trim(p_body), '') is null then raise exception 'Write the message.'; end if;
  if not coalesce(p_push, true) and s is null then raise exception 'Send a notification, show a splash page, or both.'; end if;
  if p_send_on is not null then
    at := (p_send_on + coalesce(p_send_time, '07:00'::time)) at time zone 'America/Chicago';
    if at < now() - interval '1 minute' then raise exception 'Pick a time from now on.'; end if;
    if at > now() + interval '90 days' then raise exception 'Schedule it within 90 days.'; end if;
  end if;
  if s is not null then
    perform app.check_announcement_file(s->>'image');
    perform app.check_announcement_file(s->>'photo');
    if (s->>'startsOn') is null or (s->>'endsOn') is null then raise exception 'Pick the days the splash page shows.'; end if;
    if (s->>'endsOn')::date < (s->>'startsOn')::date then raise exception 'The last day comes after the first.'; end if;
    if (s->>'endsOn')::date < app.school_today() then raise exception 'Pick days from today on.'; end if;
    if (s->>'endsOn')::date > (s->>'startsOn')::date + 60 then raise exception 'A splash page shows for 60 days at most.'; end if;
    if s->>'image' is null and nullif(trim(coalesce(s->>'headline', '')), '') is null then raise exception 'Give the splash page a headline.'; end if;
  end if;
  insert into announcements (created_by, title, body, audience, audience_label, urgent, link, push, send_at, splash, splash_image,
    splash_template, splash_photo, splash_headline, splash_text, splash_button, splash_starts_on, splash_ends_on)
  values (auth.uid(), trim(p_title), case when coalesce(p_push, true) then trim(p_body) else coalesce(trim(p_body), '') end,
    p_audience, left(coalesce(p_audience_label, ''), 200), coalesce(p_urgent, false), nullif(trim(p_link), ''), coalesce(p_push, true), at,
    s is not null, s->>'image', case when s is not null and s->>'image' is null then coalesce(s->>'template', 'navy') end, s->>'photo',
    trim(coalesce(s->>'headline', '')), trim(coalesce(s->>'text', '')), trim(coalesce(s->>'button', '')),
    (s->>'startsOn')::date, (s->>'endsOn')::date)
  returning id into n;
  perform app.audit(null, 'announcement.sent', n::text, jsonb_build_object('title', trim(p_title), 'audience', p_audience_label,
    'scheduled', p_send_on is not null, 'splash', s is not null, 'urgent', coalesce(p_urgent, false)));
  if at <= now() then perform app.deliver_announcement(n); end if;
  return n;
end $$;

/** Stop one: a scheduled one never goes out, and a splash page stops showing (notifications already sent stay). */
create function public.announcement_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  update announcements set cancelled_at = now() where id = p_id and cancelled_at is null;
  if not found then raise exception 'That announcement is already stopped.'; end if;
  perform app.audit(null, 'announcement.stopped', p_id::text, null);
end $$;

/** The history for push.send holders: newest first, with who it reached and what they did (counts only). */
create function public.announcements_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  return coalesce((select jsonb_agg(app.announcement_json(a) || jsonb_build_object(
      'sender', (select trim(first_name || ' ' || last_name) from profiles where id = a.created_by),
      'opened', (select count(distinct o.user_id) from notifications x join notification_opens o on o.notification_id = x.id
                 where x.data->>'announcementId' = a.id::text),
      'seen', (select count(*) from announcement_views v where v.announcement_id = a.id),
      'closed', (select count(*) from announcement_views v where v.announcement_id = a.id and v.closed_at is not null),
      'tapped', (select count(*) from announcement_views v where v.announcement_id = a.id and v.tapped_at is not null))
    order by a.send_at desc)
    from (select * from announcements order by send_at desc limit 100) a), '[]');
end $$;

-- ----------------------------------------------------------------------
-- Splash pages, and the announcement itself
-- ----------------------------------------------------------------------

/** An announcement as the app shows it (no audience details). */
create function app.announcement_json(a public.announcements) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'audienceLabel', a.audience_label, 'audience', a.audience,
    'urgent', a.urgent, 'link', a.link, 'push', a.push, 'sendAt', a.send_at, 'sentAt', a.sent_at, 'reach', a.reach,
    'cancelledAt', a.cancelled_at, 'splash', a.splash, 'splashImage', a.splash_image, 'splashTemplate', a.splash_template,
    'splashPhoto', a.splash_photo, 'splashHeadline', a.splash_headline, 'splashText', a.splash_text, 'splashButton', a.splash_button,
    'splashStartsOn', a.splash_starts_on, 'splashEndsOn', a.splash_ends_on, 'createdAt', a.created_at)
$$;

/** Is it one the caller may open: sent to them, or they send announcements? */
create function app.reads_announcement(a public.announcements, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_permission('push.send', u) or (a.sent_at is not null and app.in_audience(a.audience, u))
$$;

/** One announcement (from its notification), for the people it went to. */
create function public.announcement_view(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select app.announcement_json(a) - 'audience' from announcements a where a.id = p_id and app.reads_announcement(a)
$$;

/** The splash page to show the caller now, if any: sent to them, showing today, not stopped, and not closed by them yet. */
create function public.my_splash() returns jsonb
language sql stable security definer set search_path = public as $$
  select app.announcement_json(a) - 'audience' from announcements a
  where a.splash and a.sent_at is not null and a.cancelled_at is null
    and app.school_today() between a.splash_starts_on and a.splash_ends_on
    and not exists (select 1 from announcement_views v where v.announcement_id = a.id and v.user_id = auth.uid() and v.closed_at is not null)
    and app.in_audience(a.audience, auth.uid())
  order by a.send_at
  limit 1
$$;

/** The caller saw, closed or tapped the button on a splash page. */
create function public.splash_mark(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare a announcements%rowtype;
begin
  if p_action not in ('seen', 'closed', 'tapped') then raise exception 'Seen, closed or tapped.'; end if;
  select * into a from announcements where id = p_id and splash;
  if not found or not app.in_audience(a.audience, auth.uid()) then return; end if;
  insert into announcement_views (announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  update announcement_views set closed_at = case when p_action in ('closed', 'tapped') then coalesce(closed_at, now()) else closed_at end,
                                tapped_at = case when p_action = 'tapped' then coalesce(tapped_at, now()) else tapped_at end
  where announcement_id = p_id and user_id = auth.uid();
end $$;

-- ----------------------------------------------------------------------
-- The graphics
-- ----------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

/** A splash page's picture, for the people it went to (and the senders). */
create function app.sees_announcement_file(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(name, '/', 1) = auth.uid()::text or app.has_permission('push.send')
      or exists (select 1 from announcements a where (a.splash_image = name or a.splash_photo = name) and app.reads_announcement(a))
$$;

create policy "announcement pictures: senders upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcements' and (storage.foldername(name))[1] = auth.uid()::text and app.has_permission('push.send'));
create policy "announcement pictures: the people it went to" on storage.objects for select to authenticated
  using (bucket_id = 'announcements' and app.sees_announcement_file(objects.name));
create policy "announcement pictures: the uploader removes theirs" on storage.objects for delete to authenticated
  using (bucket_id = 'announcements' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------
-- Pushes follow the person's settings: announcements are school announcements
-- ----------------------------------------------------------------------

create or replace function app.wants_push(n public.notifications, u uuid, at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare st user_settings%rowtype; t time; school boolean := n.audience in ('everyone', 'roles') or n.data ? 'announcementId';
begin
  if n.data ? 'alertId' then return true; end if;
  if school and n.urgent then return true; end if;
  select * into st from user_settings where user_id = u;
  if not found then return true; end if;
  if school and not st.push_school then return false; end if;
  if n.data ? 'reply' then
    if not st.push_replies then return false; end if;
  elsif n.audience = 'group' and not st.push_groups then return false;
  end if;
  if n.data ? 'listingId' and not st.push_marketplace then return false; end if;
  if n.data ? 'opportunityId' and not st.push_volunteer then return false; end if;
  if st.quiet_start is not null then
    t := (at at time zone 'America/Chicago')::time;
    if (st.quiet_start <= st.quiet_end and t >= st.quiet_start and t < st.quiet_end)
       or (st.quiet_start > st.quiet_end and (t >= st.quiet_start or t < st.quiet_end)) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- ----------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------

revoke all on function app.check_audience(jsonb), app.in_audience(jsonb, uuid), app.announcement_targets(jsonb, uuid),
  app.deliver_announcement(uuid), app.send_due_announcements(), app.check_announcement_file(text), app.announcement_json(public.announcements),
  app.reads_announcement(public.announcements, uuid), app.sees_announcement_file(text) from public, anon;
grant execute on function app.check_audience(jsonb), app.in_audience(jsonb, uuid), app.announcement_targets(jsonb, uuid),
  app.check_announcement_file(text), app.announcement_json(public.announcements), app.reads_announcement(public.announcements, uuid),
  app.sees_announcement_file(text) to authenticated, service_role;
grant execute on function app.deliver_announcement(uuid), app.send_due_announcements() to service_role;
revoke all on function public.announcement_reach(jsonb),
  public.announcement_send(text, text, jsonb, text, boolean, text, boolean, date, time, jsonb), public.announcement_cancel(uuid),
  public.announcements_list(), public.announcement_view(uuid), public.my_splash(), public.splash_mark(uuid, text) from public, anon;
grant execute on function public.announcement_reach(jsonb),
  public.announcement_send(text, text, jsonb, text, boolean, text, boolean, date, time, jsonb), public.announcement_cancel(uuid),
  public.announcements_list(), public.announcement_view(uuid), public.my_splash(), public.splash_mark(uuid, text) to authenticated, service_role;
