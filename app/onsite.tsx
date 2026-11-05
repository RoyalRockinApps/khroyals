/**
 * On-Site Attendance (the Admin portal's top card, or Classes → On-Site Attendance), for the front office
 * (checkin.manage, behind the authenticator check): who is at school right now. Students by group (in class; after
 * dismissal at activities, in extended care or not sent home yet; gone home and how; absent; not checked in), teachers
 * and staff (here or not, when they came and went, and checking them in or out for them), and visitors (signing them
 * in and out at the front desk, with today's booked lunch visitors ready to sign in). It refreshes every minute while
 * open. The dismissal time is behind the header gear.
 */
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  campusCheckFor, errorText, onSiteList, onSiteToday, removeVisitor, setDismissalTime, signInVisitor, signOutVisitor, visitorsToday,
  type ExpectedVisitor, type OnSiteBucket, type OnSiteList, type OnSiteStudent, type OnSiteToday, type Visitor,
} from '../src/api/connect';
import { ManageButton } from '../src/ManageButton';
import { clock } from '../src/carline/format';
import { gradeLabel } from '../src/comms/grades';
import { MfaGate } from '../src/comms/MfaGate';
import { TimeField } from '../src/forms/DateTimeField';
import { OnSiteCard } from '../src/onsite/OnSiteCard';
import { STUDENT_GROUPS, groupLabel, homeLine, onSiteTitle, stayingLine } from '../src/onsite/labels';
import { Button, C, Card, Field, Input, Loading, P, ask, s } from '../src/ui';

const AMBER = '#B45309';
const GREEN = '#15803D';

type Tab = 'students' | 'people' | 'visitors';
type Group = OnSiteBucket | 'onsite';
type Visitors = { visitors: Visitor[]; expected: ExpectedVisitor[] };
const BUCKETS = STUDENT_GROUPS.map((g) => g.key) as string[];

export default function OnSite() {
  return (
    <>
      <Stack.Screen options={{ title: 'On-Site Attendance' }} />
      <MfaGate>{(access) => access.permissions.includes('checkin.manage')
        ? <Desk />
        : <View style={[s.screen, s.pad]}><P>On-Site Attendance is for the front office.</P></View>}
      </MfaGate>
    </>
  );
}

const pill = (label: string, on: boolean, onPress: () => void, tone?: string) => (
  <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
      borderColor: on ? tone ?? C.primary : C.line, backgroundColor: on ? tone ?? C.primary : '#fff' }}>
    <Text style={{ color: on ? '#fff' : tone ?? C.ink, fontWeight: '700' }}>{label}</Text>
  </Pressable>
);

function Desk() {
  const { group: start } = useLocalSearchParams<{ group?: string }>();
  const [tab, setTab] = useState<Tab>(start === 'people' ? 'people' : start === 'visitors' ? 'visitors' : 'students');
  const [group, setGroup] = useState<Group | null>(start && BUCKETS.includes(start) ? start as OnSiteBucket : null);
  const [t, setT] = useState<OnSiteToday | null>(null);
  const [list, setList] = useState<OnSiteList | null>(null);
  const [visitors, setVisitors] = useState<Visitors | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    Promise.all([onSiteToday(), onSiteList(), visitorsToday()])
      .then(([a, b, c]) => { setT(a); setList(b); setVisitors(c); setError(null); })
      .catch((e) => setError(errorText(e)));
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]));

  const gear = <Stack.Screen options={{ headerRight: () => (
    <ManageButton app="On-Site Attendance" items={[{ icon: 'time-outline', label: 'Dismissal time',
      sub: 'After it, students still here show as at activities, in extended care or not sent home yet', onPress: () => setEditing(true) }]} />
  ) }} />;
  if (error && !t) return <View style={[s.screen, s.pad]}>{gear}<Card><P>{error}</P></Card></View>;
  if (!t || !list || !visitors) return <>{gear}<Loading /></>;

  const shownGroup: Group = group ?? (t.afterDismissal && t.students.notHome > 0 ? 'notHome' : 'onsite');
  const open = (g: OnSiteBucket | 'people' | 'visitors') => {
    if (g === 'people' || g === 'visitors') setTab(g);
    else { setTab('students'); setGroup(g); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {gear}
      <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted }}>{onSiteTitle(t.day).toUpperCase()}</Text>
      <OnSiteCard t={t} onOpen={open} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {([['students', 'Students'], ['people', 'Faculty & staff'], ['visitors', 'Visitors']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
              backgroundColor: tab === k ? C.primary : '#fff', borderWidth: 1, borderColor: tab === k ? C.primary : C.line }}>
            <Text style={{ fontWeight: '800', color: tab === k ? '#fff' : C.ink }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'students' && <Students t={t} students={list.students} group={shownGroup} onGroup={setGroup} />}
      {tab === 'people' && <People list={list} onChange={load} />}
      {tab === 'visitors' && <VisitorDesk v={visitors} onChange={load} />}
      <DismissalSheet open={editing} time={t.dismissal} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
    </ScrollView>
  );
}

