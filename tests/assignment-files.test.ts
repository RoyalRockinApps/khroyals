/**
 * src/assignments/fileTypes.ts: what a student can turn in for an assignment, matching the storage bucket; and
 * src/assignments/zipNames.ts: the names inside a teacher's Download all ZIP.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORK_MAX_MB, WORK_TYPES, sizeText, turnedInLate, workTypeOf } from '../src/assignments/fileTypes';
import { safeName, totalMb, zipEntries, zipName } from '../src/assignments/zipNames';
import { unzipSync, zipSync } from 'fflate';

test('the file types and size limit match the assignment-files bucket', () => {
  const sql = readFileSync('supabase/migrations/20261116000087_assignment_files.sql', 'utf8');
  const bucket = /insert into storage\.buckets[\s\S]*?values \('assignment-files', 'assignment-files', false, (\d+), array\[([\s\S]*?)\]\)/.exec(sql)!;
  assert.equal(Number(bucket[1]), WORK_MAX_MB * 1024 * 1024);
  const types = [...bucket[2].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(types, Object.keys(WORK_TYPES).sort());
});

test('a picked file is known by what the phone says or by its name', () => {
  assert.equal(workTypeOf('application/pdf', 'x'), 'application/pdf');
  assert.equal(workTypeOf(null, 'Lab Report.DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(workTypeOf('application/octet-stream', 'scan.jpeg'), 'image/jpeg');
  assert.equal(workTypeOf(undefined, 'slides.pptx'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(workTypeOf('application/zip', 'project.zip'), null);
  assert.equal(workTypeOf(null, 'essay.pages'), null);
});

test('sizes and late work', () => {
  assert.equal(sizeText(512), '1 KB');
  assert.equal(sizeText(850 * 1024), '850 KB');
  assert.equal(sizeText(2.5 * 1024 * 1024), '2.5 MB');
  assert.equal(sizeText(3 * 1024 * 1024), '3 MB');
  assert.equal(turnedInLate('2026-11-16', '2026-11-16'), false, 'on the day it was due');
  assert.equal(turnedInLate('2026-11-16', '2026-11-17'), true);
  assert.equal(turnedInLate(null, '2026-11-17'), false, 'no due date');
});

const file = (id: string, name: string, size = 1000) => ({ id, assignmentId: 'a', studentId: 's', name, mimeType: 'application/pdf', size, path: `p/${id}`, at: '' });

test('Download all: a folder per student who turned in work, every file once, safe names', () => {
  const entries = zipEntries([
    { studentId: '1', name: 'Ava Reyes', files: [file('f1', 'Essay.docx'), file('f2', 'essay.docx'), file('f3', 'Essay.docx'), file('f4', 'a/b:c?.pdf')] },
    { studentId: '2', name: 'Wei Chen', files: [] },
    { studentId: '3', name: 'Ava Reyes', files: [file('f5', '.hidden')] },
    { studentId: '4', name: '  ', files: [file('f6', 'notes')] },
  ]);
  assert.deepEqual(entries.map((e) => [e.path, e.fileId, e.filePath]), [
    ['Ava Reyes/Essay.docx', 'f1', 'p/f1'],
    ['Ava Reyes/essay (2).docx', 'f2', 'p/f2'],
    ['Ava Reyes/Essay (3).docx', 'f3', 'p/f3'],
    ['Ava Reyes/a b c .pdf', 'f4', 'p/f4'],
    ['Ava Reyes (2)/hidden', 'f5', 'p/f5'],
    ['Student/notes', 'f6', 'p/f6'],
  ]);
  assert.equal(zipName('Persuasive essay', 'English 10 – Period 3'), 'Persuasive essay - English 10 – Period 3.zip');
  assert.equal(zipName('Lab 4/5', null), 'Lab 4 5.zip');
  assert.equal(safeName('...'), 'File');
  assert.equal(totalMb([{ studentId: '1', name: 'A', files: [file('x', 'a', 3 * 1024 * 1024), file('y', 'b', 1024 * 1024)] }]), 4);
});

test('the ZIP keeps each file in its student folder', () => {
  const zip = zipSync({ 'Ava Reyes/Essay.docx': new Uint8Array([1, 2, 3]), 'Wei Chen/Essay.pdf': new Uint8Array([4]) }, { level: 0 });
  const back = unzipSync(zip);
  assert.deepEqual(Object.keys(back).sort(), ['Ava Reyes/Essay.docx', 'Wei Chen/Essay.pdf']);
  assert.deepEqual([...back['Ava Reyes/Essay.docx']], [1, 2, 3]);
});
