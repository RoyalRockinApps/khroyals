/** src/appTiles.ts: the Main Page's standard and staff views. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT_ORDER, inStudentOrder, visibleTiles, type TileRules } from '../src/appTiles';

const TILES: (TileRules & { label: string })[] = [
  { label: 'Alerts', staffOnly: true },
  { label: 'Car Line', staffVersion: true, student: false },
  { label: 'Student', family: false, inStaffView: false },
  { label: 'Calendar' },
  { label: 'Ask the School', family: false, student: false, staffVersion: true },
  { label: 'Ask the Teacher', family: false, studentApp: true },
  { label: 'Admin', adminOnly: true },
];
const labels = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(TILES, v).map((t) => t.label);
const elevated = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(TILES, v).filter((t) => t.elevated).map((t) => t.label);

test('parents, and staff on the Standard view, see the standard apps', () => {
  const standard = ['Car Line', 'Student', 'Calendar', 'Ask the School'];
  assert.deepEqual(labels({ staffView: false, family: false, admin: false }), standard);
  assert.deepEqual(labels({ staffView: false, family: false, admin: true }), standard, 'an admin on Standard sees no admin tile');
  assert.deepEqual(elevated({ staffView: false, family: false, admin: true }), []);
});

test('the Staff view adds Alerts (and Admin for admins), leaves out the parent apps, and puts the staff versions first', () => {
  assert.deepEqual(labels({ staffView: true, family: false, admin: false }), ['Alerts', 'Car Line', 'Ask the School', 'Calendar']);
  assert.deepEqual(labels({ staffView: true, family: false, admin: true }), ['Alerts', 'Car Line', 'Ask the School', 'Admin', 'Calendar']);
  assert.deepEqual(elevated({ staffView: true, family: false, admin: true }), ['Alerts', 'Car Line', 'Ask the School', 'Admin']);
});

test("the students' apps are theirs alone: teachers reach the teacher side from Classes", () => {
  for (const v of [{ staffView: true, family: false, admin: true }, { staffView: false, family: false, admin: false }, { staffView: false, family: true, admin: false }]) {
    assert.ok(!labels(v).includes('Ask the Teacher'));
  }
});

test('Family accounts keep their closed set', () => {
  assert.deepEqual(labels({ staffView: false, family: true, admin: false }), ['Car Line', 'Calendar']);
});

test('Substitutes see only their Sub Days and the public apps; nobody else sees Sub Days', () => {
  const tiles = [...TILES, { label: 'Sub Days', subOnly: true as const, sub: true as const }, { label: 'Handbook', sub: true as const }];
  const see = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(tiles, v).map((t) => t.label);
  assert.deepEqual(see({ staffView: false, family: false, admin: false, substitute: true }), ['Sub Days', 'Handbook']);
  assert.ok(!see({ staffView: true, family: false, admin: true }).includes('Sub Days'));
  assert.ok(!see({ staffView: false, family: true, admin: false }).includes('Sub Days'));
  assert.ok(!see({ staffView: false, family: false, admin: false, student: true }).includes('Sub Days'));
});

test("students see only their apps, including Ask the Teacher", () => {
  assert.deepEqual(labels({ staffView: false, family: false, admin: false, student: true }), ['Student', 'Calendar', 'Ask the Teacher']);
  assert.deepEqual(elevated({ staffView: false, family: false, admin: false, student: true }), []);
});

test('Announcements: in the staff view, only for people who send the school\'s notifications', () => {
  const tiles = [...TILES, { label: 'Announcements', announce: true as const }];
  const see = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(tiles, v).map((t) => t.label);
  assert.ok(see({ staffView: true, family: false, admin: true, announce: true }).includes('Announcements'));
  assert.ok(!see({ staffView: true, family: false, admin: true, announce: false }).includes('Announcements'));
  assert.ok(!see({ staffView: false, family: false, admin: true, announce: true }).includes('Announcements'), 'not on the Standard view');
  assert.ok(!see({ staffView: false, family: false, admin: false, student: true, announce: true }).includes('Announcements'));
});

test("students' tiles go in their own order, three across", () => {
  const listed = ['Student', 'Activities', 'Photos', 'News', 'Calendar', 'Handbook', 'Feedback', 'Tell Someone', 'Ask the Teacher', 'Assignments', 'Study',
    'College & Career', 'Something new']
    .map((label) => ({ label }));
  assert.deepEqual(inStudentOrder(listed).map((t) => t.label), [...STUDENT_ORDER, 'Something new']);
  assert.deepEqual(inStudentOrder([{ label: 'Feedback' }, { label: 'Calendar' }]).map((t) => t.label), ['Calendar', 'Feedback'], 'a missing tile leaves no gap');
});

test("every tile a student sees on the Main Page has its place in the students' order", async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('app/(tabs)/apps.tsx', 'utf8');
  const tiles = [...src.matchAll(/\{ label: '([^']+)'([^}]*)\}/g)].map((m) => ({ label: m[1], rest: m[2] }))
    .filter((t) => !/student: false|staffOnly|adminOnly|subOnly|announce: true/.test(t.rest));
  assert.deepEqual(tiles.map((t) => t.label).filter((l) => !STUDENT_ORDER.includes(l)), []);
});

test('College & Career: students from 9th grade up, and nobody else', () => {
  const tiles = [...TILES, { label: 'College & Career', family: false as const, studentApp: true as const, minGrade: 9 }];
  const see = (v: Parameters<typeof visibleTiles>[1]) => visibleTiles(tiles, v).map((t) => t.label).includes('College & Career');
  assert.equal(see({ staffView: false, family: false, admin: false, student: true, grade: 9 }), true);
  assert.equal(see({ staffView: false, family: false, admin: false, student: true, grade: 12 }), true);
  assert.equal(see({ staffView: false, family: false, admin: false, student: true, grade: 8 }), false);
  assert.equal(see({ staffView: false, family: false, admin: false, student: true, grade: null }), false);
  assert.equal(see({ staffView: false, family: false, admin: false }), false, 'parents reach it from the Student app');
  assert.equal(see({ staffView: true, family: false, admin: true }), false, 'counselors from the Admin portal');
});
