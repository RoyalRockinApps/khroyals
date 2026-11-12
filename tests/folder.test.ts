/** src/schoolForms/folderLists.ts: what stays in the Folder, and what's under Done & removed for 30 days. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FolderNote } from '../src/api/folderNotes';
import type { MyForm } from '../src/api/types';
import { coverLine } from '../src/schoolForms/coverLine';
import { pastForms, pastNotes } from '../src/schoolForms/folderLists';

const today = '2026-11-11';
const signed = (at: string) => ({ agreed: true, answers: {}, signature: 'Rosa Reyes', signedAt: at, signedBy: 'Rosa Reyes' });
const form = (id: string, o: Partial<MyForm> & { signedAt?: (string | null)[] } = {}): MyForm => ({
  id, title: id, details: '', link: null, dueOn: '2026-11-20', status: 'open', questions: [], audience: 'school', sentTo: null,
  author: null, authorId: null, createdAt: '2026-11-01T12:00:00Z', feeCents: null, removedAt: null,
  ...o,
  children: (o.signedAt ?? [null]).map((at, i) => ({ studentId: `k${i}`, name: `Kid ${i}`, response: at ? signed(at) : null, payment: null })),
});

test('the Folder keeps forms still to sign that are due and not removed', () => {
  const { inFolder, past } = pastForms([
    form('open'),
    form('half signed', { signedAt: ['2026-11-10T15:00:00Z', null] }),
    form('all signed', { signedAt: ['2026-11-10T15:00:00Z'] }),
    form('past due', { dueOn: '2026-11-10' }),
    form('closed', { status: 'closed' }),
    form('removed', { removedAt: '2026-11-09T15:00:00Z' }),
  ], today);
  assert.deepEqual(inFolder.map((f) => f.id), ['open', 'half signed']);
  assert.deepEqual(past.map((x) => [x.form.id, x.why, x.label, x.canPutBack]), [
    ['closed', 'expired', 'Closed by the school', false],
    ['all signed', 'signed', 'Signed Nov 10', false],
    ['past due', 'expired', 'Expired Nov 10', false],
    ['removed', 'removed', 'Removed Nov 9', true],
  ]);
});

test('Done & removed holds the last 30 days only', () => {
  const { past } = pastForms([
    form('a month ago', { signedAt: ['2026-10-12T15:00:00Z'] }),
    form('31 days ago', { signedAt: ['2026-10-11T15:00:00Z'] }),
    form('removed then expired', { dueOn: '2026-11-01', removedAt: '2026-10-20T15:00:00Z' }),
  ], today);
  assert.deepEqual(past.map((x) => [x.form.id, x.canPutBack]), [['removed then expired', false], ['a month ago', false]]);
});

const note = (id: string, sentAt: string, o: Partial<FolderNote> = {}): FolderNote => ({
  id, kind: 'bulletin', title: id, body: '', from: 'Jennifer Lee', sentAt, children: ['Ava'], classes: ['English 10'], readAt: null, removedAt: null, ...o,
});

test("teachers' notes and bulletins stay in the Folder for two weeks, or until removed", () => {
  const { inFolder, past } = pastNotes([
    note('today', '2026-11-11T15:00:00Z', { kind: 'note' }),
    note('13 days', '2026-10-29T15:00:00Z'),
    note('14 days', '2026-10-28T15:00:00Z'),
    note('removed', '2026-11-05T15:00:00Z', { removedAt: '2026-11-10T15:00:00Z' }),
    note('removed long ago', '2026-09-01T15:00:00Z', { removedAt: '2026-09-02T15:00:00Z' }),
  ], today);
  assert.deepEqual(inFolder.map((n) => n.id), ['today', '13 days']);
  assert.deepEqual(past.map((x) => [x.note.id, x.why, x.label, x.canPutBack]), [
    ['14 days', 'older', 'Sent Oct 28', false],
    ['removed', 'removed', 'Removed Nov 10', true],
  ]);
});

test("the closed folder's cover says what's inside", () => {
  assert.equal(coverLine(0, 0), 'Nothing new');
  assert.equal(coverLine(2, 0), '2 to sign');
  assert.equal(coverLine(1, 1), '1 to sign · 1 new note');
  assert.equal(coverLine(0, 3), '3 new notes');
});
