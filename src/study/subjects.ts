/**
 * The classes and subjects a student files notes and decks under. Class sections are named for the timetable
 * ("English 10 – Period 3"); students file things under the class ("English 10"). Each subject gets its own color.
 * No app imports, so tests run it.
 */

const PERIOD = /\s*[–—-]\s*(?:period|per\.?|block|hour|section|sec\.?)\s*\w*\s*$|\s*\((?:period|per\.?|block|hour)\s*\w*\)\s*$/i;

/** A class section's name as a subject: "English 10 – Period 3" → "English 10". */
export const subjectName = (name: string) => name.replace(PERIOD, '').trim().slice(0, 60);

/** Subjects to pick from, each once (ignoring case), in order. */
export function subjectChoices(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const n of names.map(subjectName)) if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

const COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A', '#0891B2', '#B45309', '#4F46E5', '#BE123C', '#0F766E'];

/** The same color for a subject everywhere (and grey for none). */
export function subjectColor(subject: string): string {
  const key = subject.trim().toLowerCase();
  if (!key) return '#64748B';
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
