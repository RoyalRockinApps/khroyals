import { subscribeChanges } from './realtime';
/** assignments: internal API implementation. Screens import the connect facade. */
import type { Assignment, AssignmentFile, ChildAssignment, Section, StudentWork } from './types';
import { WORK_TYPES, type WorkType } from '../assignments/fileTypes';
import { live, rpc, run, sb } from './client';
import { current } from './session';

const FILES = 'assignment-files';

const fileOf = (x: { id: string; assignment_id: string; student_id: string; name: string; mime_type: string; size_bytes: number; path: string; created_at: string }): AssignmentFile => ({
  id: x.id, assignmentId: x.assignment_id, studentId: x.student_id, name: x.name, mimeType: x.mime_type, size: x.size_bytes, path: x.path, at: x.created_at,
});

export async function listAssignments(): Promise<Assignment[]> {
  if (!live || !current) return [];
  const [a, d, r, f] = await Promise.all([
    run(sb().from('assignments').select('*').order('due_on', { nullsFirst: false }).order('created_at')),
    run(sb().from('assignment_done').select('assignment_id')),
    run(sb().from('rosters').select('id, name')),
    // A student's own files; for a teacher, what their classes turned in.
    run(sb().from('assignment_files').select('*').order('created_at')),
  ]);
  const done = new Set(d.map((x) => x.assignment_id));
  const names = new Map(r.map((x) => [x.id, x.name]));
  const files = f.map(fileOf);
  return a.map((x) => {
    const its = files.filter((y) => y.assignmentId === x.id);
    return {
      id: x.id, rosterId: x.roster_id, className: x.roster_id ? names.get(x.roster_id) ?? null : null, ownerId: x.owner_id,
      title: x.title, details: x.details, dueOn: x.due_on, createdAt: x.created_at, done: done.has(x.id),
      files: its.filter((y) => y.studentId === current?.id), turnedIn: new Set(its.map((y) => y.studentId)).size,
    };
  });
}

/** For a parent: what their children's teachers assigned, due from `from` to `to` (YYYY-MM-DD). */
export async function childAssignments(from: string, to: string): Promise<ChildAssignment[]> {
  if (!live || !current) return [];
  return (await rpc('child_assignments', { p_from: from, p_to: to })).map((x) => ({
    id: x.id, studentId: x.student_id, rosterId: x.roster_id, className: x.class_name, title: x.title, details: x.details, dueOn: x.due_on,
  }));
}

/** With `rosterId`, a teacher assigns it to that class; without, a student adds their own. */
export async function addAssignment(a: { title: string; details: string; dueOn: string | null; rosterId: string | null }) {
  await rpc('assignment_add', { p_title: a.title, p_details: a.details, p_due_on: a.dueOn, p_roster: a.rosterId });
}

export async function deleteAssignment(id: string) { await rpc('assignment_delete', { p_assignment: id }); }

export async function checkAssignment(id: string, done: boolean) { await rpc('assignment_check', { p_assignment: id, p_done: done }); }

/** For a teacher: the class sections they lead. */
export async function mySections(): Promise<Section[]> {
  if (!live || !current) return [];
  return ((await rpc('my_sections'))).map((r) => ({ id: r.id, name: r.name, students: Number(r.students) }));
}

export function subscribeAssignments(onChange: () => void): () => void {
  return subscribeChanges('subscribeAssignments', [{ event: '*', table: 'assignments' }, { event: '*', table: 'assignment_done' }], onChange);
}

/** A file picked to turn in (src/assignments/pickWork.ts). */
export type WorkUpload = { name: string; mimeType: WorkType; body: ArrayBuffer | Blob; size: number };

/**
 * A student turns in a file for a class assignment: uploaded into their own folder, then added. A file that couldn't
 * be added isn't left behind.
 */
export async function turnInWork(assignmentId: string, f: WorkUpload): Promise<AssignmentFile> {
  const me = current?.id;
  if (!live || !me) throw new Error('Sign in first.');
  const path = `${me}/${assignmentId}/${Date.now().toString(36)}.${WORK_TYPES[f.mimeType].ext}`;
  await run(sb().storage.from(FILES).upload(path, f.body, { contentType: f.mimeType }));
  try {
    return fileOf(await rpc('assignment_file_add', { p_assignment: assignmentId, p_path: path, p_name: f.name, p_mime: f.mimeType, p_size: f.size }));
  } catch (e) {
    await sb().storage.from(FILES).remove([path]).catch(() => {});
    throw e;
  }
}

/** A student takes back a file they turned in (and its upload). */
export async function removeWork(fileId: string) {
  const path = await rpc('assignment_file_remove', { p_id: fileId });
  if (path) await sb().storage.from(FILES).remove([path]).catch(() => {});
}

/** For the class's teachers: every student in the class and the files they turned in; null for anyone else. */
export async function assignmentWork(assignmentId: string): Promise<StudentWork[] | null> {
  if (!live || !current) return null;
  const list = (await rpc('assignment_work', { p_assignment: assignmentId })) as unknown as
    { studentId: string; name: string; files: { id: string; name: string; mimeType: string; size: number; path: string; at: string }[] }[] | null;
  return list && list.map((w) => ({ studentId: w.studentId, name: w.name,
    files: w.files.map((x) => ({ ...x, assignmentId, studentId: w.studentId })) }));
}

/** A link to open a turned-in file for five minutes (the student and the class's teachers only). */
export async function workFileUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from(FILES).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("Couldn't open the file.");
  return data.signedUrl;
}

/** Links to download several turned-in files for ten minutes (the class's teachers' Download all), in the same order. */
export async function workFileUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await sb().storage.from(FILES).createSignedUrls(paths, 600);
  if (error || !data) throw new Error("Couldn't download the files.");
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => {
    const url = byPath.get(p);
    if (!url) throw new Error("Couldn't download every file. Try again.");
    return url;
  });
}
