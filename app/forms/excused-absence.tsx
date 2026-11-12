/**
 * Excused Absence, one of the Forms to Send to Office (Forms). Parents report that a child is out (one or several
 * days), arriving late or leaving early, with a reason, and see what they've reported (Cancel; "Seen by the office"),
 * the last 30 days' under Earlier. They attach a doctor's note (a photo or PDF of the official excuse) when they report
 * or afterwards, and view, replace or remove it. Teachers see their students' reports and the office everyone's, a day
 * at a time (‹ ›), and the office marks each one seen and opens its doctor's note (teachers only see that there is
 * one). Someone who's both (a teacher with children here) gets both.
 */
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  attachDoctorNote, cancelAbsence, doctorNoteUrl, errorText, isFamily, isSchoolStaff, listAbsences, live, markAbsenceSeen, myAccess, myChildren,
  removeDoctorNote, reportAbsence, session, type AbsenceReport, type DoctorNoteFile, type Person,
} from '../../src/api/connect';
import { pickDoctorNote, type NoteSource } from '../../src/absences/doctorNote';
import { KINDS, REASONS, describe, reasonLabel, type AbsenceKind, type AbsenceReason } from '../../src/absences/labels';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { Pills } from '../../src/feedback/ui';
import { addDays } from '../../src/info/today';
import { Button, C, Card, Chip, Field, H, Loading, P, ask, s } from '../../src/ui';

const dayLabel = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
/** How long after an absence its doctor's note can still be added (the database's limit too). */
const NOTE_DAYS = 30;
const GREEN = '#15803D';
const openNote = (path: string) => doctorNoteUrl(path).then((url) => Linking.openURL(url)).catch((e) => Alert.alert("Doctor's note", errorText(e)));

