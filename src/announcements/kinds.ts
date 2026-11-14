/**
 * The Announcements app's choices: who it's for, which screen tapping it opens, and the splash page templates. The
 * kinds, templates and links are also the database's checks (tests/announcements.test.ts compares). No app imports,
 * so tests run it.
 */
import type { Audience } from '../api/types';
import { gradeLabel } from '../comms/grades';

export const KINDS: { key: Audience['kind']; label: string }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'roles', label: 'Roles' },
  { key: 'grades', label: 'Grades' },
  { key: 'academies', label: 'Academies' },
  { key: 'classes', label: 'Classes' },
  { key: 'group', label: 'A group' },
  { key: 'people', label: 'People' },
];

export const ROLE_CHOICES: { key: string; label: string }[] = [
  { key: 'parent', label: 'Parents' }, { key: 'student', label: 'Students' }, { key: 'teacher', label: 'Teachers' },
  { key: 'staff', label: 'Staff' }, { key: 'admin', label: 'Administrators' }, { key: 'family', label: 'Family' },
  { key: 'substitute', label: 'Substitutes' },
];

/** A fresh audience of a kind. */
export function blankAudience(kind: Audience['kind']): Audience {
  switch (kind) {
    case 'everyone': return { kind };
    case 'roles': return { kind, roles: ['parent'] };
    case 'grades': return { kind, grades: [], parents: true, students: false };
    case 'academies': return { kind, academies: [], parents: true, students: false };
    case 'classes': return { kind, boards: [], parents: true, students: false };
    case 'group': return { kind, group: '' };
    case 'people': return { kind, people: [] };
  }
}

/** What's missing before it can be sent (the database says the same), or null. */
export function audienceProblem(a: Audience): string | null {
  switch (a.kind) {
    case 'roles': return a.roles.length ? null : 'Pick at least one role.';
    case 'grades': return !a.grades.length ? 'Pick at least one grade.' : who(a) ? null : 'Send it to their parents, the students, or both.';
    case 'academies': return !a.academies.length ? 'Pick at least one academy.' : who(a) ? null : 'Send it to their parents, the students, or both.';
    case 'classes': return !a.boards.length ? 'Pick at least one class.' : who(a) ? null : 'Send it to their parents, the students, or both.';
    case 'group': return a.group ? null : 'Pick a group.';
    case 'people': return a.people.length ? null : 'Pick at least one person.';
    default: return null;
  }
}

function who(a: { parents: boolean; students: boolean }) {
  return a.parents && a.students ? 'Parents and students' : a.parents ? 'Parents' : a.students ? 'Students' : '';
}

const some = (names: string[]) => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`);

/** "Parents · 8th, 9th": who it went to, for the history (names from the app's lists). */
export function audienceLabel(a: Audience, names: Record<string, string> = {}): string {
  const named = (ids: string[]) => some(ids.map((x) => names[x] ?? '…'));
  switch (a.kind) {
    case 'everyone': return 'Everyone';
    case 'roles': return some(a.roles.map((r) => ROLE_CHOICES.find((x) => x.key === r)?.label ?? r));
    case 'grades': return `${who(a)} · ${some([...a.grades].sort((x, y) => x - y).map((g) => gradeLabel(g)))}`;
    case 'academies': return `${who(a)} · ${named(a.academies)}`;
    case 'classes': return `${who(a)} · ${named(a.boards)}`;
    case 'group': return `Group · ${names[a.group] ?? '…'}`;
    case 'people': return named(a.people);
  }
}

/** Screens tapping an announcement (or its splash page's button) can open; none opens the announcement itself. */
export const DESTINATIONS: { path: string; label: string }[] = [
  { path: '/calendar', label: 'Calendar' }, { path: '/royal-news', label: 'Newsletter' }, { path: '/news', label: 'News' },
  { path: '/photos', label: 'Photos' }, { path: '/activities', label: 'Activities' }, { path: '/volunteer', label: 'Volunteer' },
  { path: '/lunch', label: 'Lunch Visits' }, { path: '/connect', label: 'Boards' }, { path: '/forms', label: 'Forms' },
  { path: '/carline', label: 'Car Line' }, { path: '/handbook', label: 'Handbook' }, { path: '/questions', label: 'Ask the School' },
  { path: '/market', label: 'Marketplace' }, { path: '/feedback', label: 'Feedback' },
];

/** The splash page templates: a background, its words' color and the button's. */
export const TEMPLATES = {
  navy: { label: 'Navy', background: '#0E2457', ink: '#FFFFFF', accent: '#E3B23C', buttonInk: '#0E2457' },
  gold: { label: 'Gold', background: '#E3B23C', ink: '#0E2457', accent: '#0E2457', buttonInk: '#FFFFFF' },
  red: { label: 'Red', background: '#B3261E', ink: '#FFFFFF', accent: '#FFFFFF', buttonInk: '#B3261E' },
  confetti: { label: 'Confetti', background: '#FFFDF7', ink: '#0E2457', accent: '#0E2457', buttonInk: '#FFFFFF' },
} as const;
export type Template = keyof typeof TEMPLATES;
export const templateOf = (t: string | null) => TEMPLATES[(t && t in TEMPLATES ? t : 'navy') as Template];
