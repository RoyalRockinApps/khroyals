/**
 * Tell Someone (students' safety reports): internal API implementation. Screens import the connect facade. Students
 * report; the Safety reports permission holders read them. When a student leaves their name off, the readers never see
 * it (the database decides).
 */
import { live, rpc } from './client';
import { current } from './session';
import type { SafetyKind } from '../safety/kinds';

export type MySafetyReport = { id: string; kind: SafetyKind; what: string; named: boolean; status: 'new' | 'seen' | 'closed'; seenAt: string | null; closedAt: string | null; createdAt: string };
export type SafetyReport = MySafetyReport & {
  urgent: boolean; place: string; when: string; people: string; reporter: string | null; grade: number | null; staffNote: string; seenBy: string | null;
};

const noServer = () => { throw new Error('Tell Someone needs the school server; this build is running on demo data.'); };

export async function sendSafetyReport(r: { kind: SafetyKind; what: string; place: string; when: string; people: string; named: boolean }): Promise<string> {
  if (!live) noServer();
  return rpc('safety_report', { p_kind: r.kind, p_what: r.what, p_place: r.place, p_when: r.when, p_people: r.people, p_named: r.named });
}

export async function mySafetyReports(): Promise<MySafetyReport[]> {
  if (!live || !current) return [];
  return (await rpc('my_safety_reports')) as unknown as MySafetyReport[];
}

/** For the readers: the last year's reports, new ones first. */
export async function safetyReportsAll(): Promise<SafetyReport[]> {
  if (!live) {
    return [{ id: 'demo-sr', kind: 'bullying', urgent: false, what: 'Some kids keep taking another student’s lunch and laughing at him at the back table.',
      place: 'Cafeteria', when: 'Most days this week', people: '7th graders', named: false, reporter: null, grade: null, status: 'new', staffNote: '',
      seenBy: null, seenAt: null, closedAt: null, createdAt: new Date().toISOString() }];
  }
  return (await rpc('safety_reports_all')) as unknown as SafetyReport[];
}

export async function updateSafetyReport(id: string, status: 'seen' | 'closed', note?: string) {
  if (!live) noServer();
  await rpc('safety_report_update', { p_id: id, p_status: status, p_note: note ?? null });
}
