/**
 * College & Career: internal API implementation. Screens import the connect facade. Students in 9th–12th grade check off
 * each grade's steps and ask for transcripts; the counselors (college.manage) keep the dates and checklist and send the
 * transcripts; parents read their child's plan. The database decides who may.
 */
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { schoolToday } from '../calendar/past';

export type CollegeDateKind = 'test' | 'scholarship' | 'event';
export type CollegeDate = { id: string; kind: CollegeDateKind; title: string; day: string; registerBy: string | null; link: string | null; details: string };
export type CollegeStep = { id: string; grade: number; title: string; details: string; doneAt: string | null };
export type TranscriptMethod = 'portal' | 'email' | 'mail';
export type TranscriptRequest = {
  id: string; sendTo: string; method: TranscriptMethod; address: string; neededBy: string | null; note: string;
  status: 'requested' | 'sent' | 'cancelled'; counselorNote: string; handledAt: string | null; createdAt: string;
  /** For the counselors' list. */
  studentId?: string; student?: string; grade?: number | null;
};
export type CollegePlan = {
  student: { id: string; name: string; firstName: string; grade: number | null };
  steps: CollegeStep[]; requests: TranscriptRequest[];
};
export type CollegeStudent = { id: string; name: string; grade: number; done: number; waiting: number };

const noServer = () => { throw new Error('College & Career needs the school server; this build is running on demo data.'); };
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Demo builds show a sample plan, so the screens can be tried. */
function samplePlan(): CollegePlan {
  const steps: [number, string, string][] = [
    [11, 'Take the PSAT/NMSQT in October', 'It\'s the National Merit Scholarship qualifying test.'],
    [11, 'Take the ACT or SAT this spring', 'Leave time to take it again in the fall if you want a higher score.'],
    [11, 'Visit colleges', 'Go in person or take virtual tours. Write down what you like about each.'],
    [11, 'Build your college list', 'A mix of reach, match and likely schools.'],
    [12, 'Request your transcripts', 'Ask for them in the app, at least two weeks before each deadline.'],
    [12, 'Fill out the FAFSA', 'It opens October 1. Many colleges and scholarships use it.'],
    [9, 'Meet your counselor', 'Talk about the classes you want to take in high school.'],
    [10, 'Take the PSAT 10 or PreACT', 'Practice for the real tests and see where to grow.'],
  ];
  return {
    student: { id: 'demo', name: 'Ava Reyes', firstName: 'Ava', grade: 11 },
    steps: steps.map(([grade, title, details], i) => ({ id: `demo-step-${i}`, grade, title, details, doneAt: i === 0 || i >= 6 ? '2026-10-01T12:00:00Z' : null })),
    requests: [{ id: 'demo-tr-1', sendTo: 'University of Alabama', method: 'portal', address: '', neededBy: plus(schoolToday(), 20), note: 'Early action',
      status: 'requested', counselorNote: '', handledAt: null, createdAt: '2026-11-10T15:00:00Z' }],
  };
}
function sampleDates(): CollegeDate[] {
  const t = schoolToday();
  return [
    { id: 'demo-d1', kind: 'test', title: 'ACT', day: plus(t, 26), registerBy: plus(t, 5), link: 'https://www.act.org', details: 'At the school, 8:00 AM. Bring two pencils and your ticket.' },
    { id: 'demo-d2', kind: 'scholarship', title: 'Community Foundation Scholarship', day: plus(t, 40), registerBy: null, link: null, details: '$2,000 for a senior planning to study education.' },
    { id: 'demo-d3', kind: 'event', title: 'College Fair', day: plus(t, 12), registerBy: null, link: null, details: 'In the gym, 6–8 PM. Over 40 colleges.' },
  ];
}

export async function collegeDates(): Promise<CollegeDate[]> {
  if (!live) return sampleDates();
  if (!current) return [];
  const rows = await run(sb().from('college_dates').select('id, kind, title, day, register_by, link, details').order('day'));
  return rows.map((r) => ({ id: r.id, kind: r.kind as CollegeDateKind, title: r.title, day: r.day, registerBy: r.register_by, link: r.link, details: r.details }));
}

/** A student's plan: their own, or a parent's child's or (for a counselor) any 9th–12th grader's (`studentId`). */
export async function collegePlan(studentId?: string | null): Promise<CollegePlan | null> {
  if (!live) return samplePlan();
  if (!current) return null;
  return (await rpc('college_plan', studentId ? { p_student: studentId } : {})) as unknown as CollegePlan | null;
}

export async function checkCollegeStep(id: string, done: boolean) { if (!live) noServer(); await rpc('college_step_check', { p_step: id, p_done: done }); }

export async function requestTranscript(r: { sendTo: string; method: TranscriptMethod; address: string; neededBy: string | null; note: string }): Promise<string> {
  if (!live) noServer();
  return rpc('transcript_request', { p_send_to: r.sendTo, p_method: r.method, p_address: r.address, p_needed_by: r.neededBy, p_note: r.note });
}
export async function cancelTranscriptRequest(id: string) { if (!live) noServer(); await rpc('transcript_request_cancel', { p_id: id }); }

// The counselors
export async function transcriptRequestsAll(): Promise<TranscriptRequest[]> {
  if (!live) return samplePlan().requests.map((r) => ({ ...r, studentId: 'demo', student: 'Ava Reyes', grade: 11 }));
  return (await rpc('transcript_requests_all')) as unknown as TranscriptRequest[];
}
export async function markTranscriptSent(id: string, note: string) { if (!live) noServer(); await rpc('transcript_request_sent', { p_id: id, p_note: note }); }
export async function collegeStudents(): Promise<CollegeStudent[]> {
  if (!live) return [{ id: 'demo', name: 'Ava Reyes', grade: 11, done: 3, waiting: 1 }];
  return ((await rpc('college_students')) as unknown as CollegeStudent[]).map((x) => ({ ...x, done: Number(x.done), waiting: Number(x.waiting) }));
}
export async function saveCollegeDate(d: Omit<CollegeDate, 'id'> & { id?: string | null }): Promise<string> {
  if (!live) noServer();
  return rpc('college_date_save', { p_id: d.id ?? null, p_kind: d.kind, p_title: d.title, p_day: d.day, p_register_by: d.registerBy,
    p_link: d.link ?? '', p_details: d.details });
}
export async function deleteCollegeDate(id: string) { if (!live) noServer(); await rpc('college_date_delete', { p_id: id }); }
export async function saveCollegeStep(s: { id?: string | null; grade: number; title: string; details: string }): Promise<string> {
  if (!live) noServer();
  return rpc('college_step_save', { p_id: s.id ?? null, p_grade: s.grade, p_title: s.title, p_details: s.details });
}
export async function deleteCollegeStep(id: string) { if (!live) noServer(); await rpc('college_step_delete', { p_id: id }); }
