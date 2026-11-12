/**
 * Write a class bulletin (to one or more sections the teacher leads: a title and what to say) or a note to one
 * student's parents (pick the class, then the student; the title is optional). Opened with `kind`, and a `section`
 * or `student` already picked when it comes from Classes. Sending puts it in those parents' Folders and tells them.
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  classRoll, errorText, isSchoolStaff, mySections, sendBulletin, sendFolderNote, type FolderNoteKind, type Person, type Section,
} from '../../src/api/connect';
import { Pills } from '../../src/feedback/ui';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { Button, C, Card, Field, Loading, P, s } from '../../src/ui';

export default function Write() {
  const params = useLocalSearchParams<{ kind?: string; section?: string; student?: string; name?: string }>();
  return <FormsGate title={params.kind === 'note' ? 'Note to a family' : 'Class bulletin'}>{(me) => <Writer me={me} params={params} />}</FormsGate>;
}

function Writer({ me, params }: { me: Person; params: { kind?: string; section?: string; student?: string; name?: string } }) {
  const [kind, setKind] = useState<FolderNoteKind>(params.kind === 'note' ? 'note' : 'bulletin');
  const [sections, setSections] = useState<Section[] | null>(null);
  const [picked, setPicked] = useState<string[]>(params.section ? [params.section] : []);
  const [roll, setRoll] = useState<{ section: string; students: { id: string; name: string }[] } | null>(null);
  const [student, setStudent] = useState<string | null>(params.student ?? null);
  // Replying to a parent's note: the student is already picked (Change to pick another).
  const [replyTo, setReplyTo] = useState<string | null>(params.student && params.name ? params.name : null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mySections().then((list) => {
      setSections(list);
      // One class: it's the one.
      if (list.length === 1) setPicked((p) => (p.length ? p : [list[0].id]));
    }).catch((e) => { Alert.alert('Classes', errorText(e)); setSections([]); });
  }, []);
  // A note: the students of the one class picked.
  const one = kind === 'note' ? picked[0] ?? null : null;
  useEffect(() => {
    if (!one) return;
    let on = true;
    classRoll(one).then((r) => on && setRoll({ section: one, students: r.students.map((x) => ({ id: x.id, name: x.name })) }))
      .catch(() => on && setRoll({ section: one, students: [] }));
    return () => { on = false; };
  }, [one]);
  const students = roll && roll.section === one ? roll.students : null;

  if (!isSchoolStaff(me)) return <View style={[s.screen, s.pad]}><Card><P muted>Teachers post class bulletins and write notes to families.</P></Card></View>;
  if (!sections) return <Loading />;
  if (sections.length === 0) {
    return <View style={[s.screen, s.pad]}><Card><P muted>{'You don’t lead a class section yet. The office sets up sections in Admin portal → Classes.'}</P></Card></View>;
  }

  const toggle = (id: string) => setPicked((p) => (kind === 'note' ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const switchKind = (k: FolderNoteKind) => { setKind(k); if (k === 'note') setPicked((p) => p.slice(0, 1)); setStudent(null); setReplyTo(null); };
  const ok = body.trim().length > 0 && (kind === 'bulletin' ? picked.length > 0 && title.trim().length > 0 : !!student);
  const send = async () => {
    setBusy(true);
    try {
      if (kind === 'bulletin') await sendBulletin(picked, title, body);
      else await sendFolderNote(student!, title, body);
      Alert.alert('Sent', kind === 'bulletin' ? 'It’s in every family’s Folder for those classes.' : 'It’s in their parents’ Folder.');
      if (router.canGoBack()) router.back(); else router.replace('/forms/notes');
    } catch (e) {
      Alert.alert('Not sent', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: kind === 'note' ? 'Note to a family' : 'Class bulletin' }} />
      <Pills options={[{ key: 'bulletin', label: '📌 Class bulletin' }, { key: 'note', label: '✉️ Note to a family' }]} value={kind} onChange={switchKind} />
      {kind === 'note' && replyTo ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="return-down-forward-outline" size={20} color={C.primary} />
          <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>To {replyTo}’s parents</Text>
          <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => { setReplyTo(null); setStudent(null); }}>Change</Text>
        </Card>
      ) : (
      <Card style={{ gap: 10 }}>
        <Text style={{ fontWeight: '800', color: C.ink }}>{kind === 'bulletin' ? 'Which classes?' : 'Which class?'}</Text>
        <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
          {sections.map((c) => {
            const on = picked.includes(c.id);
            return (
              <Pressable key={c.id} onPress={() => toggle(c.id)} accessibilityRole={kind === 'bulletin' ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }}
                style={({ pressed }) => [s.row, { gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                  borderColor: C.primary, backgroundColor: on ? C.primary : '#fff' }, pressed && { opacity: 0.7 }]}>
                {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                <Text style={{ fontWeight: '700', color: on ? '#fff' : C.primary }}>{c.name}</Text>
                <Text style={{ color: on ? 'rgba(255,255,255,0.8)' : C.muted }}>{c.students}</Text>
              </Pressable>
            );
          })}
        </View>
        {kind === 'note' && one && (
          <>
            <Text style={{ fontWeight: '800', color: C.ink, marginTop: 4 }}>Which student’s parents?</Text>
            {!students ? <Loading /> : students.length === 0 ? <P muted>No students in this class yet.</P> : (
              <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
                {students.map((x) => {
                  const on = student === x.id;
                  return (
                    <Pressable key={x.id} onPress={() => setStudent(x.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: C.line,
                        backgroundColor: on ? C.accent : '#fff' }, on && { borderColor: C.accent }, pressed && { opacity: 0.7 }]}>
                      <Text style={{ fontWeight: '700', color: on ? '#fff' : C.ink }}>{x.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </Card>
      )}
      <Field label={kind === 'bulletin' ? 'Title' : 'Title (optional)'} value={title} onChangeText={setTitle} maxLength={120}
        placeholder={kind === 'bulletin' ? 'Poetry week' : 'A great week'} />
      <Field label={kind === 'bulletin' ? 'Bulletin' : 'Note'} value={body} onChangeText={setBody} multiline maxLength={4000}
        style={{ minHeight: 160, textAlignVertical: 'top' }}
        placeholder={kind === 'bulletin' ? 'Each student reads a poem on Friday. Practice at home this week!' : 'Ava led the class discussion today. Thank you for all your help at home!'} />
      <Button label={busy ? 'Sending…' : kind === 'bulletin' ? 'Post to their Folders' : 'Send to the parents'} onPress={send} disabled={busy || !ok} />
      <P muted>{kind === 'bulletin'
        ? 'Every parent of a student in those classes finds it in their Folder for two weeks, and is told.'
        : 'Only the student’s parents see it, in their Folder, and they’re told. Students don’t see notes.'}</P>
    </ScrollView>
  );
}
