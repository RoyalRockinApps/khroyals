/** src/onsite/labels.ts: dismissal ways match the database, who is on site, how a student went home, the dismissal time, and extended care's days. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OnSiteToday } from '../src/api/onsite';
import { DISMISSAL_HOWS, ON_SITE, STUDENT_GROUPS, afterDismissal, daysLine, homeLine, onSiteParts, onSiteTitle, stayingLine } from '../src/onsite/labels';

const migration = () => {
  const dir = join(__dirname, '../supabase/migrations');
  return readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith('_on_site_attendance.sql'))!), 'utf8');
};

test('the ways a teacher marks a student gone home are the same in the app and the database', () => {
  const check = /how\s+text not null check \(how in \(([^)]*)\)\)/.exec(migration());
  assert.ok(check, 'dismissals.how has a check');
  assert.deepEqual([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), DISMISSAL_HOWS.map((h) => h.key));
});

test("the student groups are the database's", () => {
  const sql = migration();
  for (const g of STUDENT_GROUPS) assert.match(sql, new RegExp(`'${g.key}'`), g.key);
});

test('who is on site: staff, faculty, visitors and students, in that order, each with its own color', () => {
  const t: OnSiteToday = {
    day: '2026-11-05', dismissal: '15:00', afterDismissal: false,
    faculty: { here: 38, total: 41 }, staff: { here: 17, total: 19 }, visitors: { here: 4, today: 9 },
    students: { total: 512, here: 478, class: 478, activities: 0, extendedCare: 0, notHome: 0, home: 6, absent: 21, unmarked: 7 },
  };
  assert.deepEqual(onSiteParts(t).map((p) => [p.label, p.here, p.of]),
    [['Staff', 17, 19], ['Faculty', 38, 41], ['Visitors', 4, null], ['Students', 478, 512]]);
  assert.equal(new Set(ON_SITE.map((g) => g.color)).size, ON_SITE.length);
});

test('how a student went home, in a line', () => {
  const at = '2026-11-05T21:12:00Z';
  assert.match(homeLine({ how: 'carline', at, person: 'Rosa Reyes', by: 'Ms. Allen', title: null }), /^Car line with Rosa Reyes · \d+:12 [AP]M$/);
  assert.match(homeLine({ how: 'walked', at, person: null, by: 'Jennifer Taylor', title: null }), /^Walked · .* · marked by Jennifer Taylor$/);
  assert.match(homeLine({ how: 'list', at, person: 'Rosa Reyes', by: null, title: 'Zoo field trip' }), /^Zoo field trip with Rosa Reyes · /);
  assert.match(homeLine({ how: 'extended_care', at, person: 'Sam Lee', by: 'Grace Okafor', title: 'Extended care' }), /^Extended care with Sam Lee · [^·]*$/);
  assert.equal(stayingLine({ kind: 'activity', title: 'Basketball: at Westminster', away: true }), 'Basketball: at Westminster (away)');
});

test("the dismissal time goes by the school's clock", () => {
  const at = (iso: string) => new Date(iso);
  assert.equal(afterDismissal('15:00', at('2026-11-05T20:59:00Z')), false, '2:59 PM Central');
  assert.equal(afterDismissal('15:00', at('2026-11-05T21:00:00Z')), true, '3:00 PM Central');
  assert.equal(afterDismissal(undefined), false);
});

test("extended care's days and the card's title", () => {
  assert.equal(daysLine([1, 2, 3, 4, 5]), 'Every school day');
  assert.equal(daysLine([1, 3, 5]), 'Mon, Wed, Fri');
  assert.equal(onSiteTitle('2026-11-05'), 'On-Site Attendance - Thursday, November 5');
});
