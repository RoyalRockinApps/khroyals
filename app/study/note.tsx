/**
 * A note in Study (`?id=`; none for a new one): a title, the class it's for and the text. It saves itself a moment
 * after typing stops and on leaving. Lines written as "term - meaning" can become flash cards (Make flash cards).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { deleteStudyNote, saveStudyNote, studyNote, studySubjects } from '../../src/api/connect';
import { NAVY } from '../../src/sports/ui';
import { parseCards } from '../../src/study/parse';
import { GREEN, StudyClosed, SubjectPicker, oops, useStudyAccess } from '../../src/study/ui';
import { Button, C, Card, Loading, P, PLACEHOLDER, ask, s } from '../../src/ui';

type Draft = { title: string; subject: string; body: string };
type Saving = 'idle' | 'saving' | 'saved' | 'error';

export default function NoteScreen() {
  const access = useStudyAccess();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | null>(params.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(params.id ? null : { title: '', subject: '', body: '' });
  const [subjects, setSubjects] = useState<string[]>([]);
  const [saving, setSaving] = useState<Saving>('idle');
  const [missing, setMissing] = useState(false);
  // What's on the server, and what's waiting to go there.
  const saved = useRef<string>(JSON.stringify({ title: '', subject: '', body: '' }));
  const latest = useRef<Draft | null>(draft);
  const idRef = useRef<string | null>(id);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const open = access === 'open';

  useEffect(() => {
    if (!open) return;
    studySubjects().then(setSubjects).catch(() => {});
    if (!params.id) return;
    studyNote(params.id).then((n) => {
      if (!n) { setMissing(true); return; }
      const d = { title: n.title, subject: n.subject, body: n.body };
      saved.current = JSON.stringify(d);
      latest.current = d;
      setDraft(d);
      setSaving('saved');
    }).catch((e) => { oops(e); setMissing(true); });
  }, [open, params.id]);

  /**
   * Sends the latest text if it changed. Saves wait for each other, so a new note is made once and gets its id from
   * the first.
   */
  const flush = useCallback((): Promise<void> => {
    chain.current = chain.current.then(async () => {
      const d = latest.current;
      if (!d || JSON.stringify(d) === saved.current) return;
      if (!idRef.current && !d.title.trim() && !d.body.trim()) return;
      if (mounted.current) setSaving('saving');
      try {
        const newId = await saveStudyNote({ id: idRef.current, ...d });
        saved.current = JSON.stringify(d);
        if (!idRef.current) {
          idRef.current = newId;
          if (mounted.current) { setId(newId); router.setParams({ id: newId }); }
        }
        if (mounted.current) setSaving(JSON.stringify(latest.current) === saved.current ? 'saved' : 'saving');
      } catch {
        if (mounted.current) setSaving('error');
      }
    });
    return chain.current;
  }, []);

  // A moment after typing stops.
  useEffect(() => {
    latest.current = draft;
    if (!draft || JSON.stringify(draft) === saved.current) return;
    setSaving('saving');
    const t = setTimeout(() => { flush(); }, 900);
    return () => clearTimeout(t);
  }, [draft, flush]);
  // And on leaving.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; flush(); };
  }, [flush]);

  const header = <Stack.Screen options={{ title: id ? 'Note' : 'New note', headerRight: () => <SaveState state={saving} onRetry={flush} /> }} />;
  if (access === 'loading') return <>{header}<Loading /></>;
  if (access !== 'open') return <>{header}<StudyClosed access={access} /></>;
  if (missing) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This note isn't here anymore.</P></Card></View>;
  if (!draft) return <>{header}<Loading /></>;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const found = parseCards(draft.body).length;
  const remove = () => ask('Delete this note?', 'It can\'t be brought back. Flash cards made from it stay.', 'Delete', () => {
    latest.current = null;
    if (!idRef.current) { router.back(); return; }
    deleteStudyNote(idRef.current).then(() => router.back()).catch(oops);
  });
  const makeCards = async () => {
    await flush();
    if (!idRef.current) return;
    router.push({ pathname: '/study/from-note', params: { note: idRef.current } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 14 }]} keyboardShouldPersistTaps="handled">
        <TextInput value={draft.title} onChangeText={(title) => set({ title })} placeholder="Title" placeholderTextColor={PLACEHOLDER}
          accessibilityLabel="Title" maxLength={120} style={{ fontSize: 26, fontWeight: '800', color: NAVY, paddingVertical: 4 }} />
        <SubjectPicker value={draft.subject} onChange={(subject) => set({ subject })} subjects={subjects} />
        <TextInput value={draft.body} onChangeText={(body) => set({ body })} multiline textAlignVertical="top" maxLength={20000}
          placeholder={'Write your notes…\n\nWrite terms as “word - meaning”, one to a line, and they can become flash cards.'}
          placeholderTextColor={PLACEHOLDER} accessibilityLabel="Notes"
          style={{ minHeight: 340, fontSize: 16, lineHeight: 24, color: C.ink, backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
            borderColor: C.line, padding: 14 }} />
        {found > 0 && (
          <Card style={{ gap: 8, borderColor: `${GREEN}55` }}>
            <View style={[s.row, { gap: 8 }]}>
              <Ionicons name="albums" size={20} color={GREEN} />
              <Text style={{ flex: 1, fontWeight: '800', color: C.ink, fontSize: 16 }}>
                {found === 1 ? '1 term' : `${found} terms`} in this note
              </Text>
            </View>
            <P muted>Turn them into flash cards to study.</P>
            <Button label="Make flash cards" onPress={makeCards} />
          </Card>
        )}
        {(id || draft.title || draft.body) ? <Button label="Delete note" kind="ghost" onPress={remove} /> : null}
        {saving === 'error' && <Text style={{ color: C.danger, textAlign: 'center' }}>Not saved yet. Check your connection; it tries again as you type.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** "Saving…", "Saved", or "Not saved" (tap to try again), in the header. */
function SaveState({ state, onRetry }: { state: Saving; onRetry: () => void }) {
  if (state === 'idle') return null;
  const [icon, label, color] = state === 'saving' ? ['cloud-upload-outline', 'Saving…', '#DCE3F7'] as const
    : state === 'saved' ? ['checkmark-circle', 'Saved', '#fff'] as const : ['alert-circle', 'Not saved', '#FECACA'] as const;
  return (
    <Text onPress={state === 'error' ? onRetry : undefined} accessibilityRole={state === 'error' ? 'button' : 'text'}
      style={{ color, fontWeight: '700', marginRight: 8 }}>
      <Ionicons name={icon} size={15} color={color} /> {label}
    </Text>
  );
}
