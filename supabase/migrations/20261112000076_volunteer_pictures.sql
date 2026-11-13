-- Volunteer cover photos: whoever posts an opportunity or starts an event puts their own photo on its card (and the top
-- of its page) in place of the drawn art; its leaders change it or take it off later. The file is in the private
-- 'volunteer' bucket under the uploader's own folder, and is read by whoever can see the opportunity or event (so an
-- invite-only draft's photo stays as private as the draft).

alter table public.volunteer_opportunities add column image text;   -- 'volunteer' bucket: "<uploader id>/<file>.jpg"
alter table public.volunteer_events add column image text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('volunteer', 'volunteer', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "volunteer photos: posters upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'volunteer' and (storage.foldername(name))[1] = auth.uid()::text
              and (app.posts_volunteer() or app.has_permission('groups.manage')));
create policy "volunteer photos: whoever sees the opportunity or event" on storage.objects for select to authenticated
  using (bucket_id = 'volunteer' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.volunteer_opportunities o where o.image = objects.name)
    or exists (select 1 from public.volunteer_events e where e.image = objects.name)));
create policy "volunteer photos: the uploader removes theirs" on storage.objects for delete to authenticated
  using (bucket_id = 'volunteer' and (storage.foldername(name))[1] = auth.uid()::text);

/** A photo the caller uploaded to their own folder (null: none). */
create function app.check_volunteer_image(p text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p is not null and (split_part(p, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects where bucket_id = 'volunteer' and name = p)) then
    raise exception 'Upload the photo first.';
  end if;
end $$;

/** The photo a change let go of, when nothing else uses it, so the app can remove the file. */
create function app.unused_volunteer_image(old text, kept text) returns text
language sql stable security definer set search_path = public as $$
  select old where old is distinct from kept
    and not exists (select 1 from volunteer_opportunities where image = old)
    and not exists (select 1 from volunteer_events where image = old)
$$;

/**
 * An opportunity's leader (its event's leader, groups.manage) puts a photo they uploaded on its card, or takes it off
 * (null). Returns the photo it replaces, if nothing else uses it, so the app can remove the file.
 */
create function public.volunteer_set_image(p_opportunity uuid, p_image text) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not app.runs_volunteer(p_opportunity) then
    raise exception 'Only its leader can change its photo.' using errcode = '42501';
  end if;
  perform app.check_volunteer_image(p_image);
  select image into old from volunteer_opportunities where id = p_opportunity and status = 'open' for update;
  if not found then raise exception 'That opportunity isn''t open anymore.'; end if;
  update volunteer_opportunities set image = p_image where id = p_opportunity;
  return app.unused_volunteer_image(old, p_image);
end $$;

/** The event's starter (or groups.manage): its photo, the same way. */
create function public.volunteer_event_set_image(p_event uuid, p_image text) returns text
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not app.runs_volunteer_event(p_event) then
    raise exception 'Only the event''s starter can change its photo.' using errcode = '42501';
  end if;
  perform app.check_volunteer_image(p_image);
  select image into old from volunteer_events where id = p_event and status = 'open' for update;
  if not found then raise exception 'That event isn''t open anymore.'; end if;
  update volunteer_events set image = p_image where id = p_event;
  return app.unused_volunteer_image(old, p_image);
end $$;

revoke all on function app.check_volunteer_image(text), app.unused_volunteer_image(text, text),
  public.volunteer_set_image(uuid, text), public.volunteer_event_set_image(uuid, text) from public, anon;
grant execute on function public.volunteer_set_image(uuid, text), public.volunteer_event_set_image(uuid, text) to authenticated, service_role;
