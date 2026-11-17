/**
 * Counseling tools (College & Career → the gear; the Admin portal's tools in other apps; college.manage holders in an
 * authenticator-verified session). Requests: transcript requests, waiting ones first (soonest needed), each marked sent
 * with an optional note (the student and their parents are told). Students: the 9th–12th graders with their steps done
 * and requests waiting, each opening their plan. Dates: the tests (with registration deadlines), scholarships and
 * college events. Checklist: each grade's steps, in order.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  collegeDates, collegePlan, collegeStudents, deleteCollegeDate, deleteCollegeStep, errorText, live, markTranscriptSent, saveCollegeDate,
  saveCollegeStep, transcriptRequestsAll, type CollegeDate, type CollegeDateKind, type CollegeStep, type CollegeStudent, type TranscriptRequest,
} from '../../src/api/connect';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { DateCard, RequestCard, StepRow } from '../../src/college/parts';
import { GRADES, KIND_LABEL, splitDates } from '../../src/college/lists';
import { MfaGate } from '../../src/comms/MfaGate';
import { DateField } from '../../src/forms/DateTimeField';
import { Band, BandTabs, Heading, Stat, Stats } from '../../src/hub';
import { NAVY } from '../../src/sports/ui';
import { Button, C, Card, Field, H, Loading, P, PLACEHOLDER, ask, s } from '../../src/ui';

type Tab = 'requests' | 'students' | 'dates' | 'checklist';
const TABS: [Tab, string][] = [['requests', 'Requests'], ['students', 'Students'], ['dates', 'Dates'], ['checklist', 'Checklist']];
const oops = (e: unknown) => Alert.alert('College counseling', errorText(e));
const box = { minHeight: 70, fontSize: 16, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12,
  textAlignVertical: 'top' } as const;

export default function Counsel() {
  return (
    <>
      <Stack.Screen options={{ title: 'College counseling' }} />
      {live ? <MfaGate>{() => <Tools />}</MfaGate> : <Tools />}
    </>
  );
}

type Data = { requests: TranscriptRequest[]; students: CollegeStudent[]; dates: CollegeDate[]; steps: CollegeStep[] };

function Tools() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.some(([k]) => k === params.tab) ? params.tab as Tab : 'requests');
  const [data, setData] = useState<Data | null>(null);
  const [sending, setSending] = useState<{ id: string; note: string } | null>(null);
  const [dateForm, setDateForm] = useState<(Omit<CollegeDate, 'id'> & { id: string | null }) | null>(null);
  const [stepForm, setStepForm] = useState<{ id: string | null; grade: number; title: string; details: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const past = usePastToggle();
  const load = useCallback(async () => {
    try {
      const [requests, students, dates, plan] = await Promise.all([transcriptRequestsAll(), collegeStudents(), collegeDates(), collegePlan(null)]);
      setData({ requests, students, dates, steps: plan?.steps ?? [] });
    } catch (e) { oops(e); setData((d) => d ?? { requests: [], students: [], dates: [], steps: [] }); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!data) return <Loading />;

  const today = schoolToday();
  const waiting = data.requests.filter((r) => r.status === 'requested');
  const handled = data.requests.filter((r) => r.status !== 'requested');
  const { ahead, past: gone } = splitDates(data.dates, today);
  const run = (p: Promise<unknown>, after?: () => void) => { setBusy(true); p.then(() => { after?.(); load(); }).catch(oops).finally(() => setBusy(false)); };
  const setD = (p: Partial<NonNullable<typeof dateForm>>) => setDateForm((f) => (f ? { ...f, ...p } : f));
  const setS = (p: Partial<NonNullable<typeof stepForm>>) => setStepForm((f) => (f ? { ...f, ...p } : f));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Band>
        <Stats>
          <Stat n={waiting.length} label="Transcripts waiting" alert={waiting.length > 0} />
          <Stat n={data.students.length} label="9th–12th graders" />
          <Stat n={ahead.length} label="Dates coming up" />
        </Stats>
        <BandTabs tabs={TABS} value={tab} onChange={setTab} />
      </Band>

      {tab === 'requests' && (
        <>
          <Heading text={`WAITING (${waiting.length})`} />
          {waiting.length === 0 && <Card><P muted>No transcript requests waiting.</P></Card>}
          {waiting.map((r) => (
            <RequestCard key={r.id} r={r}>
              {sending?.id === r.id ? (
                <View style={{ gap: 8 }}>
                  <TextInput value={sending.note} onChangeText={(note) => setSending({ id: r.id, note })} multiline maxLength={500} style={box}
                    accessibilityLabel="Note for the student" placeholder="Sent through Parchment on Nov 18." placeholderTextColor={PLACEHOLDER} />
                  <Button label={busy ? 'Saving…' : 'Mark sent and tell them'} disabled={busy}
                    onPress={() => run(markTranscriptSent(r.id, sending.note), () => setSending(null))} />
                  <Button label="Cancel" kind="ghost" onPress={() => setSending(null)} />
                </View>
              ) : <Button label="Mark sent" onPress={() => setSending({ id: r.id, note: '' })} />}
            </RequestCard>
          ))}
          {handled.length > 0 && <Heading text="THE LAST 60 DAYS" />}
          {handled.map((r) => <RequestCard key={r.id} r={r} />)}
        </>
      )}

      {tab === 'students' && (
        <>
          {data.students.length === 0 && <Card><P muted>No 9th to 12th graders yet.</P></Card>}
          {data.students.map((x) => (
            <Pressable key={x.id} onPress={() => router.push({ pathname: '/college', params: { student: x.id } })} accessibilityRole="button"
              style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.85 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>{x.name}</Text>
                <Text style={{ color: C.muted }}>{x.grade}th grade · {x.done} {x.done === 1 ? 'step' : 'steps'} done{x.waiting ? ` · ${x.waiting} waiting` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
        </>
      )}

      {tab === 'dates' && (
        <>
          {!dateForm && <Button label="+ Add a test, scholarship or event"
            onPress={() => setDateForm({ id: null, kind: 'test', title: '', day: today, registerBy: null, link: '', details: '' })} />}
          {dateForm && (
            <Card style={{ gap: 10, borderColor: NAVY, borderWidth: 2 }}>
              <H>{dateForm.id ? 'Change' : 'New'} {KIND_LABEL[dateForm.kind].toLowerCase()}</H>
              <View style={[s.row, { gap: 6 }]}>
                {(Object.keys(KIND_LABEL) as CollegeDateKind[]).map((k) => (
                  <Pressable key={k} onPress={() => setD({ kind: k, registerBy: k === 'test' ? dateForm.registerBy : null })} accessibilityRole="radio"
                    accessibilityState={{ selected: dateForm.kind === k }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: dateForm.kind === k ? NAVY : C.bg, borderWidth: 1, borderColor: C.line }}>
                    <Text style={{ fontWeight: '800', color: dateForm.kind === k ? '#fff' : C.ink }}>{KIND_LABEL[k]}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Name" placeholder={dateForm.kind === 'test' ? 'ACT' : dateForm.kind === 'scholarship' ? 'Rotary Club Scholarship' : 'College Fair'}
                value={dateForm.title} onChangeText={(title) => setD({ title })} maxLength={120} />
              <DateField label={dateForm.kind === 'scholarship' ? 'Deadline' : 'Day'} value={dateForm.day} onChange={(day) => setD({ day })} />
              {dateForm.kind === 'test' && <DateField label="Register by (optional)" value={dateForm.registerBy ?? ''} onChange={(d) => setD({ registerBy: d || null })} optional />}
              <Field label="Link (optional)" placeholder="https://" value={dateForm.link ?? ''} onChangeText={(link) => setD({ link })} autoCapitalize="none" maxLength={500} />
              <Text style={{ fontWeight: '700', color: C.ink }}>Details (optional)</Text>
              <TextInput value={dateForm.details} onChangeText={(details) => setD({ details })} multiline maxLength={1000} style={box} accessibilityLabel="Details" />
              <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !dateForm.title.trim() || !dateForm.day}
                onPress={() => run(saveCollegeDate({ ...dateForm, link: dateForm.link?.trim() || null }), () => setDateForm(null))} />
              {dateForm.id && <Button label="Remove it" kind="ghost"
                onPress={() => ask('Remove this date?', dateForm.title, 'Remove', () => run(deleteCollegeDate(dateForm.id!), () => setDateForm(null)))} />}
              <Button label="Cancel" kind="ghost" onPress={() => setDateForm(null)} />
            </Card>
          )}
          {ahead.map((d) => <DateCard key={d.id} d={d} today={today} onPress={() => setDateForm({ ...d, link: d.link ?? '' })} />)}
          <PastToggle count={gone.length} shown={past.shown} onToggle={past.toggle} noun="dates" />
          {past.shown && gone.map((d) => <View key={d.id} style={PAST_STYLE}><DateCard d={d} today={today} onPress={() => setDateForm({ ...d, link: d.link ?? '' })} /></View>)}
        </>
      )}

      {tab === 'checklist' && (
        <>
          <P muted>Each grade's steps, in order. Students check them off; their parents and you see how far they've come.</P>
          {stepForm && (
            <Card style={{ gap: 10, borderColor: NAVY, borderWidth: 2 }}>
              <H>{stepForm.id ? 'Change step' : 'New step'}</H>
              <View style={[s.row, { gap: 6 }]}>
                {GRADES.map((g) => (
                  <Pressable key={g} onPress={() => setS({ grade: g })} accessibilityRole="radio" accessibilityState={{ selected: stepForm.grade === g }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: stepForm.grade === g ? NAVY : C.bg, borderWidth: 1, borderColor: C.line }}>
                    <Text style={{ fontWeight: '800', color: stepForm.grade === g ? '#fff' : C.ink }}>{g}th</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="What to do" placeholder="Visit colleges" value={stepForm.title} onChangeText={(title) => setS({ title })} maxLength={120} />
              <Text style={{ fontWeight: '700', color: C.ink }}>More about it (optional)</Text>
              <TextInput value={stepForm.details} onChangeText={(details) => setS({ details })} multiline maxLength={500} style={box} accessibilityLabel="More about it" />
              <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !stepForm.title.trim()} onPress={() => run(saveCollegeStep(stepForm), () => setStepForm(null))} />
              {stepForm.id && <Button label="Remove it" kind="ghost"
                onPress={() => ask('Remove this step?', 'Students who checked it off lose that check.', 'Remove', () => run(deleteCollegeStep(stepForm.id!), () => setStepForm(null)))} />}
              <Button label="Cancel" kind="ghost" onPress={() => setStepForm(null)} />
            </Card>
          )}
          {GRADES.map((g) => (
            <View key={g} style={{ gap: 4 }}>
              <View style={[s.row, { gap: 8 }]}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: NAVY }}>{g}TH GRADE</Text>
                <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => setStepForm({ id: null, grade: g, title: '', details: '' })}>+ Add</Text>
              </View>
              <Card style={{ gap: 0, paddingVertical: 6 }}>
                {data.steps.filter((x) => x.grade === g).map((st) => (
                  <StepRow key={st.id} step={{ ...st, doneAt: null }} onPress={() => setStepForm({ id: st.id, grade: st.grade, title: st.title, details: st.details })} />
                ))}
                {!data.steps.some((x) => x.grade === g) && <P muted>No steps yet.</P>}
              </Card>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
