/**
 * Bulletin boards' demo data (builds without the school server): the four academies' boards and two teachers', with
 * notes, student work, announcements and a parent chat, kept in memory and changed the way the database's functions
 * change them (supabase/migrations/…_bulletin_boards.sql). Gone on a reload.
 */
import type { Board, BoardChatMessage, BoardItem, BoardPost, Person } from '../api/types';

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
/** Drawn in the app (src/boards/Corkboard.tsx KidArt), so the demo needs no photos from the internet. */
const pic = (seed: string, _size = 480) => `demo:${seed}`;
let seq = 0;
const newId = (kind: string) => `demo-${kind}-${++seq}`;

type Row = Omit<Board, 'editor' | 'leads' | 'family' | 'chat' | 'children' | 'items' | 'lastPostAt' | 'linkedAlbumId'> & { students: boolean };

const academy = (id: string, name: string, minGrade: number, maxGrade: number, position: number, background: string, border: string): Row => ({
  id: `demo-board-${id}`, kind: 'academy', academyId: id, academyName: name, minGrade, maxGrade, position, teacherId: null, teacherName: null,
  teacherAvatar: '', title: '', byline: '', background, border, grades: [], sections: [], albumId: 'demo-album-academy', students: id === 'kingdom',
});
const teacher = (id: string, name: string, extra: Partial<Row>): Row => ({
  id: `demo-board-${id}`, kind: 'teacher', academyId: null, academyName: null, minGrade: null, maxGrade: null, position: null,
  teacherId: id, teacherName: name, teacherAvatar: '', title: '', byline: '', background: 'cork', border: 'scallop-red',
  grades: [], sections: [], albumId: 'demo-album-class', students: true, ...extra,
});

let state: { boards: Row[]; items: BoardItem[]; posts: BoardPost[]; chat: BoardChatMessage[] } | null = null;

function data() {
  if (state) return state;
  const boards: Row[] = [
    academy('early-learning', 'Early Learning Academy', -3, -1, 1, 'yellow', 'rainbow'),
    academy('formation', 'Formation Academy', 0, 5, 2, 'sky', 'scallop-blue'),
    academy('presence', 'Presence Academy', 6, 8, 3, 'green', 'scallop-gold'),
    academy('kingdom', 'Kingdom Academy', 9, 12, 4, 'navy', 'scallop-gold'),
    teacher('u-eng', 'Jennifer Taylor', { byline: 'Mrs. Taylor', grades: [10], sections: ['English 10 – Period 3'], background: 'cork', border: 'scallop-red' }),
    teacher('u-sci', 'Jessica Morgan', { title: '1st Grade', byline: 'Mrs. Morgan', grades: [1], sections: ['1st Grade'], background: 'red', border: 'rainbow', students: false }),
  ];
  const item = (board: string, kind: 'note' | 'photo', body: string, color: string, position: number, image?: string): BoardItem => ({
    id: newId('item'), boardId: `demo-board-${board}`, kind, body, color, image: image ?? null, photo: image ?? '', position, createdAt: ago(position),
  });
  const items: BoardItem[] = [
    item('u-eng', 'note', 'Spelling test Friday! Study list 7.', 'pink', 6),
    item('u-eng', 'photo', 'Our flower drawings', 'white', 5, pic('leaves')),
    item('u-eng', 'note', 'Star readers this week: everyone who finished chapter 9 ⭐', 'yellow', 4),
    item('u-eng', 'photo', 'Rainbow science', 'white', 3, pic('diorama')),
    item('u-eng', 'note', 'Library day is Wednesday. Bring your books back!', 'blue', 2),
    item('u-sci', 'note', 'Welcome to 1st Grade! 🍎', 'yellow', 3),
    item('u-sci', 'photo', 'Art from this week', 'white', 2, pic('pumpkins')),
    item('kingdom', 'note', 'Homecoming week starts Monday. Dress-up days are on the calendar.', 'yellow', 3),
    item('kingdom', 'photo', 'Art show winners', 'white', 2, pic('sunrise')),
    item('formation', 'note', 'Grandparents Day is Friday, Nov 21.', 'green', 2),
  ];
  const post = (board: string, title: string, body: string, hours: number, pinned = false): BoardPost => ({
    id: newId('post'), boardId: `demo-board-${board}`, authorId: board.startsWith('u-') ? board : null, title, body, pinned,
    createdAt: ago(hours), updatedAt: ago(hours),
  });
  const posts: BoardPost[] = [
    post('u-eng', 'Field trip permission slips', 'Our trip to the library is next Thursday. Permission slips are due Monday; there is one in your Folder.', 30, true),
    post('u-eng', 'This week in English', 'We finished chapter 9 and started our book reports. Reading logs are due Friday.', 5),
    post('u-eng', 'Picture day', 'Picture day is Tuesday. Uniforms, please!', 70),
    post('kingdom', 'Chapel this week', 'Chapel is at 9:00 Wednesday in the gym. Parents are welcome.', 20),
    post('u-sci', 'Snack calendar', 'Thank you for signing up for snacks! The calendar is in your Folder.', 12),
  ];
  const chat = (board: string, author: string, body: string, hours: number): BoardChatMessage => ({
    id: newId('chat'), boardId: `demo-board-${board}`, authorId: author, body, createdAt: ago(hours),
  });
  const messages: BoardChatMessage[] = [
    chat('u-eng', 'u-p01', 'Does anyone have an extra copy of the reading list?', 26),
    chat('u-eng', 'u-p02', 'I can send a picture of ours tonight.', 25),
    chat('u-eng', 'u-eng', 'I put the list on the board too. Thanks for helping each other!', 24),
    chat('u-eng', 'u-p01', 'Can I send cookies for the class party Friday?', 2),
  ];
  state = { boards, items, posts, chat: messages };
  return state;
}

