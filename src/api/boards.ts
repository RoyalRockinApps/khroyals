/**
 * boards: internal API implementation. Screens import the connect facade. Bulletin boards (the Boards tab;
 * supabase/migrations/…_bulletin_boards.sql): an academy's main board or a teacher's, with notes and student work
 * pinned to it, a strip of album photos, announcements and (teacher boards) a parent chat. Student work photos are in
 * the private 'boards' bucket. Builds without the school server use src/boards/sample.ts.
 */
import type { Board, BoardChatMessage, BoardItem, BoardPost } from './types';
import { live, rpc, run, sb } from './client';
import { current, me } from './session';
import { getAlbum } from './gallery';
import { subscribeChanges } from './realtime';
import { removeStoredPhoto, signedPhotoUrls, uploadJpeg } from './storage';
import * as demo from '../boards/sample';

const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const numbers = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b) : []);
function toBoard(r: any): Board {
  return {
    id: r.id, kind: r.kind === 'academy' ? 'academy' : 'teacher', academyId: r.academyId ?? null, academyName: r.academyName ?? null,
    minGrade: r.minGrade ?? null, maxGrade: r.maxGrade ?? null, position: r.position ?? null, teacherId: r.teacherId ?? null,
    teacherName: r.teacherName ?? null, teacherAvatar: r.teacherAvatar ?? '', title: r.title ?? '', byline: r.byline ?? '',
    background: r.background ?? 'cork', border: r.border ?? 'scallop-red', editor: !!r.editor, leads: !!r.leads, family: !!r.family, chat: !!r.chat,
    children: strings(r.children), grades: numbers(r.grades), sections: strings(r.sections), items: Number(r.items ?? 0),
    lastPostAt: r.lastPostAt ?? null, albumId: r.albumId ?? null, linkedAlbumId: r.linkedAlbumId ?? null,
  };
}

/** Every board the signed-in person reads: academies first, then teachers by name. */
export async function myBoards(): Promise<Board[]> {
  if (!live) return demo.sampleBoards(me());
  if (!current || current.pending) return [];
  const rows = await rpc('my_boards');
  return Array.isArray(rows) ? rows.map(toBoard) : [];
}

/** One board (null when it's gone or isn't theirs to read). */
export async function boardView(id: string): Promise<Board | null> {
  if (!live) return demo.sampleBoard(id, me());
  const r = await rpc('board_view', { p_board: id });
  return r && typeof r === 'object' && !Array.isArray(r) ? toBoard(r) : null;
}

/** What's pinned to a board, front first, with links to its photos. */
export async function boardItems(id: string): Promise<BoardItem[]> {
  if (!live) return demo.sampleItems(id).map((i) => ({ ...i }));
  const rows = await run(sb().from('board_items').select('*').eq('board_id', id).order('position', { ascending: false }));
  const urls = await signedPhotoUrls('boards', rows.flatMap((r) => (r.image ? [r.image] : []))).catch(() => ({} as Record<string, string>));
  return rows.map((r) => ({
    id: r.id, boardId: r.board_id, kind: r.kind === 'photo' ? 'photo' : 'note', body: r.body, color: r.color, image: r.image,
    photo: r.image ? urls[r.image] ?? '' : '', position: r.position, createdAt: r.created_at,
  }));
}

/** A board's announcements: pinned ones first, then the newest. */
export async function boardPosts(id: string): Promise<BoardPost[]> {
  const order = (list: BoardPost[]) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  if (!live) return order(demo.samplePosts(id));
  const rows = await run(sb().from('board_posts').select('*').eq('board_id', id).order('created_at', { ascending: false }).limit(100));
  return order(rows.map((r) => ({
    id: r.id, boardId: r.board_id, authorId: r.author_id, title: r.title, body: r.body, pinned: r.pinned, createdAt: r.created_at, updatedAt: r.updated_at,
  })));
}

/** The latest 200 chat messages, oldest first (empty for anyone not in the chat). */
export async function boardChat(id: string): Promise<BoardChatMessage[]> {
  if (!live) return demo.sampleChat(id).map((m) => ({ ...m }));
  const rows = await run(sb().from('board_chat_messages').select('*').eq('board_id', id).order('created_at', { ascending: false }).limit(200));
  return rows.reverse().map((r) => ({ id: r.id, boardId: r.board_id, authorId: r.author_id, body: r.body, createdAt: r.created_at }));
}

