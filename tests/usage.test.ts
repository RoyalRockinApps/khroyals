/** src/usage/apps.ts: every screen is counted under an app (named as people know it), and routes find their app. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NOT_COUNTED, USAGE_APPS, usageApp, usageLabel } from '../src/usage/apps';

const APP = join(__dirname, '../app');

test('every top-level route belongs to an app (or is listed as not counted)', () => {
  const routes = [...readdirSync(APP), ...readdirSync(join(APP, '(tabs)'))]
    .filter((f) => !/^[_+]/.test(f) && !/^\(.*\)$/.test(f))
    .map((f) => f.replace(/\.tsx$/, ''));
  const missing = routes.filter((r) => usageApp([r]) === null && !NOT_COUNTED.includes(r));
  assert.deepEqual(missing, [], 'add these to USAGE_APPS in src/usage/apps.ts');
});

test("every Main Page tile is counted, and the server's key format holds", () => {
  const tiles = readFileSync(join(APP, '(tabs)/apps.tsx'), 'utf8');
  const hrefs = [...tiles.matchAll(/href: '\/([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 10);
  assert.deepEqual(hrefs.filter((h) => !usageApp([h])), []);
  for (const a of USAGE_APPS) assert.match(a.key, /^[a-z][a-z0-9_]{1,30}$/, a.key);
  assert.equal(new Set(USAGE_APPS.map((a) => a.key)).size, USAGE_APPS.length, 'keys are unique');
});

test('routes find their app', () => {
  assert.equal(usageApp(['(tabs)']), 'planner');
  assert.equal(usageApp(['(tabs)', 'index']), 'planner');
  assert.equal(usageApp(['(tabs)', 'connect']), 'connect');
  assert.equal(usageApp(['group', '[id]', 'members']), 'connect');
  assert.equal(usageApp(['volunteer', '[id]']), 'volunteer');
  assert.equal(usageApp(['checkout', '[id]']), 'classes');
  assert.equal(usageApp(['auth']), null);
  assert.equal(usageApp(['nowhere']), null);
  assert.equal(usageLabel('newsletter', 'Royal News'), 'Royal News');
  assert.equal(usageLabel('carline'), 'Car Line');
});
