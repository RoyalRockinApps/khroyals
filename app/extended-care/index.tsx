/**
 * Extended care (Classes → Extended care), for extended care staff and the office (people.family or checkin.manage,
 * verified with the authenticator app). On top, today's Extended care check-out list: each child goes home only with
 * someone on their pickup list, and their parents are told. Below, the students who stay and on which days. The office
 * adds students, changes their days and takes them off; the header gear lists the extended care staff.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, extendedCareList, extendedCareRoster, extendedCareSearch, myAccess, session, setExtendedCare,
  type Access, type ExtendedCareStudent, type Person,
} from '../../src/api/connect';
import { ManageButton } from '../../src/ManageButton';
import { gradeLabel } from '../../src/comms/grades';
import { VerifyCard } from '../../src/comms/MfaGate';
import { mayHave, needsCodeFor } from '../../src/comms/mfa';
import { WEEKDAYS, daysLine } from '../../src/onsite/labels';
import { Button, C, Card, Field, H, Input, Loading, P, ask, s } from '../../src/ui';

const PERMS = ['people.family', 'checkin.manage'];

export default function ExtendedCare() {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [access, setAccess] = useState<Access | null>(null);
  const [roster, setRoster] = useState<ExtendedCareStudent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; weekdays: number[]; note: string; enrolled: boolean } | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([session().catch(() => null), myAccess().catch(() => null)]);
    setPerson(p); setAccess(a);
    extendedCareRoster().then((r) => { setRoster(r); setError(null); }).catch((e) => { setRoster([]); setError(errorText(e)); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const office = PERMS.some((x) => access?.permissions.includes(x));
  const needsCode = !office && PERMS.some((x) => needsCodeFor(access, x));
  const staff = !!person?.extendedCare;
  const header = (
    <Stack.Screen options={{ title: 'Extended care', headerRight: () => (
      <ManageButton app="Extended care" items={PERMS.some((x) => mayHave(access, x))
        ? [{ icon: 'people-outline', label: 'Extended care staff', sub: 'Who runs extended care’s check-out', href: '/extended-care/staff' }] : []} />
    ) }} />
  );
  if (person === undefined || !roster) return <>{header}<Loading /></>;
  if (!office && !staff && !needsCode) {
    return <View style={[s.screen, s.pad]}>{header}<Card><P>Extended care is for its staff and the front office.</P></Card></View>;
  }

  const openToday = async () => {
    setOpening(true);
    try { router.push(`/checkout/${await extendedCareList()}`); } catch (e) { Alert.alert('Extended care', errorText(e)); } finally { setOpening(false); }
  };
  const today = roster.filter((x) => x.today);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      {needsCode && <VerifyCard why="The office keeps extended care’s students and staff here." onVerified={load} />}
      {(staff || office) && (
        <Card style={{ gap: 8 }}>
          <View style={[s.row, { gap: 12 }]}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="home-outline" size={22} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Today’s check-out</Text>
              <Text style={{ color: C.muted }}>
                {today.length ? `${today.length} ${today.length === 1 ? 'student stays' : 'students stay'} today` : 'Nobody stays today'}
              </Text>
            </View>
          </View>
          <P muted>Students join the list once they’re checked in at school. Check each one out to someone on their pickup list; their parents get a notification.</P>
          <Button label={opening ? 'Opening…' : 'Open today’s check-out'} disabled={opening} onPress={openToday} />
        </Card>
      )}
      {!!error && !needsCode && <P muted>{error}</P>}

      {office && <AddStudent onPick={(x) => setEditing({ ...x, weekdays: x.weekdays ?? [1, 2, 3, 4, 5], note: roster.find((r) => r.id === x.id)?.note ?? '', enrolled: !!x.weekdays })} />}
      {editing && <DaysEditor key={editing.id} student={editing} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <H>Students in extended care</H>
      {roster.length === 0 ? <P muted>{office ? 'Nobody yet. Find a student above to add them.' : 'Nobody yet. The office adds students.'}</P> : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {roster.map((x, i) => (
            <Pressable key={x.id} disabled={!office} onPress={() => setEditing({ id: x.id, name: x.name, weekdays: x.weekdays, note: x.note, enrolled: true })}
              accessibilityRole={office ? 'button' : undefined}
              style={({ pressed }) => [s.row, { gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }, pressed && { opacity: 0.6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{x.name}</Text>
                <Text style={{ color: C.muted }}>{[gradeLabel(x.grade), daysLine(x.weekdays), x.note].filter(Boolean).join(' · ')}</Text>
              </View>
              {x.today && <Text style={{ color: '#15803D', fontWeight: '700' }}>Today</Text>}
              {office && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

/** The office: find a student to add (or change). */
function AddStudent({ onPick }: { onPick: (x: { id: string; name: string; weekdays: number[] | null }) => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; grade: number | null; weekdays: number[] | null }[]>([]);
  useEffect(() => {
    if (!query.trim()) { setFound([]); return; }
    const t = setTimeout(() => { extendedCareSearch(query).then(setFound).catch(() => setFound([])); }, 250);
    return () => clearTimeout(t);
  }, [query]);
  return (
    <View style={{ gap: 6 }}>
      <Input value={query} onChangeText={setQuery} placeholder="Add a student: type their name" accessibilityLabel="Find a student to add" autoCorrect={false} />
      {found.map((x) => (
        <Pressable key={x.id} onPress={() => { setQuery(''); onPick(x); }} accessibilityRole="button"
          style={({ pressed }) => [s.card, s.row, { gap: 10 }, pressed && { opacity: 0.7 }]}>
          <Ionicons name={x.weekdays ? 'create-outline' : 'add-circle-outline'} size={20} color={C.primary} />
          <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{x.name}</Text>
          <Text style={{ color: C.muted }}>{x.weekdays ? daysLine(x.weekdays) : gradeLabel(x.grade)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The office: a student's days (and a note), or take them off. */
function DaysEditor({ student, onDone, onCancel }: {
  student: { id: string; name: string; weekdays: number[]; note: string; enrolled: boolean }; onDone: () => void; onCancel: () => void;
}) {
  const [days, setDays] = useState(student.weekdays);
  const [note, setNote] = useState(student.note);
  const [busy, setBusy] = useState(false);
  const save = async (list: number[]) => {
    setBusy(true);
    try { await setExtendedCare(student.id, list, note); onDone(); } catch (e) { Alert.alert('Extended care', errorText(e)); } finally { setBusy(false); }
  };
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
  return (
    <Card style={{ gap: 10, borderColor: C.primary }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{student.name}</Text>
      <Text style={{ color: C.muted }}>Stays for extended care on</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {WEEKDAYS.map((w) => {
          const on = days.includes(w.day);
          return (
            <Pressable key={w.day} onPress={() => toggle(w.day)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={w.label}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1,
                borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff' }}>
              <Text style={{ fontWeight: '800', color: on ? '#fff' : C.ink }}>{w.short}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Picked up by 6, after robotics…" maxLength={200} />
      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || days.length === 0} onPress={() => save(days)} />
      {student.enrolled && (
        <Button kind="ghost" label="Take off extended care" onPress={() => ask(`Take ${student.name} off extended care?`,
          'They no longer show on extended care’s list.', 'Take off', () => save([]))} />
      )}
      <Button kind="ghost" label="Cancel" onPress={onCancel} />
    </Card>
  );
}
