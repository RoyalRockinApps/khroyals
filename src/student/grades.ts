/**
 * The Student app's numbers, worked out the way a gradebook does: each category's points (missing work counts as
 * zero; excused work and work not graded yet don't count), weighted by the category's share, or plain points when the
 * class has no weights. Also letters from the school's scale, the grading term, and attendance. No app imports, so
 * tests run it.
 */

export type Scale = { letter: string; min: number }[];
export type Category = { name: string; weight: number };
export type Work = { dueOn: string; category: string | null; score: number | null; maxScore: number | null; status: 'graded' | 'missing' | 'excused' | 'pending' };
export type Term = { name: string; startsOn: string; endsOn: string };
export type Mark = { day: string; kind: 'absent' | 'half_day' | 'tardy' | 'left_early'; excused: boolean };

/** Whether a piece of work counts toward the average: graded with a score, or missing (as zero). */
export const counts = (w: Work) => !!w.maxScore && ((w.status === 'graded' && w.score !== null) || w.status === 'missing');

const points = (list: Work[]) => {
  const max = list.reduce((n, w) => n + (w.maxScore ?? 0), 0);
  return max ? list.reduce((n, w) => n + (w.status === 'missing' ? 0 : w.score ?? 0), 0) / max : 0;
};

/** The average (percent) of the work due from `from` to `to` (YYYY-MM-DD, both included), or null with nothing graded. */
export function average(work: Work[], categories: Category[], from?: string | null, to?: string | null): number | null {
  const inside = work.filter((w) => counts(w) && (!from || w.dueOn >= from) && (!to || w.dueOn <= to));
  if (!inside.length) return null;
  let sum = 0;
  let total = 0;
  for (const c of categories.filter((x) => x.weight > 0)) {
    const mine = inside.filter((w) => (w.category ?? '').trim().toLowerCase() === c.name.trim().toLowerCase());
    if (mine.length) { sum += c.weight * points(mine); total += c.weight; }
  }
  return 100 * (total ? sum / total : points(inside));
}

/** The running average after each day something was graded, from `from` to `to`: the line on a class's graph. */
export function progress(work: Work[], categories: Category[], from?: string | null, to?: string | null): { day: string; average: number }[] {
  const days = [...new Set(work.filter((w) => counts(w) && (!from || w.dueOn >= from) && (!to || w.dueOn <= to)).map((w) => w.dueOn))].sort();
  return days.map((day) => ({ day, average: average(work, categories, from, day) as number }));
}

/** The letter for an average on the school's scale (any order), or null without an average or a scale. */
export function letterFor(pct: number | null, scale: Scale): string | null {
  if (pct === null) return null;
  const step = [...scale].sort((a, b) => b.min - a.min).find((s) => Math.round(pct * 100) / 100 >= s.min);
  return step?.letter ?? null;
}

/** The average of the classes' averages (the ones that have one), or null. */
export function overallAverage(averages: (number | null)[]): number | null {
  const have = averages.filter((a): a is number => a !== null);
  return have.length ? have.reduce((n, a) => n + a, 0) / have.length : null;
}

/** The grading term a day is in; between terms, the last one that started; before them all, the first. */
export function termFor(terms: Term[], day: string): Term | null {
  const sorted = [...terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return sorted.find((t) => t.startsOn <= day && day <= t.endsOn) ?? [...sorted].reverse().find((t) => t.startsOn <= day) ?? sorted[0] ?? null;
}

/** "93.4%", or a dash. */
export const percent = (pct: number | null) => (pct === null ? '—' : `${(Math.round(pct * 10) / 10).toFixed(1)}%`);

/**
 * Attendance this school year: days absent (a half day is half), excused or not, times late and left early, and the
 * share of school days present (when the school's system says how many days there have been).
 */
export function attendanceSummary(marks: Mark[], schoolDays: number | null) {
  const away = (m: Mark) => (m.kind === 'absent' ? 1 : m.kind === 'half_day' ? 0.5 : 0);
  const absences = marks.reduce((n, m) => n + away(m), 0);
  const excused = marks.filter((m) => m.excused).reduce((n, m) => n + away(m), 0);
  return {
    absences, excused, unexcused: absences - excused,
    tardies: marks.filter((m) => m.kind === 'tardy').length,
    leftEarly: marks.filter((m) => m.kind === 'left_early').length,
    rate: schoolDays ? Math.max(0, (100 * (schoolDays - absences)) / schoolDays) : null,
  };
}