export default function ExcusedAbsence() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<Person[]>([]);
  const [office, setOffice] = useState(false);
  const [mine, setMine] = useState<AbsenceReport[]>([]);
  const [day, setDay] = useState(schoolToday());
  const [list, setList] = useState<AbsenceReport[] | null>(null);
  const earlier = usePastToggle();

  const load = useCallback(async () => {
    const p = live ? await session().catch(() => null) : null;
    setMe(p);
    if (!p || p.pending) return;
    try {
      const parent = !isFamily(p) && p.schoolRole !== 'student';
      const [children, access] = await Promise.all([parent ? myChildren() : [], myAccess().catch(() => null)]);
      setKids(children);
      setOffice(!!access?.permissions.includes('checkin.manage'));
      const ids = new Set(children.map((k) => k.id));
      // A parent's own: the last 30 days (for adding a doctor's note afterwards) and two months out.
      setMine(children.length ? (await listAbsences(addDays(schoolToday(), -NOTE_DAYS), NOTE_DAYS + 60)).filter((r) => ids.has(r.studentId)) : []);
    } catch (e) { Alert.alert('Excused Absence', errorText(e)); }
  }, []);
  const loadDay = useCallback((d: string) => { listAbsences(d, 1).then(setList).catch(() => setList([])); }, []);
  useFocusEffect(useCallback(() => { load(); loadDay(day); }, [load, loadDay, day]));

  const header = <Stack.Screen options={{ title: 'Excused Absence' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me || me.pending) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Sign in to report an absence.</P></Card></View>;
  const staff = isSchoolStaff(me);
  const theirs = list ?? [];
  const today = schoolToday();
  const upcoming = mine.filter((r) => r.endsOn >= today);
  const past = mine.filter((r) => r.endsOn < today).reverse();

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {kids.length > 0 && <ReportForm kids={kids} onSent={() => { load(); loadDay(day); }} />}
      {mine.length > 0 && (
        <View style={{ gap: 8 }}>
          <H>What you’ve reported</H>
          {upcoming.length === 0 && <P muted>Nothing coming up.</P>}
          {[...upcoming, ...(earlier.shown ? past : [])].map((r) => <MyReport key={r.id} r={r} today={today} onChange={load} />)}
          <PastToggle count={past.length} shown={earlier.shown} onToggle={earlier.toggle} noun={`${past.length === 1 ? 'report' : 'reports'} from the last 30 days`} />
        </View>
      )}
      {!staff && kids.length === 0 && <Card><P muted>Only a child’s parents report their absences. Ask the school office to link your children.</P></Card>}

      {staff && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <H>{office ? 'Reported by parents' : 'Your students'}</H>
          <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text onPress={() => setDay(addDays(day, -1))} accessibilityRole="button" style={{ fontSize: 22, color: C.primary, paddingHorizontal: 8 }}>‹</Text>
            <Pressable onPress={() => setDay(schoolToday())}><Text style={{ fontWeight: '800', color: C.ink }}>{day === schoolToday() ? 'Today' : dayLabel(day)}</Text></Pressable>
            <Text onPress={() => setDay(addDays(day, 1))} accessibilityRole="button" style={{ fontSize: 22, color: C.primary, paddingHorizontal: 8 }}>›</Text>
          </View>
          {!list ? <Loading /> : theirs.length === 0 ? <Card><P muted>Nothing reported for {day === schoolToday() ? 'today' : dayLabel(day)}.</P></Card>
            : theirs.map((r) => (
              <Card key={r.id} style={{ gap: 4, opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>{r.student}{r.classes ? ` · ${r.classes}` : ''}</Text>
                <Text style={{ color: C.ink }}>{describe(r)}</Text>
                <P muted>{reasonLabel(r.reason)}{r.note ? ` · “${r.note}”` : ''}</P>
                <P muted>From {r.reportedBy}, {new Date(r.createdAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</P>
                <View style={[s.row, { alignItems: 'center', flexWrap: 'wrap' }]}>
                  {r.status === 'cancelled' && <Chip label="Called off" color={C.muted} />}
                  {r.status === 'reported' && r.seenAt && <Chip label={`✓ Seen by ${r.seenBy}`} color={GREEN} />}
                  {r.doctorNote ? (
                    <Pressable onPress={() => openNote(r.doctorNote!)} accessibilityRole="button" accessibilityLabel={`Open ${r.student}'s doctor's note`}
                      style={({ pressed }) => [s.row, { gap: 4 }, pressed && { opacity: 0.6 }]}>
                      <Ionicons name="medkit-outline" size={16} color={C.primary} />
                      <Text style={{ color: C.primary, fontWeight: '800' }}>Doctor’s note</Text>
                    </Pressable>
                  ) : r.doctorNoteAt ? <Chip label="🩺 Doctor’s note on file" color={GREEN} /> : null}
                  {r.status === 'reported' && !r.seenAt && office && (
                    <Text style={{ color: C.primary, fontWeight: '800' }} accessibilityRole="button"
                      onPress={() => markAbsenceSeen(r.id).then(() => loadDay(day)).catch((e) => Alert.alert('Not changed', errorText(e)))}>Mark seen</Text>
                  )}
                </View>
              </Card>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

function ReportForm({ kids, onSent }: { kids: Person[]; onSent: () => void }) {
  const [kid, setKid] = useState<string>(kids[0].id);
  const [kind, setKind] = useState<AbsenceKind>('absent');
  const [startsOn, setStartsOn] = useState(schoolToday());
  const [endsOn, setEndsOn] = useState('');
  const [at, setAt] = useState('');
  const [reason, setReason] = useState<AbsenceReason>('sick');
  const [note, setNote] = useState('');
  const [doctor, setDoctor] = useState<DoctorNoteFile | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const id = await reportAbsence({ studentId: kid, kind, startsOn, endsOn: kind === 'absent' ? endsOn || null : null, at: kind === 'absent' ? null : at, reason, note });
      let attached = '';
      if (doctor) {
        try { await attachDoctorNote(id, doctor); attached = ' The doctor’s note is with it.'; } catch (e) {
          attached = ` The doctor’s note didn’t upload (${errorText(e)}): add it again under What you’ve reported.`;
        }
      }
      setNote(''); setEndsOn(''); setAt(''); setDoctor(null);
      Alert.alert('Sent', `The office and the teachers know.${attached}`);
      onSent();
    } catch (e) {
      Alert.alert('Not sent', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const ok = !!kid && (kind === 'absent' || !!at);
  return (
    <Card style={{ gap: 10 }}>
      <H>Report an absence</H>
      {kids.length > 1 && <Pills options={kids.map((k) => ({ key: k.id, label: k.firstName }))} value={kid} onChange={setKid} />}
      <Pills options={KINDS.map((k) => ({ key: k.key, label: k.label }))} value={kind} onChange={setKind} />
      <View style={s.row}>
        <DateField label={kind === 'absent' ? 'From' : 'Day'} value={startsOn} min={schoolToday()} onChange={(d) => { setStartsOn(d); if (endsOn && endsOn < d) setEndsOn(''); }} style={{ flex: 1 }} />
        {kind === 'absent'
          ? <DateField label="Through (optional)" optional value={endsOn} min={startsOn} initial={startsOn} placeholder="Just that day" onChange={setEndsOn} style={{ flex: 1 }} />
          : <TimeField label={kind === 'late' ? 'Arriving at' : 'Picked up at'} value={at} onChange={setAt} initial={kind === 'late' ? '09:30' : '13:00'} style={{ flex: 1 }} />}
      </View>
      <Pills options={REASONS.map((r) => ({ key: r.key, label: `${r.emoji} ${r.label}` }))} value={reason} onChange={setReason} />
      <Field label="Note for the office (optional)" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Fever since last night" />
      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>Doctor’s note (optional)</Text>
        {doctor ? (
          <View style={[s.row, { gap: 8 }]}>
            <Ionicons name="medkit" size={18} color={GREEN} />
            <Text style={{ flex: 1, color: GREEN, fontWeight: '700' }}>{doctor.mimeType === 'application/pdf' ? 'PDF' : 'Photo'} attached</Text>
            <Text style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button" onPress={() => setDoctor(null)}>Remove</Text>
          </View>
        ) : <NoteChooser onPick={setDoctor} />}
        <P muted>A photo or PDF of the official excuse. You can also add it later, up to 30 days after.</P>
      </View>
      <Button label={busy ? 'Sending…' : 'Send to the school'} onPress={send} disabled={busy || !ok} />
      <P muted>The office and {kids.find((k) => k.id === kid)?.firstName ?? 'your child'}’s teachers see it right away.
        For leaving early, the office still checks them out when you arrive.</P>
    </Card>
  );
}

/** Take a photo of the doctor's note, pick one, or pick a PDF (no camera on the web). */
function NoteChooser({ onPick, disabled }: { onPick: (f: DoctorNoteFile) => void; disabled?: boolean }) {
  const pick = (source: NoteSource) => pickDoctorNote(source).then((f) => f && onPick(f)).catch((e) => Alert.alert("Doctor's note", errorText(e)));
  const sources: { key: NoteSource; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
    ...(Platform.OS === 'web' ? [] : [{ key: 'camera' as const, icon: 'camera-outline' as const, label: 'Take a photo' }]),
    { key: 'photos', icon: 'image-outline', label: Platform.OS === 'web' ? 'Choose a picture' : 'Choose a photo' },
    { key: 'file', icon: 'document-attach-outline', label: 'Choose a PDF' },
  ];
  return (
    <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
      {sources.map((x) => (
        <Pressable key={x.key} onPress={() => pick(x.key)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Doctor's note: ${x.label}`}
          style={({ pressed }) => [s.row, { gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
            borderColor: C.primary, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}>
          <Ionicons name={x.icon} size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700' }}>{x.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** One of the parent's reports: its state, Call off while it's ahead, and its doctor's note (add, view, replace, remove). */
function MyReport({ r, today, onChange }: { r: AbsenceReport; today: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const first = r.student.split(' ')[0];
  const open = r.status === 'reported';
  const canAdd = open && r.endsOn >= addDays(today, -NOTE_DAYS);
  const attach = (f: DoctorNoteFile) => {
    setBusy(true);
    attachDoctorNote(r.id, f).then(() => { setChoosing(false); onChange(); })
      .catch((e) => Alert.alert('Not attached', errorText(e))).finally(() => setBusy(false));
  };
  const remove = () => ask('Remove the doctor’s note?', `${first} · ${describe(r)}`, 'Remove', () => {
    setBusy(true);
    removeDoctorNote(r.id).then(onChange).catch((e) => Alert.alert('Not changed', errorText(e))).finally(() => setBusy(false));
  });
  return (
    <Card style={{ gap: 6, ...(r.endsOn < today ? PAST_STYLE : {}), ...(r.status === 'cancelled' ? { opacity: 0.5 } : {}) }}>
      <Text style={{ fontWeight: '800', color: C.ink }}>{first} · {describe(r)}</Text>
      <P muted>{reasonLabel(r.reason)}{r.note ? ` · ${r.note}` : ''}</P>
      <View style={[s.row, { alignItems: 'center' }]}>
        {r.status === 'cancelled' ? <Chip label="Called off" color={C.muted} />
          : r.seenAt ? <Chip label="✓ Seen by the office" color={GREEN} /> : <Chip label="Sent" color={C.primary} />}
        {open && r.endsOn >= today && (
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button"
            onPress={() => ask('Call this off?', `${first} · ${describe(r)}`, 'Call off',
              () => cancelAbsence(r.id).then(onChange).catch((e) => Alert.alert('Not changed', errorText(e))))}>Call off</Text>
        )}
      </View>
      {r.doctorNote ? (
        <View style={[s.row, { gap: 14, flexWrap: 'wrap', opacity: busy ? 0.5 : 1 }]}>
          <Pressable onPress={() => openNote(r.doctorNote!)} accessibilityRole="button" style={[s.row, { gap: 6 }]}>
            <Ionicons name="medkit" size={18} color={GREEN} />
            <Text style={{ color: GREEN, fontWeight: '800' }}>Doctor’s note · View</Text>
          </Pressable>
          {canAdd && <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => setChoosing(!choosing)}>Replace</Text>}
          {open && <Text style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button" onPress={busy ? undefined : remove}>Remove</Text>}
        </View>
      ) : canAdd && !choosing ? (
        <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => setChoosing(true)}>+ Add a doctor’s note</Text>
      ) : null}
      {choosing && canAdd && (
        <View style={{ gap: 6 }}>
          {busy ? <P muted>Uploading…</P> : <NoteChooser onPick={attach} />}
          {!busy && <Text style={{ color: C.muted, fontWeight: '700' }} accessibilityRole="button" onPress={() => setChoosing(false)}>Cancel</Text>}
        </View>
      )}
    </Card>
  );
}
