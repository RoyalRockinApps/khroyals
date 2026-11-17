/**
 * College & Career (a 9th–12th grader's tile; parents reach their child's from the Student app with `?child=`, and
 * counselors any student's with `?student=` from the counseling tools). Three tabs (`?tab=`): Checklist (each grade's
 * steps, the student's own grade first, checked off by the student), Dates (the school's tests with their registration
 * deadlines, scholarships and college events still to come; past ones behind Show past) and Transcripts (the student asks
 * for one to go to a college, and sees it waiting, sent or called off). Parents and counselors read; only the student
 * checks off and asks. Counselors get the gear: the counseling tools (app/college/counsel.tsx).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  cancelTranscriptRequest, checkCollegeStep, collegeDates, collegePlan, errorText, isFamily, live, me as currentPerson, myAccess, myChildren,
  requestTranscript, session, type CollegeDate, type CollegePlan, type Person, type TranscriptMethod,
} from '../../src/api/connect';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { DateCard, RequestCard, StepRow } from '../../src/college/parts';
import { METHOD_LABEL, gradeOrder, splitDates, stepsFor } from '../../src/college/lists';
import { mayHave } from '../../src/comms/mfa';
import { DateField } from '../../src/forms/DateTimeField';
import { Band, BandTabs, Stat, Stats } from '../../src/hub';
import { ManageButton } from '../../src/ManageButton';
import { NAVY } from '../../src/sports/ui';
import { Button, C, Card, Field, H, Loading, P, PLACEHOLDER, ask, s } from '../../src/ui';

type Tab = 'checklist' | 'dates' | 'transcripts';
const TABS: [Tab, string][] = [['checklist', 'Checklist'], ['dates', 'Dates'], ['transcripts', 'Transcripts']];
const oops = (e: unknown) => Alert.alert('College & Career', errorText(e));
type Data = { me: Person | null; plan: CollegePlan | null; dates: CollegeDate[]; kids: Person[]; counselor: boolean };

export default function College() {
  const params = useLocalSearchParams<{ tab?: string; child?: string; student?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.some(([k]) => k === params.tab) ? params.tab as Tab : 'checklist');
  const [data, setData] = useState<Data | null>(null);
  const [kid, setKid] = useState<string | null>(params.child ?? null);
  const [open, setOpen] = useState<number | null>(null);   // a grade opened besides the student's own
  const [form, setForm] = useState<{ sendTo: string; method: TranscriptMethod; address: string; neededBy: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const past = usePastToggle();
  useEffect(() => { if (params.tab && TABS.some(([k]) => k === params.tab)) setTab(params.tab as Tab); }, [params.tab]);

  const load = useCallback(async () => {
    try {
      const me = live ? await session() : currentPerson();
      const student = me?.schoolRole === 'student';
      const [access, kids] = await Promise.all([
        live && me && !student ? myAccess().catch(() => null) : Promise.resolve(null),
        live && me && !student && !isFamily(me) ? myChildren().catch(() => [] as Person[]) : Promise.resolve([] as Person[]),
      ]);
      const teens = kids.filter((k) => (k.grade ?? 0) >= 9 && (k.grade ?? 0) <= 12);
      const whose = params.student ?? (student ? null : kid ?? teens[0]?.id ?? null);
      const [plan, dates] = await Promise.all([
        whose || student || !live ? collegePlan(whose) : Promise.resolve(null), collegeDates(),
      ]);
      setData({ me, plan, dates, kids: teens, counselor: !live || mayHave(access, 'college.manage') });
    } catch (e) { oops(e); setData((d) => d ?? { me: null, plan: null, dates: [], kids: [], counselor: false }); }
  }, [kid, params.student]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const gear = data?.counselor
    ? () => <ManageButton app="College & Career" items={[{ icon: 'school-outline', label: 'Counseling tools', sub: 'Requests, students, dates, checklist', href: '/college/counsel' }]} />
    : undefined;
  const header = <Stack.Screen options={{ title: 'College & Career', headerRight: gear }} />;
  if (!data) return <>{header}<Loading /></>;
  const { me, plan, dates } = data;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!me || me.pending) return box(<Card><P muted>Sign in with an approved account to see College & Career.</P></Card>);
  const self = me.schoolRole === 'student' && plan?.student.id === me.id;
  if (me.schoolRole === 'student' && !((me.grade ?? 0) >= 9 && (me.grade ?? 0) <= 12)) {
    return box(<Card><H>For 9th to 12th graders</H><P muted>College & Career opens in 9th grade: a checklist for each year, test dates, scholarships and transcript requests.</P></Card>);
  }
  if (!plan && !data.counselor) return box(<Card><H>For high school students</H><P muted>Parents see their 9th to 12th grader's plan here.</P></Card>);

  const today = schoolToday();
  const { ahead, past: gone } = splitDates(dates, today);
  const waiting = plan?.requests.filter((r) => r.status === 'requested').length ?? 0;
  const grade = plan?.student.grade ?? null;
  const toggle = (id: string, done: boolean) => checkCollegeStep(id, done).then(load).catch(oops);
  const set = (p: Partial<NonNullable<typeof form>>) => setForm((f) => (f ? { ...f, ...p } : f));
  const send = () => {
    if (!form) return;
    setBusy(true);
    requestTranscript({ ...form, neededBy: form.neededBy || null }).then(() => { setForm(null); load(); }).catch(oops).finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      {data.kids.length > 1 && !params.student && (
        <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
          {data.kids.map((k) => (
            <Pressable key={k.id} onPress={() => { setKid(k.id); setData(null); }} accessibilityRole="radio" accessibilityState={{ selected: plan?.student.id === k.id }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: plan?.student.id === k.id ? NAVY : C.card, borderWidth: 1, borderColor: C.line }}>
              <Text style={{ fontWeight: '800', color: plan?.student.id === k.id ? '#fff' : C.ink }}>{k.firstName}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {plan && (
        <Band>
          {!self && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{plan.student.name}{grade ? ` · ${grade}th grade` : ''}</Text>}
          <Stats>
            <Stat n={stepsFor(plan.steps, grade ?? 9).done} label={`of ${stepsFor(plan.steps, grade ?? 9).steps.length} steps this year`} />
            <Stat n={ahead.length} label="Dates coming up" />
            <Stat n={waiting} label="Transcripts waiting" alert={waiting > 0} />
          </Stats>
          <BandTabs tabs={TABS} value={tab} onChange={setTab} />
        </Band>
      )}
      {!plan && <Card><P muted>Open a student's plan from the counseling tools (the gear).</P></Card>}

      {plan && tab === 'checklist' && gradeOrder(grade).map((g, i) => {
        const { steps, done } = stepsFor(plan.steps, g);
        const shown = i === 0 || open === g;
        return (
          <View key={g} style={{ gap: 4 }}>
            <Pressable onPress={i === 0 ? undefined : () => setOpen(open === g ? null : g)} disabled={i === 0} accessibilityRole={i === 0 ? 'header' : 'button'}
              accessibilityState={i === 0 ? undefined : { expanded: shown }} style={[s.row, { gap: 8, paddingVertical: 6 }]}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: i === 0 ? NAVY : C.muted }}>
                {`${g}TH GRADE${i === 0 && g === grade ? ' · THIS YEAR' : ''}`}
              </Text>
              <Text style={{ color: C.muted, fontWeight: '700' }}>{done} of {steps.length}</Text>
              {i > 0 && <Ionicons name={shown ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />}
            </Pressable>
            {shown && (
              <Card style={{ gap: 0, paddingVertical: 6 }}>
                {steps.length === 0 && <P muted>Nothing on this grade's list yet.</P>}
                {steps.map((st) => <StepRow key={st.id} step={st} onToggle={self ? () => toggle(st.id, !st.doneAt) : undefined} />)}
              </Card>
            )}
          </View>
        );
      })}
      {plan && tab === 'checklist' && !self && <P muted>Only {plan.student.firstName} checks steps off.</P>}

      {tab === 'dates' && (
        <>
          {ahead.length === 0 && <Card><P muted>No test dates, scholarships or college events coming up yet.</P></Card>}
          {ahead.map((d) => <DateCard key={d.id} d={d} today={today} />)}
          <PastToggle count={gone.length} shown={past.shown} onToggle={past.toggle} noun="dates" />
          {past.shown && gone.map((d) => <View key={d.id} style={PAST_STYLE}><DateCard d={d} today={today} /></View>)}
        </>
      )}

      {plan && tab === 'transcripts' && (
        <>
          {self && !form && <Button label="+ Request a transcript" onPress={() => setForm({ sendTo: '', method: 'portal', address: '', neededBy: '', note: '' })} />}
          {self && form && (
            <Card style={{ gap: 10, borderColor: NAVY, borderWidth: 2 }}>
              <H>Request a transcript</H>
              <Field label="Send it to" placeholder="University of Alabama" value={form.sendTo} onChangeText={(sendTo) => set({ sendTo })} maxLength={120} />
              <Text style={{ fontWeight: '700', color: C.ink }}>How</Text>
              <View style={{ gap: 6 }}>
                {(Object.keys(METHOD_LABEL) as TranscriptMethod[]).map((m) => (
                  <Pressable key={m} onPress={() => set({ method: m })} accessibilityRole="radio" accessibilityState={{ selected: form.method === m }}
                    style={[s.row, { gap: 8, paddingVertical: 4 }]}>
                    <Ionicons name={form.method === m ? 'radio-button-on' : 'radio-button-off'} size={20} color={NAVY} />
                    <Text style={{ color: C.ink, fontWeight: '600' }}>{METHOD_LABEL[m]}</Text>
                  </Pressable>
                ))}
              </View>
              {form.method !== 'portal' && (
                <Field label={form.method === 'email' ? 'Email address' : 'Mailing address'} value={form.address} onChangeText={(address) => set({ address })}
                  placeholder={form.method === 'email' ? 'admissions@college.edu' : 'Office of Admissions, …'} maxLength={300} />
              )}
              <DateField label="Needed by" value={form.neededBy} onChange={(neededBy) => set({ neededBy })} min={today} optional />
              <Text style={{ fontWeight: '700', color: C.ink }}>Note for the counselor (optional)</Text>
              <TextInput value={form.note} onChangeText={(note) => set({ note })} multiline maxLength={500} accessibilityLabel="Note for the counselor"
                placeholder="Early action deadline, a scholarship, …" placeholderTextColor={PLACEHOLDER}
                style={{ minHeight: 70, fontSize: 16, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, textAlignVertical: 'top' }} />
              <Button label={busy ? 'Sending…' : 'Send request'} onPress={send}
                disabled={busy || !form.sendTo.trim() || (form.method !== 'portal' && !form.address.trim())} />
              <Button label="Cancel" kind="ghost" onPress={() => setForm(null)} />
            </Card>
          )}
          {plan.requests.length === 0 && <Card><P muted>{self ? 'Ask for a transcript here, at least two weeks before the college\'s deadline.' : 'No transcript requests yet.'}</P></Card>}
          {plan.requests.map((r) => (
            <RequestCard key={r.id} r={r}>
              {self && r.status === 'requested' && (
                <Text style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button"
                  onPress={() => ask('Call off this request?', `Your transcript won't go to ${r.sendTo}.`, 'Call it off', () => cancelTranscriptRequest(r.id).then(load).catch(oops))}>
                  Call it off
                </Text>
              )}
            </RequestCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}
