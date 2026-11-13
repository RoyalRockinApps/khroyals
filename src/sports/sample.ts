/**
 * Sample sports for builds without the school server (demo data), dated around
 * today so every section of the Sports page has something in it. Volleyball also has a
 * sample team (the demo people's children), its board and its parent chat.
 */
import type { EventKind } from './categories';
import { schoolToday } from './seasons';

const day = (today: string, offset: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
/** 4:30 PM Central on a day, as an ISO time (Central is UTC-5 or -6; -5 is close enough for samples). */
const at = (today: string, offset: number, hour: number, minute = 0) =>
  new Date(`${day(today, offset)}T${String(hour + 5).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`).toISOString();

export function sampleSports(now = new Date()) {
  const t = schoolToday(now);
  const sports = [
    { id: 'sample-vb', name: 'Volleyball', icon: '🏐', description: 'Middle and high school girls\' volleyball (AHSAA).', category: 'sports' as const, coachIds: ['u-vbcoach'] },
    { id: 'sample-bb', name: 'Basketball', icon: '🏀', description: 'Boys\' and girls\' basketball for grades 6–12.', category: 'sports' as const, coachIds: [] as string[] },
    { id: 'sample-soc', name: 'Soccer', icon: '⚽', description: 'Spring soccer.', category: 'sports' as const, coachIds: [] as string[] },
    { id: 'sample-musical', name: 'Spring Musical', icon: '🎭', description: 'The spring production in the Dream Theatre.', category: 'theater' as const, coachIds: [] as string[] },
  ];
  const seasons = [
    { id: 'sample-vb-26', sportId: 'sample-vb', name: 'Fall season', startsOn: day(t, -75), endsOn: day(t, 13),
      signupOpens: null, signupCloses: null, minGrade: 6, maxGrade: 12,
      details: 'Practice Monday–Thursday, 3:30–5:30 PM in the gym.', infoUrl: null },
    { id: 'sample-bb-26', sportId: 'sample-bb', name: 'Winter season', startsOn: day(t, 15), endsOn: day(t, 120),
      signupOpens: day(t, -6), signupCloses: day(t, 12), minGrade: 6, maxGrade: 12,
      details: 'Tryouts the first week. A sports physical is required before the first practice.', infoUrl: null },
    { id: 'sample-soc-27', sportId: 'sample-soc', name: 'Spring season', startsOn: day(t, 120), endsOn: day(t, 200),
      signupOpens: day(t, 90), signupCloses: day(t, 110), minGrade: 6, maxGrade: 12, details: '', infoUrl: null },
    { id: 'sample-musical-27', sportId: 'sample-musical', name: '2027 production', startsOn: day(t, 20), endsOn: day(t, 150),
      signupOpens: day(t, -3), signupCloses: day(t, 18), minGrade: 6, maxGrade: 12,
      details: 'Everyone who signs up auditions; parts are posted the week after.', infoUrl: null },
  ];
  const event = (id: string, seasonId: string, kind: EventKind, title: string, offset: number, hour: number,
    location: string, home: boolean | null) => ({
    id, seasonId, kind, title, startsAt: at(t, offset, hour), endsAt: null, location, home, notes: '', cancelled: false,
  });
  const events = [
    event('sample-e1', 'sample-vb-26', 'game', 'vs. Randolph', 2, 16, 'Gym', true),
    event('sample-e2', 'sample-vb-26', 'practice', 'Practice', 3, 15, 'Gym', null),
    event('sample-e3', 'sample-vb-26', 'game', 'at Randolph', 5, 17, 'Randolph School', false),
    event('sample-e4', 'sample-vb-26', 'tournament', 'Area tournament', 9, 9, 'Madison Academy', false),
    event('sample-e5', 'sample-bb-26', 'tryout', 'Tryouts', 15, 15, 'Gym', null),
    event('sample-e6', 'sample-musical-27', 'audition', 'Auditions', 20, 15, 'Dream Theatre', null),
    event('sample-e7', 'sample-musical-27', 'rehearsal', 'First read-through', 27, 15, 'Dream Theatre', null),
  ];
  return { sports, seasons, events };
}

/** Volleyball's sample team for demo builds: its roster, the coach's board and the parents' chat (other activities have none). */
export function sampleTeam(sportId: string, now = new Date()) {
  if (sportId !== 'sample-vb') return { roster: [], bulletins: [], chat: [] };
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();
  const kid = (studentId: string, firstName: string, lastName: string, grade: number, parent: string) =>
    ({ studentId, firstName, lastName, grade, avatar: '', seasons: ['Fall season'], parents: [parent] });
  const post = (id: string, title: string, body: string, pinned: boolean, hours: number) =>
    ({ id, sportId, authorId: 'u-vbcoach', title, body, pinned, createdAt: ago(hours), updatedAt: ago(hours) });
  const say = (id: string, authorId: string, body: string, hours: number) => ({ id, sportId, authorId, body, createdAt: ago(hours) });
  return {
    roster: [
      kid('u-s07', 'Chloe', 'Diaz', 12, 'Mark Diaz'), kid('u-s05', 'Zoe', 'Ortiz', 11, 'Luis Ortiz'), kid('u-s03', 'Mia', 'Brooks', 10, 'Dana Brooks'),
      kid('u-s01', 'Ava', 'Reyes', 10, 'Rosa Reyes'), kid('u-s09', 'Emma', 'Shah', 9, 'Priya Shah'),
    ].sort((a, b) => a.lastName.localeCompare(b.lastName)),
    bulletins: [
      post('sample-b1', 'Tournament packing list', 'Home and away jerseys, knee pads, two water bottles and a snack. We leave the school at 7:15 sharp, so please be there by 7:00.', true, 30),
      post('sample-b2', 'Great win Tuesday!', 'Proud of how the team served under pressure. Film review at Thursday\'s practice.', false, 6),
      post('sample-b3', '', 'Team pictures are Monday before practice. Wear the white jersey.', false, 52),
    ],
    chat: [
      say('sample-c1', 'u-p01', 'Can anyone give Ava a ride to Saturday\'s tournament? I work until noon.', 20),
      say('sample-c2', 'u-p03', 'We have room for one more. Mia and Ava can ride together.', 19),
      say('sample-c3', 'u-p01', 'Thank you, Dana!', 18),
      say('sample-c4', 'u-vbcoach', 'Reminder: the snack sign-up for Saturday is on the Volunteer app.', 3),
    ],
  };
}
