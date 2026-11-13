/**
 * Studying flash cards. `?mode=study` (the default) goes through the cards due now, a deck's (`?deck=`) or every
 * deck's, shuffled: turn the card over, then Still learning (it comes round again, and back to box 1) or Got it (up a
 * box, back later); it ends when every card is known, with how many were known the first time. `?mode=flip` turns
 * through all of a deck's cards without recording anything. The header's button shows the back first.
 * On a computer: space turns the card, ← and → answer (or move, flipping through).
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dueStudyCards, reviewStudyCard, studyDeck, studyDecks, type StudyCard } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { GOLD, NAVY } from '../../src/sports/ui';
import { Flashcard } from '../../src/study/Flashcard';
import { answer, finished, shuffle, startSession, type StudySession } from '../../src/study/session';
import { GREEN, StudyClosed, oops, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

type Loaded = { cards: StudyCard[]; deckNames: Record<string, string>; title: string };

export default function Review() {
  const access = useStudyAccess();
  const params = useLocalSearchParams<{ deck?: string; mode?: string }>();
  const flipMode = params.mode === 'flip';
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [session, setSession] = useState<StudySession<StudyCard> | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [backFirst, setBackFirst] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [order, setOrder] = useState<StudyCard[]>([]);
  const open = access === 'open';

  useEffect(() => {
    if (!open) return;
    const today = schoolToday();
    (async () => {
      const decks = await studyDecks();
      const deckNames = Object.fromEntries(decks.map((d) => [d.id, d.title]));
      if (params.deck) {
        const d = await studyDeck(params.deck);
        if (!d) return null;
        const cards = flipMode ? d.cards : shuffle(d.cards.filter((c) => c.dueOn <= today));
        return { cards, deckNames, title: d.deck.title };
      }
      return { cards: shuffle(await dueStudyCards()), deckNames, title: 'All decks' };
    })().then((l) => {
      setLoaded(l);
      if (l) { setSession(startSession(l.cards)); setOrder(l.cards); }
    }).catch((e) => { oops(e); setLoaded(null); });
  }, [open, params.deck, flipMode]);

  const card = flipMode ? order[index] : session?.queue[0];
  const turn = useCallback(() => setFlipped((f) => !f), []);
  const reply = useCallback((knew: boolean) => {
    const c = session?.queue[0];
    if (!c || !flipped) return;
    reviewStudyCard(c.id, knew).catch(oops);
    setSession((x) => (x ? answer(x, knew) : x));
    setFlipped(false);
  }, [session, flipped]);
  const move = useCallback((by: number) => {
    setIndex((i) => Math.max(0, Math.min(order.length, i + by)));
    setFlipped(false);
  }, [order.length]);

  // Keys on a computer.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); turn(); }
      else if (e.key === 'ArrowLeft') flipMode ? move(-1) : reply(false);
      else if (e.key === 'ArrowRight') flipMode ? move(1) : reply(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [turn, reply, move, flipMode]);

  const header = (
    <Stack.Screen options={{
      title: flipMode ? 'Flip through' : 'Study',
      headerRight: () => (
        <Pressable onPress={() => { setBackFirst((b) => !b); setFlipped(false); }} hitSlop={10} accessibilityRole="switch"
          accessibilityState={{ checked: backFirst }} accessibilityLabel="Show the answer side first" style={{ marginRight: 8 }}>
          <Ionicons name="swap-horizontal" size={24} color={backFirst ? GOLD : '#fff'} />
        </Pressable>
      ),
    }} />
  );
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;
  if (loaded === undefined || (loaded && !session)) return <>{header}<Loading /></>;
  if (!loaded) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This deck isn't here anymore.</P></Card></View>;
  if (!loaded.cards.length) {
    return (
      <View style={[s.screen, s.pad]}>
        {header}
        <Card style={{ gap: 8, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={48} color={GREEN} />
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink }}>{flipMode ? 'No cards yet' : 'Nothing due right now'}</Text>
          <P muted>{flipMode ? 'Add cards to this deck first.' : 'Every card is studied for now. Come back when more are due.'}</P>
          <View style={{ alignSelf: 'stretch' }}><Button label="Done" onPress={() => router.back()} /></View>
        </Card>
      </View>
    );
  }

  const total = flipMode ? order.length : session!.total;
  const done = flipMode ? Math.min(index, total) : finished(session!);
  const deckLabel = loaded.title === 'All decks' && card ? loaded.deckNames[card.deckId] : undefined;
  const front = card ? (backFirst ? card.back : card.front) : '';
  const back = card ? (backFirst ? card.front : card.back) : '';

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 16 }]}>
      {header}
      <View style={{ gap: 6 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text numberOfLines={1} style={{ flex: 1, fontWeight: '800', color: NAVY }}>{loaded.title}</Text>
          <Text style={{ fontWeight: '800', color: C.muted }}>
            {flipMode ? `${Math.min(index + 1, total)} of ${total}` : `${done} of ${total} known`}
          </Text>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
          <View style={{ width: `${(100 * (flipMode ? Math.min(index + 1, total) : done)) / Math.max(1, total)}%`, height: 8, backgroundColor: GOLD }} />
        </View>
      </View>

      {card ? (
        <>
          <Flashcard key={`${card.id}:${backFirst}:${index}`} front={front} back={back} flipped={flipped} onFlip={turn}
            label={deckLabel ?? (backFirst ? 'Answer side' : 'Term')} />
          {flipMode ? (
            <View style={[s.row, { gap: 10 }]}>
              <RoundButton icon="chevron-back" label="Back" onPress={() => move(-1)} disabled={index === 0} />
              <View style={{ flex: 1 }}><Button label={flipped ? 'Show the front' : 'Turn it over'} kind="ghost" onPress={turn} /></View>
              <RoundButton icon="chevron-forward" label="Next" onPress={() => move(1)} />
            </View>
          ) : !flipped ? (
            <Button label="Show the answer" onPress={turn} />
          ) : (
            <View style={[s.row, { gap: 10 }]}>
              <AnswerButton icon="refresh" label="Still learning" color={C.danger} onPress={() => reply(false)} />
              <AnswerButton icon="checkmark" label="Got it" color={GREEN} onPress={() => reply(true)} />
            </View>
          )}
          {flipMode && (
            <Pressable onPress={() => { const next = !shuffled; setShuffled(next); setOrder(next ? shuffle(loaded.cards) : loaded.cards); setIndex(0); setFlipped(false); }}
              accessibilityRole="switch" accessibilityState={{ checked: shuffled }} style={[s.row, { gap: 6, alignSelf: 'center', padding: 6 }]}>
              <Ionicons name="shuffle" size={18} color={shuffled ? C.primary : C.muted} />
              <Text style={{ color: shuffled ? C.primary : C.muted, fontWeight: '700' }}>{shuffled ? 'Shuffled' : 'Shuffle'}</Text>
            </Pressable>
          )}
          {!flipMode && session!.missed.includes(card.id) && (
            <Text style={{ textAlign: 'center', color: C.muted }}>You missed this one earlier. Try it again.</Text>
          )}
        </>
      ) : flipMode ? (
        <Card style={{ gap: 10, alignItems: 'center' }}>
          <Ionicons name="albums" size={44} color={NAVY} />
          <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink }}>{total === 1 ? 'That was the card' : `That's all ${total} cards`}</Text>
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <Button label="Start again" kind="ghost" onPress={() => { setIndex(0); setFlipped(false); }} />
            <Button label="Done" onPress={() => router.back()} />
          </View>
        </Card>
      ) : (
        <Summary session={session!} />
      )}
    </ScrollView>
  );
}

function Summary({ session }: { session: StudySession<StudyCard> }) {
  const first = session.firstTry.length;
  const all = first === session.total;
  return (
    <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 24 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: all ? `${GREEN}22` : `${GOLD}33`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={all ? 'trophy' : 'ribbon'} size={44} color={all ? GREEN : '#B45309'} />
      </View>
      <Text style={{ fontSize: 24, fontWeight: '900', color: NAVY }}>{all ? 'Perfect!' : 'Nice work!'}</Text>
      <Text style={{ fontSize: 16, color: C.ink, textAlign: 'center' }}>
        {`You knew ${first} of ${session.total} ${session.total === 1 ? 'card' : 'cards'} the first time.`}
      </Text>
      <P muted>
        {session.missed.length
          ? `The ${session.missed.length === 1 ? 'one' : `${session.missed.length}`} you missed ${session.missed.length === 1 ? 'comes' : 'come'} back tomorrow. The others come back further apart each time you know them.`
          : 'Each card comes back further apart every time you know it.'}
      </P>
      <View style={{ alignSelf: 'stretch' }}><Button label="Done" onPress={() => router.back()} /></View>
    </Card>
  );
}

function AnswerButton({ icon, label, color, onPress }: { icon: 'refresh' | 'checkmark'; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 15,
        borderRadius: 14, backgroundColor: `${color}14`, borderWidth: 2, borderColor: color }, pressed && { opacity: 0.75 }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ color, fontWeight: '900', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

function RoundButton({ icon, label, onPress, disabled }: { icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ width: 52, height: 52, borderRadius: 26, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
        disabled && { opacity: 0.3 }, pressed && { opacity: 0.75 }]}>
      <Ionicons name={icon} size={24} color="#fff" />
    </Pressable>
  );
}
