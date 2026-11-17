/**
 * Tell Someone (a student's tile): first, what to do if someone is in danger right now (a teacher, 911, or 988 for
 * someone thinking about hurting themselves, each a tap away). Then the report: what it's about, what happened, where,
 * when and who, and whether to include their name (on to start; left off, the people who read reports don't see it).
 * Below, the student's own reports and where each stands. The readers are the Safety reports permission holders
 * (app/safety/reports.tsx).
 */
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, live, me as currentPerson, mySafetyReports, sendSafetyReport, session, type MySafetyReport, type Person } from '../../src/api/connect';
import { Heading } from '../../src/hub';
import { SAFETY_KINDS, STATUS_WORDS, isUrgent, kindLabel, type SafetyKind } from '../../src/safety/kinds';
import { NAVY } from '../../src/sports/ui';
import { Button, C, Card, Field, H, Loading, P, PLACEHOLDER, s } from '../../src/ui';

const RED = '#B42318';
const GREEN = '#15803D';
type Form = { kind: SafetyKind | null; what: string; place: string; when: string; people: string; named: boolean };
const EMPTY: Form = { kind: null, what: '', place: '', when: '', people: '', named: true };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function TellSomeone() {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const [mine, setMine] = useState<MySafetyReport[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [sent, setSent] = useState<SafetyKind | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const p = live ? await session().catch(() => null) : currentPerson();
    setMe(p);
    if (p?.schoolRole === 'student') mySafetyReports().then(setMine).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Tell Someone' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!me || me.pending || me.schoolRole !== 'student') {
    return box(<Card><H>For students</H><P muted>Students tell the school here about bullying, someone who might be hurt, or something unsafe.</P></Card>);
  }
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const send = () => {
    if (!form.kind) return;
    setBusy(true);
    sendSafetyReport({ ...form, kind: form.kind })
      .then(() => { setSent(form.kind); setForm(EMPTY); load(); })
      .catch((e) => Alert.alert('Not sent', errorText(e))).finally(() => setBusy(false));
  };
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(() => Alert.alert('Call', `Call ${n} from a phone.`));
  const input = { minHeight: 110, fontSize: 16, lineHeight: 22, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line,
    padding: 12, textAlignVertical: 'top' } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: '#FEF3F2', borderRadius: 18, borderWidth: 1, borderColor: '#FECDCA', padding: 14, gap: 8 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Ionicons name="alert-circle" size={22} color={RED} />
            <Text style={{ flex: 1, fontWeight: '900', color: RED, fontSize: 16 }}>Is someone in danger right now?</Text>
          </View>
          <Text style={{ color: C.ink }}>Tell a teacher or another adult right away, or call 911. If someone is thinking about hurting themselves, call or text 988.</Text>
          <View style={[s.row, { gap: 8 }]}>
            <Pressable onPress={() => call('911')} accessibilityRole="button" accessibilityLabel="Call 911"
              style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: RED }, pressed && { opacity: 0.85 }]}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Call 911</Text>
            </Pressable>
            <Pressable onPress={() => call('988')} accessibilityRole="button" accessibilityLabel="Call 988"
              style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: NAVY }, pressed && { opacity: 0.85 }]}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Call 988</Text>
            </Pressable>
          </View>
        </View>

        {sent ? (
          <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 20 }}>
            <Ionicons name="checkmark-circle" size={42} color={GREEN} />
            <Text style={{ fontSize: 18, fontWeight: '900', color: C.ink, textAlign: 'center' }}>Thank you for telling someone</Text>
            <P muted>{isUrgent(sent) ? 'The school has been told right away. If they might be in danger right now, also tell a teacher now.'
              : 'The school has been told. You’ll see here when someone has read it.'}</P>
            <Button label="Tell something else" kind="ghost" onPress={() => setSent(null)} />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <H>Tell the school</H>
            <P muted>About something that's happening to you or someone else. It goes to the people at school who handle these.</P>
            <Text style={{ fontWeight: '800', color: C.ink }}>What is it about?</Text>
            <View style={{ gap: 6 }}>
              {SAFETY_KINDS.map((k) => {
                const on = form.kind === k.key;
                return (
                  <Pressable key={k.key} onPress={() => set({ kind: k.key })} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 2,
                      borderColor: on ? NAVY : C.line, backgroundColor: on ? `${NAVY}0D` : C.card }}>
                    <Ionicons name={k.icon} size={20} color={on ? NAVY : C.muted} />
                    <Text style={{ flex: 1, fontWeight: on ? '800' : '600', color: C.ink }}>{k.label}</Text>
                    {on && <Ionicons name="checkmark-circle" size={20} color={NAVY} />}
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontWeight: '800', color: C.ink }}>What happened?</Text>
            <TextInput value={form.what} onChangeText={(what) => set({ what })} multiline maxLength={2000} style={input} accessibilityLabel="What happened"
              placeholder="Tell us in your own words." placeholderTextColor={PLACEHOLDER} />
            <Field label="Where (optional)" placeholder="Hallway by the gym, the bus, online…" value={form.place} onChangeText={(place) => set({ place })} maxLength={200} />
            <Field label="When (optional)" placeholder="Today at lunch, every morning…" value={form.when} onChangeText={(when) => set({ when })} maxLength={120} />
            <Field label="Who's involved (optional)" placeholder="Names, or what they look like" value={form.people} onChangeText={(people) => set({ people })} maxLength={300} />
            <View style={[s.row, { gap: 10, paddingVertical: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>Include my name</Text>
                <Text style={{ color: C.muted }}>{form.named ? 'The people who read it see your name, so they can talk with you.'
                  : 'The people who read it won’t see your name. You’ll still see here when it’s been read.'}</Text>
              </View>
              <Switch value={form.named} onValueChange={(named) => set({ named })} accessibilityLabel="Include my name" />
            </View>
            <Button label={busy ? 'Sending…' : 'Send'} disabled={busy || !form.kind || !form.what.trim()} onPress={send} />
          </Card>
        )}

        {mine.length > 0 && <Heading text="YOUR REPORTS" />}
        {mine.map((r) => (
          <View key={r.id} style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, gap: 4 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{kindLabel(r.kind)}</Text>
              <Text style={{ color: r.status === 'new' ? C.muted : GREEN, fontWeight: '700' }}>{STATUS_WORDS[r.status]}</Text>
            </View>
            <Text style={{ color: C.muted }} numberOfLines={2}>{day(r.createdAt)} · {r.what}</Text>
            {!r.named && <Text style={{ color: C.muted, fontSize: 12 }}>Sent without your name</Text>}
          </View>
        ))}
        <Text style={{ color: C.primary, fontWeight: '700', textAlign: 'center' }} accessibilityRole="link" onPress={() => router.push('/teachers')}>
          Or message a teacher in Ask the Teacher ›
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
