/**
 * Class bulletins and teachers' notes in parents' Folders: internal API implementation. Screens import the connect
 * facade. Teachers post bulletins to the class sections they lead and write notes to one student's parents; only
 * those parents read them (the database decides who).
 */
import { live, rpc, run, sb } from './client';
import type { Json } from './database.types';
import { current } from './session';
import { ATTACH_TYPES, type AttachMime, type FolderAttachment } from '../schoolForms/attachments';

export type { FolderAttachment } from '../schoolForms/attachments';
/** A picture or PDF picked to attach (src/schoolForms/pickAttachment.ts), or a link typed in. */
export type AttachmentUpload =
  | { kind: 'image' | 'pdf'; mimeType: AttachMime; name: string; body: ArrayBuffer | Blob; size: number; width?: number; height?: number; preview?: string }
  | { kind: 'link'; url: string; name: string };
const FILES = 'folder-files';

export type FolderNoteKind = 'bulletin' | 'note';

/** For a parent: a bulletin or note to them, with which of their children it's for and their own read/removed state. */
export type FolderNote = {
  id: string; kind: FolderNoteKind; title: string; body: string; from: string; sentAt: string;
  children: string[]; classes: string[]; readAt: string | null; removedAt: string | null;
  attachments: FolderAttachment[];
};

/** For its author: who it went to and how many of those parents have opened it. */
export type SentFolderNote = {
  id: string; kind: FolderNoteKind; title: string; body: string; sentAt: string; to: string; parents: number; read: number;
  attachments: FolderAttachment[];
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

/**
 * Uploads the picked pictures and PDFs into the teacher's own folder, then sends with them (and the links); a send that
 * fails leaves no files behind.
 */
async function withAttachments(attachments: AttachmentUpload[], send: (att: Json[] | null) => Promise<string>): Promise<string> {
  if (!attachments.length) return send(null);
  const me = current?.id;
  if (!me) throw new Error('Sign in first.');
  const batch = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uploaded: string[] = [];
  try {
    const att: Json[] = [];
    for (const [i, a] of attachments.entries()) {
      if (a.kind === 'link') { att.push({ kind: 'link', url: a.url, name: a.name }); continue; }
      const path = `${me}/${batch}/${i + 1}.${ATTACH_TYPES[a.mimeType]}`;
      await run(sb().storage.from(FILES).upload(path, a.body, { contentType: a.mimeType }));
      uploaded.push(path);
      att.push({ kind: a.kind, path, name: a.name, width: a.width ?? null, height: a.height ?? null, size: a.size });
    }
    return await send(att);
  } catch (e) {
    if (uploaded.length) await sb().storage.from(FILES).remove(uploaded).catch(() => {});
    throw e;
  }
}

/** A teacher posts a bulletin to class sections they lead, with any pictures, PDFs and links. Returns its id. */
export async function sendBulletin(sections: string[], title: string, body: string, attachments: AttachmentUpload[] = []): Promise<string> {
  if (!live) noServer();
  return withAttachments(attachments, (att) => rpc('folder_bulletin_send', att
    ? { p_sections: sections, p_title: title, p_body: body, p_attachments: att } : { p_sections: sections, p_title: title, p_body: body }));
}

/** A teacher writes a note to a student's parents, with any pictures, PDFs and links. Returns its id. */
export async function sendFolderNote(studentId: string, title: string, body: string, attachments: AttachmentUpload[] = []): Promise<string> {
  if (!live) noServer();
  return withAttachments(attachments, (att) => rpc('folder_note_send', att
    ? { p_student: studentId, p_title: title, p_body: body, p_attachments: att } : { p_student: studentId, p_title: title, p_body: body }));
}

/** The author deletes it (it leaves every Folder), and its uploaded files with it. */
export async function deleteFolderNote(id: string) {
  if (!live) noServer();
  const files = await run(sb().from('folder_note_attachments').select('path').eq('note_id', id)).catch(() => [] as { path: string | null }[]);
  await rpc('folder_note_delete', { p_id: id });
  const paths = files.map((f) => f.path).filter((p): p is string => !!p);
  if (paths.length) await sb().storage.from(FILES).remove(paths).catch(() => {});
}

/** Links to a note's pictures and PDFs for an hour (whoever reads the note), by path. */
export async function folderFileUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  if (!live) return Object.fromEntries(paths.map((p) => [p, p]));
  const { data, error } = await sb().storage.from(FILES).createSignedUrls(paths, 3600);
  if (error || !data) throw new Error("Couldn't open the attachments.");
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
}

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
