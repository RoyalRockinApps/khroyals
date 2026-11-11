-- The Folder (the Forms app): a parent takes a form out of their folder (swipe it up, or Remove, after confirming).
-- It's only out of their own view: the school still sees whether it was signed, and the other parent keeps it. For 30
-- days it's in the folder's list of done, expired and removed forms, where it can be put back (form_remove false).

create table public.form_removals (
  form_id uuid not null references public.forms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (form_id, user_id)
);

alter table public.form_removals enable row level security;
create policy "their own" on public.form_removals for select to authenticated using (user_id = auth.uid());

/** A parent takes a form out of their folder (or puts it back), for themselves only. */
create function public.form_remove(p_form uuid, p_removed boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from form_recipients r where r.form_id = p_form and app.is_guardian_of(r.student_id)) then
    raise exception 'That form isn''t in your folder.' using errcode = '42501';
  end if;
  if coalesce(p_removed, true) then
    insert into form_removals (form_id, user_id) values (p_form, auth.uid())
    on conflict (form_id, user_id) do update set at = now();
  else
    delete from form_removals where form_id = p_form and user_id = auth.uid();
  end if;
end $$;

-- my_forms also says when the caller took each form out of their folder (removedAt, or null).
create or replace function public.my_forms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.due_on, t.title), '[]') from (
    select f.due_on, f.title, app.form_json(f) || jsonb_build_object(
      'removedAt', (select x.at from form_removals x where x.form_id = f.id and x.user_id = auth.uid()),
      'children', (
      select jsonb_agg(jsonb_build_object('studentId', r.student_id, 'name', s.first_name,
        'response', case when x.student_id is null then null else jsonb_build_object(
          'agreed', x.agreed, 'answers', x.answers, 'signature', x.signature, 'signedAt', x.signed_at,
          'signedBy', (select trim(first_name || ' ' || last_name) from profiles where id = x.signed_by)) end,
        'payment', app.form_payment_json(pay, false))
        order by s.first_name)
      from form_recipients r join profiles s on s.id = r.student_id
      left join form_responses x on x.form_id = r.form_id and x.student_id = r.student_id
      left join form_payments pay on pay.form_id = r.form_id and pay.student_id = r.student_id
      where r.form_id = f.id and app.is_guardian_of(r.student_id))) as j
    from forms f
    where exists (select 1 from form_recipients r where r.form_id = f.id and app.is_guardian_of(r.student_id))) t
$$;

grant select on public.form_removals to authenticated;
grant all on public.form_removals to service_role;
revoke all on function public.form_remove(uuid, boolean) from public, anon;
grant execute on function public.form_remove(uuid, boolean) to authenticated, service_role;
