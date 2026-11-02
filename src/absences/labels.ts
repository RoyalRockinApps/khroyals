/**
 * Absence reports (Report an absence): kinds and reasons as the app shows them. The database check
 * on absence_reports lists the same keys (tests/absences.test.ts compares them). No app imports.
 */
export type AbsenceKind = 'absent' | 'late' | 'early';
export type AbsenceReason = 'sick' | 'appointment' | 'family' | 'travel' | 'other';

export const KINDS: { key: AbsenceKind; label: string; short: string }[] = [
  { key: 'absent', label: 'Absent', short: 'absent' },
  { key: 'late', label: 'Arriving late', short: 'arriving late' },
  { key: 'early', label: 'Leaving early', short: 'leaving early' },
];

export const REASONS: { key: AbsenceReason; label: string; emoji: string }[] = [
  { key: 'sick', label: 'Sick', emoji: '🤒' },
  { key: 'appointment', label: 'Appointment', emoji: '🩺' },
  { key: 'family', label: 'Family', emoji: '🏠' },
  { key: 'travel', label: 'Travel', emoji: '✈️' },
  { key: 'other', label: 'Other', emoji: '📝' },
];

export const kindLabel = (k: string) => KINDS.find((x) => x.key === k)?.label ?? k;
export const reasonLabel = (k: string) => { const r = REASONS.find((x) => x.key === k); return r ? `${r.emoji} ${r.label}` : k; };

const short = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** "10:30" → "10:30 AM". */
export const clock = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

/** "Absent Mon, Nov 2 – Wed, Nov 4", "Arriving late Tue, Nov 3 at 10:30 AM". */
export function describe(r: { kind: string; startsOn: string; endsOn: string; atTime: string | null }) {
  const days = r.endsOn > r.startsOn ? `${short(r.startsOn)} – ${short(r.endsOn)}` : short(r.startsOn);
  return `${kindLabel(r.kind)} ${days}${r.atTime ? ` at ${clock(r.atTime)}` : ''}`;
}
