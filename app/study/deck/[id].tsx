/**
 * A deck of flash cards: how much of it is known, Study (the cards due now) and Flip through (all of them, nothing
 * recorded), then its cards (tap one to change or delete it). The gear renames the deck, starts it over or deletes it.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteStudyCard, deleteStudyDeck, editStudyCard, errorText, resetStudyDeck, studyDeck, type StudyCard, type StudyDeck,
} from '../../../src/api/connect';
import { schoolToday } from '../../../src/calendar/past';
import { ManageButton } from '../../../src/ManageButton';
import { GOLD, NAVY } from '../../../src/sports/ui';
import { subjectColor } from '../../../src/study/subjects';
import { AMBER, GREEN, KnownBar, StudyClosed, SubjectTag, dayLabel, oops, useStudyAccess } from '../../../src/study/ui';
import { Button, C, Card, Loading, P, PLACEHOLDER, ask, s } from '../../../src/ui';

export default function DeckScreen() {
  const access = useStudyAccess();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ deck: StudyDeck; cards: StudyCard[] } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const open = access === 'open';

  const load = useCallback(() => studyDeck(id).then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e))), [id]);
  useFocusEffect(useCallback(() => { if (open) load(); }, [open, load]));

  const header = (title: string, deck?: StudyDeck) => (
    <Stack.Screen options={{
      title,
      headerRight: deck ? () => <ManageButton app="deck" items={[
        { icon: 'create-outline', label: 'Rename deck', sub: 'Its name and class', href: { pathname: '/study/deck-form', params: { id: deck.id } } },
        { icon: 'refresh', label: 'Start over', sub: 'Every card new again', onPress: () => ask('Start this deck over?',
          'Every card goes back to new, as if you had never studied it.', 'Start over', () => resetStudyDeck(deck.id).then(load).catch(oops)) },
        { icon: 'trash-outline', label: 'Delete deck', sub: `With its ${deck.cards === 1 ? 'card' : `${deck.cards} cards`}`, onPress: () => ask(
          'Delete this deck?', `“${deck.title}” and its cards go for good.`, 'Delete', () => deleteStudyDeck(deck.id).then(() => router.back()).catch(oops)) },
      ]} /> : undefined,
    }} />
  );
  if (access === 'loading') return <>{header('Deck')}<Loading /></>;
  if (access !== 'open') return <>{header('Deck')}<StudyClosed access={access} /></>;
  if (error) return <View style={[s.screen, s.pad]}>{header('Deck')}<Card><P muted>{error}</P><Button label="Try again" kind="ghost" onPress={load} /></Card></View>;
  if (data === undefined) return <>{header('Deck')}<Loading /></>;
  if (!data) return <View style={[s.screen, s.pad]}>{header('Deck')}<Card><P muted>This deck isn't here anymore.</P></Card></View>;

  const { deck, cards } = data;
  const learning = deck.cards - deck.known - deck.fresh;
  const today = schoolToday();
  const study = (mode: 'study' | 'flip') => router.push({ pathname: '/study/review', params: { deck: deck.id, mode } });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header(deck.title, deck)}
      <View style={{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12,
        borderTopWidth: 6, borderTopColor: subjectColor(deck.subject) }}>
        <View style={{ gap: 4 }}>
          <SubjectTag subject={deck.subject} />
          <Text style={{ fontSize: 24, fontWeight: '900', color: NAVY }}>{deck.title}</Text>
        </View>
        {deck.cards > 0 && (
          <>
            <KnownBar cards={deck.cards} known={deck.known} fresh={deck.fresh} height={12} />
            <View style={[s.row, { gap: 14, flexWrap: 'wrap' }]}>
              <Legend color={GREEN} label={`${deck.known} known`} />
              <Legend color={AMBER} label={`${learning} learning`} />
              <Legend color="#CBD5E1" label={`${deck.fresh} new`} />
            </View>
          </>
        )}
        {deck.cards === 0 ? <P muted>No cards yet. Add some to start studying.</P> : deck.due > 0 ? (
          <Pressable onPress={() => study('study')} accessibilityRole="button" accessibilityLabel={`Study ${deck.due} cards`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: NAVY,
              borderRadius: 14, paddingVertical: 14 }, pressed && { opacity: 0.85 }]}>
            <Ionicons name="play" size={18} color={GOLD} />
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{deck.due === 1 ? 'Study 1 card' : `Study ${deck.due} cards`}</Text>
          </Pressable>
        ) : (
          <View style={[s.row, { gap: 8 }]}>
            <Ionicons name="checkmark-circle" size={22} color={GREEN} />
            <Text style={{ flex: 1, color: C.ink, fontWeight: '700' }}>
              All caught up.{deck.nextDue ? ` The next cards come back ${dayLabel(deck.nextDue, today)}.` : ''}
            </Text>
          </View>
        )}
        {deck.cards > 0 && <Button label={`Flip through all ${deck.cards}`} kind="ghost" onPress={() => study('flip')} />}
      </View>

      <Button label="+ Add cards" onPress={() => router.push({ pathname: '/study/add', params: { deck: deck.id } })} />
      {deck.noteId && (
        <Pressable onPress={() => router.push({ pathname: '/study/note', params: { id: deck.noteId! } })} accessibilityRole="link"
          style={[s.row, { gap: 6, paddingVertical: 4 }]}>
          <Ionicons name="document-text-outline" size={16} color={C.primary} />
          <Text style={{ color: C.primary, fontWeight: '700' }}>Made from one of your notes ›</Text>
        </Pressable>
      )}

      {cards.length > 0 && (
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>
          {cards.length === 1 ? '1 CARD' : `${cards.length} CARDS`} · TAP ONE TO CHANGE IT
        </Text>
      )}
      {cards.map((c) => editing === c.id
        ? <CardEditor key={c.id} card={c} onDone={() => { setEditing(null); load(); }} />
        : <CardRow key={c.id} card={c} today={today} onPress={() => setEditing(c.id)} />)}
    </ScrollView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={[s.row, { gap: 6 }]}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </View>
  );
}

/** A card's front and back, with its box as five dots (filled up to where it is). */
function CardRow({ card: c, today, onPress }: { card: StudyCard; today: string; onPress: () => void }) {
  const due = c.dueOn <= today;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${c.front}: ${c.back}. ${c.reviewedAt ? `Box ${c.box} of 5` : 'New'}. Change`}
      style={({ pressed }) => [{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
        borderColor: C.line, padding: 12 }, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontWeight: '800', color: NAVY, fontSize: 15 }}>{c.front}</Text>
        <Text style={{ color: C.muted }} numberOfLines={3}>{c.back}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[1, 2, 3, 4, 5].map((b) => (
            <View key={b} style={{ width: 7, height: 7, borderRadius: 4,
              backgroundColor: c.reviewedAt && b <= c.box ? (c.box >= 4 ? GREEN : AMBER) : C.line }} />
          ))}
        </View>
        {due && c.reviewedAt && <Text style={{ color: AMBER, fontSize: 11, fontWeight: '800' }}>DUE</Text>}
        {!c.reviewedAt && <Text style={{ color: C.muted, fontSize: 11, fontWeight: '800' }}>NEW</Text>}
      </View>
    </Pressable>
  );
}

function CardEditor({ card, onDone }: { card: StudyCard; onDone: () => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    editStudyCard(card.id, front, back).then(onDone).catch(oops).finally(() => setBusy(false));
  };
  const remove = () => ask('Delete this card?', card.front, 'Delete', () => deleteStudyCard(card.id).then(onDone).catch(oops));
  const box = { fontSize: 15, color: C.ink, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 10 } as const;
  return (
    <Card style={{ gap: 8, borderColor: C.primary, borderWidth: 2 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted }}>FRONT</Text>
      <TextInput value={front} onChangeText={setFront} multiline maxLength={500} accessibilityLabel="Front" placeholderTextColor={PLACEHOLDER} style={box} />
      <Text style={{ fontSize: 12, fontWeight: '800', color: C.muted }}>BACK</Text>
      <TextInput value={back} onChangeText={setBack} multiline maxLength={1000} accessibilityLabel="Back" placeholderTextColor={PLACEHOLDER} style={box} />
      <View style={[s.row, { gap: 8, justifyContent: 'space-between' }]}>
        <Pressable onPress={remove} accessibilityRole="button" style={[s.row, { gap: 4, padding: 6 }]}>
          <Ionicons name="trash-outline" size={18} color={C.danger} />
          <Text style={{ color: C.danger, fontWeight: '700' }}>Delete</Text>
        </Pressable>
        <View style={[s.row, { gap: 8 }]}>
          <Button label="Cancel" kind="ghost" onPress={onDone} />
          <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !front.trim() || !back.trim()} onPress={save} />
        </View>
      </View>
    </Card>
  );
}
