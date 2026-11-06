/**
 * Is one version really doing better, or could it be chance? A two-proportion z-test on the share of people who opened
 * (or finished) after seeing each version. No app imports, so tests run it.
 */
export type Rate = { hits: number; of: number };

/** At least this many people must have seen each version before saying anything. */
export const MIN_SEEN = 30;

export const pct = (r: Rate) => (r.of > 0 ? Math.round((100 * r.hits) / r.of) : 0);

/** The z-score for the difference between two rates (0 when either has nobody yet). */
export function zScore(a: Rate, b: Rate) {
  if (a.of === 0 || b.of === 0) return 0;
  const p = (a.hits + b.hits) / (a.of + b.of);
  const se = Math.sqrt(p * (1 - p) * (1 / a.of + 1 / b.of));
  return se === 0 ? 0 : (b.hits / b.of - a.hits / a.of) / se;
}

/** Which version leads (by label) and whether it's a real difference: 95% sure, with enough people on each side. */
export function verdict(what: string, a: Rate & { label: string }, b: Rate & { label: string }) {
  const z = zScore(a, b);
  const enough = a.of >= MIN_SEEN && b.of >= MIN_SEEN;
  const sure = enough && Math.abs(z) >= 1.96;
  const lead = z > 0 ? b : a, other = z > 0 ? a : b;
  if (!enough) {
    return { sure: false, leader: null, text: `Too early to tell: each version needs at least ${MIN_SEEN} people who saw it (now ${a.of} and ${b.of}).` };
  }
  if (z === 0) return { sure: false, leader: null, text: `No difference in ${what} so far (${pct(a)}% each).` };
  return sure
    ? { sure: true, leader: lead.label, text: `${lead.label} gets more ${what}: ${pct(lead)}% vs ${pct(other)}%. That’s a real difference (95% sure).` }
    : { sure: false, leader: null, text: `${lead.label} is ahead on ${what} (${pct(lead)}% vs ${pct(other)}%), but that could still be chance. Keep it running.` };
}
