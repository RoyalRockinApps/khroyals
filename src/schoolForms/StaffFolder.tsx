/**
 * The Folder's senders' side (the Folder tile on the Main Page's Staff view): what a teacher or staff member puts in
 * families' Folders, and what parents write back, in three tabs.
 * - Forms: + New form; the ones families can still sign (soonest due first) with how many have signed, and the closed
 *   and past-due ones behind "Show past forms". With Send forms it's everyone's (the others' say who sent them).
 * - Bulletins: + Class bulletin and + Note to a family, and what they sent in the last 90 days with how many parents
 *   opened it.
 * - From parents: notes parents wrote them from their Folder in the last 90 days, New until opened.
 * Only people who lead a class section (or sent or got a note) have the last two, so the rest see their forms alone.
 * Absence reports are in Classes, with the roll. `?show=forms|notes|parents` opens a tab.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, mySections, parentNotes, sentFolderNotes, sentForms, type ParentNote, type Person, type SentFolderNote, type SentForm,
} from '../api/connect';
import { PAST_STYLE, PastToggle, usePastToggle } from '../calendar/PastToggle';
import { schoolToday } from '../calendar/past';
import { Button, C, Card, Loading, P, s } from '../ui';
import { sentFormLists } from './folderLists';
import { GREEN, Progress, dueText } from './parts';

type Tab = 'forms' | 'notes' | 'parents';
type Data = { forms: SentForm[]; notes: SentFolderNote[]; classes: number; fromParents: ParentNote[] };

const shortDay = (at: string) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function StaffFolder({ me }: { me: Person }) {
  const { show } = useLocalSearchParams<{ show?: string }>();
  const asked: Tab | null = show === 'forms' || show === 'notes' || show === 'parents' ? show : null;
  const [tab, setTab] = useState<Tab>(asked ?? 'forms');
  useEffect(() => { if (asked) setTab(asked); }, [asked]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const past = usePastToggle();

  const load = useCallback(() => {
    Promise.all([sentForms(), sentFolderNotes(), mySections(), parentNotes()])
      .then(([forms, notes, sections, fromParents]) => {
        setData({ forms, notes, classes: sections.length, fromParents: fromParents.filter((n) => !n.mine) });
        setError(null);
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!data) return <Loading />;

  const forms = sentFormLists(data.forms, schoolToday());
  const fresh = data.fromParents.filter((n) => !n.readAt).length;
  // Bulletins and notes from parents are a class teacher's; everyone else sends forms only.
  const teaches = data.classes > 0 || data.notes.length > 0 || data.fromParents.length > 0;
  const shown: Tab = teaches ? tab : 'forms';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {teaches && (
        <Tabs value={shown} onChange={(t) => { setTab(t); past.hide(); }} tabs={[
          { key: 'forms', label: 'Forms', sub: forms.open.length ? `${forms.open.length} open` : 'None open' },
          { key: 'notes', label: 'Bulletins', sub: 'and notes' },
          { key: 'parents', label: 'From parents', sub: fresh ? `${fresh} new` : 'None new', alert: fresh > 0 },
        ]} />
      )}

      {shown === 'forms' && (
        <>
          <Button label="+ New form" onPress={() => router.push('/forms/new')} />
          {forms.open.length === 0 && (
            <Card><P muted>{data.forms.length ? 'No forms waiting for signatures.' : 'Forms you send to a class, an activity or the school show up here, with who has signed.'}</P></Card>
          )}
          {forms.open.map((f) => <SentFormCard key={f.id} f={f} mine={f.authorId === me.id} />)}
          <PastToggle count={forms.past.length} shown={past.shown} onToggle={past.toggle} noun="forms" />
          {past.shown && forms.past.map((f) => <SentFormCard key={f.id} f={f} mine={f.authorId === me.id} past />)}
        </>
      )}

      {shown === 'notes' && (
        <>
          {data.classes === 0 ? (
            <Card><P muted>{'You don’t lead a class section anymore, so there’s no one to write to. The office sets up sections in Admin portal → Classes.'}</P></Card>
          ) : (
            <View style={[s.row, { gap: 10 }]}>
              <View style={{ flex: 1 }}><Button label="+ Class bulletin" onPress={() => router.push({ pathname: '/forms/write', params: { kind: 'bulletin' } })} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" label="+ Note to a family" onPress={() => router.push({ pathname: '/forms/write', params: { kind: 'note' } })} /></View>
            </View>
          )}
          <P muted>A bulletin goes to every family in the classes you pick; a note to one student’s parents. Both land in their Folder, and they’re told.</P>
          {data.notes.length === 0 && data.classes > 0 && <Card><P muted>What you send shows up here, with how many parents have read it.</P></Card>}
          {data.notes.map((n) => <SentNoteCard key={n.id} n={n} />)}
        </>
      )}

      {shown === 'parents' && (
        <>
          {data.fromParents.length === 0
            ? <Card><P muted>When a parent writes to you from their Folder, the note shows up here, and you can answer with a note back.</P></Card>
            : data.fromParents.map((n) => <ParentNoteCard key={n.id} n={n} />)}
          {data.fromParents.length > 0 && <P muted>Notes from the last 90 days.</P>}
        </>
      )}
    </ScrollView>
  );
}

/** The three tabs across the top: a name and a count under it. */
function Tabs({ tabs, value, onChange }: { tabs: { key: Tab; label: string; sub: string; alert?: boolean }[]; value: Tab; onChange: (t: Tab) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${t.label}, ${t.sub}`}
            style={({ pressed }) => [{ flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12,
              backgroundColor: on ? C.primary : 'transparent' }, pressed && !on && { opacity: 0.6 }]}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: on ? '#fff' : C.ink }}>{t.label}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: on ? 'rgba(255, 255, 255, 0.85)' : t.alert ? C.accent : C.muted }}>{t.sub}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A form they (or, with Send forms, someone else) sent: who it went to, when it's due, and how many have signed. */
function SentFormCard({ f, mine, past }: { f: SentForm; mine: boolean; past?: boolean }) {
  const signed = f.agreed + f.declined;
  return (
    <Card onPress={() => router.push(`/forms/${f.id}`)} style={past ? { gap: 4, ...PAST_STYLE } : { gap: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{f.title}</Text>
      <Text style={{ color: C.muted }}>{[f.sentTo, dueText(f), !mine && f.author ? `from ${f.author}` : null].filter(Boolean).join(' · ')}</Text>
      <Progress done={signed} total={f.students} />
      <Text style={{ color: C.ink, fontWeight: '600' }}>
        {signed} of {f.students} signed{f.declined ? ` · ${f.declined} declined` : ''}{f.feeCents ? ` · ${f.paid} paid` : ''}
      </Text>
    </Card>
  );
}

/** A bulletin or note they sent, with how many parents opened it. */
function SentNoteCard({ n }: { n: SentFolderNote }) {
  return (
    <Card onPress={() => router.push(`/forms/note/${n.id}` as Href)} style={{ gap: 4 }}>
      <View style={[s.row, { gap: 8 }]}>
        <Ionicons name={n.kind === 'note' ? 'create-outline' : 'megaphone-outline'} size={20} color={C.primary} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>{n.title || n.body.split('\n')[0]}</Text>
      </View>
      <Text style={{ color: C.muted }}>{n.kind === 'note' ? 'Note' : 'Bulletin'} to {n.to} · {shortDay(n.sentAt)}</Text>
      <Progress done={n.read} total={n.parents} />
      <Text style={{ color: n.parents && n.read === n.parents ? GREEN : C.ink, fontWeight: '600' }}>
        Read by {n.read} of {n.parents} {n.parents === 1 ? 'parent' : 'parents'}
      </Text>
    </Card>
  );
}

/** A note a parent wrote them, New until they open it. */
function ParentNoteCard({ n }: { n: ParentNote }) {
  return (
    <Card onPress={() => router.push(`/forms/from-parent/${n.id}` as Href)} style={{ gap: 4 }}>
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
      <Text style={{ color: C.muted }}>{shortDay(n.sentAt)}</Text>
    </Card>
  );
}
