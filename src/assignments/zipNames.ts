/**
 * Names inside a class's "Download all" ZIP (src/assignments/downloadAll.ts): a folder per student who turned in work,
 * each file under its own name, made safe for every computer and never twice the same ("Essay (2).docx"). No app
 * imports, so tests run it.
 */
import type { StudentWork } from '../api/types';

/** The most a teacher downloads at once: the phone holds the whole ZIP while it's made. */
export const ZIP_MAX_MB = 250;

/** A name any computer accepts: no slashes or other reserved characters, no leading dots, not too long. */
export function safeName(name: string, fallback = 'File'): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120).trim();
  return clean || fallback;
}

/** The ZIP's own file name: "<assignment> - <class>.zip". */
export function zipName(title: string, className: string | null): string {
  return `${safeName([title, className].filter(Boolean).join(' - '), 'Assignment')}.zip`;
}

export type ZipEntry = { path: string; fileId: string; filePath: string };

/** Each turned-in file's place in the ZIP, students in the order given (by last name). */
export function zipEntries(work: StudentWork[]): ZipEntry[] {
  const out: ZipEntry[] = [];
  const folders = new Set<string>();
  for (const w of work) {
    if (w.files.length === 0) continue;
    let folder = safeName(w.name, 'Student');
    for (let k = 2; folders.has(folder.toLowerCase()); k++) folder = `${safeName(w.name, 'Student')} (${k})`;
    folders.add(folder.toLowerCase());
    const used = new Set<string>();
    for (const f of w.files) {
      const name = safeName(f.name);
      const dot = name.lastIndexOf('.');
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      let unique = name;
      for (let k = 2; used.has(unique.toLowerCase()); k++) unique = `${stem} (${k})${ext}`;
      used.add(unique.toLowerCase());
      out.push({ path: `${folder}/${unique}`, fileId: f.id, filePath: f.path });
    }
  }
  return out;
}

/** How many megabytes the files come to. */
export const totalMb = (work: StudentWork[]) => work.reduce((n, w) => n + w.files.reduce((m, f) => m + f.size, 0), 0) / (1024 * 1024);
