/**
 * Forms (the Folder on the Main Page): permission slips, releases and acknowledgments. Parents get their Folder
 * (src/schoolForms/Folder.tsx): the newsletter's latest issue first, then the forms still to sign, as a stack of papers.
 * Signed, expired and removed forms leave the folder and stay under Done & removed for 30 days (a removed one can be
 * put back). Then the Forms to Send to Office (Excused Absence). In the Main Page's Staff view, faculty and
 * staff see what parents sent the office (their students' absences, or everyone's for the office) and the forms
 * they've sent, with how many have signed, and send new ones.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isSchoolStaff, listNewsletters, myForms, removeForm, sentForms, type MyForm, type NewsletterSummary, type Person, type SentForm,
} from '../../src/api/connect';
import { PAST_STYLE } from '../../src/calendar/PastToggle';
import { schoolToday } from '../../src/calendar/past';
import { pastForms } from '../../src/schoolForms/folderLists';
import { Folder } from '../../src/schoolForms/Folder';
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
  const [data, setData] = useState<{ mine: MyForm[]; sent: SentForm[]; news: NewsletterSummary | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, sent, news] = await Promise.all([staffView ? [] : myForms(), staffView ? sentForms() : [],
        staffView ? [] : listNewsletters().catch(() => [])]);
      setData({ mine, sent, news: news[0] ?? null }); setError(null);
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
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !data) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" onPress={load} /></Card></View>;
  if (!data) return <Loading />;

  if (staffView) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        <SectionTitle icon="mail-outline" title="Sent to the office" />
        {OFFICE_FORMS.map((f) => <OfficeRow key={f.key} f={f} sub={f.staff} />)}
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

  const { inFolder, past } = pastForms(data.mine, schoolToday());
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} scrollEnabled={!dragging}>
      <Folder news={data.news} forms={inFolder} onRemove={(f) => take(f, true)} onDragging={setDragging} />
      <Pressable onPress={() => setShowPast(!showPast)} accessibilityRole="button" accessibilityState={{ expanded: showPast }}
        style={({ pressed }) => [s.card, s.row, { gap: 10 }, pressed && { opacity: 0.85 }]}>
        <Ionicons name="archive-outline" size={22} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Done & removed ({past.length})</Text>
          <Text style={{ color: C.muted }}>Signed, expired and removed forms from the last 30 days</Text>
        </View>
        <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {showPast && past.length === 0 && <P muted>Nothing from the last 30 days.</P>}
      {showPast && past.map((x) => <PastRow key={x.form.id} x={x} onPutBack={() => take(x.form, false)} />)}
      <SectionTitle icon="mail-outline" title="Forms to Send to Office" />
      {OFFICE_FORMS.map((f) => <OfficeRow key={f.key} f={f} sub={f.parents} />)}
      {inFolder.length === 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="checkmark-done-circle" size={28} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>You’re all caught up</Text>
            <P muted>Permission slips, releases and acknowledgments from the school show up here.</P>
          </View>
        </Card>
      )}
      {isSchoolStaff(me) && <P muted>To send a form, switch the Main Page to Staff.</P>}
    </ScrollView>
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

