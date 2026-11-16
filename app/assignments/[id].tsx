/**
 * One assignment. A student reads it and, for a class assignment, turns in work: documents from their files or photos
 * of their work (src/assignments/pickWork.ts), up to WORK_MAX_FILES, each opening again with a tap; they remove their
 * own. Only they and the class's teachers see what they turned in. Its teacher sees every student in the class with
 * what they turned in (marked Late when it came after the due date), opens each file, and downloads them all as one
 * ZIP with a folder per student (Download all, src/assignments/downloadAll.ts).
 */
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  assignmentWork, errorText, isSchoolStaff, listAssignments, live, removeWork, session, turnInWork, workFileUrl,
  type Assignment, type AssignmentFile, type Person, type StudentWork,
} from '../../src/api/connect';
import { downloadAllWork } from '../../src/assignments/downloadAll';
import { dueLabel } from '../../src/assignments/groups';
import { WORK_MAX_FILES, WORK_MAX_MB, WORK_TYPES, sizeText, turnedInLate, type WorkType } from '../../src/assignments/fileTypes';
import { pickWork, type WorkSource } from '../../src/assignments/pickWork';
import { schoolToday } from '../../src/calendar/past';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Chip, H, Loading, P, ask, s } from '../../src/ui';

const GREEN = '#15803D';

type Data = { me: Person | null; a: Assignment | null; work: StudentWork[] | null };

const open = (f: AssignmentFile) => workFileUrl(f.path).then((url) => Linking.openURL(url)).catch((e) => Alert.alert('Couldn’t open it', errorText(e)));
const iconOf = (mime: string): React.ComponentProps<typeof Ionicons>['name'] =>
  mime.startsWith('image/') ? 'image-outline' : mime === 'application/pdf' ? 'document-text-outline' : 'document-outline';
