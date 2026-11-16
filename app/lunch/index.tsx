/**
 * Lunch visits. Parents and family the school linked pick a child (a circle with their face and name,
 * src/lunch/KidCircles.tsx) and see the lunch times open to them over the next three weeks as blocks on
 * a week calendar (src/lunch/LunchCalendar.tsx; the office sets the days, times, grades and how many
 * visitors), book one after reading the allergy notes (app/lunch/book.tsx), and see or call off their visits.
 * Teachers and staff see who's coming each day, with each child's allergies; lunch.manage holders
 * set the lunch times, closed days and rules (app/lunch/settings.tsx) and can cancel a visit.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import {
  cancelLunchVisit, errorText, isSchoolStaff, live, lunchKids, lunchSlots, lunchVisitors, myAccess, myLunchVisits, session,
  type LunchKid, type LunchSlot, type LunchVisitor, type MyLunchVisit, type Person,
} from '../../src/api/connect';
import { clock } from '../../src/absences/labels';
import { schoolToday } from '../../src/calendar/past';
import { addDays } from '../../src/info/today';
import { gradeLabel } from '../../src/comms/grades';
import { KidCircles } from '../../src/lunch/KidCircles';
import { LunchCalendar } from '../../src/lunch/LunchCalendar';
import { ManageButton } from '../../src/ManageButton';
import { Avatar, C, Card, H, Loading, P, ask, s } from '../../src/ui';

const longDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const span = (a: string, b: string) => `${clock(a)}–${clock(b)}`;

export default function Lunch() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<LunchKid[]>([]);
  const [ready, setReady] = useState(false);   // the children are in (until then, nothing says there are none)
  const [kid, setKid] = useState<string | null>(null);
  // The open times and whose they are, so another child's calendar starts fresh (LunchCalendar's key).
  const [slots, setSlots] = useState<{ kid: string; list: LunchSlot[] } | null>(null);
  const [mine, setMine] = useState<MyLunchVisit[]>([]);
  const [manage, setManage] = useState(false);
  const [day, setDay] = useState(schoolToday());
  const [visitors, setVisitors] = useState<LunchVisitor[] | null>(null);

  const load = useCallback(async () => {
    const p = live ? await session().catch(() => null) : null;
    setMe(p);
    if (!p || p.pending) return;
    try {
      const [k, v, a] = await Promise.all([lunchKids(), myLunchVisits(), myAccess().catch(() => null)]);
      setKids(k); setMine(v); setManage(!!a?.permissions.includes('lunch.manage'));
      setKid((cur) => cur ?? k[0]?.id ?? null);
    } catch (e) { Alert.alert('Lunch visits', errorText(e)); }
    setReady(true);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => {
    if (kid) lunchSlots(kid, schoolToday(), 21).then((list) => setSlots({ kid, list })).catch(() => setSlots({ kid, list: [] }));
  }, [kid]));
  const staff = isSchoolStaff(me ?? null);
  useFocusEffect(useCallback(() => {
    if (staff) lunchVisitors(day).then(setVisitors).catch(() => setVisitors([]));
  }, [staff, day]));

  const header = <Stack.Screen options={{
    title: 'Lunch visits',
    headerRight: manage ? () => (
      <ManageButton app="Lunch Visits" items={[{ icon: 'options-outline', label: 'Lunch times, closed days and rules', href: '/lunch/settings' }]} />
    ) : undefined,
  }} />;
  if (me === undefined || (me && !me.pending && !ready)) return <>{header}<Loading /></>;
  if (!live || !me || me.pending) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Sign in to visit at lunch.</P></Card></View>;

  const callOff = (v: { id: string }, what: string, office = false) => ask(office ? 'Cancel this visit?' : 'Call off this visit?', what, office ? 'Cancel visit' : 'Call off',
    () => cancelLunchVisit(v.id, office ? 'Cancelled by the school office.' : '').then(() => { load(); if (staff) lunchVisitors(day).then(setVisitors); if (kid) lunchSlots(kid, schoolToday(), 21).then((list) => setSlots({ kid, list })); })
      .catch((e) => Alert.alert('Not changed', errorText(e))));
  const upcoming = mine.filter((v) => v.status === 'booked');
  // Visits name the child by first name; their circle's photo, unless two of the children share it.
  const faceOf = (first: string) => { const k = kids.filter((x) => x.firstName === first); return k.length === 1 ? k[0] : null; };
  const book = (x: LunchSlot) => router.push({ pathname: '/lunch/book', params: { window: x.windowId, day: x.day, student: kid!, name: x.name, time: span(x.startTime, x.endTime) } });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}

      {kids.length > 0 && (<>
        <H>{kids.length > 1 ? 'Who are you visiting?' : 'Come eat lunch with'}</H>
        <KidCircles kids={kids} value={kid} onChange={setKid} />
        {upcoming.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>YOUR VISITS</Text>
            {upcoming.map((v) => (
              <Card key={v.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ alignItems: 'center', width: 56, gap: 3 }}>
                  <Avatar person={faceOf(v.student) ?? { firstName: v.student }} size={40} />
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>{v.student}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontWeight: '800', color: C.ink }}>{longDay(v.day)} · {v.windowName}</Text>
                  <P muted>{span(v.startTime, v.endTime)}{v.guests ? ` · ${v.guests} guest${v.guests > 1 ? 's' : ''}` : ''}{v.mine ? '' : ` · booked by ${v.visitor}`}</P>
                  {v.mine && <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => callOff(v, `${longDay(v.day)}, ${v.windowName}`)}>Call off</Text>}
                </View>
              </Card>
            ))}
          </View>
        )}
        {mine.filter((v) => v.status === 'cancelled' && v.cancelReason).map((v) => (
          <Card key={v.id}><P muted>Cancelled: {longDay(v.day)}, {v.windowName}. {v.cancelReason}</P></Card>
        ))}
        <Text style={{ fontWeight: '800', color: C.muted, marginTop: 6 }}>OPEN LUNCH TIMES</Text>
        {!slots || slots.kid !== kid ? <Loading />
          : slots.list.length === 0 ? <Card><P muted>No lunch times are open for visits in the next three weeks.</P></Card>
          : <LunchCalendar key={slots.kid} slots={slots.list} today={schoolToday()} span={21} onBook={book} />}
      </>)}

      {staff && (
        <View style={{ gap: 8, marginTop: 10 }}>
          <H>Who’s coming to lunch</H>
          <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text onPress={() => setDay(addDays(day, -1))} accessibilityRole="button" style={{ fontSize: 22, color: C.primary, paddingHorizontal: 8 }}>‹</Text>
            <Pressable onPress={() => setDay(schoolToday())}><Text style={{ fontWeight: '800', color: C.ink }}>{day === schoolToday() ? 'Today' : longDay(day)}</Text></Pressable>
            <Text onPress={() => setDay(addDays(day, 1))} accessibilityRole="button" style={{ fontSize: 22, color: C.primary, paddingHorizontal: 8 }}>›</Text>
          </View>
          {!visitors ? <Loading /> : visitors.length === 0 ? <Card><P muted>No lunch visitors {day === schoolToday() ? 'today' : 'that day'}.</P></Card>
            : visitors.map((v) => (
              <Card key={v.id} style={{ gap: 3, opacity: v.status === 'cancelled' ? 0.5 : 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{v.visitor} <Text style={{ color: C.muted, fontWeight: '400' }}>({v.relation})</Text>{v.guests ? ` + ${v.guests}` : ''}</Text>
                <Text style={{ color: C.ink }}>with {v.student}{v.grade != null ? `, ${gradeLabel(v.grade)}` : ''}{v.classes ? ` · ${v.classes}` : ''}</Text>
                <P muted>{v.windowName} · {span(v.startTime, v.endTime)}</P>
                {!!v.allergies && <Text style={{ color: C.danger, fontWeight: '700' }}>⚠️ Allergies: {v.allergies}</Text>}
                {!!v.note && <P muted>“{v.note}”</P>}
                {v.status === 'cancelled' && <P muted>Cancelled{v.cancelReason ? `: ${v.cancelReason}` : ''}</P>}
                {v.status === 'booked' && manage && (
                  <Text style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button" onPress={() => callOff(v, `${v.visitor} with ${v.student}`, true)}>Cancel visit</Text>
                )}
              </Card>
            ))}
        </View>
      )}
      {!staff && kids.length === 0 && <Card><P muted>Lunch visits are for a child’s parents and the family the school office has linked to them.</P></Card>}
    </ScrollView>
  );
}
