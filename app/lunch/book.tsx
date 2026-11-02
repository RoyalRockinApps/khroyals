/**
 * Book a lunch visit: who's coming, the allergy notes for that lunch (your child's own, and the
 * allergies among the students at that lunch, never with names) and the school's lunch rules,
 * which the visitor must say they've read before booking.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { bookLunchVisit, errorText, lunchAllergyNotes, lunchRules } from '../../src/api/connect';
import { Pills } from '../../src/feedback/ui';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function BookLunch() {
  const { window: windowId, day, student, name, time } = useLocalSearchParams<{ window: string; day: string; student: string; name: string; time: string }>();
  const [notes, setNotes] = useState<{ own: string | null; others: string[] } | null>(null);
  const [rules, setRules] = useState('');
  const [guests, setGuests] = useState<'0' | '1' | '2' | '3'>('0');
  const [note, setNote] = useState('');
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([lunchAllergyNotes(windowId, student), lunchRules()])
      .then(([n, r]) => { setNotes(n); setRules(r); })
      .catch((e) => { Alert.alert('Lunch visits', errorText(e)); setNotes({ own: null, others: [] }); });
  }, [windowId, student]);

  const header = <Stack.Screen options={{ title: 'Lunch visit' }} />;
  if (!notes) return <>{header}<Loading /></>;
  const when = new Date(`${day}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const book = () => {
    setBusy(true);
    bookLunchVisit({ windowId, day, studentId: student, guests: Number(guests), note, readAllergies: read })
      .then(() => { router.back(); Alert.alert('See you at lunch!', `${when}, ${name}. Check in at the front office when you arrive.`); })
      .catch((e) => Alert.alert('Not booked', errorText(e)))
      .finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card>
        <H>{when}</H>
        <P>{name} · {time}</P>
      </Card>
      <Card style={{ gap: 8, borderColor: C.danger }}>
        <H>⚠️ Allergies at this lunch</H>
        {!!notes.own && <Text style={{ color: C.ink, fontWeight: '700' }}>Your child: {notes.own}</Text>}
        {notes.others.length > 0
          ? (<><P>Students at this lunch are allergic to:</P>
              {notes.others.map((a) => <Text key={a} style={{ color: C.ink }}>• {a}</Text>)}</>)
          : <P muted>No allergies are on file for students at this lunch.</P>}
        <P muted>Please don’t bring or share food with these, and keep what you bring to your child and you.</P>
      </Card>
      {!!rules && (
        <Card style={{ gap: 6 }}>
          <H>Lunch visit rules</H>
          <P>{rules}</P>
        </Card>
      )}
      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>Guests coming with you</Text>
        <Pills options={(['0', '1', '2', '3'] as const).map((k) => ({ key: k, label: k === '0' ? 'Just me' : `+${k}` }))} value={guests} onChange={setGuests} />
        <Field label="Note for the school (optional)" value={note} onChangeText={setNote} maxLength={300} placeholder="Grandma is coming with me" />
        <View style={[s.row, { alignItems: 'center', gap: 10 }]}>
          <Switch value={read} onValueChange={setRead} trackColor={{ true: C.primary }} accessibilityLabel="I've read the allergy notes and lunch rules" />
          <Text style={{ flex: 1, color: C.ink }}>I’ve read the allergy notes and lunch rules{Number(guests) ? ', and will share them with my guests' : ''}.</Text>
        </View>
      </Card>
      <Button label={busy ? 'Booking…' : 'Book the visit'} onPress={book} disabled={busy || !read} />
    </ScrollView>
  );
}
