/**
 * Student app: a dashboard of a student's record from the school's student information system (FACTS, Blackbaud…),
 * for parents (pick a child at the top; the oldest first) and for a student themselves: general information,
 * attendance this school year (tap absences, times late or left early for those days), and grades (the overall average
 * and each class's), where a class opens its graph and every grade. Tap the photo in the banner to take, choose or
 * remove the student's photo (a parent's child's, or a student's own). Parents also read each child's messages with
 * teachers. Until the school's system is connected, grades and report cards stay in the FACTS Family Portal.
 */
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isFamily, live, removeChildPhoto, removeMyAvatar, session, studentRecord, uploadChildPhoto, uploadMyAvatar,
  type AttendanceEntry, type Person, type RecordStudent, type StudentDashboard, type StudentRecord,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { pickSquarePhoto } from '../../src/photos';
import { attendanceSummary, letterFor, overallAverage, percent, termFor } from '../../src/student/grades';
import { AMBER, GOOD, LetterBadge, StudentPicker, SubjectIcon, letterColor } from '../../src/student/parts';
import { Avatar, Button, C, Card, H, Loading, P, s, useBottomInset } from '../../src/ui';

// The site's "Family Portal" link (content/site/site.json).
const FACTS_PORTAL = 'https://sis.factsmgt.com/family-portal';
const SOURCES: Record<string, string> = { facts: 'FACTS', blackbaud: 'Blackbaud', sample: 'Sample data' };

