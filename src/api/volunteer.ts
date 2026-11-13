import { subscribeChanges } from './realtime';
/** volunteer: internal API implementation. Screens import the connect facade. */
import type { BusyLimits, InvitePerson, Opportunity, Signup, VolunteerAttendance, VolunteerDay, VolunteerEvent, VolunteerInvite, VolunteerMessage, VolunteerScan, VolunteerStat } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { removeStoredPhoto, signedPhotoUrls, uploadJpeg } from './storage';
import { schoolToday } from '../calendar/past';
import { toAttendance, toInvite, toMessage, toOpportunity, toSignup, toVolunteerEvent } from './mappers';
import { enumValue } from './validation';

/**
 * Opportunities this person can see (open ones, plus deleted ones they were part of, invite-only ones they're
 * invited to or run), their sign-ups, the open events they're grouped under, today's check-ins they can see (their
 * own, and the opportunities they run) and the invites they can see (their own, and those of what they run).
 */
export async function listVolunteer(): Promise<{
  opportunities: Opportunity[]; signups: Signup[]; events: VolunteerEvent[]; attendance: VolunteerAttendance[]; invites: VolunteerInvite[];
}> {
  if (!live || !current) return { opportunities: [], signups: [], events: [], attendance: [], invites: [] };
  const [o, s, e, a, i] = await Promise.all([
    run(sb().from('volunteer_opportunities').select('*').order('starts_on').order('start_time')),
    run(sb().from('volunteer_signups').select('*').order('created_at')),
    listVolunteerEvents(),
    run(sb().from('volunteer_attendance').select('*').eq('day', schoolToday())),
    run(sb().from('volunteer_invites').select('*').neq('status', 'cancelled').order('created_at')),
  ]);
  return { opportunities: await withPhotos(o.map(toOpportunity)), signups: s.map(toSignup), events: e, attendance: a.map(toAttendance), invites: i.map(toInvite) };
}

/** Cover photos are kept privately: swap each one's storage path for a link to show (none if it can't be had). */
async function withPhotos<T extends { image: string | null }>(list: T[]): Promise<T[]> {
  const paths = list.flatMap((x) => (x.image ? [x.image] : []));
  const urls = paths.length ? await signedPhotoUrls('volunteer', paths).catch(() => ({} as Record<string, string>)) : {};
  return list.map((x) => (x.image ? { ...x, image: urls[x.image] ?? null } : x));
}

/**
 * Its leader (or the event's starter) puts a cover photo on an opportunity's or event's card: a JPEG (base64) uploaded
 * to their own folder, or null to take it off and go back to the drawn art. The photo it replaces is removed.
 */
export async function setVolunteerPhoto(of: { opportunityId: string } | { eventId: string }, base64: string | null) {
  if (!live || !current) throw new Error('This feature needs the school server.');
  const path = base64 ? `${current.id}/${Date.now()}.jpg` : null;
  if (path) await uploadJpeg('volunteer', path, base64!);
  let old: string | null;
  try {
    old = 'opportunityId' in of
      ? await rpc('volunteer_set_image', { p_opportunity: of.opportunityId, p_image: path })
      : await rpc('volunteer_event_set_image', { p_event: of.eventId, p_image: path });
  } catch (error) {
    if (path) await removeStoredPhoto('volunteer', path).catch(() => {});
    throw error;
  }
  // Someone else's old photo stays (only its uploader removes it); that mustn't fail the change.
  await removeStoredPhoto('volunteer', old).catch(() => {});
}

/** The open events (Harvest Fest…) that opportunities are grouped under, soonest first. */
export async function listVolunteerEvents(): Promise<VolunteerEvent[]> {
  if (!live || !current) return [];
  return withPhotos((await run(sb().from('volunteer_events').select('*').eq('status', 'open').order('starts_on'))).map(toVolunteerEvent));
}

/** Volunteer Leaders: start an event (no id) or change one you started. Returns its id. */
export async function volunteerEventSave(e: { id?: string | null; title: string; description: string; startsOn: string; endsOn: string | null; location: string | null }) {
  return (await rpc('volunteer_event_save', {
    p_id: e.id ?? null, p_title: e.title, p_description: e.description, p_starts_on: e.startsOn, p_ends_on: e.endsOn, p_location: e.location,
  })) as string;
}

/** The event's leader: remove it (its opportunities stay, on their own). */
export async function volunteerEventDelete(id: string) { await rpc('volunteer_event_delete', { p_id: id }); }

/** The event's leader: its opportunities in this order, most important first. */
export async function volunteerEventReorder(eventId: string, opportunityIds: string[]) {
  await rpc('volunteer_event_reorder', { p_event: eventId, p_order: opportunityIds });
}

/** An opportunity's leader: put it under an event, or on its own (null). */
export async function volunteerSetEvent(opportunityId: string, eventId: string | null) {
  await rpc('volunteer_set_event', { p_opportunity: opportunityId, p_event: eventId });
}

