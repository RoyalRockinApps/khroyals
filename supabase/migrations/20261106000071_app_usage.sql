-- App usage: which apps people open and how often (Admin portal → App usage, for audit.view holders).
--
-- The app records one row per person, app and day (app_usage: how many times they opened it that day, and their role
-- then), from the root layout whenever someone moves into an app or comes back to it (src/usage/UsageTracker.tsx).
-- Approved accounts only; students too. usage_summary gives counts only: people active today, this week and this
-- month, people by role, people per day, and each app's people, opens and days used, by role. Nobody's name, and
-- nobody's own history, is shown; people read only their own rows. Rows are erased after 400 days
-- (app.purge_app_usage), so a school year can be compared with the one before.

create table public.app_usage (
  day      date not null default app.school_today(),
  user_id  uuid not null references public.profiles (id) on delete cascade,
  app      text not null check (app ~ '^[a-z][a-z0-9_]{1,30}$'),
  role     text not null,
  opens    int not null default 1 check (opens between 1 and 500),
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (day, user_id, app)
);
create index on public.app_usage (app, day);

alter table public.app_usage enable row level security;
create policy "their own" on public.app_usage for select to authenticated using (user_id = auth.uid());

/** An approved account opened (or came back to) an app today; counts up to 500 a day per app. Nothing for anyone else. */
create function public.usage_log(p_app text) returns void
language plpgsql security definer set search_path = public as $$
declare r text := app.school_role();
begin
  if r is null then return; end if;
  if p_app is null or p_app !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'Unknown app.'; end if;
  insert into app_usage (user_id, app, role) values (auth.uid(), p_app, r)
  on conflict (day, user_id, app) do update set opens = least(app_usage.opens + 1, 500), role = excluded.role, last_at = now();
end $$;

/**
 * audit.view: app usage over the last p_days days (1–400): people active today, in the last 7 and 30 days and in the
 * period; accounts and active people by role; active people per day; and per app, its people, opens and person-days,
 * with people by role. Counts only.
 */
create function public.usage_summary(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := app.school_today(); n int := greatest(1, least(coalesce(p_days, 30), 400)); d1 date;
begin
  perform app.require_permission('audit.view');
  d1 := today - (n - 1);
  return jsonb_build_object(
    'days', n, 'from', d1, 'to', today,
    'accounts', coalesce((select jsonb_object_agg(x.r, x.c) from (
        select school_role as r, count(*) as c from profiles where school_role is not null and not managed group by school_role) x), '{}'::jsonb),
    'active', jsonb_build_object(
      'today', (select count(distinct user_id) from app_usage where day = today),
      'week', (select count(distinct user_id) from app_usage where day > today - 7),
      'month', (select count(distinct user_id) from app_usage where day > today - 30),
      'period', (select count(distinct user_id) from app_usage where day >= d1)),
    'byRole', coalesce((select jsonb_object_agg(x.role, x.c) from (
        select role, count(distinct user_id) as c from app_usage where day >= d1 group by role) x), '{}'::jsonb),
    'daily', (select jsonb_agg(jsonb_build_object('day', g::date,
        'people', (select count(distinct u.user_id) from app_usage u where u.day = g::date)) order by g)
      from generate_series(d1, today, interval '1 day') g),
    'apps', coalesce((select jsonb_agg(jsonb_build_object('app', a.app, 'people', a.people, 'opens', a.opens, 'days', a.days,
        'roles', (select jsonb_object_agg(r.role, r.c) from (
            select role, count(distinct user_id) as c from app_usage u where u.app = a.app and u.day >= d1 group by role) r))
        order by a.people desc, a.opens desc, a.app)
      from (select app, count(distinct user_id) as people, sum(opens) as opens, count(*) as days
            from app_usage where day >= d1 group by app) a), '[]'::jsonb));
end $$;

/** Daily: erase usage older than 400 days. */
create function app.purge_app_usage() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from app_usage where day < app.school_today() - 400;
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-app-usage', '45 7 * * *', 'select app.purge_app_usage()');
  end if;
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end $$;

grant select on public.app_usage to authenticated;
grant all on public.app_usage to service_role;
revoke all on function app.purge_app_usage() from public, anon, authenticated;
revoke all on function public.usage_log(text), public.usage_summary(int) from public, anon;
grant execute on function public.usage_log(text), public.usage_summary(int) to authenticated, service_role;
