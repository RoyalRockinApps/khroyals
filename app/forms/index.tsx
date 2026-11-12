/**
 * The Folder screen. Parents' Folder itself is on top of the Main Page (src/schoolForms/MainFolder.tsx); here they find
 * what left it in the last 30 days under Done & removed (signed, expired and removed forms; notes and bulletins two
 * weeks old or removed; a removed one can be put back), and the Forms to Send to Office (Excused Absence). In the Main
 * Page's Staff view, faculty and staff see what parents sent the office (their students' absences, or everyone's for
 * the office), their class bulletins and notes to families (app/forms/notes.tsx), and the forms they've sent, with how
 * many have signed, and send new ones.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isSchoolStaff, myFolderNotes, myForms, removeFolderNote, removeForm, sentForms, type FolderNote, type MyForm, type Person, type SentForm,
} from '../../src/api/connect';
import { PAST_STYLE } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { pastForms, pastNotes, type PastForm, type PastNote } from '../../src/schoolForms/folderLists';
import { FormsGate } from '../../src/schoolForms/FormsGate';
import { OFFICE_FORMS, type OfficeForm } from '../../src/schoolForms/office';
import { GREEN, Progress, dueText } from '../../src/schoolForms/parts';
import { useStaffView } from '../../src/staffView';
import { SectionTitle } from '../../src/volunteer/parts';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function Forms() {
  return <FormsGate title="Folder">{(me) => <List me={me} />}</FormsGate>;
}

function List({ me }: { me: Person }) {
  const staffView = useStaffView(me);
  const [data, setData] = useState<{ mine: MyForm[]; notes: FolderNote[]; sent: SentForm[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mine, notes, sent] = await Promise.all([staffView ? [] : myForms(), staffView ? [] : myFolderNotes(), staffView ? sentForms() : []]);
      setData({ mine, notes, sent }); setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [staffView]);
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

  if (staffView) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        <SectionTitle icon="mail-outline" title="Sent to the office" />
        {OFFICE_FORMS.map((f) => <OfficeRow key={f.key} f={f} sub={f.staff} />)}
        <SectionTitle icon="megaphone-outline" title="Bulletins & notes" />
        <LinkRow icon="megaphone-outline" title="Class bulletins and notes to families" href="/forms/notes"
          sub="Post to your classes or write to a student’s parents; see who has read them" />
        <SectionTitle icon="document-text-outline" title="Forms you send" />
        <Button label="+ New form" onPress={() => router.push('/forms/new')} />
        {data.sent.length === 0 && <Card><P muted>Forms you send to a class, an activity or the school show up here, with who has signed.</P></Card>}
        {data.sent.map((f) => {
          const signed = f.agreed + f.declined;
          return (
            <Card key={f.id} onPress={() => router.push(`/forms/${f.id}`)} style={f.status === 'closed' ? { gap: 4, ...PAST_STYLE } : { gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
              <Text style={{ color: C.muted }}>{[f.sentTo, dueText(f)].filter(Boolean).join(' · ')}</Text>
              <Progress done={signed} total={f.students} />
              <Text style={{ color: C.ink, fontWeight: '600' }}>
                {signed} of {f.students} signed{f.declined ? ` · ${f.declined} declined` : ''}{f.feeCents ? ` · ${f.paid} paid` : ''}
              </Text>
            </Card>
          );
        })}
      </ScrollView>
    );
  }

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
      {OFFICE_FORMS.map((f) => <OfficeRow key={f.key} f={f} sub={f.parents} />)}
      {isSchoolStaff(me) && <P muted>To send a form, a bulletin or a note, switch the Main Page to Staff.</P>}
    </ScrollView>
  );
}

/** A row that opens another screen. */
function LinkRow({ icon, title, sub, href }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; href: Href }) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button"
      style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.85 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={C.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{title}</Text>
        <Text style={{ color: C.muted }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
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
function OfficeRow({ f, sub }: { f: OfficeForm; sub: string }) {
  return (
    <Pressable onPress={() => router.push(f.href)} accessibilityRole="button"
      style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.85 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={f.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={C.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
        <Text style={{ color: C.muted }}>{sub}</Text>
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
          <Text key={c.studentId} style={{ fontWeight: '700', color: c.response ? (c.response.agreed ? GREEN : C.danger) : C.accent }}>
            {c.name}: {c.response ? (c.response.agreed ? 'signed' : 'declined') : 'to sign'}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

