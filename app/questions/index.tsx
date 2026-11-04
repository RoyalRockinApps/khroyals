/**
 * Ask the School: the school's F.A.Q.s, your questions and their answers, and (the staff
 * version, on the Main Page's Staff view) questions assigned to you. Those who route questions
 * (questions.manage) also get All questions, oldest waiting first (src/questions/RoutingList.tsx),
 * after verifying with their authenticator app right here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { isSchoolStaff, listQuestions, myAccess, subscribeQuestions, type Access, type Person, type SchoolQuestion } from '../../src/api/connect';
import { needsCodeFor } from '../../src/comms/mfa';
import { VerifyCard } from '../../src/comms/MfaGate';
import { FaqLink } from '../../src/questions/FaqLink';
import { age, ageColor, askerStatus, GREEN, nameOf, waiting, when } from '../../src/questions/format';
import { QuestionsGate } from '../../src/questions/QuestionsGate';
import { RoutingList } from '../../src/questions/RoutingList';
import { useStaffView } from '../../src/staffView';
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

  const load = useCallback(() => listQuestions().then(setQuestions).catch(() => setQuestions([])), []);
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
          <FaqLink />
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
        </View>}
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
          </Card>
        );
      }} />
  );
}