/**
 * An opportunity, its sign-ups and chat, the check-ins this person can see (their own; every one for its leaders),
 * its invites (their own; every one for its leaders), and all its time slots (itself too) with their sign-ups.
 */
export async function getOpportunity(id: string): Promise<{
  opportunity: Opportunity | null; signups: Signup[]; messages: VolunteerMessage[]; attendance: VolunteerAttendance[]; invites: VolunteerInvite[];
  slots: Opportunity[]; slotSignups: Signup[];
}> {
  const [o, s, m, a, i] = await Promise.all([
    run(sb().from('volunteer_opportunities').select('*').eq('id', id).maybeSingle()),
    run(sb().from('volunteer_signups').select('*').eq('opportunity_id', id).order('created_at')),
    run(sb().from('volunteer_messages').select('*').eq('opportunity_id', id).order('created_at')),
    run(sb().from('volunteer_attendance').select('*').eq('opportunity_id', id)),
    run(sb().from('volunteer_invites').select('*').eq('opportunity_id', id).order('created_at')),
  ]);
  const opportunity = o ? (await withPhotos([toOpportunity(o)]))[0] : null;
  const series = opportunity ? opportunity.slotOf ?? opportunity.id : null;
  const slots = series ? (await run(sb().from('volunteer_opportunities').select('*').or(`id.eq.${series},slot_of.eq.${series}`)
    .order('starts_on').order('start_time'))).map(toOpportunity) : [];
  const slotSignups = slots.length > 1
    ? (await run(sb().from('volunteer_signups').select('*').in('opportunity_id', slots.map((x) => x.id)))).map(toSignup) : s.map(toSignup);
  return {
    opportunity, signups: s.map(toSignup), messages: m.map(toMessage), attendance: a.map(toAttendance), invites: i.map(toInvite),
    slots: slots.length ? slots : opportunity ? [opportunity] : [], slotSignups,
  };
}

/** Its leader adds a time slot to an opportunity (any of its slots): another day or time, with its own spots. */
export async function volunteerAddSlot(id: string, slot: { startsOn: string; endsOn: string | null; startTime: string | null; endTime: string | null; spots: number | null }) {
  return toOpportunity(await rpc('volunteer_add_slot', {
    p_opportunity: id, p_starts_on: slot.startsOn, p_ends_on: slot.endsOn ?? undefined, p_start_time: slot.startTime ?? undefined,
    p_end_time: slot.endTime ?? undefined, p_spots: slot.spots ?? undefined,
  }));
}

export async function volunteerPost(o: {
  title: string; description: string; startsOn: string; endsOn: string | null; startTime: string | null;
  endTime: string | null; location: string | null; spots: number | null;
  /** An item request: what's needed and how many (no spots). */
  items?: { item: string; quantity: number };
  /** The event it's part of, if any. */
  eventId?: string | null;
  /** Only the people its leader invites (help only). */
  inviteOnly?: boolean;
}): Promise<Opportunity> {
  return toOpportunity(await rpc('volunteer_post', {
    p_title: o.title, p_description: o.description, p_starts_on: o.startsOn, p_ends_on: o.endsOn,
    p_start_time: o.startTime, p_end_time: o.endTime, p_location: o.location, p_spots: o.items ? null : o.spots,
    p_kind: o.items ? 'items' : 'help', p_item: o.items?.item ?? null, p_quantity: o.items?.quantity ?? null, p_event: o.eventId ?? null,
    p_invite_only: !o.items && !!o.inviteOnly,
  }));
}

export async function volunteerSayYes(id: string) { await rpc('volunteer_say_yes', { p_opportunity: id }); }

/** Its leaders: invite people to help (each is told), with an optional note. Returns how many were invited. */
export async function volunteerInvite(id: string, userIds: string[], note?: string) {
  return (await rpc('volunteer_invite', { p_opportunity: id, p_users: userIds, p_note: note?.trim() || null })) as number;
}

/** Answer your invite: Say Yes! (you're signed up) or Deny; whoever invited you is told. */
export async function volunteerInviteAnswer(id: string, yes: boolean) { await rpc('volunteer_invite_answer', { p_opportunity: id, p_yes: yes }); }

/** Its leaders: call off an invite that's still waiting (the person is told). */
export async function volunteerInviteCancel(id: string, userId: string) { await rpc('volunteer_invite_cancel', { p_opportunity: id, p_user: userId }); }

/** Its leaders: people who can volunteer whose name matches, and where each stands on this opportunity. */
export async function volunteerInvitePeople(id: string, search: string): Promise<InvitePerson[]> {
  return (await rpc('volunteer_invite_people', { p_opportunity: id, p_search: search })).map((r) => ({
    id: r.id, name: r.name, schoolRole: r.school_role, signedUp: r.signed_up,
    invite: r.invite ? enumValue(r.invite, ['pending', 'accepted', 'declined', 'cancelled']) : null,
  }));
}

