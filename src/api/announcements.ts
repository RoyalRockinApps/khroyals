/**
 * announcements: internal API implementation. Screens import the connect facade. The Announcements app
 * (supabase/migrations/…_announcements.sql): push.send holders send a push and bell notification and/or a splash page
 * to an audience, now or later; everyone else gets their splash pages (`mySplash`) and opens an announcement from its
 * notification (`viewAnnouncement`). Splash graphics are in the private 'announcements' bucket. Builds without the
 * school server use src/announcements/sample.ts.
 */
import type { Academy, Announcement, Audience } from './types';
import { live, rpc, run, sb } from './client';
import { current } from './session';
import { signedPhotoUrls, uploadJpeg } from './storage';
import * as demo from '../announcements/sample';

function toAnnouncement(r: any): Announcement {
  return {
    id: r.id, title: r.title ?? '', body: r.body ?? '', audienceLabel: r.audienceLabel ?? '', audience: r.audience ?? null, urgent: !!r.urgent,
    link: r.link ?? null, push: r.push !== false, sendAt: r.sendAt, sentAt: r.sentAt ?? null, reach: r.reach ?? null, cancelledAt: r.cancelledAt ?? null,
    createdAt: r.createdAt, splash: !!r.splash, splashImage: r.splashImage ?? null, splashImageUrl: '', splashTemplate: r.splashTemplate ?? null,
    splashPhoto: r.splashPhoto ?? null, splashPhotoUrl: '', splashHeadline: r.splashHeadline ?? '', splashText: r.splashText ?? '',
    splashButton: r.splashButton ?? '', splashStartsOn: r.splashStartsOn ?? null, splashEndsOn: r.splashEndsOn ?? null,
    sender: r.sender ?? null, opened: Number(r.opened ?? 0), seen: Number(r.seen ?? 0), closed: Number(r.closed ?? 0), tapped: Number(r.tapped ?? 0),
  };
}

/** Links to their splash pictures (the bucket is private). */
async function withPictures(list: Announcement[]): Promise<Announcement[]> {
  const paths = list.flatMap((a) => [a.splashImage, a.splashPhoto].filter((p): p is string => !!p && !p.startsWith('data:')));
  const urls = paths.length ? await signedPhotoUrls('announcements', paths).catch(() => ({} as Record<string, string>)) : {};
  const url = (p: string | null) => (!p ? '' : p.startsWith('data:') ? p : urls[p] ?? '');
  return list.map((a) => ({ ...a, splashImageUrl: url(a.splashImage), splashPhotoUrl: url(a.splashPhoto) }));
}

/** How many people an audience reaches (the sender left out). */
export async function announcementReach(a: Audience): Promise<number> {
  if (!live) return demo.sampleReach(a);
  return rpc('announcement_reach', { p_audience: a });
}

/** Uploads a splash picture (JPEG) to the sender's own folder; returns its path. */
export async function uploadAnnouncementPicture(base64: string): Promise<string> {
  if (!live) return `data:image/jpeg;base64,${base64}`;
  if (!current) throw new Error('Sign in first.');
  const path = `${current.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  await uploadJpeg('announcements', path, base64);
  return path;
}

export type NewAnnouncement = {
  title: string; body: string; audience: Audience; audienceLabel: string; urgent: boolean; link: string | null; push: boolean;
  /** When to send it ("YYYY-MM-DD" and "HH:MM", Central); null: now. */
  sendOn: string | null; sendTime: string | null;
  splash: null | {
    image: string | null; template: string | null; photo: string | null; headline: string; text: string; button: string; startsOn: string; endsOn: string;
  };
};

export async function sendAnnouncement(a: NewAnnouncement): Promise<string> {
  if (!live) {
    const sendAt = a.sendOn ? new Date(`${a.sendOn}T${a.sendTime ?? '07:00'}:00`).toISOString() : new Date().toISOString();
    return demo.sampleSend({
      title: a.title, body: a.body, audience: a.audience, audienceLabel: a.audienceLabel, urgent: a.urgent, link: a.link, push: a.push, sendAt,
      splash: !!a.splash, splashImage: a.splash?.image ?? null, splashImageUrl: a.splash?.image ?? '', splashTemplate: a.splash?.image ? null : a.splash?.template ?? null,
      splashPhoto: a.splash?.photo ?? null, splashPhotoUrl: a.splash?.photo ?? '', splashHeadline: a.splash?.headline ?? '', splashText: a.splash?.text ?? '',
      splashButton: a.splash?.button ?? '', splashStartsOn: a.splash?.startsOn ?? null, splashEndsOn: a.splash?.endsOn ?? null,
    }, demo.sampleReach(a.audience));
  }
  const s = a.splash;
  return rpc('announcement_send', {
    p_title: a.title, p_body: a.body, p_audience: a.audience, p_audience_label: a.audienceLabel, p_urgent: a.urgent, p_link: a.link,
    p_push: a.push, p_send_on: a.sendOn, p_send_time: a.sendTime,
    p_splash: s ? {
      ...(s.image ? { image: s.image } : { template: s.template ?? 'navy', photo: s.photo, headline: s.headline, text: s.text }),
      button: s.button, startsOn: s.startsOn, endsOn: s.endsOn,
    } : null,
  });
}

/** Stops a scheduled one (it never goes out) or a splash page (it stops showing). */
export async function cancelAnnouncement(id: string): Promise<void> {
  if (!live) return demo.sampleCancel(id);
  await rpc('announcement_cancel', { p_id: id });
}

/** The history, newest first, with counts. */
export async function listAnnouncements(): Promise<Announcement[]> {
  if (!live) return demo.sampleAnnouncements().map((a) => ({ ...a }));
  const rows = await rpc('announcements_list');
  return withPictures(Array.isArray(rows) ? rows.map(toAnnouncement) : []);
}

/** One announcement, for the people it went to (from its notification). */
export async function viewAnnouncement(id: string): Promise<Announcement | null> {
  if (!live) return demo.sampleAnnouncement(id);
  const r = await rpc('announcement_view', { p_id: id });
  return r && typeof r === 'object' && !Array.isArray(r) ? (await withPictures([toAnnouncement(r)]))[0] : null;
}

/** The splash page to show now, if any. */
export async function mySplash(): Promise<Announcement | null> {
  if (!live) return demo.sampleSplash();
  if (!current || current.pending) return null;
  const r = await rpc('my_splash');
  return r && typeof r === 'object' && !Array.isArray(r) ? (await withPictures([toAnnouncement(r)]))[0] : null;
}

export async function markSplash(id: string, action: 'seen' | 'closed' | 'tapped'): Promise<void> {
  if (!live) return demo.sampleMark(id, action);
  await rpc('splash_mark', { p_id: id, p_action: action });
}

/** The school's academies (for picking an audience). */
export async function listAcademies(): Promise<Academy[]> {
  if (!live) {
    return [['early-learning', 'Early Learning Academy', -3, -1], ['formation', 'Formation Academy', 0, 5], ['presence', 'Presence Academy', 6, 8],
      ['kingdom', 'Kingdom Academy', 9, 12]].map(([id, name, minGrade, maxGrade]) => ({ id, name, minGrade, maxGrade }) as Academy);
  }
  return (await run(sb().from('academies').select('*').order('position'))).map((r) => ({ id: r.id, name: r.name, minGrade: r.min_grade, maxGrade: r.max_grade }));
}
