/**
 * src/handbook/handbook.ts: the Handbook reader's pages, paragraphs, sections and search. The rules are tested on a
 * small made-up handbook; the school's real one is only checked against its outline, so a new edition of the PDF
 * (different pages, wording, page count) fails here only where the outline needs updating, and says how.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDBOOK_OUTLINE } from '@school/handbookOutline';
import { PAGES, SECTIONS, edition, hits, loose, outlineReport, parsePages, toBlocks, toSections, type HandbookOutline } from '../src/handbook/handbook';

/** A made-up handbook: a cover, a contents page, and two pages of text with the part's banner on top. */
const SAMPLE = parsePages([
  '[Page 1]', 'Student / Parent', 'Handbook', '2027-2028', 'Family Handbook Version 2.1', 'Modified August 2, 2027', '',
  '[Page 2]', 'Table of', 'Contents', 'Daily Life', 'Arrival 3', 'Lunch 3', 'Recess 4', 'Field Days 4', '',
  '[Page 3]', 'DAILY LIFE', 'Arrival', 'Doors open at 7:40am.', 'Lunch', 'Bring a lunch or buy one.', 'Snacks',
  'Pack a healthy snack.', '3', '',
  '[Page 4]', 'DAILY LIFE', 'Playground Time', 'Students play outside after lunch.', 'Dismissal', 'School ends at 3:00pm.', '4',
].join('\n'));
const OUTLINE: HandbookOutline = [
  { part: 'Daily Life', sections: [{ title: 'Arrival' }, { title: 'Lunch' }, { title: 'Recess' }, { title: 'Dismissal' }] },
];

test('pages are numbered like the PDF', () => {
  assert.ok(PAGES.length > 0);
  assert.deepEqual(PAGES.map((p) => p.page), [...PAGES.map((p) => p.page)].sort((a, b) => a - b));
  assert.equal(parsePages('[Page 3]\nHello\n\n[Page 4]\nWorld').map((p) => p.page).join(','), '3,4');
});

test('wrapped lines become paragraphs; short title lines become headings; the printed page number goes', () => {
  const blocks = toBlocks([
    'SCHOOL LIFE & DECORUM',
    'Attendance',
    'Classical education is highly interactive and requires consistent and punctual attendance. Because',
    'the classical approach relies heavily on classroom discussion.',
    'Excused Absences',
    'Court appearances',
    '6',
  ].join('\n'));
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'heading', 'text', 'heading', 'text'], 'a list item stays text');
  assert.match(blocks[2].text, /punctual attendance\. Because the classical approach/);
  assert.ok(!blocks.some((b) => b.text === '6'));
  assert.deepEqual(toBlocks('256.210.1343\nKingdom Heights').map((b) => b.kind), ['text', 'heading'], 'numbers alone are not headings');
  const joined = toBlocks([
    'Early Drop Off and Late Pick Up',
    'Students may not be dropped off before 7:40am and must be picked up by 3:15pm. The late fee is $2 per',
    'minute thereafter.',
    'Uniform and Personal Appearance',
  ].join('\n'));
  assert.deepEqual(joined.map((b) => b.kind), ['heading', 'text', 'heading'], 'short joining words; a heading after a finished sentence');
});

test('sections run from their heading to the next one, without banners, the repeated title or the contents page', () => {
  const sections = toSections(SAMPLE, OUTLINE);
  assert.deepEqual(sections.map((s) => [s.title, s.page]), [['Arrival', 3], ['Lunch', 3], ['Dismissal', 4]]);
  assert.deepEqual(sections[1].blocks.map((b) => b.text),
    ['Bring a lunch or buy one.', 'Snacks', 'Pack a healthy snack.', 'Playground Time', 'Students play outside after lunch.'],
    'subheadings stay inside, across pages; the banner on page 4 is gone');
  assert.equal(sections[0].part, 'Daily Life');
});

