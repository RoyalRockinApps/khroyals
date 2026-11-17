/**
 * Missing work and grade alerts from the student's record (the school's system): internal API implementation. Screens
 * import the connect facade. The student and their parents read them; the database decides.
 */
import { live, rpc } from './client';
import { current } from './session';

export type StudentAlerts = {
  /** The line a class's average is checked against, in percent (the grade_alert_below setting). */
  below: number;
  missing: { course: string; title: string; dueOn: string }[];
  low: { course: string; average: number; letter: string | null }[];
};

/** Demo builds show a little, so the screens can be tried. */
const SAMPLE: StudentAlerts = {
  below: 70,
  missing: [{ course: 'Math 6', title: 'Chapter 4 quiz corrections', dueOn: '2026-11-12' }, { course: 'Science 6', title: 'Lab report: plant cells', dueOn: '2026-11-10' }],
  low: [{ course: 'Science 6', average: 66.5, letter: 'D' }],
};

/** A student's own (or a parent's child's, `studentId`); null when there's no record to read. */
export async function studentAlerts(studentId?: string | null): Promise<StudentAlerts | null> {
  if (!live) return SAMPLE;
  if (!current) return null;
  const a = (await rpc('student_alerts', studentId ? { p_student: studentId } : {})) as unknown as StudentAlerts | null;
  return a && { ...a, below: Number(a.below), low: a.low.map((l) => ({ ...l, average: Number(l.average) })) };
}
