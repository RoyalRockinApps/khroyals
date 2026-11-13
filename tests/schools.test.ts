/**
 * schools/: each school's app is complete and its own. Every school has the same set of files,
 * its own app IDs and link scheme, and its own Supabase project (no data is ever shared); shared
 * code never names a school, it reads src/school.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import appJson from '../app.json';
import makeConfig from '../app.config';

const ROOT = join(__dirname, '..');
const { SCHOOLS, schoolId } = require('../schools') as { SCHOOLS: string[]; schoolId: (env?: Record<string, string>) => string };
const FILES = [
  'app.json', 'school.ts', 'menu.ts', 'carline.ts', 'carlineMap.ts', 'uniform.ts', 'uniformImages.ts', 'handbook.ts', 'handbookOutline.ts', 'tiles.ts', 'fonts.ts',
  'content/site/site.json', 'content/site/home.json', 'content/site/news.json', 'content/site/calendar.json', 'content/site/pages.ts',
  'content/site/pages/index.json', 'assets/icon.png', 'assets/favicon.png', 'assets/adaptive-icon.png',
];
const configFor = (school: string) => {
  const saved = process.env.SCHOOL;
  process.env.SCHOOL = school;
  try { return makeConfig({ config: appJson.expo }); } finally { process.env.SCHOOL = saved; }
};

test('every school has its own complete folder', () => {
  assert.deepEqual(SCHOOLS, readdirSync(join(ROOT, 'schools')).filter((f) => statSync(join(ROOT, 'schools', f)).isDirectory()).sort());
  for (const s of SCHOOLS) for (const f of FILES) assert.ok(existsSync(join(ROOT, 'schools', s, f)), `schools/${s}/${f}`);
  assert.equal(schoolId({}), 'khroyals', 'Kingdom Heights when SCHOOL is unset');
  assert.throws(() => schoolId({ SCHOOL: 'nope' }), /Unknown SCHOOL/);
});

test('each school is its own app with its own data', () => {
  const apps = SCHOOLS.map(configFor);
  for (const key of [(c: any) => c.name, (c: any) => c.slug, (c: any) => c.scheme, (c: any) => c.ios.bundleIdentifier,
    (c: any) => c.android.package, (c: any) => c.experiments.baseUrl, (c: any) => c.extra.supabaseUrl, (c: any) => c.extra.supabaseKey]) {
    const values = apps.map(key);
    assert.equal(new Set(values).size, values.length, `shared between schools: ${values.join(', ')}`);
  }
  for (const c of apps) {
    assert.match(c.extra.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/, `${c.name}: its own Supabase project`);
    assert.match(c.extra.supabaseKey, /^sb_publishable_/, `${c.name}: only the publishable key belongs in the repo`);
    assert.ok(c.icon.startsWith(`./schools/${c.extra.school}/`), `${c.name}: its own icon`);
    const prompts = JSON.stringify(c.plugins);
    for (const other of apps.filter((o) => o !== c)) assert.ok(!prompts.includes(`${other.name} uses`), `${c.name}'s prompts name ${other.name}`);
  }
});

test('nothing shared holds a school\'s project: the app reads its school\'s app.json', () => {
  const shared = appJson.expo as Record<string, any>;
  for (const k of ['name', 'slug', 'scheme', 'icon', 'extra']) assert.equal(shared[k], undefined, `app.json has ${k}: it belongs in schools/<id>/app.json`);
  assert.equal(shared.ios.bundleIdentifier, undefined);
  assert.equal(shared.android.package, undefined);
  const reads: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = join(dir, f);
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && /from '(\.\.\/)+app\.json'/.test(readFileSync(join(ROOT, p), 'utf8'))) reads.push(p);
    }
  };
  walk('app');
  walk('src');
  assert.deepEqual(reads, [], "import '@school/app.json' instead");
});

test("shared code never names a school (it reads src/school.ts)", () => {
  const NAMES = /KH Royals|Royals Connect|Royal News|Kingdom Heights|khroyals\.com|KHPS|Wildcats|Westminster|wca-hsv/;
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = join(dir, f);
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) {
        readFileSync(join(ROOT, p), 'utf8').split('\n').forEach((line, i) => {
          // Comments may use a school as the example.
          if (!/^\s*(\*|\/\/|\/\*)/.test(line) && NAMES.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`);
        });
      }
    }
  };
  walk('app');
  walk('src');
  assert.deepEqual(bad, []);
});
