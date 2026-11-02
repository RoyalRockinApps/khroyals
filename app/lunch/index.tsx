/**
 * Lunch visits. Parents and family the school linked pick a child and see the lunch times open to
 * them over the next three weeks (the office sets the days, times, grades and how many visitors),
 * book one after reading the allergy notes (app/lunch/book.tsx), and see or call off their visits.
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
import { Pills } from '../../src/feedback/ui';
import { addDays } from '../../src/info/today';
import { gradeLabel } from '../../src/comms/grades';
import { Button, C, Card, Chip, H, Loading, P, ask, s } from '../../src/ui';

const longDay = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const span = (a: string, b: string) => `${clock(a)}–${clock(b)}`;

export default function Lunch() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<LunchKid[]>([]);
  const [kid, setKid] = useState<string | null>(null);
  const [slots, setSlots] = useState<LunchSlot[] | null>(null);
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
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => {
    if (kid) lunchSlots(kid, schoolToday(), 21).then(setSlots).catch(() => setSlots([]));
  }, [kid]));
  const staff = isSchoolStaff(me ?? null);
  useFocusEffect(useCallback(() => {
    if (staff) lunchVisitors(day).then(setVisitors).catch(() => setVisitors([]));
  }, [staff, day]));

  const header = <Stack.Screen options={{ title: 'Lunch visits' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  if (!live || !me || me.pending) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Sign in to visit at lunch.</P></Card></View>;

  const callOff = (v: { id: string }, what: string, office = false) => ask(office ? 'Cancel this visit?' : 'Call off this visit?', what, office ? 'Cancel visit' : 'Call off',
    () => cancelLunchVisit(v.id, office ? 'Cancelled by the school office.' : '').then(() => { load(); if (staff) lunchVisitors(day).then(setVisitors); if (kid) lunchSlots(kid, schoolToday(), 21).then(setSlots); })
      .catch((e) => Alert.alert('Not changed', errorText(e))));
  const byDay = new Map<string, LunchSlot[]>();
  (slots ?? []).forEach((x) => byDay.set(x.day, [...(byDay.get(x.day) ?? []), x]));
  const upcoming = mine.filter((v) => v.status === 'booked');

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      {manage && <Button kind="ghost" label="⚙️ Lunch times, closed days and rules" onPress={() => router.push('/lunch/settings')} />}

      {kids.length > 0 && (<>
        <H>Come eat lunch with {kids.length === 1 ? kids[0].firstName : 'your child'}</H>
        {kids.length > 1 && <Pills options={kids.map((k) => ({ key: k.id, label: k.firstName }))} value={kid} onChange={setKid} />}
        {upcoming.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>YOUR VISITS</Text>
            {upcoming.map((v) => (
              <Card key={v.id} style={{ gap: 4 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{longDay(v.day)} · {v.windowName}</Text>
                <P muted>{span(v.startTime, v.endTime)} · with {v.student}{v.guests ? ` · ${v.guests} guest${v.guests > 1 ? 's' : ''}` : ''}{v.mine ? '' : ` · booked by ${v.visitor}`}</P>
                {v.mine && <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => callOff(v, `${longDay(v.day)}, ${v.windowName}`)}>Call off</Text>}
              </Card>
            ))}
          </View>
        )}
        {mine.filter((v) => v.status === 'cancelled' && v.cancelReason).map((v) => (
          <Card key={v.id}><P muted>Cancelled: {longDay(v.day)}, {v.windowName}. {v.cancelReason}</P></Card>
        ))}
        <Text style={{ fontWeight: '800', color: C.muted, marginTop: 6 }}>OPEN LUNCH TIMES</Text>
        {!slots ? <Loading /> : byDay.size === 0 ? <Card><P muted>No lunch times are open for visits in the next three weeks.</P></Card>
          : [...byDay].map(([d, list]) => (
            <View key={d} style={{ gap: 6 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{longDay(d)}</Text>
              {list.map((x) => (
                <Card key={x.windowId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  onPress={x.myVisit || x.spotsLeft === 0 ? undefined : () => router.push({ pathname: '/lunch/book', params: { window: x.windowId, day: d, student: kid!, name: x.name, time: span(x.startTime, x.endTime) } })}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.ink }}>{x.name}</Text>
                    <P muted>{span(x.startTime, x.endTime)}</P>
                  </View>
                  {x.myVisit ? <Chip label="✓ You’re coming" color="#15803D" />
                    : x.spotsLeft === 0 ? <Chip label="Full" color={C.muted} />
                    : <Text style={{ color: C.primary, fontWeight: '800' }}>{x.spotsLeft} spot{x.spotsLeft === 1 ? '' : 's'} · Book ›</Text>}
                </Card>
              ))}
            </View>
          ))}
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
