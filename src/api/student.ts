/** student: internal API implementation. Screens import the connect facade. */
import type { AttendanceEntry, CourseAssignment, CourseDetail, GradeScale, RecordStudent, StudentDashboard } from './types';
import { live, rpc } from './client';
import { current } from './session';
import { avatarUrl, signAvatars } from './storage';
import { enumValue } from './validation';

type Row = Record<string, any>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const scaleOf = (rows: Row[] | null): GradeScale => (rows ?? []).map((r) => ({ letter: String(r.letter), min: Number(r.min) })).sort((a, b) => b.min - a.min);

/**
 * The Student app's dashboard: the students you can see (yourself, or your children), oldest first, and the record
 * from the school's system for `studentId` (or the oldest): information, attendance and each class's grade.
 */
export async function studentRecord(studentId?: string | null): Promise<StudentDashboard> {
  if (!live || !current) return { students: [], studentId: null, scale: [], record: null };
  const r = (await rpc('student_record', studentId ? { p_student: studentId } : {})) as Row;
  await signAvatars((r.students as Row[]).map((s) => s.photoPath)).catch(() => {});
  const students: RecordStudent[] = (r.students as Row[]).map((s) => ({
    id: s.id, firstName: s.firstName, lastName: s.lastName, grade: num(s.grade), gradeLabel: s.gradeLabel ?? null,
    photo: avatarUrl(s.photoPath), photoPath: s.photoPath ?? null, birthday: s.birthday ?? null,
  }));
  const rec = r.record as Row | null;
  return {
    students, studentId: r.studentId ?? null, scale: scaleOf(r.scale),
    record: rec && {
      sisId: rec.sisId, source: rec.source, schoolYear: rec.schoolYear, homeroom: rec.homeroom ?? null, advisor: rec.advisor ?? null,
      enrolledOn: rec.enrolledOn ?? null, schoolDays: num(rec.schoolDays), syncedAt: rec.syncedAt, birthday: rec.birthday ?? null,
      details: (rec.details as Row[]).map((d) => ({ label: String(d.label ?? ''), value: String(d.value ?? '') })).filter((d) => d.label && d.value),
      terms: rec.terms,
      attendance: (rec.attendance as Row[]).map((a): AttendanceEntry => ({
        day: a.day, kind: enumValue(a.kind, ['absent', 'half_day', 'tardy', 'left_early']), excused: !!a.excused, note: a.note ?? null,
      })),
      courses: (rec.courses as Row[]).map((c) => ({
        id: c.id, name: c.name, subject: c.subject ?? null, teacher: c.teacher ?? null, average: num(c.average), letter: c.letter ?? null, missing: Number(c.missing ?? 0),
      })),
    },
  };
}

/** One class on a student's record: its average, categories and every assignment, oldest first. */
export async function studentCourse(courseId: string): Promise<CourseDetail> {
  const c = (await rpc('student_course', { p_course: courseId })) as Row;
  return {
    id: c.id, studentId: c.studentId, name: c.name, subject: c.subject ?? null, teacher: c.teacher ?? null, average: num(c.average), letter: c.letter ?? null,
    categories: (c.categories as Row[]).map((x) => ({ name: String(x.name), weight: Number(x.weight) })), schoolYear: c.schoolYear, scale: scaleOf(c.scale), terms: c.terms,
    assignments: (c.assignments as Row[]).map((a): CourseAssignment => ({
      id: a.id, title: a.title, category: a.category ?? null, dueOn: a.dueOn, score: num(a.score), maxScore: num(a.maxScore),
      status: enumValue(a.status, ['graded', 'missing', 'excused', 'pending']), comment: a.comment ?? null,
    })),
  };
}
