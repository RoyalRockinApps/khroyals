/**
 * scripts/presentation_data.mjs: the sample data loads into the real schema (every
 * migration, in PGlite), shows up for the test parent, their children, the class they
 * teach and the student login, gives the volunteer analytics two school years of high,
 * normal and low volunteers and the Student app records from the school's system, loads
 * again over itself, and comes out completely.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildSql, schoolDay } from '../scripts/presentation_data.mjs';
import { average } from '../src/student/grades';

const ROOT = join(__dirname, '..');
const db = new PGlite();
const ME = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const OLDER = '33333333-3333-4333-8333-333333333333';
const YOUNGER = '44444444-4444-4444-8444-444444444444';
const VB_SEASON = '55555555-5555-4555-8555-555555555555';
const CHEER_SEASON = '77777777-7777-4777-8777-777777777777';
const BASKETBALL = '88888888-8888-4888-8888-888888888888';
const DAY = '2026-10-27';

async function as(who: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false),
    set_config('request.jwt.claims', json_build_object('sub', '${who}', 'aal', 'aal1')::text, false); set role authenticated;`);
}
const one = async (q: string) => (await db.query<any>(q)).rows[0];
const count = async (q: string) => Number((await one(`select count(*) as n from (${q}) x`)).n);
/** The school's today, pinned to a day (null: the real one again), so the last 30 days don't move. */
const pinToday = (d: string | null) => db.exec(`reset role; create or replace function app.school_today() returns date language sql stable as $$
  select ${d ? `'${d}'::date` : `(now() at time zone 'America/Chicago')::date`} $$`);
const load = (remove = false, only: string | null = null) => db.exec(buildSql({
  day: DAY, me: ME, children: [{ id: OLDER, grade: 6 }, { id: YOUNGER, grade: 2 }], student: STUDENT, volleyball: VB_SEASON,
  cheer: CHEER_SEASON, basketball: BASKETBALL, remove, only,
}));

