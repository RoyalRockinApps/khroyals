/**
 * Tell Someone reports (Safety reports permission holders, in an authenticator-verified session; the Admin portal's tools
 * in other apps, and the notification each new report sends). New reports first, urgent ones (someone might hurt
 * themselves or others) on top in red; then the ones seen and the closed ones. Each shows what the student told, where,
 * when and who, and their name only if they included it. Mark seen (the student is told the school has it), or close
 * with a note only readers see.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, live, safetyReportsAll, updateSafetyReport, type SafetyReport } from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import { Band, BandTabs, Stat, Stats } from '../../src/hub';
import { kindLabel } from '../../src/safety/kinds';
import { Button, C, Card, Chip, Loading, P, PLACEHOLDER, s } from '../../src/ui';

const RED = '#B42318';
const GREEN = '#15803D';
type Tab = 'new' | 'seen' | 'closed';
const TABS: [Tab, string][] = [['new', 'New'], ['seen', 'Seen'], ['closed', 'Closed']];
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function SafetyReports() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tell Someone reports' }} />
      {live ? <MfaGate>{() => <Reports />}</MfaGate> : <Reports />}
    </>
  );
}

function Reports() {
  const [list, setList] = useState<SafetyReport[] | null>(null);
  const [tab, setTab] = useState<Tab>('new');
  const [closing, setClosing] = useState<{ id: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => safetyReportsAll().then(setList).catch((e) => { Alert.alert('Tell Someone', errorText(e)); setList([]); }), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!list) return <Loading />;

  const count = (t: Tab) => list.filter((r) => r.status === t).length;
  const shown = list.filter((r) => r.status === tab);
  const act = (id: string, status: 'seen' | 'closed', note?: string) => {
    setBusy(true);
    updateSafetyReport(id, status, note).then(() => { setClosing(null); load(); }).catch((e) => Alert.alert('Not saved', errorText(e))).finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Band>
        <Stats>
          <Stat n={count('new')} label="New" alert={count('new') > 0} />
          <Stat n={count('seen')} label="Seen, still open" />
          <Stat n={count('closed')} label="Closed this year" />
        </Stats>
        <BandTabs tabs={TABS} value={tab} onChange={setTab} />
      </Band>
      <P muted>From students in Tell Someone. Their name shows only when they included it. Marking a report seen tells the student the school has it.</P>
      {shown.length === 0 && <Card><P muted>{tab === 'new' ? 'No new reports.' : tab === 'seen' ? 'No open reports.' : 'Nothing closed this year.'}</P></Card>}
      {shown.map((r) => (
        <View key={r.id} style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: r.urgent ? 2 : 1, borderColor: r.urgent ? RED : C.line, padding: 14, gap: 8 }}>
          <View style={[s.row, { gap: 8 }]}>
            {r.urgent && <Ionicons name="warning" size={18} color={RED} />}
            <Text style={{ flex: 1, fontWeight: '900', color: r.urgent ? RED : C.ink, fontSize: 16 }}>{kindLabel(r.kind)}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{when(r.createdAt)}</Text>
          </View>
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            {r.named ? <Chip label={`${r.reporter ?? 'A student'}${r.grade ? ` · ${r.grade}th grade` : ''}`} /> : <Chip label="Name left off" color={C.muted} />}
          </View>
          <Text style={{ color: C.ink, fontSize: 16, lineHeight: 23 }} selectable>{r.what}</Text>
          {[['Where', r.place], ['When', r.when], ['Who', r.people]].filter(([, v]) => v).map(([k, v]) => (
            <Text key={k} style={{ color: C.ink }}><Text style={{ fontWeight: '800' }}>{k}: </Text>{v}</Text>
          ))}
          {!!r.seenBy && <Text style={{ color: GREEN, fontWeight: '700' }}>Seen by {r.seenBy}{r.seenAt ? `, ${when(r.seenAt)}` : ''}</Text>}
          {!!r.staffNote && <Text style={{ color: C.muted }}><Text style={{ fontWeight: '800' }}>Note: </Text>{r.staffNote}</Text>}
          {r.status === 'new' && <Button label={busy ? 'Saving…' : 'Mark seen'} disabled={busy} onPress={() => act(r.id, 'seen')} />}
          {r.status !== 'closed' && (closing?.id === r.id ? (
            <View style={{ gap: 8 }}>
              <TextInput value={closing.note} onChangeText={(note) => setClosing({ id: r.id, note })} multiline maxLength={2000}
                placeholder="What was done (only readers see this)" placeholderTextColor={PLACEHOLDER} accessibilityLabel="Closing note"
                style={{ minHeight: 80, fontSize: 16, color: C.ink, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, textAlignVertical: 'top' }} />
              <Button label={busy ? 'Saving…' : 'Close it'} disabled={busy} onPress={() => act(r.id, 'closed', closing.note)} />
              <Button label="Cancel" kind="ghost" onPress={() => setClosing(null)} />
            </View>
          ) : <Button label="Close with a note" kind="ghost" onPress={() => setClosing({ id: r.id, note: '' })} />)}
        </View>
      ))}
    </ScrollView>
  );
}
