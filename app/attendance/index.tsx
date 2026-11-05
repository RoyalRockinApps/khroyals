/**
 * Classes (Apps → Classes, the screen at /attendance), for teachers and staff: the class sections they
 * lead, each with today's roll at a glance (tap it to take roll and see the office's late arrivals and
 * early check-outs) and its assignments; messages from their students (Ask the Teacher); substitutes;
 * and check-out lists for field trips and Activities events. Students keep Ask the Teacher and
 * Assignments as their own apps; this is the teacher side of both. The office (checkin.manage) also
 * gets every class's roll, Check in & out, where it records late arrivals and early pickups, and On-Site Attendance
 * (who's at school now, and the visitor desk). The office and extended care staff get Extended care.
 */
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isSchoolStaff, listAssignments, myAccess, myClassAttendance, session, teacherConversations,
  type Assignment, type ClassRollSummary, type Person, type TeacherConversation,
} from '../../src/api/connect';
import { ClassCard, ClassTool } from '../../src/attendance/parts';
import { isPastDay } from '../../src/calendar/past';
import { CheckoutLists } from '../../src/checkin/CheckoutLists';
import { mayHave } from '../../src/comms/mfa';
import { Card, C, H, Loading, P, s } from '../../src/ui';

type Data = {
  classes: ClassRollSummary[]; office: boolean; subs: boolean; messages: boolean; extendedCare: boolean;
  assignments: Assignment[]; conversations: TeacherConversation[];
};

/** A way in to one of the hub's tools: an icon, what it is and a line about it. */
function Row({ icon, title, sub, href, strong, badge }: {
  icon: ComponentProps<typeof Ionicons>['name']; title: string; sub: string; href: Href; strong?: boolean; badge?: number;
}) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={badge ? `${title}, ${badge} new` : title}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
        backgroundColor: strong ? C.primary : '#fff', borderWidth: strong ? 0 : 1, borderColor: C.line }, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={24} color={strong ? '#fff' : C.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: strong ? '#fff' : C.ink, fontSize: 16, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: strong ? '#fff' : C.muted, opacity: strong ? 0.85 : 1 }}>{sub}</Text>
      </View>
      {!!badge && (
        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.danger }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={20} color={strong ? '#fff' : C.muted} />
    </Pressable>
  );
}

export default function Classes() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const p = await session().catch(() => null);
    setPerson(p);
    if (!isSchoolStaff(p)) return;
    const [classes, a] = await Promise.all([myClassAttendance().catch(() => []), myAccess().catch(() => null)]);
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
      conversations: [...conversations],
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Classes' }} />;
  if (person === undefined) return <>{header}<Loading /></>;
  if (!isSchoolStaff(person)) return <View style={[s.screen, s.pad]}>{header}<Card><P>Classes is for teachers and staff.</P></Card></View>;
  if (!data) return <>{header}<Loading /></>;
  const { classes, office } = data;
  const unread = data.conversations.filter((c) => c.unread).length;
  const coming = (id: string) => data.assignments.filter((x) => x.rosterId === id).length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      {office && <Row strong icon="school" title="All classes" sub="Every class's roll for the day" href="/attendance/all" />}
      <Row icon="bed-outline" title="Absences reported by parents" href="/forms/excused-absence"
        sub={office ? 'Every student’s, a day at a time; mark each seen' : 'Your students’, a day at a time'} />
      {office && <Row icon="log-in-outline" title="Check a student in or out" sub="Late arrivals and early pickups, and today's list" href="/checkin" />}
      {office && <Row icon="location-outline" title="On-Site Attendance" sub="Who’s at school now, and the visitor desk" href="/onsite" />}
      {data.extendedCare && <Row icon="home-outline" title="Extended care" sub="Today’s check-out, and who stays which days" href="/extended-care" />}

      {(classes.length > 0 || !office) && <H>Your classes</H>}
      {classes.length === 0
        ? !office && <P muted>{"You don't lead a class section yet. The office sets up sections in Admin portal → Classes."}</P>
        : classes.map((c) => {
          const n = coming(c.id);
          return (
            <ClassCard key={c.id} c={c} onPress={() => router.push(`/attendance/${c.id}`)}>
              <ClassTool first icon="clipboard-outline" label="Take roll" onPress={() => router.push(`/attendance/${c.id}`)} />
              <ClassTool icon="checkbox-outline" label={n ? `Assignments · ${n}` : 'Assignments'}
                onPress={() => router.push({ pathname: '/assignments', params: { section: c.id } })} />
            </ClassCard>
          );
        })}

      {data.messages && (
        <Row icon="chatbubbles-outline" title="Messages" href="/teachers" badge={unread}
          sub={classes.length ? 'Ask the Teacher: write to your students and answer theirs' : 'Every Ask the Teacher conversation'} />
      )}
      {data.subs && <Row icon="people" title="Substitutes" sub="Schedule a sub, with your sub plans" href="/subs" />}

      <CheckoutLists />
    </ScrollView>
  );
}
