/**
 * Practice a deck (`?deck=`; from the deck's Practice button): a Quiz (pick the meaning out of four), Match (tap a
 * term, then its meaning, six pairs at a time) or Type it (write the answer; small typos count, with the spelling
 * shown). Quiz and Type it can show the meaning and ask for the term instead. It ends with the score and the cards
 * missed, which can be practiced again. Nothing is saved and the Leitner boxes don't move (src/study/practice.ts).
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { studyDeck, type StudyCard, type StudyDeck } from '../../src/api/connect';
import { GOLD, NAVY } from '../../src/sports/ui';
import {
  answerOf, checkTyped, cheer, choicesFor, matchRounds, modesFor, practiceCards, promptOf, scoreLine,
  type PracticeMode, type Showing, type TypedResult,
} from '../../src/study/practice';
import { shuffle } from '../../src/study/session';
import { GREEN, StudyClosed, oops, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Loading, P, PLACEHOLDER, s } from '../../src/ui';

const RED = '#DC2626';
const MODES: { key: PracticeMode; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }[] = [
  { key: 'quiz', icon: 'list', title: 'Quiz', sub: 'Pick the right answer out of four' },
  { key: 'match', icon: 'git-compare-outline', title: 'Match', sub: 'Tap a term, then its meaning' },
  { key: 'type', icon: 'create-outline', title: 'Type it', sub: 'Write the answer yourself' },
];

type Run =
  | { mode: 'quiz' | 'type'; showing: Showing; cards: StudyCard[]; choices: string[][]; at: number; right: number; missed: StudyCard[] }
  | { mode: 'match'; rounds: StudyCard[][]; round: number; meanings: StudyCard[]; done: string[]; mistakes: number; missed: StudyCard[]; startedAt: number };
type Result = { mode: PracticeMode; right: number; total: number; missed: StudyCard[]; seconds?: number; mistakes?: number };

export default function Practice() {
  const access = useStudyAccess();
  const { deck: deckId } = useLocalSearchParams<{ deck?: string }>();
  const [data, setData] = useState<{ deck: StudyDeck; cards: StudyCard[] } | null | undefined>(undefined);
  const [showing, setShowing] = useState<Showing>('term');
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // The question being answered: the choice picked, or what was typed and how it went.
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<TypedResult | null>(null);
  // Matching: the term picked and a wrong pair flashing red.
  const [left, setLeft] = useState<string | null>(null);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const open = access === 'open';

  useEffect(() => {
    if (!open || !deckId) { if (open) setData(null); return; }
    studyDeck(deckId).then((d) => setData(d ?? null)).catch((e) => { oops(e); setData(null); });
  }, [open, deckId]);
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => setWrong(null), 650);
    return () => clearTimeout(t);
  }, [wrong]);

  const header = <Stack.Screen options={{ title: data?.deck ? `Practice ${data.deck.title}` : 'Practice' }} />;
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;
  if (data === undefined) return <>{header}<Loading /></>;
  if (!data) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This deck isn't here anymore.</P></Card></View>;

  const modes = modesFor(data.cards);
  const fresh = () => { setPicked(null); setTyped(''); setChecked(null); setLeft(null); setWrong(null); };
  const start = (mode: PracticeMode, cards: StudyCard[] = data.cards) => {
    fresh();
    setResult(null);
    if (mode === 'match') {
      const rounds = matchRounds(cards);
      // Each round's meanings are shuffled once, when it starts.
      setRun({ mode, rounds, round: 0, meanings: shuffle(rounds[0] ?? []), done: [], mistakes: 0, missed: [], startedAt: Date.now() });
      return;
    }
    const picked = practiceCards(cards);
    setRun({ mode, showing, cards: picked, at: 0, right: 0, missed: [],
      choices: mode === 'quiz' ? picked.map((c) => choicesFor(c, data.cards, showing)) : [] });
  };

  // ---- Choosing a mode, and the score at the end ----
  if (!run) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        {header}
        {result && <Score result={result} onAgain={() => start(result.mode)} onMissed={() => start(result.mode, result.missed)} />}
        {!result && data.cards.length === 0 && <Card><P muted>Add some cards to this deck first.</P></Card>}
        {!result && data.cards.length > 0 && (
          <>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>
              {data.cards.length === 1 ? '1 CARD' : `${data.cards.length} CARDS`} · PRACTICE DOESN'T CHANGE WHAT'S DUE
            </Text>
            {MODES.map((m) => {
              const ok = modes.includes(m.key);
              return (
                <Pressable key={m.key} onPress={ok ? () => start(m.key) : undefined} disabled={!ok} accessibilityRole="button"
                  accessibilityLabel={`${m.title}: ${m.sub}`} accessibilityState={{ disabled: !ok }}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18,
                    borderWidth: 1, borderColor: C.line, padding: 16, opacity: ok ? 1 : 0.45 }, pressed && { opacity: 0.8 }]}>
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={m.icon} size={24} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: NAVY }}>{m.title}</Text>
                    <Text style={{ color: C.muted }}>{ok ? m.sub : 'Needs at least two different cards'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.muted} />
                </Pressable>
              );
            })}
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 6 }}>Quiz and Type it show</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
              {([['term', 'The term'], ['meaning', 'The meaning']] as [Showing, string][]).map(([key, label]) => (
                <Pressable key={key} onPress={() => setShowing(key)} accessibilityRole="radio" accessibilityState={{ selected: showing === key }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: showing === key ? NAVY : 'transparent' }}>
                  <Text style={{ fontWeight: '800', color: showing === key ? '#fff' : C.muted }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Button label="Back to the deck" kind="ghost" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  // ---- Matching ----
  if (run.mode === 'match') {
    const round = run.rounds[run.round];
    const tapRight = (c: StudyCard) => {
      if (!left || run.done.includes(c.id)) return;
      if (left === c.id) {
        const done = [...run.done, c.id];
        setLeft(null);
        if (round.every((x) => done.includes(x.id))) {
          if (run.round + 1 < run.rounds.length) { setRun({ ...run, round: run.round + 1, meanings: shuffle(run.rounds[run.round + 1]), done }); return; }
          const total = run.rounds.flat().length;
          setResult({ mode: 'match', right: total - run.missed.length, total, missed: run.missed, mistakes: run.mistakes,
            seconds: Math.round((Date.now() - run.startedAt) / 1000) });
          setRun(null);
          return;
        }
        setRun({ ...run, done });
      } else {
        const miss = round.find((x) => x.id === left)!;
        setWrong([left, c.id]);
        setLeft(null);
        setRun({ ...run, mistakes: run.mistakes + 1, missed: run.missed.some((x) => x.id === miss.id) ? run.missed : [...run.missed, miss] });
      }
    };
    const tile = (c: StudyCard, side: 'left' | 'right') => {
      const done = run.done.includes(c.id);
      const on = side === 'left' && left === c.id;
      const bad = wrong && (side === 'left' ? wrong[0] === c.id : wrong[1] === c.id);
      return (
        <Pressable key={`${side}:${c.id}`} disabled={done} onPress={() => (side === 'left' ? setLeft(on ? null : c.id) : tapRight(c))}
          accessibilityRole="button" accessibilityState={{ selected: on, disabled: done }}
          style={{ minHeight: 64, justifyContent: 'center', padding: 10, borderRadius: 14, borderWidth: 2,
            borderColor: bad ? RED : on ? GOLD : done ? 'transparent' : C.line,
            backgroundColor: done ? `${GREEN}22` : on ? NAVY : C.card, opacity: done ? 0.55 : 1 }}>
          <Text style={{ fontWeight: side === 'left' ? '800' : '600', color: on ? '#fff' : done ? GREEN : C.ink, fontSize: 14 }} numberOfLines={5}>
            {side === 'left' ? c.front : c.back}
          </Text>
        </Pressable>
      );
    };
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        {header}
        <Progress label={`Round ${run.round + 1} of ${run.rounds.length}`} at={run.done.length} total={run.rounds.flat().length}
          extra={run.mistakes ? `${run.mistakes} ${run.mistakes === 1 ? 'miss' : 'misses'}` : undefined} />
        <P muted>{left ? 'Now tap its meaning.' : 'Tap a term, then its meaning.'}</P>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 8 }}>{round.map((c) => tile(c, 'left'))}</View>
          <View style={{ flex: 1.3, gap: 8 }}>{run.meanings.map((c) => tile(c, 'right'))}</View>
        </View>
        <Button label="Stop" kind="ghost" onPress={() => setRun(null)} />
      </ScrollView>
    );
  }

  // ---- Quiz and Type it ----
  const card = run.cards[run.at];
  const answer = answerOf(card, run.showing);
  const next = (gotIt: boolean) => {
    const r = { ...run, right: run.right + (gotIt ? 1 : 0), missed: gotIt ? run.missed : [...run.missed, card] };
    fresh();
    if (run.at + 1 >= run.cards.length) {
      setResult({ mode: run.mode, right: r.right, total: run.cards.length, missed: r.missed });
      setRun(null);
    } else setRun({ ...r, at: run.at + 1 });
  };
  const answered = run.mode === 'quiz' ? picked !== null : checked !== null;
  const gotIt = run.mode === 'quiz' ? picked === answer : checked === 'right' || checked === 'almost';
  const check = () => { if (typed.trim()) setChecked(checkTyped(typed, answer)); };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Progress label={`Question ${run.at + 1} of ${run.cards.length}`} at={run.at} total={run.cards.length}
          extra={`${run.right} right`} />
        <View style={{ backgroundColor: NAVY, borderRadius: 20, padding: 22, minHeight: 130, justifyContent: 'center', gap: 8 }}>
          <Text style={{ color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>
            {run.showing === 'term' ? 'WHAT DOES THIS MEAN?' : 'WHAT IS THE TERM?'}
          </Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{promptOf(card, run.showing)}</Text>
        </View>

        {run.mode === 'quiz' ? run.choices[run.at].map((c) => {
          const isRight = c === answer;
          const mine = picked === c;
          const tint = !answered ? C.line : isRight ? GREEN : mine ? RED : C.line;
          return (
            <Pressable key={c} disabled={answered} onPress={() => setPicked(c)} accessibilityRole="button"
              accessibilityLabel={`${c}${answered && isRight ? ', the right answer' : answered && mine ? ', your answer, wrong' : ''}`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 2,
                borderColor: tint, backgroundColor: answered && isRight ? `${GREEN}18` : answered && mine ? `${RED}12` : C.card },
              pressed && { opacity: 0.8 }]}>
              <Text style={{ flex: 1, color: C.ink, fontSize: 16, fontWeight: '600' }}>{c}</Text>
              {answered && isRight && <Ionicons name="checkmark-circle" size={22} color={GREEN} />}
              {answered && mine && !isRight && <Ionicons name="close-circle" size={22} color={RED} />}
            </Pressable>
          );
        }) : (
          <View style={{ gap: 10 }}>
            <TextInput key={run.at} value={typed} onChangeText={(t) => { setTyped(t); if (checked) setChecked(null); }} editable={!answered}
              placeholder={run.showing === 'term' ? 'Its meaning' : 'The term'} placeholderTextColor={PLACEHOLDER} autoFocus
              autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={check} accessibilityLabel="Your answer"
              style={[s.input, { fontSize: 18 }]} />
            {answered && (
              <Card style={{ gap: 4, borderColor: gotIt ? GREEN : RED, borderWidth: 2 }}>
                <Text style={{ fontWeight: '900', color: gotIt ? GREEN : RED }}>
                  {checked === 'right' ? 'Right!' : checked === 'almost' ? 'Right, but check the spelling:' : 'Not quite. The answer:'}
                </Text>
                {checked !== 'right' && <Text style={{ fontSize: 17, color: C.ink, fontWeight: '700' }}>{answer}</Text>}
                {checked === 'wrong' && (
                  <Text style={{ color: C.primary, fontWeight: '700', marginTop: 4 }} accessibilityRole="button" onPress={() => setChecked('almost')}>
                    I meant that: count it right
                  </Text>
                )}
              </Card>
            )}
            {!answered && <Button label="Check" disabled={!typed.trim()} onPress={check} />}
          </View>
        )}
        {answered && <Button label={run.at + 1 >= run.cards.length ? 'See my score' : 'Next'} onPress={() => next(gotIt)} />}
        <Button label="Stop" kind="ghost" onPress={() => { fresh(); setRun(null); }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Where the round stands: a label, a bar and an extra note (right so far, misses). */
