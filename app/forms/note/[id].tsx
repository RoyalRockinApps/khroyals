/**
 * One class bulletin or teacher's note, opened from the Folder or its notification. Parents read the whole thing (a
 * note is a yellow sticky note), which marks it read for them, and take it out of their folder or put it back. Its
 * author sees who it went to and how many parents have opened it, and deletes it.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteFolderNote, errorText, myFolderNotes, readFolderNote, removeFolderNote, sentFolderNotes, type FolderNote, type Person, type SentFolderNote,
} from '../../../src/api/connect';
import { FormsGate } from '../../../src/schoolForms/FormsGate';
import { SCHOOL } from '../../../src/school';
import { Button, C, Card, Loading, P, ask, s } from '../../../src/ui';

const STICKY = '#FFF4B8';
const day = (at: string) => new Date(at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FormsGate title="Note">{(me) => <Note id={id} me={me} />}</FormsGate>;
}

function Note({ id }: { id: string; me: Person }) {
  const [mine, setMine] = useState<FolderNote | null | undefined>(undefined);
  const [sent, setSent] = useState<SentFolderNote | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [notes, own] = await Promise.all([myFolderNotes(), sentFolderNotes()]);
      const n = notes.find((x) => x.id === id) ?? null;
      setMine(n);
      setSent(own.find((x) => x.id === id) ?? null);
      if (n && !n.readAt) readFolderNote(id).catch(() => {});
    } catch (e) {
      Alert.alert('Note', errorText(e));
      setMine(null);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (mine === undefined) return <Loading />;
  const n = mine ?? sent;
  if (!n) return <View style={[s.screen, s.pad]}><Card><P muted>This note isn’t here anymore: its teacher may have deleted it.</P></Card></View>;

  const sticky = n.kind === 'note';
  const title = sticky ? 'Note' : 'Class bulletin';
  const remove = (removed: boolean) => {
    setBusy(true);
    removeFolderNote(id, removed).then(load).catch((e) => Alert.alert('Folder', errorText(e))).finally(() => setBusy(false));
  };
  const del = () => ask(`Delete this ${sticky ? 'note' : 'bulletin'}?`, 'It leaves every parent’s folder. This can’t be undone.', 'Delete', () => {
    setBusy(true);
    deleteFolderNote(id).then(() => router.back()).catch((e) => Alert.alert('Not deleted', errorText(e))).finally(() => setBusy(false));
  });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title }} />
      <View style={{ backgroundColor: sticky ? STICKY : '#fff', borderRadius: sticky ? 3 : 12, padding: 20, gap: 12, overflow: 'hidden',
        borderTopWidth: sticky ? 0 : 5, borderTopColor: SCHOOL.theme.dark,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
        <View style={[s.row, { gap: 8 }]}>
          <Ionicons name={sticky ? 'create-outline' : 'megaphone-outline'} size={22} color={sticky ? '#8A6A00' : SCHOOL.theme.dark} />
          <Text style={{ flex: 1, fontWeight: '800', letterSpacing: 2, fontSize: 12, color: sticky ? '#8A6A00' : SCHOOL.theme.dark }}>
            {sticky ? 'TEACHER’S NOTE' : 'CLASS BULLETIN'}
          </Text>
        </View>
        {mine && (
          <Text style={{ color: C.muted }}>
            {[sticky ? `About ${mine.children.join(' and ')}` : mine.classes.join(', '), day(mine.sentAt)].join(' · ')}
          </Text>
        )}
        {!!n.title && <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink }}>{n.title}</Text>}
        <Text selectable style={{ fontSize: 17, lineHeight: 26, color: C.ink }}>{n.body}</Text>
        {mine && <Text style={{ color: C.muted, fontWeight: '700' }}>— {mine.from}</Text>}
      </View>

      {sent && (
        <Card style={{ gap: 4 }}>
          <Text style={{ fontWeight: '800', color: C.ink }}>To {sent.to}</Text>
          <P muted>Sent {day(sent.sentAt)} · opened by {sent.read} of {sent.parents} {sent.parents === 1 ? 'parent' : 'parents'}</P>
          <Text style={{ color: C.danger, fontWeight: '700', marginTop: 6, opacity: busy ? 0.5 : 1 }} accessibilityRole="button"
            onPress={busy ? undefined : del}>Delete this {sticky ? 'note' : 'bulletin'}</Text>
        </Card>
      )}
      {mine && (mine.removedAt
        ? <Button label="Put it back in my folder" onPress={() => remove(false)} disabled={busy} />
        : <Button kind="ghost" label="Remove it from my folder" onPress={() => remove(true)} disabled={busy} />)}
      {mine && <P muted>{sticky ? 'Only you and the other parent see this note.' : 'Every family in the class gets this bulletin.'} To answer, write to the teacher or the office.</P>}
    </ScrollView>
  );
}