function shown(r: Row, me: Person | null): Board {
  const d = data();
  const staff = !!me && ['admin', 'teacher', 'staff'].includes(me.schoolRole);
  const editor = !!me && (me.id === r.teacherId || me.schoolRole === 'admin');
  const family = !!me && !staff && r.students;
  const { students: _students, ...board } = r;
  return {
    ...board, linkedAlbumId: r.albumId, editor, leads: !!me && me.id === r.teacherId, family, chat: r.kind === 'teacher' && (editor || (family && me?.schoolRole === 'parent')),
    children: family && me?.schoolRole === 'parent' ? ['Ava'] : [],
    items: d.items.filter((i) => i.boardId === r.id).length,
    lastPostAt: d.posts.filter((p) => p.boardId === r.id).map((p) => p.createdAt).sort().pop() ?? null,
  };
}

export const sampleBoards = (me: Person | null) => data().boards.map((b) => shown(b, me));
export const sampleBoard = (id: string, me: Person | null) => sampleBoards(me).find((b) => b.id === id) ?? null;
export const sampleItems = (board: string) => data().items.filter((i) => i.boardId === board).sort((a, b) => b.position - a.position);
export const samplePosts = (board: string) => data().posts.filter((p) => p.boardId === board);
export const sampleChat = (board: string) => data().chat.filter((m) => m.boardId === board);

/** Album photos for a board's strip. */
export const samplePhotos = (album: string) =>
  ['recess', 'art', 'reading', 'science', 'music', 'garden', 'lunch', 'chapel'].map((x) => ({ id: `${album}-${x}`, thumb: pic(`${album}-${x}`, 300) }));

export function samplePin(board: string, kind: 'note' | 'photo', body: string, color: string, image?: string) {
  const d = data();
  if (kind === 'note' && !body.trim()) throw new Error('Write something on the note.');
  if (d.items.filter((i) => i.boardId === board).length >= 40) throw new Error('The board is full (40 things). Take something down first.');
  const top = Math.max(0, ...d.items.filter((i) => i.boardId === board).map((i) => i.position));
  d.items.push({ id: newId('item'), boardId: board, kind, body: body.trim(), color, image: image ?? null, photo: image ?? '', position: top + 1,
    createdAt: new Date().toISOString() });
}
export function sampleFront(item: string) {
  const d = data();
  const it = d.items.find((i) => i.id === item);
  if (it) it.position = Math.max(...d.items.filter((i) => i.boardId === it.boardId).map((i) => i.position)) + 1;
}
export function sampleUnpin(item: string) { data().items = data().items.filter((i) => i.id !== item); }
export function sampleDecorate(board: string, d: { title: string; byline: string; background: string; border: string; albumId: string | null }) {
  const b = data().boards.find((x) => x.id === board);
  if (b) Object.assign(b, { title: d.title.trim(), byline: d.byline.trim(), background: d.background, border: d.border, albumId: d.albumId ?? b.albumId });
}
export function sampleSavePost(p: { id?: string | null; boardId: string; title: string; body: string; pinned: boolean }, me: Person | null) {
  if (!p.body.trim()) throw new Error('Write the announcement first.');
  const now = new Date().toISOString();
  const found = p.id ? data().posts.find((x) => x.id === p.id) : null;
  if (found) { Object.assign(found, { title: p.title.trim(), body: p.body.trim(), pinned: p.pinned, updatedAt: now }); return; }
  data().posts.push({ id: newId('post'), boardId: p.boardId, authorId: me?.id ?? null, title: p.title.trim(), body: p.body.trim(), pinned: p.pinned,
    createdAt: now, updatedAt: now });
}
export function sampleDeletePost(id: string) { data().posts = data().posts.filter((p) => p.id !== id); }
export function sampleSendChat(board: string, body: string, me: Person | null) {
  if (!body.trim()) throw new Error('Write a message first.');
  data().chat.push({ id: newId('chat'), boardId: board, authorId: me?.id ?? 'u-p01', body: body.trim(), createdAt: new Date().toISOString() });
}
export function sampleDeleteChat(id: string) { data().chat = data().chat.filter((m) => m.id !== id); }