/** Where a student is, in a line. */
function studentLine(st: OnSiteStudent) {
  if (st.home) return homeLine(st.home);
  if (st.bucket === 'activities' || st.bucket === 'extendedCare') return st.staying ? stayingLine(st.staying) : groupLabel(st.bucket);
  if (st.bucket === 'notHome') return 'Still at school';
  if (st.bucket === 'unmarked') return 'Not checked in: no roll taken yet';
  return groupLabel(st.bucket);
}

function Students({ t, students, group, onGroup }: { t: OnSiteToday; students: OnSiteStudent[]; group: Group; onGroup: (g: Group) => void }) {
  const [query, setQuery] = useState('');
  const groups = STUDENT_GROUPS.filter((g) => (t.afterDismissal ? g.key !== 'class' : !['notHome', 'activities', 'extendedCare'].includes(g.key)));
  const q = query.trim().toLowerCase();
  const shown = students.filter((st) => (group === 'onsite' ? st.state === 'here' : st.bucket === group) && (!q || st.name.toLowerCase().includes(q)));
  const empty = group === 'notHome' ? 'Every student still at school is at an activity or in extended care.'
    : group === 'onsite' ? 'No students are checked in at school.' : `No students: ${groupLabel(group).toLowerCase()}.`;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {pill(`On site · ${t.students.here}`, group === 'onsite', () => onGroup('onsite'))}
        {groups.map((g) => pill(`${g.label} · ${t.students[g.key]}`, group === g.key, () => onGroup(g.key),
          g.todo && t.students[g.key] > 0 ? AMBER : undefined))}
      </View>
      <Input value={query} onChangeText={setQuery} placeholder="Find a student" accessibilityLabel="Find a student" autoCorrect={false} />
      {shown.length === 0 ? <P muted>{q ? 'No students by that name here.' : empty}</P> : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {shown.map((st, i) => (
            <View key={st.id} style={{ paddingVertical: 10, gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={[s.row, { gap: 8 }]}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
                {st.grade != null && <Text style={{ color: C.muted }}>{gradeLabel(st.grade)}</Text>}
              </View>
              <Text style={{ color: st.bucket === 'notHome' ? AMBER : C.muted }}>{studentLine(st)}</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function People({ list, onChange }: { list: OnSiteList; onChange: () => void }) {
  const [filter, setFilter] = useState<'here' | 'away' | 'all'>('here');
  const here = list.people.filter((p) => p.here).length;
  const shown = list.people.filter((p) => filter === 'all' || (filter === 'here') === p.here);
  const check = (id: string, name: string, kind: 'in' | 'out') =>
    ask(kind === 'in' ? `Check ${name} in?` : `Check ${name} out?`,
      kind === 'in' ? `${name} shows as at school, checked in by you.` : `${name} shows as gone for the day.`,
      kind === 'in' ? 'Check in' : 'Check out',
      () => campusCheckFor(id, kind).then(onChange).catch((e) => Alert.alert('On-Site Attendance', errorText(e))));
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {pill(`Here · ${here}`, filter === 'here', () => setFilter('here'))}
        {pill(`Not here · ${list.people.length - here}`, filter === 'away', () => setFilter('away'))}
        {pill(`Everyone · ${list.people.length}`, filter === 'all', () => setFilter('all'))}
      </View>
      <P muted>Teachers and staff check in on their Planner when they get to school. Check someone in or out here when they can’t.</P>
      {shown.length === 0 ? <P muted>{filter === 'here' ? 'Nobody has checked in yet today.' : 'Everyone is checked in.'}</P> : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {shown.map((p, i) => (
            <View key={p.id} style={[s.row, { gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
              <Ionicons name={p.here ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={p.here ? GREEN : C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{p.name}</Text>
                <Text style={{ color: C.muted }}>
                  {[p.schoolRole === 'substitute' ? 'Substitute' : p.role === 'faculty' ? 'Faculty' : 'Staff',
                    p.in && `In ${clock(p.in)}`, p.out && !p.here && `Out ${clock(p.out)}`, !p.in && 'Not checked in'].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text onPress={() => check(p.id, p.name, p.here ? 'out' : 'in')} accessibilityRole="button"
                style={{ color: C.primary, fontWeight: '700' }}>{p.here ? 'Check out' : 'Check in'}</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function VisitorDesk({ v, onChange }: { v: Visitors; onChange: () => void }) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [guests, setGuests] = useState(0);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => Alert.alert('Visitors', errorText(e));
  const signIn = async (x: { name?: string; purpose?: string; guests?: number; lunchVisitId?: string }) => {
    setBusy(true);
    try { await signInVisitor(x); setName(''); setPurpose(''); setGuests(0); onChange(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const here = v.visitors.filter((x) => !x.out);
  const step = (by: number) => setGuests(Math.max(0, Math.min(10, guests + by)));
  return (
    <>
      <Card style={{ gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Sign in a visitor</Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Their full name" autoCapitalize="words" />
        <Field label="Here to see, or why" value={purpose} onChangeText={setPurpose} placeholder="Mrs. Allen, a delivery, a tour…" />
        <View style={[s.row, { gap: 10 }]}>
          <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }}>People with them</Text>
          <StepButton icon="remove" label="One fewer" onPress={() => step(-1)} />
          <Text style={{ minWidth: 20, textAlign: 'center', fontWeight: '800', color: C.ink }}>{guests}</Text>
          <StepButton icon="add" label="One more" onPress={() => step(1)} />
        </View>
        <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy || !name.trim()} onPress={() => signIn({ name, purpose, guests })} />
      </Card>

      {v.expected.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted }}>LUNCH VISITORS EXPECTED TODAY</Text>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {v.expected.map((x, i) => (
              <View key={x.id} style={[s.row, { gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
                <Ionicons name="restaurant-outline" size={20} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{x.name}{x.guests ? ` +${x.guests}` : ''}</Text>
                  <Text style={{ color: C.muted }}>Lunch with {x.student} · {hm(x.start)}</Text>
                </View>
                <Text onPress={() => { if (!busy) signIn({ lunchVisitId: x.id }); }} accessibilityRole="button"
                  style={{ color: C.primary, fontWeight: '700' }}>Sign in</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted }}>
        TODAY · {here.reduce((n, x) => n + 1 + x.guests, 0)} HERE NOW
      </Text>
      {v.visitors.length === 0 ? <P muted>No visitors yet today.</P> : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {v.visitors.map((x, i) => (
            <View key={x.id} style={[s.row, { gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }, !!x.out && { opacity: 0.6 }]}>
              <Ionicons name={x.out ? 'log-out-outline' : 'person-circle-outline'} size={22} color={x.out ? C.muted : GREEN} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{x.name}{x.guests ? ` +${x.guests}` : ''}</Text>
                {!!x.purpose && <Text style={{ color: C.ink }}>{x.purpose}</Text>}
                <Text style={{ color: C.muted }}>{[`In ${clock(x.in)}`, x.out && `Out ${clock(x.out)}`, `by ${x.by}`].filter(Boolean).join(' · ')}</Text>
                <Text onPress={() => ask('Remove this visitor?', `${x.name} comes off today’s visitor list, as if they were never signed in. Use this for a mistake.`, 'Remove',
                  () => removeVisitor(x.id).then(onChange).catch(fail))} accessibilityRole="button"
                  style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Remove (a mistake)</Text>
              </View>
              {!x.out && (
                <Text onPress={() => signOutVisitor(x.id).then(onChange).catch(fail)} accessibilityRole="button"
                  style={{ color: C.primary, fontWeight: '700' }}>Sign out</Text>
              )}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const StepButton = ({ icon, label, onPress }: { icon: 'add' | 'remove'; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={icon} size={18} color={C.primary} />
  </Pressable>
);

/** "11:30 AM" from "11:30". */
const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

/** The gear's Dismissal time: when the school day ends. */
function DismissalSheet({ open, time, onClose, onSaved }: { open: boolean; time: string; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(time);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await setDismissalTime(value); onSaved(); } catch (e) { Alert.alert('Dismissal time', errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} onShow={() => setValue(time)}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { backgroundColor: C.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 36, gap: 12 }]}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>Dismissal time</Text>
          <P muted>When the school day ends. After it, students still at school show as at an activity, in extended care, or not sent home yet.</P>
          <TimeField label="School ends at" value={value} onChange={setValue} />
          <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !value} onPress={save} />
          <Button kind="ghost" label="Cancel" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
