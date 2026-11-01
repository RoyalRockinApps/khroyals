/** src/volunteer/attendance.ts: when volunteers can check in (the same cases as the database test), days, times and who's doing a lot. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, busyReason, checkInQr, checkInWindow, clock, daysUpTo, duration, hours, runsOn, schoolYearStart, shiftMinutes, shortCheckInCode,
} from '../src/volunteer/attendance';

const at = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

test('check-in opens an hour before it starts and closes when it ends, on its days only', () => {
  const ushers = { startsOn: '2026-11-02', endsOn: null, startTime: '15:00', endTime: '17:00' };
  assert.deepEqual(checkInWindow(ushers, '2026-11-02', at('13:59')), { state: 'before', opensAt: '2:00 PM' });
  assert.deepEqual(checkInWindow(ushers, '2026-11-02', at('14:00')), { state: 'open' });
  assert.deepEqual(checkInWindow(ushers, '2026-11-02', at('16:59')), { state: 'open' });
  assert.deepEqual(checkInWindow(ushers, '2026-11-02', at('17:00')), { state: 'closed' });
  assert.deepEqual(checkInWindow(ushers, '2026-11-03', at('15:00')), { state: 'not_today' });
  // Without times, any time that day; with only a start, until the day ends.
  assert.deepEqual(checkInWindow({ ...ushers, startTime: null, endTime: null }, '2026-11-02', at('06:00')), { state: 'open' });
  assert.deepEqual(checkInWindow({ ...ushers, endTime: null }, '2026-11-02', at('23:30')), { state: 'open' });
  // Every day of a multi-day one.
  assert.deepEqual(checkInWindow({ ...ushers, endsOn: '2026-11-05' }, '2026-11-04', at('15:30')), { state: 'open' });
});

test("the check-in QR code's text, and the short code printed under it", () => {
  const code = '0f3a9c2e7b5d4e1fa2b3c4d5e6f70819';
  assert.equal(checkInQr(code), 'VOL-0f3a9c2e7b5d4e1fa2b3c4d5e6f70819');
  assert.equal(shortCheckInCode(code), '0F3A9C2E');
});

test('its days so far, and the times in words', () => {
  const carpool = { startsOn: '2026-10-30', endsOn: '2026-11-03' };
  assert.deepEqual(daysUpTo(carpool, '2026-11-01'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(daysUpTo(carpool, '2026-12-01'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepEqual(daysUpTo(carpool, '2026-10-29'), []);
  assert.equal(runsOn(carpool, '2026-11-03'), true);
  assert.equal(runsOn({ startsOn: '2026-11-03', endsOn: null }, '2026-11-04'), false);
  assert.equal(clock('15:00'), '3:00 PM');
  assert.equal(clock('00:05'), '12:05 AM');
  assert.equal(clock(at('12:30')), '12:30 PM');
  assert.equal(shiftMinutes({ startTime: '09:00', endTime: '12:00' }), 180);
  assert.equal(shiftMinutes({ startTime: '09:00', endTime: null }), null);
  assert.deepEqual([duration(0), duration(45), duration(120), duration(150)], ['under a minute', '45 min', '2 h', '2 h 30 min']);
  assert.deepEqual([hours(0), hours(150), hours(175)], ['0 h', '2.5 h', '2.9 h']);
  assert.equal(addDays('2026-11-01', -29), '2026-10-03');
  assert.deepEqual([schoolYearStart('2026-11-01'), schoolYearStart('2027-03-01'), schoolYearStart('2027-07-01')], ['2026-07-01', '2026-07-01', '2027-07-01']);
});

test("doing a lot: hours or shifts in the last 30 days, or shifts signed up for in the next 30", () => {
  const limits = { hours: 12, shifts: 6 };
  assert.equal(busyReason({ recentShifts: 2, recentMinutes: 13 * 60, upcoming: 0 }, limits), '13 h in the last 30 days');
  assert.equal(busyReason({ recentShifts: 6, recentMinutes: 60, upcoming: 0 }, limits), '6 shifts in the last 30 days');
  assert.equal(busyReason({ recentShifts: 0, recentMinutes: 0, upcoming: 7 }, limits), '7 shifts in the next 30 days');
  assert.equal(busyReason({ recentShifts: 5, recentMinutes: 11 * 60, upcoming: 5 }, limits), null);
});
