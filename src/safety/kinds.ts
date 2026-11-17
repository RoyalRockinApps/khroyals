/**
 * Tell Someone's kinds of report (in both this list and the database check, supabase/migrations/…_tell_someone.sql;
 * tests/safety.test.ts compares) and their words. Self-harm and harming others are urgent. No app imports, so tests run it.
 */
export const SAFETY_KINDS = [
  { key: 'bullying', label: 'Bullying or someone being mean', icon: 'sad-outline' },
  { key: 'self_harm', label: 'Someone might hurt themselves', icon: 'heart-dislike-outline' },
  { key: 'harm_others', label: 'Someone might hurt others', icon: 'warning-outline' },
  { key: 'unsafe', label: 'Something unsafe at school', icon: 'alert-circle-outline' },
  { key: 'other', label: 'Something else', icon: 'chatbubble-ellipses-outline' },
] as const;
export type SafetyKind = typeof SAFETY_KINDS[number]['key'];

export const kindLabel = (k: string) => SAFETY_KINDS.find((x) => x.key === k)?.label ?? 'Something else';
export const isUrgent = (k: string) => k === 'self_harm' || k === 'harm_others';

/** What a student sees about their report. */
export const STATUS_WORDS: Record<'new' | 'seen' | 'closed', string> = { new: 'Sent', seen: 'Seen by the school', closed: 'Seen and closed' };
