/** src/absences/labels.ts: absence kinds and reasons match the database, and how a report reads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KINDS, REASONS, describe } from '../src/absences/labels';

test('kinds and reasons match the database checks', () => {
  const dir = join(__dirname, '../supabase/migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith('_absence_reports.sql'))!), 'utf8');
  const list = (col: string) => sql.match(new RegExp(`${col}\\s+text not null[^\\n]*check \\(${col} in \\(([^)]*)\\)`))![1].match(/'(\w+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(list('kind'), KINDS.map((k) => k.key));
  assert.deepEqual(list('reason'), REASONS.map((r) => r.key));
});

test('a report in a sentence', () => {
  assert.equal(describe({ kind: 'absent', startsOn: '2026-11-02', endsOn: '2026-11-04', atTime: null }), 'Absent Mon, Nov 2 – Wed, Nov 4');
  assert.equal(describe({ kind: 'late', startsOn: '2026-11-03', endsOn: '2026-11-03', atTime: '10:30' }), 'Arriving late Tue, Nov 3 at 10:30 AM');
});
