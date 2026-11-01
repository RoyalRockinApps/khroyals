/**
 * Volunteer check-in, the same rules as the database (supabase/migrations/…_volunteer_check_in.sql): volunteers check
 * themselves in on a day the opportunity runs, from an hour before it starts until it ends (any time that day without
 * times). Times and days go by the school's clock. No app imports, so tests run it.
 */
import { schoolMinutes, schoolToday } from '../calendar/past';

type Days = { startsOn: string; endsOn: string | null };
type Timed = Days & { startTime: string | null; endTime: string | null };

const toMinutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, '0');

/** "3:00 PM" from 24-hour "15:00" (or minutes after midnight). */
export function clock(hm: string | number): string {
  const total = typeof hm === 'number' ? ((hm % 1440) + 1440) % 1440 : toMinutes(hm);
  const h = Math.floor(total / 60);
  return `${((h + 11) % 12) + 1}:${pad(total % 60)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** What a check-in QR code says; volunteers scan it in the app. */
export const checkInQr = (code: string) => `VOL-${code}`;
/** Printed under the QR code, to type in when a scan won't read (or on the web, which has no scanner). */
export const shortCheckInCode = (code: string) => code.slice(0, 8).toUpperCase();

/** The time a moment happened on the school's clock: "3:02 PM". */
export const clockAt = (iso: string) => clock(schoolMinutes(new Date(iso)));

/** Whether it runs on a day (YYYY-MM-DD). */
export const runsOn = (o: Days, day: string) => day >= o.startsOn && day <= (o.endsOn ?? o.startsOn);

/** Its days from the first up to a day (today by default), oldest first. */
export function daysUpTo(o: Days, last = schoolToday()): string[] {
  const end = (o.endsOn ?? o.startsOn) < last ? (o.endsOn ?? o.startsOn) : last;
  const days: string[] = [];
  for (let d = new Date(`${o.startsOn}T12:00:00Z`); d.toISOString().slice(0, 10) <= end && days.length < 366; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export type Window = { state: 'not_today' } | { state: 'before'; opensAt: string } | { state: 'open' } | { state: 'closed' };

/** Whether volunteers can check themselves in now. */
export function checkInWindow(o: Timed, today = schoolToday(), now = schoolMinutes()): Window {
  if (!runsOn(o, today)) return { state: 'not_today' };
  const start = o.startTime ? toMinutes(o.startTime) : null;
  const end = o.endTime ? toMinutes(o.endTime) : null;
  if (start !== null && now < start - 60) return { state: 'before', opensAt: clock(start - 60) };
  if (end !== null && (start === null || end > start) && now >= end) return { state: 'closed' };
  return { state: 'open' };
}

/** A scheduled shift's length in minutes, or null without both times. */
export function shiftMinutes(o: { startTime: string | null; endTime: string | null }): number | null {
  if (!o.startTime || !o.endTime) return null;
  const m = toMinutes(o.endTime) - toMinutes(o.startTime);
  return m > 0 ? m : null;
}

/** "2 h 30 min", "45 min", "under a minute". */
export function duration(minutes: number): string {
  if (minutes < 1) return 'under a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Hours for the analytics: "18.5 h", "0 h". */
export const hours = (minutes: number) => `${Math.round(minutes / 6) / 10} h`;

/** "Mon, Nov 2". */
export const dayLabel = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Why someone is flagged as doing a lot, given the limits; null when they aren't. */
export function busyReason(r: { recentShifts: number; recentMinutes: number; upcoming: number }, limits: { hours: number; shifts: number }): string | null {
  if (r.recentMinutes >= limits.hours * 60) return `${hours(r.recentMinutes)} in the last 30 days`;
  if (r.recentShifts >= limits.shifts) return `${r.recentShifts} shifts in the last 30 days`;
  if (r.upcoming >= limits.shifts) return `${r.upcoming} shifts in the next 30 days`;
  return null;
}

/** The first day of the school year a day falls in (school years start July 1). */
export function schoolYearStart(day = schoolToday()): string {
  const [y, m] = day.split('-').map(Number);
  return `${m >= 7 ? y : y - 1}-07-01`;
}

/** A day a number of days before (or after) another. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
