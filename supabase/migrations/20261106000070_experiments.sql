-- A/B tests: different groups of people see different versions of one part of the app, and the counts show which works
-- better. The first: the newsletter card on the Planner (A: the card as it was; B: the latest issue's title with a New
-- badge, opening that issue).
--
-- Each test is a row here and an entry in src/experiments/registry.ts (what each version looks like; tests compare the
-- two). Everyone with an approved account except students is in a running test, split by a hash of the test and their
-- id (app.experiment_variant), so a person always gets the same version on every device and nobody chooses who sees
-- what. The app records three things per person and subject (an issue): saw it (scrolled into view), opened it, and
-- finished (read to the end); each once (experiment_log). Results are counts per version (experiment_results), for
-- push.send holders (who run the newsletter); nobody's name or answers are shown, and people read only their own rows.
-- Never test safety, consent or legal wording (alerts, pickup and check-out, forms, sign-in).

create table public.experiments (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  title      text not null check (char_length(trim(title)) between 1 and 120),
  variants   text[] not null default '{a,b}' check (cardinality(variants) between 2 and 4),
  active     boolean not null default false,
  started_at timestamptz,
  stopped_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.experiment_events (
  experiment text not null references public.experiments (key) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  variant    text not null,
  event      text not null check (event in ('seen', 'opened', 'finished')),
  subject    text not null default '' check (char_length(subject) <= 80),   -- what it was about (a newsletter issue's id)
  at         timestamptz not null default now(),
  primary key (experiment, user_id, event, subject)
);
create index on public.experiment_events (experiment, variant, event);

insert into public.experiments (key, title) values ('royal_news_card', 'Newsletter card on the Planner') on conflict (key) do nothing;

alter table public.experiments enable row level security;
alter table public.experiment_events enable row level security;
create policy "everyone signed in" on public.experiments for select to authenticated using (true);
create policy "their own" on public.experiment_events for select to authenticated using (user_id = auth.uid());

/** Which version of a running test this person gets (null: not running, or not in it: students, pending, children without a login). */
create function app.experiment_variant(k text, u uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as $$
  select e.variants[1 + (('x' || substr(md5(e.key || ':' || u::text), 1, 7))::bit(28)::int % cardinality(e.variants))]
  from experiments e
  where e.key = k and e.active and u is not null
    and coalesce(app.school_role(u), 'student') <> 'student'
    and not coalesce((select managed from profiles where id = u), true)
$$;

/** The caller's versions of every running test: {"royal_news_card": "b"}. */
create function public.my_experiments() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.key, x.variant), '{}'::jsonb)
  from (select e.key, app.experiment_variant(e.key) as variant from experiments e where e.active) x
  where x.variant is not null
$$;

/** Record that the caller saw, opened or finished something in a running test (once each); nothing when they aren't in it. */
create function public.experiment_log(p_key text, p_event text, p_subject text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if p_event is null or p_event not in ('seen', 'opened', 'finished') then raise exception 'Unknown event.'; end if;
  v := app.experiment_variant(p_key);
  if v is null then return; end if;
  insert into experiment_events (experiment, user_id, variant, event, subject)
  values (p_key, auth.uid(), v, p_event, left(coalesce(p_subject, ''), 80))
  on conflict do nothing;
end $$;

/** push.send: every test, running or not, with how many people it has counted. */
create function public.experiments_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  return coalesce((select jsonb_agg(jsonb_build_object('key', e.key, 'title', e.title, 'active', e.active,
      'startedAt', e.started_at, 'stoppedAt', e.stopped_at,
      'people', (select count(distinct x.user_id) from experiment_events x where x.experiment = e.key)) order by e.active desc, e.key)
    from experiments e), '[]'::jsonb);
end $$;

/**
 * push.send: a test's counts per version. `seen`: people times subjects that came into view; `opened` and `finished`:
 * of those, how many were opened and read to the end (only counted after being seen). Counts only.
 */
create function public.experiment_results(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  return (select jsonb_build_object('key', e.key, 'title', e.title, 'active', e.active, 'startedAt', e.started_at,
      'stoppedAt', e.stopped_at,
      'subjects', (select count(distinct x.subject) from experiment_events x where x.experiment = e.key and x.event = 'seen'),
      'variants', (select jsonb_agg(jsonb_build_object('variant', v,
          'people', (select count(distinct x.user_id) from experiment_events x where x.experiment = e.key and x.variant = v),
          'seen', (select count(*) from experiment_events x where x.experiment = e.key and x.variant = v and x.event = 'seen'),
          'opened', (select count(*) from experiment_events x where x.experiment = e.key and x.variant = v and x.event = 'opened'
            and exists (select 1 from experiment_events y where y.experiment = e.key and y.user_id = x.user_id
                        and y.subject = x.subject and y.event = 'seen')),
          'finished', (select count(*) from experiment_events x where x.experiment = e.key and x.variant = v and x.event = 'finished'
            and exists (select 1 from experiment_events y where y.experiment = e.key and y.user_id = x.user_id
                        and y.subject = x.subject and y.event = 'seen'))) order by o)
        from unnest(e.variants) with ordinality as u(v, o)))
    from experiments e where e.key = p_key);
end $$;

/** push.send: start or stop a test; `p_reset` starts it over, clearing what it had counted. */
create function public.experiment_set(p_key text, p_active boolean, p_reset boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_permission('push.send');
  if not exists (select 1 from experiments where key = p_key) then raise exception 'No such test.'; end if;
  if coalesce(p_reset, false) then delete from experiment_events where experiment = p_key; end if;
  update experiments set active = coalesce(p_active, false), updated_by = auth.uid(),
    started_at = case when coalesce(p_active, false) and (started_at is null or coalesce(p_reset, false)) then now() else started_at end,
    stopped_at = case when coalesce(p_active, false) then null else now() end
  where key = p_key;
  perform app.audit(null, case when coalesce(p_active, false) then 'experiment.started' else 'experiment.stopped' end, p_key,
    case when coalesce(p_reset, false) then jsonb_build_object('reset', true) end);
end $$;

grant select on public.experiments, public.experiment_events to authenticated;
grant all on public.experiments, public.experiment_events to service_role;
revoke all on function public.my_experiments(), public.experiment_log(text, text, text), public.experiments_list(),
  public.experiment_results(text), public.experiment_set(text, boolean, boolean) from public, anon;
grant execute on function public.my_experiments(), public.experiment_log(text, text, text), public.experiments_list(),
  public.experiment_results(text), public.experiment_set(text, boolean, boolean) to authenticated, service_role;
