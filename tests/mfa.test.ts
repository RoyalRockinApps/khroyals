/** src/comms/mfa.ts: when a screen offers an admin tool and asks for the authenticator code in place. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayHave, needsCodeFor } from '../src/comms/mfa';
import type { Access } from '../src/api/types';

const access = (a: Partial<Access>): Access => ({
  tier: null, roleName: null, isDirector: false, granted: [], permissions: [], mfaRequired: false, mfaVerified: false, ...a,
});

test('verified admins have their tools; nobody is asked for a code again', () => {
  const a = access({ tier: 'administrator', permissions: ['push.send'], mfaRequired: true, mfaVerified: true });
  assert.ok(mayHave(a, 'push.send'));
  assert.ok(!needsCodeFor(a, 'push.send'));
  assert.ok(!mayHave(a, 'alerts.map'), 'a verified admin without the permission sees no way in');
});

test("before verifying, an admin role's tools ask for the code (its permissions only show after)", () => {
  const a = access({ tier: 'administrator', mfaRequired: true });
  assert.ok(needsCodeFor(a, 'questions.manage'));
  assert.ok(mayHave(a, 'questions.manage'));
});

test('a single granted permission asks for the code for that tool only', () => {
  const a = access({ granted: ['feedback.triage'], mfaRequired: true });
  assert.ok(needsCodeFor(a, 'feedback.triage'));
  assert.ok(!needsCodeFor(a, 'push.send'));
});

test('everyone else sees nothing', () => {
  assert.ok(!mayHave(null, 'push.send'));
  assert.ok(!mayHave(access({}), 'push.send'));
  assert.ok(!needsCodeFor(access({ mfaRequired: false, tier: 'administrator' }), 'push.send'), 'no code asked where the school turned it off');
});
