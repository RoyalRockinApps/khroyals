#!/usr/bin/env node
/**
 * Sample data for showing the app to the school: made-up teachers, a coach, a director,
 * front office staff and ten families (parents and students without logins), with classes,
 * assignments, forms (signed, paid and still to do), marketplace listings, activities and
 * volunteering (Harvest Fest, an event with its ways to help inside and its photo album, a few
 * opportunities on their own, and two school years of past shifts with who came, for the volunteer
 * analytics: steady helpers, ordinary ones and ones who often don't show), and the Student app's records for the
 * test children and the student login (what the school's system will send: information, attendance, and grades for
 * each class this school year). The grade albums are the school's own (made each year), not sample data. It centers on one real test account: their children are in the
 * classes and get the forms, they teach one class themselves (the Staff view), and a second
 * login can become a 6th grader in two of the classes (the student view). The school's real
 * activities stay as they are; the younger child (and two made-up classmates) join Royals
 * Cheer and the parent follows Basketball, if those exist.
 *
 *   SUPABASE_ACCESS_TOKEN=… node scripts/presentation_data.mjs --parent <email> [--student <email>]
 *     [--teacher <email>] [--senior <email>] [--day 2026-10-27] [--only volunteer|student] [--remove] [--print]
 *
 * --day is the day it'll be shown (dates are around it; default: the next school day). The past
 * volunteer shifts go by the school's real today, so the analytics' last 30 days are right.
 * --only volunteer refreshes just the volunteering (the rest of the sample data must be there);
 * --only student just the Student app's records, through sis_import like the school's system.
 * --teacher makes a teacher test login the Bible class's teacher (otherwise the parent). --senior sets up an 11th-grade
 * test login: three high school classes with three made-up high schoolers, grade records (Chemistry under 70% and a
 * missing English assignment) and a College & Career plan with transcript requests. The class tools get samples too:
 * class times, help sessions, the last week's roll, bulletins and notes in the Folder, notes to a teacher, absence
 * reports, lunch visits (in the first active lunch time), the homeroom teacher's board, the student logins' Study decks,
 * two school weeks of daily verses (only on days without one), and the counselor's test dates and scholarships.
 * Nothing is sent: rows are written directly, so nobody gets a notification (missing work already in the sample records
 * counts as told), and forms and classes only reach the parent's children and the made-up families. Tell Someone has
 * no samples. The sample classes stay through a refresh, so anyone else put in one (a tester's account) stays in it. Every row has a fixed
 * id, so running it again replaces it, and --remove takes all of it out (the student login
 * stays, without its classes). --print shows the SQL instead of running it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// Helpers

const uid = (key) => {
  const h = createHash('md5').update(`khroyals-presentation:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** A SQL literal: { ts } is a timestamp, { json } and other objects are jsonb, arrays are int[] or text[]. */
const lit = (v) => (v === null || v === undefined ? 'null'
  : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : Array.isArray(v) ? `array[${v.map(lit).join(', ')}]::${typeof v[0] === 'number' ? 'int' : 'text'}[]`
  : typeof v === 'object' && 'ts' in v ? `${quote(v.ts)}::timestamptz`
  : typeof v === 'object' ? `${quote(JSON.stringify('json' in v ? v.json : v))}::jsonb`
  : quote(v));
const row = (values) => `(${values.map(lit).join(', ')})`;
const insert = (table, cols, rows) => (rows.length ? `insert into public.${table} (${cols.join(', ')}) values\n  ${rows.map(row).join(',\n  ')};` : '');
const inList = (ids) => (ids.length ? `(${ids.map(lit).join(', ')})` : '(null)');

const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekend = (iso) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
/**
 * The school day `n` school days from `day` (negative: before it).
 * @param {string} day @param {number} n @returns {string}
 */
export function schoolDay(day, n) {
  let d = day;
  for (let k = 0; k !== n;) { d = addDays(d, n < 0 ? -1 : 1); if (!weekend(d)) k += n < 0 ? -1 : 1; }
  return d;
}
const at = (date, time) => ({ ts: `${date} ${time} America/Chicago` });
/** The Saturday on or after a day. */
const saturdayFrom = (iso) => { let d = iso; while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = addDays(d, 1); return d; };
/** The day itself, or the Monday after it if it's a weekend. */
const weekday = (iso) => { let d = iso; while (weekend(d)) d = addDays(d, 1); return d; };
/** The Monday of a day's week. */
const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
/** A month and day (MM-DD) in the school year that starts in July of `year`. */
const inSchoolYear = (year, md) => `${Number(md.slice(0, 2)) >= 7 ? year : year + 1}-${md}`;
/** A steady number from 0 to 1 for a key, so the made-up shifts come out the same every time. */
const chance = (key) => parseInt(createHash('md5').update(`khroyals-presentation:${key}`).digest('hex').slice(0, 8), 16) / 2 ** 32;
const minutesOf = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pretty = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const ordinal = (g) => (g === 0 ? 'Kindergarten' : g < 0 ? ['K2', 'K3', 'K4'][g + 3] : `${g}${g === 1 ? 'st' : g === 2 ? 'nd' : g === 3 ? 'rd' : 'th'}`);

// ----------------------------------------------------------------------------
// The made-up people

const STAFF = [
  { key: 'taylor', first: 'Jennifer', last: 'Taylor', role: 'teacher' },
  { key: 'brooks', first: 'Rachel', last: 'Brooks', role: 'teacher' },
  { key: 'davis', first: 'Marcus', last: 'Davis', role: 'teacher' },
  { key: 'price', first: 'Hannah', last: 'Price', role: 'teacher' },
  { key: 'garcia', first: 'Maria', last: 'Garcia', role: 'staff' },
];
/** Five families in the older child's grade (a) and five in the younger's (b). */
const FAMILIES = [
  { key: 'rivera', parent: 'Carmen', relation: 'mother', child: 'Mason', last: 'Rivera', set: 'a' },
  { key: 'patel', parent: 'Priya', relation: 'mother', child: 'Sophia', last: 'Patel', set: 'a' },
  { key: 'johnson', parent: 'Dana', relation: 'mother', child: 'Caleb', last: 'Johnson', set: 'a' },
  { key: 'kim', parent: 'Jin', relation: 'father', child: 'Grace', last: 'Kim', set: 'a' },
  { key: 'bennett', parent: 'Laura', relation: 'mother', child: 'Noah', last: 'Bennett', set: 'a' },
  { key: 'chen', parent: 'Wei', relation: 'father', child: 'Lily', last: 'Chen', set: 'b' },
  { key: 'moore', parent: 'Tara', relation: 'mother', child: 'Jackson', last: 'Moore', set: 'b' },
  { key: 'thompson', parent: 'Erin', relation: 'mother', child: 'Ava', last: 'Thompson', set: 'b' },
  { key: 'wright', parent: 'Mike', relation: 'father', child: 'Owen', last: 'Wright', set: 'b' },
  { key: 'adams', parent: 'Beth', relation: 'mother', child: 'Chloe', last: 'Adams', set: 'b' },
];
/** High schoolers without families, for the high school classes and College & Career (with the senior test login). */
const HIGH = [
  { key: 'turner', first: 'Isaac', last: 'Turner', grade: 12 },
  { key: 'collins', first: 'Maya', last: 'Collins', grade: 11 },
  { key: 'reed', first: 'Lucas', last: 'Reed', grade: 10 },
];
const staff = (k) => uid(`staff:${k}`);
const parent = (k) => uid(`parent:${k}`);
const kid = (k) => uid(`kid:${k}`);

/**
 * Past volunteering, for the analytics: who helps how much each school year ('me' is the test parent). High: there
 * every time. Normal: nearly always. Low: often a no-show, or nobody marked them. Bennett slipped from high to low
 * this year and Patel rose to high; Rivera, Wright and Patel have done a lot in the last 30 days.
 */
const HELPERS = {
  last: { high: ['rivera', 'wright', 'bennett'], normal: ['patel', 'johnson', 'kim', 'chen', 'taylor', 'me'], low: ['adams', 'moore', 'thompson', 'davis'] },
  this: { high: ['rivera', 'wright', 'patel'], normal: ['johnson', 'kim', 'chen', 'moore', 'thompson', 'taylor', 'me'], low: ['bennett', 'adams', 'davis'] },
};
/** The ways to help that come round every year (days: how many days in a row it runs). */
const SHIFTS = {
  supplies: { title: 'Back-to-school supply sort', start: '09:00', end: '12:00', location: 'Front office', spots: 8,
    description: 'Sort the donated supplies into homeroom bins before the first day.' },
  picture: { title: 'Picture day helpers', start: '08:00', end: '11:30', location: 'Gym', spots: 6, description: 'Line classes up, fix collars and hand out combs.' },
  grandparents: { title: "Grandparents' Day greeters", start: '08:00', end: '10:00', location: 'Front entrance', spots: 6,
    description: 'Welcome grandparents and walk them to classrooms.' },
  festival: { title: 'Fall Festival booths', start: '10:00', end: '14:00', location: 'Front lawn', spots: 15, description: 'Run a game booth for the afternoon.' },
  copying: { title: 'Workroom copying help', start: '09:00', end: '11:00', location: 'Teacher workroom', spots: 2, description: 'Copy and staple next week’s packets.' },
  homecoming: { title: 'Homecoming concessions', start: '17:30', end: '21:00', location: 'Concession stand', spots: 8,
    description: 'Popcorn, drinks and the cash box at the homecoming game.' },
  bookfair: { title: 'Book Fair cashiers', start: '11:00', end: '13:00', location: 'Library', spots: 4, days: 4, description: 'Ring up books at lunch, every day of the fair.' },
  thanksgiving: { title: 'Thanksgiving lunch servers', start: '10:30', end: '13:00', location: 'Cafeteria', spots: 10, description: 'Serve plates at the all-school Thanksgiving lunch.' },
  christmas: { title: 'Christmas Program ushers', start: '17:00', end: '20:00', location: 'Auditorium', spots: null, description: 'Hand out programs and help families find seats.' },
  library: { title: 'Library book shelving', start: '09:00', end: '11:00', location: 'Library', spots: 3, description: 'Shelve returns and tidy the reading corner.' },
  carline: { title: 'Car line helpers', start: '14:45', end: '15:30', location: 'Front circle', spots: 4, days: 5, description: 'Open car doors and walk students to their cars, all week.' },
  carnival: { title: 'Spring carnival', start: '10:00', end: '15:00', location: 'Front lawn', spots: 20, description: 'Games, the bounce house line and the snack table.' },
  appreciation: { title: 'Teacher appreciation lunch', start: '11:00', end: '13:30', location: "Teachers' lounge", spots: 6,
    description: 'Set up, serve and clean up lunch for the faculty.' },
  fieldday: { title: 'Field Day station leaders', start: '08:30', end: '14:30', location: 'Back field', spots: 12, description: 'Run a Field Day station with a buddy.' },
  graduation: { title: 'Graduation set-up', start: '15:00', end: '18:00', location: 'Auditorium', spots: 8, description: 'Chairs, flowers and the stage for graduation night.' },
};

/**
 * Two school years of past shifts up to (not including) `today`: last school year's, and this one's so far, the
 * most recent in the last few weeks. Each has who said yes ('me' is the test parent); shiftOutcome says what
 * happened each day.
 * @param {string} today
 */
