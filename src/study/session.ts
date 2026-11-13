/**
 * A study session over some flash cards. Each answer takes the card off the top: knew it, and it's done for this
 * session; still learning, and it goes to the back of the line to come round again, until the student knows it.
 * (The database moves it through the boxes on every answer, study_card_review.) No app imports, so tests run it.
 */
export type StudySession<T extends { id: string }> = {
  queue: T[];
  /** How many different cards the session started with. */
  total: number;
  /** Cards known the first time they came up. */
  firstTry: string[];
  /** Cards missed at least once. */
  missed: string[];
};

/** Shuffled (Fisher–Yates with `random`, so tests can fix it). */
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function startSession<T extends { id: string }>(cards: T[]): StudySession<T> {
  return { queue: [...cards], total: cards.length, firstTry: [], missed: [] };
}

/** The card on top answered. */
export function answer<T extends { id: string }>(s: StudySession<T>, knew: boolean): StudySession<T> {
  const [card, ...rest] = s.queue;
  if (!card) return s;
  if (knew) {
    return { ...s, queue: rest, firstTry: s.missed.includes(card.id) ? s.firstTry : [...s.firstTry, card.id] };
  }
  return { ...s, queue: [...rest, card], missed: s.missed.includes(card.id) ? s.missed : [...s.missed, card.id] };
}

/** Cards finished (known) so far, out of `total`. */
export const finished = (s: StudySession<{ id: string }>) => s.total - new Set(s.queue.map((c) => c.id)).size;
