/**
 * The files a student can turn in for an assignment (the 'assignment-files' bucket takes the same list:
 * supabase/migrations/20261116000087_assignment_files.sql; tests/assignment-files.test.ts compares). Photos of work go
 * up as JPEGs. No app imports, so tests run it.
 */
export const WORK_MAX_MB = 20;
export const WORK_MAX_FILES = 10;

/** Each type, its file extension and what to call it. */
export const WORK_TYPES = {
  'application/pdf': { ext: 'pdf', label: 'PDF' },
  'image/jpeg': { ext: 'jpg', label: 'Photo' },
  'image/png': { ext: 'png', label: 'Picture' },
  'text/plain': { ext: 'txt', label: 'Text' },
  'application/msword': { ext: 'doc', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', label: 'Word' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', label: 'PowerPoint' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', label: 'PowerPoint' },
  'application/vnd.ms-excel': { ext: 'xls', label: 'Excel' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', label: 'Excel' },
} as const;
export type WorkType = keyof typeof WORK_TYPES;

/** The type of a picked file, from what the phone says it is or else its name; null when it can't be turned in. */
export function workTypeOf(mimeType: string | null | undefined, name: string): WorkType | null {
  if (mimeType && mimeType in WORK_TYPES) return mimeType as WorkType;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpeg') return 'image/jpeg';
  const hit = (Object.keys(WORK_TYPES) as WorkType[]).find((t) => WORK_TYPES[t].ext === ext);
  return hit ?? null;
}

/** "2.4 MB", "830 KB". */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Turned in after the day it was due (school days are by the school's date, YYYY-MM-DD). */
export const turnedInLate = (dueOn: string | null, turnedInDay: string) => !!dueOn && turnedInDay > dueOn;
