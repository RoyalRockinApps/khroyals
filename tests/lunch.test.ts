/** src/lunch/calendar.ts: the Lunch Visits calendar's weeks, hours and side-by-side blocks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisLabel, dayLanes, gridLines, isoWeekday, lunchWeeks, mondayOf, timeRange, weekName, weekSpan } from '../src/lunch/calendar';

const slot = (day: string, windowId: string, startTime: string, endTime: string) => ({ day, windowId, startTime, endTime });

test('weeks run Monday to Friday from this week through the last day asked about, empty weeks included', () => {
  assert.equal(isoWeekday('2026-11-16'), 1);
  assert.equal(isoWeekday('2026-11-22'), 7);
  assert.equal(mondayOf('2026-11-19'), '2026-11-16');
  assert.equal(mondayOf('2026-11-16'), '2026-11-16');

  // Wednesday Nov 18 for three weeks: through Dec 8, so four weeks; Thanksgiving week has nothing open.
  const slots = [slot('2026-11-18', 'a', '11:30:00', '12:00:00'), slot('2026-11-20', 'a', '11:30:00', '12:00:00'),
    slot('2026-11-20', 'b', '10:45:00', '11:15:00'), slot('2026-12-05', 'a', '11:30:00', '12:00:00')];
  const weeks = lunchWeeks(slots, '2026-11-18', 21);
  assert.deepEqual(weeks.map((w) => w.monday), ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']);
  assert.deepEqual(weeks[0].days, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  assert.deepEqual(weeks[0].slots.get('2026-11-20')!.map((x) => x.windowId), ['b', 'a'], 'earliest first');
  assert.equal(weeks[1].slots.size, 0);
  assert.equal(weeks[2].days.length, 6, 'a Saturday lunch adds Saturday');
  assert.equal(weeks[2].days[5], '2026-12-05');
});

test('the grid covers the earliest start to the latest end, to the quarter hour, with half-hour lines', () => {
  assert.equal(timeRange([]), null);
  const range = timeRange([slot('d', 'a', '11:35', '12:05'), slot('d', 'b', '10:50', '11:20')])!;
  assert.deepEqual(range, { from: 645, to: 735 });
  assert.deepEqual(gridLines(range), [660, 690, 720]);
  assert.deepEqual(timeRange([slot('d', 'a', '11:00', '11:10')]), { from: 660, to: 690 }, 'at least half an hour');
  assert.deepEqual([660, 690, 720, 750, 780].map(axisLabel), ['11 AM', '11:30', '12 PM', '12:30', '1 PM']);
});

test('blocks that overlap share the column; the rest take all of it', () => {
  const lanes = dayLanes([slot('d', 'c', '12:00', '12:30'), slot('d', 'b', '11:15', '11:45'), slot('d', 'a', '11:00', '11:30')]);
  assert.deepEqual(lanes.map((l) => [l.slot.windowId, l.lane, l.lanes]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
  // Back to back isn't overlapping.
  assert.deepEqual(dayLanes([slot('d', 'a', '11:00', '11:30'), slot('d', 'b', '11:30', '12:00')]).map((l) => l.lanes), [1, 1]);
});

test('weeks are named from today', () => {
  assert.equal(weekName('2026-11-16', '2026-11-18'), 'This week');
  assert.equal(weekName('2026-11-23', '2026-11-18'), 'Next week');
  assert.equal(weekName('2026-11-30', '2026-11-18'), 'Week of Nov 30');
  assert.equal(weekSpan(['2026-11-16', '2026-11-20']), 'Nov 16 – 20');
  assert.equal(weekSpan(['2026-11-30', '2026-12-04']), 'Nov 30 – Dec 4');
});
