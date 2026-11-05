/**
 * onsite: internal API implementation for On-Site Attendance. Screens import the connect facade.
 * Teachers and staff check themselves in at school and out when they leave; the office (checkin.manage) signs
 * visitors in and out, checks anyone in or out for them, and sees who's here; teachers mark how students went home;
 * the office keeps extended care, whose staff run its daily check-out list. The database checks who may.
 * On demo data there's no server: lists are empty and changes say so.
 */
import type { DismissalHow, GoneHome, Spot, Staying } from './types';
import { live, rpc } from './client';

const noServer = () => { throw new Error('On-Site Attendance needs the school server; this build is running on demo data.'); };

export type CampusStatus = { role: 'faculty' | 'staff' | null; here: boolean; checks: { kind: 'in' | 'out'; at: string; byOffice: boolean }[] };
export type OnSiteBucket = 'class' | 'activities' | 'extendedCare' | 'notHome' | 'home' | 'absent' | 'unmarked';
export type OnSiteToday = {
  day: string; dismissal: string; afterDismissal: boolean;
  faculty: { here: number; total: number }; staff: { here: number; total: number }; visitors: { here: number; today: number };
  students: { total: number; here: number; class: number; activities: number; extendedCare: number; notHome: number; home: number; absent: number; unmarked: number };
};
export type OnSitePerson = { id: string; name: string; role: 'faculty' | 'staff'; schoolRole: string; here: boolean; in: string | null; out: string | null };
export type OnSiteStudent = {
  id: string; name: string; grade: number | null; state: 'here' | 'home' | 'absent' | 'unmarked'; bucket: OnSiteBucket;
  home: GoneHome | null; staying: Staying | null;
};
export type OnSiteList = { people: OnSitePerson[]; students: OnSiteStudent[] };
export type Visitor = { id: string; name: string; purpose: string; guests: number; in: string; out: string | null; by: string; lunch: boolean };
export type ExpectedVisitor = { id: string; name: string; student: string; guests: number; start: string };
export type ExtendedCareStudent = { id: string; name: string; grade: number | null; weekdays: number[]; note: string; today: boolean };
export type ExtendedCareStaff = { id: string; name: string; role: string; on: boolean };

/** The signed-in teacher's or staff member's day: here or not, and today's check-ins and check-outs (null on demo data). */
export async function myCampusStatus(): Promise<CampusStatus | null> {
  if (!live) return null;
  return (await rpc('my_campus_status')) as CampusStatus;
}

/** Check yourself in (only at school: the server compares where you are with the school's spot) or out. */
export async function campusCheck(kind: 'in' | 'out', at?: Spot | null): Promise<CampusStatus> {
  if (!live) noServer();
  return (await rpc('campus_check', { p_kind: kind, p_lat: at?.lat, p_lng: at?.lng, p_accuracy: at?.accuracy ?? undefined })) as CampusStatus;
}

/** The office: check a teacher or staff member in or out for them. */
export async function campusCheckFor(personId: string, kind: 'in' | 'out') {
  if (!live) noServer();
  await rpc('campus_check_for', { p_person: personId, p_kind: kind });
}

/** The office: how many faculty, staff, visitors and students are here, and where the rest of the students are. */
export async function onSiteToday(): Promise<OnSiteToday> {
  if (!live) noServer();
  return (await rpc('on_site_today')) as OnSiteToday;
}

/** The office: each teacher and staff member expected today, and each student, with where they stand. */
export async function onSiteList(): Promise<OnSiteList> {
  if (!live) return { people: [], students: [] };
  return (await rpc('on_site_list')) as OnSiteList;
}

/** The office: when the school day ends (HH:MM). */
export async function setDismissalTime(time: string) {
  if (!live) noServer();
  await rpc('on_site_set_dismissal', { p_time: time });
}

/** The office: today's visitors, and the lunch visitors booked for today who haven't signed in yet. */
export async function visitorsToday(): Promise<{ visitors: Visitor[]; expected: ExpectedVisitor[] }> {
  if (!live) return { visitors: [], expected: [] };
  return (await rpc('visitors_today')) as { visitors: Visitor[]; expected: ExpectedVisitor[] };
}

/** The office: sign a visitor in, or one of today's booked lunch visitors (by their visit). */
export async function signInVisitor(v: { name?: string; purpose?: string; guests?: number; lunchVisitId?: string }) {
  if (!live) noServer();
  await rpc('visitor_sign_in', { p_name: v.name ?? '', p_purpose: v.purpose ?? '', p_guests: v.guests ?? 0, p_lunch_visit: v.lunchVisitId });
}

export async function signOutVisitor(id: string) { if (!live) noServer(); await rpc('visitor_sign_out', { p_id: id }); }
export async function removeVisitor(id: string) { if (!live) noServer(); await rpc('visitor_remove', { p_id: id }); }

/** A class's teacher: mark students gone home today and how (null takes it back). Their parents are told. */
export async function markGoneHome(sectionId: string, studentIds: string[], how: DismissalHow | null) {
  if (!live) noServer();
  await rpc('dismissal_mark', { p_section: sectionId, p_students: studentIds, p_how: how });
}

/** The office and extended care staff: the students in extended care and their days. */
export async function extendedCareRoster(): Promise<ExtendedCareStudent[]> {
  if (!live) return [];
  return (await rpc('extended_care_roster')) as ExtendedCareStudent[];
}

/** The office: students by name, to add to extended care. */
export async function extendedCareSearch(query: string): Promise<{ id: string; name: string; grade: number | null; weekdays: number[] | null }[]> {
  if (!live) return [];
  return (await rpc('extended_care_search', { p_query: query })) as { id: string; name: string; grade: number | null; weekdays: number[] | null }[];
}

/** The office: the weekdays (1 Monday … 5 Friday) a student stays for extended care; none takes them off. */
export async function setExtendedCare(studentId: string, weekdays: number[], note = '') {
  if (!live) noServer();
  await rpc('extended_care_set', { p_student: studentId, p_weekdays: weekdays, p_note: note });
}

/** The office: every teacher and staff member, and whether they run extended care. */
export async function extendedCareStaff(): Promise<ExtendedCareStaff[]> {
  if (!live) return [];
  return (await rpc('extended_care_staff_list')) as ExtendedCareStaff[];
}

export async function setExtendedCareStaff(userId: string, on: boolean) {
  if (!live) noServer();
  await rpc('extended_care_set_staff', { p_user: userId, p_on: on });
}

/** Extended care staff and the office: today's Extended care check-out list (made the first time), for /checkout/[id]. */
export async function extendedCareList(): Promise<string> {
  if (!live) noServer();
  return (await rpc('extended_care_list')) as string;
}
