/**
 * A person's calendar subscription: GET ?t=<their link's key> returns their calendar
 * (calendar_feed_events) in the standard format Google Calendar, Outlook, Yahoo and Apple
 * Calendar subscribe to. Calendar apps can't sign in, so the key in the link is the only way
 * in; a new link (calendar_feed_token(true)) turns the old one off. No student names, ever.
 * Deployed without JWT verification (scripts/supabase_setup.mjs).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { toIcs, type FeedEvent } from './ics.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const db = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  const t = q.get('t') ?? '';
  // ?event=school-<id> / activity-<id>: one public event, for "Add to calendar" on an iPhone.
  const one = q.get('event') ?? '';
  if (!/^[0-9a-f]{64}$/.test(t) && !/^(school|activity)-[0-9a-f-]{36}$/.test(one)) return new Response('Not found', { status: 404 });
  const [{ data, error }, { data: name }] = await Promise.all([
    one ? db.rpc('calendar_event', { p_uid: one }) : db.rpc('calendar_feed_events', { p_token: t }),
    db.rpc('school_app_name'),
  ]);
  if (error) return new Response('Try again later', { status: 503 });
  const body = toIcs(String(name ?? 'School calendar'), new URL(URL_).host, (data ?? []) as FeedEvent[]);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="calendar.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
});
