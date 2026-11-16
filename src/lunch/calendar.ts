/**
 * The Lunch Visits calendar (src/lunch/LunchCalendar.tsx): the open lunch times as blocks on a week, one column per school
 * day and time running down. This works out the weeks to page through, the hours the grid covers and where blocks that
 * overlap sit side by side. No app imports, so tests run it.
 */

export type CalendarSlot = { day: string; windowId: string; startTime: string; endTime: string };

const noon = (iso: string) => new Date(`${iso}T12:00:00`);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shiftDay = (iso: string, n: number) => { const d = noon(iso); d.setDate(d.getDate() + n); return ymd(d); };
/** 1 Monday … 7 Sunday, like the database's isodow. */
export const isoWeekday = (iso: string) => ((noon(iso).getDay() + 6) % 7) + 1;
export const mondayOf = (iso: string) => shiftDay(iso, 1 - isoWeekday(iso));
/** "11:30" or "11:30:00" → minutes after midnight. */
export const minutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

export type Week<T> = { monday: string; days: string[]; slots: Map<string, T[]> };

/**
 * The weeks from today's to the last day asked about (today + span − 1), Monday to Friday, with Saturday or Sunday only
 * when a lunch time falls on one. Weeks with nothing open stay in, so a break reads as an empty week, not a missing one.
 */
export function lunchWeeks<T extends CalendarSlot>(slots: T[], today: string, span = 21): Week<T>[] {
  const last = shiftDay(today, span - 1);
  const weeks: Week<T>[] = [];
  for (let monday = mondayOf(today); monday <= last; monday = shiftDay(monday, 7)) {
    const all = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
    const byDay = new Map<string, T[]>();
    for (const d of all) {
      const list = slots.filter((x) => x.day === d).sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
      if (list.length) byDay.set(d, list);
    }
    weeks.push({ monday, days: all.filter((d, i) => i < 5 || byDay.has(d)), slots: byDay });
  }
  return weeks;
}

/** The hours the grid shows: from the earliest start to the latest end, out to the quarter hour. */
export function timeRange(slots: CalendarSlot[]): { from: number; to: number } | null {
  if (!slots.length) return null;
  const from = Math.min(...slots.map((x) => minutes(x.startTime)));
  const to = Math.max(...slots.map((x) => minutes(x.endTime)));
  return { from: Math.floor(from / 15) * 15, to: Math.max(Math.ceil(to / 15) * 15, Math.floor(from / 15) * 15 + 30) };
}

/** Lines down the time axis: every half hour in the range, labelled on the hour and half hour. */
export function gridLines(range: { from: number; to: number }): number[] {
  const lines: number[] = [];
  for (let t = Math.ceil(range.from / 30) * 30; t <= range.to; t += 30) lines.push(t);
  return lines;
}

/** "11 AM", "11:30". The axis is narrow, so the half hours leave out AM/PM. */
export const axisLabel = (t: number) => {
  const h = Math.floor(t / 60);
  const m = t % 60;
  return m ? `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}` : `${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}`;
};

/**
 * Where each of a day's blocks sits across its column: blocks that overlap in time share the width (lane of lanes),
 * and a block that overlaps nothing takes all of it.
 */
export function dayLanes<T extends CalendarSlot>(list: T[]): { slot: T; lane: number; lanes: number }[] {
  const sorted = [...list].sort((a, b) => minutes(a.startTime) - minutes(b.startTime) || minutes(a.endTime) - minutes(b.endTime));
  const out: { slot: T; lane: number; lanes: number }[] = [];
  let group: { slot: T; lane: number; lanes: number }[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const close = () => { const n = laneEnds.length; group.forEach((g) => { g.lanes = n; }); out.push(...group); group = []; laneEnds = []; };
  for (const slot of sorted) {
    const start = minutes(slot.startTime);
    if (group.length && start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = minutes(slot.endTime);
    groupEnd = Math.max(group.length ? groupEnd : 0, minutes(slot.endTime));
    group.push({ slot, lane, lanes: 0 });
  }
  if (group.length) close();
  return out;
}

const md = (iso: string, o: Intl.DateTimeFormatOptions) => noon(iso).toLocaleDateString('en-US', o);
/** "This week", "Next week" or "Week of Nov 30". */
export const weekName = (monday: string, today: string) =>
  monday === mondayOf(today) ? 'This week' : monday === shiftDay(mondayOf(today), 7) ? 'Next week' : `Week of ${md(monday, { month: 'short', day: 'numeric' })}`;
/** "Nov 16 – 20", or "Nov 30 – Dec 4" across a month. */
export function weekSpan(days: string[]) {
  const [a, b] = [days[0], days[days.length - 1]];
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${md(a, { month: 'short', day: 'numeric' })} – ${Number(b.slice(8))}`
    : `${md(a, { month: 'short', day: 'numeric' })} – ${md(b, { month: 'short', day: 'numeric' })}`;
}
