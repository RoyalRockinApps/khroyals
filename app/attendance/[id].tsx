/**
 * One class's roll for a day: tap P, L or A for each student (tap again to clear), or mark everyone
 * not marked yet present at once. The office's late arrivals and early check-outs show on each row;
 * a late check-in counts as Late, and a student checked out shows as gone home. Earlier school days
 * are a tap away; the last two weeks can still be changed.
 *
 * Today it also has Going home (where it opens after dismissal): how each student left, so On-Site Attendance knows
 * every student is sent home. Car line pickups, the office's check-outs and check-out lists show by themselves, as do
 * students staying for an activity or extended care; the teacher marks the rest Walked, Drove, Bus or Other (their
 * parents are told), with Undo.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { classRoll, errorText, markAttendance, markGoneHome, type AttendanceMark, type ClassRoll, type DismissalHow, type RollStudent } from '../../src/api/connect';
import { MARKS, checkLine, markColor, rollLine } from '../../src/attendance/labels';
import { DayStepper } from '../../src/attendance/parts';
import { schoolToday } from '../../src/calendar/past';
import { clock, kindLabel, reasonLabel } from '../../src/absences/labels';
import { DISMISSAL_HOWS, afterDismissal, homeLine, isTeacherMark, stayingLine } from '../../src/onsite/labels';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function ClassAttendance() {
  const { id, day: startDay } = useLocalSearchParams<{ id: string; day?: string }>();
  const [day, setDay] = useState(startDay ?? schoolToday());
  const [roll, setRoll] = useState<ClassRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'roll' | 'home' | null>(null);   // null: Going home after dismissal, else Roll

  const load = useCallback(() => {
    classRoll(id, day).then((r) => { setRoll(r); setError(null); }).catch((e) => setError(errorText(e)));
  }, [id, day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const changeDay = (d: string) => { setRoll(null); setDay(d); };

  const header = <Stack.Screen options={{ title: roll?.name ?? 'Attendance' }} />;
  if (error && !roll) return <View style={[s.screen, s.pad]}>{header}<Card><P>{error}</P></Card></View>;
  if (!roll || roll.day !== day) return <>{header}<Loading /></>;

  /** Show the change straight away, then save it (and put it back if the save fails). */
  const mark = async (students: RollStudent[], status: AttendanceMark | null) => {
    const ids = new Set(students.map((x) => x.id)), before = roll;
    setRoll({ ...roll, students: roll.students.map((x) => (ids.has(x.id)
      ? { ...x, mark: status, state: x.checks[0]?.kind === 'in' ? 'late' : status } : x)) });
    setBusy(true);
    try { await markAttendance(roll.id, day, [...ids], status); load(); }
    catch (e) { setRoll(before); Alert.alert('Attendance', errorText(e)); } finally { setBusy(false); }
  };

  const count = (k: AttendanceMark | null) => roll.students.filter((x) => x.state === k).length;
  const counts = { students: roll.students.length, present: count('present'), late: count('late'), absent: count('absent'),
    unmarked: count(null), left: roll.students.filter((x) => x.left).length };
  const rest = roll.students.filter((x) => x.state === null);
  const done = counts.students > 0 && counts.unmarked === 0;
  const dismissing = !!roll.canDismiss && (mode ?? (afterDismissal(roll.dismissal) ? 'home' : 'roll')) === 'home';

  /** Mark students gone home (null takes it back): shown straight away, then saved. */
  const sendHome = async (st: RollStudent, how: DismissalHow | null) => {
    const before = roll;
    setRoll({ ...roll, students: roll.students.map((x) => (x.id === st.id
      ? { ...x, home: how ? { how, at: new Date().toISOString(), person: null, by: null, title: null } : null } : x)) });
    setBusy(true);
    try { await markGoneHome(roll.id, [st.id], how); load(); }
    catch (e) { setRoll(before); Alert.alert('Going home', errorText(e)); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      {roll.otherDays !== false && <DayStepper day={day} onChange={changeDay} />}
      {roll.canDismiss && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['roll', 'Roll'], ['home', 'Going home']] as const).map(([k, label]) => {
            const on = (k === 'home') === dismissing;
            return (
              <Pressable key={k} onPress={() => setMode(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1,
                  backgroundColor: on ? C.primary : '#fff', borderColor: on ? C.primary : C.line }}>
                <Text style={{ fontWeight: '800', color: on ? '#fff' : C.ink }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {dismissing ? <GoingHome roll={roll} busy={busy} onMark={sendHome} /> : (<>
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: done ? '#15803D' : C.primary, gap: 4 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{done ? `✓ ${rollLine(counts)}` : rollLine(counts)}</Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>
          {roll.canMark ? 'Tap P, L or A for each student. The office’s late arrivals and early check-outs show here too.'
            : 'Roll can only be changed for the last two weeks.'}
        </Text>
      </View>
      {roll.canMark && rest.length > 0 && (
        <Button label={busy ? 'Saving…' : `Mark ${rest.length === counts.students ? 'everyone' : 'the rest'} present (${rest.length})`}
          disabled={busy} onPress={() => mark(rest, 'present')} />
      )}

      {roll.students.length === 0 && <P muted>No students in this class yet. The office adds them in Admin portal → Classes.</P>}
      {roll.students.map((st) => (
        <StudentRow key={st.id} st={st} canMark={roll.canMark && !busy} onMark={(m) => mark([st], st.mark === m && st.state === m ? null : m)} />
      ))}
      </>)}
    </ScrollView>
  );
}

/**
 * Going home: who has gone and how, who is staying (an activity, extended care), and the rest to mark: Walked, Drove,
 * Bus or Other. Absent students are left out of the count.
 */
function GoingHome({ roll, busy, onMark }: { roll: ClassRoll; busy: boolean; onMark: (st: RollStudent, how: DismissalHow | null) => void }) {
  const gone = roll.students.filter((x) => x.home);
  const absent = roll.students.filter((x) => !x.home && x.state === 'absent');
  const staying = roll.students.filter((x) => !x.home && x.state !== 'absent' && x.staying);
  const left = roll.students.length - gone.length - absent.length - staying.length;
  const all = roll.students.length > 0 && left === 0;
  return (
    <>
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: all ? '#15803D' : C.primary, gap: 4 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
          {all ? '✓ Everyone’s gone home or accounted for'
            : [`${left} still to send home`, gone.length > 0 && `${gone.length} gone`, staying.length > 0 && `${staying.length} staying`].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: '#fff', opacity: 0.9 }}>
          Mark how each student left. Car line pickups, the office’s check-outs, activities and extended care show here by themselves. Parents get a notification.
        </Text>
      </View>
      {roll.students.map((st) => <GoingHomeRow key={st.id} st={st} disabled={busy} onMark={(how) => onMark(st, how)} />)}
    </>
  );
}

function GoingHomeRow({ st, disabled, onMark }: { st: RollStudent; disabled: boolean; onMark: (how: DismissalHow | null) => void }) {
  const first = st.name.split(' ')[0];
  const absent = !st.home && st.state === 'absent';
  const line = st.home ? homeLine(st.home) : absent ? 'Absent today' : st.staying ? `Staying: ${stayingLine(st.staying)}` : st.state ? 'Still here' : 'Not checked in today';
  const color = st.home ? '#15803D' : absent ? '#94A3B8' : st.staying ? C.primary : '#B45309';
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: color, gap: 8 }}>
      <View style={[s.row, { gap: 8 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
          <Text style={{ fontSize: 13, color: st.home || absent || st.staying ? C.muted : '#B45309' }}>{line}</Text>
        </View>
        {st.home && isTeacherMark(st.home) && (
          <Text onPress={() => { if (!disabled) onMark(null); }} accessibilityRole="button" accessibilityLabel={`Undo: ${first}`}
            style={{ color: C.primary, fontWeight: '700' }}>Undo</Text>
        )}
      </View>
      {!st.home && !absent && !st.staying && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {DISMISSAL_HOWS.map((h) => (
            <Pressable key={h.key} disabled={disabled} onPress={() => onMark(h.key)} accessibilityRole="button" accessibilityLabel={`${first}: ${h.label}`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' }, (pressed || disabled) && { opacity: 0.6 }]}>
              <Ionicons name={h.icon} size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontWeight: '700' }}>{h.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** A student: name, the office's check-ins and check-outs, and P / L / A (the one that holds is filled). */
function StudentRow({ st, canMark, onMark }: { st: RollStudent; canMark: boolean; onMark: (m: AttendanceMark) => void }) {
  const first = st.name.split(' ')[0];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff',
      borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: markColor(st.state) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{st.name}</Text>
        {st.checks.map((c, i) => (
          <View key={i} style={[s.row, { gap: 4 }]}>
            <Ionicons name={c.kind === 'in' ? 'log-in-outline' : 'log-out-outline'} size={14} color={c.kind === 'in' ? '#B45309' : C.primary} />
            <Text style={{ fontSize: 13, color: C.muted, flexShrink: 1 }}>{checkLine(c)}</Text>
          </View>
        ))}
        {st.left && <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>GONE HOME</Text>}
        {!!st.reported && (
          <Text style={{ fontSize: 13, color: '#B45309' }}>
            📝 {st.reported.by}: {kindLabel(st.reported.kind)}{st.reported.at ? ` at ${clock(st.reported.at)}` : ''} · {reasonLabel(st.reported.reason)}
            {st.reported.note ? ` · “${st.reported.note}”` : ''}
          </Text>
        )}
      </View>
      {MARKS.map((m) => {
        const on = st.state === m.key;
        return (
          <Pressable key={m.key} onPress={() => onMark(m.key)} disabled={!canMark} hitSlop={4}
            accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !canMark }} accessibilityLabel={`${first}: ${m.label}`}
            style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? m.color : '#fff', borderWidth: 1.5, borderColor: on ? m.color : C.line, opacity: !canMark && !on ? 0.4 : 1 }}>
            <Text style={{ fontWeight: '900', fontSize: 15, color: on ? '#fff' : m.color }}>{m.short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
