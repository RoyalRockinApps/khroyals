/**
 * src/api/policy.ts teamAccess: who sees an activity's Board, Roster and Chat tabs, the same rule as app.on_team and
 * app.in_team_chat in the database (tests/db.test.ts checks those): its leaders; students registered for one of its
 * current seasons; their parents, never Family accounts. Students don't get the chat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamAccess } from '../src/api/policy';
import { isTab } from '../src/sports/team/tabs';
import type { Person, Sport, SportRegistration } from '../src/api/types';

const sport = { id: 'vb', name: 'Volleyball', icon: '🏐', description: '', category: 'sports', coachIds: ['coach'], photoPath: null, photo: '' } as Sport;
const person = (id: string, schoolRole: string) => ({ id, schoolRole, firstName: id, lastName: '', pending: false }) as unknown as Person;
const reg = (studentId: string, status: SportRegistration['status']) => ({ id: `r-${studentId}`, seasonId: 's1', studentId, status }) as SportRegistration;
const ava = person('ava', 'student');

test('the team: leaders, registered students and their parents; the chat leaves students out', () => {
  const registered = [reg('ava', 'registered')];
  assert.deepEqual(teamAccess(sport, null, person('coach', 'teacher'), [], []), { leader: true, onTeam: true, inChat: true });
  assert.deepEqual(teamAccess(sport, null, ava, registered, []), { leader: false, onTeam: true, inChat: false });
  assert.deepEqual(teamAccess(sport, null, person('rosa', 'parent'), registered, [ava]), { leader: false, onTeam: true, inChat: true });
  const manager = { permissions: ['sports.manage'] } as never;
  assert.equal(teamAccess(sport, manager, person('admin', 'admin'), [], []).leader, true, 'activity managers lead every activity');
});

test('not on the team: a sign-up still waiting, other families, Family accounts, a coach of another activity', () => {
  const none = { leader: false, onTeam: false, inChat: false };
  assert.deepEqual(teamAccess(sport, null, person('rosa', 'parent'), [reg('ava', 'pending')], [ava]), none);
  assert.deepEqual(teamAccess(sport, null, person('priya', 'parent'), [reg('ava', 'registered')], [person('emma', 'student')]), none);
  assert.deepEqual(teamAccess(sport, null, person('june', 'family'), [reg('ava', 'registered')], [ava]), none);
  assert.deepEqual(teamAccess(sport, null, person('other', 'teacher'), [], []), none);
});

test('a notification opens a tab by name; anything else opens Home', () => {
  assert.ok(isTab('board') && isTab('chat') && isTab('photos'));
  assert.ok(!isTab('settings') && !isTab(undefined));
});