/** Pledge (or change) how many of a request's items you'll bring; volunteerWithdraw takes it back. */
export async function volunteerPledge(id: string, quantity: number) { await rpc('volunteer_pledge', { p_opportunity: id, p_quantity: quantity }); }

export async function volunteerWithdraw(id: string) { await rpc('volunteer_withdraw', { p_opportunity: id }); }

/** The leader deletes it; the reason goes to every volunteer (none is needed before anyone has said yes). */
export async function volunteerDelete(id: string, reason: string) { await rpc('volunteer_delete', { p_opportunity: id, p_reason: reason }); }

export async function volunteerSend(id: string, body: string) { await rpc('volunteer_send', { p_opportunity: id, p_body: body }); }

/**
 * Scan a check-in code (the QR's text, or the short code under it): checks you in to what you said yes to that's open
 * now; once you're in, it asks you to confirm you're done (done: true checks you out).
 */
export async function volunteerScan(code: string, done = false): Promise<VolunteerScan> {
  const r = (await rpc('volunteer_scan', { p_code: code, p_done: done })) as Record<string, unknown>;
  return {
    action: enumValue(r.action, ['in', 'confirm', 'out']), opportunityId: String(r.opportunityId), title: String(r.title ?? ''),
    since: typeof r.since === 'string' ? r.since : null, minutes: typeof r.minutes === 'number' ? r.minutes : null,
  };
}

/** Its leaders: the check-in code of an opportunity or a whole event (made the first time); renew replaces it. */
export async function volunteerCheckInCode(of: { opportunityId: string } | { eventId: string }, renew = false) {
  return (await rpc('volunteer_check_in_code', {
    ...('opportunityId' in of ? { p_opportunity: of.opportunityId } : { p_event: of.eventId }), p_new: renew,
  })) as string;
}

/**
 * The leader marks a volunteer for one of its days: here (today only), done (with minutes; otherwise the time since they
 * checked in, or its scheduled length), a no-show, or null to clear it.
 */
export async function volunteerMark(id: string, userId: string, day: string, status: VolunteerAttendance['status'] | null, minutes?: number | null) {
  await rpc('volunteer_mark', { p_opportunity: id, p_user: userId, p_day: day, p_status: status, ...(minutes != null ? { p_minutes: minutes } : {}) });
}

/** Volunteer Leaders and the office: everyone's volunteering between two days (null: from the start; to today). */
export async function volunteerStats(from: string | null, to: string | null = null): Promise<VolunteerStat[]> {
  return (await rpc('volunteer_stats', { ...(from ? { p_from: from } : {}), ...(to ? { p_to: to } : {}) })).map((r) => ({
    userId: r.user_id, name: r.name, schoolRole: r.school_role, isLead: r.is_lead, shifts: r.shifts, minutes: r.minutes,
    noShows: r.no_shows, unmarked: r.unmarked, led: r.led, recentShifts: r.recent_shifts, recentMinutes: r.recent_minutes,
    upcoming: r.upcoming, lastDay: r.last_day, busy: r.busy,
  }));
}

/** One person's volunteering, newest first: your own, or anyone's for Volunteer Leaders and the office. */
export async function volunteerHistory(userId: string): Promise<VolunteerDay[]> {
  return (await rpc('volunteer_history', { p_user: userId })).map((r) => ({
    opportunityId: r.opportunity_id, title: r.title, eventTitle: r.event_title, day: r.day,
    startTime: r.start_time?.slice(0, 5) ?? null, endTime: r.end_time?.slice(0, 5) ?? null,
    status: enumValue(r.status, ['done', 'no_show', 'here', 'missed', 'coming', 'led']), minutes: r.minutes,
  }));
}

/** How much is a lot (hours or shifts in 30 days), and whether you can change it. */
export async function volunteerBusyLimits(): Promise<BusyLimits> {
  const l = (await rpc('volunteer_busy_limits')) as Partial<BusyLimits> | null;
  return { hours: Number(l?.hours ?? 12), shifts: Number(l?.shifts ?? 6), canEdit: !!l?.canEdit };
}

/** The office (groups.manage): change how much is a lot. */
export async function volunteerSetBusyLimits(hours: number, shifts: number) { await rpc('volunteer_set_busy_limits', { p_hours: hours, p_shifts: shifts }); }

export async function adminSetVolunteerLead(userId: string, on: boolean) {
  await rpc('admin_set_volunteer_lead', { p_user: userId, p_on: on });
}

/** Live changes to opportunities, sign-ups, chats and check-ins (row-level security limits them to what this person may see). */
export function subscribeVolunteer(onChange: () => void): () => void {
  return subscribeChanges('subscribeVolunteer', [{ event: '*', table: 'volunteer_opportunities' }, { event: '*', table: 'volunteer_signups' },
    { event: '*', table: 'volunteer_messages' }, { event: '*', table: 'volunteer_attendance' }, { event: '*', table: 'volunteer_invites' }], onChange);
}
