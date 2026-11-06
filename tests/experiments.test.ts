/** src/experiments: every A/B test is in both the registry and the database, the events match, and the verdicts are sound. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTS, EXPERIMENTS } from '../src/experiments/registry';
import { MIN_SEEN, pct, verdict, zScore } from '../src/experiments/stats';

const sql = () => {
  const dir = join(__dirname, '../supabase/migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
};

test('every test is in the registry and the database, with a description of each version', () => {
  const all = sql();
  const seeded = [...all.matchAll(/insert into public\.experiments \(key, title\) values \('([a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(seeded.sort(), Object.keys(EXPERIMENTS).sort());
  for (const [key, info] of Object.entries(EXPERIMENTS)) {
    assert.deepEqual(Object.keys(info.variants), ['a', 'b'], `${key}: the database's default versions`);
  }
});

test('the events are the same in the app and the database', () => {
  const check = /event\s+text not null check \(event in \(([^)]*)\)\)/.exec(sql());
  assert.ok(check, 'experiment_events.event has a check');
  assert.deepEqual([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), EVENTS.map((e) => e.key));
});

test('a real difference only with enough people and 95% confidence', () => {
  const A = (hits: number, of: number) => ({ hits, of, label: 'A' });
  const B = (hits: number, of: number) => ({ hits, of, label: 'B' });
  assert.match(verdict('opens', A(5, 10), B(9, 10)).text, new RegExp(`at least ${MIN_SEEN} people`));
  const big = verdict('opens', A(40, 100), B(60, 100));
  assert.equal(big.sure, true);
  assert.equal(big.leader, 'B');
  assert.match(big.text, /B gets more opens: 60% vs 40%/);
  const close = verdict('reads', A(40, 100), B(44, 100));
  assert.equal(close.sure, false);
  assert.match(close.text, /could still be chance/);
  assert.match(verdict('opens', A(50, 100), B(50, 100)).text, /No difference/);
  assert.ok(zScore(A(60, 100), B(40, 100)) < 0, 'A ahead is negative');
  assert.equal(pct({ hits: 1, of: 3 }), 33);
  assert.equal(pct({ hits: 0, of: 0 }), 0);
});
