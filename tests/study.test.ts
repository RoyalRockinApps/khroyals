/**
 * The Study app's pure parts: flash cards from "term - meaning" lines (src/study/parse.ts) and from text and CSV files
 * (src/study/cardFile.ts), a study session's line of
 * cards (src/study/session.ts) and class names as subjects (src/study/subjects.ts). Who may read and write, and how
 * cards move through the boxes, is in tests/db.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOST_AT_ONCE, parseCards } from '../src/study/parse';
import { cardListFromFile, csvRows } from '../src/study/cardFile';
import { PRACTICE_MAX, checkTyped, choicesFor, editDistance, matchRounds, modesFor, normalize, practiceCards, scoreLine } from '../src/study/practice';
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

test('a tab splits first, so a term may hold a dash or a colon', () => {
  assert.deepEqual(parseCards('Pre-war - 1939\tbefore the war\nRatio: 3:1\tthree to one'), [
    { front: 'Pre-war - 1939', back: 'before the war' },
    { front: 'Ratio: 3:1', back: 'three to one' },
  ]);
});

test('cards from a CSV file: first two columns, quoted cells, a header row skipped', () => {
  const csv = '\uFEFFTerm,Definition\r\n"la manzana","the apple"\r\nCell wall,"stiff layer, outside the membrane"\r\n'
    + '"He said ""hi""","a quote"\r\nPhotosynthesis,"how plants\nmake food",extra column\r\nlonely\r\n,no term\r\n';
  const text = cardListFromFile('Biology vocab.csv', csv);
  assert.deepEqual(parseCards(text), [
    { front: 'la manzana', back: 'the apple' },
    { front: 'Cell wall', back: 'stiff layer, outside the membrane' },
    { front: 'He said "hi"', back: 'a quote' },
    { front: 'Photosynthesis', back: 'how plants make food' },
  ]);
  // A semicolon-separated CSV (some spreadsheets), and a tab-separated file.
  assert.deepEqual(parseCards(cardListFromFile('words.csv', 'perro;dog\ngato;cat')), [{ front: 'perro', back: 'dog' }, { front: 'gato', back: 'cat' }]);
  assert.deepEqual(parseCards(cardListFromFile('words.tsv', 'English\tSpanish\nthe dog\tel perro')), [{ front: 'the dog', back: 'el perro' }]);
  assert.deepEqual(csvRows('a,"b\nc"\nd,e'), [['a', 'b\nc'], ['d', 'e']]);
});

test('cards from a text file: its lines as they are, a Quizlet export too', () => {
  const quizlet = 'Mitochondria\tthe powerhouse of the cell\r\nNucleus\tholds the DNA\r\n';
  assert.deepEqual(parseCards(cardListFromFile('Quizlet export.txt', quizlet)), [
    { front: 'Mitochondria', back: 'the powerhouse of the cell' },
    { front: 'Nucleus', back: 'holds the DNA' },
  ]);
  assert.equal(cardListFromFile('list.TXT', '\uFEFF1. la leche - the milk\n'), '1. la leche - the milk');
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

/** A fixed "random" for repeatable shuffles. */
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const deck = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `term ${i}`, back: `meaning ${i}` }));

test('practice: a quiz has the right answer and up to three others from the deck, never the same text twice', () => {
  const cards = [...deck(6), { id: 'dup', front: 'term x', back: 'Meaning 1' }];
  for (let k = 1; k < 20; k++) {
    const choices = choicesFor(cards[1], cards, 'term', seeded(k));
    assert.ok(choices.includes('meaning 1'));
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices.map(normalize)).size, 4, 'no two the same');
  }
  assert.deepEqual(choicesFor(cards[0], cards.slice(0, 2), 'meaning', seeded()).sort(), ['term 0', 'term 1'], 'a small deck has fewer');
  assert.deepEqual(modesFor(deck(1)), ['type'], 'one card: only Type it');
  assert.deepEqual(modesFor([{ id: 'a', front: 'x', back: 'y' }, { id: 'b', front: 'X', back: 'y' }]), ['type'], 'nothing to tell apart');
  assert.deepEqual(modesFor(deck(2)), ['quiz', 'match', 'type']);
  assert.deepEqual(modesFor([]), []);
  assert.equal(practiceCards(deck(30), seeded()).length, PRACTICE_MAX);
});

test('practice: matching goes six pairs at a time, every card once, no tiny last round', () => {
  assert.deepEqual(matchRounds(deck(14), seeded()).map((r) => r.length), [6, 8]);
  assert.deepEqual(matchRounds(deck(15), seeded()).map((r) => r.length), [6, 6, 3]);
  assert.deepEqual(matchRounds(deck(4), seeded()).map((r) => r.length), [4]);
  assert.equal(new Set(matchRounds(deck(14), seeded()).flat().map((c) => c.id)).size, 14);
});

test('practice: typed answers forgive case, accents, punctuation, a leading article and a small typo', () => {
  assert.equal(checkTyped('The Apple!', 'apple'), 'right');
  assert.equal(checkTyped('manzana', 'la manzana'), 'wrong', 'Spanish articles are part of the answer');
  assert.equal(checkTyped('cafe', 'café'), 'right');
  assert.equal(checkTyped('to run', 'run'), 'right');
  assert.equal(checkTyped('mitocondria', 'mitochondria'), 'almost');
  assert.equal(checkTyped('photosinthesis', 'photosynthesis'), 'almost');
  assert.equal(checkTyped('cat', 'car'), 'wrong', 'short words must be exact');
  assert.equal(checkTyped('red', 'rojo; red'), 'right', 'any one of several parts');
  assert.equal(checkTyped('large', 'big / large'), 'right');
  assert.equal(checkTyped('   ', 'apple'), 'wrong');
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(scoreLine(8, 10), '8 of 10 right · 80%');
});
