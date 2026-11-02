/**
 * One class on a student's record: its average and letter, a graph of the running average through this semester (or
 * the school year so far), how each category is doing, and every grade, newest first: score, percent and letter,
 * missing, excused or not graded yet, and the teacher's comment.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, studentCourse, type CourseAssignment, type CourseDetail } from '../../../src/api/connect';
import { schoolToday } from '../../../src/calendar/past';
import { average, counts, letterFor, percent, progress, termFor } from '../../../src/student/grades';
import { AMBER, LetterBadge, ProgressChart, SubjectIcon, letterColor } from '../../../src/student/parts';
import { Button, C, Card, H, Loading, P, s, useBottomInset } from '../../../src/ui';

type Range = 'term' | 'year';
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const num = (n: number) => String(Math.round(n * 100) / 100);

export default function Course() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('term');
  const bottom = useBottomInset();
  const load = useCallback(() => studentCourse(id).then((d) => { setC(d); setError(null); }).catch((e) => setError(errorText(e))), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: c?.name ?? 'Class' }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<Card><H>Couldn't load the class</H><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!c) return <>{header}<Loading /></>;

  const today = schoolToday();
  const term = termFor(c.terms, today);
  const yearStart = c.terms.length ? [...c.terms].sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0].startsOn : null;
  const from = range === 'term' ? term?.startsOn ?? null : yearStart;
  const to = range === 'term' ? term?.endsOn ?? null : null;
  const inRange = (a: CourseAssignment) => (!from || a.dueOn >= from) && (!to || a.dueOn <= to);
  const points = progress(c.assignments, c.categories, from, to);
  const yearAvg = average(c.assignments, c.categories, yearStart);
  // The class's own average (from the school's system) for the term; worked out here for the year.
  const shown = range === 'term' ? c.average ?? average(c.assignments, c.categories, from, to) : yearAvg;
  const letter = range === 'term' ? c.letter ?? letterFor(shown, c.scale) : letterFor(shown, c.scale);
  const list = c.assignments.filter(inRange).reverse();

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 24 + bottom, gap: 14 }]}>
      {header}
      <View style={[s.card, { padding: 16, gap: 14 }]}>
        <View style={s.row}>
          <SubjectIcon subject={c.subject} name={c.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: C.ink }}>{c.name}</Text>
            {!!c.teacher && <Text style={{ color: C.muted, fontWeight: '600' }}>{c.teacher}</Text>}
          </View>
        </View>
        <View style={[s.row, { gap: 14, padding: 14, borderRadius: 14, backgroundColor: letterColor(letter) + '0F' }]}>
          <LetterBadge letter={letter} size="large" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 30, fontWeight: '900', color: C.ink }}>{percent(shown)}</Text>
            <Text style={{ color: C.muted, fontWeight: '700' }}>{range === 'term' ? `${term?.name ?? 'Current'} average` : 'School year so far'}</Text>
          </View>
        </View>
        <View style={[s.row, { gap: 6 }]}>
          {([['term', term?.name ?? 'This term'], ['year', 'Year to date']] as [Range, string][]).map(([k, label]) => (
            <Text key={k} onPress={() => setRange(k)} accessibilityRole="button" accessibilityState={{ selected: range === k }}
              style={{ flex: 1, textAlign: 'center', paddingVertical: 8, borderRadius: 999, overflow: 'hidden', fontWeight: '700',
                borderWidth: 1, borderColor: range === k ? C.primary : C.line, backgroundColor: range === k ? C.primary : C.card, color: range === k ? '#fff' : C.ink }}>
              {label}
            </Text>
          ))}
        </View>
        {points.length ? (
          <>
            <ProgressChart points={points} scale={c.scale} />
            <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>The average after each graded assignment. Tap the graph for a day's average.</Text>
          </>
        ) : <P muted>Nothing graded yet in these dates.</P>}
      </View>

      {c.categories.length > 0 && (
        <View style={[s.card, { padding: 16, gap: 10 }]}>
          <Text style={s.h}>How it's weighted</Text>
          {c.categories.map((cat) => {
            const mine = c.assignments.filter((a) => (a.category ?? '').trim().toLowerCase() === cat.name.trim().toLowerCase());
            const avg = average(mine, [], from, to);
            return (
              <View key={cat.name} style={{ gap: 4 }}>
                <View style={s.row}>
                  <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>{cat.name}<Text style={{ color: C.muted, fontWeight: '600' }}>{` · ${cat.weight}% of the grade`}</Text></Text>
                  <Text style={{ fontWeight: '800', color: C.ink }}>{percent(avg)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.min(100, avg ?? 0)}%`, height: 6, borderRadius: 3, backgroundColor: letterColor(letterFor(avg, c.scale)) }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={[s.card, { padding: 16, gap: 0 }]}>
        <Text style={[s.h, { marginBottom: 6 }]}>{`All grades (${list.length})`}</Text>
        {list.length === 0 && <P muted>No assignments in these dates.</P>}
        {list.map((a, i) => <GradeRow key={a.id} a={a} scale={c.scale} first={i === 0} />)}
      </View>
    </ScrollView>
  );
}

const STATUS: Record<Exclude<CourseAssignment['status'], 'graded'>, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  missing: { label: 'Missing', color: C.danger, icon: 'alert-circle' },
  excused: { label: 'Excused', color: C.muted, icon: 'remove-circle-outline' },
  pending: { label: 'Not graded yet', color: C.muted, icon: 'hourglass-outline' },
};

function GradeRow({ a, scale, first }: { a: CourseAssignment; scale: { letter: string; min: number }[]; first: boolean }) {
  const pct = counts(a) && a.maxScore ? (100 * (a.status === 'missing' ? 0 : a.score ?? 0)) / a.maxScore : null;
  const st = a.status === 'graded' ? null : STATUS[a.status];
  return (
    <View style={[{ paddingVertical: 10, gap: 3 }, !first && { borderTopWidth: 1, borderTopColor: C.line }]}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{a.title}</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>{[a.category, `${a.status === 'pending' ? 'Due' : ''} ${dateLabel(a.dueOn)}`.trim()].filter(Boolean).join(' · ')}</Text>
        </View>
        {st ? (
          <View style={[s.row, { gap: 4 }]}>
            <Ionicons name={st.icon} size={16} color={st.color} />
            <Text style={{ color: st.color, fontWeight: '800', fontSize: 13 }}>{st.label}</Text>
          </View>
        ) : (
          <Text style={{ color: C.ink, fontWeight: '700' }}>{`${num(a.score ?? 0)}/${num(a.maxScore ?? 0)}`}</Text>
        )}
        {pct !== null && (
          <View style={{ alignItems: 'flex-end', minWidth: 56, gap: 2 }}>
            <LetterBadge letter={letterFor(pct, scale)} />
            <Text style={{ fontSize: 12, color: a.status === 'missing' ? C.danger : C.muted, fontWeight: '600' }}>{percent(pct)}</Text>
          </View>
        )}
      </View>
      {!!a.comment && (
        <View style={[s.row, { gap: 6, alignItems: 'flex-start' }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={a.status === 'missing' ? AMBER : C.muted} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: C.muted, fontStyle: 'italic', fontSize: 13 }}>{a.comment}</Text>
        </View>
      )}
    </View>
  );
}
