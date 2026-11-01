/**
 * Volunteer analytics, for Volunteer Leaders and the office: over the last 30 days, this school year or all time, who
 * volunteered and finished, their hours, no-shows and past shifts nobody marked; who's doing a lot (over the school's
 * limits in the last or next 30 days, leading included; the office sets the limits); and everyone, by hours, shifts,
 * no-shows or name. Tap someone for their history.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ROLE_LABELS, errorText, subscribeVolunteer, volunteerBusyLimits, volunteerSetBusyLimits, volunteerStats,
  type BusyLimits, type Person, type VolunteerStat,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { addDays, busyReason, dayLabel, hours, schoolYearStart } from '../../src/volunteer/attendance';
import { GREEN, QuantityStepper, Section } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Chip, Field, H, Loading, P, s, useBottomInset } from '../../src/ui';

type Range = '30' | 'year' | 'all';
type Sort = 'hours' | 'shifts' | 'noShows' | 'name';
const AMBER = '#B45309';

export default function VolunteerStats() {
  return <VolunteerGate title="Volunteer analytics">{(me) => <Stats me={me} />}</VolunteerGate>;
}

function Stats({ me }: { me: Person }) {
  const [range, setRange] = useState<Range>('30');
  const [sort, setSort] = useState<Sort>('hours');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<VolunteerStat[] | null>(null);
  const [limits, setLimits] = useState<BusyLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ hours: number; shifts: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const bottom = useBottomInset();
  const today = schoolToday();
  const from = range === '30' ? addDays(today, -29) : range === 'year' ? schoolYearStart(today) : null;

  const load = useCallback(() => Promise.all([volunteerStats(from), volunteerBusyLimits()])
    .then(([rows, l]) => { setPeople(rows); setLimits(l); setError(null); })
    .catch((e) => setError(errorText(e))), [from]);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));

  if (error) return <View style={[s.screen, s.pad]}><Card><H>Couldn't load the analytics</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!people || !limits) return <Loading />;

  const sum = (f: (r: VolunteerStat) => number) => people.reduce((n, r) => n + f(r), 0);
  const done = sum((r) => r.shifts);
  const noShows = sum((r) => r.noShows);
  const unmarked = sum((r) => r.unmarked);
  const helped = people.filter((r) => r.shifts > 0).length;
  const showUp = done + noShows ? `${Math.round((done / (done + noShows)) * 100)}%` : '—';
  const busy = people.filter((r) => r.busy).sort((a, b) => b.recentMinutes - a.recentMinutes || b.recentShifts - a.recentShifts);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const order: Record<Sort, (a: VolunteerStat, b: VolunteerStat) => number> = {
    hours: (a, b) => b.minutes - a.minutes || b.shifts - a.shifts,
    shifts: (a, b) => b.shifts - a.shifts || b.minutes - a.minutes,
    noShows: (a, b) => b.noShows - a.noShows || b.unmarked - a.unmarked,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const listed = people.filter((r) => words.every((w) => r.name.toLowerCase().includes(w))).sort((a, b) => order[sort](a, b) || a.name.localeCompare(b.name));
  const save = () => {
    if (!editing) return;
    setSaving(true);
    volunteerSetBusyLimits(editing.hours, editing.shifts).then(() => { setEditing(null); return load(); })
      .catch((e) => setError(errorText(e))).finally(() => setSaving(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 16 + bottom }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Volunteer analytics' }} />
      <Chips value={range} onChange={setRange} options={[['30', 'Last 30 days'], ['year', 'This school year'], ['all', 'All time']]} />

      <View style={[s.row, { flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }]}>
        <Tile value={String(helped)} label={helped === 1 ? 'volunteer finished a shift' : 'volunteers finished a shift'} color={GREEN} />
        <Tile value={hours(sum((r) => r.minutes))} label="volunteered" color={GREEN} />
        <Tile value={String(done)} label={done === 1 ? 'shift done' : 'shifts done'} color={C.primary} />
        <Tile value={showUp} label="showed up (of shifts marked)" color={C.primary} />
        <Tile value={String(noShows)} label={noShows === 1 ? 'no-show' : 'no-shows'} color={noShows ? C.danger : C.muted} />
        <Tile value={String(unmarked)} label={unmarked === 1 ? 'past shift not marked' : 'past shifts not marked'} color={unmarked ? AMBER : C.muted} />
      </View>
      {unmarked > 0 && <P muted>Shifts nobody checked in or marked don't count. Leaders mark who came under Check-in on each opportunity.</P>}

      <Section icon="warning-outline" title="Doing a lot" tint={AMBER}>
        {busy.length === 0 && <P muted>Nobody is over the limits right now.</P>}
        {busy.map((r) => (
          <Pressable key={r.userId} onPress={() => router.push(`/volunteer/person/${r.userId}`)} accessibilityRole="link"
            style={({ pressed }) => [s.row, { gap: 10, paddingVertical: 4 }, pressed && { opacity: 0.7 }]}>
            <Ionicons name="flame" size={20} color={AMBER} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{r.name}</Text>
              <Text style={{ color: AMBER, fontSize: 13 }}>{busyReason(r, limits)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
        ))}
        {editing ? (
          <View style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <Text style={{ fontWeight: '700', color: C.ink, textAlign: 'center' }}>Hours in 30 days</Text>
            <QuantityStepper value={editing.hours} max={200} onChange={(n) => setEditing({ ...editing, hours: n })} />
            <Text style={{ fontWeight: '700', color: C.ink, textAlign: 'center' }}>Shifts in 30 days</Text>
            <QuantityStepper value={editing.shifts} max={100} onChange={(n) => setEditing({ ...editing, shifts: n })} />
            <View style={s.row}>
              <View style={{ flex: 1 }}><Button label={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={save} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" label="Cancel" onPress={() => setEditing(null)} /></View>
            </View>
          </View>
        ) : (
          <P muted>
            {`Flagged at ${limits.hours} hours or ${limits.shifts} shifts in the last 30 days (leading counts), or ${limits.shifts} shifts signed up for in the next 30.`}
            {limits.canEdit && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setEditing({ hours: limits.hours, shifts: limits.shifts })}> Change</Text>}
          </P>
        )}
      </Section>

      <Section icon="people-outline" title={`Everyone (${people.length})`}>
        <Field label="Find someone" placeholder="First or last name" value={query} onChangeText={setQuery} autoCorrect={false} />
        <Chips value={sort} onChange={setSort} small options={[['hours', 'Most hours'], ['shifts', 'Most shifts'], ['noShows', 'Most no-shows'], ['name', 'Name']]} />
        {people.length === 0 && <P muted>Nobody has volunteered in these dates yet.</P>}
        {listed.map((r) => <PersonRow key={r.userId} r={r} me={me} />)}
      </Section>
    </ScrollView>
  );
}

function Chips<T extends string>({ value, onChange, options, small }: { value: T; onChange: (v: T) => void; options: [T, string][]; small?: boolean }) {
  return (
    <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
      {options.map(([k, label]) => (
        <Text key={k} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: value === k }}
          style={small
            ? { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: value === k ? C.accent : C.line,
              color: value === k ? C.accent : C.muted, fontWeight: '700', fontSize: 13 }
            : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
              backgroundColor: value === k ? C.primary : '#fff', color: value === k ? '#fff' : C.ink, fontWeight: '600' }}>
          {label}
        </Text>
      ))}
    </View>
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function PersonRow({ r, me }: { r: VolunteerStat; me: Person }) {
  const parts = [plural(r.shifts, 'shift'), hours(r.minutes)];
  if (r.noShows) parts.push(plural(r.noShows, 'no-show'));
  if (r.unmarked) parts.push(`${r.unmarked} not marked`);
  if (r.led) parts.push(`led ${plural(r.led, 'day')}`);
  const when = [r.lastDay && `Last helped ${dayLabel(r.lastDay)}`, r.upcoming && `${r.upcoming} coming up`].filter(Boolean).join(' · ');
  const role = ROLE_LABELS[r.schoolRole as keyof typeof ROLE_LABELS] ?? r.schoolRole;
  return (
    <Pressable onPress={() => router.push(`/volunteer/person/${r.userId}`)} accessibilityRole="link"
      style={({ pressed }) => [{ gap: 3, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }, pressed && { opacity: 0.7 }]}>
      <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>{r.userId === me.id ? `${r.name} (you)` : r.name}</Text>
        <Text style={{ color: C.muted }}>{role}</Text>
        {r.isLead && <Chip label="Leader" color={C.accent} />}
        {r.busy && <Chip label="Doing a lot" color={AMBER} />}
      </View>
      <Text style={{ color: C.ink }}>{parts.join(' · ')}</Text>
      {!!when && <Text style={{ color: C.muted, fontSize: 13 }}>{when}</Text>}
    </Pressable>
  );
}
