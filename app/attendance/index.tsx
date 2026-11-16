/**
 * Classes (Apps → Classes, the screen at /attendance), for teachers and staff, in the look of the Staff view's homes
 * (src/hub.tsx). A navy band counts their classes, the roll still to take and the absences reported, with the main thing
 * to do as a gold button (take the next roll, or All classes for the office). The office (checkin.manage) gets its tools
 * next as tiles: every class's roll, every absence parents reported, Check in & out (late arrivals and early pickups) and
 * On-Site Attendance (who's at school now, and the visitor desk). Then the class sections they lead, each with today's
 * roll at a glance (tap it to take roll, or after dismissal to send students home) and its assignments and a bulletin
 * to its families (the rest of what goes to families is in the Folder, Staff view); then tiles for messages from their
 * students (Ask the Teacher), their students' reported absences, substitutes and Extended care (its staff and the
 * office); and check-out lists for field trips and Activities events. Students keep Ask the Teacher and Assignments as
 * their own apps; this is the teacher side of both.
 */
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  isSchoolStaff, listAssignments, myAccess, myClassAttendance, session, staffToday, teacherConversations,
  type Assignment, type ClassRollSummary, type Person, type StaffToday, type TeacherConversation,
} from '../../src/api/connect';
import { ClassCard, ClassTool } from '../../src/attendance/parts';
import { isPastDay, schoolToday } from '../../src/calendar/past';
import { CheckoutLists } from '../../src/checkin/CheckoutLists';
import { mayHave } from '../../src/comms/mfa';
import { Band, GoldButton, Heading, Stat, Stats, ToolGrid, ToolTile } from '../../src/hub';
import { headerDate } from '../../src/info/today';
import { Card, Loading, P, s } from '../../src/ui';

type Data = {
  classes: ClassRollSummary[]; office: boolean; subs: boolean; messages: boolean; extendedCare: boolean;
  assignments: Assignment[]; conversations: TeacherConversation[]; today: StaffToday;
};

export default function Classes() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const p = await session().catch(() => null);
    setPerson(p);
    if (!isSchoolStaff(p)) return;
    const [classes, a, today] = await Promise.all([myClassAttendance().catch(() => []), myAccess().catch(() => null), staffToday().catch(() => ({}))]);
    const teaches = classes.length > 0;
    // Ask the Teacher's teacher side: their students' messages; `messages.review` reads every conversation.
    const messages = teaches || mayHave(a, 'messages.review');
    const [assignments, conversations] = await Promise.all([
      teaches ? listAssignments().catch(() => []) : [],
      messages ? teacherConversations().catch(() => []) : [],
    ]);
    setData({
      classes, office: !!a?.permissions.includes('checkin.manage'), subs: teaches || !!a?.permissions.includes('subs.manage'), messages,
      extendedCare: !!p?.extendedCare || mayHave(a, 'people.family') || mayHave(a, 'checkin.manage'),
      assignments: assignments.filter((x) => x.ownerId === p!.id && x.rosterId && !(x.dueOn && isPastDay(x.dueOn))),
      conversations: [...conversations], today,
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Classes' }} />;
  if (person === undefined) return <>{header}<Loading /></>;
  if (!isSchoolStaff(person)) return <View style={[s.screen, s.pad]}>{header}<Card><P>Classes is for teachers and staff.</P></Card></View>;
  if (!data) return <>{header}<Loading /></>;
  const { classes, office, today } = data;
  const unread = data.conversations.filter((c) => c.unread).length;
  const coming = (id: string) => data.assignments.filter((x) => x.rosterId === id).length;
  const toTake = classes.filter((c) => c.students > 0 && c.unmarked > 0);
  const next = toTake[0];
  const absences = office ? today.absencesToSee : today.absencesToday;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      <Band>
        <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>{headerDate(schoolToday()).toUpperCase()}</Text>
        {(classes.length > 0 || absences !== undefined || data.messages) && (
          <Stats>
            {classes.length > 0 && <Stat n={classes.length} label={classes.length === 1 ? 'Class' : 'Classes'} />}
            {classes.length > 0 && <Stat n={toTake.length} label="Roll to take" alert />}
            {absences !== undefined && <Stat n={absences} label={office ? 'Absences to see' : 'Reported absent'} alert={office} />}
            {data.messages && (classes.length === 0 || absences === undefined) && <Stat n={unread} label="Unread messages" alert />}
          </Stats>
        )}
        {next ? (
          <GoldButton icon="checkbox" label={`Take roll · ${next.name}`} onPress={() => router.push(`/attendance/${next.id}`)} />
        ) : office ? (
          <GoldButton icon="school" label="All classes" onPress={() => router.push('/attendance/all')} />
        ) : classes.length > 0 ? (
          <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>✓ Roll is in for every class today</Text>
        ) : null}
      </Band>

      {office && (
        <>
          <Heading text="Office" />
          <ToolGrid>
            {next && <ToolTile icon="school" title="All classes" sub="Every class’s roll for the day" onPress={() => router.push('/attendance/all')} />}
            <ToolTile icon="bed-outline" title="Absences" sub="Reported by parents; mark each seen" onPress={() => router.push('/forms/excused-absence')}
              badge={today.absencesToSee} />
            <ToolTile icon="log-in-outline" title="Check in or out" sub="Late arrivals and early pickups" onPress={() => router.push('/checkin')} />
            <ToolTile icon="location-outline" title="On-Site Attendance" sub="Who’s at school now, and visitors" onPress={() => router.push('/onsite')} />
          </ToolGrid>
        </>
      )}

      {(classes.length > 0 || !office) && <Heading text="Your classes" />}
      {classes.length === 0
        ? !office && <Card><P muted>{"You don't lead a class section yet. The office sets up sections in Admin portal → Classes."}</P></Card>
        : classes.map((c) => {
          const n = coming(c.id);
          // The card itself opens the roll (or Going home after dismissal), so its tools are the class's other things.
          return (
            <ClassCard key={c.id} c={c} onPress={() => router.push(`/attendance/${c.id}`)}>
              <ClassTool icon="checkbox-outline" label={n ? `Assignments · ${n}` : 'Assignments'}
                onPress={() => router.push({ pathname: '/assignments', params: { section: c.id } })} />
              <ClassTool icon="megaphone-outline" label="Bulletin"
                onPress={() => router.push({ pathname: '/forms/write', params: { kind: 'bulletin', section: c.id } })} />
            </ClassCard>
          );
        })}

      {(data.messages || (!office && classes.length > 0) || data.subs || data.extendedCare) && (
        <>
          <Heading text="More" />
          <ToolGrid>
            {data.messages && (
              <ToolTile icon="chatbubbles-outline" title="Messages" badge={unread} onPress={() => router.push('/teachers')}
                sub={classes.length ? 'Ask the Teacher, with your students' : 'Every Ask the Teacher conversation'} />
            )}
            {!office && classes.length > 0 && (
              <ToolTile icon="bed-outline" title="Absences" sub="Your students’, reported by parents" onPress={() => router.push('/forms/excused-absence')}
                badge={today.absencesToday} />
            )}
            {data.subs && <ToolTile icon="people" title="Substitutes" sub="Schedule a sub, with your sub plans" onPress={() => router.push('/subs')} />}
            {data.extendedCare && <ToolTile icon="home-outline" title="Extended care" sub="Today’s check-out, and who stays" onPress={() => router.push('/extended-care')} />}
          </ToolGrid>
        </>
      )}

      <CheckoutLists canStart={classes.length > 0} />
    </ScrollView>
  );
}
