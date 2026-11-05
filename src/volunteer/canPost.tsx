/**
 * Who posts in Volunteer: Volunteer Leaders, and the coaches and directors of an activity (staff on its coaches),
 * as the database's app.posts_volunteer. Volunteer analytics stay with Volunteer Leaders and directors.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { isSchoolStaff, isVolunteerLead, listSports, type Person, type Sport } from '../api/connect';
import { Card, Loading, P, s } from '../ui';

/** Coaches or directs one of these activities (staff only, like the database). */
export const coaches = (p: Person | null, sports: Pick<Sport, 'coachIds'>[]) =>
  isSchoolStaff(p) && sports.some((sp) => sp.coachIds.includes(p!.id));

/**
 * Whether this person posts opportunities and starts events: undefined while their coaching is still being looked up
 * (Volunteer Leaders and people who aren't staff are known at once).
 */
export function useCanPost(me: Person): boolean | undefined {
  const lead = isVolunteerLead(me);
  const staff = isSchoolStaff(me);
  const [coach, setCoach] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (lead || !staff) return;
    let on = true;
    listSports().then(({ sports }) => on && setCoach(coaches(me, sports))).catch(() => on && setCoach(false));
    return () => { on = false; };
  }, [me, lead, staff]);
  return lead ? true : !staff ? false : coach;
}

/** A screen only for people who post (new opportunity, new event): waits for the answer, then shows it or why not. */
export function PostGate({ me, children, why }: { me: Person; children: ReactNode; why: string }) {
  const posts = useCanPost(me);
  if (posts === undefined) return <Loading />;
  return posts ? <>{children}</> : <View style={[s.screen, s.pad]}><Card><P muted>{why}</P></Card></View>;
}
