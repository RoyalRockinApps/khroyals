/**
 * "Needs you today" on a teacher's or staff member's Planner: what staff_today counted, as rows that each open the
 * screen to deal with it. Things to do come first, then heads-ups (a sub has your class, lunch visitors). Only counts
 * above zero show; with none, the Planner leaves the card out. No app imports, so tests run it.
 */
import type { StaffToday } from '../api/types';

export type NeedRow = {
  key: keyof StaffToday; icon: string; title: string; href: string;
  /** To do (amber) or just so they know (blue). */
  tone: 'todo' | 'info';
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ROWS: { key: keyof StaffToday; icon: string; tone: NeedRow['tone']; href: string; title: (n: number) => string }[] = [
  { key: 'roll', icon: 'clipboard-outline', tone: 'todo', href: '/attendance', title: (n) => `Take roll for ${n === 1 ? 'your class' : `${n} classes`}` },
  { key: 'absencesToSee', icon: 'bed-outline', tone: 'todo', href: '/forms/excused-absence', title: (n) => `${plural(n, 'absence report')} to mark seen` },
  { key: 'questionsAssigned', icon: 'help-circle-outline', tone: 'todo', href: '/questions', title: (n) => `${plural(n, 'question')} waiting for your answer` },
  { key: 'questionsToRoute', icon: 'git-branch-outline', tone: 'todo', href: '/questions', title: (n) => `${plural(n, 'question')} to route` },
  { key: 'accountsWaiting', icon: 'person-add-outline', tone: 'todo', href: '/admin', title: (n) => `${plural(n, 'account')} waiting for approval` },
  { key: 'familyRequests', icon: 'people-outline', tone: 'todo', href: '/admin', title: (n) => `${plural(n, 'family request')} to review` },
  { key: 'feedbackNew', icon: 'chatbubble-ellipses-outline', tone: 'todo', href: '/feedback', title: (n) => `${plural(n, 'new feedback report')} to look at` },
  { key: 'volunteerToMark', icon: 'hand-left-outline', tone: 'todo', href: '/volunteer', title: (n) => `${plural(n, 'volunteer shift')} to mark` },
  { key: 'absencesToday', icon: 'bed-outline', tone: 'info', href: '/forms/excused-absence',
    title: (n) => `${n === 1 ? '1 student' : `${n} students`} of yours reported out today` },
  { key: 'subCovering', icon: 'swap-horizontal-outline', tone: 'info', href: '/subs',
    title: (n) => `A sub has ${n === 1 ? 'your class' : `${n} of your classes`} today` },
  { key: 'lunchVisitors', icon: 'restaurant-outline', tone: 'info', href: '/lunch', title: (n) => `${plural(n, 'lunch visitor')} today` },
];

/** The rows to show, in order: to-dos first, then heads-ups. */
export function needsYou(t: StaffToday): NeedRow[] {
  return ROWS.filter((r) => (t[r.key] ?? 0) > 0)
    .map((r) => ({ key: r.key, icon: r.icon, tone: r.tone, href: r.href, title: r.title(t[r.key]!) }));
}
