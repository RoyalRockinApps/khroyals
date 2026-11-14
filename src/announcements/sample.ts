/**
 * The Announcements app's demo data (builds without the school server): a few sent and scheduled ones kept in memory.
 * A splash page sent in the demo shows the next time the app opens (or comes back), until it's closed. Gone on a reload.
 */
import type { Announcement, Audience } from '../api/types';
import { schoolToday } from '../calendar/past';

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
const day = (n: number) => new Date(Date.parse(`${schoolToday()}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
let seq = 0;
const blank = {
  audience: null, urgent: false, link: null, push: true, reach: null, cancelledAt: null, splash: false, splashImage: null, splashImageUrl: '',
  splashTemplate: null, splashPhoto: null, splashPhotoUrl: '', splashHeadline: '', splashText: '', splashButton: '', splashStartsOn: null,
  splashEndsOn: null, sender: 'Maria Lopez', opened: 0, seen: 0, closed: 0, tapped: 0,
};

let list: Announcement[] | null = null;
const closed = new Set<string>();

function data() {
  list ??= [
    { ...blank, id: 'demo-ann-1', title: 'Spirit Week starts Monday', body: 'Dress-up days are on the calendar. Have fun with it!', audienceLabel: 'Everyone',
      link: '/calendar', sendAt: ago(20), sentAt: ago(20), reach: 412, opened: 233, createdAt: ago(20), splash: true, splashTemplate: 'confetti',
      splashHeadline: 'Spirit Week!', splashText: 'Monday is Pajama Day. See every day on the calendar.', splashButton: 'See the days',
      splashStartsOn: day(-1), splashEndsOn: day(-1), seen: 371, closed: 365, tapped: 88 },
    { ...blank, id: 'demo-ann-2', title: 'Book fair this week', body: 'The library opens for the book fair at 7:30 every morning.',
      audienceLabel: 'Parents · K4, Kindergarten, 1st', sendAt: ago(52), sentAt: ago(52), reach: 140, opened: 61, createdAt: ago(52) },
    { ...blank, id: 'demo-ann-3', title: 'Early dismissal Wednesday', body: 'School lets out at 12:00 for teacher meetings.',
      audienceLabel: 'Parents', urgent: true, sendAt: new Date(Date.now() + 18 * 3600_000).toISOString(), sentAt: null, createdAt: ago(1) },
  ];
  return list;
}

export const sampleAnnouncements = () => [...data()].sort((a, b) => b.sendAt.localeCompare(a.sendAt));
export const sampleAnnouncement = (id: string) => data().find((a) => a.id === id) ?? null;

export function sampleSend(a: Omit<Announcement, 'id' | 'createdAt' | 'sentAt' | 'reach' | 'cancelledAt'>, reach: number) {
  const now = new Date().toISOString();
  const later = a.sendAt > now;
  const made = { ...a, id: `demo-ann-new-${++seq}`, createdAt: now, sentAt: later ? null : now, reach: later ? null : reach, cancelledAt: null,
    opened: 0, seen: 0, closed: 0, tapped: 0, sender: 'You' };
  data().push(made);
  return made.id;
}

export function sampleCancel(id: string) {
  const a = data().find((x) => x.id === id);
  if (a) a.cancelledAt = new Date().toISOString();
}

/** A rough count for the demo (no real accounts behind it). */
export function sampleReach(a: Audience) {
  switch (a.kind) {
    case 'everyone': return 412;
    case 'roles': return a.roles.length * 96;
    case 'grades': return a.grades.length * ((a.parents ? 22 : 0) + (a.students ? 14 : 0));
    case 'academies': return a.academies.length * ((a.parents ? 80 : 0) + (a.students ? 55 : 0));
    case 'classes': return a.boards.length * ((a.parents ? 20 : 0) + (a.students ? 14 : 0));
    case 'group': return 18;
    case 'people': return a.people.length;
  }
}

/** The demo's splash page to show: one sent this session, showing today, not closed. */
export function sampleSplash() {
  const today = schoolToday();
  return data().find((a) => a.splash && a.sentAt && !a.cancelledAt && !closed.has(a.id) && a.id.startsWith('demo-ann-new')
    && (a.splashStartsOn ?? '') <= today && today <= (a.splashEndsOn ?? '')) ?? null;
}

export function sampleMark(id: string, action: 'seen' | 'closed' | 'tapped') {
  const a = data().find((x) => x.id === id);
  if (!a) return;
  if (action === 'seen') a.seen = (a.seen ?? 0) + 1;
  else { closed.add(id); a.closed = (a.closed ?? 0) + 1; if (action === 'tapped') a.tapped = (a.tapped ?? 0) + 1; }
}
