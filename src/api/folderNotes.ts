/**
 * Class bulletins and teachers' notes in parents' Folders: internal API implementation. Screens import the connect
 * facade. Teachers post bulletins to the class sections they lead and write notes to one student's parents; only
 * those parents read them (the database decides who).
 */
import { live, rpc } from './client';
import { current } from './session';

export type FolderNoteKind = 'bulletin' | 'note';

/** For a parent: a bulletin or note to them, with which of their children it's for and their own read/removed state. */
export type FolderNote = {
  id: string; kind: FolderNoteKind; title: string; body: string; from: string; sentAt: string;
  children: string[]; classes: string[]; readAt: string | null; removedAt: string | null;
};

/** For its author: who it went to and how many of those parents have opened it. */
export type SentFolderNote = {
  id: string; kind: FolderNoteKind; title: string; body: string; sentAt: string; to: string; parents: number; read: number;
};

const noServer = () => { throw new Error('Bulletins and notes need the school server; this build is running on demo data.'); };

/** A parent's bulletins and notes from the last 60 days, newest first. */
export async function myFolderNotes(): Promise<FolderNote[]> {
  if (!live || !current) return [];
  return (await rpc('my_folder_notes')) as unknown as FolderNote[];
}

/** A teacher's own bulletins and notes from the last 90 days, newest first. */
export async function sentFolderNotes(): Promise<SentFolderNote[]> {
  if (!live || !current) return [];
  return (await rpc('sent_folder_notes')) as unknown as SentFolderNote[];
}

/** A teacher posts a bulletin to class sections they lead. Returns its id. */
export async function sendBulletin(sections: string[], title: string, body: string): Promise<string> {
  if (!live) noServer();
  return rpc('folder_bulletin_send', { p_sections: sections, p_title: title, p_body: body });
}

/** A teacher writes a note to a student's parents. Returns its id. */
export async function sendFolderNote(studentId: string, title: string, body: string): Promise<string> {
  if (!live) noServer();
  return rpc('folder_note_send', { p_student: studentId, p_title: title, p_body: body });
}

export async function deleteFolderNote(id: string) { if (!live) noServer(); await rpc('folder_note_delete', { p_id: id }); }

/** A parent opened it. */
export async function readFolderNote(id: string) { if (!live) return; await rpc('folder_note_read', { p_id: id }); }

/** A parent takes it out of their own Folder (or puts it back with `removed` false). */
export async function removeFolderNote(id: string, removed = true) {
  if (!live) noServer();
  await rpc('folder_note_remove', { p_id: id, p_removed: removed });
}

/** A note from a parent to one of their child's teachers: to the teacher (`mine` false) or by the parent (`mine` true). */
export type ParentNote = {
  id: string; body: string; sentAt: string; readAt: string | null; mine: boolean;
  studentId: string; student: string; from: string; to: string; classes: string[];
};

/** For a parent: each child and the teachers of their classes. */
export type ChildTeachers = { studentId: string; name: string; teachers: { id: string; name: string; classes: string[] }[] };

export async function parentNoteTeachers(): Promise<ChildTeachers[]> {
  if (!live || !current) return [];
  return (await rpc('parent_note_teachers')) as unknown as ChildTeachers[];
}

/** A parent writes to one of their child's teachers (who is told). Returns its id. */
export async function sendParentNote(studentId: string, teacherId: string, body: string): Promise<string> {
  if (!live) noServer();
  return rpc('parent_note_send', { p_student: studentId, p_teacher: teacherId, p_body: body });
}

/** The teacher opened it. */
export async function readParentNote(id: string) { if (!live) return; await rpc('parent_note_read', { p_id: id }); }

/** Notes from the last 90 days: to a teacher, the ones written to them; to a parent, the ones they wrote. */
export async function parentNotes(): Promise<ParentNote[]> {
  if (!live || !current) return [];
  return (await rpc('parent_notes_list')) as unknown as ParentNote[];
}
