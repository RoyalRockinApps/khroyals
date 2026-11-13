/**
 * Bulletin boards' pure parts (src/boards/decor.ts): the backgrounds, borders and paper colors are the same as the
 * database's checks, and a board without a title is named for its class. Who reads, runs and chats on a board is in
 * tests/db.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BACKGROUNDS, BORDERS, PAPERS, boardHeading, gradeTitle, tilt, type BoardName } from '../src/boards/decor';
import { notificationHref } from '../src/comms/inbox';

const dir = join(__dirname, '..', 'supabase', 'migrations');
const migration = readdirSync(dir).filter((f) => f.endsWith('_bulletin_boards.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const checked = (column: string) => {
  const m = new RegExp(`${column}\\s+[^\\n]*?check \\(${column} in \\(([^)]*)\\)\\)`, 's').exec(migration)
    ?? new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`, 's').exec(migration);
  assert.ok(m, `no check on ${column}`);
  return m[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
};

test('the decorations are the ones the database allows', () => {
  assert.deepEqual(Object.keys(BACKGROUNDS).sort(), checked('background'));
  assert.deepEqual(Object.keys(BORDERS).sort(), checked('border'));
  assert.deepEqual(Object.keys(PAPERS).sort(), checked('color'));
});

const teacher: BoardName = { kind: 'teacher', title: '', byline: '', academyName: null, minGrade: null, maxGrade: null, teacherName: 'Anna Smith', grades: [], sections: [] };

test("a board without a title is named for its class, its teacher's name under it", () => {
  assert.deepEqual(boardHeading({ ...teacher, grades: [1], sections: ['1st Grade – Smith'] }), { title: '1st Grade', byline: 'Anna Smith' });
  assert.deepEqual(boardHeading({ ...teacher, grades: [0] }), { title: 'Kindergarten', byline: 'Anna Smith' });
  assert.deepEqual(boardHeading({ ...teacher, grades: [9, 10], sections: ['Biology'] }), { title: 'Biology', byline: 'Anna Smith' });
  assert.deepEqual(boardHeading({ ...teacher, grades: [9, 10], sections: ['Biology', 'Chemistry'] }), { title: "Smith's class", byline: 'Anna Smith' });
  assert.deepEqual(boardHeading({ ...teacher, title: 'Room 12', byline: 'Mrs. Smith', grades: [1] }), { title: 'Room 12', byline: 'Mrs. Smith' });
  assert.deepEqual(boardHeading({ ...teacher, kind: 'academy', academyName: 'Formation Academy', minGrade: 0, maxGrade: 5, teacherName: null }),
    { title: 'Formation Academy', byline: 'K–5th' });
  assert.deepEqual([gradeTitle(-1), gradeTitle(3), gradeTitle(12)], ['K4', '3rd Grade', '12th Grade']);
});

test('pinned things lean a little, the same way every time', () => {
  for (const id of ['a', 'b6f1', 'demo-item-12']) {
    assert.equal(tilt(id), tilt(id));
    assert.ok(Math.abs(tilt(id)) <= 3.5);
  }
});

test("an announcement's notification opens its board at the announcements", () => {
  assert.equal(notificationHref({ boardId: 'b1', boardPostId: 'p1' }), '/board/b1?show=news');
  assert.equal(notificationHref({ boardId: 'b1' }), '/board/b1');
});