export async function pinBoardNote(board: string, body: string, color: string): Promise<void> {
  if (!live) return demo.samplePin(board, 'note', body, color);
  await rpc('board_pin', { p_board: board, p_kind: 'note', p_body: body, p_color: color, p_image: null });
}

/** Uploads a photo of student work (a JPEG) and pins it with its caption; the upload goes again if pinning fails. */
export async function pinBoardPhoto(board: string, base64: string, caption: string): Promise<void> {
  if (!live) return demo.samplePin(board, 'photo', caption, 'white', `data:image/jpeg;base64,${base64}`);
  if (!current) throw new Error('Sign in first.');
  const path = `${current.id}/${Date.now()}.jpg`;
  await uploadJpeg('boards', path, base64);
  try {
    await rpc('board_pin', { p_board: board, p_kind: 'photo', p_body: caption, p_color: 'white', p_image: path });
  } catch (error) {
    await removeStoredPhoto('boards', path).catch(() => {});
    throw error;
  }
}

export async function boardItemToFront(item: string): Promise<void> {
  if (!live) return demo.sampleFront(item);
  await rpc('board_item_front', { p_item: item });
}

/** Takes something down (and its photo file, when it's the caller's). */
export async function unpinBoardItem(item: string): Promise<void> {
  if (!live) return demo.sampleUnpin(item);
  const image = await rpc('board_unpin', { p_item: item });
  await removeStoredPhoto('boards', image).catch(() => {});
}

export async function decorateBoard(board: string, d: { title: string; byline: string; background: string; border: string; albumId: string | null }) {
  if (!live) return demo.sampleDecorate(board, d);
  await rpc('board_decorate', { p_board: board, p_title: d.title, p_byline: d.byline, p_background: d.background, p_border: d.border, p_album: d.albumId });
}

/** Staff put in charge of a board by an admin (ids). */
export async function boardEditors(board: string): Promise<string[]> {
  if (!live) return [];
  return (await run(sb().from('board_editors').select('user_id').eq('board_id', board))).map((r) => r.user_id);
}

export async function setBoardEditor(board: string, user: string, on: boolean): Promise<void> {
  if (!live) return;
  await rpc('board_editor_set', { p_board: board, p_user: user, p_on: on });
}

export async function saveBoardPost(p: { id?: string | null; boardId: string; title: string; body: string; pinned: boolean }): Promise<void> {
  if (!live) return demo.sampleSavePost(p, me());
  await rpc('board_post_save', { p_id: p.id ?? null, p_board: p.boardId, p_title: p.title, p_body: p.body, p_pinned: p.pinned });
}

export async function deleteBoardPost(id: string): Promise<void> {
  if (!live) return demo.sampleDeletePost(id);
  await rpc('board_post_delete', { p_id: id });
}

export async function sendBoardChat(board: string, body: string): Promise<void> {
  if (!live) return demo.sampleSendChat(board, body, me());
  await rpc('board_chat_send', { p_board: board, p_body: body });
}

export async function deleteBoardChat(id: string): Promise<void> {
  if (!live) return demo.sampleDeleteChat(id);
  await rpc('board_chat_delete', { p_id: id });
}

/** The newest photos of the album a board shows, for its strip (null when the caller can't see the album). */
export async function boardPhotos(albumId: string, limit = 12): Promise<{ id: string; thumb: string }[] | null> {
  if (!live) return demo.samplePhotos(albumId).slice(0, limit);
  const a = await getAlbum(albumId).catch(() => null);
  if (!a) return null;
  return [...a.photos].reverse().slice(0, limit).map((p) => ({ id: p.id, thumb: p.thumb }));
}

/** Reload when something on the board, its announcements or its chat changes. */
export function subscribeBoard(id: string, onChange: () => void) {
  return subscribeChanges(`board-${id}`, [
    { table: 'board_items', filter: `board_id=eq.${id}` },
    { table: 'board_posts', filter: `board_id=eq.${id}` },
    { table: 'board_chat_messages', filter: `board_id=eq.${id}` },
  ], onChange);
}