const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const ageOn = (birthday: string, today: string) => {
  const [y, m, d] = birthday.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

export default function Student() {
  const [person, setPerson] = useState<Person | null | undefined>(live ? undefined : null);
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picked = useRef<string | null>(null);   // the student chosen at the top (null: the oldest)
  const bottom = useBottomInset();

  const load = useCallback(async () => {
    if (!live) return;
    const p = await session().catch(() => null);
    setPerson(p);
    if (!p || p.pending || isFamily(p)) return;
    try {
      const d = await studentRecord(picked.current);
      picked.current = d.studentId;
      setData(d);
      setError(null);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const choose = (id: string) => { picked.current = id; setData(null); load(); };
  const pick = data?.studentId ?? null;

  const header = <Stack.Screen options={{ title: 'Student' }} />;
  if (person === undefined) return <>{header}<Loading /></>;
  if (isFamily(person)) return (
    <View style={[s.screen, s.pad]}>
      {header}
      <Card>
        <H>Not part of Family accounts</H>
        <P muted>The Student app is for parents and students. You can pick up the children the school linked to you in the Car Line.</P>
        <Button label="Open the Car Line" onPress={() => router.replace('/carline')} />
      </Card>
    </View>
  );
  const parent = !!person && person.schoolRole !== 'student';

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 24 + bottom, gap: 14 }]}>
      {header}
      {!person && live && (
        <Card>
          <H>Sign in to see your students</H>
          <Button label="Sign in" onPress={() => router.navigate('/connect')} />
        </Card>
      )}
      {error && <Card><H>Couldn't load the record</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>}
      {person && !data && !error && <Loading />}
      {data && data.students.length > 0 && <StudentPicker students={data.students} value={pick} onChange={choose} />}
      {data && parent && data.students.length === 0 && (
        <Card><P muted>No students are linked to your account yet. Add them under My children, or ask the school office.</P></Card>
      )}
      {data && data.students.length > 0 && (data.record
        ? <Dashboard data={data} record={data.record} me={person} onChange={load} />
        : <NotYet name={data.students.find((x) => x.id === pick)?.firstName ?? 'your student'} />)}

      {parent && pick && (
        <Pressable onPress={() => router.push({ pathname: '/teachers', params: { child: pick } })} accessibilityRole="link"
          style={({ pressed }) => [s.card, s.row, pressed && { opacity: 0.8 }]}>
          <Ionicons name="chatbubbles-outline" size={22} color={C.primary} />
          <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>Messages with teachers</Text>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      )}
      {parent && <Button kind="ghost" label="My children: photos, allergies, add a child" onPress={() => router.push('/children')} />}
      {data?.record && (
        <Text style={{ color: C.primary, fontWeight: '700', textAlign: 'center' }} accessibilityRole="link" onPress={() => Linking.openURL(FACTS_PORTAL)}>
          Report cards: FACTS Family Portal ›
        </Text>
      )}
    </ScrollView>
  );
}

/** Before the school's system has sent this student's record. */
function NotYet({ name }: { name: string }) {
  return (
    <Card>
      <H>{`${name}'s grades and attendance aren't here yet`}</H>
      <P muted>They come from the school's student information system once the school connects it to the app. Until then, grades, report cards and schedules are in the FACTS Family Portal.</P>
      <Button label="Open FACTS Family Portal" onPress={() => Linking.openURL(FACTS_PORTAL)} />
    </Card>
  );
}

function Dashboard({ data, record, me, onChange }: { data: StudentDashboard; record: StudentRecord; me: Person | null; onChange: () => Promise<void> }) {
  const student = data.students.find((x) => x.id === data.studentId) ?? data.students[0];
  const today = schoolToday();
  return (
    <>
      <Info record={record} student={student} self={student.id === me?.id} gradeLabel={student.gradeLabel} today={today} onChange={onChange} />
      <Attendance record={record} />
      <Grades data={data} record={record} today={today} />
    </>
  );
}

function Section({ icon, title, sub, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={[s.card, { padding: 16, gap: 12 }]}>
      <View style={s.row}>
        <Ionicons name={icon} size={20} color={C.primary} />
        <Text style={[s.h, { flex: 1 }]}>{title}</Text>
        {!!sub && <Text style={{ color: C.muted, fontWeight: '600', fontSize: 13 }}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

function Info({ record, student, self, gradeLabel, today, onChange }: {
  record: StudentRecord; student: RecordStudent; self: boolean; gradeLabel: string | null; today: string; onChange: () => Promise<void>;
}) {
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = `${student.firstName} ${student.lastName}`;
  // A parent sets their child's photo (as under My children); a student, their own.
  const photo = async (how: 'camera' | 'library' | 'remove') => {
    setSheet(false);
    setBusy(true);
    try {
      if (how === 'remove') await (self ? removeMyAvatar() : removeChildPhoto(student.id, student.photoPath));
      else {
        const b64 = await pickSquarePhoto(how === 'camera');
        if (!b64) return;
        await (self ? uploadMyAvatar(b64) : uploadChildPhoto(student.id, b64, student.photoPath));
      }
      await onChange();
    } catch (e) { Alert.alert('Photo', errorText(e)); } finally { setBusy(false); }
  };
  const rows: [string, string][] = [
    ...(record.homeroom ? [['Homeroom', record.homeroom] as [string, string]] : []),
    ...(record.advisor ? [['Advisor', record.advisor] as [string, string]] : []),
    ...(record.birthday ? [['Birthday', `${longDate(record.birthday)} (age ${ageOn(record.birthday, today)})`] as [string, string]] : []),
    ...(record.enrolledOn ? [['Enrolled since', longDate(record.enrolledOn)] as [string, string]] : []),
    ...record.details.map((d) => [d.label, d.value] as [string, string]),
  ];
  const synced = new Date(record.syncedAt);
  return (
    <View style={[s.card, { padding: 0, overflow: 'hidden', gap: 0 }]}>
      <View style={{ backgroundColor: C.primary, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => setSheet(true)} disabled={busy} accessibilityRole="button"
          accessibilityLabel={student.photo ? `Change ${student.firstName}'s photo` : `Add a photo of ${student.firstName}`}
          style={({ pressed }) => [{ borderWidth: 3, borderColor: '#ffffff55', borderRadius: 40, backgroundColor: '#fff' }, pressed && { opacity: 0.85 }]}>
          <Avatar person={{ firstName: student.firstName, lastName: student.lastName, avatar: student.photo }} size={68} />
          {busy && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 34, backgroundColor: '#0006', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <View style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
            borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera" size={14} color={C.primary} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }} numberOfLines={2}>{name}</Text>
          <Text style={{ color: '#ffffffd9', fontWeight: '700' }}>{[gradeLabel, `Student ID ${record.sisId}`].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <PhotoSheet open={sheet} name={student.firstName} hasPhoto={!!student.photoPath} onPick={photo} onClose={() => setSheet(false)} />
      <View style={{ padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.muted }}>GENERAL INFORMATION</Text>
        {rows.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ width: 120, color: C.muted, fontWeight: '600' }}>{label}</Text>
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }}>{value}</Text>
          </View>
        ))}
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
          {`From ${SOURCES[record.source] ?? record.source} · updated ${synced.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${synced.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
        </Text>
      </View>
    </View>
  );
}

/** Take, choose or remove the student's photo. */
function PhotoSheet({ open, name, hasPhoto, onPick, onClose }: {
  open: boolean; name: string; hasPhoto: boolean; onPick: (how: 'camera' | 'library' | 'remove') => void; onClose: () => void;
}) {
  const choices: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; how: 'camera' | 'library' | 'remove'; color: string }[] = [];
  if (Platform.OS !== 'web') choices.push({ icon: 'camera-outline', label: 'Take a photo', how: 'camera', color: C.ink });
  choices.push({ icon: 'images-outline', label: hasPhoto ? 'Choose a different photo' : 'Choose a photo', how: 'library', color: C.ink });
  if (hasPhoto) choices.push({ icon: 'trash-outline', label: 'Remove the photo', how: 'remove', color: C.danger });
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { backgroundColor: C.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 36, gap: 4 }]}>
          <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted, marginBottom: 6 }}>{`${name.toUpperCase()}'S PHOTO`}</Text>
          {choices.map(({ icon, label, how, color }) => (
            <Pressable key={how} onPress={() => onPick(how)} accessibilityRole="button"
              style={({ pressed }) => [s.row, { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 }, pressed && { backgroundColor: C.bg }]}>
              <Ionicons name={icon} size={22} color={color} />
              <Text style={{ fontSize: 16, fontWeight: '700', color }}>{label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [s.row, { paddingVertical: 12, paddingHorizontal: 8 }, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={22} color={C.muted} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.muted }}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const KINDS: Record<AttendanceEntry['kind'], { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  absent: { label: 'Absent', icon: 'close-circle' },
  half_day: { label: 'Half day', icon: 'contrast' },
  tardy: { label: 'Late', icon: 'time' },
  left_early: { label: 'Left early', icon: 'exit' },
};

/** The days behind each number: absences (half days too), times late, and times left early. */
type Filter = 'absences' | 'late' | 'early';
const FILTERS: Record<Filter, { kinds: AttendanceEntry['kind'][]; one: string; many: string }> = {
  absences: { kinds: ['absent', 'half_day'], one: 'day absent', many: 'days absent' },
  late: { kinds: ['tardy'], one: 'day late', many: 'days late' },
  early: { kinds: ['left_early'], one: 'day left early', many: 'days left early' },
};

function Attendance({ record }: { record: StudentRecord }) {
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);
  const a = attendanceSummary(record.attendance, record.schoolDays);
  const days = (f: Filter) => record.attendance.filter((m) => FILTERS[f].kinds.includes(m.kind));
  const list = filter ? days(filter) : all ? record.attendance : record.attendance.slice(0, 4);
  const toggle = (f: Filter) => () => setFilter(filter === f ? null : f);
  const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const rateColor = a.rate === null ? C.muted : a.rate >= 95 ? GOOD : a.rate >= 90 ? AMBER : C.danger;
  return (
    <Section icon="calendar-outline" title="Attendance" sub={record.schoolDays ? `${record.schoolDays} school days` : 'This school year'}>
      <View style={[s.row, { borderRadius: 12, padding: 12, backgroundColor: rateColor + '12', gap: 12 }]}>
        <Text style={{ fontSize: 30, fontWeight: '900', color: rateColor }}>{a.rate === null ? '—' : `${Math.round(a.rate * 10) / 10}%`}</Text>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: C.muted, fontWeight: '700' }}>of school days present</Text>
          {a.rate !== null && (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
              <View style={{ width: `${a.rate}%`, height: 6, borderRadius: 3, backgroundColor: rateColor }} />
            </View>
          )}
        </View>
      </View>
      <View style={[s.row, { alignItems: 'stretch', gap: 10 }]}>
        <Stat value={num(a.absences)} label={a.absences === 1 ? 'absence' : 'absences'} sub={a.absences ? `${num(a.excused)} excused` : undefined}
          selected={filter === 'absences'} onPress={a.absences ? toggle('absences') : undefined} />
        <Stat value={String(a.tardies)} label={a.tardies === 1 ? 'time late' : 'times late'} selected={filter === 'late'} onPress={a.tardies ? toggle('late') : undefined} />
        <Stat value={String(a.leftEarly)} label="left early" selected={filter === 'early'} onPress={a.leftEarly ? toggle('early') : undefined} />
      </View>
      {filter ? (
        <View style={s.row}>
          <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>
            {`${list.length} ${list.length === 1 ? FILTERS[filter].one : FILTERS[filter].many} this year`}
          </Text>
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => setFilter(null)}>Show every day</Text>
        </View>
      ) : record.attendance.length > 0 && <Text style={{ color: C.muted, fontSize: 12 }}>Tap a number to see those days.</Text>}
      {record.attendance.length === 0 ? (
        <View style={s.row}><Ionicons name="star" size={18} color={GOOD} /><Text style={{ color: C.ink, fontWeight: '600' }}>Perfect attendance so far this year.</Text></View>
      ) : (
        <View>
          {list.map((m, i) => (
            <View key={`${m.day}${m.kind}`} style={[s.row, { paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
              <Ionicons name={KINDS[m.kind].icon} size={20} color={m.excused ? C.muted : AMBER} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{KINDS[m.kind].label}<Text style={{ color: C.muted, fontWeight: '600' }}>{` · ${shortDate(m.day)}`}</Text></Text>
                {!!m.note && <Text style={{ color: C.muted, fontSize: 13 }}>{m.note}</Text>}
              </View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: m.excused ? C.muted : AMBER }}>{m.excused ? 'Excused' : 'Unexcused'}</Text>
            </View>
          ))}
          {!filter && record.attendance.length > 4 && (
            <Text style={{ color: C.primary, fontWeight: '700', paddingTop: 6 }} accessibilityRole="button" onPress={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${record.attendance.length}`}
            </Text>
          )}
        </View>
      )}
    </Section>
  );
}

/** A number with what it counts; with onPress (when it isn't zero), tapping lists those days below. */
function Stat({ value, label, sub, selected, onPress }: { value: string; label: string; sub?: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${value} ${label}${sub ? `, ${sub}` : ''}${onPress ? (selected ? '. Showing those days' : '. Show those days') : ''}`}
      style={({ pressed }) => [{ flex: 1, borderRadius: 12, padding: 12, gap: 2, borderWidth: 2, backgroundColor: selected ? C.primary + '12' : C.bg,
        borderColor: selected ? C.primary : 'transparent' }, pressed && { opacity: 0.8 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: C.ink }}>{value}</Text>
        {!!onPress && <Ionicons name={selected ? 'chevron-up' : 'chevron-down'} size={16} color={selected ? C.primary : C.muted} />}
      </View>
      <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      {!!sub && <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text>}
    </Pressable>
  );
}

function Grades({ data, record, today }: { data: StudentDashboard; record: StudentRecord; today: string }) {
  const overall = overallAverage(record.courses.map((c) => c.average));
  const letter = letterFor(overall, data.scale);
  const term = termFor(record.terms, today);
  const missing = record.courses.reduce((n, c) => n + c.missing, 0);
  return (
    <Section icon="school-outline" title="Grades" sub={term?.name}>
      {record.courses.length === 0 ? <P muted>No classes yet this school year.</P> : (
        <>
          <View style={[s.row, { gap: 14, padding: 14, borderRadius: 14, backgroundColor: letterColor(letter) + '0F' }]}>
            <LetterBadge letter={letter} size="large" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 30, fontWeight: '900', color: C.ink }}>{percent(overall)}</Text>
              <Text style={{ color: C.muted, fontWeight: '700' }}>{`Overall average · ${record.courses.length} ${record.courses.length === 1 ? 'class' : 'classes'}`}</Text>
            </View>
          </View>
          {missing > 0 && (
            <View style={[s.row, { gap: 8 }]}>
              <Ionicons name="alert-circle" size={18} color={C.danger} />
              <Text style={{ color: C.danger, fontWeight: '700' }}>{`${missing} missing ${missing === 1 ? 'assignment' : 'assignments'}`}</Text>
            </View>
          )}
          <View>
            {record.courses.map((c, i) => (
              <Pressable key={c.id} onPress={() => router.push(`/student/course/${c.id}`)} accessibilityRole="link"
                accessibilityLabel={`${c.name}, ${percent(c.average)}, ${c.letter ?? 'no letter yet'}${c.missing ? `, ${c.missing} missing` : ''}`}
                style={({ pressed }) => [s.row, { paddingVertical: 12, gap: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }, pressed && { opacity: 0.7 }]}>
                <SubjectIcon subject={c.subject} name={c.name} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }} numberOfLines={1}>{c.name}</Text>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, c.average ?? 0)}%`, height: 6, borderRadius: 3, backgroundColor: letterColor(c.letter) }} />
                  </View>
                  <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>
                    {[c.teacher, c.missing ? `${c.missing} missing` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <LetterBadge letter={c.letter} />
                  <Text style={{ color: C.ink, fontWeight: '700', fontSize: 13 }}>{percent(c.average)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Section>
  );
}
