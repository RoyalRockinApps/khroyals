-- Deleting your own account (My profile → Delete my account, and the Waiting for approval screen). Apple requires
-- that anyone who can make an account can delete it in the app.
--
-- Everyone types DELETE to confirm. It goes like an admin's delete (admin_delete_user): the login, the profile and
-- what they posted (their posts, anonymous ones too, and comments), so nothing is left looking anonymous; everything
-- else that hangs off the profile goes with it. Their children stay at school, with the office.
--
-- A student whose parents are linked loses only the login (like student_login_remove): they stay on their classes,
-- their records and with their parents, who are told and can give them a login again.
--
-- Directors can't: there must always be a director, so they hand the role on first. The activity log keeps who
-- deleted their account (name and role, not their email).

create function public.delete_my_account(p_confirm text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); me profiles%rowtype; kid text;
begin
  if u is null then raise exception 'Sign in to delete your account.' using errcode = '42501'; end if;
  if upper(trim(coalesce(p_confirm, ''))) <> 'DELETE' then raise exception 'Type DELETE to confirm.'; end if;
  select * into me from profiles where id = u;
  if found and me.admin_tier = 'director' then
    raise exception 'A director can''t delete their account. Make someone else a director and remove your director role first (Admin portal → Admins & roles).'
      using errcode = '42501';
  end if;

  -- A student with their family in the app: only the login goes.
  if found and me.school_role = 'student' and exists (select 1 from guardians where student_id = u) then
    kid := trim(coalesce(me.first_name, '') || ' ' || coalesce(me.last_name, ''));
    update profiles set managed = true where id = u;   -- so deleting the login keeps the profile
    delete from push_tokens where user_id = u;
    delete from app.car_passes where user_id = u;
    delete from student_logins where student_id = u;
    update profile_private set email = null where id = u;
    perform app.audit(null, 'student.login_removed', u::text, jsonb_build_object('self', true));
    perform app.notify_parents(u, '🔑 ' || coalesce(nullif(kid, ''), 'Your child') || ' removed their login',
      'They can''t sign in anymore and stay on your family''s list and their classes. You can give them a login again under My children.',
      jsonb_build_object('children', true));
    delete from auth.users where id = u;
    return 'login_removed';
  end if;

  perform app.audit(null, 'user.deleted_self', u::text, jsonb_build_object(
    'name', trim(coalesce(me.first_name, '') || ' ' || coalesce(me.last_name, '')), 'role', me.school_role));
  delete from posts where id in (select post_id from app.anonymous_authors where author_id = u);
  delete from posts where author_id = u;
  delete from comments where author_id = u;
  delete from auth.users where id = u;   -- app.drop_profile_with_login removes the profile
  delete from profiles where id = u;     -- a profile whose login is already gone
  return 'deleted';
end $$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated, service_role;
