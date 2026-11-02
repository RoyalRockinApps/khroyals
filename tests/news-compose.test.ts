/** src/news/compose.ts: a newsletter issue from pasted text. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeIssue, spans } from '../src/news/compose';

const PASTE = `page background
Royals News
October 30, 2026
Royals News
October 30, 2026
What an incredible week at Kingdom Heights! Our Royals brought the fun.



A special thank you goes to the many parents who volunteered.

Important
Information
Book Fair 📚
The Book Fair will be on campus for one final day on Monday, November 2.

PE Uniform Order Open ✅
The PE Uniform Store is open until THIS Sunday, November 1. To order, visit www.khroyals.com and navigate to Student Life.




Thank you for supporting our eighth graders!

Smore
Use Smore to create beautiful newsletters
Loading indicator
close
Powered by`;

test('pasted newsletter text becomes an issue: intro, heading, titled items, links, no page furniture', () => {
  const blocks = composeIssue(PASTE, ['Royals News', 'October 30, 2026']);
  assert.deepEqual(blocks.map((b) => (b.kind === 'text' ? `text:${b.title ?? '-'}:${b.paragraphs.length}` : `${b.kind}:${b.kind === 'heading' ? b.text : ''}`)), [
    'text:-:2', 'heading:Important Information', 'text:Book Fair 📚:1', 'text:PE Uniform Order Open ✅:1', 'text:-:1',
  ]);
  const pe = blocks[3];
  assert.ok(pe.kind === 'text' && pe.paragraphs[0].some((s) => s.href === 'https://www.khroyals.com' && s.text === 'www.khroyals.com'));
  assert.ok(!JSON.stringify(blocks).includes('Smore'));
});

test('links keep the text around them', () => {
  assert.deepEqual(spans('Sign up at https://example.com/x. Thanks'), [
    { text: 'Sign up at ' }, { text: 'https://example.com/x', href: 'https://example.com/x' }, { text: '. Thanks' },
  ]);
});

test('a written issue reads back into the same blocks', async () => {
  const { issueText } = await import('../src/news/compose');
  const blocks = composeIssue(PASTE, ['Royals News', 'October 30, 2026']);
  assert.deepEqual(composeIssue(issueText(blocks)), blocks);
});
