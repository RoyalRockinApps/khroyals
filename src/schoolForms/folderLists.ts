/**
 * The Folder's two lists: the forms still in it (not signed for every child, not expired, not removed), and the ones
 * out of it from the last 30 days, under Done & removed: signed, expired (past due or closed by the school) or removed,
 * newest first. A removed form that's still open can be put back. No app imports, so tests run it.
 */
import type { MyForm } from '../api/types';
import { schoolToday } from '../calendar/past';

export const PAST_DAYS = 30;

export type PastForm = { form: MyForm; why: 'signed' | 'expired' | 'removed'; on: string; label: string; canPutBack: boolean };

const signedAll = (f: MyForm) => f.children.length > 0 && f.children.every((c) => c.response);
const expired = (f: MyForm, today: string) => f.status === 'closed' || f.dueOn < today;
const lastSigned = (f: MyForm) => f.children.map((c) => c.response?.signedAt ?? '').sort().pop() ?? '';
const daysFrom = (day: string, today: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function pastForms(forms: MyForm[], today: string): { inFolder: MyForm[]; past: PastForm[] } {
  const inFolder = forms.filter((f) => !signedAll(f) && !expired(f, today) && !f.removedAt);
  const past = forms.filter((f) => !inFolder.includes(f)).map((f): PastForm => {
    const why = signedAll(f) ? 'signed' : f.removedAt ? 'removed' : 'expired';
    const on = why === 'signed' ? schoolToday(new Date(lastSigned(f))) : why === 'removed' ? schoolToday(new Date(f.removedAt!)) : f.dueOn;
    const label = why === 'signed' ? `Signed ${short(on)}` : why === 'removed' ? `Removed ${short(on)}`
      : f.status === 'closed' ? 'Closed by the school' : `Expired ${short(on)}`;
    return { form: f, why, on, label, canPutBack: why === 'removed' && !expired(f, today) };
  }).filter((x) => daysFrom(x.on, today) <= PAST_DAYS)
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : a.form.title.localeCompare(b.form.title)));
  return { inFolder, past };
}
