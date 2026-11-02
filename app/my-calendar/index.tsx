/**
 * My calendar, for teachers and staff: one list, day by day, of their own events (meetings,
 * duties), the games they're going to (which follow the schedule: moved or cancelled games update
 * here), and, shown lighter with a dashed edge, the games, performances and meets students in
 * their classes are signed up for, with who's in them as a row of their photos under the time
 * (names only for screen readers and in "I'll be there"). "I'll be there" stars one (and can tell
 * those students and their parents). Filters: All, Mine, My students'. Every event can be added to
 * Google, Outlook, Yahoo or Apple, and the whole calendar subscribed to (names stay in the app).
 * Like every calendar in the app, past items stay behind "Show past" and look greyed out.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  errorText, getUser, isSchoolStaff, live, myCalendar, planStudentEvent, session, studentEvents,
  type MyCalendarItem, type Person, type StudentEvent,
} from '../../src/api/connect';
import { isPastDay, isPastTime, schoolToday, splitPast } from '../../src/calendar/past';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { clock } from '../../src/carline/time';
import { byDay, itemTime, longDay } from '../../src/myCalendar/when';
import { dayOf, addDays } from '../../src/info/today';
import { AddToCalendar } from '../../src/calendar/AddToCalendar';
import { chicagoIso, type CalEvent } from '../../src/calendar/addTo';
import { SubscribeCard } from '../../src/calendar/SubscribeCard';
import { Avatar, Button, C, Card, Chip, H, Loading, P, ask, s } from '../../src/ui';

type Filter = 'all' | 'mine' | 'students';
type Data = { me: Person | null; mine: MyCalendarItem[]; students: StudentEvent[] };
type Entry = { key: string; date: string; at: string; past: boolean } & (
  | { kind: 'mine'; item: MyCalendarItem; students: { id: string; name: string }[] }
  | { kind: 'student'; ev: StudentEvent });

/** "16:30" on the school's clock, for ordering within a day. */
const clock24 = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false });

/** A My calendar item as calendar apps take it (school-time date and times → exact moments). */
function toCal(i: MyCalendarItem): CalEvent {
  if (!i.startTime) return { title: i.title, date: i.date, location: i.location, details: i.notes || null };
  const at = (t: string) => chicagoIso(i.date, t);
  return { title: i.title, startsAt: at(i.startTime), endsAt: i.endTime ? at(i.endTime) : null, location: i.location, details: i.notes || null };
}

