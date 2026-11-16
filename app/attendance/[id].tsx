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
 *
 * It's in the look of the Staff view's homes (src/hub.tsx): a navy band with the day, Roll / Going home, the counts and
 * "Mark the rest present" in gold; each student a circle with their initials in the color of their mark.
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
import { Band, BandTabs, GoldButton, Initials, Stat, Stats } from '../../src/hub';
import { C, Card, Loading, P, s } from '../../src/ui';

/** The marks' colors, brighter so they show on the navy band. */
const ON_NAVY: Record<AttendanceMark, string> = { present: '#22C55E', late: '#F59E0B', absent: '#F87171' };

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

  const home = homeCounts(roll);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {header}
      <Band>
        {roll.otherDays !== false && <DayStepper dark day={day} onChange={changeDay} />}
        {roll.canDismiss && (
          <BandTabs tabs={[['roll', 'Roll'], ['home', 'Going home']] as const} value={dismissing ? 'home' : 'roll'} onChange={setMode} />
        )}
        {dismissing ? (
          <Stats>
            <Stat n={home.left} label="To send home" alert dot="#F59E0B" />
            <Stat n={home.gone} label="Gone home" dot="#22C55E" />
            <Stat n={home.staying} label="Staying" dot="#93C5FD" />
          </Stats>
        ) : (
          <Stats>
            {MARKS.map((m) => <Stat key={m.key} n={counts[m.key]} label={m.label} dot={ON_NAVY[m.key]} />)}
            <Stat n={counts.unmarked} label="Not marked" alert />
          </Stats>
        )}
        {dismissing ? (home.all && <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>✓ Everyone’s gone home or accounted for</Text>)
          : roll.canMark && rest.length > 0 ? (
            <GoldButton icon="checkmark-done" label={busy ? 'Saving…' : `Mark ${rest.length === counts.students ? 'everyone' : 'the rest'} present (${rest.length})`}
              onPress={() => { if (!busy) mark(rest, 'present'); }} />
          ) : done ? <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>✓ {rollLine(counts)}</Text> : null}
      </Band>
      <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>
        {dismissing ? 'Mark how each student left. Car line pickups, the office’s check-outs, activities and extended care show here by themselves. Parents get a notification.'
          : roll.canMark ? 'Tap P, L or A for each student (tap again to clear). The office’s late arrivals and early check-outs show here too.'
          : 'Roll can only be changed for the last two weeks.'}
      </Text>

      {roll.students.length === 0 && <Card><P muted>No students in this class yet. The office adds them in Admin portal → Classes.</P></Card>}
      {dismissing
        ? roll.students.map((st) => <GoingHomeRow key={st.id} st={st} disabled={busy} onMark={(how) => sendHome(st, how)} />)
        : roll.students.map((st) => (
          <StudentRow key={st.id} st={st} canMark={roll.canMark && !busy} onMark={(m) => mark([st], st.mark === m && st.state === m ? null : m)} />
        ))}
    </ScrollView>
  );
}

/** Going home's counts: gone, staying (an activity, extended care), and the rest still to send home; absent students are left out. */
function homeCounts(roll: ClassRoll) {
  const gone = roll.students.filter((x) => x.home).length;
  const absent = roll.students.filter((x) => !x.home && x.state === 'absent').length;
  const staying = roll.students.filter((x) => !x.home && x.state !== 'absent' && x.staying).length;
  const left = roll.students.length - gone - absent - staying;
  return { gone, staying, left, all: roll.students.length > 0 && left === 0 };
}

function GoingHomeRow({ st, disabled, onMark }: { st: RollStudent; disabled: boolean; onMark: (how: DismissalHow | null) => void }) {
  const first = st.name.split(' ')[0];
  const absent = !st.home && st.state === 'absent';
  const line = st.home ? homeLine(st.home) : absent ? 'Absent today' : st.staying ? `Staying: ${stayingLine(st.staying)}` : st.state ? 'Still here' : 'Not checked in today';
  const color = st.home ? '#15803D' : absent ? '#94A3B8' : st.staying ? C.primary : '#B45309';
  return (
    <View style={{ padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, gap: 10 }}>
      <View style={[s.row, { gap: 10 }]}>
        <Initials name={st.name} color={color} />
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 48 }}>
          {DISMISSAL_HOWS.map((h) => (
            <Pressable key={h.key} disabled={disabled} onPress={() => onMark(h.key)} accessibilityRole="button" accessibilityLabel={`${first}: ${h.label}`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
                borderWidth: 1, borderColor: `${C.primary}33`, backgroundColor: `${C.primary}0D` }, (pressed || disabled) && { opacity: 0.6 }]}>
              <Ionicons name={h.icon} size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontWeight: '700' }}>{h.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** A student: their initials in the color of their mark, the office's check-ins and check-outs, and P / L / A (the one that holds is filled). */
function StudentRow({ st, canMark, onMark }: { st: RollStudent; canMark: boolean; onMark: (m: AttendanceMark) => void }) {
  const first = st.name.split(' ')[0];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#fff',
      borderWidth: 1, borderColor: C.line }}>
      <Initials name={st.name} color={markColor(st.state)} />
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
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? m.color : '#fff', borderWidth: 1.5, borderColor: on ? m.color : C.line, opacity: !canMark && !on ? 0.4 : 1 }}>
            <Text style={{ fontWeight: '900', fontSize: 15, color: on ? '#fff' : m.color }}>{m.short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
