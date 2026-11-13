import { replacePhoto, removeStoredPhoto } from './storage';
import { subscribeChanges } from './realtime';
/** activities: internal API implementation. Screens import the connect facade. */
import { enumValue } from './validation';
import { CATEGORIES } from '../sports/categories';
import { sampleSports, sampleTeam } from '../sports/sample';
import type { Category } from '../sports/categories';
import type { MySport, Sport, SportAttendance, SportBulletin, SportChatMessage, SportEvent, SportRegistration, SportRsvp, SportSeason, TeamMember } from './types';
import { live, rpc, run, sb } from './client';
import { current, getUser } from './session';
import { avatarUrl, signAvatars } from './storage';
import { toRegistration, toSeason, toSportEvent } from './mappers';

export const noServer = () => { throw new Error('Activities need the school server; this build is running on demo data.'); };

/** Every activity with its coaches or directors, and every season (anyone may read them, signed out too). */
export async function listSports(): Promise<{ sports: Sport[]; seasons: SportSeason[] }> {
  if (!live) { const { sports, seasons } = sampleSports(); return { sports, seasons }; }
  const [sports, coaches, seasons] = await Promise.all([
    run(sb().from('sports').select('*').order('name')),
    run(sb().from('sport_coaches').select('sport_id, user_id')),
    run(sb().from('sport_seasons').select('*').order('starts_on')),
  ]);
  // Team photos are private to approved accounts; signed-out visitors see the emoji.
  if (current && !current.pending) await signAvatars(sports.map((x) => x.photo_path)).catch(() => {});
  return {
    sports: sports.map((x) => ({
      id: x.id, name: x.name, icon: x.icon, description: x.description, category: enumValue(x.category, CATEGORIES.map((c) => c.key)),
      coachIds: coaches.filter((c) => c.sport_id === x.id).map((c) => c.user_id),
      photoPath: x.photo_path ?? null, photo: current && !current.pending ? avatarUrl(x.photo_path) : '',
    })),
    seasons: seasons.map(toSeason),
  };
}

