/**
 * College & Career's words and order: what each date kind, transcript method and status is called, a test's
 * registration line, and which dates are still to come. No app imports, so tests run it.
 */
import type { CollegeDate, CollegeDateKind, CollegeStep, TranscriptMethod, TranscriptRequest } from '../api/college';

export const KIND_LABEL: Record<CollegeDateKind, string> = { test: 'Test', scholarship: 'Scholarship', event: 'Event' };
export const METHOD_LABEL: Record<TranscriptMethod, string> = { portal: 'Through the college\'s portal', email: 'By email', mail: 'By mail' };
export const STATUS_LABEL: Record<TranscriptRequest['status'], string> = { requested: 'Waiting', sent: 'Sent', cancelled: 'Called off' };
export const GRADES = [9, 10, 11, 12] as const;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** A test's registration: "Register by Nov 21 (5 days left)", urgent within a week; "Registration closed" after. */
export function registerLine(d: Pick<CollegeDate, 'registerBy' | 'day'>, today: string): { text: string; urgent: boolean } | null {
  if (!d.registerBy || d.day < today) return null;
  const left = daysBetween(today, d.registerBy);
  if (left < 0) return { text: 'Registration closed', urgent: false };
  const when = left === 0 ? 'today' : left === 1 ? '1 day left' : `${left} days left`;
  return { text: `Register by ${short(d.registerBy)} (${when})`, urgent: left <= 7 };
}

/** Dates still to come (soonest first) and the past ones (latest first). */
export function splitDates<T extends Pick<CollegeDate, 'day'>>(dates: T[], today: string): { ahead: T[]; past: T[] } {
  return {
    ahead: dates.filter((d) => d.day >= today).sort((a, b) => a.day.localeCompare(b.day)),
    past: dates.filter((d) => d.day < today).sort((a, b) => b.day.localeCompare(a.day)),
  };
}

/** A grade's steps and how many are done. */
export function stepsFor(steps: CollegeStep[], grade: number): { steps: CollegeStep[]; done: number } {
  const list = steps.filter((x) => x.grade === grade);
  return { steps: list, done: list.filter((x) => x.doneAt).length };
}

/** The grades in the order a student sees them: their own first, then the ones ahead, then the ones behind. */
export function gradeOrder(grade: number | null): number[] {
  const g = grade && grade >= 9 && grade <= 12 ? grade : 9;
  return [g, ...GRADES.filter((x) => x > g), ...GRADES.filter((x) => x < g).reverse()];
}