const labelOf = (mime: string) => WORK_TYPES[mime as WorkType]?.label ?? 'File';
const dayOf = (at: string) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = live ? await session() : null;
      const a = me && !me.pending ? (await listAssignments()).find((x) => x.id === id) ?? null : null;
      const work = a?.rosterId && me && isSchoolStaff(me) ? await assignmentWork(a.id) : null;
      setData({ me, a, work });
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: data?.a?.title ?? 'Assignment' }} />;
  const box = (body: React.ReactNode) => <View style={[s.screen, s.pad]}>{header}{body}</View>;
  if (!live) return box(<Card><H>Assignments need the school server</H><P muted>This build is running on demo data.</P></Card>);
  if (error && !data) return box(<Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card>);
  if (!data) return <>{header}<Loading /></>;
  const { me, a, work } = data;
  if (!me || !a) return box(<Card><P muted>This assignment isn’t one of yours, or its teacher removed it.</P></Card>);
  const student = me.schoolRole === 'student' && !me.pending;

  const add = async (source: WorkSource) => {
    try {
      const f = await pickWork(source);
      if (!f) return;
      setBusy(true);
      await turnInWork(a.id, f);
      await load();
    } catch (e) {
      Alert.alert('Not turned in', errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = (f: AssignmentFile) => ask('Remove this file?', `${f.name}. Your teacher won’t see it anymore.`, 'Remove', async () => {
    setBusy(true);
    try { await removeWork(f.id); await load(); } catch (e) { Alert.alert('Not removed', errorText(e)); } finally { setBusy(false); }
  });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      <Card style={{ gap: 6 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{a.title}</Text>
        <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
          <Chip label={a.className ?? 'My own'} color={a.className ? C.primary : C.muted} />
          <Chip label={dueLabel(a.dueOn).replace(/^Overdue · /, 'Was due ')} color={C.accent} />
        </View>
        {!!a.details && <P>{a.details}</P>}
      </Card>

      {student && (a.rosterId ? (
        <Card style={{ gap: 10 }}>
          <SectionTitle icon="cloud-upload-outline" title="Your work" tint={a.files.length ? GREEN : C.primary} />
          {a.files.length === 0 && <P muted>Nothing turned in yet.</P>}
          {a.files.map((f) => (
            <FileRow key={f.id} f={f} late={turnedInLate(a.dueOn, schoolToday(new Date(f.at)))} onRemove={busy ? undefined : () => remove(f)} />
          ))}
          {busy && <P muted>Working on it…</P>}
          {a.files.length < WORK_MAX_FILES ? (
            <View style={{ gap: 8 }}>
              <Button label="Choose a file" onPress={() => add('file')} disabled={busy} />
              {Platform.OS !== 'web' && <Button kind="ghost" label="Take a photo of your work" onPress={() => add('camera')} disabled={busy} />}
              <Button kind="ghost" label="Pick a photo" onPress={() => add('photos')} disabled={busy} />
            </View>
          ) : <P muted>That’s {WORK_MAX_FILES} files, the most for one assignment. Remove one to add another.</P>}
          <P muted>PDF, Word, PowerPoint, Excel, a text file or a photo, up to {WORK_MAX_MB} MB each. Only you and your teacher see what you turn in.</P>
        </Card>
      ) : <P muted>This is your own assignment. Turning in work is for your classes’ assignments.</P>)}

      {work && <ClassWork a={a} work={work} />}
    </ScrollView>
  );
}

/** One turned-in file: tap to open it; the student's own have a remove button. */
function FileRow({ f, late, onRemove }: { f: AssignmentFile; late: boolean; onRemove?: () => void }) {
  return (
    <View style={[s.row, { gap: 10 }]}>
      <Pressable onPress={() => open(f)} accessibilityRole="button" accessibilityLabel={`Open ${f.name}`}
        style={({ pressed }) => [s.row, { flex: 1, gap: 10, paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: `${C.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={iconOf(f.mimeType)} size={20} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }} numberOfLines={1}>{f.name}</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>{labelOf(f.mimeType)} · {sizeText(f.size)} · {dayOf(f.at)}</Text>
        </View>
        {late && <Chip label="Late" color={C.danger} />}
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`}>
          <Ionicons name="trash-outline" size={18} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** For the class's teachers: who turned in what, and who hasn't yet; Download all saves every file as one ZIP. */
function ClassWork({ a, work }: { a: Assignment; work: StudentWork[] }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const done = work.filter((w) => w.files.length > 0);
  const waiting = work.filter((w) => w.files.length === 0);
  const files = done.reduce((n, w) => n + w.files.length, 0);
  const downloadAll = async () => {
    setProgress({ done: 0, total: files });
    try {
      await downloadAllWork(a.title, a.className, work, (d, total) => setProgress({ done: d, total }));
    } catch (e) {
      Alert.alert('Not downloaded', errorText(e));
    } finally {
      setProgress(null);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle icon="people-outline" title={`Turned in · ${done.length} of ${work.length}`} tint={GREEN} />
      {work.length === 0 && <P muted>No students in this class yet.</P>}
      {files > 0 && (
        <Button label={progress ? (progress.done < progress.total ? `Downloading ${progress.done} of ${progress.total}…` : 'Making the ZIP…')
          : `Download all (${files} ${files === 1 ? 'file' : 'files'})`} onPress={downloadAll} disabled={!!progress} />
      )}
      {done.map((w) => (
        <View key={w.studentId} style={{ gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontWeight: '800', color: C.ink }}>{w.name}</Text>
          {w.files.map((f) => <FileRow key={f.id} f={f} late={turnedInLate(a.dueOn, schoolToday(new Date(f.at)))} />)}
        </View>
      ))}
      {waiting.length > 0 && (
        <View style={{ gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.muted }}>NOT TURNED IN YET ({waiting.length})</Text>
          <P muted>{waiting.map((w) => w.name).join(', ')}</P>
        </View>
      )}
      <P muted>Only the class’s teachers and each student see what they turned in. Download all makes one ZIP with a folder per student.</P>
    </Card>
  );
}
