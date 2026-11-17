/**
 * Help sessions (Ask the Teacher → Help sessions): internal API implementation. Screens import the connect facade.
 * Teachers offer extra help for the classes they lead; their students book a spot. The database decides who may.
 */
import { live, rpc } from './client';
import { current } from './session';
import { schoolToday } from '../calendar/past';

export type HelpSession = {
  id: string; title: string; details: string; day: string; startTime: string; endTime: string; place: string;
  spots: number; taken: number; teacherId: string; teacher: string; cancelled: boolean; started: boolean;
  classes: string[]; sectionIds: string[];
  /** For a student: whether they booked a spot. */
  booked: boolean;
  /** For its teacher: who booked, in the order they did; null for students. */
  students: string[] | null;
};
export type HelpSessionInput = {
  id?: string | null; title: string; details: string; day: string; startTime: string; endTime: string; place: string; spots: number; sections: string[];
};

const noServer = () => { throw new Error('Help sessions need the school server; this build is running on demo data.'); };
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Demo builds show two, so the screens can be tried. */
function sample(): HelpSession[] {
  const today = schoolToday();
  const base = { details: '', teacherId: 'u-eng', teacher: 'Jennifer Taylor', cancelled: false, started: false, classes: ['English 10 – Period 3'],
    sectionIds: ['eng10-p3'] };
  return [
    { ...base, id: 'demo-help-1', title: 'Essay help', day: plus(today, 1), startTime: '15:15', endTime: '16:00', place: 'Room 204', spots: 8, taken: 3,
      details: 'Bring your draft. We will work on thesis statements and evidence.', booked: false, students: ['Ava Reyes', 'Wei Chen', 'Noah Smith'] },
    { ...base, id: 'demo-help-2', title: 'Poetry reading practice', day: plus(today, 3), startTime: '07:30', endTime: '07:55', place: 'Library',
      spots: 4, taken: 4, booked: false, students: ['Mia Johnson', 'Liam Brown', 'Ella Davis', 'Sam Lee'] },
  ];
}

/** For a student: their classes' sessions from today on; for a teacher: their own from a week ago on. Soonest first. */
export async function helpSessionsMine(): Promise<HelpSession[]> {
  if (!live) return sample();
  if (!current) return [];
  return (await rpc('help_sessions_mine')) as unknown as HelpSession[];
}

/** A teacher offers (or changes) a help session; returns its id. */
export async function saveHelpSession(h: HelpSessionInput): Promise<string> {
  if (!live) noServer();
  return rpc('help_session_save', { p_id: h.id ?? null, p_title: h.title, p_details: h.details, p_day: h.day, p_start: h.startTime,
    p_end: h.endTime, p_place: h.place, p_spots: h.spots, p_sections: h.sections });
}

export async function cancelHelpSession(id: string) { if (!live) noServer(); await rpc('help_session_cancel', { p_id: id }); }

/** A student books a spot, or gives it back (`book` false). */
export async function bookHelpSession(id: string, book = true) { if (!live) noServer(); await rpc('help_session_book', { p_id: id, p_book: book }); }
