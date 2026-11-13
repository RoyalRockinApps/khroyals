/**
 * Flash cards from text (a note, or a list pasted into Add cards): one card per line, the term and its meaning split
 * by a tab, " - ", " – ", " — ", " = " or ": " ("Mitochondria - the powerhouse of the cell"). Bullets and numbers at
 * the start of a line are dropped; lines without a split are left out. No app imports, so tests run it.
 */
import type { CardText } from '../api/types';

/** The most cards made at once (study_cards_add takes up to 200). */
export const MOST_AT_ONCE = 200;

const BULLET = /^\s*(?:[-*•▪◦·]|\d{1,3}[.)]|[a-z][.)])\s+/i;
// The first tab, a spaced dash or equals sign, or a colon followed by a space (so "3:30" and "http://" stay whole).
const SPLIT = /\t+|\s+[-–—=]\s+|:\s+/;

/** The cards in `text`, in order; the front at most 500 characters and the back 1,000, as the database allows. */
export function parseCards(text: string): CardText[] {
  const cards: CardText[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(BULLET, '').trim();
    const m = SPLIT.exec(line);
    if (!m || m.index === 0) continue;
    const front = line.slice(0, m.index).trim();
    const back = line.slice(m.index + m[0].length).trim();
    if (!front || !back) continue;
    cards.push({ front: front.slice(0, 500), back: back.slice(0, 1000) });
  }
  return cards;
}
