/**
 * Handbook: the Student / Parent Handbook as its table of contents (src/handbook/handbook.ts). Each section is a row,
 * folded, that opens to its text; the parts are labels between them. Searching opens every section the text is in
 * (title or text), highlights it, dims the rest and scrolls to the first; a tap still folds or opens any section, until
 * the search changes. The cover's edition shows at the top, so readers know which version this is. Works signed out.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EDITION, HANDBOOK_SOURCE, SECTIONS, hits, pattern, type Section } from '../src/handbook/handbook';
import { CONTENT_MAX, C, Card, P, s } from '../src/ui';

const BLUE = '#0369A1';
const MARK = '#FDE68A';

type Row = { kind: 'part'; title: string } | { kind: 'section'; section: Section };

/** The table of contents: a label for each part, then its sections (no label for a part that is one section of its name). */
const ROWS: Row[] = SECTIONS.reduce<Row[]>((rows, section, i) => {
  const part = section.part;
  const alone = SECTIONS.filter((x) => x.part === part).length === 1 && part === section.title;
  if (part && part !== SECTIONS[i - 1]?.part && !alone) rows.push({ kind: 'part', title: part });
  rows.push({ kind: 'section', section });
  return rows;
}, []);

/** Text with every match of the search highlighted. */
function Marked({ text, re, style }: { text: string; re: RegExp | null; style: object }) {
  if (!re) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${re.source})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((part, i) => (i % 2 ? <Text key={i} style={{ backgroundColor: MARK, fontWeight: '700' }}>{part}</Text> : part))}
    </Text>
  );
}

export default function Handbook() {
  const [query, setQuery] = useState('');
  // Sections folded or opened by hand since the search last changed (the rest follow the search).
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const list = useRef<FlatList<Row>>(null);
  const jump = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (jump.current) clearTimeout(jump.current); }, []);

  const re = useMemo(() => pattern(query), [query]);
  const counts = useMemo(() => hits(SECTIONS, query), [query]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const isOpen = (x: Section) => manual[x.id] ?? (!!re && counts.has(x.id));
  const anyOpen = SECTIONS.some(isOpen);

  const scrollTo = (index: number) => list.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
  const search = (text: string) => {
    setQuery(text);
    setManual({});
    // Once typing pauses, bring the first section with a match into view.
    if (jump.current) clearTimeout(jump.current);
    jump.current = setTimeout(() => {
      const found = hits(SECTIONS, text);
      const first = ROWS.findIndex((r) => r.kind === 'section' && found.has(r.section.id));
      if (first >= 0) scrollTo(first);
    }, 600);
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: 'Handbook' }} />
      <View style={{ padding: 12, gap: 8, borderBottomWidth: 1, borderColor: C.line, backgroundColor: C.card }}>
        <View style={[s.row, s.input, { paddingVertical: 8, width: '100%', maxWidth: CONTENT_MAX - 32, alignSelf: 'center' }]}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput style={{ flex: 1, fontSize: 15, color: C.ink }} placeholder="Search the handbook" value={query} onChangeText={search}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="never" accessibilityLabel="Search the handbook" />
          {!!query && (
            <Pressable onPress={() => search('')} accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </Pressable>
          )}
        </View>
        <View style={[s.row, { justifyContent: 'space-between', width: '100%', maxWidth: CONTENT_MAX - 32, alignSelf: 'center' }]}>
          <Text style={{ color: C.muted }}>
            {!re ? `${SECTIONS.length} sections · tap one to read it`
              : total ? `${total} match${total === 1 ? '' : 'es'} in ${counts.size} section${counts.size === 1 ? '' : 's'}` : 'No matches'}
          </Text>
          {anyOpen && (
            <Text style={{ color: BLUE, fontWeight: '700' }} accessibilityRole="button"
              onPress={() => setManual(Object.fromEntries(SECTIONS.map((x) => [x.id, false])))}>Fold all</Text>
          )}
        </View>
      </View>

      <FlatList ref={list} data={ROWS} keyExtractor={(r, i) => (r.kind === 'section' ? r.section.id : `part-${i}`)}
        extraData={`${query}|${JSON.stringify(manual)}`}
        contentContainerStyle={[s.pad, { gap: 8 }]} keyboardShouldPersistTaps="handled" initialNumToRender={24}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
          setTimeout(() => scrollTo(index), 150);
        }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 4 }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="book" size={28} color={BLUE} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: C.ink }}>Student / Parent Handbook</Text>
                {!!EDITION && <Text style={{ color: C.muted, fontSize: 13 }}>{EDITION}</Text>}
                <Text style={{ color: BLUE, fontWeight: '600' }} onPress={() => Linking.openURL(HANDBOOK_SOURCE)}>Open the original PDF ↗</Text>
              </View>
            </Card>
            {!!re && !total && <Card><P muted>{`Nothing in the handbook matches "${query.trim()}". Try a shorter word, or ask the school.`}</P></Card>}
          </View>}
        renderItem={({ item }) => (item.kind === 'part'
          ? <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: BLUE, marginTop: 10 }}>{item.title.toUpperCase()}</Text>
          : <SectionRow section={item.section} open={isOpen(item.section)} count={counts.get(item.section.id) ?? 0} re={re}
              dim={!!re && !counts.has(item.section.id)}
              onToggle={() => setManual((m) => ({ ...m, [item.section.id]: !isOpen(item.section) }))} />)} />
    </View>
  );
}

/** A section of the table of contents: its title (with how many matches, and its page), folding open to its text. */
function SectionRow({ section, open, count, re, dim, onToggle }: {
  section: Section; open: boolean; count: number; re: RegExp | null; dim: boolean; onToggle: () => void;
}) {
  return (
    <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }, dim && { opacity: 0.5 }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${section.title}${count ? `, ${count} match${count === 1 ? '' : 'es'}` : ''}`}
        style={({ pressed }) => [s.row, { gap: 10, paddingHorizontal: 14, paddingVertical: 13 }, pressed && { backgroundColor: C.bg }]}>
        <View style={{ flex: 1 }}>
          <Marked text={section.title} re={re} style={{ fontSize: 16, fontWeight: '800', color: C.ink }} />
        </View>
        {count > 0 && (
          <View style={{ minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: MARK, alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 12 }}>{count}</Text>
          </View>
        )}
        <Text style={{ color: C.muted, fontSize: 12 }}>p. {section.page}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {open && (
        <View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          {section.blocks.map((b, i) => (
            <Marked key={i} text={b.text} re={re}
              style={b.kind === 'heading'
                ? { fontSize: 15, fontWeight: '800', color: C.primary, marginTop: i ? 6 : 0 }
                : { fontSize: 15, lineHeight: 22, color: C.ink }} />
          ))}
        </View>
      )}
    </View>
  );
}