test("a section whose line is gone (renamed in a new edition) is skipped; the ones after it are still found", () => {
  const sections = toSections(SAMPLE, OUTLINE);
  assert.ok(!sections.some((s) => s.title === 'Recess'));
  assert.ok(sections.some((s) => s.title === 'Dismissal'), "Recess doesn't hold up Dismissal");
  // Only a few sections ahead count, so a subheading named like a much later section doesn't jump to it.
  const far: HandbookOutline = [{ part: 'Daily Life', sections: [
    { title: 'Arrival' }, { title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, { title: 'Snacks' },
  ] }];
  assert.deepEqual(toSections(SAMPLE, far).map((s) => s.title), ['Arrival']);
});

test("the outline report says what to change after a new edition: what's missing, the likeliest new line, and new contents", () => {
  const report = outlineReport(SAMPLE, OUTLINE);
  assert.deepEqual(report.missing.map((m) => [m.title, m.candidates[0]?.text, m.candidates[0]?.page]), [['Recess', undefined, undefined]]);
  assert.deepEqual(report.unlisted, ['Field Days'], 'in the PDF’s contents, in no section');
  const renamed = outlineReport(SAMPLE, [{ part: 'Daily Life', sections: [{ title: 'Arrival' }, { title: 'Lunch' }, { title: 'Playground', starts: 'Playground' }] }]);
  assert.deepEqual(renamed.missing[0].candidates[0], { text: 'Playground Time', page: 4 });
  const covered = outlineReport(SAMPLE, [{ part: 'Daily Life', sections: [
    { title: 'Arrival' }, { title: 'Lunch', includes: ['Recess', 'Field Days'] }, { title: 'Dismissal' }] }]);
  assert.deepEqual([covered.missing, covered.unlisted], [[], []]);
});

test('the edition comes from the cover', () => {
  assert.equal(edition(SAMPLE), '2027-2028 · Version 2.1 · updated August 2, 2027');
  assert.equal(edition(parsePages('[Page 1]\nHandbook')), '');
});

test("the school's outline matches its handbook (after a new edition: npm run handbook:check)", () => {
  if (!PAGES.length) return;   // no handbook imported for this school yet
  const { sections, missing } = outlineReport(PAGES, HANDBOOK_OUTLINE);
  const advice = missing.map((m) => `${m.title}: maybe ${m.candidates.map((c) => `"${c.text}" (p.${c.page})`).join(', ') || 'removed?'}`);
  assert.deepEqual(advice, [], 'sections whose starting line is gone: set `starts` in the school’s handbookOutline.ts');
  for (const s of sections) assert.ok(s.blocks.length > 0, `${s.title} is empty`);
  const pages = sections.map((s) => s.page);
  assert.deepEqual(pages, [...pages].sort((a, b) => a - b), 'in page order');
  const banners = sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'heading' && b.text === b.text.toUpperCase() && /[A-Z]{4}/.test(b.text));
  assert.deepEqual(banners.map((b) => b.text), [], 'page banners left in the text');
});

test('headings and lines compare loosely', () => {
  assert.equal(loose('Early Drop Off & Late Pick Up'), loose('Early Drop Off and Late Pick Up'));
  assert.equal(loose('Taylor’s Law'), loose("TAYLOR'S LAW"));
  assert.deepEqual(toSections(SAMPLE.slice(2), []).map((s) => s.title), ['Page 3', 'Page 4'], 'without an outline, each page is a section');
});

test('search counts matches in each section, title included, ignoring case; symbols are plain text', () => {
  const sections = toSections(SAMPLE, OUTLINE);
  const found = hits(sections, 'LUNCH');
  assert.deepEqual([...found.entries()].map(([id, n]) => [sections.find((s) => s.id === id)!.title, n]), [['Lunch', 3]], 'the title counts');
  assert.equal(hits(sections, 'a').size, 0, 'one letter is too short');
  assert.doesNotThrow(() => hits(SECTIONS, '(K2'));
  assert.equal(hits(sections, 'zzqx').size, 0);
});
