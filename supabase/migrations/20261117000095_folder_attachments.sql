-- Pictures, PDFs and links on class bulletins and teachers' notes (src/schoolForms/attachments.ts): up to 6 on each. A
-- picture (JPEG or PNG, a flyer or a class photo) shows on the paper in the Folder and opens full screen; a PDF and a
-- link open in the in-app browser. Files are in the private 'folder-files' bucket under the teacher's own folder (up to
-- 15 MB, the types in both src/schoolForms/attachments.ts and the bucket, tests/folder-attachments.test.ts), read only
-- by those who read the note (its parents, a bulletin's students; app.reads_folder_note) and its author. The send
-- functions gain an attachments argument and save them in the same transaction, so nobody opens a note before its files
-- are on it. No raw HTML: pages come as PDFs or links.

create table public.folder_note_attachments (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.folder_notes (id) on delete cascade,
  kind       text not null check (kind in ('image', 'pdf', 'link')),
  path       text check (char_length(path) <= 300),                -- 'folder-files' bucket (a picture or a PDF)
  url        text check (url ~ '^https://' and char_length(url) <= 500),   -- a link
  name       text not null default '' check (char_length(name) <= 120),   -- the file's name, or the link's label
  width      int check (width > 0),
  height     int check (height > 0),
  size_bytes int check (size_bytes > 0),
  position   int not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'link') = (url is not null) and (kind = 'link') = (path is null))
);
create index on public.folder_note_attachments (note_id, position);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('folder-files', 'folder-files', false, 15728640, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

/** Whether this person reads a note's files: its author, and whoever reads the note. */
create function app.reads_folder_files(n uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from folder_notes where id = n and author_id = u) or app.reads_folder_note(n, u)
$$;

alter table public.folder_note_attachments enable row level security;
create policy "its author and its readers" on public.folder_note_attachments for select to authenticated using (app.reads_folder_files(note_id));
grant select on public.folder_note_attachments to authenticated;
revoke insert, update, delete on public.folder_note_attachments from anon, authenticated;
grant all on public.folder_note_attachments to service_role;

create policy "folder files: teachers upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'folder-files' and (storage.foldername(name))[1] = auth.uid()::text and app.is_staff());
create policy "folder files: the note's author and readers" on storage.objects for select to authenticated
  using (bucket_id = 'folder-files' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.folder_note_attachments a where a.path = objects.name and app.reads_folder_files(a.note_id))));
create policy "folder files: the uploader removes theirs" on storage.objects for delete to authenticated
  using (bucket_id = 'folder-files' and (storage.foldername(name))[1] = auth.uid()::text);

/**
 * Puts the attachments on a note the caller just wrote: a JSON array (up to 6) of {kind: 'image' | 'pdf', path, name,
 * width?, height?, size?} for a file they uploaded to their own folder, or {kind: 'link', url, name?}.
 */
