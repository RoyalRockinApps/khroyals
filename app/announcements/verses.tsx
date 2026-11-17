/**
 * Daily verse (Announcements → Daily verse; the people who send announcements, push.send, in an authenticator-verified
 * session): the verse and thought for each day on students' Planner (src/devotion/VerseCard.tsx). Days ahead first,
 * then the last week's. Write one for a day (a reference, the verse, a thought for the day), change it or remove it.
 * Quote a translation the school may use (the King James Version is free to quote).
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dailyVerses, deleteDailyVerse, errorText, live, saveDailyVerse, type DailyVerse } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { MfaGate } from '../../src/comms/MfaGate';
import { DateField } from '../../src/forms/DateTimeField';
import { Heading } from '../../src/hub';
import { GOLD, NAVY } from '../../src/sports/ui';
import { Button, C, Card, Field, Loading, P, PLACEHOLDER, ask, s } from '../../src/ui';

export default function VersesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Daily verse' }} />
      {live ? <MfaGate>{() => <Verses />}</MfaGate> : <Verses />}
    </>
  );
}

const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The first weekday from today on without a verse. */
function nextOpenDay(list: DailyVerse[], today: string): string {
  for (let d = today, i = 0; i < 400; i++, d = plus(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6 && !list.some((v) => v.day === d)) return d;
  }
  return today;
}

function Verses() {
  const [list, setList] = useState<DailyVerse[] | null>(null);
  const [form, setForm] = useState<DailyVerse | null>(null);
  const [busy, setBusy] = useState(false);
  const today = schoolToday();
  const load = useCallback(() => dailyVerses().then(setList).catch((e) => Alert.alert('Daily verse', errorText(e))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!list) return <Loading />;

  const ahead = list.filter((v) => v.day >= today);
  const past = list.filter((v) => v.day < today).reverse();
  const set = (p: Partial<DailyVerse>) => setForm((f) => (f ? { ...f, ...p } : f));
  const save = () => {
    if (!form) return;
    setBusy(true);
    saveDailyVerse(form).then(() => { setForm(null); load(); }).catch((e) => Alert.alert('Not saved', errorText(e))).finally(() => setBusy(false));
  };
  const remove = (v: DailyVerse) => ask('Remove this verse?', `${dayName(v.day)}: ${v.reference}`, 'Remove',
    () => deleteDailyVerse(v.day).then(() => { setForm(null); load(); }).catch((e) => Alert.alert('Not removed', errorText(e))));
  const box = { minHeight: 90, fontSize: 16, lineHeight: 22, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, padding: 12, textAlignVertical: 'top' } as const;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <P muted>Students see the day's verse at the top of their Planner. On a weekend, or a day without one, they see the last one from the week.</P>
      {!form && <Button label="+ Add a verse" onPress={() => setForm({ day: nextOpenDay(list, today), reference: '', verse: '', thought: '' })} />}
      {form && (
        <Card style={{ gap: 10, borderColor: NAVY, borderWidth: 2 }}>
          <DateField label="Day" value={form.day} onChange={(day) => set({ day })} min={today} />
          {list.some((v) => v.day === form.day) && <P muted>This day has a verse; saving replaces it.</P>}
          <Field label="Reference" placeholder="Philippians 4:13" value={form.reference} onChangeText={(reference) => set({ reference })} maxLength={80} />
          <Text style={{ fontWeight: '700', color: C.ink }}>Verse</Text>
          <TextInput value={form.verse} onChangeText={(verse) => set({ verse })} multiline maxLength={800} accessibilityLabel="Verse"
            placeholder="I can do all things through Christ which strengtheneth me." placeholderTextColor={PLACEHOLDER} style={box} />
          <Text style={{ fontWeight: '700', color: C.ink }}>Thought for the day (optional)</Text>
          <TextInput value={form.thought} onChangeText={(thought) => set({ thought })} multiline maxLength={1500} accessibilityLabel="Thought for the day"
            placeholder="A few sentences for students to think about today." placeholderTextColor={PLACEHOLDER} style={[box, { minHeight: 120 }]} />
          <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !form.reference.trim() || !form.verse.trim()} onPress={save} />
          <Button label="Cancel" kind="ghost" onPress={() => setForm(null)} />
        </Card>
      )}
      <Heading text={`COMING UP${ahead.length ? ` (${ahead.length})` : ''}`} />
      {ahead.length === 0 && <Card><P muted>No verses written for today or the days ahead.</P></Card>}
      {ahead.map((v) => <VerseRow key={v.day} v={v} today={today} onEdit={() => setForm({ ...v })} onRemove={() => remove(v)} />)}
      {past.length > 0 && <Heading text="THE LAST WEEK" />}
      {past.map((v) => <VerseRow key={v.day} v={v} today={today} />)}
    </ScrollView>
  );
}

function VerseRow({ v, today, onEdit, onRemove }: { v: DailyVerse; today: string; onEdit?: () => void; onRemove?: () => void }) {
  return (
    <Pressable onPress={onEdit} disabled={!onEdit} accessibilityRole={onEdit ? 'button' : undefined}
      accessibilityLabel={`${dayName(v.day)}: ${v.reference}${onEdit ? '. Change it' : ''}`}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, gap: 4,
        borderLeftWidth: 4, borderLeftColor: v.day === today ? GOLD : NAVY, opacity: onEdit ? 1 : 0.6 }, pressed && { opacity: 0.8 }]}>
      <View style={[s.row, { gap: 8 }]}>
        <Text style={{ flex: 1, fontWeight: '800', color: NAVY }}>{v.day === today ? 'Today' : dayName(v.day)} · {v.reference}</Text>
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${v.reference}`}>
            <Ionicons name="trash-outline" size={18} color={C.muted} />
          </Pressable>
        )}
      </View>
      <Text style={{ color: C.ink, fontStyle: 'italic' }} numberOfLines={3}>“{v.verse}”</Text>
      {!!v.thought && <Text style={{ color: C.muted }} numberOfLines={2}>{v.thought}</Text>}
    </Pressable>
  );
}
