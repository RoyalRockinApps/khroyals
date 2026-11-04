/** src/info/needsYou.ts: the staff Planner's "Needs you today" rows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { needsYou } from '../src/info/needsYou';
import type { StaffToday } from '../src/api/types';

test('nothing waiting, no rows (so the Planner leaves the card out)', () => {
  assert.deepEqual(needsYou({}), []);
  assert.deepEqual(needsYou({ roll: 0, questionsAssigned: 0, lunchVisitors: 0 }), []);
});

test('to-dos come first, then heads-ups, in words', () => {
  const rows = needsYou({ lunchVisitors: 2, roll: 1, questionsAssigned: 3, subCovering: 1, absencesToday: 1, accountsWaiting: 1 });
  assert.deepEqual(rows.map((r) => r.title), [
    'Take roll for your class',
    '3 questions waiting for your answer',
    '1 account waiting for approval',
    '1 student of yours reported out today',
    'A sub has your class today',
    '2 lunch visitors today',
  ]);
  assert.deepEqual(rows.map((r) => r.tone), ['todo', 'todo', 'todo', 'info', 'info', 'info']);
  assert.equal(needsYou({ roll: 2 })[0].title, 'Take roll for 2 classes');
  assert.equal(needsYou({ subCovering: 2 })[0].title, 'A sub has 2 of your classes today');
});

test('every count the database can send has a row that opens a screen', () => {
  const all: Required<StaffToday> = {
    roll: 1, subCovering: 1, absencesToday: 1, absencesToSee: 1, questionsAssigned: 1, questionsToRoute: 1, feedbackNew: 1,
    accountsWaiting: 1, familyRequests: 1, lunchVisitors: 1, volunteerToMark: 1,
  };
  const rows = needsYou(all);
  assert.equal(rows.length, Object.keys(all).length);
  for (const r of rows) assert.match(r.href, /^\/[a-z]/, r.key);
  // The same keys as the database's staff_today (its latest definition).
  const dir = join(__dirname, '../supabase/migrations');
  const file = readdirSync(dir).sort().filter((f) => /function public\.staff_today\(/.test(readFileSync(join(dir, f), 'utf8'))).pop()!;
  const body = readFileSync(join(dir, file), 'utf8').split('jsonb_build_object(')[1];
  const keys = [...body.matchAll(/^\s+'(\w+)',/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, Object.keys(all).sort());
});