export default function MyCalendar() {
  const [filter, setFilter] = useState<Filter>('all');
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const past = usePastToggle();

  const load = useCallback(async () => {
    const me = live ? await session().catch(() => null) : null;
    if (!isSchoolStaff(me)) { setData({ me, mine: [], students: [] }); return; }
    const today = schoolToday();
    const [from, to] = [addDays(today, -30), addDays(today, 180)];
    try {
      const [mine, students] = await Promise.all([myCalendar(from, to), studentEvents(from, to)]);
      setData({ me, mine, students });
    } catch (e) {
      Alert.alert('Could not load your calendar', errorText(e));
      setData({ me, mine: [], students: [] });
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'My calendar' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>My calendar needs the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (!data) return <>{header}<Loading /></>;
  if (!data.me) return box(
    <Card>
      <H>Sign in to see your calendar</H>
      <Button label="Sign in" onPress={() => router.navigate('/connect')} />
    </Card>,
  );
  if (!isSchoolStaff(data.me)) return box(<Card><H>For teachers and staff</H><P muted>My calendar is for teachers and staff. The school calendar is in Calendar.</P></Card>);

  const plan = (e: StudentEvent, going: boolean, tell = false) => {
    setBusy(e.id);
    planStudentEvent(e.id, going, tell)
      .then((n) => { if (tell && n > 0) Alert.alert('On your calendar', `${n === 1 ? 'Your student and their parents know' : `Your ${n} students and their parents know`} you're coming.`); })
      .catch((x) => Alert.alert('Could not change your calendar', errorText(x)))
      .finally(() => { setBusy(null); load(); });
  };
  const tellAndPlan = (e: StudentEvent) => ask("You'll be there?", `It goes on My calendar, and ${names(e)} and their parents hear you're coming.`,
    "I'll be there", () => plan(e, true, true));
  const takeOff = (i: MyCalendarItem) => ask('Take it off your calendar?', i.title, 'Take it off',
    () => planStudentEvent(i.sportEventId!, false).then(load).catch((x) => Alert.alert('Could not change your calendar', errorText(x))));
  const open = (i: MyCalendarItem) => (i.sportEventId
    ? i.sportId && router.push(`/activities/${i.sportId}`)
    : router.push({ pathname: '/my-calendar/edit', params: { id: i.id, date: i.date } }));

  const filters = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([['all', 'All'], ['mine', 'Mine'], ['students', 'My students’']] as [Filter, string][]).map(([k, label]) => (
        <Pressable key={k} onPress={() => setFilter(k)} accessibilityRole="button" accessibilityState={{ selected: filter === k }}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.line,
            backgroundColor: filter === k ? C.primary : '#fff' }}>
          <Text style={{ fontWeight: '700', color: filter === k ? '#fff' : C.ink }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  // One list: the teacher's own events and planned games, and their students' other games, by day.
  const byEvent = new Map(data.students.map((e) => [e.id, e]));
  const entries: Entry[] = [
    ...data.mine.map((i): Entry => ({ kind: 'mine', key: `m-${i.id}`, date: i.date, at: i.startTime ?? '', past: isPastDay(i.date), item: i,
      students: i.sportEventId ? byEvent.get(i.sportEventId)?.students ?? [] : [] })),
    ...data.students.filter((e) => !e.planned).map((e): Entry => ({ kind: 'student', key: `s-${e.id}`, date: dayOf(e.startsAt),
      at: clock24(e.startsAt), past: isPastTime(e.startsAt, e.endsAt), ev: e })),
  ].filter((x) => filter === 'all' || (filter === 'mine' ? x.kind === 'mine' : x.kind === 'student' || x.students.length > 0))
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  const split = splitPast(entries, (x) => x.past);
  const shown = [...(past.shown ? split.past : []), ...split.upcoming];

  const mineCard = (x: Extract<Entry, { kind: 'mine' }>) => {
    const i = x.item;
    return (
      <Card key={x.key} onPress={() => open(i)} style={{ gap: 6, ...(x.past ? PAST_STYLE : null) }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: TIME_WIDTH, gap: 8 }}>
            <Text style={{ fontWeight: '800', color: i.cancelled ? C.muted : C.primary }}>{itemTime(i.startTime, i.endTime)}</Text>
            <Faces students={x.students} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: C.ink, textDecorationLine: i.cancelled ? 'line-through' : 'none' }}>{i.title}</Text>
            {!!i.location && <P muted>{i.location}</P>}
            {!!i.notes && <P muted>{i.notes}</P>}
          </View>
        </View>
        <View style={[s.row, { alignItems: 'center', flexWrap: 'wrap' }]}>
          {i.sportEventId && <Chip label="★ Going" color="#0D9488" />}
          {i.cancelled && <Chip label="Cancelled" color={C.danger} />}
          {i.sportEventId && !x.past && (
            <Text onPress={() => takeOff(i)} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>Not going</Text>
          )}
          {!x.past && <AddToCalendar event={toCal(i)} uid={i.sportEventId ? `activity-${i.sportEventId}` : undefined} />}
        </View>
      </Card>
    );
  };
  const studentCard = (x: Extract<Entry, { kind: 'student' }>) => {
    const e = x.ev;
    return (
      <Card key={x.key} style={{ gap: 6, borderStyle: 'dashed', backgroundColor: '#FBFCFE', ...(x.past ? PAST_STYLE : null) }}>
        <Pressable onPress={() => router.push(`/activities/${e.sportId}`)} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: TIME_WIDTH, gap: 8 }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>{clock(e.startsAt)}</Text>
            <Faces students={e.students} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: C.muted, fontWeight: '700' }}>{e.sportIcon} {e.sportName}</Text>
            <Text style={{ fontWeight: '700', color: C.ink, textDecorationLine: e.cancelled ? 'line-through' : 'none' }}>{e.title}</Text>
            {!!e.location && <P muted>{e.location}</P>}
          </View>
        </Pressable>
        {e.cancelled ? <View style={s.row}><Chip label="Cancelled" color={C.danger} /></View> : !x.past && (
          <View style={[s.row, { alignItems: 'center', flexWrap: 'wrap', gap: 14 }]}>
            <Text onPress={() => busy !== e.id && tellAndPlan(e)} accessibilityRole="button" style={{ color: C.primary, fontWeight: '800' }}>☆ I’ll be there</Text>
            <Text onPress={() => busy !== e.id && plan(e, true)} accessibilityRole="button" style={{ color: C.muted, fontWeight: '700' }}>Add without telling</Text>
          </View>
        )}
      </Card>
    );
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 10 }]}>
      {header}
      <Button label="+ Add to my calendar" onPress={() => router.push('/my-calendar/edit')} />
      {filters}
      <PastToggle count={split.past.length} shown={past.shown} onToggle={past.toggle} />
      {!split.upcoming.length && (
        <Card><P muted>Nothing coming up. Add meetings and duties here; your students’ games and performances show up on their own.</P></Card>
      )}
      {byDay(shown, (x) => x.date).map((g) => (
        <View key={g.day} style={{ gap: 8 }}>
          <Text style={[{ fontWeight: '800', color: C.muted, marginTop: 6 }, isPastDay(g.day) && PAST_STYLE]}>{longDay(g.day).toUpperCase()}</Text>
          {g.items.map((x) => (x.kind === 'mine' ? mineCard(x) : studentCard(x)))}
        </View>
      ))}
      <SubscribeCard staff />
    </ScrollView>
  );
}

