/**
 * Kingdom Heights' uniform, from the 2026–2027 Uniform Guide: the daily uniform, the Wednesday
 * Chapel uniform with its details by grade band, and the notes the Planner adds. No app imports,
 * so tests run it.
 */
import type { UniformRules } from '../../src/info/today';

const DAILY = {
  boys: ['White, navy or light blue polo, or a white or light blue oxford', 'Khaki or navy pants or shorts', 'Black or brown belt if needed'],
  girls: ['White, navy or light blue polo, or a white or light blue Peter Pan blouse', 'Khaki or navy pants or shorts, or an approved skirt, skort or jumper'],
  shoes: 'Closed-toe shoes, mostly white, black, brown or navy. Sneakers are fine.',
};
const CHAPEL = {
  boys: ['White or light blue oxford with a tie', 'Sweater vest or blazer (by grade)', 'Uniform pants', 'Black or brown belt if needed'],
  girls: ['White or light blue Peter Pan blouse with a crossbow', 'Approved skirt, skort or jumper'],
  shoes: 'Black, brown or navy dress shoes. No sneakers on Chapel Day.',
};
/** The Chapel uniform by grade band (grades: K2 = −3 … 12th = 12). */
const CHAPEL_BANDS: { from: number; to: number; label: string; text: string }[] = [
  { from: -3, to: -2, label: 'K2–K3', text: 'boys wear a tie, white oxford and khaki or navy pants; girls a Peter Pan blouse, crossbow, and navy polo dress or approved skort or jumper.' },
  { from: -1, to: 5, label: 'K4–5th', text: 'boys wear the KHPS sweater vest over a white oxford; girls may wear the KHPS cardigan or vest.' },
  { from: 6, to: 8, label: '6th–8th', text: 'boys wear the KHPS sweater vest over a plain white oxford, or the KHPS blazer; girls may wear the “at the knee” plaid or khaki pleated skirt, and the KHPS cardigan or vest.' },
  { from: 9, to: 12, label: '9th–12th', text: 'the KHPS blazer is required.' },
];

export const UNIFORM: UniformRules = {
  daily: DAILY,
  chapel: CHAPEL,
  chapelDay: 3,
  chapelBands: CHAPEL_BANDS,
  peNote: 'On your PE days, wear the PE uniform with white or black athletic shoes.',
  spiritNote: 'Spirit Day: Kingdom Heights sweatshirts are allowed.',
  guide: 'https://www.khroyals.com/s/Uniform-Guide.pdf',
};
