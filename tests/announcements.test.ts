/**
 * The Announcements app's pure parts (src/announcements/kinds.ts): its audience kinds, templates and links are the ones
 * the database allows, every link is a screen in the app, and the history's labels. Who sends, who gets what and the
 * splash pages are in tests/db.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DESTINATIONS, KINDS, TEMPLATES, audienceLabel, audienceProblem, blankAudience } from '../src/announcements/kinds';
import { notificationHref } from '../src/comms/inbox';
import { usageApp } from '../src/usage/apps';

const ROOT = join(__dirname, '..');
const dir = join(ROOT, 'supabase', 'migrations');
const migration = readdirSync(dir).filter((f) => f.endsWith('_announcements.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const listIn = (re: RegExp) => { const m = re.exec(migration); assert.ok(m, String(re)); return m[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort(); };

test('the audiences and splash templates are the ones the database allows', () => {
  assert.deepEqual(KINDS.map((k) => k.key).sort(), listIn(/k not in \(([^)]*)\)/));
  assert.deepEqual(Object.keys(TEMPLATES).sort(), listIn(/splash_template in \(([^)]*)\)/));
});

test('every link is a screen in the app (a path the database accepts, never a website)', () => {
  const allowed = /^\/[A-Za-z][A-Za-z0-9/_?=&.-]*$/;
  for (const d of DESTINATIONS) {
    assert.match(d.path, allowed, d.path);
    const first = d.path.slice(1).split('/')[0];
    const screen = ['app', 'app/(tabs)'].some((base) => existsSync(join(ROOT, base, `${first}.tsx`)) || existsSync(join(ROOT, base, first, 'index.tsx')));
    assert.ok(screen, `${d.path} isn't a screen`);
    assert.ok(usageApp([first]), `${d.path} isn't in an app`);
  }
  assert.ok(!allowed.test('https://example.com') && !allowed.test('//example.com'));
});

test('what has to be picked, and the label the history shows', () => {
  assert.equal(audienceProblem(blankAudience('everyone')), null);
  assert.equal(audienceProblem(blankAudience('grades')), 'Pick at least one grade.');
  assert.equal(audienceProblem({ kind: 'grades', grades: [8], parents: false, students: false }), 'Send it to their parents, the students, or both.');
  assert.equal(audienceProblem(blankAudience('people')), 'Pick at least one person.');
  for (const m of ['Pick at least one grade.', 'Pick at least one person.', 'Send it to their parents, the students, or both.']) {
    assert.ok(migration.includes(m), `the database says "${m}" too`);
  }
  assert.equal(audienceLabel({ kind: 'grades', grades: [9, 8], parents: true, students: false }), 'Parents · 8th, 9th');
  assert.equal(audienceLabel({ kind: 'roles', roles: ['parent', 'teacher'] }), 'Parents, Teachers');
  assert.equal(audienceLabel({ kind: 'academies', academies: ['formation'], parents: true, students: true }, { formation: 'Formation Academy' }),
    'Parents and students · Formation Academy');
  assert.equal(audienceLabel({ kind: 'people', people: ['a', 'b', 'c', 'd', 'e'] }, { a: 'Ann', b: 'Bo', c: 'Cy', d: 'Di', e: 'Ed' }), 'Ann, Bo, Cy and 2 more');
});

test("an announcement's notification opens its screen, or the announcement itself", () => {
  assert.equal(notificationHref({ announcementId: 'a1', link: '/calendar' }), '/calendar');
  assert.equal(notificationHref({ announcementId: 'a1' }), '/announcement/a1');
  assert.equal(notificationHref({ announcementId: 'a1', link: 'https://example.com' }), '/announcement/a1');
  assert.equal(notificationHref({ announcementId: 'a1', link: '//example.com' }), '/announcement/a1');
});
