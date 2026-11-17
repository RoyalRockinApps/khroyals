/** src/schoolForms/attachments.ts: what can go on a bulletin or note, matching the storage bucket, and links. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ATTACH_MAX_MB, ATTACH_TYPES, attachmentLine, cleanLink, linkName, splitAttachments } from '../src/schoolForms/attachments';

test("the file types and size match the folder-files bucket", () => {
  const file = readdirSync('supabase/migrations').find((f) => f.endsWith('_folder_attachments.sql'))!;
  const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
  const bucket = /values \('folder-files', 'folder-files', false, (\d+), array\[([^\]]*)\]\)/.exec(sql)!;
  assert.equal(Number(bucket[1]), ATTACH_MAX_MB * 1024 * 1024);
  assert.deepEqual([...bucket[2].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), Object.keys(ATTACH_TYPES).sort());
});

test('links: made whole, https only, and named after their site', () => {
  assert.equal(cleanLink('www.example.com/spirit-week'), 'https://www.example.com/spirit-week');
  assert.equal(cleanLink('http://example.org'), 'https://example.org');
  assert.equal(cleanLink('  https://example.org/a?b=1  '), 'https://example.org/a?b=1');
  assert.equal(cleanLink('not a link'), null);
  assert.equal(cleanLink('example'), null);
  assert.equal(cleanLink(''), null);
  assert.equal(linkName('https://www.example.com/spirit-week?x=1'), 'www.example.com');
});

test('pictures lead; the rest in order; a line for the paper', () => {
  const list = [{ kind: 'link' as const }, { kind: 'image' as const }, { kind: 'pdf' as const }, { kind: 'image' as const }];
  const { pictures, others } = splitAttachments(list);
  assert.equal(pictures.length, 2);
  assert.deepEqual(others.map((x) => x.kind), ['link', 'pdf']);
  assert.equal(attachmentLine(list), '2 pictures · 1 PDF · 1 link');
  assert.equal(attachmentLine([]), '');
});
