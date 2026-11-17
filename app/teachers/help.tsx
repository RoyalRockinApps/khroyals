/**
 * Help sessions (Ask the Teacher → Help sessions; Classes → Help sessions for teachers). A student sees the sessions their
 * teachers offer for their classes, from today on, with the spots left, and books a spot (or gives it back) until one
 * starts; one called off after they booked stays, marked. A teacher offers sessions for the classes they lead (a name,
 * the classes, the day and time, the place, how many can come, what to bring), sees who booked, changes or calls one off
 * (the students booked are told); their past week's sessions wait behind Show past.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  bookHelpSession, cancelHelpSession, errorText, helpSessionsMine, isFamily, isSchoolStaff, live, me as currentPerson, mySections,
  saveHelpSession, session, type HelpSession, type HelpSessionInput, type Person, type Section,
} from '../../src/api/connect';
import { clock } from '../../src/absences/labels';
import { PAST_STYLE, PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { Band, GoldButton, Heading, Stat, Stats } from '../../src/hub';
import { GOLD, NAVY } from '../../src/sports/ui';
import { Button, C, Card, Chip, Field, H, Loading, P, PLACEHOLDER, ask, s } from '../../src/ui';

const GREEN = '#15803D';
const dayName = (d: string, today: string) => d === today ? 'Today'
  : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const oops = (e: unknown) => Alert.alert('Help sessions', errorText(e));

type Data = { me: Person | null; list: HelpSession[]; sections: Section[] };

export default function HelpSessions() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<HelpSessionInput | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const past = usePastToggle();
  const load = useCallback(async () => {
    try {
      const me = live ? await session() : currentPerson();
      const teacher = !!me && !me.pending && isSchoolStaff(me);
      const [list, sections] = await Promise.all([helpSessionsMine(), teacher ? mySections() : Promise.resolve([] as Section[])]);
      setData({ me, list, sections });
    } catch (e) { oops(e); setData((d) => d ?? { me: null, list: [], sections: [] }); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Help sessions' }} />;
  if (!data) return <>{header}<Loading /></>;
  const { me, list } = data;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!me || me.pending) return box(<Card><P muted>Sign in with an approved account to see help sessions.</P></Card>);
  const student = me.schoolRole === 'student';
  const teacher = isSchoolStaff(me);
  if ((!student && !teacher) || isFamily(me)) return box(<Card><H>For students and teachers</H><P muted>Teachers offer help sessions for their classes, and their students book a spot.</P></Card>);
  const today = schoolToday();

  const act = (id: string, run: () => Promise<unknown>) => { setBusy(id); run().then(load).catch(oops).finally(() => setBusy(null)); };

  // ---- A student ----
  if (student) {
    const open = list.filter((h) => !h.cancelled);
    const mine = open.filter((h) => h.booked);
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        {header}
        <Band>
          <Stats>
            <Stat n={open.length} label="Coming up" />
            <Stat n={mine.length} label="You're booked" />
          </Stats>
        </Band>
        <P muted>Extra help your teachers offer for your classes. Book a spot, and give it back if you can't come.</P>
        {list.length === 0 && <Card><P muted>No help sessions coming up for your classes yet.</P></Card>}
        {list.map((h) => {
          const left = Math.max(0, h.spots - h.taken);
          return (
            <SessionCard key={h.id} h={h} today={today}>
              {h.cancelled ? <Text style={{ color: C.danger, fontWeight: '800' }}>Called off</Text> : h.booked ? (
                <View style={{ gap: 6 }}>
                  <View style={[s.row, { gap: 6 }]}>
                    <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                    <Text style={{ color: GREEN, fontWeight: '800', flex: 1 }}>You're booked</Text>
                  </View>
                  {!h.started && <Button kind="ghost" label={busy === h.id ? 'Working on it…' : 'Give my spot back'} disabled={!!busy}
                    onPress={() => ask('Give your spot back?', `${h.title}, ${dayName(h.day, today)}.`, 'Give it back', () => act(h.id, () => bookHelpSession(h.id, false)))} />}
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: left ? C.muted : C.danger, fontWeight: '700' }}>{left ? `${left} of ${h.spots} spots left` : 'Full'}</Text>
                  {!!left && !h.started && <Button label={busy === h.id ? 'Booking…' : 'Book a spot'} disabled={!!busy} onPress={() => act(h.id, () => bookHelpSession(h.id))} />}
                </View>
              )}
            </SessionCard>
          );
        })}
      </ScrollView>
    );
  }

  // ---- A teacher ----
  const isPast = (h: HelpSession) => h.day < today || (h.day === today && h.started);
  const ahead = list.filter((h) => !isPast(h));
  const gone = list.filter(isPast);
  const booked = ahead.filter((h) => !h.cancelled).reduce((n, h) => n + h.taken, 0);
  const startNew = () => setForm({ title: '', details: '', day: plus(today, 1), startTime: '15:15', endTime: '16:00', place: '', spots: 8,
    sections: data.sections.length === 1 ? [data.sections[0].id] : [] });
  const set = (p: Partial<HelpSessionInput>) => setForm((f) => (f ? { ...f, ...p } : f));
  const save = () => {
    if (!form) return;
    setBusy('form');
    saveHelpSession(form).then(() => { setForm(null); load(); }).catch(oops).finally(() => setBusy(null));
  };
  const valid = !!form && form.title.trim() && form.sections.length > 0 && form.endTime > form.startTime && form.spots > 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Band>
        <Stats>
          <Stat n={ahead.filter((h) => !h.cancelled).length} label="Coming up" />
          <Stat n={booked} label="Spots booked" />
        </Stats>
        {data.sections.length > 0 && !form && <GoldButton icon="add" label="Offer a help session" onPress={startNew} />}
      </Band>
      {data.sections.length === 0 && <Card><P muted>Help sessions are for the classes you lead. Once the office sets yours up, you can offer them here.</P></Card>}
      {form && (
        <Card style={{ gap: 10, borderColor: NAVY, borderWidth: 2 }}>
          <H>{form.id ? 'Change help session' : 'New help session'}</H>
          <Field label="Name" placeholder="Algebra help" value={form.title} onChangeText={(title) => set({ title })} maxLength={80} />
          <Text style={{ fontWeight: '700', color: C.ink }}>For</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
            {data.sections.map((sec) => {
              const on = form.sections.includes(sec.id);
              return (
                <Pressable key={sec.id} onPress={() => set({ sections: on ? form.sections.filter((x) => x !== sec.id) : [...form.sections, sec.id] })}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? NAVY : C.line,
                    backgroundColor: on ? NAVY : '#fff' }}>
                  <Text style={{ color: on ? '#fff' : C.ink, fontWeight: '700' }}>{sec.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <DateField label="Day" value={form.day} onChange={(day) => set({ day })} min={today} />
          <View style={s.row}>
            <TimeField label="Starts" value={form.startTime} onChange={(startTime) => set({ startTime })} style={{ flex: 1 }} />
            <TimeField label="Ends" value={form.endTime} onChange={(endTime) => set({ endTime })} style={{ flex: 1 }} />
          </View>
          <Field label="Where" placeholder="Room 204" value={form.place} onChangeText={(place) => set({ place })} maxLength={80} />
          <Field label="How many students can come" keyboardType="number-pad" value={String(form.spots || '')}
            onChangeText={(t) => set({ spots: Number(t.replace(/\D/g, '')) || 0 })} />
          <Text style={{ fontWeight: '700', color: C.ink }}>Details (optional)</Text>
          <TextInput value={form.details} onChangeText={(details) => set({ details })} multiline maxLength={1000} accessibilityLabel="Details"
            placeholder="What to bring, what you'll go over." placeholderTextColor={PLACEHOLDER}
            style={{ minHeight: 80, fontSize: 16, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, textAlignVertical: 'top' }} />
          {!form.id && <P muted>The students in those classes are told.</P>}
          <Button label={busy === 'form' ? 'Saving…' : form.id ? 'Save' : 'Offer it'} disabled={!valid || busy === 'form'} onPress={save} />
          <Button label="Cancel" kind="ghost" onPress={() => setForm(null)} />
        </Card>
      )}
      <Heading text="COMING UP" />
      {ahead.length === 0 && <Card><P muted>No help sessions coming up.</P></Card>}
      {ahead.map((h) => <TeacherCard key={h.id} h={h} today={today} busy={busy === h.id}
        onChange={() => setForm({ id: h.id, title: h.title, details: h.details, day: h.day, startTime: h.startTime, endTime: h.endTime, place: h.place,
          spots: h.spots, sections: h.sectionIds })}
        onCancel={() => ask('Call this help session off?', h.taken ? `The ${h.taken === 1 ? 'student' : `${h.taken} students`} booked will be told.` : h.title,
          'Call it off', () => act(h.id, () => cancelHelpSession(h.id)))} />)}
      <PastToggle count={gone.length} shown={past.shown} onToggle={past.toggle} noun="sessions" />
      {past.shown && gone.map((h) => <View key={h.id} style={PAST_STYLE}><TeacherCard h={h} today={today} /></View>)}
    </ScrollView>
  );
}

/** What, when, where and with whom; its classes and details, then what the viewer can do. */
function SessionCard({ h, today, children }: { h: HelpSession; today: string; children?: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8,
      borderLeftWidth: 5, borderLeftColor: h.cancelled ? C.muted : h.booked ? GREEN : GOLD, opacity: h.cancelled ? 0.65 : 1 }}>
      <Text style={{ fontSize: 17, fontWeight: '900', color: NAVY, textDecorationLine: h.cancelled ? 'line-through' : 'none' }}>{h.title}</Text>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="time-outline" size={16} color={C.muted} />
        <Text style={{ color: C.ink, fontWeight: '700', flex: 1 }}>{dayName(h.day, today)} · {clock(h.startTime)}–{clock(h.endTime)}</Text>
      </View>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="person-outline" size={16} color={C.muted} />
        <Text style={{ color: C.muted, flex: 1 }}>{[h.place, `with ${h.teacher}`].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>{h.classes.map((c) => <Chip key={c} label={c} />)}</View>
      {!!h.details && <P>{h.details}</P>}
      {children}
    </View>
  );
}

function TeacherCard({ h, today, busy, onChange, onCancel }: { h: HelpSession; today: string; busy?: boolean; onChange?: () => void; onCancel?: () => void }) {
  return (
    <SessionCard h={h} today={today}>
      <Text style={{ fontWeight: '800', color: C.ink }}>{h.taken} of {h.spots} booked</Text>
      {!!h.students?.length && <P muted>{h.students.join(', ')}</P>}
      {h.cancelled ? <Text style={{ color: C.danger, fontWeight: '800' }}>Called off</Text> : (onChange || onCancel) && !h.started && (
        <View style={[s.row, { gap: 16 }]}>
          {onChange && <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={onChange}>Change</Text>}
          {onCancel && <Text style={{ color: C.danger, fontWeight: '700', opacity: busy ? 0.5 : 1 }} accessibilityRole="button" onPress={busy ? undefined : onCancel}>Call it off</Text>}
        </View>
      )}
    </SessionCard>
  );
}
