/**
 * Links that put school events into people's own calendars (Google, Outlook, Yahoo, Apple),
 * one event at a time ("Add to calendar") or as a subscription that keeps itself up to date
 * (calendar_feed_token, the calendar-feed Edge Function). No app imports, so tests run it.
 */

/** One event as the links need it: exact moments (ISO) for timed events, YYYY-MM-DD for all-day ones. */
export type CalEvent = {
  title: string; startsAt?: string | null; endsAt?: string | null;
  /** All-day: the first and last day. */
  date?: string | null; endDate?: string | null;
  location?: string | null; details?: string | null;
};

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ymd = (d: string) => d.replace(/-/g, '');
export function nextDay(d: string) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
/** A timed event without an end lasts an hour. */
const endOf = (e: CalEvent) => e.endsAt ?? new Date(new Date(e.startsAt!).getTime() + 3600_000).toISOString();
const q = (o: Record<string, string | null | undefined>) =>
  Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export function googleEventUrl(e: CalEvent) {
  const dates = e.startsAt ? `${utc(e.startsAt)}/${utc(endOf(e))}` : `${ymd(e.date!)}/${ymd(nextDay(e.endDate ?? e.date!))}`;
  return `https://calendar.google.com/calendar/render?${q({ action: 'TEMPLATE', text: e.title, dates, location: e.location, details: e.details })}`;
}

/** `work`: Outlook for work or school accounts (Microsoft 365); otherwise Outlook.com. */
export function outlookEventUrl(e: CalEvent, work = false) {
  const allday = !e.startsAt;
  return `https://${work ? 'outlook.office.com' : 'outlook.live.com'}/calendar/0/deeplink/compose?${q({
    path: '/calendar/action/compose', rru: 'addevent', subject: e.title,
    startdt: allday ? e.date : new Date(e.startsAt!).toISOString(),
    enddt: allday ? nextDay(e.endDate ?? e.date!) : new Date(endOf(e)).toISOString(),
    allday: String(allday), location: e.location, body: e.details,
  })}`;
}

export function yahooEventUrl(e: CalEvent) {
  return `https://calendar.yahoo.com/?${q(e.startsAt
    ? { v: '60', title: e.title, st: utc(e.startsAt), et: utc(endOf(e)), in_loc: e.location, desc: e.details }
    : { v: '60', title: e.title, st: ymd(e.date!), dur: 'allday', in_loc: e.location, desc: e.details })}`;
}

/** The calendar-feed function's address on the school's Supabase project. */
export const feedBase = (supabaseUrl: string) => `${supabaseUrl.replace(/\/$/, '')}/functions/v1/calendar-feed`;

/** A public school or activity event as a calendar file (iPhone and Mac open it in Calendar). */
export const eventFileUrl = (supabaseUrl: string, uid: string) => `${feedBase(supabaseUrl)}?event=${encodeURIComponent(uid)}`;

/** Everything a subscription needs: the link itself, and one-tap links for each calendar. */
export function subscribeLinks(supabaseUrl: string, token: string, name: string) {
  const https = `${feedBase(supabaseUrl)}?t=${token}`;
  const webcal = https.replace(/^https:/, 'webcal:');
  return {
    https, webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?${q({ url: https, name })}`,
    outlookWork: `https://outlook.office.com/calendar/0/addfromweb?${q({ url: https, name })}`,
    apple: webcal,
  };
}

/** A date and 24-hour time on the school's clock (Central time) → the exact moment (ISO, UTC). */
export function chicagoIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const part = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  return new Date(guess + (guess - shown)).toISOString();
}
