-- One database design for every school's app (see schools/ in the repo), each school in its own
-- Supabase project. The school's names come from app.settings instead of being written into the
-- functions, so the same migrations serve every school: Kingdom Heights' values are the defaults
-- below, and another school's project sets its own once (supabase/schools/<id>/).
--
-- From here on, shared migrations never name a school: use app.brand('app_name') and friends,
-- and put a school's own data in supabase/schools/<id>/ (tests/db.test.ts checks).

insert into app.settings (key, value) values
  ('app_name',         'KH Royals'),
  ('school_name',      'Kingdom Heights'),
  ('school_full_name', 'Kingdom Heights Preparatory School'),
  ('connect_name',     'Royals Connect'),
  ('news_name',        'Royal News'),
  ('web_app',          'https://royalrockinapps.github.io/khroyals/')
on conflict (key) do nothing;

/** One of the school's names (app_name, school_name, school_full_name, connect_name, news_name, web_app). */
create function app.brand(k text) returns text
language sql stable security definer set search_path = app as $$
  select coalesce((select nullif(value, '') from app.settings where key = k), k)
$$;

-- The functions that named Kingdom Heights, as they stand, reading the names instead.

-- add_pickup_person(uuid,text,text,date,date)
CREATE OR REPLACE FUNCTION public.add_pickup_person(p_student uuid, p_email text, p_relationship text, p_starts date DEFAULT NULL::date, p_ends date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who profiles%rowtype; kid text; me_name text; row pickup_authorizations%rowtype; g uuid; span text;
begin
  if not app.can_manage_pickups(p_student) then
    raise exception 'Only this child''s parents or the school office can choose who picks them up.' using errcode = '42501';
  end if;
  select p.* into who from profiles p join profile_private pp on pp.id = p.id
  where lower(pp.email) = lower(trim(coalesce(p_email, '')));
  if not found then
    raise exception 'No % account uses that email. Ask them to download the app and create an account, then add them.', app.brand('connect_name');
  end if;
  if who.school_role = 'student' or who.managed then raise exception 'Students can''t be approved to pick up children.'; end if;
  if exists (select 1 from guardians where guardian_id = who.id and student_id = p_student) then
    raise exception '% is already a parent of this child.', trim(who.first_name);
  end if;
  if p_ends is not null and p_ends < coalesce(p_starts, app.school_today()) then raise exception 'The end date must be on or after the start.'; end if;
  insert into pickup_authorizations (student_id, person_id, relationship, starts_on, ends_on, granted_by)
  values (p_student, who.id, p_relationship, coalesce(p_starts, app.school_today()), p_ends, auth.uid())
  on conflict (student_id, person_id) do update set relationship = excluded.relationship, starts_on = excluded.starts_on,
    ends_on = excluded.ends_on, granted_by = excluded.granted_by
  returning * into row;

  select trim(first_name) into kid from profiles where id = p_student;
  select trim(first_name || ' ' || last_name) into me_name from profiles where id = auth.uid();
  span := case when row.ends_on is null then '' when row.ends_on = row.starts_on then ' on ' || to_char(row.starts_on, 'FMMon FMDD')
               else ' until ' || to_char(row.ends_on, 'FMMon FMDD') end;
  perform app.notify_user(who.id, '🚗 You can pick up ' || kid,
    coalesce(me_name, 'The school') || ' added you to pick up ' || kid || ' from the car line' || span || '.',
    jsonb_build_object('carline', 'pickup-added', 'studentId', p_student));
  for g in select guardian_id from guardians where student_id = p_student and guardian_id <> auth.uid() loop
    perform app.notify_user(g, 'Pickup added for ' || kid,
      coalesce(me_name, 'The school') || ' allowed ' || trim(who.first_name || ' ' || who.last_name)
        || ' (' || app.relationship_label(p_relationship) || ') to pick up ' || kid || span || '.',
      jsonb_build_object('children', true));
  end loop;
  perform app.audit(null, 'pickup.added', p_student::text, jsonb_build_object('person', who.id, 'relationship', p_relationship,
                    'starts', row.starts_on, 'ends', row.ends_on));
  return jsonb_build_object('id', row.id, 'name', trim(who.first_name || ' ' || who.last_name), 'pending', who.school_role is null);
end $function$;

-- app.handle_new_user()
CREATE OR REPLACE FUNCTION app.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  kid profiles%rowtype;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  whole text := trim(coalesce(nullif(trim(meta->>'full_name'), ''), meta->>'name', ''));
  first text := coalesce(nullif(trim(meta->>'first_name'), ''), nullif(trim(meta->>'given_name'), ''), split_part(whole, ' ', 1));
  last text := coalesce(nullif(trim(meta->>'last_name'), ''), nullif(trim(meta->>'family_name'), ''),
                        trim(substr(whole, length(split_part(whole, ' ', 1)) + 1)));
begin
  select * into kid from profiles where id = new.id;
  if found then
    update profiles set managed = false where id = new.id;
    insert into profile_private (id, email) values (new.id, new.email) on conflict (id) do update set email = excluded.email;
    insert into app.email_queue (to_email, subject, body) values (new.email,
      ('Your ' || app.brand('app_name') || ' login is ready'),
      concat_ws(E'\n\n',
        'Hi ' || trim(kid.first_name) || ',',
        ('Your family set up ' || app.brand('connect_name') || ' for you: ' || app.brand('school_name') || ''' school app, with your classes, assignments, activities and school news.'),
        ('To sign in, open the ' || app.brand('app_name') || ' app (or ' || app.brand('web_app') || '), tap Log in, and enter this email address: ')
          || new.email || '. We''ll email you a 6-digit code. There''s no password to remember.',
        (app.brand('school_full_name'))));
    return new;
  end if;
  insert into profiles (id, first_name, last_name) values (new.id, coalesce(first, ''), coalesce(last, ''));
  insert into profile_private (id, email) values (new.id, new.email);
  return new;
end $function$;

-- app.pickup_confirmed()
CREATE OR REPLACE FUNCTION app.pickup_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  kid profiles%rowtype; by_name text; by_role text; staff text; num text; vehicle text; line text; g record;
begin
  if new.status <> 'picked_up' or old.status = 'picked_up' then return new; end if;
  select * into kid from profiles where id = new.student_id;
  select number into num from pickup_numbers where student_id = new.student_id;
  select nullif(trim(p.first_name || ' ' || p.last_name), ''),
         coalesce((select app.parent_label(relation) from guardians where guardian_id = new.guardian_id and student_id = new.student_id),
                  (select app.relationship_label(relationship) from pickup_authorizations
                    where person_id = new.guardian_id and student_id = new.student_id),
                  case when p.school_role = 'family' then 'family member' else p.school_role end)
    into by_name, by_role from profiles p where p.id = new.guardian_id;
  select nullif(trim(first_name || ' ' || last_name), '') into staff from profiles where id = new.picked_up_by;
  vehicle := new.vehicle->>'label';
  line := coalesce(kid.first_name, 'Your child') || ' was picked up at ' || app.school_clock(coalesce(new.picked_up_at, now()))
          || coalesce(' by ' || by_name, '') || '.';

  for g in
    select gg.guardian_id, pp.email from guardians gg left join profile_private pp on pp.id = gg.guardian_id
    where gg.student_id = new.student_id
  loop
    if g.email is not null and g.email like '%@%' then
      insert into app.email_queue (to_email, subject, body, pickup_id, send_after)
      values (g.email,
        trim(kid.first_name) || ' was picked up at ' || app.school_clock(coalesce(new.picked_up_at, now())),
        concat_ws(E'\n\n',
          trim(kid.first_name || ' ' || kid.last_name) || (' was picked up from the ' || app.brand('school_name') || ' car line at ')
            || app.school_clock(coalesce(new.picked_up_at, now())) || ' on '
            || to_char(coalesce(new.picked_up_at, now()) at time zone 'America/Chicago', 'FMDay, FMMonth FMDD') || '.',
          'Picked up by: ' || coalesce(by_name || ' (' || by_role || ')', 'not recorded')
            || coalesce(E'\nVehicle: ' || vehicle, '')
            || coalesce(E'\nReleased by: ' || staff || ' (school staff)', '')
            || coalesce(E'\nPickup number: ' || num, ''),
          'If you weren''t expecting this, call the school office right away at '
            || coalesce(app.setting('school_phone'), 'the school') || '.',
          (app.brand('school_full_name') || ' · ' || app.brand('connect_name'))),
        new.id, now() + interval '1 minute');
    end if;
    if g.guardian_id is distinct from new.guardian_id then
      perform app.notify_user(g.guardian_id, '🚗 ' || coalesce(kid.first_name, 'Your child') || ' was picked up', line,
                              jsonb_build_object('carline', 'picked-up', 'pickupId', new.id));
    end if;
  end loop;
  return new;
end $function$;

-- app.require_at_school(double precision,double precision,double precision)
CREATE OR REPLACE FUNCTION app.require_at_school(p_lat double precision, p_lng double precision, p_accuracy double precision)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d float8; r float8 := coalesce(app.setting('carline_radius_m')::float8, 150);
begin
  if p_lat is null or p_lng is null then
    raise exception 'Turn on location for % so the school knows you''re at pickup.', app.brand('app_name');
  end if;
  d := app.distance_m(p_lat, p_lng, app.setting('carline_latitude')::float8, app.setting('carline_longitude')::float8);
  if d > r + least(greatest(coalesce(p_accuracy, 0), 0), 50) then
    raise exception 'You''re about % from the pickup spot. You can announce when you''re within %.',
      case when d >= 1609 then round((d / 1609.34)::numeric, 1) || ' miles' else round(d * 3.28084) || ' feet' end,
      round(r * 3.28084) || ' feet';
  end if;
  return round(d)::int;
end $function$;

-- app.use_car_pass(text)
CREATE OR REPLACE FUNCTION app.use_car_pass(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u uuid;
begin
  update app.car_passes set last_used_at = now()
  where token_hash = app.car_token_hash(p_token) and last_used_at > now() - interval '90 days'
  returning user_id into u;
  if u is null or app.school_role(u) is null then
    raise exception 'Open % on your phone and sign in again.', app.brand('app_name') using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  return u;
end $function$;

-- carline_check_in(uuid[])
CREATE OR REPLACE FUNCTION public.carline_check_in(p_students uuid[] DEFAULT NULL::uuid[])
 RETURNS SETOF carline_pickups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'Update % to announce pickup (it now checks that you''re at school).', app.brand('app_name');
end $function$;

-- critical_alert_send(text,text,text)
CREATE OR REPLACE FUNCTION public.critical_alert_send(p_kind text, p_title text, p_body text DEFAULT ''::text)
 RETURNS critical_alerts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a critical_alerts%rowtype;
begin
  perform app.require_permission('alerts.send');
  if p_kind is null or p_kind not in ('weather', 'threat', 'danger', 'other') then raise exception 'Pick what kind of alert this is.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Add a short title.'; end if;
  if char_length(trim(p_title)) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if char_length(coalesce(p_body, '')) > 1000 then raise exception 'Keep the message to 1,000 characters.'; end if;
  insert into critical_alerts (kind, title, body, created_by)
  values (p_kind, trim(p_title), coalesce(trim(p_body), ''), auth.uid()) returning * into a;
  insert into notifications (audience, roles, title, body, data, urgent, created_by)
  values ('roles', array['admin', 'teacher', 'staff'], app.alert_icon(a.kind) || ' ' || a.title,
          coalesce(nullif(a.body, ''), ('Open ' || app.brand('app_name') || ' for details.')),
          jsonb_build_object('alertId', a.id, 'kind', a.kind, 'critical', true, 'level', app.alert_level()), true, auth.uid());
  perform app.audit(null, 'alert.sent', a.id::text, jsonb_build_object('kind', a.kind, 'title', a.title));
  return a;
end $function$;

-- email_claim(integer)
CREATE OR REPLACE FUNCTION public.email_claim(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, to_email text, subject text, body text, sender text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update app.email_queue q set status = 'sending'
  where q.id in (select x.id from app.email_queue x where x.status = 'queued' and x.send_after <= now()
                 order by x.send_after limit greatest(1, least(coalesce(p_limit, 20), 100)) for update skip locked)
  returning q.id, q.to_email, q.subject, q.body, coalesce(app.setting('email_from'), (app.brand('connect_name') || ' <noreply@keytrainlearning.com>'))
$function$;

-- gallery_album_save(uuid,text,text,date,boolean,uuid,text)
CREATE OR REPLACE FUNCTION public.gallery_album_save(p_id uuid, p_title text, p_description text, p_taken_on date, p_notify boolean DEFAULT false, p_category uuid DEFAULT NULL::uuid, p_visibility text DEFAULT 'everyone'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_id uuid; g int; u uuid;
begin
  if not app.is_staff() then raise exception 'Only staff post to the photo gallery.' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the album a name, like "Fall Fest 2026".'; end if;
  if coalesce(p_visibility, '') not in ('everyone', 'staff') then raise exception 'Choose who sees the album.'; end if;
  if p_category is null or not exists (select 1 from gallery_categories where id = p_category) then
    raise exception 'Pick a category for the album.';
  end if;
  if p_id is null then
    insert into gallery_albums (title, description, taken_on, created_by, category_id, visibility)
    values (trim(p_title), coalesce(trim(p_description), ''), coalesce(p_taken_on, current_date), auth.uid(), p_category, p_visibility)
    returning id into new_id;
  else
    if not app.can_edit_album(p_id) then raise exception 'You can only change albums you started.' using errcode = '42501'; end if;
    update gallery_albums set title = trim(p_title), description = coalesce(trim(p_description), ''),
      taken_on = coalesce(p_taken_on, taken_on), category_id = p_category, visibility = p_visibility
    where id = p_id returning id, grade into new_id, g;
  end if;
  if p_notify then
    perform app.require_permission('push.send');
    if p_visibility <> 'everyone' then raise exception 'Show the album to everyone before letting everyone know.'; end if;
    if g is null then
      insert into notifications (audience, title, body, data, created_by)
      values ('everyone', '📸 New photos: ' || trim(p_title), ('See the album in the ' || app.brand('app_name') || ' photo gallery.'),
              jsonb_build_object('albumId', new_id), auth.uid());
    else
      for u in select user_id from gallery_album_members where album_id = new_id and removed_at is null loop
        perform app.notify_user(u, '📸 New photos: ' || trim(p_title), ('See the album in the ' || app.brand('app_name') || ' photo gallery.'),
                                jsonb_build_object('albumId', new_id));
      end loop;
    end if;
  end if;
  return new_id;
end $function$;

-- market_remove(uuid,text)
CREATE OR REPLACE FUNCTION public.market_remove(p_listing uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r market_listings%rowtype; why text := coalesce(nullif(trim(p_reason), ''), 'it isn''t a uniform or school-related item');
        b uuid;
begin
  select * into r from market_listings where id = p_listing for update;
  if not found or r.status = 'removed' then raise exception 'No such post.'; end if;
  if app.has_permission('groups.manage') and r.seller_id <> auth.uid() then
    update market_listings set status = 'removed', updated_at = now() where id = p_listing;
    perform app.audit(null, 'market.removed', r.seller_id::text, jsonb_build_object('listing', r.id, 'title', r.title, 'reason', why));
    perform app.notify_user(r.seller_id, '🚫 Post removed: ' || r.title,
      (app.brand('school_name') || ' removed your Marketplace post because ') || why || '.', jsonb_build_object('listingId', r.id));
  elsif r.seller_id <> auth.uid() then
    raise exception 'Only the seller can delete this post.' using errcode = '42501';
  else
    update market_listings set status = 'removed', updated_at = now() where id = p_listing;
  end if;
  -- Tell everyone still in line (and a pending buyer) that it's gone.
  if r.status in ('open', 'pending') then
    for b in select distinct buyer_id from market_responses
             where listing_id = p_listing and status in ('agreed', 'offered', 'countered', 'selected') loop
      perform app.notify_user(b, 'No longer available: ' || r.title,
        case when r.status = 'pending' and b = r.buyer_id then 'The seller deleted the post, so the sale is off.'
             else 'The seller took this post down.' end,
        jsonb_build_object('listingId', r.id));
    end loop;
    update market_responses set status = 'withdrawn', updated_at = now()
    where listing_id = p_listing and status in ('agreed', 'offered', 'countered', 'selected');
  end if;
end $function$;

-- newsletter_save(text,text,date,jsonb)
CREATE OR REPLACE FUNCTION public.newsletter_save(p_source_url text, p_title text, p_sent_on date, p_blocks jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_id uuid;
begin
  perform app.require_permission('push.send');
  if p_source_url is null or p_source_url !~ '^https://app\.smore\.com/n/' then raise exception 'Use the issue''s Smore link.'; end if;
  if p_sent_on is null then raise exception 'The issue needs its date.'; end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'That issue has nothing in it.';
  end if;
  if length(p_blocks::text) > 300000 then raise exception 'That issue is too long to add.'; end if;
  insert into newsletters (title, sent_on, source_url, blocks, created_by)
  values (coalesce(nullif(trim(p_title), ''), (app.brand('news_name'))), p_sent_on, p_source_url, p_blocks, auth.uid())
  on conflict (source_url) do update set title = excluded.title, sent_on = excluded.sent_on, blocks = excluded.blocks
  returning id into new_id;
  perform app.audit(null, 'newsletter.saved', new_id::text, jsonb_build_object('sentOn', p_sent_on, 'url', p_source_url));
  return new_id;
end $function$;

-- pickup_transfer(uuid[],uuid,date)
CREATE OR REPLACE FUNCTION public.pickup_transfer(p_students uuid[], p_to uuid, p_day date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d date := coalesce(p_day, app.school_today()); req uuid := gen_random_uuid(); s uuid; kid text; names text[] := '{}';
begin
  if coalesce(cardinality(p_students), 0) = 0 then raise exception 'Choose who they''re picking up.'; end if;
  if exists (select 1 from unnest(p_students) x where not app.is_guardian_of(x)) then
    raise exception 'Only a child''s parents can hand their pickup to someone else.' using errcode = '42501';
  end if;
  if p_to is null or p_to = auth.uid() or not app.can_take_pickup(p_to) then
    raise exception 'Choose someone else with an approved % account.', app.brand('connect_name');
  end if;
  if d < app.school_today() then raise exception 'Choose today or a day ahead.'; end if;
  if d > app.school_today() + 60 then raise exception 'Choose a day in the next two months.'; end if;
  if (select count(distinct request_id) from pickup_transfers
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of pickup requests for one day. Try again tomorrow.';
  end if;
  for s in select distinct x from unnest(p_students) x loop
    select trim(first_name) into kid from profiles where id = s;
    if exists (select 1 from pickup_transfers where student_id = s and day = d and status in ('pending', 'accepted')) then
      raise exception '%''s pickup % is already handed to someone. Cancel that first.', kid, app.transfer_day(d);
    end if;
    if d = app.school_today() and exists (select 1 from carline_pickups where student_id = s and day = d
                                            and status in ('waiting', 'picked_up')) then
      raise exception '% is already in the car line or picked up today.', kid;
    end if;
    insert into pickup_transfers (request_id, student_id, from_id, to_id, day) values (req, s, auth.uid(), p_to, d);
    names := names || kid;
  end loop;
  select array_agg(n order by n) into names from unnest(names) n;
  perform app.notify_user(p_to, '🚗 Can you pick up ' || app.and_list(names) || '?',
    app.person_name(auth.uid()) || ' asks you to pick up ' || app.and_list(names) || ' from the car line '
      || app.transfer_day(d) || '. Open the Car Line to accept or decline.',
    jsonb_build_object('carline', 'transfer', 'request', req));
  perform app.audit(null, 'pickup.transfer_asked', req::text,
    jsonb_build_object('to', p_to, 'day', d, 'students', to_jsonb(p_students)));
  return req;
end $function$;

-- student_login_request(uuid,text)
CREATE OR REPLACE FUNCTION public.student_login_request(p_student uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare kid profiles%rowtype; mail text := lower(trim(coalesce(p_email, '')));
begin
  perform app.require_login_manager(p_student);
  select * into kid from profiles where id = p_student;
  if not found or kid.school_role is distinct from 'student' then raise exception 'That isn''t a student.'; end if;
  if not kid.managed then raise exception '% already has a login.', kid.first_name; end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the email address % will sign in with.', kid.first_name; end if;
  if exists (select 1 from auth.users where lower(email) = mail) then
    raise exception 'That email already has a % account. Use a different one for %.', app.brand('app_name'), kid.first_name;
  end if;
  if exists (select 1 from student_logins where email = mail and student_id <> p_student) then
    raise exception 'That email is already set up for another student.';
  end if;
  insert into student_logins (student_id, email, invited_by) values (p_student, mail, auth.uid())
  on conflict (student_id) do update set email = excluded.email, invited_by = excluded.invited_by, invited_at = now();
  perform app.audit(null, 'student.login_requested', p_student::text, jsonb_build_object('email', mail));
  return jsonb_build_object('studentId', p_student, 'email', mail, 'firstName', kid.first_name, 'lastName', kid.last_name);
end $function$;

-- ticket_admit(uuid,text)
CREATE OR REPLACE FUNCTION public.ticket_admit(p_event uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c text := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g')); k tickets; o ticket_orders; counts jsonb;
begin
  if not app.runs_tickets(p_event) then
    raise exception 'Only the activity''s coaches and directors can check its tickets.' using errcode = '42501';
  end if;
  if char_length(c) = 32 then
    select * into k from tickets where code = c;
  elsif char_length(c) >= 8 then   -- typed: the short code under the QR code, for this event's tickets
    select x.* into k from tickets x join ticket_orders xo on xo.id = x.order_id where xo.event_id = p_event and x.code like c || '%' limit 1;
  end if;
  if k.id is null then return jsonb_build_object('ok', false, 'message', ('Not a ' || app.brand('app_name') || ' ticket.')); end if;
  select * into o from ticket_orders where id = k.order_id;
  if o.event_id is distinct from p_event then
    return jsonb_build_object('ok', false, 'message', 'This ticket is for ' || o.event_title || '.', 'holder', app.checkin_name(o.buyer_id), 'type', k.type_name);
  end if;
  if o.status <> 'paid' then return jsonb_build_object('ok', false, 'message', 'This ticket wasn''t paid for.'); end if;
  if k.admitted_at is not null then
    return jsonb_build_object('ok', false, 'message', 'Already used at ' || app.checkin_time(k.admitted_at) || '.',
      'holder', app.checkin_name(o.buyer_id), 'type', k.type_name);
  end if;
  update tickets set admitted_at = now(), admitted_by = auth.uid() where id = k.id;
  select jsonb_build_object('admitted', count(*) filter (where t.admitted_at is not null), 'sold', count(*)) into counts
  from tickets t join ticket_orders x on x.id = t.order_id where x.event_id = p_event and x.status = 'paid';
  return jsonb_build_object('ok', true, 'holder', app.checkin_name(o.buyer_id), 'type', k.type_name) || counts;
end $function$;

-- public.sport_event_save: its example title named a school too.
CREATE OR REPLACE FUNCTION public.sport_event_save(p_id uuid, p_season uuid, p_kind text, p_title text, p_starts timestamp with time zone, p_ends timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_home boolean DEFAULT NULL::boolean, p_notes text DEFAULT ''::text, p_address text DEFAULT NULL::text)
 RETURNS sport_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old sport_events%rowtype; row sport_events%rowtype; season uuid; what text;
begin
  if p_id is not null then
    select * into old from sport_events where id = p_id;
    if not found then raise exception 'That schedule item is gone.'; end if;
  end if;
  season := coalesce(old.season_id, p_season);
  if season is null or not app.can_manage_sport(app.season_sport(season)) then perform app.require_permission('sports.manage'); end if;
  if coalesce(trim(p_title), '') = '' or char_length(trim(p_title)) > 120 then
    raise exception 'Add a title (up to 120 characters), like "vs. Randolph" or "Rehearsal".';
  end if;
  if p_kind is not null and p_kind not in ('game', 'practice', 'tryout', 'tournament', 'rehearsal', 'audition', 'performance',
                                           'meeting', 'competition', 'exhibit', 'other') then
    raise exception 'That isn''t a kind of schedule item.';
  end if;
  if p_starts is null then raise exception 'Give it a start time.'; end if;
  if p_ends < p_starts then raise exception 'The end time must be after the start.'; end if;
  if char_length(coalesce(trim(p_address), '')) > 200 then raise exception 'Keep the address to 200 characters.'; end if;
  if p_id is null then
    insert into sport_events (season_id, kind, title, starts_at, ends_at, location, address, home, notes, created_by)
    values (season, coalesce(p_kind, 'game'), trim(p_title), p_starts, p_ends, nullif(trim(p_location), ''), nullif(trim(p_address), ''),
            p_home, coalesce(trim(p_notes), ''), auth.uid())
    returning * into row;
    what := case row.kind when 'other' then 'event' when 'audition' then 'auditions' else row.kind end;
    perform app.sport_schedule_note(row, 'new ' || what);
  else
    update sport_events set kind = coalesce(p_kind, kind), title = trim(p_title), starts_at = p_starts, ends_at = p_ends,
      location = nullif(trim(p_location), ''), address = nullif(trim(p_address), ''), home = p_home,
      notes = coalesce(trim(p_notes), ''), updated_at = now()
    where id = p_id returning * into row;
    what := case row.kind when 'other' then 'event' when 'audition' then 'auditions' else row.kind end;
    if row.starts_at is distinct from old.starts_at or row.location is distinct from old.location
       or row.address is distinct from old.address then
      perform app.sport_schedule_note(row, what || ' changed');
    end if;
  end if;
  return row;
end $function$;
