/**
 * The standard calendar format (iCalendar, RFC 5545) that Google Calendar, Outlook, Yahoo and
 * Apple Calendar read: events in, text out. Shared by the calendar-feed Edge Function and the
 * tests; no Deno or app imports.
 */

export type FeedEvent = {
  uid: string; title: string;
  /** Timed events: exact moments (ISO). */
  starts_at: string | null; ends_at: string | null;
  /** All-day events: YYYY-MM-DD, `end_date` the last day. */
  start_date: string | null; end_date: string | null;
  location: string | null; details: string | null; cancelled: boolean; updated_at: string | null;
};

/** Text values: backslash, semicolon, comma and line breaks escaped. */
export const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded: CRLF and a space, never splitting a character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** 2026-11-03T21:30:00Z → 20261103T213000Z (UTC). */
export const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** 2026-11-03 → 20261103. */
const day = (d: string) => d.replace(/-/g, '');
/** The day after a YYYY-MM-DD: all-day events end the day after their last day. */
export function nextDay(d: string) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export function toIcs(name: string, host: string, events: FeedEvent[], now = new Date().toISOString()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//RoyalRockinApps//${escapeText(name)}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`, 'X-WR-TIMEZONE:America/Chicago', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    const timed = !!e.starts_at;
    if (!timed && !e.start_date) continue;
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@${host}`, `DTSTAMP:${utc(e.updated_at ?? now)}`);
    if (timed) {
      lines.push(`DTSTART:${utc(e.starts_at!)}`);
      if (e.ends_at) lines.push(`DTEND:${utc(e.ends_at)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day(e.start_date!)}`, `DTEND;VALUE=DATE:${day(nextDay(e.end_date ?? e.start_date!))}`);
    }
    lines.push(`SUMMARY:${escapeText(e.cancelled ? `Cancelled: ${e.title}` : e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.details) lines.push(`DESCRIPTION:${escapeText(e.details)}`);
    if (e.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