export function volunteerHistory(today) {
  const [y, m] = today.split('-').map(Number);
  const year = m >= 7 ? y : y - 1;   // this school year starts in July of it
  const monday = mondayOf(today);
  const plan = [
    ['last', 'supplies', weekday(inSchoolYear(year - 1, '08-06')), ['rivera', 'wright', 'bennett', 'patel', 'kim', 'adams']],
    ['last', 'picture', weekday(inSchoolYear(year - 1, '09-10')), ['rivera', 'bennett', 'johnson', 'chen', 'moore']],
    ['last', 'festival', saturdayFrom(inSchoolYear(year - 1, '10-13')), ['rivera', 'wright', 'bennett', 'patel', 'johnson', 'kim', 'chen', 'taylor', 'me', 'adams', 'thompson']],
    ['last', 'bookfair', mondayOf(inSchoolYear(year - 1, '11-12')), ['rivera', 'bennett', 'kim', 'davis']],
    ['last', 'thanksgiving', weekday(inSchoolYear(year - 1, '11-20')), ['wright', 'bennett', 'patel', 'johnson', 'chen', 'moore', 'davis']],
    ['last', 'christmas', weekday(inSchoolYear(year - 1, '12-11')), ['rivera', 'wright', 'kim', 'taylor', 'me', 'thompson']],
    ['last', 'library', weekday(inSchoolYear(year - 1, '01-21')), ['bennett', 'patel', 'adams']],
    ['last', 'carline', mondayOf(inSchoolYear(year - 1, '02-11')), ['rivera', 'wright', 'chen', 'moore']],
    ['last', 'carnival', saturdayFrom(inSchoolYear(year - 1, '03-23')), ['rivera', 'wright', 'bennett', 'patel', 'johnson', 'kim', 'chen', 'me', 'adams', 'thompson', 'davis']],
    ['last', 'appreciation', weekday(inSchoolYear(year - 1, '05-05')), ['bennett', 'patel', 'johnson', 'moore']],
    ['last', 'fieldday', weekday(inSchoolYear(year - 1, '05-15')), ['rivera', 'wright', 'bennett', 'kim', 'chen', 'me', 'adams', 'moore']],
    ['last', 'graduation', weekday(inSchoolYear(year - 1, '05-21')), ['rivera', 'wright', 'johnson', 'thompson']],
    ['this', 'supplies', weekday(inSchoolYear(year, '08-05')), ['rivera', 'wright', 'patel', 'kim', 'thompson', 'bennett']],
    ['this', 'picture', weekday(inSchoolYear(year, '09-09')), ['rivera', 'patel', 'johnson', 'moore', 'adams']],
    ['this', 'grandparents', weekday(inSchoolYear(year, '09-18')), ['wright', 'patel', 'chen', 'taylor', 'me', 'davis']],
    // The last few weeks: a Friday, a Thursday and a Friday, then two whole weeks.
    ['this', 'copying', addDays(monday, -24), ['patel', 'johnson']],
    ['this', 'library', addDays(monday, -18), ['patel', 'moore', 'davis']],
    ['this', 'homecoming', addDays(monday, -17), ['rivera', 'wright', 'kim', 'chen', 'bennett', 'adams']],
    ['this', 'carline', addDays(monday, -14), ['rivera', 'patel', 'thompson', 'bennett']],
    ['this', 'bookfair', addDays(monday, -7), ['rivera', 'wright', 'patel', 'me'], 5],
  ];
  return plan.map(([when, key, on, who, length]) => {
    const t = SHIFTS[key];
    const days = Array.from({ length: length ?? t.days ?? 1 }, (_, i) => addDays(on, i));
    return { id: uid(`opp:history:${when}:${key}`), when, key, ...t, on, until: days.length > 1 ? days.at(-1) : null, days, who };
  }).filter((o) => (o.until ?? o.on) < today);
}
/** Every history opportunity's id, whatever today is (for taking them out). */
const historyIds = () => Object.keys(HELPERS).flatMap((when) => Object.keys(SHIFTS).map((key) => uid(`opp:history:${when}:${key}`)));

/**
 * What happened on one day of a shift for one helper: done (scanned in and out, or marked by the leader with the
 * scheduled time), a no-show, or nothing (nobody marked it).
 */
function shiftOutcome(o, k, day) {
  const tier = Object.entries(HELPERS[o.when]).find(([, list]) => list.includes(k))?.[0] ?? 'normal';
  const r = chance(`shift:${o.id}:${k}:${day}`);
  const status = tier === 'high' ? 'done'
    : tier === 'normal' ? (r < 0.08 ? 'no_show' : r < 0.12 ? null : 'done')
    : r < 0.4 ? 'no_show' : r < 0.7 ? null : 'done';
  if (status !== 'done') return { status };
  const how = chance(`how:${o.id}:${k}:${day}`);
  if (how < 0.25) return { status, minutes: minutesOf(o.end) - minutesOf(o.start), byLeader: true };
  const inAt = minutesOf(o.start) - Math.floor(how * 12);                                  // up to 12 minutes early
  const outAt = minutesOf(o.end) + Math.round((chance(`out:${o.id}:${k}:${day}`) - 0.5) * 20);   // give or take 10 minutes
  return { status, in: hhmm(inAt), out: hhmm(outAt), minutes: outAt - inAt };
}

// ----------------------------------------------------------------------------
// Student records (the Student app), in the shape the school's system sends to sis_import

const MIDDLE = [{ name: 'Tests', weight: 40 }, { name: 'Quizzes', weight: 30 }, { name: 'Homework', weight: 20 }, { name: 'Participation', weight: 10 }];
const LOWER = [{ name: 'Classwork', weight: 40 }, { name: 'Tests', weight: 40 }, { name: 'Homework', weight: 20 }];
/** Each class: where its average starts and ends the semester (so the graph has a story), and its teacher. */
const CLASSES = {
  older: [
    { key: 'bible', name: 'Bible', subject: 'bible', teacher: 'Mr. Davis', from: 96, to: 97 },
    { key: 'english', name: 'English', subject: 'english', teacher: 'Mrs. Taylor', from: 86, to: 91 },
    { key: 'math', name: 'Math', subject: 'math', teacher: 'Mr. Davis', from: 94, to: 90 },
    { key: 'science', name: 'Science', subject: 'science', teacher: 'Mrs. Price', from: 93, to: 95 },
    { key: 'history', name: 'History', subject: 'history', teacher: 'Mrs. Taylor', from: 86, to: 78 },
    { key: 'spanish', name: 'Spanish I', subject: 'spanish', teacher: 'Sra. Ruiz', from: 70, to: 84 },
  ],
  younger: [
    { key: 'reading', name: 'Reading', subject: 'reading', teacher: 'Mrs. Brooks', from: 94, to: 96 },
    { key: 'math', name: 'Math', subject: 'math', teacher: 'Mrs. Brooks', from: 85, to: 91 },
    { key: 'spelling', name: 'Spelling', subject: 'spelling', teacher: 'Mrs. Brooks', from: 97, to: 98 },
    { key: 'science', name: 'Science', subject: 'science', teacher: 'Mrs. Brooks', from: 92, to: 90 },
    { key: 'bible', name: 'Bible', subject: 'bible', teacher: 'Mrs. Brooks', from: 98, to: 98 },
  ],
  // The senior test login (11th grade): Chemistry slips under 70%, so Needs attention has something to show.
  high: [
    { key: 'english', name: 'English 11', subject: 'english', teacher: 'Mrs. Price', from: 90, to: 87 },
    { key: 'chem', name: 'Chemistry', subject: 'science', teacher: 'Mr. Davis', from: 70, to: 58 },
    { key: 'ushistory', name: 'U.S. History', subject: 'history', teacher: 'Mrs. Taylor', from: 84, to: 89 },
    { key: 'algebra', name: 'Algebra II', subject: 'math', teacher: 'Mr. Davis', from: 88, to: 92 },
    { key: 'bible', name: 'Bible 11', subject: 'bible', teacher: 'Mr. Davis', from: 95, to: 96 },
  ],
};
const COMMENTS = ['Great improvement!', 'Watch the units on each answer.', 'Nice work.', 'Show your work next time.', 'Excellent effort.', 'Review chapter 4.'];

/** A class's average the way the app works it out (src/student/grades.ts): weighted category points, missing as zero. */
function sampleAverage(grades, categories, from, to) {
  const inside = grades.filter((g) => g.maxScore && (g.status === 'missing' || (g.status === 'graded' && g.score !== null)) && g.dueOn >= from && g.dueOn <= to);
  if (!inside.length) return null;
  const pts = (list) => list.reduce((n, g) => n + (g.status === 'missing' ? 0 : g.score), 0) / list.reduce((n, g) => n + g.maxScore, 0);
  let sum = 0, total = 0;
  for (const c of categories) {
    const mine = inside.filter((g) => g.category === c.name);
    if (mine.length) { sum += c.weight * pts(mine); total += c.weight; }
  }
  return 100 * (total ? sum / total : pts(inside));
}

/**
 * The Student app's records for the test children (older first), the student login and the senior test login, this
 * school year up to `today` (and a week of work still to be graded): information, attendance and every class's grades.
 * @param {{ id: string, grade: number }[]} children @param {string | null} student @param {string} today
 * @param {string | null} [senior]
 */
