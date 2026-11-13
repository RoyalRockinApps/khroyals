/**
 * Study (students' Main Page): their own flash cards and class notes, private to them. On top, how many cards are due
 * now with a button to study them all; then Flash cards (their decks, each with how much is known) or Notes (search,
 * filter by class, newest first). `?tab=notes` opens on the notes.
 */
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, studyDecks, studyNotes, type StudyDeck, type StudyNoteSummary } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { GOLD, NAVY } from '../../src/sports/ui';
import { subjectColor } from '../../src/study/subjects';
import { AMBER, GREEN, KnownBar, StudyClosed, SubjectTag, changedLabel, dayLabel, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Input, Loading, P, s } from '../../src/ui';

type Tab = 'cards' | 'notes';
type Icon = ComponentProps<typeof Ionicons>['name'];

export default function Study() {
  const access = useStudyAccess();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'notes' ? 'notes' : 'cards');
  const [decks, setDecks] = useState<StudyDeck[] | null>(null);
  const [notes, setNotes] = useState<StudyNoteSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = access === 'open';

  const loadDecks = useCallback(() => studyDecks().then((d) => { setDecks(d); setError(null); }).catch((e) => setError(errorText(e))), []);
  useFocusEffect(useCallback(() => { if (open) loadDecks(); }, [open, loadDecks]));
  // Notes reload on coming back and as the search changes (a moment after typing stops).
  const [focus, setFocus] = useState(0);
  useFocusEffect(useCallback(() => { setFocus((n) => n + 1); }, []));
  useEffect(() => {
    if (!open) return;
    let on = true;
    const t = setTimeout(() => studyNotes(query).then((n) => on && setNotes(n)).catch((e) => on && setError(errorText(e))), query ? 300 : 0);
    return () => { on = false; clearTimeout(t); };
  }, [open, query, focus]);
  useEffect(() => { if (params.tab === 'notes' || params.tab === 'cards') setTab(params.tab); }, [params.tab]);

  const header = <Stack.Screen options={{ title: 'Study' }} />;
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;

  const due = (decks ?? []).reduce((n, d) => n + d.due, 0);
  const dueDecks = (decks ?? []).filter((d) => d.due > 0).length;
  const nextDue = (decks ?? []).map((d) => d.nextDue).filter((x): x is string => !!x).sort()[0] ?? null;
  const noteSubjects = [...new Set((notes ?? []).map((n) => n.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const shownNotes = (notes ?? []).filter((n) => !subject || n.subject === subject);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Hero due={due} dueDecks={dueDecks} decks={decks} nextDue={nextDue} />

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
        {([['cards', 'albums', 'Flash cards', decks?.length], ['notes', 'document-text', 'Notes', notes && !query ? notes.length : undefined]] as [Tab, Icon, string, number | undefined][])
          .map(([key, icon, label, count]) => {
            const on = tab === key;
            return (
              <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999,
                  backgroundColor: on ? NAVY : 'transparent' }}>
                <Ionicons name={on ? icon : (`${icon}-outline` as Icon)} size={16} color={on ? GOLD : C.muted} />
                <Text style={{ fontWeight: '800', color: on ? '#fff' : C.muted }}>{label}{count ? ` (${count})` : ''}</Text>
              </Pressable>
            );
          })}
      </View>

      {error && <Card><P muted>{error}</P><Button label="Try again" kind="ghost" onPress={() => { setError(null); loadDecks(); setFocus((n) => n + 1); }} /></Card>}

      {tab === 'cards' ? (
        <>
          <Button label="+ New deck" onPress={() => router.push('/study/deck-form')} />
          {!decks ? <Loading /> : decks.length === 0 ? (
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>Make your first deck</Text>
              <P muted>A deck is a set of flash cards for one test or topic: vocabulary, dates, formulas. Type the cards in, paste a list, or make them from your notes.</P>
            </Card>
          ) : decks.map((d) => <DeckRow key={d.id} deck={d} />)}
        </>
      ) : (
        <>
          <Button label="+ New note" onPress={() => router.push('/study/note')} />
          <View style={[s.row, { gap: 8 }]}>
            <Ionicons name="search" size={18} color={C.muted} />
            <Input placeholder="Search your notes" value={query} onChangeText={setQuery} style={{ flex: 1 }} returnKeyType="search" autoCorrect={false} />
          </View>
          {noteSubjects.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {['', ...noteSubjects].map((x) => {
                const on = subject === x;
                const color = x ? subjectColor(x) : NAVY;
                return (
                  <Pressable key={x || 'all'} onPress={() => setSubject(x)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: on ? color : C.line,
                      backgroundColor: on ? `${color}18` : C.card }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: on ? color : C.ink }}>{x || 'All'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {!notes ? <Loading /> : shownNotes.length === 0 ? (
            <Card style={{ gap: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{query ? 'Nothing matches' : 'No notes yet'}</Text>
              <P muted>{query ? `No note has “${query.trim()}” in it.` : 'Keep your class notes here, filed by class. Write terms as “word - meaning” and they can become flash cards.'}</P>
            </Card>
          ) : shownNotes.map((n) => <NoteRow key={n.id} note={n} />)}
        </>
      )}
    </ScrollView>
  );
}

/** How many cards are due, with a button to study them all; or when the next ones come back. */
function Hero({ due, dueDecks, decks, nextDue }: { due: number; dueDecks: number; decks: StudyDeck[] | null; nextDue: string | null }) {
  const today = schoolToday();
  const none = !!decks && decks.every((d) => d.cards === 0);
  return (
    <View style={{ backgroundColor: NAVY, borderRadius: 20, padding: 18, gap: 12, overflow: 'hidden' }}>
      <Ionicons name="school" size={120} color="#ffffff10" style={{ position: 'absolute', right: -18, bottom: -26 }} />
      <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 }}>READY TO STUDY</Text>
      {!decks ? <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>…</Text> : due > 0 ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>{due}</Text>
            <Text style={{ color: '#DCE3F7', fontSize: 16, fontWeight: '700' }}>
              {due === 1 ? 'card' : 'cards'} due{dueDecks > 1 ? ` in ${dueDecks} decks` : ''}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/study/review')} accessibilityRole="button" accessibilityLabel={`Study ${due} cards now`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD,
              borderRadius: 14, paddingVertical: 13 }, pressed && { opacity: 0.85 }]}>
            <Ionicons name="play" size={18} color={NAVY} />
            <Text style={{ color: NAVY, fontWeight: '900', fontSize: 16 }}>Study now</Text>
          </Pressable>
        </>
      ) : (
        <View style={[s.row, { gap: 10 }]}>
          <Ionicons name={none ? 'sparkles' : 'checkmark-circle'} size={30} color={none ? GOLD : '#4ADE80'} />
          <Text style={{ flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 22 }}>
            {none ? 'Make a deck of flash cards, and the ones you need to study show up here each day.'
              : `All caught up!${nextDue ? ` More cards come back ${dayLabel(nextDue, today)}.` : ''}`}
          </Text>
        </View>
      )}
    </View>
  );
}

