/**
 * The daily verse and devotion on students' Planner: internal API implementation. Screens import the connect facade.
 * The people who send the school's announcements write them for days ahead (daily_verse_save); everyone reads them.
 */
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { schoolToday } from '../calendar/past';

export type DailyVerse = { day: string; reference: string; verse: string; thought: string };

/** Demo builds show one (the King James Version, which anyone may quote). */
const SAMPLE: DailyVerse = {
  day: '', reference: 'Philippians 4:13', verse: 'I can do all things through Christ which strengtheneth me.',
  thought: 'Today will hold something hard: a test, a practice, a talk you would rather skip. You are not doing it alone. Ask for help, and keep going.',
};

const verseOf = (r: { day: string; reference: string; verse: string; thought: string }): DailyVerse =>
  ({ day: r.day, reference: r.reference, verse: r.verse, thought: r.thought ?? '' });

/** Today's verse, or the latest from the last week; null when there's none. */
export async function dailyVerseToday(): Promise<DailyVerse | null> {
  if (!live) return { ...SAMPLE, day: schoolToday() };
  if (!current) return null;
  const rows = (await rpc('daily_verse_today')) as unknown as DailyVerse[];
  return rows[0] ? verseOf(rows[0]) : null;
}

/** For the people who write them: from a week ago on, soonest first. */
export async function dailyVerses(): Promise<DailyVerse[]> {
  if (!live || !current) return [];
  const from = new Date(Date.parse(`${schoolToday()}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  return (await run(sb().from('daily_verses').select('day, reference, verse, thought').gte('day', from).order('day'))).map(verseOf);
}

export async function saveDailyVerse(v: DailyVerse) {
  if (!live) throw new Error('Daily verses need the school server; this build is running on demo data.');
  await rpc('daily_verse_save', { p_day: v.day, p_reference: v.reference, p_verse: v.verse, p_thought: v.thought });
}

export async function deleteDailyVerse(day: string) {
  if (!live) throw new Error('Daily verses need the school server; this build is running on demo data.');
  await rpc('daily_verse_delete', { p_day: day });
}
