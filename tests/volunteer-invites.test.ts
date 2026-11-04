/** src/volunteer/invites.ts: where an opportunity's invites stand, in words. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteRoom, inviteState, inviteSummary } from '../src/volunteer/invites';
import type { Signup, VolunteerInvite } from '../src/api/types';

const NAMES: Record<string, string> = { wei: 'Wei C.', dana: 'Dana B.', sun: 'Sun K.' };
const name = (id: string) => NAMES[id] ?? 'Someone';
const invite = (userId: string, status: VolunteerInvite['status'], answeredAt: string | null = null): VolunteerInvite =>
  ({ opportunityId: 'o', userId, invitedBy: 'luis', status, note: null, createdAt: '2026-11-04T10:00:00Z', answeredAt });
const signup = (userId: string): Signup => ({ opportunityId: 'o', userId, createdAt: '', quantity: null });

test('the leader sees who an opportunity is waiting on first', () => {
  assert.equal(inviteSummary([], [], name), null);
  assert.deepEqual(inviteSummary([invite('wei', 'pending')], [], name), { text: 'Waiting on Wei C.', tone: 'wait' });
  assert.deepEqual(inviteSummary([invite('wei', 'pending'), invite('dana', 'pending'), invite('sun', 'pending')], [], name),
    { text: 'Waiting on 3 people', tone: 'wait' });
  assert.equal(inviteSummary([invite('wei', 'cancelled')], [], name), null, 'called-off invites are left out');
});

test('a no with nobody signed up asks the leader to invite someone else; then who said yes', () => {
  assert.deepEqual(inviteSummary([invite('wei', 'declined', '2026-11-04T11:00:00Z'), invite('dana', 'declined', '2026-11-04T12:00:00Z')], [], name),
    { text: 'Dana B. said no · invite someone else', tone: 'no' });
  assert.deepEqual(inviteSummary([invite('wei', 'declined'), invite('dana', 'accepted')], [signup('dana')], name),
    { text: 'Dana B. said yes', tone: 'yes' });
});

test("an invited person's progress follows their check-in once they said yes", () => {
  assert.equal(inviteState(invite('wei', 'pending'), undefined).label, 'Waiting for an answer');
  assert.equal(inviteState(invite('wei', 'declined'), undefined).tone, 'no');
  const day = (status: 'here' | 'done' | 'no_show') =>
    ({ opportunityId: 'o', userId: 'dana', day: '2026-11-04', status, checkedInAt: null, checkedOutAt: null, minutes: null, markedBy: null });
  assert.equal(inviteState(invite('dana', 'accepted'), undefined).label, 'Said yes');
  assert.equal(inviteState(invite('dana', 'accepted'), day('here')).label, 'Said yes · checked in');
  assert.equal(inviteState(invite('dana', 'accepted'), day('done')).label, 'Said yes · done today');
  assert.equal(inviteState(invite('dana', 'accepted'), day('no_show')).tone, 'no');
});

test('invites can fill the spots that volunteers and waiting invites leave', () => {
  assert.equal(inviteRoom(null, [], []), null);
  assert.equal(inviteRoom(3, [signup('dana')], [invite('wei', 'pending'), invite('sun', 'declined')]), 1);
  assert.equal(inviteRoom(1, [signup('dana')], [invite('dana', 'accepted')]), 0);
});
