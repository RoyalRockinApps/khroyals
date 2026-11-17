/**
 * My schedule's pure parts: a day's classes in order, which weekday a schedule opens on, and "in 25 min". No app
 * imports, so tests run it.
 */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

type Meeting = { weekdays: number[]; startTime: string; endTime: string };

/** The classes on a weekday (1 Monday … 5 Friday), by the time they start. */
export function classesOn<T extends Meeting>(meetings: T[], weekday: number): T[] {
  return meetings.filter((m) => m.weekdays.includes(weekday)).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** The weekday a schedule opens on: today's on a school day, else Monday. */
export function openingWeekday(today: string): number {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();   // 0 Sunday … 6 Saturday
  return dow >= 1 && dow <= 5 ? dow : 1;
}

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** "in 5 min", "in 1 hr 10 min", or null when it isn't later today. */
export function startsIn(start: string, now: string): string | null {
  const m = minutes(start) - minutes(now);
  if (m <= 0) return null;
  if (m < 60) return `in ${m} min`;
  return `in ${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** "Mon, Wed & Fri", or "Every day" for all five. */
export function daysLabel(weekdays: number[]): string {
  const days = [...weekdays].sort();
  if (days.length === 5) return 'Every day';
  const names = days.map((d) => WEEKDAYS[d - 1]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0] ?? '';
}
