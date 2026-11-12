/** Absence reports: internal API implementation. Screens import the connect facade. */
import type { AbsenceKind, AbsenceReason } from '../absences/labels';
import { live, rpc, run, sb } from './client';
import { current } from './session';

export type AbsenceReport = {
  id: string; studentId: string; student: string; grade: number | null; kind: AbsenceKind; startsOn: string; endsOn: string;
  atTime: string | null; reason: AbsenceReason; note: string; status: 'reported' | 'cancelled'; reportedBy: string;
  createdAt: string; seenBy: string | null; seenAt: string | null; classes: string | null;
  /** The doctor's note's file, for the child's parents and the office (null for teachers, who only see `doctorNoteAt`). */
  doctorNote: string | null; doctorNoteAt: string | null;
};

/** A doctor's note picked on the phone (src/absences/doctorNote.ts): a JPEG photo or a PDF. */
export type DoctorNoteFile = { mimeType: 'image/jpeg' | 'application/pdf'; body: ArrayBuffer | Blob };

const NOTES = 'absence-notes';

/** Reports covering `from` (YYYY-MM-DD) and the `days` after: the office sees all, teachers their students', parents their children's. */
export async function listAbsences(from: string, days = 1): Promise<AbsenceReport[]> {
  if (!live || !current) return [];
  return (await rpc('absence_list', { p_from: from, p_days: days })).map((r) => ({
    id: r.id, studentId: r.student_id, student: r.student, grade: r.grade, kind: r.kind as AbsenceKind, startsOn: r.starts_on, endsOn: r.ends_on,
    atTime: r.at_time ?? null, reason: r.reason as AbsenceReason, note: r.note ?? '', status: r.status as AbsenceReport['status'],
    reportedBy: r.reported_by, createdAt: r.created_at, seenBy: r.seen_by ?? null, seenAt: r.seen_at ?? null, classes: r.classes ?? null,
    doctorNote: r.doctor_note ?? null, doctorNoteAt: r.doctor_note_at ?? null,
  }));
}

/** A parent reports an absence (several days), a late arrival or an early pickup (`at`, HH:MM). Returns the report's id. */
export async function reportAbsence(a: { studentId: string; kind: AbsenceKind; startsOn: string; endsOn?: string | null; at?: string | null; reason: AbsenceReason; note: string }): Promise<string> {
  const r = await rpc('absence_report', {
    p_student: a.studentId, p_kind: a.kind, p_starts_on: a.startsOn, p_ends_on: a.endsOn ?? null, p_at: a.at ?? null, p_reason: a.reason, p_note: a.note,
  });
  return (r as { id: string }).id;
}

/**
 * A parent attaches a doctor's note to their report: uploaded into their own folder, then attached (the office is
 * told). The file it replaces is removed; a file that couldn't be attached isn't left behind.
 */
export async function attachDoctorNote(reportId: string, f: DoctorNoteFile) {
  const me = current?.id;
  if (!live || !me) throw new Error('Sign in first.');
  const path = `${me}/${reportId}/${Date.now().toString(36)}.${f.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`;
  await run(sb().storage.from(NOTES).upload(path, f.body, { contentType: f.mimeType }));
  let old: string | null;
  try {
    old = await rpc('absence_attach_note', { p_id: reportId, p_path: path });
  } catch (e) {
    await sb().storage.from(NOTES).remove([path]).catch(() => {});
    throw e;
  }
  if (old) await sb().storage.from(NOTES).remove([old]).catch(() => { /* the other parent's upload: theirs to remove */ });
}

/** A parent takes the doctor's note off their report. */
export async function removeDoctorNote(reportId: string) {
  const old = await rpc('absence_attach_note', { p_id: reportId, p_path: null });
  if (old) await sb().storage.from(NOTES).remove([old]).catch(() => {});
}

/** A link to open a doctor's note for five minutes (the child's parents and the office only). */
export async function doctorNoteUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from(NOTES).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("Couldn't open the doctor's note.");
  return data.signedUrl;
}

export async function cancelAbsence(id: string) { await rpc('absence_cancel', { p_id: id }); }

/** The office: mark a report seen (the parents hear the school has it). */
export async function markAbsenceSeen(id: string) { await rpc('absence_seen', { p_id: id }); }
