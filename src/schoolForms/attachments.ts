/**
 * Pictures, PDFs and links on class bulletins and teachers' notes: the file types and size (the 'folder-files' bucket
 * takes the same, supabase/migrations/…_folder_attachments.sql; tests/folder-attachments.test.ts compares), how many,
 * and what a link is called. No app imports, so tests run it.
 */
export const ATTACH_MAX = 6;
export const ATTACH_MAX_MB = 15;
export const ATTACH_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' } as const;
export type AttachMime = keyof typeof ATTACH_TYPES;

/** One on a note, as the server sends it. A picture or a PDF has a `path` in the bucket; a link a `url`. */
export type FolderAttachment = {
  id: string; kind: 'image' | 'pdf' | 'link'; path: string | null; url: string | null; name: string; width: number | null; height: number | null;
};

/** A link a teacher typed, made whole ("www.example.com/x" → "https://www.example.com/x"); null when it isn't one. */
export function cleanLink(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const url = /^https?:\/\//i.test(t) ? t.replace(/^http:\/\//i, 'https://') : `https://${t}`;
  return /^https:\/\/[^\s/]+\.[^\s]+$/i.test(url) && url.length <= 500 ? url : null;
}

/** What a link is called when the teacher didn't name it: its site ("www.example.com"). */
export const linkName = (url: string) => url.replace(/^https:\/\//i, '').split(/[/?#]/)[0];

/** Pictures first (they lead the paper), then PDFs and links in the order they were added. */
export function splitAttachments<T extends Pick<FolderAttachment, 'kind'>>(list: T[]): { pictures: T[]; others: T[] } {
  return { pictures: list.filter((a) => a.kind === 'image'), others: list.filter((a) => a.kind !== 'image') };
}

/** "2 pictures · 1 PDF · 1 link". */
export function attachmentLine(list: Pick<FolderAttachment, 'kind'>[]): string {
  const n = (k: FolderAttachment['kind']) => list.filter((a) => a.kind === k).length;
  const part = (c: number, one: string, many: string) => (c ? `${c} ${c === 1 ? one : many}` : '');
  return [part(n('image'), 'picture', 'pictures'), part(n('pdf'), 'PDF', 'PDFs'), part(n('link'), 'link', 'links')].filter(Boolean).join(' · ');
}
