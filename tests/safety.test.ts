/** src/safety/kinds.ts: Tell Someone's kinds match the database's, and which are urgent. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAFETY_KINDS, isUrgent, kindLabel } from '../src/safety/kinds';

test("Tell Someone's kinds are the database's", () => {
  const sql = readFileSync('supabase/migrations/20261116000094_tell_someone.sql', 'utf8');
  const check = /kind\s+text not null check \(kind in \(([^)]*)\)\)/.exec(sql)!;
  assert.deepEqual([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), SAFETY_KINDS.map((k) => k.key).sort());
  const urgent = /app\.safety_urgent\(kind text\)[\s\S]*?kind in \(([^)]*)\)/.exec(sql)!;
  assert.deepEqual([...urgent[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), SAFETY_KINDS.map((k) => k.key).filter(isUrgent).sort());
  assert.equal(kindLabel('bullying'), 'Bullying or someone being mean');
  assert.equal(kindLabel('nope'), 'Something else');
});
