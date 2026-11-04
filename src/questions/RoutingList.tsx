/**
 * Ask the School → All questions (Route questions, questions.manage): every question sent to the
 * school, oldest waiting first so nothing sits too long, to assign to faculty or staff or answer.
 * It used to be the Admin portal's Questions tab.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { SchoolQuestion } from '../api/connect';
import { C, Card, P, s } from '../ui';
import { age, ageColor, nameOf, waiting } from './format';

type Filter = 'waiting' | 'answered' | 'closed';

export function RoutingList({ questions }: { questions: SchoolQuestion[] }) {
  const [filter, setFilter] = useState<Filter>('waiting');
  const [, setTick] = useState(0);
  // Ages keep counting while the list is open.
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);

  const open = questions.filter(waiting).sort((a, b) => (a.waitingSince ?? '').localeCompare(b.waitingSince ?? ''));
  const unassigned = open.filter((q) => !q.assigneeId).length;
  const shown = filter === 'waiting' ? open : questions.filter((q) => q.status === filter);
  const pill = (f: Filter, label: string) => (
    <Text key={f} onPress={() => setFilter(f)} accessibilityRole="button" accessibilityState={{ selected: filter === f }}
      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
        backgroundColor: filter === f ? C.primary : '#fff', color: filter === f ? '#fff' : C.ink }}>{label}</Text>
  );

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>
          {open.length} waiting · {unassigned} unassigned{open.length ? ` · oldest ${age(open[0].waitingSince)}` : ''}
        </Text>
        <P muted>Open a question to assign it to faculty or staff, or answer it yourself. Ages turn amber after a day and red after three.</P>
      </Card>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {pill('waiting', `Waiting (${open.length})`)}{pill('answered', 'Answered')}{pill('closed', 'Closed')}
      </View>
      {shown.length === 0 && <P muted>{filter === 'waiting' ? 'Nothing is waiting. 🎉' : 'None yet.'}</P>}
      {shown.map((q) => (
        <Card key={q.id} onPress={() => router.push(`/questions/${q.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {waiting(q) && (
            <View style={{ width: 54, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: ageColor(q.waitingSince) }}>{age(q.waitingSince)}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>waiting</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{q.subject}</Text>
            <P muted>From {nameOf(q.askerId)} · {q.topic}</P>
            <Text style={{ color: q.assigneeId ? C.muted : '#B45309', fontWeight: q.assigneeId ? '400' : '700' }}>
              {q.assigneeId ? `Assigned to ${nameOf(q.assigneeId)}` : 'Unassigned'}
            </Text>
          </View>
        </Card>
      ))}
    </View>
  );
}
