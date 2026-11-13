/**
 * Ask the School: Ask a question; under it, your questions, each with the school's latest answer (tap one for the whole
 * conversation); and below them the school's F.A.Q.s, every question opening to its answer (src/questions/FaqSection.tsx).
 * The staff version (the Main Page's Staff view) also has questions assigned to you. Those who route questions
 * (questions.manage) also get All questions, oldest waiting first (src/questions/RoutingList.tsx), after verifying with
 * their authenticator app right here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isSchoolStaff, latestAnswers, listQuestions, myAccess, subscribeQuestions, type Access, type Person, type QuestionMessage, type SchoolQuestion,
} from '../../src/api/connect';
import { needsCodeFor } from '../../src/comms/mfa';
import { VerifyCard } from '../../src/comms/MfaGate';
import { FaqSection } from '../../src/questions/FaqSection';
import { age, ageColor, askerStatus, GREEN, nameOf, waiting, when } from '../../src/questions/format';
import { QuestionsGate } from '../../src/questions/QuestionsGate';
import { RoutingList } from '../../src/questions/RoutingList';
import { useStaffView } from '../../src/staffView';
import { SCHOOL } from '../../src/school';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Chip, Loading, P, s } from '../../src/ui';

type Tab = 'mine' | 'assigned' | 'all';

export default function Questions() {
  return <QuestionsGate title="Ask the School" faq>{(me) => <List me={me} />}</QuestionsGate>;
}

function List({ me }: { me: Person }) {
  const [questions, setQuestions] = useState<SchoolQuestion[] | null>(null);
  const staffView = useStaffView(me);
  const [tab, setTab] = useState<Tab>(staffView ? 'assigned' : 'mine');
  const picked = useRef(false);   // the person chose a tab, so a late "All questions" doesn't take over
  const [access, setAccess] = useState<Access | null>(null);
  const [answers, setAnswers] = useState<Map<string, QuestionMessage>>(new Map());

  const load = useCallback(() => listQuestions().then((list) => {
    setQuestions(list);
    // The school's latest answer to each of your own questions, shown under it.
    return latestAnswers(list.filter((q) => q.askerId === me.id).map((q) => q.id)).then(setAnswers);
  }).catch(() => setQuestions((q) => q ?? [])), [me.id]);
  useFocusEffect(useCallback(() => { load(); return subscribeQuestions(load); }, [load]));
  const loadAccess = useCallback(() => myAccess().then(setAccess).catch(() => setAccess(null)), []);
  useEffect(() => { loadAccess(); }, [loadAccess]);
  const verified = useCallback(() => { loadAccess(); load(); }, [loadAccess, load]);
  const routes = !!access?.permissions.includes('questions.manage');
  // Staff on Standard see only their own questions, like a parent.
  const others = !isSchoolStaff(me);
  const routing = routes && (staffView || others);
  useEffect(() => { if (routing && !picked.current) setTab('all'); }, [routing]);
  if (!questions) return <Loading />;

  const lists: Record<'mine' | 'assigned', SchoolQuestion[]> = {
    mine: questions.filter((q) => q.askerId === me.id),
    assigned: questions.filter((q) => q.assigneeId === me.id && q.askerId !== me.id)
      .sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || (a.waitingSince ?? '').localeCompare(b.waitingSince ?? '')),
  };
  const tabs: Tab[] = [
    ...(routing ? ['all' as const] : []),
    ...(staffView || (others && lists.assigned.length) ? ['mine' as const, 'assigned' as const] : ['mine' as const]),
  ];
  const shown: Tab = tabs.includes(tab) ? tab : 'mine';
  const label = (t: Tab) => (t === 'all' ? `All questions (${questions.filter(waiting).length} waiting)`
    : `${t === 'mine' ? 'My questions' : 'Assigned to me'} (${lists[t].length})`);

  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={shown === 'all' ? [] : lists[shown]} keyExtractor={(q) => q.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Button label="+ Ask a question" onPress={() => router.push('/questions/new')} />
          {needsCodeFor(access, 'questions.manage') && (staffView || others) && (
            <VerifyCard why="Admins who route questions see every question sent to the school here." onVerified={verified} />
          )}
          {tabs.length > 1 && (
            <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
              {tabs.map((t) => (
                <Text key={t} onPress={() => { picked.current = true; setTab(t); }} accessibilityRole="button" accessibilityState={{ selected: shown === t }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                    backgroundColor: shown === t ? C.primary : '#fff', color: shown === t ? '#fff' : C.ink, fontWeight: '600' }}>
                  {label(t)}
                </Text>
              ))}
            </View>
          )}
          {shown === 'all' && <RoutingList questions={questions} />}
          {shown === 'mine' && tabs.length === 1 && <SectionTitle icon="chatbubbles-outline" title="Your questions" />}
        </View>}
      ListFooterComponent={shown === 'mine' ? <FaqSection /> : null}
      ListEmptyComponent={shown === 'all' ? null : <Card><P muted>{shown === 'mine'
        ? "You haven't asked anything yet. Questions you send, and the school's answers, are kept here."
        : 'Nothing is assigned to you right now.'}</P></Card>}
      renderItem={({ item: q }) => {
        const st = askerStatus(q);
        return (
          <Card onPress={() => router.push(`/questions/${q.id}`)} style={{ gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{q.subject}</Text>
            <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
              <Chip label={q.topic} color={C.muted} />
              {shown === 'mine'
                ? <Chip label={st.label} color={st.color} />
                : waiting(q)
                  ? <Chip label={`Waiting ${age(q.waitingSince)}`} color={ageColor(q.waitingSince)} />
                  : <Chip label={q.status === 'answered' ? 'Answered' : 'Closed'} color={q.status === 'answered' ? GREEN : C.muted} />}
            </View>
            <P muted>{shown === 'mine' ? `Asked ${when(q.createdAt)}` : `From ${nameOf(q.askerId)}`} · updated {when(q.updatedAt)}</P>
            {shown === 'mine' && <Answer answer={answers.get(q.id)} open={q.status !== 'closed'} />}
          </Card>
        );
      }} />
  );
}

/** Under one of your questions: the school's latest answer (tap the question for the whole conversation), or that it's coming. */
function Answer({ answer, open }: { answer: QuestionMessage | undefined; open: boolean }) {
  if (!answer) return open ? <Text style={{ color: C.muted, fontStyle: 'italic' }}>The school’s answer will show here.</Text> : null;
  return (
    <View style={{ gap: 4, padding: 12, borderRadius: 12, backgroundColor: '#E8F5EC', marginTop: 2 }}>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="school" size={14} color={GREEN} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: GREEN }} numberOfLines={1}>
          {nameOf(answer.authorId)} · {SCHOOL.name}
        </Text>
        <Text style={{ fontSize: 12, color: C.muted }}>{when(answer.createdAt)}</Text>
      </View>
      <Text style={{ fontSize: 15, lineHeight: 22, color: C.ink }} numberOfLines={6}>{answer.body}</Text>
    </View>
  );
}
