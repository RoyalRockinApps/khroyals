/** Calendars outside the app: the subscription file (supabase/functions/calendar-feed/ics.ts) and the "Add to calendar" links (src/calendar/addTo.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeText, fold, toIcs, type FeedEvent } from '../supabase/functions/calendar-feed/ics';
import { googleEventUrl, outlookEventUrl, subscribeLinks, yahooEventUrl } from '../src/calendar/addTo';

const ev = (over: Partial<FeedEvent>): FeedEvent => ({
  uid: 'activity-1', title: 'Soccer · vs. Randolph', starts_at: '2026-11-03T21:30:00Z', ends_at: '2026-11-03T23:30:00Z',
  start_date: null, end_date: null, location: 'Royals Field, 3401 Holmes Ave', details: null, cancelled: false, updated_at: '2026-11-01T10:00:00Z', ...over,
});

test('the calendar file: timed, all-day and cancelled events, escaped and folded', () => {
  const ics = toIcs('KH Royals', 'x.supabase.co', [
    ev({}),
    ev({ uid: 'school-2', title: 'Fall Break', starts_at: null, ends_at: null, start_date: '2026-11-23', end_date: '2026-11-27', location: null }),
    ev({ uid: 'activity-3', cancelled: true }),
  ]);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /UID:activity-1@x\.supabase\.co\r\nDTSTAMP:20261101T100000Z\r\nDTSTART:20261103T213000Z\r\nDTEND:20261103T233000Z/);
  assert.match(ics, /LOCATION:Royals Field\\, 3401 Holmes Ave/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261128/, 'all-day ends the day after its last day');
  assert.match(ics, /SUMMARY:Cancelled: Soccer · vs\. Randolph\r\n(.*\r\n)*STATUS:CANCELLED/);
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 3);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('text escaping and line folding', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  const long = `DESCRIPTION:${'é'.repeat(60)}`;
  const folded = fold(long);
  assert.ok(folded.split('\r\n ').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.equal(folded.split('\r\n ').join(''), long, 'unfolds back to the same text');
});

test('"Add to calendar" links for Google, Outlook and Yahoo', () => {
  const timed = { title: 'Soccer', startsAt: '2026-11-03T21:30:00Z', location: 'Gym' };
  assert.match(googleEventUrl(timed), /action=TEMPLATE&text=Soccer&dates=20261103T213000Z%2F20261103T223000Z&location=Gym/);
  assert.match(googleEventUrl({ title: 'Fall Break', date: '2026-11-23', endDate: '2026-11-27' }), /dates=20261123%2F20261128/);
  assert.match(outlookEventUrl(timed), /^https:\/\/outlook\.live\.com\/.*startdt=2026-11-03T21%3A30%3A00\.000Z.*allday=false/);
  assert.match(outlookEventUrl(timed, true), /^https:\/\/outlook\.office\.com\//);
  assert.match(yahooEventUrl({ title: 'Fall Break', date: '2026-11-23' }), /st=20261123&dur=allday/);
});

test('subscription links for each calendar', () => {
  const l = subscribeLinks('https://abc.supabase.co/', 'f'.repeat(64), 'KH Royals');
  assert.equal(l.https, `https://abc.supabase.co/functions/v1/calendar-feed?t=${'f'.repeat(64)}`);
  assert.equal(l.apple, l.https.replace('https:', 'webcal:'));
  assert.equal(l.google, `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(l.webcal)}`);
  assert.match(l.outlook, /^https:\/\/outlook\.live\.com\/calendar\/0\/addfromweb\?url=https%3A%2F%2Fabc/);
});

test('school times become exact moments, standard and daylight time alike', async () => {
  const { chicagoIso } = await import('../src/calendar/addTo');
  assert.equal(chicagoIso('2026-11-03', '16:30'), '2026-11-03T22:30:00.000Z');
  assert.equal(chicagoIso('2026-10-15', '16:30'), '2026-10-15T21:30:00.000Z');
});
