-- Newsletter issues written in the app, not only imported from Smore: whoever can add an issue
-- (push.send) pastes or types it (the app shapes it into the same blocks, src/news/compose.ts),
-- and can change or delete it later. A written issue has no Smore page: its source_url is
-- 'app:<its id>', and the app shows no "Open the original" link for it.

alter table public.newsletters drop constraint newsletters_source_url_check;
alter table public.newsletters add constraint newsletters_source_url_check
  check (source_url ~ '^https://app\.smore\.com/n/' or source_url ~ '^app:[0-9a-f-]{36}$');

/** push.send: add an issue written in the app (no `p_id`), or change one. Returns its id. */
create function public.newsletter_write(p_id uuid, p_title text, p_sent_on date, p_blocks jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid := coalesce(p_id, gen_random_uuid());
begin
  perform app.require_permission('push.send');
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the issue a title.'; end if;
  if char_length(trim(p_title)) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if p_sent_on is null then raise exception 'The issue needs its date.'; end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then
    raise exception 'Write something in the issue first.';
  end if;
  if length(p_blocks::text) > 300000 then raise exception 'That issue is too long to add.'; end if;
  if exists (select 1 from jsonb_array_elements(p_blocks) b where b->>'kind' not in ('heading', 'text', 'image')) then
    raise exception 'That issue has something the app can''t show.';
  end if;
  if p_id is not null and not exists (select 1 from newsletters where id = p_id and source_url = 'app:' || p_id) then
    raise exception 'Only issues written in the app can be changed here.';
  end if;
  insert into newsletters (id, title, sent_on, source_url, blocks, created_by)
  values (nid, trim(p_title), p_sent_on, 'app:' || nid, p_blocks, auth.uid())
  on conflict (id) do update set title = excluded.title, sent_on = excluded.sent_on, blocks = excluded.blocks;
  perform app.audit(null, 'newsletter.saved', nid::text, jsonb_build_object('sentOn', p_sent_on, 'written', true));
  return nid;
end $$;

revoke all on function public.newsletter_write(uuid, text, date, jsonb) from public, anon;
grant execute on function public.newsletter_write(uuid, text, date, jsonb) to authenticated, service_role;
