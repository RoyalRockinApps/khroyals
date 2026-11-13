-- Study (the Study app on students' Main Page): a student's own notes and flash cards.
--
-- Everything here is private to the student who made it: not their parents, their teachers or the office. Only students
-- (an approved account with school_role 'student') write, through the functions below; reads go through row-level
-- security (the owner only) and a few read functions.
--
-- Flash cards are studied the Leitner way: each card sits in a box from 1 to 5. Knowing it moves it up a box and brings
-- it back later (box 2 tomorrow, 3 in three days, 4 in a week, 5 in two weeks, then a month each time it stays in 5);
-- missing it sends it back to box 1, due again today. New cards are due the day they're made.
--
-- A student's notes and cards go with their login: deleting the account deletes them, and so does taking the login
-- away (student_login_remove, or delete_my_account for a student whose parents are in the app).

create table public.study_notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 120),
  subject    text not null default '' check (char_length(subject) <= 60),
  body       text not null default '' check (char_length(body) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.study_notes (owner_id, updated_at desc);

create table public.study_decks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 80),
  subject    text not null default '' check (char_length(subject) <= 60),
  note_id    uuid references public.study_notes (id) on delete set null,   -- made from this note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  studied_at timestamptz
);
create index on public.study_decks (owner_id);

create table public.study_cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.study_decks (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  front       text not null check (char_length(trim(front)) between 1 and 500),
  back        text not null check (char_length(trim(back)) between 1 and 1000),
  position    int not null default 0,
  box         smallint not null default 1 check (box between 1 and 5),
  due_on      date not null default app.school_today(),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.study_cards (deck_id, position);
create index on public.study_cards (owner_id, due_on);

alter table public.study_notes enable row level security;
alter table public.study_decks enable row level security;
alter table public.study_cards enable row level security;
create policy "only the student who made it" on public.study_notes for select to authenticated using (owner_id = auth.uid());
create policy "only the student who made it" on public.study_decks for select to authenticated using (owner_id = auth.uid());
create policy "only the student who made it" on public.study_cards for select to authenticated using (owner_id = auth.uid());
revoke all on public.study_notes, public.study_decks, public.study_cards from anon;
grant select on public.study_notes, public.study_decks, public.study_cards to authenticated;
revoke insert, update, delete on public.study_notes, public.study_decks, public.study_cards from authenticated;
grant all on public.study_notes, public.study_decks, public.study_cards to service_role;

/** Only students study here. */
create function app.require_student() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if app.school_role() is distinct from 'student' then
    raise exception 'Study is for students.' using errcode = '42501';
  end if;
end $$;

-- ----------------------------------------------------------------------
-- Notes
-- ----------------------------------------------------------------------

/** Save a note: a new one (no `p_id`) or one of the student's own. Returns its id. */
create function public.study_note_save(p_id uuid, p_title text, p_body text, p_subject text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare n uuid;
begin
  perform app.require_student();
  if p_id is null then
    if (select count(*) from study_notes where owner_id = auth.uid()) >= 1000 then
      raise exception 'You have 1,000 notes, the most there can be. Delete a few you don''t need first.';
    end if;
    insert into study_notes (owner_id, title, subject, body)
    values (auth.uid(), trim(coalesce(p_title, '')), trim(coalesce(p_subject, '')), coalesce(p_body, ''))
    returning id into n;
  else
    update study_notes set title = trim(coalesce(p_title, '')), subject = trim(coalesce(p_subject, '')),
                           body = coalesce(p_body, ''), updated_at = now()
    where id = p_id and owner_id = auth.uid()
    returning id into n;
    if n is null then raise exception 'This note isn''t yours.' using errcode = '42501'; end if;
  end if;
  return n;
end $$;

/** Delete one of the student's notes (a deck made from it stays). */
create function public.study_note_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from study_notes where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'This note isn''t yours.' using errcode = '42501'; end if;
end $$;

/**
 * The student's notes, newest first, each with the start of its text. `p_query` keeps the ones with every word of it
 * in the title, the subject or the text.
 */
create function public.study_notes_list(p_query text default null)
returns table (id uuid, title text, subject text, preview text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.subject, left(trim(regexp_replace(left(n.body, 400), '\s+', ' ', 'g')), 160), n.updated_at
  from study_notes n
  where n.owner_id = auth.uid()
    and not exists (
      select 1 from unnest(regexp_split_to_array(lower(trim(coalesce(p_query, ''))), '\s+')) w
      where w <> '' and position(w in lower(n.title || ' ' || n.subject || ' ' || n.body)) = 0)
  order by n.updated_at desc
$$;

/** Classes and subjects to file things under: the ones the student has used, and their class sections' names. */
create function public.study_subjects() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.s order by x.s), '{}') from (
    select subject as s from study_notes where owner_id = auth.uid() and subject <> ''
    union select subject from study_decks where owner_id = auth.uid() and subject <> ''
    union select r.name from rosters r join roster_members m on m.roster_id = r.id
          where r.kind = 'section' and m.profile_id = auth.uid() and app.school_role() = 'student'
  ) x
$$;

-- ----------------------------------------------------------------------
-- Flash cards
-- ----------------------------------------------------------------------

/** Make a deck or rename one of the student's own (`p_note`: the note a new deck is made from). Returns its id. */
create function public.study_deck_save(p_id uuid, p_title text, p_subject text default '', p_note uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  perform app.require_student();
  if nullif(trim(p_title), '') is null then raise exception 'Give the deck a name.'; end if;
  if p_id is null then
    if p_note is not null and not exists (select 1 from study_notes where id = p_note and owner_id = auth.uid()) then
      raise exception 'This note isn''t yours.' using errcode = '42501';
    end if;
    if (select count(*) from study_decks where owner_id = auth.uid()) >= 200 then
      raise exception 'You have 200 decks, the most there can be. Delete one you''re done with first.';
    end if;
    insert into study_decks (owner_id, title, subject, note_id)
    values (auth.uid(), trim(p_title), trim(coalesce(p_subject, '')), p_note)
    returning id into d;
  else
    update study_decks set title = trim(p_title), subject = trim(coalesce(p_subject, '')), updated_at = now()
    where id = p_id and owner_id = auth.uid()
    returning id into d;
    if d is null then raise exception 'This deck isn''t yours.' using errcode = '42501'; end if;
  end if;
  return d;
end $$;

/** Delete one of the student's decks with its cards. */
create function public.study_deck_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from study_decks where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'This deck isn''t yours.' using errcode = '42501'; end if;
end $$;

/** Start a deck over: every card back in box 1, new and due today. */
create function public.study_deck_reset(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_student();
  if not exists (select 1 from study_decks where id = p_id and owner_id = auth.uid()) then
    raise exception 'This deck isn''t yours.' using errcode = '42501';
  end if;
  update study_cards set box = 1, due_on = app.school_today(), reviewed_at = null where deck_id = p_id;
  update study_decks set studied_at = null, updated_at = now() where id = p_id;
end $$;

/**
 * The student's decks, the ones used last first, with how many cards each has: due now, new (never studied), known
 * (box 4 or 5) and the rest being learned, and when the next one comes due.
 */
create function public.study_decks_list()
returns table (id uuid, title text, subject text, note_id uuid, cards int, due int, fresh int, known int, next_due date,
               studied_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.title, d.subject, d.note_id,
         count(c.id)::int,
         (count(c.id) filter (where c.due_on <= app.school_today()))::int,
         (count(c.id) filter (where c.reviewed_at is null))::int,
         (count(c.id) filter (where c.box >= 4))::int,
         min(c.due_on) filter (where c.due_on > app.school_today()),
         d.studied_at, d.updated_at
  from study_decks d left join study_cards c on c.deck_id = d.id
  where d.owner_id = auth.uid()
  group by d.id
  order by greatest(d.studied_at, d.updated_at) desc
$$;

/**
 * Add cards to one of the student's decks: `p_cards` is [{front, back}], up to 200 at a time and 500 in a deck.
 * They go at the end, due today. Returns how many were added.
 */
create function public.study_cards_add(p_deck uuid, p_cards jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int; have int; top int;
begin
  perform app.require_student();
  if not exists (select 1 from study_decks where id = p_deck and owner_id = auth.uid()) then
    raise exception 'This deck isn''t yours.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) = 0 then
    raise exception 'Add a card first.';
  end if;
  n := jsonb_array_length(p_cards);
  if n > 200 then raise exception 'Add up to 200 cards at a time.'; end if;
  select count(*), coalesce(max(position), 0) into have, top from study_cards where deck_id = p_deck;
  if have + n > 500 then raise exception 'A deck holds up to 500 cards. Start another deck for the rest.'; end if;
  if exists (select 1 from jsonb_array_elements(p_cards) c
             where nullif(trim(c->>'front'), '') is null or nullif(trim(c->>'back'), '') is null) then
    raise exception 'Every card needs a front and a back.';
  end if;
  insert into study_cards (deck_id, owner_id, front, back, position)
  select p_deck, auth.uid(), trim(x.c->>'front'), trim(x.c->>'back'), top + x.i::int
  from jsonb_array_elements(p_cards) with ordinality as x(c, i);
  update study_decks set updated_at = now() where id = p_deck;
  return n;
end $$;

/** Change a card's front and back (where it is in its boxes stays). */
create function public.study_card_edit(p_id uuid, p_front text, p_back text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_student();
  if nullif(trim(p_front), '') is null or nullif(trim(p_back), '') is null then
    raise exception 'Every card needs a front and a back.';
  end if;
  update study_cards set front = trim(p_front), back = trim(p_back) where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'This card isn''t yours.' using errcode = '42501'; end if;
end $$;

/** Delete one of the student's cards. */
create function public.study_card_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from study_cards where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'This card isn''t yours.' using errcode = '42501'; end if;
end $$;

/**
 * The student answers a card while studying: knew it (up a box and back later) or still learning (box 1, due again
 * today). Returns the card as it is now.
 */
create function public.study_card_review(p_id uuid, p_knew boolean) returns public.study_cards
language plpgsql security definer set search_path = public as $$
declare c study_cards%rowtype; nbox smallint; days int;
begin
  perform app.require_student();
  select * into c from study_cards where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'This card isn''t yours.' using errcode = '42501'; end if;
  if p_knew then
    nbox := least(c.box + 1, 5);
    days := case when c.box = 5 then 30 when nbox = 2 then 1 when nbox = 3 then 3 when nbox = 4 then 7 else 14 end;
  else
    nbox := 1;
    days := 0;
  end if;
  update study_cards set box = nbox, due_on = app.school_today() + days, reviewed_at = now()
  where id = p_id
  returning * into c;
  update study_decks set studied_at = now() where id = c.deck_id;
  return c;
end $$;

-- ----------------------------------------------------------------------
-- Notes and cards go with the login
-- ----------------------------------------------------------------------

/** A student whose login is taken away (the profile stays, managed again) loses their notes and cards with it. */
create function app.study_forget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from study_decks where owner_id = new.id;
  delete from study_notes where owner_id = new.id;
  return new;
end $$;

create trigger study_forget after update of managed on public.profiles
  for each row when (new.managed and not old.managed) execute function app.study_forget();

-- ----------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------

revoke all on function app.require_student(), app.study_forget() from public, anon;
grant execute on function app.require_student() to authenticated, service_role;
revoke all on function public.study_note_save(uuid, text, text, text), public.study_note_delete(uuid), public.study_notes_list(text),
  public.study_subjects(), public.study_deck_save(uuid, text, text, uuid), public.study_deck_delete(uuid), public.study_deck_reset(uuid),
  public.study_decks_list(), public.study_cards_add(uuid, jsonb), public.study_card_edit(uuid, text, text), public.study_card_delete(uuid),
  public.study_card_review(uuid, boolean)
  from public, anon;
grant execute on function public.study_note_save(uuid, text, text, text), public.study_note_delete(uuid), public.study_notes_list(text),
  public.study_subjects(), public.study_deck_save(uuid, text, text, uuid), public.study_deck_delete(uuid), public.study_deck_reset(uuid),
  public.study_decks_list(), public.study_cards_add(uuid, jsonb), public.study_card_edit(uuid, text, text), public.study_card_delete(uuid),
  public.study_card_review(uuid, boolean)
  to authenticated, service_role;
