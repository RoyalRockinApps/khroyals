/**
 * A note from a parent, for the teacher it's to (from its notification, or Bulletins & notes → From parents). Opening
 * it marks it seen for the parent. Reply writes a note back into the parents' Class Folder (app/forms/write.tsx).
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, parentNotes, readParentNote, type ParentNote, type Person } from '../../../src/api/connect';
import { FormsGate } from '../../../src/schoolForms/FormsGate';
import { Button, C, Card, Loading, P, s } from '../../../src/ui';

const day = (at: string) => new Date(at).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function FromParent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormsGate title="Note from a parent">{(me) => <Note id={id} me={me} />}</FormsGate>;
}

function Note({ id }: { id: string; me: Person }) {
  const [note, setNote] = useState<ParentNote | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    parentNotes().then((list) => {
      const n = list.find((x) => x.id === id && !x.mine) ?? null;
      setNote(n);
      if (n && !n.readAt) readParentNote(id).catch(() => {});
    }).catch((e) => { setError(errorText(e)); setNote(null); });
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (note === undefined) return <Loading />;
  if (!note) return <View style={[s.screen, s.pad]}><Card><P muted>{error ?? 'This note isn’t here: it may be older than 90 days, or to another teacher.'}</P></Card></View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Card style={{ gap: 10 }}>
        <View style={[s.row, { gap: 8 }]}>
          <Ionicons name="mail-open-outline" size={22} color={C.primary} />
          <Text style={{ flex: 1, fontWeight: '800', letterSpacing: 2, fontSize: 12, color: C.primary }}>FROM A PARENT</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{note.from}</Text>
        <Text style={{ color: C.muted }}>About {note.student}{note.classes.length ? ` · ${note.classes.join(', ')}` : ''} · {day(note.sentAt)}</Text>
        <Text selectable style={{ fontSize: 17, lineHeight: 26, color: C.ink }}>{note.body}</Text>
      </Card>
      <Button label={`Reply to ${note.student.split(' ')[0]}’s parents`}
        onPress={() => router.push({ pathname: '/forms/write', params: { kind: 'note', student: note.studentId, name: note.student } })} />
      <P muted>Your reply goes into their Class Folder as a note, and they’re told.</P>
    </ScrollView>
  );
}
