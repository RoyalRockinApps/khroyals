/**
 * Volunteer invites, in words: where an opportunity's invites stand for its leader (on its card and page), and
 * where one person's stands. No app imports, so tests run it.
 */
import type { Signup, VolunteerAttendance, VolunteerInvite } from '../api/types';

export type Tone = 'wait' | 'yes' | 'no';

/** "Wei C.", "Wei C. and Dana B.", "3 people". */
function who(ids: string[], name: (id: string) => string) {
  return ids.length <= 2 ? ids.map(name).join(' and ') : `${ids.length} people`;
}

/**
 * The leader's one line about an opportunity's invites: who it's waiting on, else the latest no (when nobody has
 * said yes, so they need to ask someone else), else who said yes. Null with no invites.
 */
export function inviteSummary(invites: VolunteerInvite[], signups: Signup[], name: (id: string) => string): { text: string; tone: Tone } | null {
  const live = invites.filter((i) => i.status !== 'cancelled');
  if (!live.length) return null;
  const pending = live.filter((i) => i.status === 'pending').map((i) => i.userId);
  if (pending.length) return { text: `Waiting on ${who(pending, name)}`, tone: 'wait' };
  const yes = live.filter((i) => i.status === 'accepted').map((i) => i.userId);
  if (!signups.length) {
    const no = live.filter((i) => i.status === 'declined').sort((a, b) => (b.answeredAt ?? '').localeCompare(a.answeredAt ?? ''));
    if (no.length) return { text: `${name(no[0].userId)} said no · invite someone else`, tone: 'no' };
  }
  return yes.length ? { text: `${who(yes, name)} said yes`, tone: 'yes' } : null;
}

/**
 * Where one invited person stands, for the leader to follow: waiting, said no, called off, or (once they said yes)
 * today's check-in: checked in, done, a no-show, or coming.
 */
export function inviteState(i: VolunteerInvite, today: VolunteerAttendance | undefined): { label: string; tone: Tone } {
  switch (i.status) {
    case 'pending': return { label: 'Waiting for an answer', tone: 'wait' };
    case 'declined': return { label: 'Said no', tone: 'no' };
    case 'cancelled': return { label: 'Called off', tone: 'no' };
    default:
      if (today?.status === 'here') return { label: 'Said yes · checked in', tone: 'yes' };
      if (today?.status === 'done') return { label: 'Said yes · done today', tone: 'yes' };
      if (today?.status === 'no_show') return { label: 'Said yes · didn’t come', tone: 'no' };
      return { label: 'Said yes', tone: 'yes' };
  }
}

/** How many more people can be invited: the spots left after volunteers and waiting invites (null: no limit). */
export function inviteRoom(spots: number | null, signups: Signup[], invites: VolunteerInvite[]): number | null {
  if (spots == null) return null;
  const waiting = invites.filter((i) => i.status === 'pending' && !signups.some((s) => s.userId === i.userId)).length;
  return Math.max(0, spots - signups.length - waiting);
}
