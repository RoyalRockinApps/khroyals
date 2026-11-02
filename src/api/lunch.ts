/** Lunch visits: internal API implementation. Screens import the connect facade. */
import { live, rpc, run, sb } from './client';
import { current } from './session';

export type LunchWindow = {
  id: string; name: string; weekdays: number[]; startTime: string; endTime: string; gradeFrom: number; gradeTo: number; capacity: number; active: boolean;
};
export type LunchSlot = { day: string; windowId: string; name: string; startTime: string; endTime: string; spotsLeft: number; myVisit: string | null };
export type LunchKid = { id: string; firstName: string; lastName: string; grade: number | null };
export type MyLunchVisit = {
  id: string; day: string; windowName: string; startTime: string; endTime: string; student: string; visitor: string; guests: number;
  note: string; status: 'booked' | 'cancelled'; cancelReason: string; mine: boolean;
};
export type LunchVisitor = {
  id: string; windowName: string; startTime: string; endTime: string; visitor: string; relation: string; student: string; grade: number | null;
  classes: string | null; guests: number; note: string; allergies: string | null; status: 'booked' | 'cancelled'; cancelReason: string;
};

const hm = (t: string) => t.slice(0, 5);

export async function lunchWindows(): Promise<LunchWindow[]> {
  if (!live || !current) return [];
  return (await run(sb().from('lunch_windows').select('*').order('start_time'))).map((w) => ({
    id: w.id, name: w.name, weekdays: w.weekdays, startTime: hm(w.start_time), endTime: hm(w.end_time),
    gradeFrom: w.grade_from, gradeTo: w.grade_to, capacity: w.capacity, active: w.active,
  }));
}
export async function saveLunchWindow(w: Omit<LunchWindow, 'id'> & { id?: string | null }) {
  await rpc('lunch_window_save', {
    p_id: w.id ?? null, p_name: w.name, p_weekdays: w.weekdays, p_start: w.startTime, p_end: w.endTime,
    p_grade_from: w.gradeFrom, p_grade_to: w.gradeTo, p_capacity: w.capacity, p_active: w.active,
  });
}
export async function deleteLunchWindow(id: string) { await rpc('lunch_window_delete', { p_id: id }); }

export async function lunchClosedDays(): Promise<{ day: string; reason: string }[]> {
  if (!live || !current) return [];
  return (await run(sb().from('lunch_closed_days').select('*').order('day'))).map((d) => ({ day: d.day, reason: d.reason }));
}
export async function closeLunchDay(day: string, closed: boolean, reason = '') { await rpc('lunch_close_day', { p_day: day, p_closed: closed, p_reason: reason }); }

export async function lunchRules(): Promise<string> { return live && current ? ((await rpc('lunch_rules')) as string) ?? '' : ''; }
export async function setLunchRules(rules: string) { await rpc('lunch_set_rules', { p_rules: rules }); }

/** The children the signed-in person may visit at lunch (their own; family: the ones the office linked). */
export async function lunchKids(): Promise<LunchKid[]> {
  if (!live || !current) return [];
  return (await rpc('lunch_my_kids')).map((k) => ({ id: k.id, firstName: k.first_name, lastName: k.last_name, grade: k.grade }));
}
export async function lunchSlots(studentId: string, from: string, days = 21): Promise<LunchSlot[]> {
  if (!live || !current) return [];
  return (await rpc('lunch_slots', { p_student: studentId, p_from: from, p_days: days })).map((x) => ({
    day: x.day, windowId: x.window_id, name: x.name, startTime: x.start_time, endTime: x.end_time, spotsLeft: x.spots_left, myVisit: x.my_visit ?? null,
  }));
}
/** The child's own allergies (parents) and the allergies among students at that lunch, without names. */
export async function lunchAllergyNotes(windowId: string, studentId: string): Promise<{ own: string | null; others: string[] }> {
  const r = (await rpc('lunch_allergy_notes', { p_window: windowId, p_student: studentId }))[0];
  return { own: r?.own ?? null, others: r?.others ?? [] };
}
export async function bookLunchVisit(v: { windowId: string; day: string; studentId: string; guests: number; note: string; readAllergies: boolean }) {
  await rpc('lunch_visit_book', { p_window: v.windowId, p_day: v.day, p_student: v.studentId, p_guests: v.guests, p_note: v.note, p_read_allergies: v.readAllergies });
}
export async function cancelLunchVisit(id: string, reason = '') { await rpc('lunch_visit_cancel', { p_id: id, p_reason: reason }); }

export async function myLunchVisits(): Promise<MyLunchVisit[]> {
  if (!live || !current) return [];
  return (await rpc('my_lunch_visits')).map((v) => ({
    id: v.id, day: v.day, windowName: v.window_name, startTime: v.start_time, endTime: v.end_time, student: v.student, visitor: v.visitor,
    guests: v.guests, note: v.note, status: v.status as MyLunchVisit['status'], cancelReason: v.cancel_reason, mine: v.mine,
  }));
}
/** Teachers and staff: the day's visitors. */
export async function lunchVisitors(day: string): Promise<LunchVisitor[]> {
  if (!live || !current) return [];
  return (await rpc('lunch_visitors', { p_day: day })).map((v) => ({
    id: v.id, windowName: v.window_name, startTime: v.start_time, endTime: v.end_time, visitor: v.visitor, relation: v.relation, student: v.student,
    grade: v.grade, classes: v.classes ?? null, guests: v.guests, note: v.note, allergies: v.allergies ?? null,
    status: v.status as LunchVisitor['status'], cancelReason: v.cancel_reason,
  }));
}
