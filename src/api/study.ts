/**
 * study: internal API implementation. Screens import the connect facade. A student's own notes and flash cards
 * (the Study app; supabase/migrations/…_study.sql): private to them, written only through the study_* functions.
 * Builds without the school server use the demo data in src/study/sample.ts.
 */
import type { CardText, StudyCard, StudyDeck, StudyNote, StudyNoteSummary } from './types';
import type { Database } from './database.types';
import { live, rpc, run, sb } from './client';
import * as demo from '../study/sample';
import { schoolToday } from '../calendar/past';
import { subjectChoices } from '../study/subjects';

type CardRow = Database['public']['Tables']['study_cards']['Row'];
const toCard = (r: CardRow): StudyCard => ({
  id: r.id, deckId: r.deck_id, front: r.front, back: r.back, position: r.position, box: r.box, dueOn: r.due_on, reviewedAt: r.reviewed_at,
});

/** The student's notes, newest first; `query` keeps the ones with every word of it. */
export async function studyNotes(query?: string): Promise<StudyNoteSummary[]> {
  if (!live) return demo.sampleNotes(query);
  return (await rpc('study_notes_list', { p_query: query?.trim() || null }))
    .map((r) => ({ id: r.id, title: r.title, subject: r.subject, preview: r.preview ?? '', updatedAt: r.updated_at }));
}

export async function studyNote(id: string): Promise<StudyNote | null> {
  if (!live) return demo.sampleNote(id);
  const rows = await run(sb().from('study_notes').select('*').eq('id', id).limit(1));
  const r = rows[0];
  return r ? { id: r.id, title: r.title, subject: r.subject, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at } : null;
}

/** Saves a note (a new one without `id`); returns its id. */
export async function saveStudyNote(n: { id?: string | null; title: string; body: string; subject: string }): Promise<string> {
  if (!live) return demo.sampleSaveNote(n);
  return rpc('study_note_save', { p_id: n.id ?? null, p_title: n.title, p_body: n.body, p_subject: n.subject });
}

export async function deleteStudyNote(id: string): Promise<void> {
  if (!live) return demo.sampleDeleteNote(id);
  await rpc('study_note_delete', { p_id: id });
}

/** Classes and subjects to file things under: the ones used before and the student's classes ("English 10"). */
export async function studySubjects(): Promise<string[]> {
  return subjectChoices(live ? await rpc('study_subjects') : demo.sampleSubjects());
}

/** The student's decks, the ones used last first, with their counts. */
export async function studyDecks(): Promise<StudyDeck[]> {
  if (!live) return demo.sampleDecks();
  return (await rpc('study_decks_list')).map((r) => ({
    id: r.id, title: r.title, subject: r.subject, noteId: r.note_id ?? null, cards: r.cards, due: r.due, fresh: r.fresh, known: r.known,
    nextDue: r.next_due ?? null, studiedAt: r.studied_at ?? null, updatedAt: r.updated_at,
  }));
}

/** A deck and its cards in order (null when it's gone or isn't theirs). */
export async function studyDeck(id: string): Promise<{ deck: StudyDeck; cards: StudyCard[] } | null> {
  const deck = (await studyDecks()).find((d) => d.id === id);
  if (!deck) return null;
  if (!live) return { deck, cards: demo.sampleCards(id).map((c) => ({ ...c })) };
  const cards = await run(sb().from('study_cards').select('*').eq('deck_id', id).order('position'));
  return { deck, cards: cards.map(toCard) };
}

/** Every card due now across the student's decks (at most 200), the ones furthest behind first. */
export async function dueStudyCards(): Promise<StudyCard[]> {
  const today = schoolToday();
  if (!live) return demo.sampleCards().filter((c) => c.dueOn <= today).map((c) => ({ ...c }));
  const rows = await run(sb().from('study_cards').select('*').lte('due_on', today).order('due_on').order('position').limit(200));
  return rows.map(toCard);
}

/** Makes a deck (`noteId`: the note it's made from) or renames one; returns its id. */
export async function saveStudyDeck(d: { id?: string | null; title: string; subject: string; noteId?: string | null }): Promise<string> {
  if (!live) return demo.sampleSaveDeck(d);
  return rpc('study_deck_save', { p_id: d.id ?? null, p_title: d.title, p_subject: d.subject, p_note: d.noteId ?? null });
}

export async function deleteStudyDeck(id: string): Promise<void> {
  if (!live) return demo.sampleDeleteDeck(id);
  await rpc('study_deck_delete', { p_id: id });
}

/** Every card in the deck new again. */
export async function resetStudyDeck(id: string): Promise<void> {
  if (!live) return demo.sampleResetDeck(id);
  await rpc('study_deck_reset', { p_id: id });
}

/** Adds cards to the end of a deck; returns how many. */
export async function addStudyCards(deckId: string, cards: CardText[]): Promise<number> {
  if (!live) return demo.sampleAddCards(deckId, cards);
  return rpc('study_cards_add', { p_deck: deckId, p_cards: cards.map((c) => ({ front: c.front, back: c.back })) });
}

export async function editStudyCard(id: string, front: string, back: string): Promise<void> {
  if (!live) return demo.sampleEditCard(id, front, back);
  await rpc('study_card_edit', { p_id: id, p_front: front, p_back: back });
}

export async function deleteStudyCard(id: string): Promise<void> {
  if (!live) return demo.sampleDeleteCard(id);
  await rpc('study_card_delete', { p_id: id });
}

/** The student knew a card, or is still learning it; returns it with its new box and due day. */
export async function reviewStudyCard(id: string, knew: boolean): Promise<StudyCard> {
  if (!live) return demo.sampleReview(id, knew);
  return toCard(await rpc('study_card_review', { p_id: id, p_knew: knew }));
}