create function app.folder_note_attach(n uuid, att jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a jsonb; k text; p text; link text; i int := 0;
begin
  if att is null or jsonb_typeof(att) <> 'array' or jsonb_array_length(att) = 0 then return; end if;
  if jsonb_array_length(att) > 6 then raise exception 'Attach up to 6 pictures, PDFs or links.'; end if;
  for a in select * from jsonb_array_elements(att) loop
    k := a->>'kind';
    if k in ('image', 'pdf') then
      p := a->>'path';
      if p is null or split_part(p, '/', 1) <> auth.uid()::text
         or not exists (select 1 from storage.objects where bucket_id = 'folder-files' and name = p) then
        raise exception 'Upload the file first.';
      end if;
      insert into folder_note_attachments (note_id, kind, path, name, width, height, size_bytes, position)
      values (n, k, p, left(coalesce(nullif(trim(a->>'name'), ''), case when k = 'image' then 'Picture' else 'PDF' end), 120),
              nullif((a->>'width')::int, 0), nullif((a->>'height')::int, 0), nullif((a->>'size')::int, 0), i);
    elsif k = 'link' then
      link := trim(coalesce(a->>'url', ''));
      if link !~ '^https://[^\s/]+\.[^\s]+$' or char_length(link) > 500 then raise exception 'Links start with https:// (like https://www.example.com).'; end if;
      insert into folder_note_attachments (note_id, kind, url, name, position)
      values (n, 'link', link, left(coalesce(nullif(trim(a->>'name'), ''), split_part(split_part(link, '://', 2), '/', 1)), 120), i);
    else
      raise exception 'Attach a picture, a PDF or a link.';
    end if;
    i := i + 1;
  end loop;
end $$;

/** A class bulletin with attachments (see the three-argument one); all in one transaction. */
create function public.folder_bulletin_send(p_sections text[], p_title text, p_body text, p_attachments jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid;
begin
  n := public.folder_bulletin_send(p_sections, p_title, p_body);
  perform app.folder_note_attach(n, p_attachments);
  return n;
end $$;

/** A note to a family with attachments (see the three-argument one); all in one transaction. */
create function public.folder_note_send(p_student uuid, p_title text, p_body text, p_attachments jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid;
begin
  n := public.folder_note_send(p_student, p_title, p_body);
  perform app.folder_note_attach(n, p_attachments);
  return n;
end $$;

/** A note's attachments, in order. */
create function app.folder_note_files(n uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'path', a.path, 'url', a.url, 'name', a.name,
    'width', a.width, 'height', a.height) order by a.position, a.created_at), '[]')
  from folder_note_attachments a where a.note_id = n
$$;

/**
 * A parent's bulletins and notes from the last 60 days, newest first (and a student's class bulletins): what it says,
 * who wrote it, which of their children it's for (and a bulletin's classes), its attachments, and when they opened it
 * or took it out of their Folder.
 */
create or replace function public.my_folder_notes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'from', app.folder_note_from(n), 'sentAt', n.created_at,
    'children', (select coalesce(jsonb_agg(p.first_name order by p.first_name), '[]') from profiles p
                 where p.id in (select app.folder_note_students(n.id)) and app.is_guardian_of(p.id)),
    'classes', (select coalesce(jsonb_agg(r.name order by r.name), '[]') from folder_note_sections s join rosters r on r.id = s.section_id
                where s.note_id = n.id),
    'attachments', app.folder_note_files(n.id),
    'readAt', x.read_at, 'removedAt', x.removed_at) order by n.created_at desc), '[]')
  from folder_notes n left join folder_note_readers x on x.note_id = n.id and x.user_id = auth.uid()
  where n.created_at > now() - interval '60 days' and app.reads_folder_note(n.id)
$$;

/** A teacher's own bulletins and notes from the last 90 days, newest first, with how many parents have opened each. */
create or replace function public.sent_folder_notes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'sentAt', n.created_at,
    'to', case when n.kind = 'note' then (select trim(first_name || ' ' || last_name) from profiles where id = n.student_id) || '''s parents'
               else (select string_agg(r.name, ', ' order by r.name) from folder_note_sections s join rosters r on r.id = s.section_id where s.note_id = n.id) end,
    'parents', (select count(*) from app.folder_note_parents(n.id)),
    'read', (select count(*) from folder_note_readers x where x.note_id = n.id and x.read_at is not null
               and x.user_id in (select app.folder_note_parents(n.id))),
    'attachments', app.folder_note_files(n.id)) order by n.created_at desc), '[]')
  from folder_notes n
  where n.author_id = auth.uid() and n.created_at > now() - interval '90 days'
$$;

revoke all on function app.reads_folder_files(uuid, uuid), app.folder_note_attach(uuid, jsonb), app.folder_note_files(uuid) from public, anon;
grant execute on function app.reads_folder_files(uuid, uuid), app.folder_note_files(uuid) to authenticated, service_role;
revoke all on function public.folder_bulletin_send(text[], text, text, jsonb), public.folder_note_send(uuid, text, text, jsonb) from public, anon;
grant execute on function public.folder_bulletin_send(text[], text, text, jsonb), public.folder_note_send(uuid, text, text, jsonb) to authenticated, service_role;
