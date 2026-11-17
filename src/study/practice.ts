/**
 * Practicing a deck (app/study/practice.tsx): a quiz with four choices, matching terms to meanings, or typing the
 * answer, then a score and the cards missed. Practice never moves cards between the Leitner boxes (that's Study), and
 * nothing is saved. No app imports, so tests run it.
 */
import { shuffle } from './session';

export type PracticeCard = { id: string; front: string; back: string };
export type PracticeMode = 'quiz' | 'match' | 'type';
/** What a question shows: the term (answer with the meaning) or the meaning (answer with the term). */
export type Showing = 'term' | 'meaning';

/** The most questions in one quiz or typing round. */
export const PRACTICE_MAX = 20;
/** Pairs on the screen at once when matching. */
export const MATCH_PAIRS = 6;

export const promptOf = (c: PracticeCard, showing: Showing) => (showing === 'term' ? c.front : c.back);
export const answerOf = (c: PracticeCard, showing: Showing) => (showing === 'term' ? c.back : c.front);

/** The cards a round asks about: shuffled, at most PRACTICE_MAX. */
export const practiceCards = <T extends PracticeCard>(cards: T[], random = Math.random) => shuffle(cards, random).slice(0, PRACTICE_MAX);

/** Which modes a deck can do: a quiz and matching need at least two cards with different answers. */
export function modesFor(cards: PracticeCard[]): PracticeMode[] {
  const distinct = (key: 'front' | 'back') => new Set(cards.map((c) => normalize(c[key]))).size;
  const two = cards.length >= 2 && distinct('front') >= 2 && distinct('back') >= 2;
  return two ? ['quiz', 'match', 'type'] : cards.length ? ['type'] : [];
}

/** A quiz question's choices: the right answer and up to three others from the deck (never the same text), shuffled. */
export function choicesFor(card: PracticeCard, cards: PracticeCard[], showing: Showing, random = Math.random): string[] {
  const right = answerOf(card, showing);
  const seen = new Set([normalize(right)]);
  const others: string[] = [];
  for (const c of shuffle(cards, random)) {
    const a = answerOf(c, showing);
    if (seen.has(normalize(a))) continue;
    seen.add(normalize(a));
    others.push(a);
    if (others.length === 3) break;
  }
  return shuffle([right, ...others], random);
}

/** Matching rounds of up to MATCH_PAIRS cards each (every card once), a short last round joined to the one before. */
export function matchRounds<T extends PracticeCard>(cards: T[], random = Math.random): T[][] {
  const all = shuffle(cards, random);
  const rounds: T[][] = [];
  for (let i = 0; i < all.length; i += MATCH_PAIRS) rounds.push(all.slice(i, i + MATCH_PAIRS));
  if (rounds.length > 1 && rounds[rounds.length - 1].length < 3) {
    const last = rounds.pop()!;
    rounds[rounds.length - 1] = [...rounds[rounds.length - 1], ...last];
  }
  return rounds;
}

/** For comparing answers: lower case, no accents or punctuation, single spaces. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Without a leading "the", "a", "an" or "to" ("the apple" and "apple", "to run" and "run" both count). */
const bare = (text: string) => normalize(text).replace(/^(the|a|an|to) /, '');

/** How many letters to add, drop or change to turn one into the other. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

export type TypedResult = 'right' | 'almost' | 'wrong';

/**
 * A typed answer against the card's: right when they match ignoring case, accents, punctuation and a leading article;
 * almost (counted right, with the spelling shown) for a small typo; wrong otherwise. An answer with several parts
 * ("rojo; red", "big / large") takes any one of them.
 */
export function checkTyped(typed: string, expected: string): TypedResult {
  const t = bare(typed);
  if (!t) return 'wrong';
  const options = [expected, ...expected.split(/\s*[;/]\s*|\s+or\s+/i)].map(bare).filter(Boolean);
  if (options.includes(t)) return 'right';
  const near = options.some((o) => o.length >= 4 && editDistance(t, o) <= (o.length >= 10 ? 2 : 1));
  return near ? 'almost' : 'wrong';
}

/** "8 of 10 right · 80%". */
export function scoreLine(right: number, total: number): string {
  return `${right} of ${total} right · ${total ? Math.round((right / total) * 100) : 0}%`;
}

/** A word for the score. */
export function cheer(right: number, total: number): string {
  const p = total ? right / total : 0;
  return p === 1 ? 'Perfect!' : p >= 0.8 ? 'Great work!' : p >= 0.6 ? 'Getting there!' : 'Keep practicing!';
}
