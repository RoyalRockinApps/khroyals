/**
 * The Announcements app's choices: who it's for, which screen tapping it opens, the splash page templates, the quick
 * starts on its history screen and the composer's one-line summary. The kinds, templates and links are also the
 * database's checks (tests/announcements.test.ts compares). No app imports, so tests run it.
 */
import type { Audience } from '../api/types';
import { gradeLabel } from '../comms/grades';

/** `more`: folded under More in the picker until opened (or picked). */
export const KINDS: { key: Audience['kind']; label: string; more?: true }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'roles', label: 'Roles' },
  { key: 'grades', label: 'Grades' },
  { key: 'classes', label: 'Classes' },
  { key: 'academies', label: 'Academies', more: true },
  { key: 'group', label: 'A group', more: true },
  { key: 'people', label: 'People', more: true },
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

/**
 * Screens tapping an announcement (or its splash page's button) can open, with their icons (Ionicons names) for the
 * composer's grid; none opens the announcement itself.
 */
export const DESTINATIONS: { path: string; label: string; icon: string }[] = [
  { path: '/calendar', label: 'Calendar', icon: 'calendar' }, { path: '/royal-news', label: 'Newsletter', icon: 'newspaper' },
  { path: '/news', label: 'News', icon: 'reader' }, { path: '/photos', label: 'Photos', icon: 'images' },
  { path: '/activities', label: 'Activities', icon: 'basketball' }, { path: '/volunteer', label: 'Volunteer', icon: 'hand-left' },
  { path: '/lunch', label: 'Lunch Visits', icon: 'restaurant' }, { path: '/connect', label: 'Boards', icon: 'pin' },
  { path: '/forms', label: 'Folder', icon: 'folder-open' }, { path: '/carline', label: 'Car Line', icon: 'car' },
  { path: '/handbook', label: 'Handbook', icon: 'book' }, { path: '/questions', label: 'Ask the School', icon: 'help-circle' },
  { path: '/market', label: 'Marketplace', icon: 'pricetags' }, { path: '/feedback', label: 'Feedback', icon: 'chatbubble-ellipses' },
];

/**
 * An uploaded splash page is a picture (JPEG), an animated GIF or a video (.mp4, played silently on a loop with a sound
 * button). Which one, from its file name or link (the storage path, a signed link, or a demo build's data link). The
 * storage bucket takes these three only, up to SPLASH_MAX_MB (supabase/migrations/…_announcement_media.sql).
 */
export type SplashMedia = 'image' | 'gif' | 'video';
export const SPLASH_MAX_MB = 25;
export function splashMediaOf(file: string | null | undefined): SplashMedia {
  if (!file) return 'image';
  const hint = /#media=(video|gif)$/.exec(file);   // a demo build's own link (uploadAnnouncementMedia)
  if (hint) return hint[1] as SplashMedia;
  const data = /^data:([^;,]+)/.exec(file);
  if (data) return data[1] === 'video/mp4' ? 'video' : data[1] === 'image/gif' ? 'gif' : 'image';
  const name = file.split(/[?#]/)[0].toLowerCase();
  return name.endsWith('.mp4') ? 'video' : name.endsWith('.gif') ? 'gif' : 'image';
}

/** The splash page templates: a background, its words' color and the button's. */
export const TEMPLATES = {
  navy: { label: 'Navy', background: '#0E2457', ink: '#FFFFFF', accent: '#E3B23C', buttonInk: '#0E2457' },
  gold: { label: 'Gold', background: '#E3B23C', ink: '#0E2457', accent: '#0E2457', buttonInk: '#FFFFFF' },
  red: { label: 'Red', background: '#B3261E', ink: '#FFFFFF', accent: '#FFFFFF', buttonInk: '#B3261E' },
  confetti: { label: 'Confetti', background: '#FFFDF7', ink: '#0E2457', accent: '#0E2457', buttonInk: '#FFFFFF' },
} as const;
export type Template = keyof typeof TEMPLATES;
export const templateOf = (t: string | null) => TEMPLATES[(t && t in TEMPLATES ? t : 'navy') as Template];

/**
 * The history screen's quick starts: a title, message and (for some) a splash page and audience to edit. The parts in
 * [brackets] are blanks: the composer won't send while any are left (`blanksLeft`).
 */
export type QuickStart = {
  key: string; label: string; icon: string; title: string; body: string; audience?: Audience; link?: string;
  splash?: { template: Template; headline: string; text: string; button: string };
};
export const QUICK_STARTS: QuickStart[] = [
  { key: 'dismissal', label: 'Early dismissal', icon: 'time-outline', title: 'Early dismissal [day]',
    body: 'School lets out at [time] on [day] for [reason]. The car line opens 15 minutes before.',
    audience: { kind: 'roles', roles: ['parent', 'teacher', 'staff'] }, link: '/carline' },
  { key: 'reminder', label: 'Reminder', icon: 'notifications-outline', title: 'Reminder: [what]', body: '[What to remember, and when.]' },
  { key: 'event', label: 'Event', icon: 'calendar-outline', title: '[Event] on [day]', body: 'Join us [when] at [where]. [What to bring or know.]',
    link: '/calendar', splash: { template: 'navy', headline: '[Event]', text: '[Day, time and place.]', button: 'See the calendar' } },
  { key: 'celebration', label: 'Celebration', icon: 'sparkles-outline', title: '[Good news]', body: '[What we’re celebrating.]',
    splash: { template: 'confetti', headline: 'Congratulations!', text: '[What we’re celebrating.]', button: '' } },
];

/** Whether any of these still has a [blank] from a quick start in it. */
export const blanksLeft = (...texts: string[]) => texts.some((t) => /\[[^\]]*\]/.test(t));

/** "Today", "Tomorrow" or "Tue, Nov 18": a school day (YYYY-MM-DD) next to today. */
export function dayWord(day: string, today: string) {
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === next) return 'Tomorrow';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The composer's Send bar: "Notification and splash page to 412 people, now". `when` is null for now. */
export function sendSummary(o: { push: boolean; splash: boolean; urgent: boolean; reach: number | null; when: string | null }) {
  const what = [o.push && (o.urgent ? 'urgent notification' : 'notification'), o.splash && 'splash page'].filter(Boolean).join(' and ');
  const who = o.reach == null ? '' : ` to ${o.reach} ${o.reach === 1 ? 'person' : 'people'}`;
  return `${what ? what[0].toUpperCase() + what.slice(1) : 'Nothing yet'}${who}, ${o.when ?? 'now'}`;
}
