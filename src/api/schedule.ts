/**
 * Class times (My schedule): internal API implementation. Screens import the connect facade. A class's teacher or the
 * office sets when and where it meets; students and their parents read the week; students get Now / Next class.
 */
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { schoolToday } from '../calendar/past';

/** One of a class's meeting times, with its class (for a schedule). */
export type ClassMeeting = {
  id: string; sectionId: string; className: string; teacher: string | null; weekdays: number[]; startTime: string; endTime: string; room: string;
};
/** On the Planner: the class going on now (`now`) or the next one, and the day it's on. */
export type NextClass = { day: string; className: string; teacher: string | null; startTime: string; endTime: string; room: string; now: boolean };

const noServer = () => { throw new Error('Class times need the school server; this build is running on demo data.'); };

/** Demo builds show a sample week, so the screens can be tried. */
const SAMPLE: ClassMeeting[] = [
  ['Bible 6', 'Mr. Davis', [1, 2, 3, 4, 5], '08:00', '08:45', 'Chapel'], ['English 6', 'Mrs. Taylor', [1, 2, 3, 4, 5], '08:50', '09:40', 'Room 112'],
  ['Math 6', 'Mr. Cole', [1, 3, 5], '09:45', '10:35', 'Room 118'], ['Science 6', 'Ms. Ortiz', [2, 4], '09:45', '11:05', 'Lab B'],
  ['History 6', 'Mrs. Green', [1, 3, 5], '10:40', '11:30', 'Room 120'], ['Art', 'Ms. Park', [2, 4], '13:00', '13:50', 'Art room'],
  ['PE', 'Coach Hill', [1, 2, 3, 4, 5], '14:00', '14:45', 'Gym'],
].map(([className, teacher, weekdays, startTime, endTime, room], i) => ({
  id: `demo-time-${i}`, sectionId: `demo-${i}`, className, teacher, weekdays, startTime, endTime, room,
}) as ClassMeeting);

const meetingOf = (r: { meeting_id: string; section_id: string; class_name: string; teacher: string | null; weekdays: number[]; start_time: string; end_time: string; room: string }): ClassMeeting => ({
  id: r.meeting_id, sectionId: r.section_id, className: r.class_name, teacher: r.teacher, weekdays: r.weekdays, startTime: r.start_time,
  endTime: r.end_time, room: r.room,
});

/** A week of classes: the signed-in student's (or a teacher's own), or a parent's child's (`studentId`). */
export async function classSchedule(studentId?: string | null): Promise<ClassMeeting[]> {
  if (!live) return SAMPLE;
  if (!current) return [];
  return ((await rpc('class_schedule', studentId ? { p_student: studentId } : {})) as unknown as Parameters<typeof meetingOf>[0][]).map(meetingOf);
}

/** For the Planner: the class going on now and/or the next one, over the coming week's school days. */
export async function myNextClasses(): Promise<NextClass[]> {
  if (!live) {
    const today = schoolToday();
    return [{ day: today, className: 'English 6', teacher: 'Mrs. Taylor', startTime: '08:50', endTime: '09:40', room: 'Room 112', now: true },
      { day: today, className: 'Math 6', teacher: 'Mr. Cole', startTime: '09:45', endTime: '10:35', room: 'Room 118', now: false }];
  }
  if (!current) return [];
  return ((await rpc('my_next_classes')) as unknown as { day: string; class_name: string; teacher: string | null; start_time: string; end_time: string; room: string; now: boolean }[])
    .map((r) => ({ day: r.day, className: r.class_name, teacher: r.teacher, startTime: r.start_time, endTime: r.end_time, room: r.room, now: r.now }));
}

/** One class's meeting times (for its teacher and the office), by the time they start. */
export async function classTimes(sectionId: string): Promise<ClassMeeting[]> {
  if (!live || !current) return [];
  const rows = await run(sb().from('section_meetings').select('id, section_id, weekdays, start_time, end_time, room').eq('section_id', sectionId).order('start_time'));
  return rows.map((r) => ({ id: r.id, sectionId: r.section_id, className: '', teacher: null, weekdays: r.weekdays,
    startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5), room: r.room }));
}

export async function saveClassTime(t: { id?: string | null; sectionId: string; weekdays: number[]; startTime: string; endTime: string; room: string }): Promise<string> {
  if (!live) noServer();
  return rpc('section_meeting_save', { p_id: t.id ?? null, p_section: t.sectionId, p_weekdays: t.weekdays, p_start: t.startTime, p_end: t.endTime, p_room: t.room });
}

export async function deleteClassTime(id: string) { if (!live) noServer(); await rpc('section_meeting_delete', { p_id: id }); }
