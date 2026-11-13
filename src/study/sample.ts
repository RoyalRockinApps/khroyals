/**
 * The Study app's demo data (builds without the school server): a few notes and decks kept in memory, changed the way
 * the database's functions change them (supabase/migrations/…_study.sql), so every screen works in the demo. Gone on
 * a reload.
 */
import type { CardText, StudyCard, StudyDeck, StudyNote, StudyNoteSummary } from '../api/types';
import { schoolToday } from '../calendar/past';

type Deck = { id: string; title: string; subject: string; noteId: string | null; studiedAt: string | null; updatedAt: string };

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();
let seq = 0;
const newId = (kind: string) => `demo-${kind}-${++seq}`;

const CELLS = `Mitochondria - makes energy for the cell (the powerhouse)
Nucleus - holds the cell's DNA and runs the cell
Ribosome - builds proteins
Cell membrane - lets things in and out of the cell
Chloroplast - where plants make food from sunlight
Cell wall - the stiff outer layer of plant cells

Plant cells have chloroplasts and a cell wall; animal cells don't.`;

let state: { notes: StudyNote[]; decks: Deck[]; cards: StudyCard[] } | null = null;

function data() {
  if (state) return state;
  const today = schoolToday();
  const notes: StudyNote[] = [
    { id: 'demo-note-cells', title: 'Cell parts', subject: 'Biology', body: CELLS, createdAt: ago(80), updatedAt: ago(30) },
    { id: 'demo-note-war', title: 'Causes of the Civil War', subject: 'U.S. History',
      body: 'Slavery and the fight over new states\nStates\' rights vs. the federal government\nLincoln\'s election in 1860\n\nEssay due Friday: pick two causes and explain how they connect.',
      createdAt: ago(60), updatedAt: ago(20) },
    { id: 'demo-note-quad', title: 'Quadratic formula', subject: 'Algebra II',
      body: 'x = (-b ± √(b² - 4ac)) / 2a\n\nThe discriminant (b² - 4ac) tells how many real answers:\nPositive: two\nZero: one\nNegative: none',
      createdAt: ago(40), updatedAt: ago(4) },
  ];
  const decks: Deck[] = [
    { id: 'demo-deck-spanish', title: 'La comida', subject: 'Spanish II', noteId: null, studiedAt: ago(26), updatedAt: ago(50) },
    { id: 'demo-deck-cells', title: 'Cell parts', subject: 'Biology', noteId: 'demo-note-cells', studiedAt: ago(3), updatedAt: ago(30) },
  ];
  const spanish: [string, string, number, number][] = [
    ['la manzana', 'the apple', 3, 0], ['el pan', 'the bread', 4, 4], ['la leche', 'the milk', 2, 0], ['el queso', 'the cheese', 1, 0],
    ['el pollo', 'the chicken', 5, 9], ['las uvas', 'the grapes', 1, 0], ['el desayuno', 'breakfast', 2, 1], ['la cena', 'dinner', 1, 0],
  ];
  const cards: StudyCard[] = [
    ...spanish.map(([front, back, box, inDays], i) => ({
      id: `demo-card-es-${i}`, deckId: 'demo-deck-spanish', front, back, position: i + 1, box, dueOn: addDays(today, inDays), reviewedAt: box > 1 ? ago(26) : null,
    })),
    ...(CELLS.split('\n').slice(0, 6).map((line, i) => {
      const [front, back] = line.split(' - ');
      return { id: `demo-card-cell-${i}`, deckId: 'demo-deck-cells', front, back, position: i + 1, box: i < 2 ? 4 : 1,
        dueOn: addDays(today, i < 2 ? 5 : 0), reviewedAt: i < 4 ? ago(3) : null };
    })),
  ];
  state = { notes, decks, cards };
  return state;
}

