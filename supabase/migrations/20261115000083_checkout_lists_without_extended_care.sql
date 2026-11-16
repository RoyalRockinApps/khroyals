-- The check-out lists on the Classes screen (field trips, class events, Activities events) leave out the daily Extended
-- care list: it has its own screen (Classes → Extended care), where its staff and the office run it, so it showed twice.
create or replace function public.checkout_my_lists() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'day', c.day, 'sportEventId', c.sport_event_id,
      'students', (select count(*) from checkout_list_students s where s.list_id = c.id),
      'released', (select count(*) from checkout_releases r where r.list_id = c.id),
      'mine', c.created_by = auth.uid()) order by c.day, c.title), '[]'::jsonb)
  from checkout_lists c where c.day >= app.school_today() - 7 and not c.extended_care and app.manages_checkout(c.id)
$$;
