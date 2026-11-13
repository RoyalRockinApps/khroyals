/**
 * Boards (the tab once called Connect; its route stays /connect, where sign-in links go): the school's bulletin boards.
 * A teacher's own board first, then the boards for the person's family (their children's academies and teachers, or a
 * student's own), then, for staff, every academy's and teacher's board. The groups people are in are folded at the
 * bottom. Family and Substitute accounts have no boards or groups.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isFamily, isSchoolStaff, isSubstitute, listArchivedGroups, listDiscoverableGroups, listHiddenGroups, listMyGroups, listUsers, live, myBoards,
  onAuthChange, session, setMockUser, signOut, type Board, type Person,
} from '../../src/api/connect';
import { BoardCard } from '../../src/boards/BoardCard';
import { boardHeading } from '../../src/boards/decor';
import { forgetCarPass } from '../../src/carline/carPass';
import { disableAutoCheckIn } from '../../src/carline/autoCheckIn';
import { disablePush } from '../../src/comms/push';
import { GroupsSection, type GroupLists } from '../../src/comms/GroupsSection';
import { SignIn } from '../../src/comms/SignIn';
import { Button, C, Card, Input, Loading, P, s } from '../../src/ui';
import { SCHOOL } from '../../src/school';

/** Demo-data mode: view the app as any demo person to check permissions. */
const TEST_USERS = ['u-admin', 'u-eng', 'u-vbcoach', 'u-s01', 'u-s08', 'u-p01'];
const NO_GROUPS: GroupLists = { mine: [], discover: [], hidden: [], archived: [] };

export default function Boards() {
  const [ready, setReady] = useState(false);
  const [person, setPerson] = useState<Person | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [groups, setGroups] = useState<GroupLists>(NO_GROUPS);
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await session();
      setPerson(p);
      if (isFamily(p) || isSubstitute(p) || !p || p.pending) {
        setBoards([]);
        setGroups(NO_GROUPS);
      } else {
        const [b, mine, discover, hidden, archived] = await Promise.all([
          myBoards().catch(() => [] as Board[]), listMyGroups(), listDiscoverableGroups(),
          listHiddenGroups().catch(() => []), listArchivedGroups().catch(() => []),
        ]);
        setBoards(b);
        setGroups({ mine, discover, hidden, archived });
        if (!live) setPeople(await listUsers());
      }
    } catch (e: any) {
      Alert.alert('Could not load the boards', e.message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => onAuthChange(load), [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!ready) return <Loading />;
  if (live && !person) return <SignIn onDone={load} />;
  if (person?.pending) {
    return (
      <View style={[s.screen, s.pad]}>
        <Card>
          <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>Waiting for approval</Text>
          <P>Thanks, {person.firstName || person.email}. A {SCHOOL.name} administrator will confirm your account, and then your class bulletin boards show up here.</P>
          <Button kind="ghost" label="Sign out" onPress={() => disablePush().then(disableAutoCheckIn).then(forgetCarPass).then(signOut).then(load)} />
        </Card>
      </View>
    );
  }
  if (!boards || !person) return <Loading />;

  const staff = isSchoolStaff(person);
  const own = boards.filter((b) => b.leads);
  const family = boards.filter((b) => b.family && !own.includes(b));
  const rest = staff ? boards.filter((b) => !own.includes(b) && !family.includes(b)) : [];
  const academies = rest.filter((b) => b.kind === 'academy');
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const teachers = rest.filter((b) => b.kind === 'teacher')
    .filter((b) => words.every((w) => `${boardHeading(b).title} ${b.teacherName ?? ''} ${b.byline} ${b.sections.join(' ')}`.toLowerCase().includes(w)));
  const student = person.schoolRole === 'student';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {!live && (
        <>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>VIEWING AS (DEMO DATA)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {TEST_USERS.map((id) => {
              const x = people.find((y) => y.id === id);
              if (!x) return null;
              const on = id === person.id;
              return (
                <Text key={id} onPress={() => { setMockUser(id); load(); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                    backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink }}>
                  {x.firstName} · {x.schoolRole}
                </Text>
              );
            })}
          </ScrollView>
        </>
      )}

      {isFamily(person) && (
        <Card>
          <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>Family account</Text>
          <P>Use the Car Line for the children the school linked to you, sign up to volunteer, and follow activities.
            The calendar, news and Handbook are on the Home page.</P>
          <P muted>Class bulletin boards are for parents, students and staff, so they don't appear here. To pick up another child, ask the school office.</P>
          <Button label="Open the Car Line" onPress={() => router.push('/carline')} />
        </Card>
      )}
      {isSubstitute(person) && (
        <Card>
          <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>Substitute account</Text>
          <P>Your sub days are in Apps → Sub Days. While you're on duty, that's where you'll find your classes, the roll and the teacher's sub plans.</P>
          <P muted>Class bulletin boards are for parents, students and staff, so they don't appear here.</P>
          <Button label="Open Sub Days" onPress={() => router.push('/sub')} />
        </Card>
      )}

      {!isFamily(person) && !isSubstitute(person) && (
        <>
          {own.length > 0 && <Heading icon="create" text={own.length === 1 ? 'YOUR BOARD' : 'YOUR BOARDS'} />}
          {own.map((b) => <BoardCard key={b.id} board={b} big />)}

          {family.length > 0 && <Heading icon="pin" text={student ? 'YOUR CLASS BOARDS' : staff ? 'YOUR CHILDREN\'S BOARDS' : 'YOUR FAMILY\'S BOARDS'} />}
          {family.map((b) => <BoardCard key={b.id} board={b} />)}

          {own.length + family.length + rest.length === 0 && (
            <Card style={{ gap: 6 }}>
              <Text style={{ fontWeight: '800', fontSize: 17, color: C.ink }}>No boards yet</Text>
              <P muted>{student
                ? 'Your teachers\' bulletin boards show up here once you\'re in their classes.'
                : 'Your children\'s teachers\' bulletin boards show up here once the office puts them in their classes.'}</P>
            </Card>
          )}

          {academies.length > 0 && <Heading icon="school" text="ACADEMY BOARDS" />}
          {academies.map((b) => <BoardCard key={b.id} board={b} />)}

          {rest.some((b) => b.kind === 'teacher') && (
            <>
              <Heading icon="people" text="TEACHERS' BOARDS" />
              {rest.filter((b) => b.kind === 'teacher').length > 6 && (
                <View style={[s.row, { gap: 8 }]}>
                  <Ionicons name="search" size={18} color={C.muted} />
                  <Input placeholder="Find a teacher or class" value={search} onChangeText={setSearch} style={{ flex: 1 }} autoCorrect={false} />
                </View>
              )}
              {teachers.map((b) => <BoardCard key={b.id} board={b} />)}
              {teachers.length === 0 && <P muted>No teacher's board matches “{search.trim()}”.</P>}
            </>
          )}

          <View style={{ marginTop: 10 }}>
            <GroupsSection person={person} lists={groups} onChange={load} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Heading({ icon, text }: { icon: 'create' | 'pin' | 'school' | 'people'; text: string }) {
  return (
    <View style={[s.row, { gap: 6, marginTop: 6 }]}>
      <Ionicons name={icon} size={15} color={C.muted} />
      <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.6 }}>{text}</Text>
    </View>
  );
}
