-- Lunch Visits shows each child as a photo circle with their name under it, so the children list carries the profile
-- photo: a storage path the app signs (a child's own photo folder opens only for their parents and staff, so a Family
-- account sees initials), or a picture's web address.
drop function public.lunch_my_kids();
create function public.lunch_my_kids() returns table (id uuid, first_name text, last_name text, grade int, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.grade, p.avatar_url from profiles p where p.id in (select app.lunch_kids()) order by p.grade, p.first_name
$$;
revoke all on function public.lunch_my_kids() from public, anon;
grant execute on function public.lunch_my_kids() to authenticated, service_role;
