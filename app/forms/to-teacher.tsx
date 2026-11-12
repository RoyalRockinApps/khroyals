/**
 * Note to a teacher, from the Class Folder's + button: a parent picks their child (when they have more than one) and
 * one of the child's teachers, and writes to them; the teacher is told and answers with a note into the Folder. Below,
 * the notes they've written in the last 90 days, each Seen once the teacher has opened it.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  errorText, parentNotes, parentNoteTeachers, sendParentNote, type ChildTeachers, type ParentNote, type Person,
} from '../../src/api/connect';
import { Pills } from '../../src/feedback/ui';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { Button, C, Card, Chip, Field, H, Loading, P, s } from '../../src/ui';

const GREEN = '#15803D';
const when = (at: string) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function ToTeacher() {
  return <FormsGate title="Note to a teacher">{(me) => <Compose me={me} />}</FormsGate>;
}

function Compose(_: { me: Person }) {
  const [kids, setKids] = useState<ChildTeachers[] | null>(null);
  const [sent, setSent] = useState<ParentNote[]>([]);
  const [kid, setKid] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    Promise.all([parentNoteTeachers(), parentNotes()])
      .then(([k, n]) => { setKids(k); setSent(n.filter((x) => x.mine)); })
      .catch((e) => { Alert.alert('Note to a teacher', errorText(e)); setKids([]); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!kids) return <Loading />;
  if (kids.length === 0) {
    return <View style={[s.screen, s.pad]}><Card><P muted>Only a child’s parents write to their teachers. Ask the school office to link your children.</P></Card></View>;
  }
  const child = kids.find((k) => k.studentId === kid) ?? kids[0];
  const teachers = child.teachers;
  const to = teachers.find((t) => t.id === teacher) ?? (teachers.length === 1 ? teachers[0] : null);
  const send = async () => {
    if (!to) return;
    setBusy(true);
    try {
      await sendParentNote(child.studentId, to.id, body);
      setBody('');
      Alert.alert('Sent', `${to.name} is told. Their answer comes to your Class Folder.`);
      load();
    } catch (e) {
      Alert.alert('Not sent', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 10 }}>
        {kids.length > 1 && (
          <>
            <Text style={{ fontWeight: '800', color: C.ink }}>About</Text>
            <Pills options={kids.map((k) => ({ key: k.studentId, label: k.name }))} value={child.studentId}
              onChange={(id) => { setKid(id); setTeacher(null); }} />
          </>
        )}
        <Text style={{ fontWeight: '800', color: C.ink }}>To {kids.length > 1 ? `${child.name}’s` : 'which'} teacher</Text>
        {teachers.length === 0 ? <P muted>{child.name} isn’t in a class with a teacher yet.</P> : (
          <Pills options={teachers.map((t) => ({ key: t.id, label: t.classes.length ? `${t.name} · ${t.classes.join(', ')}` : t.name }))}
            value={to?.id ?? null} onChange={setTeacher} />
        )}
        <Field label="Note" value={body} onChangeText={setBody} multiline maxLength={2000} style={{ minHeight: 140, textAlignVertical: 'top' }}
          placeholder={`${child.name} has a dentist appointment Thursday morning and will bring the reading log Friday.`} />
        <Button label={busy ? 'Sending…' : to ? `Send to ${to.name}` : 'Pick a teacher'} onPress={send} disabled={busy || !to || !body.trim()} />
        <P muted>Only {to?.name ?? 'the teacher'} reads it. To tell the office about an absence, use Excused Absence instead.</P>
      </Card>

      {sent.length > 0 && (
        <View style={{ gap: 8 }}>
          <H>Your notes</H>
          {sent.map((n) => (
            <Card key={n.id} style={{ gap: 4 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>To {n.to} · about {n.student.split(' ')[0]}</Text>
              <Text style={{ color: C.ink }} numberOfLines={3}>{n.body}</Text>
              <View style={[s.row, { alignItems: 'center' }]}>
                <Text style={{ color: C.muted }}>{when(n.sentAt)}</Text>
                {n.readAt ? <Chip label="✓ Seen" color={GREEN} /> : <Chip label="Sent" color={C.primary} />}
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
