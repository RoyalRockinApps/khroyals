-- Connect groups: archive, delete, and hide from your own list.
--
-- Archive (a group's owners, or groups.manage): the group disappears for everyone else (lists,
-- More groups, its posts, events and members) and takes no new posts, comments or events. Its
-- owners and groups.manage holders still find it under Archived groups, where they restore it or
-- delete it for good. Nothing is lost until it's deleted.
--
-- Delete (the same people, only once it's archived, typing the group's name to confirm): the
-- group goes with its posts, comments, events and memberships. The school's activity log keeps
-- who deleted which group.
--
-- Hide (any member): takes a group out of your own list (groups you were put in by the school
-- can't be left); Hidden groups brings it back. Nobody else sees the difference.

alter table public.groups
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.memberships add column hidden_at timestamptz;

/** A group's owner, or groups.manage: the people who archive, restore and delete it. */
create function app.owns_group(g uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select app.school_role(u) is not null and app.school_role(u) not in ('family', 'substitute')
     and (app.has_permission('groups.manage', u)
          or exists (select 1 from memberships where group_id = g and user_id = u and role = 'owner'))
$$;

/** Refuse someone who doesn't own the group: an admin who hasn't verified is told to, anyone else that only owners may. */
create function app.require_group_owner(what text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('groups.manage');
exception when insufficient_privilege then
  if sqlerrm like 'MFA_REQUIRED%' then raise; end if;
  raise exception 'Only the group''s owners can % it.', what using errcode = '42501';
end $$;

-- An archived group is only there for its owners (and groups.manage); for everyone else it's gone.
create or replace function app.effective_role(g uuid, u uuid default auth.uid()) returns text
language plpgsql stable security definer set search_path = public as $$
declare sr text; r text; vis text; archived boolean;
begin
  sr := app.school_role(u);
  if sr is null or sr in ('family', 'substitute') then return null; end if;  -- signed out, awaiting approval, Family or Substitute
  if app.has_permission('groups.manage', u) then return 'owner'; end if;
  select role into r from memberships where group_id = g and user_id = u;
  select settings->>'visibility', archived_at is not null into vis, archived from groups where id = g;
  if archived then return case when r = 'owner' then r end; end if;
  if r is not null then return r; end if;
  if vis in ('public', 'school') then return 'subscriber'; end if;
  return null;
end $$;

drop policy "discoverable groups" on public.groups;
create policy "discoverable groups" on public.groups for select to authenticated
  using (case when archived_at is not null then app.owns_group(id)
              else app.is_admin()
                   or (app.school_role() is not null and not app.is_family() and not app.is_substitute() and settings->>'visibility' <> 'hidden')
                   or app.is_member(id) end);

/** Nothing new goes into an archived group: no posts, comments or calendar events. */
create function app.refuse_archived() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if tg_table_name = 'comments' then select group_id into g from posts where id = new.post_id;
  else g := new.group_id;
  end if;
  if exists (select 1 from groups where id = g and archived_at is not null) then
    raise exception 'This group is archived. Restore it to post again.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger refuse_archived before insert on public.posts for each row execute function app.refuse_archived();
create trigger refuse_archived before insert on public.comments for each row execute function app.refuse_archived();
create trigger refuse_archived before insert on public.events for each row when (new.group_id is not null) execute function app.refuse_archived();

/** Your groups, minus archived ones and the ones you've hidden. */
create or replace function public.my_groups() returns setof public.groups
language sql stable security definer set search_path = public as $$
  select g.* from groups g
  where g.archived_at is null
    and (exists (select 1 from memberships m where m.group_id = g.id and m.user_id = auth.uid() and m.hidden_at is null)
         or (app.is_admin() and not exists (select 1 from memberships m where m.group_id = g.id and m.user_id = auth.uid() and m.hidden_at is not null)))
  order by g.name
$$;

/** Groups you've hidden from your list. */
create function public.my_hidden_groups() returns setof public.groups
language sql stable security definer set search_path = public as $$
  select g.* from groups g join memberships m on m.group_id = g.id and m.user_id = auth.uid()
  where m.hidden_at is not null and g.archived_at is null
  order by g.name
$$;

/** Archived groups you can restore or delete. */
create function public.archived_groups() returns setof public.groups
language sql stable security definer set search_path = public as $$
  select g.* from groups g where g.archived_at is not null and app.owns_group(g.id) order by g.archived_at desc
$$;

/** Hide a group from your own list, or bring it back. */
create function public.group_hide(p_group uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update memberships set hidden_at = case when p_hidden then now() end
  where group_id = p_group and user_id = auth.uid();
  if not found then raise exception 'You''re not in this group.'; end if;
end $$;

/** Archive a group (it disappears for everyone but its owners) or restore it. */
create function public.group_archive(p_group uuid, p_archived boolean) returns public.groups
language plpgsql security definer set search_path = public as $$
declare row groups%rowtype;
begin
  if not app.owns_group(p_group) then perform app.require_group_owner('archive'); end if;
  update groups set archived_at = case when p_archived then coalesce(archived_at, now()) end,
                    archived_by = case when p_archived then coalesce(archived_by, auth.uid()) end
  where id = p_group returning * into row;
  if not found then raise exception 'That group is gone.'; end if;
  perform app.audit(p_group, case when p_archived then 'group.archived' else 'group.restored' end, null, jsonb_build_object('name', row.name));
  return row;
end $$;

/** Delete an archived group for good, with everything in it; `p_name` must be its name, to confirm. */
create function public.group_delete(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare g groups%rowtype; n int;
begin
  select * into g from groups where id = p_group;
  if not found then raise exception 'That group is gone.'; end if;
  if not app.owns_group(p_group) then perform app.require_group_owner('delete'); end if;
  if g.archived_at is null then raise exception 'Archive the group first; then it can be deleted.'; end if;
  if lower(trim(coalesce(p_name, ''))) is distinct from lower(trim(g.name)) then
    raise exception 'Type the group''s name, %, to delete it.', g.name;
  end if;
  select count(*) into n from posts where group_id = p_group;
  delete from groups where id = p_group;
  -- The group's own log goes with it; the school's log keeps that it was deleted.
  perform app.audit(null, 'group.deleted', p_group::text, jsonb_build_object('name', g.name, 'posts', n));
end $$;

revoke all on function public.my_hidden_groups(), public.archived_groups(), public.group_hide(uuid, boolean),
  public.group_archive(uuid, boolean), public.group_delete(uuid, text) from public, anon;
grant execute on function public.my_hidden_groups(), public.archived_groups(), public.group_hide(uuid, boolean),
  public.group_archive(uuid, boolean), public.group_delete(uuid, text) to authenticated, service_role;
