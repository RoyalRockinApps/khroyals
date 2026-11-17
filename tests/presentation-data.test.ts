/**
 * scripts/presentation_data.mjs: the sample data loads into the real schema (every
 * migration, in PGlite), shows up for the test parent, their children, the class they
 * teach and the student login, gives the volunteer analytics two school years of high,
 * normal and low volunteers and the Student app records from the school's system, sets up the
 * senior test login (high school classes, College & Career) and the class tools' samples, loads
 * again over itself (keeping a tester's own place in a class), and comes out completely.
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
const SENIOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEACHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTSIDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LUNCH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
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
  cheer: CHEER_SEASON, basketball: BASKETBALL, teacher: TEACHER, senior: SENIOR, lunch: LUNCH, remove, only,
}));

before(async () => {
  await db.exec(readFileSync(join(ROOT, 'supabase/tests/supabase_stubs.sql'), 'utf8'));
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).sort()) await db.exec(readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'));
  // The test parent (a director who also has two children) and the student login, as on live.
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'me@example.test', '{"first_name":"Ben","last_name":"Nelson"}'),
    ($2, 'me+student@example.test', '{"first_name":"Sam","last_name":"Student"}'), ($3, 'me+senior@example.test', '{"first_name":"Test","last_name":"Senior"}'),
    ($4, 'me+teacher@example.test', '{"first_name":"Test","last_name":"Teacher"}')`, [ME, STUDENT, SENIOR, TEACHER]);
  // A teacher test login, a tester's own child (put in a sample class by hand, as on live) and a lunch time.
  await db.exec(`update profiles set school_role = 'teacher' where id = '${TEACHER}';
    insert into profiles (id, first_name, last_name, school_role, grade, managed) values ('${OUTSIDER}', 'Test', 'Child', 'student', 6, true);
    insert into lunch_windows (id, name, weekdays, start_time, end_time, grade_from, grade_to, capacity) values ('${LUNCH}', 'K–12th lunch', array[1,2,3,4,5], '11:30', '12:00', 0, 12, 6);`);
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
  // A tester puts their own account in a sample class; a refresh keeps it there.
  await db.exec(`reset role; insert into roster_members (roster_id, profile_id) values ('demo-homeroom-a', '${OUTSIDER}')`);
  await load(); // again, over itself
  await db.exec('reset role');
  assert.equal(await count(`select 1 from roster_members where roster_id = 'demo-homeroom-a' and profile_id = '${OUTSIDER}'`), 1, "the tester's place stays");
  const people = await count(`select 1 from profiles where managed and id not in ('${OLDER}', '${YOUNGER}', '${OUTSIDER}')`);
  assert.equal(people, 28, '5 staff, 10 parents, 10 students and 3 high schoolers');
  assert.equal((await one(`select lead_id from rosters where id = 'demo-bible-a'`)).lead_id, TEACHER, 'the teacher login teaches Bible');
  assert.equal(await count(`select 1 from roster_members where roster_id = 'demo-bible-a' and profile_id = '${ME}'`), 0);
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
  assert.equal(await count(`select 1 from sis_students where source = 'sample'`), 4, 'the two children, the student login and the senior');
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

  // The class tools: class times, help sessions with bookings, a week of roll, Folder bulletins and notes, notes to a
  // teacher, absence reports, lunch visits, the homeroom teacher's board, Study decks, daily verses, College & Career.
  await db.exec('reset role');
  const n = async (t: string) => count(`select 1 from ${t}`);
  assert.deepEqual([await n('section_meetings'), await n('help_sessions'), await n('help_session_bookings'), await n('folder_notes'), await n('parent_notes'),
    await n('absence_reports'), await n('lunch_visits'), await n('study_decks'), await n('study_notes'), await n('daily_verses'), await n('college_dates'),
    await n('transcript_requests')], [8, 4, 7, 4, 2, 2, 2, 4, 2, 12, 6, 4]);
  assert.ok((await n('class_attendance')) > 50, 'five days of roll');
  assert.equal(await count(`select 1 from board_items i join boards b on b.id = i.board_id join profiles p on p.id = b.teacher_id where p.last_name = 'Taylor'`), 3);
  await as(ME);
  const folder = (await one(`select my_folder_notes() as n`)).n.map((x: any) => x.title || x.kind).sort();
  assert.deepEqual(folder, ['Book Fair next week', 'Pumpkin patch reminders', 'note']);
  // The senior: high school classes and their times, Needs attention (already counted as told), and a plan underway.
  await as(SENIOR);
  assert.deepEqual((await db.query<any>(`select distinct class_name from class_schedule() order by 1`)).rows.map((r) => r.class_name), ['Chemistry', 'English 11', 'U.S. History']);
  const alerts = (await one(`select student_alerts() as a`)).a;
  assert.deepEqual([alerts.missing.length, alerts.low.map((l: any) => l.course)], [1, ['Chemistry']]);
  await db.exec('reset role');
  assert.equal(await count(`select * from app.student_alert_items() x where not exists (select 1 from sis_alerts_sent t where t.student_id = x.student_id
    and t.kind = x.kind and t.course_key = x.course_key and t.item_key = x.item_key)`), 0, 'nothing waiting to be sent');
  await as(SENIOR);
  const plan = (await one(`select college_plan() as p`)).p;
  assert.equal(plan.student.grade, 11);
  assert.ok(plan.steps.filter((x: any) => x.doneAt).length >= 7, 'every 9th and 10th grade step, and two of 11th');
  assert.deepEqual(plan.requests.map((r: any) => r.status).sort(), ['requested', 'sent']);
  assert.equal(await count(`select * from help_sessions_mine() x`), 1);

  // Out it comes; the parent, their children, the logins and Volleyball stay.
  await db.exec('reset role');
  await load(true);
  assert.equal(await count(`select 1 from profiles where managed and id not in ('${OLDER}', '${YOUNGER}', '${OUTSIDER}')`), 0);
  assert.equal(await count(`select 1 from college_steps_done`), 0);
  for (const t of ['forms', 'market_listings', 'volunteer_opportunities', 'volunteer_events', 'assignments', 'rosters', 'teacher_threads', 'sport_events', 'sport_registrations',
    'sis_students', 'sis_courses', 'sis_assignments', 'sis_attendance', 'sis_terms', 'section_meetings', 'help_sessions', 'class_attendance', 'folder_notes',
    'parent_notes', 'absence_reports', 'lunch_visits', 'study_decks', 'study_notes', 'daily_verses', 'college_dates', 'transcript_requests', 'sis_alerts_sent']) {
    assert.equal(await count(`select 1 from ${t}`), 0, t);
  }
  assert.equal(await count(`select 1 from sports`), 3, 'the real activities stay');
  assert.equal(await count(`select 1 from gallery_albums where grade is null`), 0, "Harvest Fest's album is gone");
  assert.equal(await count(`select 1 from gallery_albums where grade is not null and school_year = app.school_year_end()`), 16, 'the grade albums stay');
  assert.equal(await count(`select 1 from sport_follows`), 0);
  assert.equal(await count(`select 1 from profiles where id in ('${ME}', '${STUDENT}', '${OLDER}', '${YOUNGER}', '${SENIOR}', '${TEACHER}', '${OUTSIDER}')`), 7);
});