before(async () => {
  await db.exec(readFileSync(join(ROOT, 'supabase/tests/supabase_stubs.sql'), 'utf8'));
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'));
  // The test parent (a director who also has two children) and the student login, as on live.
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'me@example.test', '{"first_name":"Ben","last_name":"Nelson"}'),
    ($2, 'me+student@example.test', '{"first_name":"Sam","last_name":"Student"}')`, [ME, STUDENT]);
  await db.exec(`update profiles set school_role = 'admin' where id = '${ME}';
    insert into profiles (id, first_name, last_name, school_role, grade, managed) values
      ('${OLDER}', 'Alaythea', 'Nelson', 'student', 6, true), ('${YOUNGER}', 'Lexi Kate', 'Nelson', 'student', 2, true);
    insert into guardians (guardian_id, student_id, relation) values ('${ME}', '${OLDER}', 'father'), ('${ME}', '${YOUNGER}', 'father');
    insert into sports (id, name, icon, description, category) values ('66666666-6666-4666-8666-666666666666', 'Volleyball', '🏐', '', 'sports');
    insert into sport_seasons (id, sport_id, name, starts_on, ends_on) values ('${VB_SEASON}', '66666666-6666-4666-8666-666666666666', 'Fall 2026', '2026-08-03', '2026-10-31');
    -- The school's real activities, which the sample data joins but never removes.
    insert into sports (id, name, icon, description, category) values ('${BASKETBALL}', 'Basketball', '🏀', '', 'sports'),
      ('99999999-9999-4999-8999-999999999999', 'Royals Cheer', '📣', '', 'sports');
    insert into sport_seasons (id, sport_id, name, starts_on, ends_on, min_grade, max_grade)
      values ('${CHEER_SEASON}', '99999999-9999-4999-8999-999999999999', '2026–27', '2026-12-11', '2026-12-29', 0, 5);`);
});

test('school days skip the weekend', () => {
  assert.equal(schoolDay('2026-10-30', 1), '2026-11-02');
  assert.equal(schoolDay('2026-10-26', -1), '2026-10-23');
  assert.equal(schoolDay(DAY, 0), DAY);
});

test('loads, shows up for the parent, their class and the student, loads again, and comes out', async () => {
  await load();
  await load(); // again, over itself
  await db.exec('reset role');
  const people = await count(`select 1 from profiles where managed and id not in ('${OLDER}', '${YOUNGER}')`);
  assert.equal(people, 25, '5 staff, 10 parents and 10 students');
  assert.equal(await count(`select 1 from forms`), 4);
  assert.equal(await count(`select 1 from market_listings`), 11);
  assert.equal(await count(`select 1 from sports`), 6, 'Volleyball, Basketball, Royals Cheer and three made-up ones');
  assert.equal(await count(`select 1 from sport_registrations where season_id = '${CHEER_SEASON}'`), 3, 'the younger child and two classmates in Cheer');
  assert.equal(await count(`select 1 from sport_follows where sport_id = '${BASKETBALL}' and user_id = '${ME}'`), 1);
  // Volunteering: Harvest Fest (a Saturday) with five ways to help in order, and three on their own.
  const fest = await one(`select id, title, starts_on::text as on from volunteer_events`);
  assert.equal(fest.title, 'Harvest Fest');
  assert.equal(new Date(`${fest.on}T12:00:00Z`).getUTCDay(), 6, 'a Saturday');
  assert.deepEqual((await db.query<any>(`select title from volunteer_opportunities where event_id = '${fest.id}' order by position`)).rows.map((r) => r.title),
    ['Set up the day of', 'Game booth helpers', 'Bottled water', 'Bake sale treats', 'Clean-up crew']);
  assert.equal(await count(`select 1 from volunteer_opportunities where event_id is null and starts_on >= '${DAY}'`), 3, 'three coming up on their own');
  assert.equal(await count(`select 1 from volunteer_signups s join volunteer_opportunities o on o.id = s.opportunity_id
    where s.user_id = '${ME}' and o.event_id = '${fest.id}'`), 1, 'the parent helps set up');
  // Photos: Harvest Fest's album, and the school's own grade albums, each on its grade's families' accounts.
  assert.equal((await one(`select title from gallery_albums where volunteer_event_id = '${fest.id}'`)).title, 'Harvest Fest');
  const grades = async (who: string) => (await db.query<any>(`select a.grade from gallery_album_members m join gallery_albums a on a.id = m.album_id
    where m.user_id = '${who}' and m.removed_at is null and a.school_year = app.school_year_end() order by a.grade`)).rows.map((r) => r.grade);
  assert.deepEqual(await grades(ME), [2, 6], "the parent: their children's grades");
  assert.deepEqual(await grades(STUDENT), [6], 'the student login: their own grade');
  // Refreshing only the volunteering leaves the rest alone, and keeps sign-ups made from real accounts.
  const library = (await one(`select id from volunteer_opportunities where title = 'Library book shelving'`)).id;
  await db.exec(`insert into volunteer_signups (opportunity_id, user_id) values ('${library}', '${STUDENT}')`);
  await load(false, 'volunteer');
  await load(false, 'student');
  assert.equal(await count(`select 1 from sis_students where source = 'sample'`), 3, 'the two children and the student login');
  assert.equal(await count(`select 1 from volunteer_signups where opportunity_id = '${library}' and user_id = '${STUDENT}'`), 1);
  assert.equal(await count(`select 1 from volunteer_opportunities`), 28, 'and 20 past ones, 12 last school year and 8 this one');
  assert.equal(await count(`select 1 from gallery_albums where volunteer_event_id is not null`), 1, "Harvest Fest's album, still linked");
  assert.equal(await count(`select 1 from forms`), 4);
  assert.equal((await one(`select school_role, grade from profiles where id = '${STUDENT}'`)).school_role, 'student');

  // Volunteer history: as its leader on DAY, the steady helpers have the most hours each year (Bennett slipped,
  // Patel rose), the busiest in the last 30 days are flagged (leading counts), and the ones who often don't come
  // have no-shows or shifts nobody marked. The test parent has hours of their own both years.
  await pinToday(DAY);
  await as((await one(`select id from profiles where first_name = 'Maria' and last_name = 'Garcia'`)).id);
  const stats = async (from: string, to: string | null) => (await db.query<any>(`select * from volunteer_stats('${from}', ${to ? `'${to}'` : 'null'})`)).rows;
  const top = (rs: any[]) => rs.filter((r) => r.shifts > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 3).map((r) => r.name).sort();
  const missed = (rs: any[], names: string[]) => names.filter((n) => !rs.some((r) => r.name === n && r.no_shows + r.unmarked > 0));
  const lastYear = await stats('2025-07-01', '2026-06-30');
  const thisYear = await stats('2026-07-01', null);
  assert.deepEqual(top(lastYear), ['Carmen Rivera', 'Laura Bennett', 'Mike Wright']);
  assert.deepEqual(top(thisYear), ['Carmen Rivera', 'Mike Wright', 'Priya Patel']);
  assert.deepEqual(thisYear.filter((r) => r.busy).map((r) => r.name).sort(), ['Carmen Rivera', 'Maria Garcia', 'Mike Wright', 'Priya Patel']);
  assert.deepEqual(missed(lastYear, ['Beth Adams', 'Tara Moore', 'Erin Thompson', 'Marcus Davis']), []);
  assert.deepEqual(missed(thisYear, ['Laura Bennett', 'Beth Adams', 'Marcus Davis']), []);
  await as(ME);
  const mineDone = (await db.query<any>(`select day::text from volunteer_history('${ME}') where status = 'done'`)).rows.map((r) => r.day);
  assert.ok(mineDone.some((d) => d < '2026-07-01') && mineDone.some((d) => d >= '2026-07-01'), 'both school years');
  await pinToday(null);

  // The parent: forms for both children (none signed yet), and the children's class assignments.
  await as(ME);
  const mine = (await one(`select my_forms() as f`)).f;
  assert.deepEqual(mine.map((f: any) => f.title).sort(),
    ['Bible class retreat permission', 'Handbook acknowledgment 2026–2027', 'Pumpkin patch field trip', 'Zoo field trip permission']);
  assert.ok(mine.every((f: any) => f.children.every((c: any) => c.response === null)), 'left for the parent to sign');
  assert.ok((await count(`select * from child_assignments('${DAY}', '${schoolDay(DAY, 9)}')`)) >= 8);
  // …the class they teach: signatures and payments from the made-up families.
  const retreat = mine.find((f: any) => f.title.startsWith('Bible'));
  const status = (await one(`select form_status('${retreat.id}') as s`)).s;
  assert.deepEqual([status.students.filter((s: any) => s.response).length, status.students.filter((s: any) => s.payment).length], [4, 3]);
  assert.equal((await one(`select sent_forms() as f`)).f.length, 1, 'their own form (all of them only with Send forms)');
  assert.ok((await count(`select * from teacher_conversations()`)) >= 1, 'a question from the student');

  // The Student app: both children, the older first and showing; their classes' averages are the ones the app works
  // out from the grades; and the student login sees only their own.
  const dash = (await one(`select student_record() as r`)).r;
  assert.deepEqual(dash.students.map((x: any) => x.id), [OLDER, YOUNGER]);
  assert.equal(dash.studentId, OLDER);
  assert.deepEqual(dash.record.courses.map((c: any) => c.name), ['Bible 6', 'English 6', 'Math 6', 'Science 6', 'History 6', 'Spanish I']);
  assert.ok(dash.record.attendance.length > 0 && dash.record.schoolDays > 0);
  assert.equal(dash.record.courses.reduce((n: number, c: any) => n + c.missing, 0), 1, 'one missing assignment');
  const term = dash.record.terms[0];
  for (const c of dash.record.courses) {
    const detail = (await one(`select student_course('${c.id}') as c`)).c;
    assert.equal(Math.round((average(detail.assignments, detail.categories, term.startsOn, term.endsOn) as number) * 100) / 100, Number(c.average), c.name);
  }
  assert.equal((await one(`select student_record('${YOUNGER}') as r`)).r.record.courses.length, 5);

  // The student: two teachers, assignments (one of their own), a reply waiting; and their own record.
  await as(STUDENT);
  assert.deepEqual((await one(`select student_record() as r`)).r.students.map((x: any) => x.id), [STUDENT]);
  assert.equal(await count(`select * from my_teachers()`), 2);
  assert.ok((await count(`select 1 from assignments`)) >= 8);
  assert.equal(await count(`select 1 from assignments where roster_id is null`), 1);

  // Out it comes; the parent, their children, the student login and Volleyball stay.
  await db.exec('reset role');
  await load(true);
  assert.equal(await count(`select 1 from profiles where managed and id not in ('${OLDER}', '${YOUNGER}')`), 0);
  for (const t of ['forms', 'market_listings', 'volunteer_opportunities', 'volunteer_events', 'assignments', 'rosters', 'teacher_threads', 'sport_events', 'sport_registrations',
    'sis_students', 'sis_courses', 'sis_assignments', 'sis_attendance', 'sis_terms']) {
    assert.equal(await count(`select 1 from ${t}`), 0, t);
  }
  assert.equal(await count(`select 1 from sports`), 3, 'the real activities stay');
  assert.equal(await count(`select 1 from gallery_albums where grade is null`), 0, "Harvest Fest's album is gone");
  assert.equal(await count(`select 1 from gallery_albums where grade is not null and school_year = app.school_year_end()`), 16, 'the grade albums stay');
  assert.equal(await count(`select 1 from sport_follows`), 0);
  assert.equal(await count(`select 1 from profiles where id in ('${ME}', '${STUDENT}', '${OLDER}', '${YOUNGER}')`), 4);
});
