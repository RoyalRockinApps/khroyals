/** Make a deck of flash cards, or rename one (`?id=`): its name and the class it's for. A new deck goes on to Add cards. */
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { saveStudyDeck, studyDecks, studySubjects } from '../../src/api/connect';
import { StudyClosed, SubjectPicker, oops, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function DeckForm() {
  const access = useStudyAccess();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [ready, setReady] = useState(!id);
  const [busy, setBusy] = useState(false);
  const open = access === 'open';

  useEffect(() => {
    if (!open) return;
    studySubjects().then(setSubjects).catch(() => {});
    if (!id) return;
    studyDecks().then((list) => {
      const d = list.find((x) => x.id === id);
      if (d) { setTitle(d.title); setSubject(d.subject); }
      setReady(true);
    }).catch((e) => { oops(e); setReady(true); });
  }, [open, id]);

  const header = <Stack.Screen options={{ title: id ? 'Rename deck' : 'New deck' }} />;
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;
  if (!ready) return <>{header}<Loading /></>;

  const save = () => {
    setBusy(true);
    saveStudyDeck({ id: id ?? null, title, subject }).then((deck) => {
      if (id) { router.back(); return; }
      router.replace({ pathname: '/study/deck/[id]', params: { id: deck } });
      router.push({ pathname: '/study/add', params: { deck } });
    }).catch(oops).finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card style={{ gap: 12 }}>
        <Field label="Name" value={title} onChangeText={setTitle} maxLength={80} autoFocus={!id}
          placeholder="Chapter 4 vocabulary" hint={id ? undefined : 'One test or topic: a chapter, a vocab list, the parts of a cell.'} />
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Class</Text>
          <SubjectPicker value={subject} onChange={setSubject} subjects={subjects} />
        </View>
      </Card>
      <Button label={busy ? 'Saving…' : id ? 'Save' : 'Make the deck'} disabled={busy || !title.trim()} onPress={save} />
      {!id && <Card><H>Then add cards</H><P muted>Type them one at a time, paste a list, or make them from one of your notes.</P></Card>}
    </ScrollView>
  );
}
