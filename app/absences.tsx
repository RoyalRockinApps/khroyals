/**
 * Absences. Parents report that a child is out (one or several days), arriving late or leaving
 * early, with a reason, and see what they've reported (Cancel; "Seen by the office"). Teachers see
 * their students' reports and the office everyone's, a day at a time (‹ ›), and the office marks
 * each one seen. Someone who's both (a teacher with children here) gets both.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import {
  cancelAbsence, errorText, isFamily, isSchoolStaff, listAbsences, live, markAbsenceSeen, myAccess, myChildren, reportAbsence, session,
  type AbsenceReport, type Person,
} from '../src/api/connect';
import { KINDS, REASONS, describe, reasonLabel, type AbsenceKind, type AbsenceReason } from '../src/absences/labels';
import { schoolToday } from '../src/calendar/past';
import { DateField, TimeField } from '../src/forms/DateTimeField';
import { Pills } from '../src/feedback/ui';
import { addDays } from '../src/info/today';
import { Button, C, Card, Chip, Field, H, Loading, P, ask, s } from '../src/ui';

const dayLabel = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

export default function Absences() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [kids, setKids] = useState<Person[]>([]);
  const [office, setOffice] = useState(false);
  const [mine, setMine] = useState<AbsenceReport[]>([]);
  const [day, setDay] = useState(schoolToday());
  const [list, setList] = useState<AbsenceReport[] | null>(null);

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
      // A parent's own: from today, two months out.
      setMine(children.length ? (await listAbsences(schoolToday(), 60)).filter((r) => ids.has(r.studentId)) : []);
    } catch (e) { Alert.alert('Absences', errorText(e)); }
  }, []);
  const loadDay = useCallback((d: string) => { listAbsences(d, 1).then(setList).catch(() => setList([])); }, []);
  useFocusEffect(useCallback(() => { load(); loadDay(day); }, [load, loadDay, day]));

  const header = <Stack.Screen options={{ title: 'Absences' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me || me.pending) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Sign in to report an absence.</P></Card></View>;
  const staff = isSchoolStaff(me);
  const theirs = list ?? [];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {kids.length > 0 && <ReportForm kids={kids} onSent={() => { load(); loadDay(day); }} />}
      {mine.length > 0 && (
        <View style={{ gap: 8 }}>
          <H>What you’ve reported</H>
          {mine.map((r) => (
            <Card key={r.id} style={{ gap: 4, opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{r.student.split(' ')[0]} · {describe(r)}</Text>
              <P muted>{reasonLabel(r.reason)}{r.note ? ` · ${r.note}` : ''}</P>
              <View style={[s.row, { alignItems: 'center' }]}>
                {r.status === 'cancelled' ? <Chip label="Called off" color={C.muted} />
                  : r.seenAt ? <Chip label="✓ Seen by the office" color="#15803D" /> : <Chip label="Sent" color={C.primary} />}
                {r.status === 'reported' && (
                  <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button"
                    onPress={() => ask('Call this off?', `${r.student.split(' ')[0]} · ${describe(r)}`, 'Call off',
                      () => cancelAbsence(r.id).then(load).catch((e) => Alert.alert('Not changed', errorText(e))))}>Call off</Text>
                )}
              </View>
            </Card>
          ))}
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
                <View style={[s.row, { alignItems: 'center' }]}>
                  {r.status === 'cancelled' && <Chip label="Called off" color={C.muted} />}
                  {r.status === 'reported' && r.seenAt && <Chip label={`✓ Seen by ${r.seenBy}`} color="#15803D" />}
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
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    reportAbsence({ studentId: kid, kind, startsOn, endsOn: kind === 'absent' ? endsOn || null : null, at: kind === 'absent' ? null : at, reason, note })
      .then(() => { setNote(''); setEndsOn(''); setAt(''); Alert.alert('Sent', 'The office and the teachers know.'); onSent(); })
      .catch((e) => Alert.alert('Not sent', errorText(e)))
      .finally(() => setBusy(false));
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
      <Button label={busy ? 'Sending…' : 'Send to the school'} onPress={send} disabled={busy || !ok} />
      <P muted>The office and {kids.find((k) => k.id === kid)?.firstName ?? 'your child'}’s teachers see it right away.
        For leaving early, the office still checks them out when you arrive.</P>
    </Card>
  );
}
