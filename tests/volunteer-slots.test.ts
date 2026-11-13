/** src/volunteer/slots.ts: an opportunity's time slots show as one, with the next slot still to come standing for it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bySlots, seriesOf, slotsProgress } from '../src/volunteer/slots';

const slot = (id: string, startsOn: string, startTime: string | null, extra: Partial<{ slotOf: string; status: 'open' | 'deleted'; spots: number }> = {}) =>
  ({ id, slotOf: extra.slotOf ?? null, status: extra.status ?? 'open', startsOn, endsOn: null, startTime, spots: extra.spots ?? null });

test("slots group with the first one posted; the next open one still to come stands for them", () => {
  const list = [
    slot('a', '2026-11-16', '15:00', { spots: 2 }),
    slot('x', '2026-11-16', '09:00'),
    slot('c', '2026-11-17', '08:00', { slotOf: 'a', status: 'deleted' }),
    slot('b', '2026-11-17', '15:00', { slotOf: 'a', spots: 1 }),
  ];
  const past = (o: { startsOn: string }) => o.startsOn < '2026-11-17';
  const groups = bySlots(list, past);
  assert.deepEqual(groups.map((g) => [g.o.id, g.slots.map((s) => s.id)]), [['b', ['a', 'c', 'b']], ['x', ['x']]]);
  assert.equal(seriesOf(list[3]), 'a');
  // All past: the last one stands for it.
  assert.equal(bySlots(list, () => true)[0].o.id, 'b');
});

test('progress across slots: spots add up, and any slot without a limit means no limit', () => {
  const a = slot('a', '2026-11-16', '15:00', { spots: 2 });
  const b = slot('b', '2026-11-17', '15:00', { slotOf: 'a', spots: 1 });
  const signups = [{ opportunityId: 'a' }, { opportunityId: 'b' }];
  assert.deepEqual(slotsProgress([a, b], signups), { n: 2, goal: 3, full: false, open: 1 });
  assert.deepEqual(slotsProgress([a, b], [...signups, { opportunityId: 'a' }]), { n: 3, goal: 3, full: true, open: 0 });
  assert.equal(slotsProgress([a, slot('c', '2026-11-18', null, { slotOf: 'a' })], signups).goal, null);
});
