/** Absence reports: internal API implementation. Screens import the connect facade. */
import type { AbsenceKind, AbsenceReason } from '../absences/labels';
import { live, rpc } from './client';
import { current } from './session';

export type AbsenceReport = {
  id: string; studentId: string; student: string; grade: number | null; kind: AbsenceKind; startsOn: string; endsOn: string;
  atTime: string | null; reason: AbsenceReason; note: string; status: 'reported' | 'cancelled'; reportedBy: string;
  createdAt: string; seenBy: string | null; seenAt: string | null; classes: string | null;
};

/** Reports covering `from` (YYYY-MM-DD) and the `days` after: the office sees all, teachers their students', parents their children's. */
export async function listAbsences(from: string, days = 1): Promise<AbsenceReport[]> {
  if (!live || !current) return [];
  return (await rpc('absence_list', { p_from: from, p_days: days })).map((r) => ({
    id: r.id, studentId: r.student_id, student: r.student, grade: r.grade, kind: r.kind as AbsenceKind, startsOn: r.starts_on, endsOn: r.ends_on,
    atTime: r.at_time ?? null, reason: r.reason as AbsenceReason, note: r.note ?? '', status: r.status as AbsenceReport['status'],
    reportedBy: r.reported_by, createdAt: r.created_at, seenBy: r.seen_by ?? null, seenAt: r.seen_at ?? null, classes: r.classes ?? null,
  }));
}

/** A parent reports an absence (several days), a late arrival or an early pickup (`at`, HH:MM). */
export async function reportAbsence(a: { studentId: string; kind: AbsenceKind; startsOn: string; endsOn?: string | null; at?: string | null; reason: AbsenceReason; note: string }) {
  await rpc('absence_report', {
    p_student: a.studentId, p_kind: a.kind, p_starts_on: a.startsOn, p_ends_on: a.endsOn ?? null, p_at: a.at ?? null, p_reason: a.reason, p_note: a.note,
  });
}

export async function cancelAbsence(id: string) { await rpc('absence_cancel', { p_id: id }); }

/** The office: mark a report seen (the parents hear the school has it). */
export async function markAbsenceSeen(id: string) { await rpc('absence_seen', { p_id: id }); }
