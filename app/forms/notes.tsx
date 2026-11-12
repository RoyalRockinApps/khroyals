/**
 * Bulletins & notes, for teachers (Classes, or the Folder in Staff view): notes parents wrote to them (From parents,
 * New until opened); post a class bulletin to the sections they lead, or write a note to one student's parents; both
 * land in those parents' Folders. Below, what they sent in the last 90 days, with how many parents have opened each.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, isSchoolStaff, mySections, parentNotes, sentFolderNotes, type ParentNote, type Person, type SentFolderNote } from '../../src/api/connect';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { GREEN, Progress } from '../../src/schoolForms/parts';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function Notes() {
  return <FormsGate title="Bulletins & notes">{(me) => <List me={me} />}</FormsGate>;
}

function List({ me }: { me: Person }) {
  const [data, setData] = useState<{ sent: SentFolderNote[]; classes: number; fromParents: ParentNote[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    Promise.all([sentFolderNotes(), mySections(), parentNotes()])
      .then(([sent, sections, notes]) => { setData({ sent, classes: sections.length, fromParents: notes.filter((n) => !n.mine) }); setError(null); })
      .catch((e) => setError(errorText(e)));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isSchoolStaff(me)) return <View style={[s.screen, s.pad]}><Card><P muted>Teachers post class bulletins and write notes to families.</P></Card></View>;
  if (error && !data) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!data) return <Loading />;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {data.fromParents.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>From parents</Text>
          {data.fromParents.map((n) => (
            <Card key={n.id} onPress={() => router.push(`/forms/from-parent/${n.id}` as Href)} style={{ gap: 4 }}>
              <View style={[s.row, { gap: 8 }]}>
                <Ionicons name={n.readAt ? 'mail-open-outline' : 'mail-unread-outline'} size={20} color={C.primary} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>{n.from} · about {n.student.split(' ')[0]}</Text>
                {!n.readAt && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: C.accent }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>NEW</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: C.ink }} numberOfLines={2}>{n.body}</Text>
              <Text style={{ color: C.muted }}>{new Date(n.sentAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            </Card>
          ))}
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 8 }}>Your bulletins and notes</Text>
        </View>
      )}
      {data.classes === 0 ? (
        <Card><P muted>{'You don’t lead a class section yet, so there’s no one to write to. The office sets up sections in Admin portal → Classes.'}</P></Card>
      ) : (
        <View style={[s.row, { gap: 10 }]}>
          <View style={{ flex: 1 }}><Button label="+ Class bulletin" onPress={() => router.push('/forms/write?kind=bulletin' as Href)} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" label="+ Note to a family" onPress={() => router.push('/forms/write?kind=note' as Href)} /></View>
        </View>
      )}
      <P muted>Bulletins go to every family in the classes you pick; a note goes to one student’s parents. Both appear in their Folder, and they’re told.</P>
      {data.sent.length === 0 && data.classes > 0 && <Card><P muted>What you send shows up here, with how many parents have read it.</P></Card>}
      {data.sent.map((n) => (
        <Card key={n.id} onPress={() => router.push(`/forms/note/${n.id}` as Href)} style={{ gap: 4 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Ionicons name={n.kind === 'note' ? 'create-outline' : 'megaphone-outline'} size={20} color={C.primary} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
              {n.title || n.body.split('\n')[0]}
            </Text>
          </View>
          <Text style={{ color: C.muted }}>
            {n.kind === 'note' ? 'Note' : 'Bulletin'} to {n.to} · {new Date(n.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          <Progress done={n.read} total={n.parents} />
          <Text style={{ color: n.parents && n.read === n.parents ? GREEN : C.ink, fontWeight: '600' }}>
            Read by {n.read} of {n.parents} {n.parents === 1 ? 'parent' : 'parents'}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}