const TIME_WIDTH = 92;
const FACE = 30;      // each photo, with its white ring
const STEP = 20;      // how far along the next one starts (they overlap by a third)

/**
 * Who's in it, as overlapping photos (initials when there's no photo) in the space under the time: up to four, or
 * three and "+N". The names are there for screen readers.
 */
function Faces({ students }: { students: { id: string; name: string }[] }) {
  if (!students.length) return null;
  const max = Math.floor((TIME_WIDTH - FACE) / STEP) + 1;
  const shown = students.length > max ? students.slice(0, max - 1) : students;
  const more = students.length - shown.length;
  const ring = { position: 'absolute' as const, top: 0, width: FACE, height: FACE, borderRadius: FACE / 2, borderWidth: 2, borderColor: '#fff', overflow: 'hidden' as const };
  return (
    <View accessible accessibilityLabel={`${students.length === 1 ? 'Student' : 'Students'} in it: ${students.map((x) => x.name).join(', ')}`}
      style={{ height: FACE, width: FACE + STEP * (shown.length + (more ? 1 : 0) - 1) }}>
      {shown.map((x, i) => {
        const [first, ...rest] = x.name.split(' ');
        return (
          <View key={x.id} style={[ring, { left: i * STEP, zIndex: shown.length - i, backgroundColor: '#fff' }]}>
            <Avatar person={{ firstName: first, lastName: rest.join(' '), avatar: getUser(x.id)?.avatar }} size={FACE - 4} />
          </View>
        );
      })}
      {more > 0 && (
        <View style={[ring, { left: shown.length * STEP, zIndex: 0, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>+{more}</Text>
        </View>
      )}
    </View>
  );
}

/** "Ava", "Ava and Liam", "Ava, Liam and 2 others": first names of the class students in it. */
function names(e: StudentEvent) {
  const first = e.students.map((x) => x.name.split(' ')[0]);
  if (first.length <= 2) return first.join(' and ') || 'your students';
  return `${first[0]}, ${first[1]} and ${first.length - 2} other${first.length === 3 ? '' : 's'}`;
}
