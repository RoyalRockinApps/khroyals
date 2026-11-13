/**
 * The Study app's pure parts: flash cards from "term - meaning" lines (src/study/parse.ts), a study session's line of
 * cards (src/study/session.ts) and class names as subjects (src/study/subjects.ts). Who may read and write, and how
 * cards move through the boxes, is in tests/db.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOST_AT_ONCE, parseCards } from '../src/study/parse';
import { answer, finished, shuffle, startSession } from '../src/study/session';
import { subjectChoices, subjectColor, subjectName } from '../src/study/subjects';

test('cards from lines: a dash, colon, equals sign or tab splits the term from its meaning', () => {
  const text = [
    'Mitochondria - the powerhouse of the cell',
    '• la manzana: the apple',
    '3. Area of a circle = πr²',
    'Photosynthesis\thow plants make food from light',
    '- Nucleus – holds the DNA',
    'Battle of Hastings — 1066',
    '',
    'Plant cells have a cell wall; animal cells don\'t.',
    'School starts at 7:45',
    'See https://example.com/notes',
    'well-known - famous',
    ' - no term here',
  ].join('\n');
  assert.deepEqual(parseCards(text), [
    { front: 'Mitochondria', back: 'the powerhouse of the cell' },
    { front: 'la manzana', back: 'the apple' },
    { front: 'Area of a circle', back: 'πr²' },
    { front: 'Photosynthesis', back: 'how plants make food from light' },
    { front: 'Nucleus', back: 'holds the DNA' },
    { front: 'Battle of Hastings', back: '1066' },
    { front: 'well-known', back: 'famous' },
  ]);
  assert.equal(MOST_AT_ONCE, 200, 'study_cards_add takes up to 200 at a time');
  const long = parseCards(`${'x'.repeat(600)} - ${'y'.repeat(1200)}`)[0];
  assert.deepEqual([long.front.length, long.back.length], [500, 1000], 'as long as the database allows');
});

test('a study session: missed cards come round again until known; first-try answers are counted', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  let s = startSession(cards);
  s = answer(s, true);                       // a: known first time
  s = answer(s, false);                      // b: missed, to the back
  assert.deepEqual(s.queue.map((c) => c.id), ['c', 'b']);
  assert.equal(finished(s), 1);
  s = answer(s, true);                       // c: known first time
  s = answer(s, false);                      // b: missed again
  s = answer(s, true);                       // b: known at last
  assert.deepEqual([s.queue.length, finished(s), s.total], [0, 3, 3]);
  assert.deepEqual(s.firstTry, ['a', 'c']);
  assert.deepEqual(s.missed, ['b']);
  assert.equal(answer(s, true), s, 'nothing left to answer');
});

test('shuffling keeps every card once', () => {
  let n = 0;
  const random = () => [0.9, 0.1, 0.5, 0.3][n++ % 4];
  const out = shuffle([1, 2, 3, 4, 5], random);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
  assert.notDeepEqual(out, [1, 2, 3, 4, 5]);
});

test('class sections become subjects; each subject keeps its color', () => {
  assert.equal(subjectName('English 10 – Period 3'), 'English 10');
  assert.equal(subjectName('Chemistry - Block B'), 'Chemistry');
  assert.equal(subjectName('Algebra II (Period 2)'), 'Algebra II');
  assert.equal(subjectName('Spanish II'), 'Spanish II');
  assert.deepEqual(subjectChoices(['English 10 – Period 3', 'Biology', 'english 10', 'Algebra II (Period 2)', '']), ['Algebra II', 'Biology', 'English 10']);
  assert.equal(subjectColor('Biology'), subjectColor(' biology '));
  assert.match(subjectColor('Biology'), /^#[0-9A-F]{6}$/);
  assert.equal(subjectColor(''), '#64748B');
});