export function sampleNotes(query?: string | null): StudyNoteSummary[] {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return [...data().notes]
    .filter((n) => words.every((w) => `${n.title} ${n.subject} ${n.body}`.toLowerCase().includes(w)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((n) => ({ id: n.id, title: n.title, subject: n.subject, preview: n.body.replace(/\s+/g, ' ').trim().slice(0, 160), updatedAt: n.updatedAt }));
}

export const sampleNote = (id: string) => data().notes.find((n) => n.id === id) ?? null;

export function sampleSaveNote(n: { id?: string | null; title: string; body: string; subject: string }): string {
  const now = new Date().toISOString();
  const found = n.id ? data().notes.find((x) => x.id === n.id) : null;
  if (found) { Object.assign(found, { title: n.title.trim(), body: n.body, subject: n.subject.trim(), updatedAt: now }); return found.id; }
  const id = newId('note');
  data().notes.push({ id, title: n.title.trim(), body: n.body, subject: n.subject.trim(), createdAt: now, updatedAt: now });
  return id;
}

export function sampleDeleteNote(id: string) {
  const d = data();
  d.notes = d.notes.filter((n) => n.id !== id);
  for (const deck of d.decks) if (deck.noteId === id) deck.noteId = null;
}

export const sampleSubjects = () => [...new Set([...data().notes, ...data().decks].map((x) => x.subject).filter(Boolean)),
  'English 10 – Period 3', 'Chemistry – Period 5'];

export function sampleDecks(): StudyDeck[] {
  const today = schoolToday();
  return data().decks.map((d) => {
    const cards = data().cards.filter((c) => c.deckId === d.id);
    const later = cards.filter((c) => c.dueOn > today).map((c) => c.dueOn).sort();
    return {
      ...d, cards: cards.length, due: cards.filter((c) => c.dueOn <= today).length, fresh: cards.filter((c) => !c.reviewedAt).length,
      known: cards.filter((c) => c.box >= 4).length, nextDue: later[0] ?? null,
    };
  }).sort((a, b) => (b.studiedAt ?? b.updatedAt).localeCompare(a.studiedAt ?? a.updatedAt));
}

export const sampleCards = (deckId?: string) =>
  data().cards.filter((c) => !deckId || c.deckId === deckId).sort((a, b) => a.position - b.position);

export function sampleSaveDeck(d: { id?: string | null; title: string; subject: string; noteId?: string | null }): string {
  if (!d.title.trim()) throw new Error('Give the deck a name.');
  const now = new Date().toISOString();
  const found = d.id ? data().decks.find((x) => x.id === d.id) : null;
  if (found) { Object.assign(found, { title: d.title.trim(), subject: d.subject.trim(), updatedAt: now }); return found.id; }
  const id = newId('deck');
  data().decks.push({ id, title: d.title.trim(), subject: d.subject.trim(), noteId: d.noteId ?? null, studiedAt: null, updatedAt: now });
  return id;
}

export function sampleDeleteDeck(id: string) {
  const d = data();
  d.decks = d.decks.filter((x) => x.id !== id);
  d.cards = d.cards.filter((c) => c.deckId !== id);
}

export function sampleResetDeck(id: string) {
  for (const c of data().cards) if (c.deckId === id) Object.assign(c, { box: 1, dueOn: schoolToday(), reviewedAt: null });
  const deck = data().decks.find((x) => x.id === id);
  if (deck) deck.studiedAt = null;
}

export function sampleAddCards(deckId: string, cards: CardText[]): number {
  if (cards.some((c) => !c.front.trim() || !c.back.trim())) throw new Error('Every card needs a front and a back.');
  const top = Math.max(0, ...sampleCards(deckId).map((c) => c.position));
  cards.forEach((c, i) => data().cards.push({
    id: newId('card'), deckId, front: c.front.trim(), back: c.back.trim(), position: top + i + 1, box: 1, dueOn: schoolToday(), reviewedAt: null,
  }));
  const deck = data().decks.find((x) => x.id === deckId);
  if (deck) deck.updatedAt = new Date().toISOString();
  return cards.length;
}

export function sampleEditCard(id: string, front: string, back: string) {
  if (!front.trim() || !back.trim()) throw new Error('Every card needs a front and a back.');
  const c = data().cards.find((x) => x.id === id);
  if (c) Object.assign(c, { front: front.trim(), back: back.trim() });
}

export function sampleDeleteCard(id: string) { data().cards = data().cards.filter((c) => c.id !== id); }

/** The same rule as study_card_review. */
export function sampleReview(id: string, knew: boolean): StudyCard {
  const c = data().cards.find((x) => x.id === id);
  if (!c) throw new Error('This card isn\'t yours.');
  const box = knew ? Math.min(c.box + 1, 5) : 1;
  const days = !knew ? 0 : c.box === 5 ? 30 : ({ 2: 1, 3: 3, 4: 7 } as Record<number, number>)[box] ?? 14;
  Object.assign(c, { box, dueOn: addDays(schoolToday(), days), reviewedAt: new Date().toISOString() });
  const deck = data().decks.find((x) => x.id === c.deckId);
  if (deck) deck.studiedAt = c.reviewedAt;
  return { ...c };
}
