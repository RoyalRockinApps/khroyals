/**
 * Someone's volunteering: shifts and hours this school year, last school year and in all, then what's coming and every
 * day they said yes to, were marked on or led, newest first and by school year. Your own (My volunteer hours), or
 * anyone's for Volunteer Leaders and directors. Tap a day to open the opportunity.
 */
import { Fragment, useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, subscribeVolunteer, volunteerHistory, type Person, type VolunteerDay } from '../../../src/api/connect';
import { schoolToday } from '../../../src/calendar/past';
import { schoolYearLabel, schoolYearOf } from '../../../src/gallery/years';
import { clock, dayLabel, duration, hours } from '../../../src/volunteer/attendance';
import { nameOf } from '../../../src/volunteer/format';
import { GREEN, SectionTitle } from '../../../src/volunteer/parts';
import { VolunteerGate } from '../../../src/volunteer/VolunteerGate';
import { Button, C, Card, H, Loading, P, s, useBottomInset } from '../../../src/ui';

export default function VolunteerPerson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VolunteerGate title="Volunteer hours">{(me) => <History id={id} me={me} />}</VolunteerGate>;
}

function History({ id, me }: { id: string; me: Person }) {
  const [days, setDays] = useState<VolunteerDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useBottomInset();
  const load = useCallback(() => volunteerHistory(id).then((d) => { setDays(d); setError(null); }).catch((e) => setError(errorText(e))), [id]);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));

  const self = id === me.id;
  const title = self ? 'My volunteer hours' : nameOf(id);
  const header = <Stack.Screen options={{ title }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<Card><H>Couldn't load the hours</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!days) return <>{header}<Loading /></>;

  const today = schoolToday();
  const year = schoolYearOf(today);
  const coming = days.filter((d) => d.day > today || d.status === 'coming').reverse();
  const past = days.filter((d) => !coming.includes(d));
  const total = (list: VolunteerDay[]) => {
    const done = list.filter((d) => d.status === 'done');
    return { shifts: done.length, minutes: done.reduce((n, d) => n + (d.minutes ?? 0), 0) };
  };
  const thisYear = total(past.filter((d) => schoolYearOf(d.day) === year));
  const lastYear = total(past.filter((d) => schoolYearOf(d.day) === year - 1));
  const ever = total(past);
  const years = [...new Set(past.map((d) => schoolYearOf(d.day)))];   // newest first, like the days
  const yearName = (y: number) => `${y === year ? 'This school year' : y === year - 1 ? 'Last school year' : 'School year'} · ${schoolYearLabel(y)}`;
  const noShows = past.filter((d) => d.status === 'no_show').length;
  const led = past.filter((d) => d.status === 'led').length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 16 + bottom }]}>
      {header}
      <View style={[s.row, { flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }]}>
        <Tile value={hours(thisYear.minutes)} label={`this school year, ${thisYear.shifts} ${thisYear.shifts === 1 ? 'shift' : 'shifts'}`} color={GREEN} />
        {lastYear.shifts > 0 && <Tile value={hours(lastYear.minutes)} label={`last school year, ${lastYear.shifts} ${lastYear.shifts === 1 ? 'shift' : 'shifts'}`} color={GREEN} />}
        <Tile value={hours(ever.minutes)} label={`in all, ${ever.shifts} ${ever.shifts === 1 ? 'shift' : 'shifts'}`} color={C.primary} />
        {noShows > 0 && <Tile value={String(noShows)} label={noShows === 1 ? 'no-show' : 'no-shows'} color={C.danger} />}
        {led > 0 && <Tile value={String(led)} label={led === 1 ? 'day led' : 'days led'} color={C.accent} />}
      </View>
      {self && <P muted>Your time counts once you check in and out, or your leader marks you.</P>}

      {coming.length > 0 && (
        <>
          <SectionTitle icon="calendar-outline" title="Coming up" />
          <View style={s.card}>{coming.map((d, i) => <DayRow key={`${d.opportunityId}${d.day}`} d={d} first={i === 0} />)}</View>
        </>
      )}
      {past.length === 0 && (
        <>
          <SectionTitle icon="time-outline" title="History" tint={GREEN} />
          <View style={s.card}><P muted>{self ? "When you volunteer, each shift shows up here." : 'Nothing yet.'}</P></View>
        </>
      )}
      {years.map((y) => (
        <Fragment key={y}>
          <SectionTitle icon="time-outline" title={yearName(y)} tint={GREEN} />
          <View style={s.card}>
            {past.filter((d) => schoolYearOf(d.day) === y).map((d, i) => <DayRow key={`${d.opportunityId}${d.day}`} d={d} first={i === 0} />)}
          </View>
        </Fragment>
      ))}
    </ScrollView>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={[s.card, { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 2 }]} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={{ fontSize: 26, fontWeight: '900', color, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: C.muted, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

const STATUS: Record<VolunteerDay['status'], { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  done: { label: 'Done', color: GREEN, icon: 'checkmark-circle' },
  here: { label: 'Checked in', color: GREEN, icon: 'location' },
  no_show: { label: 'No-show', color: C.danger, icon: 'close-circle' },
  missed: { label: 'Not marked', color: C.muted, icon: 'help-circle-outline' },
  coming: { label: 'Signed up', color: C.primary, icon: 'calendar-outline' },
  led: { label: 'Led', color: C.accent, icon: 'star' },
};

function DayRow({ d, first }: { d: VolunteerDay; first: boolean }) {
  const st = STATUS[d.status];
  const label = d.status === 'done' && d.minutes !== null ? `Done · ${duration(d.minutes)}` : st.label;
  const time = d.startTime ? ` · ${clock(d.startTime)}${d.endTime ? `–${clock(d.endTime)}` : ''}` : '';
  return (
    <Pressable onPress={() => router.push(`/volunteer/${d.opportunityId}`)} accessibilityRole="link"
      style={({ pressed }) => [s.row, { gap: 10, paddingVertical: 8 }, !first && { borderTopWidth: 1, borderTopColor: C.line }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={st.icon} size={20} color={st.color} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '700', color: C.ink }} numberOfLines={1}>{d.title}</Text>
        <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{dayLabel(d.day)}{time}{d.eventTitle ? ` · ${d.eventTitle}` : ''}</Text>
      </View>
      <Text style={{ color: st.color, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
