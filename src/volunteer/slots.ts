/**
 * Volunteer time slots: an opportunity posted at several times (book fair helpers Monday 3–5 and Tuesday 3–5) is a row
 * per slot, each with its own spots and sign-ups, the extra ones pointing at the first (`slotOf`). Lists show them as
 * one opportunity: the next slot still to come stands for it, with all its slots. No app imports, so tests run it.
 */
type Slot = {
  id: string; slotOf: string | null; status: 'open' | 'deleted';
  startsOn: string; endsOn: string | null; startTime: string | null; spots: number | null;
};

/** The first slot posted, which the others belong with (itself, for one without slots). */
export const seriesOf = (o: { id: string; slotOf: string | null }) => o.slotOf ?? o.id;

/** Soonest first. */
export const byTime = (a: Slot, b: Slot) =>
  a.startsOn.localeCompare(b.startsOn) || (a.startTime ?? '').localeCompare(b.startTime ?? '');

/**
 * One entry per opportunity, in the order they first come up in the list: the slot that stands for it (the next open
 * one still to come, else its last) and all its slots in the list, soonest first.
 */
export function bySlots<T extends Slot>(list: T[], isPast: (o: T) => boolean): { o: T; slots: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const o of list) groups.set(seriesOf(o), [...(groups.get(seriesOf(o)) ?? []), o]);
  return [...groups.values()].map((group) => {
    const slots = [...group].sort(byTime);
    return { o: slots.find((x) => x.status === 'open' && !isPast(x)) ?? slots[slots.length - 1], slots };
  });
}

/** Across its slots: how many said yes, out of how many spots (null when any slot has no limit), and whether every one is full. */
export function slotsProgress(slots: Slot[], signups: { opportunityId: string }[]) {
  const said = (o: Slot) => signups.filter((x) => x.opportunityId === o.id).length;
  const n = slots.reduce((sum, o) => sum + said(o), 0);
  const goal = slots.every((o) => o.spots) ? slots.reduce((sum, o) => sum + (o.spots ?? 0), 0) : null;
  const full = slots.every((o) => !!o.spots && said(o) >= o.spots);
  const open = slots.filter((o) => !o.spots || said(o) < o.spots).length;
  return { n, goal, full, open };
}