function Progress({ label, at, total, extra }: { label: string; at: number; total: number; extra?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontWeight: '800', color: C.ink }}>{label}</Text>
        {!!extra && <Text style={{ fontWeight: '700', color: C.muted }}>{extra}</Text>}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
        <View style={{ width: `${total ? Math.round((at / total) * 100) : 0}%`, height: 8, backgroundColor: GOLD }} />
      </View>
    </View>
  );
}

/** The score, the cards missed, and ways to go again. */
function Score({ result, onAgain, onMissed }: { result: Result; onAgain: () => void; onMissed: () => void }) {
  const mins = result.seconds !== undefined ? `${Math.floor(result.seconds / 60)}:${String(result.seconds % 60).padStart(2, '0')}` : null;
  return (
    <>
      <View style={{ backgroundColor: NAVY, borderRadius: 20, padding: 22, alignItems: 'center', gap: 6 }}>
        <Ionicons name={result.right === result.total ? 'trophy' : 'ribbon'} size={40} color={GOLD} />
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{cheer(result.right, result.total)}</Text>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
          {result.mode === 'match' ? `${result.total} matched${mins ? ` in ${mins}` : ''} · ${result.mistakes ?? 0} ${(result.mistakes ?? 0) === 1 ? 'miss' : 'misses'}`
            : scoreLine(result.right, result.total)}
        </Text>
      </View>
      {result.missed.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>
            {result.missed.length === 1 ? '1 TO GO OVER' : `${result.missed.length} TO GO OVER`}
          </Text>
          {result.missed.map((c) => (
            <View key={c.id} style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10, borderLeftWidth: 4, borderLeftColor: RED }}>
              <Text style={{ fontWeight: '800', color: NAVY }}>{c.front}</Text>
              <Text style={{ color: C.muted }}>{c.back}</Text>
            </View>
          ))}
          <Button label="Practice the ones I missed" onPress={onMissed} />
        </View>
      )}
      <Button label="Go again" kind={result.missed.length ? 'ghost' : 'primary'} onPress={onAgain} />
    </>
  );
}
