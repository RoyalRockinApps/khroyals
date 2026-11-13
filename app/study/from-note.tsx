/**
 * Flash cards from a note (`?note=`): every "term - meaning" line in it, each ticked, to go in a new deck named after
 * the note or one of the student's decks.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addStudyCards, saveStudyDeck, studyDecks, studyNote, type CardText, type StudyDeck, type StudyNote } from '../../src/api/connect';
import { NAVY } from '../../src/sports/ui';
import { MOST_AT_ONCE, parseCards } from '../../src/study/parse';
import { StudyClosed, SubjectTag, oops, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function FromNote() {
  const access = useStudyAccess();
  const { note: noteId } = useLocalSearchParams<{ note?: string }>();
  const [note, setNote] = useState<StudyNote | null | undefined>(undefined);
  const [decks, setDecks] = useState<StudyDeck[]>([]);
  const [cards, setCards] = useState<CardText[]>([]);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<string>('new');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const open = access === 'open';

  useEffect(() => {
    if (!open || !noteId) { if (!noteId) setNote(null); return; }
    Promise.all([studyNote(noteId), studyDecks()]).then(([n, d]) => {
      setNote(n);
      setDecks(d);
      if (n) { setCards(parseCards(n.body)); setTitle(n.title || 'Flash cards'); }
    }).catch((e) => { oops(e); setNote(null); });
  }, [open, noteId]);

  const header = <Stack.Screen options={{ title: 'Make flash cards' }} />;
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;
  if (note === undefined) return <>{header}<Loading /></>;
  if (!note) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This note isn't here anymore.</P></Card></View>;

  const chosen = cards.filter((_, i) => !off.has(i)).slice(0, MOST_AT_ONCE);
  const toggle = (i: number) => setOff((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const make = async () => {
    setBusy(true);
    try {
      const deck = target === 'new' ? await saveStudyDeck({ title, subject: note.subject, noteId: note.id }) : target;
      await addStudyCards(deck, chosen);
      router.replace({ pathname: '/study/deck/[id]', params: { id: deck } });
    } catch (e) { oops(e); } finally { setBusy(false); }
  };

  if (!cards.length) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        {header}
        <Card style={{ gap: 8 }}>
          <H>No terms found yet</H>
          <P muted>Write each term and its meaning on its own line, split by a dash, a colon or an equals sign:</P>
          <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 4 }}>
            {['Photosynthesis - how plants make food from light', 'la manzana: the apple', 'Area of a circle = πr²'].map((x) => (
              <Text key={x} style={{ color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{x}</Text>
            ))}
          </View>
          <Button label="Back to the note" kind="ghost" onPress={() => router.back()} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>
        {cards.length === 1 ? '1 CARD' : `${cards.length} CARDS`} FROM “{(note.title || 'your note').toUpperCase()}”
      </Text>
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
        {cards.map((c, i) => {
          const on = !off.has(i);
          return (
            <Pressable key={i} onPress={() => toggle(i)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.front}: ${c.back}`}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.line, opacity: on ? 1 : 0.5 }}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? C.primary : C.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '800', color: NAVY }}>{c.front}</Text>
                <Text style={{ color: C.muted }}>{c.back}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ gap: 10 }}>
        <H>Put them in</H>
        {[{ id: 'new', title: 'A new deck', subject: note.subject }, ...decks].map((d) => {
          const on = target === d.id;
          return (
            <Pressable key={d.id} onPress={() => setTarget(d.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={[s.row, { gap: 10, paddingVertical: 4 }]}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.primary : C.muted} />
              <Text style={{ flex: 1, fontWeight: on ? '800' : '600', color: C.ink }}>{d.title}</Text>
              <SubjectTag subject={d.subject} />
            </Pressable>
          );
        })}
        {target === 'new' && <Field label="Deck name" value={title} onChangeText={setTitle} maxLength={80} />}
      </Card>

      <Button label={busy ? 'Making…' : chosen.length === 1 ? 'Make 1 flash card' : `Make ${chosen.length} flash cards`}
        disabled={busy || !chosen.length || (target === 'new' && !title.trim())} onPress={make} />
      {cards.length > MOST_AT_ONCE && <P muted>{`The first ${MOST_AT_ONCE} go in now; make the rest the same way after.`}</P>}
    </ScrollView>
  );
}
