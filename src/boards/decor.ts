/**
 * How a bulletin board is decorated: its background, its border trim and the colors of the notes pinned to it. The
 * keys are also the database's checks (boards.background, boards.border, board_items.color; tests/boards.test.ts
 * compares them). And what a board is called when its teacher hasn't named it. No app imports, so tests run it.
 */
import { gradeLabel } from '../comms/grades';

export const BACKGROUNDS = {
  cork: { label: 'Cork', color: '#C79A6B', speck: '#9C6F43', dark: false },
  navy: { label: 'Blue felt', color: '#1F3B73', speck: '#2C4C8C', dark: true },
  red: { label: 'Red paper', color: '#C2352B', speck: '#D0473D', dark: true },
  yellow: { label: 'Yellow paper', color: '#F4D35E', speck: '#E8C54B', dark: false },
  green: { label: 'Green paper', color: '#3E8E5B', speck: '#4C9C69', dark: true },
  sky: { label: 'Sky blue', color: '#8CC4EA', speck: '#7DB6DE', dark: false },
  chalk: { label: 'Chalkboard', color: '#2E4B3A', speck: '#3D5C49', dark: true },
} as const;
export type Background = keyof typeof BACKGROUNDS;

/** Scalloped trim in one color (or the rainbow's), a wooden frame, or none. */
export const BORDERS = {
  'scallop-red': { label: 'Red scallops', colors: ['#D62828'] },
  'scallop-gold': { label: 'Gold scallops', colors: ['#E3B23C'] },
  'scallop-blue': { label: 'Blue scallops', colors: ['#2563EB'] },
  'scallop-green': { label: 'Green scallops', colors: ['#2E9E5B'] },
  rainbow: { label: 'Rainbow', colors: ['#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#457B9D', '#8E44AD'] },
  wood: { label: 'Wooden frame', colors: ['#8B5A2B'] },
  none: { label: 'No border', colors: [] },
} as const satisfies Record<string, { label: string; colors: readonly string[] }>;
export type Border = keyof typeof BORDERS;

export const PAPERS = {
  yellow: '#FFF3A3', pink: '#FFC8DD', blue: '#CDE7FF', green: '#CDF2C9', white: '#FFFFFF', orange: '#FFD8A8',
} as const;
export type Paper = keyof typeof PAPERS;

/** Pushpin heads, picked by each item's id so a pin stays the same color. */
export const PINS = ['#E63946', '#2563EB', '#F4A300', '#2E9E5B', '#8E44AD'];

/** A steady number from an id: the same tilt and pin for an item every time. */
export function idHash(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** A small tilt, -3.5° to 3.5°, like something pinned by hand. */
export const tilt = (id: string) => ((idHash(id) % 15) - 7) / 2;

/** "1st Grade", "Kindergarten", "K4". */
export function gradeTitle(g: number) {
  return g >= 1 ? `${gradeLabel(g)} Grade` : gradeLabel(g);
}

export type BoardName = {
  kind: 'academy' | 'teacher'; title: string; byline: string; academyName: string | null; minGrade: number | null; maxGrade: number | null;
  teacherName: string | null; grades: number[]; sections: string[];
};

/**
 * What the board says at the top. An academy's: its name, its grades under it. A teacher's: the title they gave it,
 * else their class's grade ("1st Grade") when all their students are in one, else their one class's name, else
 * "Mrs. Smith's class"; their name under it (or the one they chose).
 */
export function boardHeading(b: BoardName): { title: string; byline: string } {
  if (b.kind === 'academy') {
    const grades = b.minGrade == null || b.maxGrade == null ? '' : `${gradeLabel(b.minGrade)}–${gradeLabel(b.maxGrade)}`.replace('Kindergarten', 'K');
    return { title: b.title || b.academyName || 'School board', byline: b.byline || grades };
  }
  const name = b.teacherName ?? 'Teacher';
  const title = b.title
    || (b.grades.length === 1 ? gradeTitle(b.grades[0]) : b.sections.length === 1 ? b.sections[0] : `${name.split(' ').slice(-1)[0]}'s class`);
  return { title, byline: b.byline || name };
}