function DeckRow({ deck: d }: { deck: StudyDeck }) {
  const color = subjectColor(d.subject);
  return (
    <Pressable onPress={() => router.push({ pathname: '/study/deck/[id]', params: { id: d.id } })} accessibilityRole="button"
      accessibilityLabel={`${d.title}, ${d.cards} cards${d.due ? `, ${d.due} due` : ''}`}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }, pressed && { opacity: 0.85 }]}>
      <View style={[s.row, { gap: 12 }]}>
        <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="albums" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{d.title}</Text>
          <View style={[s.row, { gap: 8 }]}>
            <SubjectTag subject={d.subject} />
            <Text style={{ color: C.muted, fontSize: 13 }}>{d.cards === 1 ? '1 card' : `${d.cards} cards`}</Text>
          </View>
        </View>
        {d.due > 0 ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${AMBER}1F` }}>
            <Text style={{ color: AMBER, fontWeight: '900', fontSize: 13 }}>{d.due} due</Text>
          </View>
        ) : d.cards > 0 ? <Ionicons name="checkmark-circle" size={24} color={GREEN} /> : null}
      </View>
      {d.cards > 0 && <KnownBar cards={d.cards} known={d.known} fresh={d.fresh} />}
    </Pressable>
  );
}

function NoteRow({ note: n }: { note: StudyNoteSummary }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/study/note', params: { id: n.id } })} accessibilityRole="button"
      accessibilityLabel={n.title || 'Untitled note'}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6,
        borderLeftWidth: 5, borderLeftColor: subjectColor(n.subject) }, pressed && { opacity: 0.85 }]}>
      <View style={[s.row, { gap: 8 }]}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '800', color: n.title ? C.ink : C.muted }}>{n.title || 'Untitled'}</Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>{changedLabel(n.updatedAt)}</Text>
      </View>
      {!!n.preview && <Text numberOfLines={2} style={{ color: C.muted, lineHeight: 20 }}>{n.preview}</Text>}
      <SubjectTag subject={n.subject} />
    </Pressable>
  );
}
