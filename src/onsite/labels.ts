/**
 * On-Site Attendance as the app shows it: who is on site (the card's groups and colors), the groups students are in,
 * how a student went home, why they're staying, and extended care's days. The dismissal keys match dismissals.how's
 * check in the database (tests/onsite.test.ts compares). No app imports, so tests run it.
 */
import type { OnSiteBucket, OnSiteToday } from '../api/onsite';
import type { DismissalHow, GoneHome, Staying } from '../api/types';
import { schoolMinutes } from '../calendar/past';
import { clock } from '../carline/time';

/** Who is on site, in the card's bar and key: one hue each, in this order (validated as a set, light surface). */
export const ON_SITE: { key: 'staff' | 'faculty' | 'visitors' | 'students'; label: string; color: string }[] = [
  { key: 'staff', label: 'Staff', color: '#2a78d6' },
  { key: 'faculty', label: 'Faculty', color: '#eb6834' },
  { key: 'visitors', label: 'Visitors', color: '#1baf7a' },
  { key: 'students', label: 'Students', color: '#eda100' },
];

/** How many of each are here now, and of how many expected (visitors: how many came today). */
export function onSiteParts(t: OnSiteToday) {
  return ON_SITE.map((g) => ({
    ...g,
    here: g.key === 'visitors' ? t.visitors.here : g.key === 'students' ? t.students.here : t[g.key].here,
    of: g.key === 'visitors' ? null : g.key === 'students' ? t.students.total : t[g.key].total,
  }));
}

/** The groups students are in, in the order the screen lists them; `todo` needs the office (after dismissal). */
export const STUDENT_GROUPS: { key: OnSiteBucket; label: string; todo?: boolean }[] = [
  { key: 'notHome', label: 'Not sent home yet', todo: true },
  { key: 'class', label: 'In class' },
  { key: 'activities', label: 'At activities' },
  { key: 'extendedCare', label: 'Extended care' },
  { key: 'unmarked', label: 'Not checked in' },
  { key: 'absent', label: 'Absent' },
  { key: 'home', label: 'Gone home' },
];
export const groupLabel = (key: OnSiteBucket) => STUDENT_GROUPS.find((g) => g.key === key)?.label ?? key;

/** Ways a teacher marks a student gone home at dismissal (the car line, the office and check-out lists record theirs). */
export const DISMISSAL_HOWS: { key: DismissalHow; label: string; icon: 'walk-outline' | 'car-outline' | 'bus-outline' | 'ellipsis-horizontal-circle-outline' }[] = [
  { key: 'walked', label: 'Walked', icon: 'walk-outline' },
  { key: 'drove', label: 'Drove', icon: 'car-outline' },
  { key: 'bus', label: 'Bus', icon: 'bus-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];
export const isTeacherMark = (h: GoneHome) => DISMISSAL_HOWS.some((x) => x.key === h.how);

/** How they went home, in a line: "Car line with Rosa Reyes · 3:12 PM", "Walked · 3:20 PM · marked by Jennifer Taylor". */
export function homeLine(h: GoneHome) {
  const where = h.how === 'carline' ? 'Car line' : h.how === 'office' ? 'Office check-out' : h.how === 'extended_care' ? 'Extended care'
    : h.how === 'list' ? h.title ?? 'Check-out list' : DISMISSAL_HOWS.find((x) => x.key === h.how)?.label ?? 'Gone home';
  return [h.person ? `${where} with ${h.person}` : where, clock(h.at), isTeacherMark(h) && h.by ? `marked by ${h.by}` : null]
    .filter(Boolean).join(' · ');
}

/** Why they're staying: "Extended care", "Robotics: Build night", "Basketball: at Westminster (away)". */
export const stayingLine = (st: Staying) => (st.away ? `${st.title} (away)` : st.title);

/** Has the school day ended (dismissal "HH:MM" on the school's clock)? */
export function afterDismissal(dismissal: string | undefined, now = new Date()) {
  if (!dismissal) return false;
  const [h, m] = dismissal.split(':').map(Number);
  return schoolMinutes(now) >= h * 60 + m;
}

/** Extended care's days: 1 Monday … 5 Friday. */
export const WEEKDAYS: { day: number; short: string; label: string }[] = [
  { day: 1, short: 'Mon', label: 'Monday' }, { day: 2, short: 'Tue', label: 'Tuesday' }, { day: 3, short: 'Wed', label: 'Wednesday' },
  { day: 4, short: 'Thu', label: 'Thursday' }, { day: 5, short: 'Fri', label: 'Friday' },
];
/** "Every school day", or "Mon, Wed, Fri". */
export const daysLine = (days: number[]) => (days.length >= 5 ? 'Every school day'
  : WEEKDAYS.filter((w) => days.includes(w.day)).map((w) => w.short).join(', '));

/** The card's heading: "On-Site Attendance - Thursday, November 5". */
export function onSiteTitle(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return `On-Site Attendance - ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
}
