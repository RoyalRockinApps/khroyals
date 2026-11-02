import { useCallback, useState } from 'react';
import { Alert, Linking, SectionList, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { getCalendar } from '../src/api/mockApi';
import { deleteEvent, editableCalendars, isSchoolStaff, listEvents, live, myAccess, session, type GroupEvent } from '../src/api/connect';
import { AddToCalendar } from '../src/calendar/AddToCalendar';
import { chicagoIso, type CalEvent } from '../src/calendar/addTo';
import { isPastDay, splitPast } from '../src/calendar/past';
import { SubscribeCard } from '../src/calendar/SubscribeCard';
import { PAST_STYLE, PastToggle, usePastToggle } from '../src/calendar/PastToggle';
import { dateRange } from '../src/site/calendar';
import { Button, C, Card, Chip, Loading, P, s } from '../src/ui';
import { SCHOOL } from '../src/school';

const CATEGORY_COLOR: Record<string, string> = {
  'No School': C.accent,
  'Teacher In-Service': '#64748B',
  'E-Learning': '#0E7490',
  'Special Student Day': C.primary,
  Academic: '#7C3AED',
};

const PDF = SCHOOL.calendarPdf;

/** A calendar event as Google, Outlook, Yahoo and Apple take it. */
const calEvent = (e: GroupEvent): CalEvent => (e.startTime
  ? { title: e.title, startsAt: chicagoIso(e.date, e.startTime), endsAt: e.endTime ? chicagoIso(e.endDate ?? e.date, e.endTime) : null, location: e.location }
  : { title: e.title, date: e.date, endDate: e.endDate, location: e.location });

/**
 * School calendar, plus (when signed in) the calendars of your groups.
 * Like every calendar in the app, it shows what's coming; past events stay out of view
 * until "Show past events", and then look greyed out.
 */
export default function Calendar() {
  const [events, setEvents] = useState<GroupEvent[] | null>(null);
  const [canEdit, setCanEdit] = useState<Set<string>>(new Set());
  const [canAdd, setCanAdd] = useState(false);
  const [dressUp, setDressUp] = useState(false);
  const [staff, setStaff] = useState(false);
  const [approved, setApproved] = useState(false);
  const past = usePastToggle();

  const load = useCallback(async () => {
    try {
      if (live) {
        const p = await session();
        setStaff(isSchoolStaff(p));
        setApproved(!!p && !p.pending);
        const [evs, cals, access] = await Promise.all([listEvents(), editableCalendars(), myAccess().catch(() => null)]);
        setEvents(evs);
        setDressUp(!!access?.permissions.includes('calendar.school'));
        setCanAdd(cals.length > 0);
        setCanEdit(new Set(cals.map((c) => c.groupId ?? 'school')));
      } else {
        const cal = await getCalendar();
        setEvents(cal.events.map((e) => ({ ...e, groupId: null })));
      }
    } catch (e: any) {
      Alert.alert('Could not load the calendar', e.message);
      setEvents([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const header = <Stack.Screen options={{ title: 'Calendar' }} />;
  if (!events) return <>{header}<Loading /></>;

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const split = splitPast(sorted, (e) => isPastDay(e.endDate ?? e.date));
  const months = (list: GroupEvent[], isPast: boolean) => {
    const byMonth = new Map<string, GroupEvent[]>();
    list.forEach((e) => {
      const k = new Date(e.date + 'T12:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
      byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
    });
    return [...byMonth].map(([title, data]) => ({ title, data, isPast }));
  };
  const sections = [...(past.shown ? months(split.past, true) : []), ...months(split.upcoming, false)];
  const remove = (e: GroupEvent) => Alert.alert('Delete event?', e.title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(e.id).then(load).catch((x) => Alert.alert('Not allowed', x.message)) },
  ]);

  return (
    <>{header}
    <SectionList style={s.screen} contentContainerStyle={s.pad}
      sections={sections}
      keyExtractor={(e) => e.id}
      ListEmptyComponent={<Card><P muted>Nothing coming up on the calendar.</P></Card>}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          {PDF && (
            <Card onPress={() => Linking.openURL(PDF)}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>2026–2027 School Calendar</Text>
              <P muted>Important dates from the official calendar{live ? ', plus events from your groups' : ''}. Tap to open the PDF.</P>
            </Card>
          )}
          {staff && <Button kind="ghost" label="🗓️ My calendar and my students' events" onPress={() => router.push('/my-calendar')} />}
          {canAdd && <Button label="+ Add event" onPress={() => router.push('/event/new')} />}
          {dressUp && <Button kind="ghost" label="👕 Dress-up days (Spirit Week)" onPress={() => router.push('/dress-days')} />}
          <PastToggle count={split.past.length} shown={past.shown} onToggle={past.toggle} />
        </View>}
      ListFooterComponent={approved ? <View style={{ marginTop: 12 }}><SubscribeCard staff={staff} /></View> : null}
      renderSectionHeader={({ section }) => (
        <Text style={[{ fontWeight: '800', color: C.muted, marginTop: 8 }, section.isPast && PAST_STYLE]}>
          {section.title.toUpperCase()}{section.isPast ? ' · PAST' : ''}
        </Text>
      )}
      renderItem={({ item: e, section }) => (
        <Card style={{ flexDirection: 'row', gap: 12, marginBottom: 8, ...(section.isPast ? PAST_STYLE : null) }}
          onPress={canEdit.has(e.groupId ?? 'school') ? () => remove(e) : undefined}>
          <View style={{ width: 92 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.primary }}>{dateRange(e)}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {e.startTime ? `${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : new Date(e.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.title}</Text>
            {!!e.location && <P muted>{e.location}</P>}
            <View style={[s.row, { alignItems: 'center' }]}>
              {e.groupName
                ? <Chip label={`${e.groupIcon ?? ''} ${e.groupName}`.trim()} color="#0D9488" />
                : <Chip label={e.category} color={CATEGORY_COLOR[e.category] ?? C.primary} />}
              {!section.isPast && <AddToCalendar compact event={calEvent(e)} uid={live && !e.groupId ? `school-${e.id}` : undefined} />}
            </View>
          </View>
        </Card>
      )} />
    </>
  );
}
