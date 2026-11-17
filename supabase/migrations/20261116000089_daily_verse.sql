-- A daily verse and devotion for students' Planner (src/devotion/VerseCard.tsx): the school writes one for a day ahead
-- of time (a Bible reference, the verse, and an optional thought for the day), from Announcements → Daily verse
-- (app/announcements/verses.tsx). The people who send the school's announcements (push.send; an admin power, so aal2)
-- write and remove them. Everyone signed in reads them: it's school content, not anyone's data.

create table public.daily_verses (
  day        date primary key,
  reference  text not null check (char_length(trim(reference)) between 1 and 80),
  verse      text not null check (char_length(trim(verse)) between 1 and 800),
  thought    text not null default '' check (char_length(thought) <= 1500),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.daily_verses enable row level security;
create policy "everyone signed in" on public.daily_verses for select to authenticated using (true);
grant select on public.daily_verses to authenticated;
revoke insert, update, delete on public.daily_verses from anon, authenticated;
grant all on public.daily_verses to service_role;

/** Write (or rewrite) a day's verse: today or a day coming up. */
create function public.daily_verse_save(p_day date, p_reference text, p_verse text, p_thought text default '')
returns public.daily_verses
language plpgsql security definer set search_path = public as $$
declare row daily_verses%rowtype;
begin
  perform app.require_permission('push.send');
  if p_day is null or p_day < app.school_today() then raise exception 'Pick today or a day coming up.'; end if;
  if p_day > app.school_today() + 366 then raise exception 'Pick a day within the next year.'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'Add the reference, like "Philippians 4:13".'; end if;
  if coalesce(trim(p_verse), '') = '' then raise exception 'Add the verse.'; end if;
  if char_length(trim(p_reference)) > 80 then raise exception 'Keep the reference to 80 characters.'; end if;
  if char_length(trim(p_verse)) > 800 then raise exception 'Keep the verse to 800 characters.'; end if;
  if char_length(trim(coalesce(p_thought, ''))) > 1500 then raise exception 'Keep the thought to 1,500 characters.'; end if;
  insert into daily_verses (day, reference, verse, thought, updated_by)
  values (p_day, trim(p_reference), trim(p_verse), trim(coalesce(p_thought, '')), auth.uid())
  on conflict (day) do update set reference = excluded.reference, verse = excluded.verse, thought = excluded.thought,
    updated_by = excluded.updated_by, updated_at = now()
  returning * into row;
  return row;
end $$;

create function public.daily_verse_delete(p_day date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  delete from daily_verses where day = p_day;
end $$;

/** The verse for today, or (on a weekend or a day without one) the latest from the last week; none before that. */
create function public.daily_verse_today() returns table (day date, reference text, verse text, thought text)
language sql stable security definer set search_path = public as $$
  select v.day, v.reference, v.verse, v.thought from daily_verses v
  where v.day <= app.school_today() and v.day > app.school_today() - 7 and auth.uid() is not null
  order by v.day desc limit 1
$$;

revoke all on function public.daily_verse_save(date, text, text, text), public.daily_verse_delete(date), public.daily_verse_today()
  from public, anon;
grant execute on function public.daily_verse_save(date, text, text, text), public.daily_verse_delete(date), public.daily_verse_today()
  to authenticated, service_role;
