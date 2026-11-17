/** src/schedule/week.ts: a day's classes, the weekday a schedule opens on, and how soon the next one starts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classesOn, daysLabel, openingWeekday, startsIn } from '../src/schedule/week';

const m = (name: string, weekdays: number[], startTime: string) => ({ name, weekdays, startTime, endTime: '23:00' });

test("a day's classes, in order", () => {
  const week = [m('PE', [1, 2, 3, 4, 5], '14:00'), m('Math', [1, 3, 5], '09:45'), m('Science', [2, 4], '09:45'), m('Bible', [1, 2, 3, 4, 5], '08:00')];
  assert.deepEqual(classesOn(week, 1).map((x) => x.name), ['Bible', 'Math', 'PE']);
  assert.deepEqual(classesOn(week, 4).map((x) => x.name), ['Bible', 'Science', 'PE']);
});

test('a schedule opens on today, or Monday at the weekend', () => {
  assert.equal(openingWeekday('2026-11-18'), 3, 'Wednesday');
  assert.equal(openingWeekday('2026-11-21'), 1, 'Saturday');
  assert.equal(openingWeekday('2026-11-22'), 1, 'Sunday');
});

test('how soon a class starts, and the days it meets', () => {
  assert.equal(startsIn('09:45', '09:20'), 'in 25 min');
  assert.equal(startsIn('13:00', '11:50'), 'in 1 hr 10 min');
  assert.equal(startsIn('13:00', '12:00'), 'in 1 hr');
  assert.equal(startsIn('09:45', '09:45'), null);
  assert.equal(daysLabel([5, 1, 3]), 'Mon, Wed & Fri');
  assert.equal(daysLabel([2]), 'Tue');
  assert.equal(daysLabel([1, 2, 3, 4, 5]), 'Every day');
});
