/**
 * Add cards to a deck (`?deck=`): one at a time (the front, then the back; each is saved as it's added and the front
 * is ready for the next), or a list with a "term - meaning" line per card, pasted or read from a text or CSV file
 * (src/study/pickCardFile.ts) into the box, where the student checks it before adding.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addStudyCards, studyDecks, type CardText, type StudyDeck } from '../../src/api/connect';
import { GOLD, NAVY } from '../../src/sports/ui';
import { MOST_AT_ONCE, parseCards } from '../../src/study/parse';
import { pickCardFile } from '../../src/study/pickCardFile';
import { GREEN, StudyClosed, oops, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Loading, P, PLACEHOLDER, s } from '../../src/ui';

type Mode = 'one' | 'list';

export default function AddCards() {
  const access = useStudyAccess();
  const { deck: deckId } = useLocalSearchParams<{ deck?: string }>();
  const [deck, setDeck] = useState<StudyDeck | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('one');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [list, setList] = useState('');
  const [added, setAdded] = useState<CardText[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const frontBox = useRef<TextInput>(null);
  const backBox = useRef<TextInput>(null);
  const open = access === 'open';

  useEffect(() => {
    if (!open) return;
    if (!deckId) { setDeck(null); return; }
    studyDecks().then((d) => setDeck(d.find((x) => x.id === deckId) ?? null)).catch((e) => { oops(e); setDeck(null); });
  }, [open, deckId]);

  const header = <Stack.Screen options={{ title: deck ? `Add to ${deck.title}` : 'Add cards' }} />;
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;
  if (deck === undefined) return <>{header}<Loading /></>;
  if (!deck) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This deck isn't here anymore.</P></Card></View>;

  const room = Math.max(0, 500 - deck.cards - added.length);
  const parsed = parseCards(list);
  const addOne = () => {
    const card = { front: front.trim(), back: back.trim() };
    if (!card.front || !card.back) return;
    setBusy(true);
    addStudyCards(deck.id, [card]).then(() => {
      setAdded((a) => [card, ...a]);
      setFront('');
      setBack('');
      frontBox.current?.focus();
    }).catch(oops).finally(() => setBusy(false));
  };
  const fromFile = () => pickCardFile().then((f) => {
    if (!f) return;
    if (!parseCards(f.text).length) {
      Alert.alert('No cards found in that file', 'Put each term and its meaning on one line ("term - meaning"), or in the first two columns of a spreadsheet saved as CSV.');
      return;
    }
    setList((l) => (l.trim() ? `${l.trim()}\n${f.text}` : f.text));
    setFileName(f.name);
  }).catch(oops);
  const addList = () => {
    const cards = parsed.slice(0, MOST_AT_ONCE);
    setBusy(true);
    addStudyCards(deck.id, cards).then(() => { setAdded((a) => [...cards].reverse().concat(a)); setList(''); setFileName(null); })
      .catch(oops).finally(() => setBusy(false));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
          {([['one', 'One at a time'], ['list', 'A list or file']] as [Mode, string][]).map(([key, label]) => (
            <Pressable key={key} onPress={() => setMode(key)} accessibilityRole="tab" accessibilityState={{ selected: mode === key }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: mode === key ? NAVY : 'transparent' }}>
              <Text style={{ fontWeight: '800', color: mode === key ? '#fff' : C.muted }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'one' ? (
          <Card style={{ gap: 12 }}>
            <Labeled label="Front">
              <TextInput ref={frontBox} placeholder="A term or a question" placeholderTextColor={PLACEHOLDER} accessibilityLabel="Front"
                value={front} onChangeText={setFront} maxLength={500} multiline autoFocus blurOnSubmit returnKeyType="next"
                onSubmitEditing={() => backBox.current?.focus()} style={s.input} />
            </Labeled>
            <Labeled label="Back">
              <TextInput ref={backBox} placeholder="Its meaning or the answer" placeholderTextColor={PLACEHOLDER} accessibilityLabel="Back"
                value={back} onChangeText={setBack} maxLength={1000} multiline blurOnSubmit returnKeyType="done" onSubmitEditing={addOne}
                style={s.input} />
            </Labeled>
            <Button label={busy ? 'Adding…' : 'Add card'} disabled={busy || !front.trim() || !back.trim() || room === 0} onPress={addOne} />
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <P muted>One card per line: the term, then a dash, a colon or an equals sign, then its meaning. Copying a two-column list works too.</P>
            <Button kind="ghost" label="Choose a file" onPress={fromFile} disabled={busy} />
            <P muted>{fileName ? `From ${fileName}: check the cards below, then add them.`
              : 'A text file with a card per line, or a spreadsheet saved as CSV: the term in the first column, its meaning in the second.'}</P>
            <TextInput value={list} onChangeText={(t) => { setList(t); if (!t) setFileName(null); }} multiline textAlignVertical="top" autoFocus accessibilityLabel="Cards, one per line"
              placeholder={'la manzana - the apple\nel pan - the bread\nla leche - the milk'} placeholderTextColor={PLACEHOLDER}
              style={{ minHeight: 200, fontSize: 16, lineHeight: 23, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12 }} />
            <Text style={{ fontWeight: '700', color: parsed.length ? GREEN : C.muted }}>
              {parsed.length ? `${parsed.length === 1 ? '1 card' : `${parsed.length} cards`} found` : 'No cards found yet'}
              {parsed.length > MOST_AT_ONCE ? ` (the first ${MOST_AT_ONCE} go in now)` : ''}
            </Text>
            <Button label={busy ? 'Adding…' : !parsed.length ? 'Add cards' : parsed.length === 1 ? 'Add 1 card' : `Add ${Math.min(parsed.length, MOST_AT_ONCE)} cards`}
              disabled={busy || !parsed.length || parsed.length > room} onPress={addList} />
            {parsed.length > room && <P muted>{`This deck has room for ${room} more (500 in a deck). Start another deck for the rest.`}</P>}
          </Card>
        )}

        {added.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={[s.row, { gap: 6 }]}>
              <Ionicons name="checkmark-circle" size={18} color={GREEN} />
              <Text style={{ fontWeight: '800', color: C.ink }}>{added.length === 1 ? 'Added 1 card' : `Added ${added.length} cards`}</Text>
            </View>
            {added.slice(0, 30).map((c, i) => (
              <View key={`${i}:${c.front}`} style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10,
                borderLeftWidth: 4, borderLeftColor: GOLD }}>
                <Text style={{ fontWeight: '800', color: NAVY }}>{c.front}</Text>
                <Text style={{ color: C.muted }}>{c.back}</Text>
              </View>
            ))}
          </View>
        )}
        <Button label="Done" kind={added.length ? 'primary' : 'ghost'} onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{label}</Text>
      {children}
    </View>
  );
}