/** An activity's schedule from a few hours ago on (games still being played count), or all of it with `past`. */
export async function sportSchedule(seasonIds: string[], opts: { past?: boolean } = {}): Promise<SportEvent[]> {
  if (!seasonIds.length) return [];
  if (!live) return sampleSports().events.filter((e) => seasonIds.includes(e.seasonId));
  let query = sb().from('sport_events').select('*').in('season_id', seasonIds);
  if (!opts.past) query = query.gte('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString());
  const rows = await run(query.order('starts_at'));
  return rows.map(toSportEvent);
}

/** The sports the signed-in person follows or has a registered child (or self) in. */
export async function mySports(): Promise<MySport[]> {
  if (!live || !current) return [];
  return ((await rpc('my_sports'))).map((r) => ({ sportId: r.sport_id, following: r.following, registered: r.registered }));
}

/** What's coming up for those sports. */
export async function mySportSchedule(days = 60): Promise<SportEvent[]> {
  if (!live || !current) return [];
  return ((await rpc('my_sport_schedule', { p_days: days }))).map(toSportEvent);
}

/** Sign-ups this person may see: their family's, or every sign-up for sports they manage. */
export async function sportRegistrations(seasonIds: string[]): Promise<SportRegistration[]> {
  if (!live || !current || !seasonIds.length) return [];
  const rows = await run(sb().from('sport_registrations').select('*').in('season_id', seasonIds).order('created_at'));
  return rows.map(toRegistration);
}

export async function followSport(sportId: string, follow: boolean) {
  if (!live) noServer();
  await rpc('sport_follow', { p_sport: sportId, p_follow: follow });
}

export async function saveSport(s: { id?: string | null; name: string; icon: string; description: string; category: Category }): Promise<{ id: string }> {
  if (!live) noServer();
  return rpc('sport_save', {
    p_id: s.id ?? null, p_name: s.name, p_icon: s.icon, p_description: s.description, p_category: s.category,
  }) as Promise<{ id: string }>;
}

export async function deleteSport(id: string) { if (!live) noServer(); await rpc('sport_delete', { p_id: id }); }

export async function setSportCoach(sportId: string, userId: string, on: boolean) {
  if (!live) noServer();
  await rpc('sport_set_coach', { p_sport: sportId, p_user: userId, p_on: on });
}

export async function saveSeason(s: Omit<SportSeason, 'id'> & { id?: string | null }) {
  if (!live) noServer();
  await rpc('season_save', {
    p_id: s.id ?? null, p_sport: s.sportId, p_name: s.name, p_starts: s.startsOn, p_ends: s.endsOn,
    p_signup_opens: s.signupOpens, p_signup_closes: s.signupCloses, p_min_grade: s.minGrade, p_max_grade: s.maxGrade,
    p_details: s.details, p_info_url: s.infoUrl,
  });
}

export async function deleteSeason(id: string) { if (!live) noServer(); await rpc('season_delete', { p_id: id }); }

export async function saveSportEvent(e: Omit<SportEvent, 'id' | 'cancelled'> & { id?: string | null }) {
  if (!live) noServer();
  await rpc('sport_event_save', {
    p_id: e.id ?? null, p_season: e.seasonId, p_kind: e.kind, p_title: e.title, p_starts: e.startsAt, p_ends: e.endsAt,
    p_location: e.location, p_home: e.home, p_notes: e.notes, p_address: e.address ?? null,
  });
}

export async function cancelSportEvent(id: string, cancelled: boolean) {
  if (!live) noServer();
  await rpc('sport_event_cancel', { p_id: id, p_cancelled: cancelled });
}

export async function deleteSportEvent(id: string) { if (!live) noServer(); await rpc('sport_event_delete', { p_id: id }); }

export async function registerForSport(seasonId: string, studentId: string, note: string) {
  if (!live) noServer();
  await rpc('sport_register', { p_season: seasonId, p_student: studentId, p_note: note });
}

export async function withdrawSportRegistration(id: string) { if (!live) noServer(); await rpc('sport_withdraw', { p_registration: id }); }

export async function decideSportRegistration(id: string, approve: boolean, note = '') {
  if (!live) noServer();
  await rpc('sport_decide', { p_registration: id, p_approve: approve, p_note: note });
}

/** Your family's answers for these schedule items. */
export async function myRsvps(eventIds: string[]): Promise<SportRsvp[]> {
  if (!live || !current || !eventIds.length) return [];
  const rows = await run(sb().from('sport_event_rsvps').select('*').in('event_id', eventIds));
  return rows.map((r) => ({ eventId: r.event_id, studentId: r.student_id, status: enumValue(r.status, ['going', 'not_going']) }));
}

/** Going, Not going, or null to clear. */
export async function answerRsvp(eventId: string, studentId: string, status: 'going' | 'not_going' | null) {
  await rpc('sport_rsvp', { p_event: eventId, p_student: studentId, p_status: status });
}

/** Who's coming, for the schedule items you lead (others come back empty). */
export async function eventAttendance(eventIds: string[]): Promise<SportAttendance[]> {
  if (!live || !current || !eventIds.length) return [];
  const rows = await rpc('sport_event_attendance', { p_events: eventIds });
  return rows.map((r) => ({ eventId: r.event_id, studentId: r.student_id, name: r.name, status: enumValue(r.status, ['going', 'not_going', 'none']) }));
}

/** Upload a JPEG (base64) as an activity's team photo (its coaches or directors and activity managers). */
export async function uploadSportPhoto(sportId: string, base64: string, oldPath?: string | null) {
  const path = `sports/${sportId}/${Date.now()}.jpg`;
  await replacePhoto(path, base64, () => rpc('set_sport_photo', { p_sport: sportId, p_path: path }), oldPath);
}

export async function removeSportPhoto(sportId: string, oldPath?: string | null) {
  await rpc('set_sport_photo', { p_sport: sportId, p_path: null });
  await removeStoredPhoto('avatars', oldPath).catch(() => {});
}

export function subscribeSports(onChange: () => void): () => void {
  return subscribeChanges('subscribeSports', [{ event: '*', table: 'sport_events' }, { event: '*', table: 'sport_registrations' }, { event: '*', table: 'sport_event_rsvps' }], onChange);
}

// ----------------------------------------------------------------------
// The team: roster, bulletin board, parent chat and photo album (supabase/migrations/…_activity_team.sql)
// ----------------------------------------------------------------------

/** The students on the team now, with their parents (for the team's families and its leaders). */
export async function sportRoster(sportId: string): Promise<TeamMember[]> {
  if (!live) return sampleTeam(sportId).roster.map((m) => ({ ...m, avatar: getUser(m.studentId)?.avatar ?? '' }));
  const rows = (await rpc('sport_roster', { p_sport: sportId })) as unknown as {
    studentId: string; firstName: string; lastName: string; grade: number | null; avatar: string | null; seasons: string[]; parents: string[];
  }[];
  await signAvatars(rows.map((r) => r.avatar)).catch(() => {});
  return rows.map((r) => ({ ...r, grade: r.grade ?? null, avatar: avatarUrl(r.avatar), seasons: r.seasons ?? [], parents: r.parents ?? [] }));
}

/** The board's posts, pinned first, then newest (the team and its leaders read them). */
export async function sportBulletins(sportId: string): Promise<SportBulletin[]> {
  if (!live) return sampleTeam(sportId).bulletins.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  const rows = await run(sb().from('sport_bulletins').select('*').eq('sport_id', sportId)
    .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100));
  return rows.map((r) => ({
    id: r.id, sportId: r.sport_id, authorId: r.author_id, title: r.title, body: r.body, pinned: r.pinned, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

/** The leaders post on the board (no id), or change, pin or unpin a post. A new post tells the team. */
export async function saveBulletin(b: { id?: string | null; sportId: string; title: string; body: string; pinned: boolean }): Promise<string> {
  if (!live) noServer();
  return rpc('sport_bulletin_save', { p_id: b.id ?? null, p_sport: b.id ? null : b.sportId, p_title: b.title, p_body: b.body, p_pinned: b.pinned });
}

export async function deleteBulletin(id: string) { if (!live) noServer(); await rpc('sport_bulletin_delete', { p_id: id }); }

const toChat = (r: { id: string; sport_id: string; author_id: string; body: string; created_at: string }): SportChatMessage =>
  ({ id: r.id, sportId: r.sport_id, authorId: r.author_id, body: r.body, createdAt: r.created_at });

/** The parent chat's latest 200 messages, oldest first. */
export async function sportChat(sportId: string): Promise<SportChatMessage[]> {
  if (!live) return sampleTeam(sportId).chat;
  const rows = await run(sb().from('sport_chat_messages').select('*').eq('sport_id', sportId).order('created_at', { ascending: false }).limit(200));
  return rows.reverse().map(toChat);
}

export async function sendSportChat(sportId: string, body: string): Promise<SportChatMessage> {
  if (!live) noServer();
  return toChat(await rpc('sport_chat_send', { p_sport: sportId, p_body: body }));
}

/** Remove your own message, or (the leaders) anyone's. */
export async function deleteSportChat(id: string) { if (!live) noServer(); await rpc('sport_chat_delete', { p_id: id }); }

/** The leaders start this school year's photo album (or get the one there is); returns its id. */
export async function makeSportAlbum(sportId: string): Promise<string> {
  if (!live) noServer();
  return rpc('sport_album', { p_sport: sportId });
}

/** Live updates to the board and the chat. */
export function subscribeTeam(sportId: string, onChange: () => void): () => void {
  return subscribeChanges('subscribeTeam', [
    { event: '*', table: 'sport_bulletins', filter: `sport_id=eq.${sportId}` },
    { event: '*', table: 'sport_chat_messages', filter: `sport_id=eq.${sportId}` },
  ], onChange);
}
