/**
 * Royal News: every issue of the school's emailed newsletter, newest first, by month. Staff who
 * send notifications (push.send) write or paste an issue (app/royal-news/write.tsx), add one from
 * its Smore link, or remove one; anyone with the power who hasn't verified does so right here. Their header gear opens the
 * Planner card's A/B test (app/experiments/[key].tsx).
 */
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteNewsletter, errorText, importNewsletter, issueDate, listNewsletters, live, myAccess, session, type NewsletterSummary,
} from '../../src/api/connect';
import { ManageButton } from '../../src/ManageButton';
import { mayHave, needsCodeFor } from '../../src/comms/mfa';
import { VerifyCard } from '../../src/comms/MfaGate';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';
import { SCHOOL } from '../../src/school';

const month = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onYes }]);
};

export default function RoyalNews() {
  const [issues, setIssues] = useState<NewsletterSummary[] | null>(null);
  const [canAdd, setCanAdd] = useState(false);
  const [canTest, setCanTest] = useState(false);   // may run the Planner card's A/B test (after verifying, if need be)
  // Holds Send notifications but hasn't verified with the authenticator app in this session.
  const [needsCode, setNeedsCode] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setIssues(await listNewsletters());
      if (live && await session()) {
        const a = await myAccess().catch(() => null);
        const can = !!a?.permissions.includes('push.send');
        setCanAdd(can);
        setNeedsCode(needsCodeFor(a, 'push.send'));
        setCanTest(mayHave(a, 'push.send'));
      }
    } catch (e) {
      Alert.alert(`${SCHOOL.newsName} didn't load`, errorText(e));
      setIssues([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    setBusy(true);
    try {
      const r = await importNewsletter(link);
      setLink('');
      await load();
      router.push(`/royal-news/${r.id}`);
    } catch (e) {
      Alert.alert('Not added', errorText(e));
    }
    setBusy(false);
  };
  const remove = (n: NewsletterSummary) => confirm('Delete this issue?', `${n.title}, ${issueDate(n.sentOn)}`,
    () => deleteNewsletter(n.id).then(load).catch((e) => Alert.alert('Not deleted', errorText(e))));

  const header = <Stack.Screen options={{ title: SCHOOL.newsName, headerRight: () => (
    <ManageButton app={SCHOOL.newsName} items={canTest ? [{ icon: 'flask-outline', label: 'A/B test: the Planner card',
      sub: `Which ${SCHOOL.newsName} card gets more people reading`, href: { pathname: '/experiments/[key]', params: { key: 'royal_news_card' } } }] : []} />
  ) }} />;
  if (!issues) return <>{header}<Loading /></>;
  const byMonth = new Map<string, NewsletterSummary[]>();
  issues.forEach((n) => byMonth.set(month(n.sentOn), [...(byMonth.get(month(n.sentOn)) ?? []), n]));

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 12 }]} keyboardShouldPersistTaps="handled">
      {header}
      <P muted>The school's newsletter, emailed to families. Every issue stays here to look back on.</P>
      {needsCode && <VerifyCard why="Admins who add issues verify first." onVerified={load} />}
      {canAdd && <Button label="✏️ Write or paste an issue" onPress={() => router.push('/royal-news/write')} />}
      {canAdd && (
        <Card style={{ gap: 8 }}>
          <H>Or add it from Smore</H>
          <Field label="Smore link" placeholder="https://app.smore.com/n/…" autoCapitalize="none" autoCorrect={false}
            keyboardType="url" value={link} onChangeText={setLink} />
          <Button label={busy ? 'Adding…' : `Add to ${SCHOOL.newsName}`} onPress={add} disabled={busy || !link.trim()} />
          <P muted>Paste the link from the newsletter email (View in browser) or from Smore. Adding the same link again updates it.</P>
        </Card>
      )}
      {!issues.length && <Card><P muted>No issues yet.</P></Card>}
      {[...byMonth].map(([m, list]) => (
        <View key={m} style={{ gap: 8 }}>
          <Text style={{ fontWeight: '800', color: C.muted }}>{m.toUpperCase()}</Text>
          {list.map((n, i) => (
            <Card key={n.id} onPress={() => router.push(`/royal-news/${n.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={issues[0].id === n.id ? 'mail-unread-outline' : 'mail-open-outline'} size={22} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{n.title}{issues[0].id === n.id ? '  · Latest' : ''}</Text>
                <P muted>{issueDate(n.sentOn)}</P>
                {canAdd && <Text style={{ color: C.danger, marginTop: 2 }} onPress={() => remove(n)}>Delete</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
