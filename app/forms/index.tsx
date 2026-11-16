/**
 * The Folder screen. Parents' Folder itself is on top of the Main Page (src/schoolForms/MainFolder.tsx); here they find
 * what left it in the last 30 days under Done & removed (signed, expired and removed forms; notes and bulletins two
 * weeks old or removed; a removed one can be put back), and the Forms to Send to Office (Excused Absence). In the Main
 * Page's Staff view it's the senders' side (src/schoolForms/StaffFolder.tsx): the forms, bulletins and notes they send
 * families, and the notes parents write back.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isSchoolStaff, myFolderNotes, myForms, removeFolderNote, removeForm, type FolderNote, type MyForm, type Person,
} from '../../src/api/connect';
import { PAST_STYLE } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { pastForms, pastNotes, type PastForm, type PastNote } from '../../src/schoolForms/folderLists';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { OFFICE_FORMS, type OfficeForm } from '../../src/schoolForms/office';
import { GREEN } from '../../src/schoolForms/parts';
import { StaffFolder } from '../../src/schoolForms/StaffFolder';
import { useStaffView } from '../../src/staffView';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function Forms() {
  return <FormsGate title="Folder">{(me) => <Folder me={me} />}</FormsGate>;
}

function Folder({ me }: { me: Person }) {
  const staffView = useStaffView(me);
  return staffView ? <StaffFolder me={me} /> : <List me={me} />;
}

/** The parents' side: Done & removed, and the Forms to Send to Office. */
function List({ me }: { me: Person }) {
  const [data, setData] = useState<{ mine: MyForm[]; notes: FolderNote[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, notes] = await Promise.all([myForms(), myFolderNotes()]);
      setData({ mine, notes }); setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  const take = async (f: MyForm, removed: boolean) => {
    // Out of view straight away; back if the school's server says no.
    setData((d) => d && { ...d, mine: d.mine.map((x) => (x.id === f.id ? { ...x, removedAt: removed ? new Date().toISOString() : null } : x)) });
    try { await removeForm(f.id, removed); } catch (e) { Alert.alert('Folder', errorText(e)); }
    load();
  };
  const putBack = async (n: FolderNote) => {
    setData((d) => d && { ...d, notes: d.notes.map((x) => (x.id === n.id ? { ...x, removedAt: null } : x)) });
    try { await removeFolderNote(n.id, false); } catch (e) { Alert.alert('Folder', errorText(e)); }
    load();
  };
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!data) return <Loading />;

  const today = schoolToday();
  const forms = pastForms(data.mine, today);
  const notes = pastNotes(data.notes, today);
  const inFolder = forms.inFolder.length + notes.inFolder.length;
  // Forms and notes together, newest first.
  const past: { on: string; form?: PastForm; note?: PastNote }[] = [...forms.past.map((x) => ({ on: x.on, form: x })), ...notes.past.map((x) => ({ on: x.on, note: x }))]
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Pressable onPress={() => router.navigate('/apps')} accessibilityRole="button"
        style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.85 }]}>
        <Ionicons name="folder-open" size={26} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>
            {inFolder ? `${inFolder} ${inFolder === 1 ? 'paper' : 'papers'} in your folder` : 'Your folder is clear'}
          </Text>
          <Text style={{ color: C.muted }}>Your folder is at the top of the Main Page: tap it to open it.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </Pressable>
      <SectionTitle icon="archive-outline" title={`Done & removed (${past.length})`} />
      {past.length === 0 && <P muted>Nothing from the last 30 days.</P>}
      {past.map(({ form: f, note: n }) => (f
        ? <PastRow key={`f${f.form.id}`} x={f} onPutBack={() => take(f.form, false)} />
        : n && <PastNoteRow key={`n${n.note.id}`} x={n} onPutBack={() => putBack(n.note)} />))}
      <SectionTitle icon="mail-outline" title="Forms to Send to Office" />
      {OFFICE_FORMS.map((f) => <OfficeRow key={f.key} f={f} />)}
      {isSchoolStaff(me) && <P muted>To send a form, a bulletin or a note, switch the Main Page to Staff.</P>}
    </ScrollView>
  );
}

/** A note or bulletin out of the Folder: why and when, and Put back for one removed in its two weeks. */
function PastNoteRow({ x, onPutBack }: { x: PastNote; onPutBack: () => void }) {
  const n = x.note;
  return (
    <Pressable onPress={() => router.push(`/forms/note/${n.id}` as Href)} accessibilityRole="button"
      style={({ pressed }) => [s.card, { gap: 6 }, PAST_STYLE, pressed && { opacity: 0.85 }]}>
      <View style={s.row}>
        <Ionicons name={n.kind === 'note' ? 'create-outline' : 'megaphone-outline'} size={22} color={x.why === 'removed' ? C.danger : C.muted} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
          {n.title || (n.kind === 'note' ? `Note from ${n.from}` : 'Class bulletin')}
        </Text>
        {x.canPutBack
          ? <Text onPress={onPutBack} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>Put back</Text>
          : <Ionicons name="chevron-forward" size={18} color={C.muted} />}
      </View>
      <Text style={{ color: C.muted }}>{[x.label, n.kind === 'note' ? `About ${n.children.join(' and ')}` : n.classes.join(', ')].join(' · ')}</Text>
    </Pressable>
  );
}

/** A form families send the office (Excused Absence), which opens its own screen. */
function OfficeRow({ f }: { f: OfficeForm }) {
  return (
    <Pressable onPress={() => router.push(f.href)} accessibilityRole="button"
      style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.85 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={f.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={C.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
        <Text style={{ color: C.muted }}>{f.parents}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

/** A form out of the Folder: why (signed, expired or removed) and when, each child's status, and Put back for a removed one still open. */
function PastRow({ x, onPutBack }: { x: ReturnType<typeof pastForms>['past'][number]; onPutBack: () => void }) {
  const f = x.form;
  const icon = x.why === 'signed' ? 'checkmark-circle' : x.why === 'removed' ? 'trash-outline' : 'time-outline';
  const color = x.why === 'signed' ? GREEN : x.why === 'removed' ? C.danger : C.muted;
  return (
    <Pressable onPress={() => router.push(`/forms/${f.id}`)} accessibilityRole="button"
      style={({ pressed }) => [s.card, { gap: 6 }, PAST_STYLE, pressed && { opacity: 0.85 }]}>
      <View style={s.row}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
        {x.canPutBack
          ? <Text onPress={onPutBack} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>Put back</Text>
          : <Ionicons name="chevron-forward" size={18} color={C.muted} />}
      </View>
      <Text style={{ color: C.muted }}>{[x.label, f.sentTo].filter(Boolean).join(' · ')}</Text>
      <View style={[s.row, { flexWrap: 'wrap', gap: 10 }]}>
        {f.children.map((c) => (
          <Text key={c.studentId} style={{ fontWeight: '700', color: c.response ? (c.response.agreed ? GREEN : C.danger) : x.canPutBack ? C.accent : C.muted }}>
            {c.name}: {c.response ? (c.response.agreed ? 'signed' : 'declined') : x.canPutBack ? 'to sign' : 'not signed'}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