export function studentRecords(children, student, today, senior = null) {
  const [y, m] = today.split('-').map(Number);
  const year = m >= 7 ? y : y - 1;
  const first = weekday(inSchoolYear(year, '08-05'));
  const terms = [{ name: 'Semester 1', startsOn: first, endsOn: inSchoolYear(year, '12-18') }, { name: 'Semester 2', startsOn: weekday(inSchoolYear(year, '01-06')), endsOn: inSchoolYear(year, '05-21') }];
  const term = terms.find((t) => t.startsOn <= today && today <= t.endsOn) ?? [...terms].reverse().find((t) => t.startsOn <= today) ?? terms[0];
  const schoolDays = (() => { let n = 0; for (let d = first; d < today; d = addDays(d, 1)) if (!weekend(d)) n += 1; return Math.max(0, n - 3); })();   // less Labor Day and fall break
  const scale = (pct) => (pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F');
  const until = addDays(today, 7);

  const record = (who, level, kind, extra) => {
    const middle = level !== 'younger';
    const categories = middle ? MIDDLE : LOWER;
    const courses = CLASSES[level].map((c, ci) => {
      const due = [];
      for (let d = first; d <= until; d = addDays(d, 1)) {
        if (weekend(d)) continue;
        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
        const week = Math.floor((Date.parse(d) - Date.parse(first)) / (7 * 86_400_000));
        if (middle) {
          if ((dow === 2 || dow === 4) && (c.key !== 'bible' || dow === 2)) due.push([d, 'Homework', 10, `Homework ${due.filter((x) => x[1] === 'Homework').length + 1}`]);
          if (dow === 5 && week % 2 === 1) due.push([d, 'Quizzes', 20, `Quiz ${due.filter((x) => x[1] === 'Quizzes').length + 1}`]);
          if (dow === 3 && week % 4 === 3) due.push([d, 'Tests', 100, `Unit ${due.filter((x) => x[1] === 'Tests').length + 1} test`]);
          if (dow === 5 && Number(d.slice(8)) >= 25 && !due.some((x) => x[1] === 'Participation' && x[0].slice(0, 7) === d.slice(0, 7))) due.push([d, 'Participation', 10, 'Participation']);
        } else {
          if (dow === 1 || dow === 3) due.push([d, 'Classwork', 10, `Classwork ${due.filter((x) => x[1] === 'Classwork').length + 1}`]);
          if (dow === 4) due.push([d, 'Homework', 10, `Homework ${due.filter((x) => x[1] === 'Homework').length + 1}`]);
          if (dow === 5 && week % 3 === 2) due.push([d, 'Tests', 50, `Test ${due.filter((x) => x[1] === 'Tests').length + 1}`]);
        }
      }
      const span = Math.max(1, Date.parse(today) - Date.parse(first));
      const grades = due.map(([d, category, max, title], i) => {
        const sisId = `${c.key}-${d}-${category}`;
        if (d >= today) return { sisId, title, category, dueOn: d, maxScore: max, status: 'pending' };
        const along = (Date.parse(d) - Date.parse(first)) / span;
        const spread = category === 'Tests' ? 12 : category === 'Quizzes' ? 14 : 16;
        const pct = Math.min(100, Math.max(45, c.from + (c.to - c.from) * along + (chance(`grade:${who}:${sisId}`) - 0.5) * spread));
        const score = Math.round((max * pct) / 100 * 2) / 2;
        // One missing piece of history homework a couple of weeks back, and an excused quiz on a sick day.
        if (c.key === (extra.missingKey ?? 'history') && category === 'Homework' && d >= addDays(today, -16) && !extra.missingDone) {
          extra.missingDone = true;
          return { sisId, title, category, dueOn: d, maxScore: max, status: 'missing', comment: 'Not turned in yet. Half credit if it comes in by Friday.' };
        }
        if (d === extra.sickDay && category !== 'Participation') return { sisId, title, category, dueOn: d, maxScore: max, status: 'excused', comment: 'Absent' };
        const comment = category === 'Tests' && chance(`comment:${who}:${sisId}`) < 0.5 ? COMMENTS[Math.floor(chance(`which:${who}:${sisId}`) * COMMENTS.length)] : null;
        return { sisId, title, category, dueOn: d, score, maxScore: max, status: 'graded', ...(comment ? { comment } : {}) };
      });
      const average = sampleAverage(grades, categories, term.startsOn, term.endsOn);
      const rounded = average === null ? null : Math.round(average * 100) / 100;
      return { sisId: `${kind}-${c.key}`, name: level === 'older' && c.key !== 'spanish' ? `${c.name} ${extra.gradeName}` : c.name,
        subject: c.subject, teacher: c.teacher, average: rounded, letter: rounded === null ? null : scale(rounded), categories, grades, position: ci };
    });
    return { profileId: who, sisId: `S${parseInt(createHash('md5').update(`sis:${who}`).digest('hex').slice(0, 6), 16) % 90000 + 10000}`,
      homeroom: extra.homeroom, advisor: extra.advisor, enrolledOn: extra.enrolledOn, schoolDays, details: extra.details,
      attendance: extra.attendance.filter((a) => a.day < today), courses };
  };

  const [older, younger] = children;
  const out = [];
  const sick = weekday(inSchoolYear(year, '09-15'));   // a homework day, so that day's work is excused
  const olderExtra = (id) => ({
    gradeName: String(older.grade), homeroom: 'Mrs. Taylor · Room 204', advisor: 'Mr. Davis', enrolledOn: weekday(inSchoolYear(year - 4, '08-08')), sickDay: sick,
    details: [{ label: 'Locker', value: String(200 + Math.floor(chance(`locker:${id}`) * 60)) }, { label: 'Lunch balance', value: '$23.40' }, { label: 'Dismissal', value: 'Car line' }],
    attendance: [
      { day: sick, kind: 'absent', excused: true, note: 'Sick' },
      { day: weekday(inSchoolYear(year, '10-02')), kind: 'tardy', excused: false },
      { day: weekday(inSchoolYear(year, '10-08')), kind: 'left_early', excused: true, note: 'Orthodontist' },
      { day: weekday(inSchoolYear(year, '10-21')), kind: 'tardy', excused: true, note: 'Doctor appointment' },
    ],
  });
  if (older) out.push(record(older.id, 'older', 'MS', olderExtra(older.id)));
  if (student && older) out.push(record(student, 'older', 'MS', { ...olderExtra(student), sickDay: null, attendance: [{ day: weekday(inSchoolYear(year, '10-13')), kind: 'tardy', excused: false }] }));
  if (younger) {
    const fever = weekday(inSchoolYear(year, '09-23'));
    out.push(record(younger.id, 'younger', 'LS', {
      homeroom: 'Mrs. Brooks · Room 108', advisor: null, enrolledOn: weekday(inSchoolYear(year - 2, '08-07')), sickDay: fever,
      details: [{ label: 'Lunch balance', value: '$18.75' }, { label: 'Dismissal', value: 'Car line' }],
      attendance: [
        { day: fever, kind: 'absent', excused: true, note: 'Fever' },
        { day: addDays(fever, 1), kind: 'absent', excused: true, note: 'Fever' },
        { day: weekday(inSchoolYear(year, '10-13')), kind: 'tardy', excused: false },
      ],
    }));
  }
  if (senior) {
    out.push(record(senior, 'high', 'HS', {
      gradeName: '11', homeroom: 'Mrs. Price · Room 302', advisor: 'Mr. Davis', enrolledOn: weekday(inSchoolYear(year - 2, '08-07')), sickDay: null,
      missingKey: 'english', details: [{ label: 'Locker', value: '417' }, { label: 'Parking pass', value: 'Lot B, #31' }, { label: 'Dismissal', value: 'Drives' }],
      attendance: [{ day: weekday(inSchoolYear(year, '09-29')), kind: 'tardy', excused: false }],
    }));
  }
  return { source: 'sample', schoolYear: year + 1, terms, students: out };
}

// ----------------------------------------------------------------------------
// The data

/**
 * The SQL that removes everything this script adds, then (unless `remove`) adds it again.
 * `me` is the test parent's profile id, `children` their children ({ id, grade }, older
 * first), `student` an optional student login's id, `volleyball` an existing season id,
 * `cheer` the real Royals Cheer season's id and `basketball` the real Basketball activity's id.
 * `today` is the school's real today, for the past volunteer shifts (default: `day`).
 * `teacher` is a teacher test login who teaches the Bible class (default: `me`), `senior` an 11th-grade test login
 * (high school classes, grade records and a College & Career plan), and `lunch` a lunch time for sample lunch visits.
 * `only: 'volunteer'` limits it to the volunteering.
 * @param {{ day: string, today?: string, me: string, children: { id: string, grade: number }[], student?: string | null,
 *   volleyball?: string | null, cheer?: string | null, basketball?: string | null, teacher?: string | null, senior?: string | null,
 *   lunch?: string | null, remove?: boolean, only?: string | null }} options
 * @returns {string}
 */
export function buildSql({ day, today = day, me, children, student = null, volleyball = null, cheer = null, basketball = null,
  teacher = null, senior = null, lunch = null, remove = false, only = null }) {
  const [older, younger] = children;
  const sd = (n) => schoolDay(day, n);
  const ids = { forms: [], threads: [], assignments: [], rosters: [], events: [], sports: [], opps: [], listings: [], people: [] };
  const out = [];

  const people = [
    ...STAFF.map((s) => ({ id: staff(s.key), first: s.first, last: s.last, role: s.role, grade: null })),
    ...FAMILIES.map((f) => ({ id: parent(f.key), first: f.parent, last: f.last, role: 'parent', grade: null })),
    ...FAMILIES.filter((f) => (f.set === 'a' ? older : younger)).map((f) => ({
      id: kid(f.key), first: f.child, last: f.last, role: 'student', grade: (f.set === 'a' ? older : younger).grade,
    })),
    ...HIGH.map((h) => ({ id: kid(h.key), first: h.first, last: h.last, role: 'student', grade: h.grade })),
  ];
  ids.people = people.map((p) => p.id);
  const fam = (set) => FAMILIES.filter((f) => f.set === set && (set === 'a' ? older : younger));

  // --- Classes (sections) and assignments
  const classes = [];
  if (older) {
    classes.push({ id: 'demo-homeroom-a', name: `${ordinal(older.grade)} Grade Homeroom`, lead: staff('taylor'), kids: [older.id, ...fam('a').map((f) => kid(f.key)), ...(student ? [student] : [])] });
    classes.push({ id: 'demo-bible-a', name: `Bible ${older.grade > 0 ? older.grade : ordinal(older.grade)}`, lead: teacher ?? me, kids: [older.id, ...fam('a').map((f) => kid(f.key)), ...(student ? [student] : [])] });
  }
  if (younger) classes.push({ id: 'demo-homeroom-b', name: `${ordinal(younger.grade)} Grade – Mrs. Brooks`, lead: staff('brooks'), kids: [younger.id, ...fam('b').map((f) => kid(f.key))] });
  // High school: the senior test login and the made-up high schoolers.
  const hs = (keys) => [...(senior ? [senior] : []), ...keys.map(kid)];
  classes.push({ id: 'demo-english-11', name: 'English 11', lead: staff('price'), kids: hs(['collins', 'turner']) });
  classes.push({ id: 'demo-chem', name: 'Chemistry', lead: staff('davis'), kids: hs(['collins', 'reed']) });
  classes.push({ id: 'demo-ushistory', name: 'U.S. History', lead: staff('taylor'), kids: hs(['turner', 'collins']) });
  ids.rosters = ['demo-homeroom-a', 'demo-bible-a', 'demo-homeroom-b', 'demo-english-11', 'demo-chem', 'demo-ushistory'];
  // Everyone this script puts in the classes; anyone else in them (a tester's own account) stays through a refresh.
  const ours = [...ids.people, me, teacher, student, senior, ...children.map((c) => c.id)].filter(Boolean);

  const work = [
    ['demo-homeroom-a', 'Read Hatchet, chapters 5–6', 'Be ready to talk about the choices Brian makes.', 0],
    ['demo-homeroom-a', 'Fractions practice, page 84', 'Problems 1–20. Show your work.', 1],
    ['demo-homeroom-a', 'Science fair topic', "One paragraph: your question and how you'll test it.", 3],
    ['demo-homeroom-a', 'Vocabulary quiz: Unit 3', 'Study the 15 words on the Unit 3 list.', 5],
    ['demo-homeroom-a', 'Map of the Fertile Crescent', 'Color and label the rivers and cities.', -1],
    ['demo-bible-a', 'Memory verse: Psalm 23:1–3', 'Say it from memory in class.', 1],
    ['demo-bible-a', 'Reflection journal, week 9', 'One page on this week’s lesson.', 4],
    ['demo-homeroom-b', 'Spelling list 8', 'Practice each word three times.', 0],
    ['demo-homeroom-b', 'Read for 20 minutes and log it', 'Write the book title and the minutes.', 1],
    ['demo-homeroom-b', 'Bring a fall leaf for science', 'Any color, any size.', 2],
    ['demo-homeroom-b', 'Math facts: 2s and 5s', 'Practice sheet in the take-home folder.', 4],
    ['demo-english-11', 'The Great Gatsby, chapters 3–4', 'Annotate two passages about the green light.', 1],
    ['demo-english-11', 'Argument essay draft', 'Two pages, MLA format. Bring a printed copy.', 4],
    ['demo-chem', 'Unit 4 practice problems', 'Stoichiometry, problems 1–15.', 0],
    ['demo-chem', 'Lab report: reaction rates', 'Include your data table and a graph.', 2],
    ['demo-ushistory', 'Primary source: Federalist No. 10', 'Answer the four questions on the handout.', 3],
  ].filter(([r]) => classes.some((c) => c.id === r));
  const assignments = work.map(([r, title, details, n], i) => ({ id: uid(`assignment:${i}:${title}`), r, lead: classes.find((c) => c.id === r).lead, title, details, due: sd(n) }));
  if (student) assignments.push({ id: uid('assignment:own'), r: null, lead: student, title: 'Study for the vocab quiz', details: 'Flash cards on the bus.', due: sd(4) });
  ids.assignments = assignments.map((a) => a.id);

  // --- Ask the Teacher (the student login)
  const threads = student && older ? [
    { id: uid('thread:taylor'), teacher: staff('taylor'), messages: [
      [student, 'Mrs. Taylor, is the science fair topic one paragraph or two?', at(sd(-1), '16:10')],
      [staff('taylor'), "One paragraph is plenty. Include your question and how you'll test it.", at(sd(-1), '17:02')],
    ], studentRead: at(sd(-1), '16:11'), teacherRead: at(sd(-1), '17:02') },
    { id: uid('thread:me'), teacher: me, messages: [
      [student, 'Mr. Nelson, can I turn in my reflection journal on Friday?', at(sd(-1), '19:45')],
    ], studentRead: at(sd(-1), '19:45'), teacherRead: null },
  ] : [];
  ids.threads = threads.map((t) => t.id);

  // --- Forms, with signatures and payments
  const bus = { id: 'q1', kind: 'yes_no', prompt: 'May your child ride the school bus?', required: true, options: [] };
  const sign = (f, by, answers = {}, agreed = true, when = at(sd(-1), '19:30')) => ({ f, by, answers, agreed, when });
  const forms = [];
  const fa = fam('a'), fb = fam('b');
  if (older) {
    forms.push({
      key: 'zoo', author: staff('taylor'), title: 'Zoo field trip permission', audience: 'section', section: 'demo-homeroom-a', fee: 1500, due: sd(3),
      details: `Our ${ordinal(older.grade)} grade visits the zoo on ${pretty(sd(6))}. We leave at 8:30 and are back by 2:30. Bring a sack lunch and a water bottle.`,
      questions: [bus, { id: 'q2', kind: 'text', prompt: 'Allergies or medicines we should know about?', required: false, options: [] },
        { id: 'q3', kind: 'choice', prompt: 'Can you chaperone?', required: false, options: ['Yes', 'No', 'Maybe'] }],
      to: classes[0].kids,
      signed: [sign('rivera', 'rivera', { q1: 'yes', q3: 'Yes' }), sign('patel', 'patel', { q1: 'yes', q2: 'Peanut allergy. EpiPen is in her backpack.', q3: 'No' }),
        sign('kim', 'kim', { q1: 'yes', q3: 'Maybe' }), sign('bennett', 'bennett', {}, false)],
      paid: [['rivera', 1500, 'cash', 'Front office', sd(-1), ''], ['patel', 1500, 'check', 'Teacher', sd(-1), 'Check #2214']],
      recorder: staff('taylor'),
    });
    forms.push({
      key: 'retreat', author: me, title: 'Bible class retreat permission', audience: 'section', section: 'demo-bible-a', fee: 2500, due: sd(5),
      details: `Our class retreat is on ${pretty(sd(8))} at Camp Lee, 9:00 to 3:00. Lunch is provided.`,
      questions: [bus, { id: 'q2', kind: 'text', prompt: 'T-shirt size', required: true, options: [] }],
      to: classes[1].kids,
      signed: [sign('rivera', 'rivera', { q1: 'yes', q2: 'Youth L' }), sign('patel', 'patel', { q1: 'yes', q2: 'Adult S' }),
        sign('johnson', 'johnson', { q1: 'no', q2: 'Youth M' }), sign('kim', 'kim', {}, false)],
      paid: [['rivera', 2500, 'online', 'Online', sd(-1), ''], ['patel', 2500, 'cash', 'Front office', sd(0), ''], ['johnson', 2500, 'check', 'Teacher', sd(-1), 'Check #1088']],
      recorder: staff('garcia'),
    });
  }
  if (younger) {
    forms.push({
      key: 'pumpkins', author: staff('brooks'), title: 'Pumpkin patch field trip', audience: 'section', section: 'demo-homeroom-b', fee: 800, due: sd(1),
      details: `${ordinal(younger.grade)} grade picks pumpkins on ${pretty(sd(4))}. Dress for mud and bring a water bottle.`,
      questions: [bus], to: classes.find((c) => c.id === 'demo-homeroom-b').kids,
      signed: fb.filter((f) => f.key !== 'wright').map((f) => sign(f.key, f.key, { q1: 'yes' })),
      paid: [['chen', 800, 'cash', 'Front office', sd(-2), ''], ['moore', 800, 'online', 'Online', sd(-1), ''], ['thompson', 800, 'cash', 'Teacher', sd(-1), '']],
      recorder: staff('brooks'),
    });
  }
  const grades = children.map((c) => c.grade);
  forms.push({
    key: 'handbook', author: staff('garcia'), title: 'Handbook acknowledgment 2026–2027', audience: 'grades', grades, fee: null, due: sd(7),
    details: "Please confirm you've read the 2026–2027 Student / Parent Handbook.", link: 'https://www.khroyals.com/s/KH-Student-Handbook-nj4p.pdf',
    questions: [], to: [...children.map((c) => c.id), ...[...fa, ...fb].map((f) => kid(f.key)), ...(student && older ? [student] : [])],
    signed: [...fa, ...fb].filter((f) => !['bennett', 'wright'].includes(f.key)).map((f) => sign(f.key, f.key)), paid: [], recorder: null,
  });

  // --- Activities
  const sport = (key, name, icon, category, description, coach) => ({ key, id: uid(`sport:${key}`), name, icon, category, description, coach });
  // (An earlier version made up a Basketball activity; the school's real one replaced it.)
  const sports = [
    sport('annie', 'Annie Jr.', '🎭', 'theater', 'This year’s musical. Rehearsals Mondays and Wednesdays after school.', staff('price')),
    sport('chess', 'Chess Club', '♟️', 'clubs', 'All levels welcome. We meet Wednesdays in Room 112.', staff('taylor')),
    sport('choir', 'Royal Voices', '🎵', 'music', 'Lower school choir. Rehearsals Thursdays after school.', staff('price')),
  ];
  ids.sports = [...sports.map((s) => s.id), uid('sport:basketball')];
  const season = (key, sp, name, starts, ends, min, max, details) => ({ id: uid(`season:${key}`), sport: uid(`sport:${sp}`), name, starts, ends, min, max, details });
  const seasons = [
    season('annie', 'annie', 'Fall show', '2026-09-14', '2026-12-12', 2, 8, 'Rehearsals Mon and Wed, 3:30–5:00. Shows Dec 11 and 12.'),
    season('chess', 'chess', 'Fall 2026', '2026-09-02', '2026-12-16', 3, 12, 'Wednesdays, 3:30–4:30.'),
    season('choir', 'choir', '2026–27', '2026-08-17', '2027-05-14', 2, 6, 'Thursdays, 3:30–4:15. Christmas Program on Dec 1.'),
  ];
  const ev = (key, s, kind, title, start, end, location, home = null) => ({ id: uid(`event:${key}`), season: s, kind, title, start, end, location, home });
  const SA = uid('season:annie'), SC = uid('season:chess'), SV = uid('season:choir');
  const events = [
    ev('an1', SA, 'rehearsal', 'Rehearsal: Act 1', at(sd(-1), '15:30'), at(sd(-1), '17:00'), 'Auditorium'),
    ev('an2', SA, 'rehearsal', 'Rehearsal: Act 1', at(sd(1), '15:30'), at(sd(1), '17:00'), 'Auditorium'),
    ev('an3', SA, 'rehearsal', 'Music rehearsal', at(sd(5), '15:30'), at(sd(5), '17:00'), 'Music room'),
    ev('an4', SA, 'performance', 'Annie Jr.: opening night', at('2026-12-11', '19:00'), null, 'Auditorium'),
    ev('ch1', SC, 'meeting', 'Club meeting', at(sd(1), '15:30'), at(sd(1), '16:30'), 'Room 112'),
    ev('ch2', SC, 'competition', 'Rocket City scholastic tournament', at(sd(9), '09:00'), null, 'Huntsville', false),
    ev('cv1', SV, 'rehearsal', 'Rehearsal', at(sd(2), '15:30'), at(sd(2), '16:15'), 'Music room'),
    ev('cv2', SV, 'performance', 'Christmas Program', at('2026-12-01', '18:00'), null, 'Auditorium'),
  ];
  if (volleyball) {
    events.push(ev('vb1', volleyball, 'game', 'vs. Grace Prep', at(sd(0), '17:00'), null, 'Royals Gym', true));
    events.push(ev('vb2', volleyball, 'game', 'at Valley Christian', at(sd(2), '16:30'), null, 'Valley Christian School', false));
  }
  ids.events = events.map((e) => e.id);
  const registrations = [
    ...(younger ? [[SA, younger.id, me, 'registered'], [SV, younger.id, me, 'registered'], ...fb.slice(0, 2).map((f) => [SA, kid(f.key), parent(f.key), 'registered']),
      ...fb.slice(2, 4).map((f) => [SV, kid(f.key), parent(f.key), 'registered'])] : []),
    // The school's real Royals Cheer (K–5): the younger child and two classmates.
    ...(younger && cheer ? [[cheer, younger.id, me, 'registered'], ...fb.slice(3, 5).map((f) => [cheer, kid(f.key), parent(f.key), 'registered'])] : []),
    ...fa.slice(1, 3).map((f) => [SA, kid(f.key), parent(f.key), 'registered']),
    ...fa.slice(3).map((f) => [SC, kid(f.key), parent(f.key), 'registered']),
  ];
  const regId = (s, st) => uid(`registration:${s}:${st}`);

  // --- Volunteer (led by the front office): Harvest Fest, with its ways to help in the leader's order, and some on their own
  const fest = { id: uid('vevent:harvest'), title: 'Harvest Fest', on: saturdayFrom(sd(7)), location: 'Front lawn',
    description: 'Our fall festival for the whole Kingdom Heights family: games, hayrides, a bake sale and a chili cook-off.\n\nGood to know:\nFamilies are welcome. Park on the back lot.' };
  const festAlbum = uid('album:harvest');
  const festOpps = [
    { key: 'fest-setup', title: 'Set up the day of', on: fest.on, start: '07:30', end: '09:30', location: 'Front lawn', spots: 10, kind: 'help',
      description: 'Tables, tents and hay bales before the gates open.\n\nWhat to bring:\nWork gloves.', signups: [['me'], ['rivera'], ['johnson'], ['kim']] },
    { key: 'fest-booths', title: 'Game booth helpers', on: fest.on, start: '10:00', end: '13:00', location: 'Front lawn', spots: 12, kind: 'help',
      description: 'Run a game booth for an hour or two: ring toss, the cake walk or face painting.', signups: [['chen'], ['thompson'], ['patel'], ['moore'], ['adams']] },
    { key: 'fest-water', title: 'Bottled water', on: addDays(fest.on, -1), location: 'Front office', kind: 'items', item: 'cases of bottled water', quantity: 20,
      description: 'Drop the cases at the front office by Friday afternoon.', signups: [['wright', 4], ['bennett', 3]] },
    { key: 'fest-bake', title: 'Bake sale treats', on: fest.on, location: 'Bake sale table', kind: 'items', item: 'dozen cookies or brownies', quantity: 40,
      description: 'Wrapped by the dozen, with a label if they have nuts. Drop them at the bake sale table by 9 AM.', signups: [['rivera', 2], ['patel', 3], ['johnson', 2]] },
    { key: 'fest-cleanup', title: 'Clean-up crew', on: fest.on, start: '13:00', end: '15:00', location: 'Front lawn', spots: 8, kind: 'help',
      description: 'Take down the tents and tables and leave the lawn the way we found it.', signups: [['wright']] },
  ].map((o, i) => ({ ...o, event: fest.id, position: i + 1 }));
  const opps = [
    ...festOpps,
    { key: 'library', title: 'Library book shelving', on: sd(6), start: '09:00', end: '11:00', location: 'Library', spots: 3, kind: 'help',
      description: 'Help our librarian shelve returns and set up the new book display.', signups: [['kim']] },
    { key: 'tissues', title: 'Tissues for every homeroom', on: sd(5), location: 'Front office', kind: 'items', item: 'boxes of tissues', quantity: 24,
      description: 'Cold season is here. Drop off boxes at the front office.', signups: [['patel', 6], ['bennett', 4], ['moore', 2]] },
    { key: 'food', title: 'Canned food drive', on: sd(8), location: 'Front office', kind: 'items', item: 'canned goods', quantity: 200,
      description: 'For the Huntsville food bank. Soups, vegetables and beans are most needed.', signups: [['wright', 24], ['adams', 12], ['chen', 30]] },
  ];
  // Past shifts, with who came, for the volunteer analytics.
  const past = volunteerHistory(today);
  const helper = (k) => (k === 'me' ? me : STAFF.some((x) => x.key === k) ? staff(k) : parent(k));
  const shifts = past.flatMap((o) => o.who.flatMap((k) => o.days.map((d) => ({ o, k, d, ...shiftOutcome(o, k, d) }))));
  // Fall Festival booth helpers was on its own before Harvest Fest; taken out with the rest.
  ids.opps = [...opps.map((o) => uid(`opp:${o.key}`)), uid('opp:festival'), ...historyIds()];
  // Sign-ups from real accounts (testers trying the app) survive a refresh; the made-up families' are written again.
  const volunteerDrop = (keep) => [
    keep ? `create temp table kept_signups on commit drop as select s.opportunity_id, s.user_id, s.quantity from public.volunteer_signups s
      join public.profiles p on p.id = s.user_id where s.opportunity_id in ${inList(ids.opps)} and not p.managed;` : '',
    `delete from public.volunteer_opportunities where id in ${inList(ids.opps)};`,
    `delete from public.volunteer_events where id = ${lit(fest.id)};`,
    // Harvest Fest's photo album (with any photos testers added) stays through a refresh; --remove takes it out.
    keep ? '' : `delete from public.gallery_albums where id = ${lit(festAlbum)};`,
  ];
  const volunteerAdd = () => [
      insert('volunteer_events', ['id', 'lead_id', 'title', 'description', 'starts_on', 'location', 'created_at'],
        [[fest.id, staff('garcia'), fest.title, fest.description, fest.on, fest.location, at(sd(-4), '09:00')]]),
      `insert into public.gallery_albums (id, title, description, taken_on, created_by, category_id, visibility, volunteer_event_id)
        values (${lit(festAlbum)}, ${lit(fest.title)}, '', ${lit(fest.on)}, ${lit(staff('garcia'))},
          (select id from public.gallery_categories where name = 'Events'), 'everyone', ${lit(fest.id)})
        on conflict (id) do update set volunteer_event_id = excluded.volunteer_event_id, taken_on = excluded.taken_on, created_by = excluded.created_by;`,
      insert('volunteer_opportunities', ['id', 'lead_id', 'title', 'description', 'starts_on', 'start_time', 'end_time', 'location', 'spots', 'kind', 'item', 'quantity',
        'event_id', 'position', 'created_at'],
        opps.map((o) => [uid(`opp:${o.key}`), staff('garcia'), o.title, o.description, o.on, o.start ?? null, o.end ?? null, o.location, o.spots ?? null, o.kind,
          o.item ?? null, o.quantity ?? null, o.event ?? null, o.position ?? null, at(sd(-4), '09:00')])),
      insert('volunteer_signups', ['opportunity_id', 'user_id', 'quantity'],
        opps.flatMap((o) => o.signups.map(([k, n]) => [uid(`opp:${o.key}`), who(k), n ?? null]))),
      insert('volunteer_opportunities', ['id', 'lead_id', 'title', 'description', 'starts_on', 'ends_on', 'start_time', 'end_time', 'location', 'spots', 'kind', 'created_at'],
        past.map((o) => [o.id, staff('garcia'), o.title, o.description, o.on, o.until, o.start, o.end, o.location, o.spots, 'help', at(addDays(o.on, -21), '09:00')])),
      insert('volunteer_signups', ['opportunity_id', 'user_id', 'created_at'],
        past.flatMap((o) => o.who.map((k, i) => [o.id, helper(k), at(addDays(o.on, -14 + (i % 7)), '19:30')]))),
      insert('volunteer_attendance', ['opportunity_id', 'user_id', 'day', 'status', 'checked_in_at', 'checked_out_at', 'minutes', 'marked_by', 'updated_at'],
        shifts.filter((x) => x.status).map((x) => [x.o.id, helper(x.k), x.d, x.status, x.in ? at(x.d, x.in) : null, x.out ? at(x.d, x.out) : null,
          x.minutes ?? null, x.in ? helper(x.k) : staff('garcia'), at(x.d, x.out ?? x.o.end)])),
      `insert into public.volunteer_signups (opportunity_id, user_id, quantity) select k.opportunity_id, k.user_id, k.quantity from kept_signups k
        where exists (select 1 from public.volunteer_opportunities o where o.id = k.opportunity_id) on conflict do nothing;`,
  ];

  // --- Marketplace
  const listings = [
    ['polos', 'rivera', 'Navy uniform polos, youth M', 'Worn one school year. Selling all three.', 800, 3, 'like_new'],
    ['jumper', 'patel', 'Plaid jumper, girls size 8', 'Hemmed once; the hem can be let out.', 1500, 1, 'good'],
    ['pants', 'johnson', 'Khaki uniform pants, boys 10', 'Two pairs, no holes or stains.', 1000, 2, 'good'],
    ['vest', 'bennett', 'KHPS sweater vest, youth L', 'Chapel day ready.', 1800, 1, 'like_new'],
    ['hatchet', 'kim', 'Hatchet paperback', 'From the 6th grade reading list.', 400, 1, 'good'],
    ['calculator', 'wright', 'TI-84 Plus calculator', 'Works great, new batteries.', 4500, 1, 'good'],
    ['shoes', 'moore', 'Youth basketball shoes, size 5', 'Plenty of tread left.', 2000, 1, 'fair'],
    ['kneepads', 'thompson', 'Volleyball knee pads, youth S', 'Used for half a season.', 600, 1, 'like_new'],
    ['helmet', 'adams', 'Kids bike helmet, size S', 'Purple, adjustable.', 1000, 1, 'good'],
    ['books', 'chen', 'Box of early reader books', 'About 20 books for 1st and 2nd graders. Free to a good home.', 0, 1, 'good'],
    ['boots', 'me', 'Girls rain boots, size 13', 'Outgrown, still in good shape.', 500, 1, 'good'],
  ];
  ids.listings = listings.map(([k]) => uid(`listing:${k}`));
  const who = (k) => (k === 'me' ? me : parent(k));
  if (only === 'volunteer') return ['begin;', ...volunteerDrop(!remove), ...(remove ? [] : volunteerAdd()), 'commit;'].filter(Boolean).join('\n');
  // The Student app's records, through sis_import like the school's system (only the sample ones are taken out).
  const recordsDrop = () => ["delete from public.sis_alerts_sent where student_id in (select student_id from public.sis_students where source = 'sample');",
    "delete from public.sis_students where source = 'sample';", "delete from public.sis_terms where source = 'sample';"];
  const recordsAdd = () => [`select public.sis_import(${lit({ json: studentRecords(children, student, today, senior) })});`,
    // Missing work and low classes already in the sample records count as told, so nobody gets a notification.
    `insert into public.sis_alerts_sent (student_id, kind, course_key, item_key) select x.student_id, x.kind, x.course_key, x.item_key
      from app.student_alert_items() x where x.student_id in (select student_id from public.sis_students where source = 'sample') on conflict do nothing;`];
  if (only === 'student') return ['begin;', ...recordsDrop(), ...(remove ? [] : recordsAdd()), 'commit;'].join('\n');

  // --- The class tools: class times, help sessions, roll, bulletins and notes, absences, lunch visits, the boards
  const secs = (ids_) => ids_.filter((id) => classes.some((c) => c.id === id));
  const kidsOf = (id) => classes.find((c) => c.id === id)?.kids ?? [];
  const times = [
    ['demo-homeroom-a', [1, 2, 3, 4, 5], '08:00', '08:45', 'Room 204'],
    ['demo-bible-a', [1, 2, 3, 4, 5], '08:50', '09:35', 'Chapel'],
    ['demo-homeroom-b', [1, 2, 3, 4, 5], '07:55', '14:50', 'Room 108'],
    ['demo-english-11', [1, 3, 5], '09:00', '09:50', 'Room 302'], ['demo-english-11', [2, 4], '09:00', '10:20', 'Room 302'],
    ['demo-chem', [1, 3, 5], '10:00', '10:50', 'Lab A'], ['demo-chem', [4], '13:00', '14:20', 'Lab A'],
    ['demo-ushistory', [1, 2, 3, 4, 5], '11:00', '11:50', 'Room 305'],
  ].filter(([s]) => secs([s]).length).map(([s, days, start, end, room], i) => ({ id: uid(`meeting:${s}:${i}`), s, days, start, end, room }));
  const help = [
    { key: 'hatchet', lead: staff('taylor'), s: 'demo-homeroom-a', title: 'Hatchet book talk help', on: sd(1), start: '15:15', end: '16:00', place: 'Room 204', spots: 6,
      details: 'Bring your book and your reading log. We’ll go over chapters 5–6.', booked: ['rivera', 'patel'].map(kid) },
    { key: 'reading', lead: staff('brooks'), s: 'demo-homeroom-b', title: 'Reading buddies', on: sd(2), start: '07:30', end: '07:55', place: 'Library', spots: 4,
      details: 'Practice reading aloud before school.', booked: [kid('chen'), ...(younger ? [younger.id] : [])] },
    { key: 'chem', lead: staff('davis'), s: 'demo-chem', title: 'Chemistry lab make-up', on: sd(3), start: '15:15', end: '16:15', place: 'Lab A', spots: 8,
      details: 'Make up the reaction rates lab, or redo a trial. Closed-toe shoes.', booked: [...(senior ? [senior] : []), kid('collins')] },
    { key: 'essay', lead: staff('price'), s: 'demo-english-11', title: 'Essay workshop', on: sd(5), start: '07:15', end: '07:50', place: 'Room 302', spots: 10,
      details: 'Bring your argument essay draft for feedback.', booked: [kid('turner')] },
  ].filter((h) => secs([h.s]).length).map((h) => ({ ...h, id: uid(`help:${h.key}`), booked: h.booked.filter((k) => kidsOf(h.s).includes(k)) }));
  // The last five school days' roll: nearly everyone present, a few late or absent.
  const rollDays = [-5, -4, -3, -2, -1].map(sd);
  const roll = ['demo-homeroom-a', 'demo-homeroom-b', 'demo-english-11', 'demo-chem', 'demo-ushistory'].filter((s) => secs([s]).length).flatMap((s) =>
    rollDays.flatMap((d) => kidsOf(s).map((k) => {
      const r = chance(`roll:${s}:${d}:${k}`);
      return [s, k, d, r < 0.04 ? 'absent' : r < 0.1 ? 'late' : 'present', classes.find((c) => c.id === s).lead, at(d, '08:10')];
    })));
  const rollKids = [...new Set(roll.map((x) => x[1]))];
  const fnotes = [
    ...(older ? [
      { key: 'bookfair', author: staff('taylor'), kind: 'bulletin', title: 'Book Fair next week', sections: ['demo-homeroom-a'], when: at(sd(-2), '15:40'),
        body: 'The Book Fair is in the library all next week. Our class visits on Tuesday morning; send money in an envelope with your child’s name if they’d like to buy a book.' },
      { key: 'praise', author: staff('taylor'), kind: 'note', student: older.id, title: '', when: at(sd(-1), '14:55'),
        body: 'Your child led our book discussion today and helped a classmate who was stuck. Thank you for all you do at home!' },
    ] : []),
    ...(younger ? [{ key: 'pumpkins', author: staff('brooks'), kind: 'bulletin', title: 'Pumpkin patch reminders', sections: ['demo-homeroom-b'],
      when: at(sd(-1), '15:10'), body: 'Wear closed-toe shoes and clothes that can get muddy. We’ll be back in time for car line.' }] : []),
    { key: 'gatsby', author: staff('price'), kind: 'bulletin', title: 'Gatsby test moved', sections: ['demo-english-11'], when: at(sd(-1), '13:20'),
      body: 'The Gatsby test is now next Friday, so we can finish the novel together. Keep annotating!' },
  ];
  const pnotes = [
    ...(older ? [{ key: 'rivera', author: parent('rivera'), student: kid('rivera'), teacher: staff('taylor'), when: at(sd(-1), '20:05'), read: null,
      body: 'Mason has a dentist appointment Thursday morning and will be about an hour late. Could he make up the vocabulary quiz?' },
      { key: 'me', author: me, student: older.id, teacher: staff('taylor'), when: at(sd(-2), '19:30'), read: at(sd(-1), '07:45'),
        body: 'Thank you for the extra reading help this week. It’s making a difference at home.' }] : []),
  ];
  const absences = [
    ...(older ? [{ key: 'patel', student: kid('patel'), kind: 'absent', from: sd(1), to: sd(1), time: null, reason: 'appointment', by: parent('patel'),
      note: 'Orthodontist in the morning; she’ll be back after lunch if it’s quick.', seen: null }] : []),
    ...(younger ? [{ key: 'moore', student: kid('moore'), kind: 'early', from: sd(2), to: sd(2), time: '13:30', reason: 'family', by: parent('moore'),
      note: 'His grandmother is picking him up for a family trip.', seen: staff('garcia') }] : []),
  ];
  const visits = lunch ? [
    ...(older ? [{ key: 'rivera', student: kid('rivera'), visitor: parent('rivera'), on: sd(2), guests: 1, note: 'Bringing Grandpa' }] : []),
    ...(younger ? [{ key: 'chen', student: kid('chen'), visitor: parent('chen'), on: sd(3), guests: 0, note: '' }] : []),
  ] : [];
  const boardItems = [
    ['spirit', 'note', 'Spirit week is next week! Check the Folder for each day’s theme.', 'yellow', 3],
    ['quiz', 'note', 'Vocabulary quiz Friday: Unit 3', 'pink', 2],
    ['star', 'note', 'Star readers this week: our whole class read over 2,000 minutes!', 'green', 1],
  ];
  const boardPosts = [['field', 'Zoo field trip', `Permission slips are in your Folder. We leave at 8:30 on ${pretty(sd(6))} and are back by 2:30.`, true]];
  const boardChat = [['rivera', 'Is anyone else chaperoning the zoo trip? Happy to carpool.', at(sd(-1), '19:12')],
    ['patel', 'I am! I can take two kids besides mine.', at(sd(-1), '19:40')]];

  // --- Study (the student logins' own): a deck or two and a note
  const studyOwners = [...(older ? [{ who: older.id, level: 'older' }] : []), ...(senior ? [{ who: senior, level: 'high' }] : [])];
  const DECKS = {
    older: [['spanish', 'Spanish: la comida', 'Spanish I', [['la manzana', 'the apple'], ['el pan', 'the bread'], ['la leche', 'the milk'], ['el queso', 'the cheese'], ['el desayuno', 'breakfast'], ['la cena', 'dinner']]],
      ['science', 'Cell parts', 'Science', [['Nucleus', 'Holds the cell’s DNA'], ['Mitochondria', 'Makes energy for the cell'], ['Cell membrane', 'Controls what goes in and out'], ['Chloroplast', 'Where plants make food from light']]]],
    high: [['chem', 'Chemistry: units 3–4', 'Chemistry', [['Mole', '6.022 × 10²³ particles'], ['Molar mass', 'The mass of one mole of a substance, in grams'], ['Limiting reactant', 'The reactant used up first'], ['Catalyst', 'Speeds up a reaction without being used up'], ['Exothermic', 'Gives off heat']]],
      ['history', 'Founding documents', 'U.S. History', [['1776', 'Declaration of Independence'], ['1787', 'The Constitution is written'], ['1791', 'The Bill of Rights is ratified'], ['Federalist No. 10', 'Madison on factions and a large republic']]]],
  };
  const study = studyOwners.flatMap(({ who, level }) => DECKS[level].map(([key, title, subject, cards]) => ({ id: uid(`study:${who}:${key}`), who, title, subject,
    cards: cards.map(([front, back], i) => ({ id: uid(`study:${who}:${key}:${i}`), front, back, box: 1 + Math.floor(chance(`box:${who}:${key}:${i}`) * 4),
      due: addDays(day, Math.floor(chance(`due:${who}:${key}:${i}`) * 5) - 1) })) })));
  const notes = studyOwners.map(({ who, level }) => ({ id: uid(`studynote:${who}`), who, ...(level === 'high'
    ? { title: 'Reaction rates', subject: 'Chemistry', body: 'Things that speed up a reaction:\n- Temperature - particles move faster\n- Concentration - more collisions\n- Surface area - more exposed particles\n- Catalyst - lowers the activation energy' }
    : { title: 'Hatchet: chapters 5–6', subject: 'English', body: 'Brian - the main character\nHatchet - his only tool\nThe moose - attacks him at the lake' }) }));

  // --- The daily verse (King James Version, free to quote), the two school weeks around the day
  const VERSES = [
    ['Psalm 118:24', 'This is the day which the LORD hath made; we will rejoice and be glad in it.', 'Every day is a gift. Look for one good thing today and say thank you for it.'],
    ['Proverbs 3:5–6', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.', 'You don’t have to have everything figured out. Bring today’s questions to God.'],
    ['Philippians 4:13', 'I can do all things through Christ which strengtheneth me.', 'Something hard is coming today: a test, a practice, a conversation. You are not doing it alone.'],
    ['Joshua 1:9', 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'Courage isn’t not being scared. It’s doing the right thing while you are.'],
    ['Matthew 5:16', 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.', 'Small kindnesses shine. Who could use one from you today?'],
    ['Colossians 3:23', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men;', 'Do today’s work as if it matters, because it does.'],
    ['Psalm 46:1', 'God is our refuge and strength, a very present help in trouble.', 'When something feels too big, you can ask for help: from God, and from the people around you.'],
    ['Micah 6:8', 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?', 'Be fair. Be kind. Stay humble. That’s a full day’s work.'],
    ['Ephesians 4:32', 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ’s sake hath forgiven you.', 'Is there someone you need to forgive, or ask to forgive you?'],
    ['Galatians 6:9', 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.', 'Keep going. Good habits pay off slowly, then all at once.'],
    ['1 Timothy 4:12', 'Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.', 'You don’t have to be older to make a difference. Lead by example today.'],
    ['Isaiah 40:31', 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', 'Tired? Rest is part of strength. Take a breath and start again.'],
  ];
  const verseDays = Array.from({ length: VERSES.length }, (_, i) => sd(i - 3));

  // --- College & Career: the counselor's dates, the high schoolers' progress and transcript requests
  const collegeDates = [
    ['act', 'test', 'ACT', addDays(day, 26), addDays(day, 5), 'https://www.act.org', 'At school, 8:00 AM. Bring two No. 2 pencils, an approved calculator and your ticket.'],
    ['sat', 'test', 'SAT', addDays(day, 47), addDays(day, 20), 'https://satsuite.collegeboard.org', 'At the high school down the road. Digital: bring your charged device.'],
    ['psat', 'test', 'PSAT 10', addDays(day, 75), addDays(day, 40), null, 'For 10th graders, during the school day. Sign up with the counselor.'],
    ['fair', 'event', 'College Fair', addDays(day, 12), null, null, 'In the gym, 6–8 PM. More than 40 colleges, plus a FAFSA help table.'],
    ['rotary', 'scholarship', 'Rotary Club Scholarship', addDays(day, 33), null, null, '$2,500 for a senior with a record of community service. One-page essay.'],
    ['teach', 'scholarship', 'Future Teachers Scholarship', addDays(day, 61), null, 'https://www.example.org/future-teachers', '$1,000 for a senior planning to study education.'],
  ].map(([key, kind, title, on, reg, link, details]) => ({ id: uid(`cdate:${key}`), kind, title, on, reg, link, details }));
  // Steps done (by grade and title from the school's checklist), as of a few weeks ago.
  const stepsDone = [
    ...(senior ? [[senior, 10, ['Take the PSAT/NMSQT in October', 'Visit colleges']]] : []),
    [kid('turner'), 11, ['Finish your college list and deadlines', 'Request your transcripts']],
    [kid('collins'), 9, ['Take the PSAT 10 or PreACT']],
    [kid('reed'), 8, ['Meet your counselor', 'Plan your four years of classes']],
  ];
  const transcripts = [
    ...(senior ? [{ key: 'state', who: senior, to: 'State University', method: 'portal', address: '', by: addDays(day, 16), note: 'Early action', status: 'requested' },
      { key: 'summer', who: senior, to: 'Summer Science Institute', method: 'email', address: 'admissions@example.edu', by: null, note: 'For the summer program application',
        status: 'sent', counselor: 'Sent by email on ' + pretty(sd(-3)) + '.' }] : []),
    { key: 'turner', who: kid('turner'), to: 'University of Alabama', method: 'portal', address: '', by: addDays(day, 9), note: 'Early action deadline', status: 'requested' },
    { key: 'turner2', who: kid('turner'), to: 'Auburn University', method: 'portal', address: '', by: null, note: '', status: 'sent', counselor: 'Sent through Parchment.' },
  ];

  const toolsDrop = () => [
    `delete from public.section_meetings where id in ${inList(times.map((t) => t.id))};`,
    `delete from public.help_sessions where id in ${inList(['hatchet', 'reading', 'chem', 'essay'].map((k) => uid(`help:${k}`)))};`,
    `delete from public.class_attendance where section_id in ${inList(ids.rosters)} and day in ${inList(rollDays)} and student_id in ${inList(ours)};`,
    `delete from public.folder_notes where id in ${inList(['bookfair', 'praise', 'pumpkins', 'gatsby'].map((k) => uid(`fnote:${k}`)))};`,
    `delete from public.parent_notes where id in ${inList(['rivera', 'me'].map((k) => uid(`pnote:${k}`)))};`,
    `delete from public.absence_reports where id in ${inList(['patel', 'moore'].map((k) => uid(`absence:${k}`)))};`,
    `delete from public.lunch_visits where id in ${inList(['rivera', 'chen'].map((k) => uid(`lunchvisit:${k}`)))};`,
    `delete from public.study_decks where id in ${inList(study.map((d) => d.id))};`,
    `delete from public.study_notes where id in ${inList(notes.map((n) => n.id))};`,
    `delete from public.daily_verses where updated_by = ${lit(staff('garcia'))};`,
    `delete from public.college_dates where id in ${inList(['act', 'sat', 'psat', 'fair', 'rotary', 'teach'].map((k) => uid(`cdate:${k}`)))};`,
    `delete from public.transcript_requests where id in ${inList(['state', 'summer', 'turner', 'turner2'].map((k) => uid(`transcript:${k}`)))};`,
    // The senior's own checks stay through a refresh; --remove takes the sample progress out.
    remove && senior ? `delete from public.college_steps_done where student_id = ${lit(senior)};` : '',
  ];
  const boardOf = (who) => `(select id from public.boards where teacher_id = ${lit(who)})`;
  const toolsAdd = () => [
    insert('section_meetings', ['id', 'section_id', 'weekdays', 'start_time', 'end_time', 'room'], times.map((t) => [t.id, t.s, t.days, t.start, t.end, t.room])),
    insert('help_sessions', ['id', 'teacher_id', 'title', 'details', 'day', 'start_time', 'end_time', 'place', 'spots', 'created_at'],
      help.map((h) => [h.id, h.lead, h.title, h.details, h.on, h.start, h.end, h.place, h.spots, at(sd(-2), '16:00')])),
    insert('help_session_sections', ['session_id', 'section_id'], help.map((h) => [h.id, h.s])),
    insert('help_session_bookings', ['session_id', 'student_id', 'booked_at'], help.flatMap((h) => h.booked.map((k, i) => [h.id, k, at(sd(-1), `${17 + i}:05`)]))),
    insert('class_attendance', ['section_id', 'student_id', 'day', 'status', 'marked_by', 'at'], roll).replace(/;$/, ' on conflict do nothing;'),
    insert('folder_notes', ['id', 'author_id', 'kind', 'student_id', 'title', 'body', 'created_at'],
      fnotes.map((n) => [uid(`fnote:${n.key}`), n.author, n.kind, n.student ?? null, n.title, n.body, n.when])),
    insert('folder_note_sections', ['note_id', 'section_id'], fnotes.flatMap((n) => (n.sections ?? []).map((s) => [uid(`fnote:${n.key}`), s]))),
    insert('parent_notes', ['id', 'author_id', 'student_id', 'teacher_id', 'body', 'created_at', 'read_at'],
      pnotes.map((n) => [uid(`pnote:${n.key}`), n.author, n.student, n.teacher, n.body, n.when, n.read])),
    insert('absence_reports', ['id', 'student_id', 'kind', 'starts_on', 'ends_on', 'at_time', 'reason', 'note', 'reported_by', 'seen_by', 'seen_at', 'created_at'],
      absences.map((a) => [uid(`absence:${a.key}`), a.student, a.kind, a.from, a.to, a.time, a.reason, a.note, a.by, a.seen, a.seen ? at(sd(0), '08:05') : null, at(sd(-1), '18:30')])),
    insert('lunch_visits', ['id', 'window_id', 'day', 'student_id', 'visitor_id', 'guests', 'note', 'allergy_ack_at', 'created_at'],
      visits.map((v) => [uid(`lunchvisit:${v.key}`), lunch, v.on, v.student, v.visitor, v.guests, v.note, at(sd(-1), '20:00'), at(sd(-1), '20:00')])),
    ...(older ? [
      `insert into public.board_items (id, board_id, author_id, kind, body, color, position) select v.id::uuid, ${boardOf(staff('taylor'))}, ${lit(staff('taylor'))}, 'note', v.body, v.color, v.position
        from (values ${boardItems.map(([k, , body, color, pos]) => `(${lit(uid(`board:item:${k}`))}, ${lit(body)}, ${lit(color)}, ${pos})`).join(', ')}) v(id, body, color, position);`,
      `insert into public.board_posts (id, board_id, author_id, title, body, pinned, created_at) select v.id::uuid, ${boardOf(staff('taylor'))}, ${lit(staff('taylor'))}, v.title, v.body, v.pinned, ${lit(at(sd(-2), '15:45'))}
        from (values ${boardPosts.map(([k, title, body, pinned]) => `(${lit(uid(`board:post:${k}`))}, ${lit(title)}, ${lit(body)}, ${pinned})`).join(', ')}) v(id, title, body, pinned);`,
      `insert into public.board_chat_messages (id, board_id, author_id, body, created_at) select v.id::uuid, ${boardOf(staff('taylor'))}, v.author::uuid, v.body, v.at::timestamptz
        from (values ${boardChat.map(([k, body, when], i) => `(${lit(uid(`board:chat:${i}`))}, ${lit(parent(k))}, ${lit(body)}, ${lit(when.ts)})`).join(', ')}) v(id, author, body, at);`,
    ] : []),
    insert('study_decks', ['id', 'owner_id', 'title', 'subject', 'created_at'], study.map((d) => [d.id, d.who, d.title, d.subject, at(sd(-6), '19:00')])),
    insert('study_cards', ['id', 'deck_id', 'owner_id', 'front', 'back', 'position', 'box', 'due_on', 'reviewed_at'],
      study.flatMap((d) => d.cards.map((c, i) => [c.id, d.id, d.who, c.front, c.back, i, c.box, c.due, c.box > 1 ? at(sd(-2), '19:30') : null]))),
    insert('study_notes', ['id', 'owner_id', 'title', 'subject', 'body', 'created_at'], notes.map((n) => [n.id, n.who, n.title, n.subject, n.body, at(sd(-4), '18:00')])),
    insert('daily_verses', ['day', 'reference', 'verse', 'thought', 'updated_by'], VERSES.map(([ref, verse, thought], i) => [verseDays[i], ref, verse, thought, staff('garcia')]))
      .replace(/;$/, ' on conflict (day) do nothing;'),
    insert('college_dates', ['id', 'kind', 'title', 'day', 'register_by', 'link', 'details', 'created_by'],
      collegeDates.map((d) => [d.id, d.kind, d.title, d.on, d.reg, d.link, d.details, staff('garcia')])),
    ...stepsDone.map(([who, through, titles]) => `insert into public.college_steps_done (step_id, student_id, done_at) select s.id, ${lit(who)}, ${lit(at(sd(-15), '19:00').ts)}::timestamptz
      from public.college_steps s where s.grade <= ${through} or s.title in ${inList(titles)} on conflict do nothing;`),
    insert('transcript_requests', ['id', 'student_id', 'send_to', 'method', 'address', 'needed_by', 'note', 'status', 'counselor_note', 'handled_by', 'handled_at', 'created_at'],
      transcripts.map((t) => [uid(`transcript:${t.key}`), t.who, t.to, t.method, t.address, t.by, t.note, t.status, t.counselor ?? '', t.status === 'sent' ? staff('garcia') : null,
        t.status === 'sent' ? at(sd(-3), '10:00') : null, at(sd(-6), '18:00')])),
  ];

  // ----------------------------------------------------------------------------
  // Remove (the order keeps foreign keys happy), then add.
  out.push('begin;');
  out.push(...toolsDrop());
  out.push(`delete from public.forms where id in ${inList(['zoo', 'retreat', 'pumpkins', 'handbook'].map((k) => uid(`form:${k}`)))};`);
  out.push(`delete from public.teacher_threads where id in ${inList([uid('thread:taylor'), uid('thread:me')])};`);
  out.push(`delete from public.assignments where id in ${inList(ids.assignments)} or (owner_id = ${lit(student)} and id = ${lit(uid('assignment:own'))});`);
  // The classes themselves stay through a refresh (so a tester's own place in one, and what they made in it, stays);
  // --remove takes them out.
  out.push(remove ? `delete from public.rosters where id in ${inList(ids.rosters)};`
    : `delete from public.roster_members where roster_id in ${inList(ids.rosters)} and profile_id in ${inList(ours)};`);
  out.push(`delete from public.sport_events where id in ${inList([...ids.events, uid('event:vb1'), uid('event:vb2')])};`);
  out.push(`delete from public.sports where id in ${inList(ids.sports)};`);
  // On the school's real activities: only the rows added here (sign-ups and the parent's follow).
  out.push(`delete from public.sport_registrations where id in ${inList(registrations.map(([s, st]) => regId(s, st)))};`);
  if (basketball) out.push(`delete from public.sport_follows where sport_id = ${lit(basketball)} and user_id = ${lit(me)};`);
  out.push(...volunteerDrop(!remove));
  out.push(...recordsDrop());
  out.push(`delete from public.market_listings where id in ${inList(ids.listings)};`);
  out.push(`delete from public.profiles where id in ${inList(ids.people)};`);
  if (remove) { out.push('commit;'); return out.join('\n'); }

  out.push(insert('profiles', ['id', 'first_name', 'last_name', 'school_role', 'grade', 'managed'],
    people.map((p) => [p.id, p.first, p.last, p.role, p.grade, true])));
  out.push(`update public.profiles set volunteer_lead = true where id = ${lit(staff('garcia'))};`);
  out.push(insert('guardians', ['guardian_id', 'student_id', 'relation'],
    FAMILIES.filter((f) => (f.set === 'a' ? older : younger)).map((f) => [parent(f.key), kid(f.key), f.relation])));
  if (student) out.push(`update public.profiles set school_role = 'student', grade = ${lit(older?.grade ?? 6)}, managed = false where id = ${lit(student)};`);
  if (senior) out.push(`update public.profiles set school_role = 'student', grade = 11, managed = false where id = ${lit(senior)};`);

  out.push(insert('rosters', ['id', 'kind', 'name', 'lead_id'], classes.map((c) => [c.id, 'section', c.name, c.lead]))
    .replace(/;$/, ' on conflict (id) do update set kind = excluded.kind, name = excluded.name, lead_id = excluded.lead_id;'));
  out.push(insert('roster_members', ['roster_id', 'profile_id'], classes.flatMap((c) => [[c.id, c.lead], ...c.kids.map((k) => [c.id, k])]))
    .replace(/;$/, ' on conflict do nothing;'));
  out.push(insert('assignments', ['id', 'roster_id', 'owner_id', 'title', 'details', 'due_on', 'created_at'],
    assignments.map((a) => [a.id, a.r, a.lead, a.title, a.details, a.due, at(sd(-3), '08:00')])));
  if (student) out.push(insert('assignment_done', ['assignment_id', 'student_id'], assignments.filter((a) => a.title.startsWith('Map of')).map((a) => [a.id, student])));

  for (const t of threads) {
    out.push(insert('teacher_threads', ['id', 'student_id', 'teacher_id', 'last_message_at', 'student_read_at', 'teacher_read_at', 'created_at'],
      [[t.id, student, t.teacher, t.messages.at(-1)[2], t.studentRead, t.teacherRead, t.messages[0][2]]]));
    out.push(insert('teacher_messages', ['id', 'thread_id', 'author_id', 'body', 'created_at'],
      t.messages.map(([a, body, when], i) => [uid(`message:${t.id}:${i}`), t.id, a, body, when])));
  }

  for (const f of forms) {
    const id = uid(`form:${f.key}`);
    out.push(insert('forms', ['id', 'author_id', 'title', 'details', 'link', 'due_on', 'audience', 'section_id', 'grades', 'questions', 'fee_cents', 'created_at'],
      [[id, f.author, f.title, f.details, f.link ?? null, f.due, f.audience, f.section ?? null, f.grades ?? null, { json: f.questions }, f.fee, at(sd(-2), '07:30')]]));
    out.push(insert('form_recipients', ['form_id', 'student_id'], [...new Set(f.to)].map((s) => [id, s])));
    out.push(insert('form_responses', ['form_id', 'student_id', 'signed_by', 'agreed', 'answers', 'signature', 'signed_at'],
      f.signed.filter((x) => f.to.includes(kid(x.f))).map((x) => {
        const fm = FAMILIES.find((y) => y.key === x.by);
        return [id, kid(x.f), parent(x.by), x.agreed, { json: x.answers }, `${fm.parent} ${fm.last}`, x.when];
      })));
    out.push(insert('form_payments', ['form_id', 'student_id', 'amount_cents', 'method', 'delivered_to', 'received_on', 'note', 'recorded_by'],
      f.paid.filter(([k]) => f.to.includes(kid(k))).map(([k, cents, method, where, on, note]) => [id, kid(k), cents, method, where, on, note, f.recorder])));
  }

  out.push(insert('sports', ['id', 'name', 'icon', 'description', 'category'], sports.map((s) => [s.id, s.name, s.icon, s.description, s.category])));
  out.push(insert('sport_coaches', ['sport_id', 'user_id'], sports.map((s) => [s.id, s.coach])));
  out.push(insert('sport_seasons', ['id', 'sport_id', 'name', 'starts_on', 'ends_on', 'signup_opens', 'signup_closes', 'min_grade', 'max_grade', 'details', 'signup_announced_at'],
    seasons.map((s) => [s.id, s.sport, s.name, s.starts, s.ends, addDays(day, -20), addDays(day, 10), s.min, s.max, s.details, at(addDays(day, -20), '08:00')])));
  out.push(insert('sport_registrations', ['id', 'season_id', 'student_id', 'requested_by', 'status', 'decided_by', 'decided_at'],
    registrations.map(([s, st, by, status]) => [regId(s, st), s, st, by, status,
      status === 'registered' ? sports.find((x) => uid(`season:${x.key}`) === s)?.coach ?? null : null, status === 'registered' ? at(sd(-5), '12:00') : null])));
  if (basketball) out.push(`insert into public.sport_follows (sport_id, user_id) values (${lit(basketball)}, ${lit(me)}) on conflict do nothing;`);
  out.push(insert('sport_events', ['id', 'season_id', 'kind', 'title', 'starts_at', 'ends_at', 'location', 'home', 'created_by'],
    events.map((e) => [e.id, e.season, e.kind, e.title, e.start, e.end, e.location, e.home, null])));

  out.push(...volunteerAdd());
  out.push(...recordsAdd());

  out.push(insert('market_listings', ['id', 'seller_id', 'title', 'description', 'price_cents', 'quantity', 'condition', 'created_at'],
    listings.map(([k, s, title, desc, cents, qty, cond], i) => [uid(`listing:${k}`), who(s), title, desc, cents, qty, cond, at(addDays(day, -1 - (i % 5)), `${8 + i}:15`)])));
  out.push(insert('market_responses', ['id', 'listing_id', 'buyer_id', 'kind', 'offer_cents', 'counter_cents', 'message', 'status', 'agreed_cents'], [
    [uid('response:jumper'), uid('listing:jumper'), parent('thompson'), 'dibs', null, null, 'Would love this for my daughter!', 'agreed', 1500],
    [uid('response:calculator'), uid('listing:calculator'), parent('bennett'), 'offer', 3500, 4000, 'Would you take $35?', 'countered', null],
    [uid('response:boots1'), uid('listing:boots'), parent('moore'), 'offer', 300, null, 'Could you do $3?', 'offered', null],
    [uid('response:boots2'), uid('listing:boots'), parent('adams'), 'dibs', null, null, null, 'agreed', 500],
  ]));
  out.push(...toolsAdd());
  out.push('commit;');
  return out.filter(Boolean).join('\n');
}

// ----------------------------------------------------------------------------
// Running it against the live project

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const parentEmail = flag('--parent');
  if (!parentEmail) {
    console.error('Usage: node scripts/presentation_data.mjs --parent <email> [--student <email>] [--teacher <email>] [--senior <email>] [--day YYYY-MM-DD] [--only volunteer|student] [--remove] [--print]');
    process.exit(1);
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN (a Supabase personal access token).'); process.exit(1); }
  // Kingdom Heights' presentation data, so always its project.
  const app = JSON.parse(readFileSync(new URL('../schools/khroyals/app.json', import.meta.url)));
  const ref = new URL(app.expo.extra.supabaseUrl).hostname.split('.')[0];
  const q = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${text}`);
    return JSON.parse(text);
  };

  const [today] = await q(`select app.school_today()::text as d`);
  let day = flag('--day') ?? today.d;
  while (weekend(day)) day = addDays(day, 1);
  const [me] = await q(`select id from auth.users where lower(email) = lower(${lit(parentEmail)})`);
  if (!me) throw new Error(`No account for ${parentEmail}.`);
  const children = await q(`select p.id, p.grade from public.guardians g join public.profiles p on p.id = g.student_id
    where g.guardian_id = ${lit(me.id)} and p.grade is not null order by p.grade desc limit 2`);
  if (!children.length) throw new Error(`${parentEmail} has no children with a grade.`);
  const studentEmail = flag('--student');
  const [student] = studentEmail ? await q(`select id from auth.users where lower(email) = lower(${lit(studentEmail)})`) : [];
  if (studentEmail && !student) console.warn(`No account for ${studentEmail} yet: sign in with it once in the app, then run this again. Going on without it.`);
  const account = async (opt) => {
    const email = flag(opt);
    if (!email) return null;
    const [a] = await q(`select id from auth.users where lower(email) = lower(${lit(email)})`);
    if (!a) console.warn(`No account for ${email} (${opt}) yet. Going on without it.`);
    return a?.id ?? null;
  };
  const teacher = await account('--teacher');
  const senior = await account('--senior');
  const [lunch] = await q(`select id from public.lunch_windows where active order by grade_from, start_time limit 1`);
  const [vb] = await q(`select se.id from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where s.name = 'Volleyball' and se.ends_on >= ${lit(day)} order by se.starts_on limit 1`);
  const [cheer] = await q(`select se.id from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where s.name = 'Royals Cheer' and se.ends_on >= ${lit(day)} order by se.starts_on limit 1`);
  const [basketball] = await q(`select id from public.sports where name = 'Basketball' and id <> ${lit(uid('sport:basketball'))}`);

  const sql = buildSql({ day, today: today.d, me: me.id, children, student: student?.id ?? null, volleyball: vb?.id ?? null,
    cheer: cheer?.id ?? null, basketball: basketball?.id ?? null, teacher, senior, lunch: lunch?.id ?? null,
    remove: args.includes('--remove'), only: flag('--only') ?? null });
  if (args.includes('--print')) { console.log(sql); return; }
  await q(sql);
  if (args.includes('--remove')) { console.log('Removed the presentation data.'); return; }
  if (flag('--only') === 'student') {
    const [r] = await q(`select (select count(*) from public.sis_students where source = 'sample') as students,
      (select count(*) from public.sis_courses c join public.sis_students t on t.student_id = c.student_id where t.source = 'sample') as classes,
      (select count(*) from public.sis_assignments a join public.sis_courses c on c.id = a.course_id join public.sis_students t on t.student_id = c.student_id
        where t.source = 'sample') as grades`);
    console.log(`Student records loaded: ${JSON.stringify(r)}`);
    return;
  }
  if (flag('--only') === 'volunteer') {
    const [v] = await q(`select (select count(*) from public.volunteer_events where status = 'open') as events,
      (select count(*) from public.volunteer_opportunities where status = 'open') as opportunities, (select count(*) from public.volunteer_signups) as signups,
      (select count(*) from public.volunteer_attendance) as shifts_marked`);
    console.log(`Volunteering refreshed for ${pretty(day)}: ${JSON.stringify(v)}`);
    return;
  }
  const [n] = await q(`select (select count(*) from public.profiles where id in ${inList([...STAFF.map((s) => staff(s.key)), ...FAMILIES.flatMap((f) => [parent(f.key), kid(f.key)]),
      ...HIGH.map((h) => kid(h.key))])}) as people,
    (select count(*) from public.section_meetings) as class_times, (select count(*) from public.help_sessions) as help_sessions,
    (select count(*) from public.folder_notes) as folder_notes, (select count(*) from public.daily_verses) as verses,
    (select count(*) from public.college_dates) as college_dates, (select count(*) from public.transcript_requests) as transcripts,
    (select count(*) from public.assignments where id::text like '%') as assignments,
    (select count(*) from public.forms) as forms, (select count(*) from public.market_listings where status = 'open') as listings,
    (select count(*) from public.sports) as activities, (select count(*) from public.volunteer_opportunities where status = 'open') as volunteer`);
  console.log(`Loaded for ${pretty(day)}${student ? ', with the student login' : ''}${senior ? ', with the senior' : ''}: ${JSON.stringify(n)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
