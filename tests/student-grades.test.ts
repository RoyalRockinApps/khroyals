/** src/student/grades.ts: averages the way a gradebook works them out, the graph's line, letters, terms and attendance. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceSummary, average, letterFor, overallAverage, percent, progress, termFor, type Work } from '../src/student/grades';

const w = (dueOn: string, category: string, score: number | null, maxScore: number, status: Work['status'] = 'graded'): Work => ({ dueOn, category, score, maxScore, status });
const weights = [{ name: 'Tests', weight: 60 }, { name: 'Homework', weight: 40 }];

test('weighted by category; missing counts as zero, excused and not graded yet do not count', () => {
  const work = [
    w('2026-09-01', 'Tests', 45, 50),        // 90%
    w('2026-09-02', 'Homework', 10, 10),     // 100%
    w('2026-09-03', 'Homework', null, 10, 'missing'),
    w('2026-09-04', 'Homework', null, 10, 'excused'),
    w('2026-09-05', 'Tests', null, 50, 'pending'),
  ];
  // Tests 90% × 60 + Homework 10/20 = 50% × 40 → 74
  assert.equal(average(work, weights), 74);
  // Only the categories with work count: before any homework, the tests alone.
  assert.equal(average(work, weights, null, '2026-09-01'), 90);
  // No weights: plain points (45 + 10 + 0) / 70.
  assert.equal(Math.round(average(work, []) as number * 100) / 100, 78.57);
  // Category names match whatever their case.
  assert.equal(average([w('2026-09-01', 'tests ', 40, 50)], weights), 80);
  assert.equal(average([], weights), null);
  assert.equal(average(work, weights, '2026-10-01'), null, 'nothing graded in those dates');
});

test("the graph's line: the running average after each day something was graded", () => {
  const work = [w('2026-09-10', 'Tests', 40, 50), w('2026-09-03', 'Homework', 9, 10), w('2026-09-10', 'Homework', 7, 10), w('2026-09-12', 'Tests', null, 50, 'pending')];
  assert.deepEqual(progress(work, weights), [
    { day: '2026-09-03', average: 90 },
    { day: '2026-09-10', average: 80 * 0.6 + 80 * 0.4 },
  ]);
  assert.deepEqual(progress(work, weights, '2026-09-05').map((p) => p.day), ['2026-09-10'], 'from a day on (this semester)');
});

test("letters on the school's scale, the overall average, and percents", () => {
  const scale = [{ letter: 'B', min: 85 }, { letter: 'A', min: 93 }, { letter: 'F', min: 0 }, { letter: 'C', min: 77 }];
  assert.deepEqual([letterFor(93, scale), letterFor(92.999, scale), letterFor(76.9, scale), letterFor(null, scale)], ['A', 'A', 'F', null]);
  assert.equal(letterFor(92.9, scale), 'B');
  assert.equal(letterFor(50, []), null);
  assert.equal(overallAverage([90, null, 80]), 85);
  assert.equal(overallAverage([null]), null);
  assert.deepEqual([percent(91.25), percent(100), percent(null)], ['91.3%', '100.0%', '—']);
});

test('the grading term a day is in', () => {
  const terms = [{ name: 'Semester 2', startsOn: '2027-01-06', endsOn: '2027-05-22' }, { name: 'Semester 1', startsOn: '2026-08-05', endsOn: '2026-12-18' }];
  assert.equal(termFor(terms, '2026-11-02')?.name, 'Semester 1');
  assert.equal(termFor(terms, '2026-12-28')?.name, 'Semester 1', 'Christmas break: the one that just ended');
  assert.equal(termFor(terms, '2027-02-01')?.name, 'Semester 2');
  assert.equal(termFor(terms, '2026-07-20')?.name, 'Semester 1', 'before school starts');
  assert.equal(termFor([], '2026-11-02'), null);
});

test('attendance: absences (a half day is half), excused or not, late, left early and the share present', () => {
  const marks = [
    { day: '2026-09-14', kind: 'absent' as const, excused: true },
    { day: '2026-09-15', kind: 'half_day' as const, excused: false },
    { day: '2026-10-02', kind: 'tardy' as const, excused: false },
    { day: '2026-10-09', kind: 'tardy' as const, excused: true },
    { day: '2026-10-20', kind: 'left_early' as const, excused: true },
  ];
  assert.deepEqual(attendanceSummary(marks, 60), { absences: 1.5, excused: 1, unexcused: 0.5, tardies: 2, leftEarly: 1, rate: 97.5 });
  assert.equal(attendanceSummary([], null).rate, null);
});
