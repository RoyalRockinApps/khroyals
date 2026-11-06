/**
 * The Royal News card on the Planner, and the first A/B test (royal_news_card, src/experiments/registry.ts). Version A,
 * which everyone sees when the test isn't running: "Royal News" with a line about the newsletter, opening the archive.
 * Version B: the latest issue's title and date, a New badge in its first week, and Read it, opening that issue.
 * `visible` says the card has scrolled into view on the Planner: that's when it counts as seen; a tap counts as opened
 * (reading to the end is counted on the issue screen). Each counts once per issue.
 */
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { issueDate, listNewsletters, logExperiment, myVariant, type NewsletterSummary } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { SCHOOL } from '../school';
import { C, Card, P } from '../ui';

const KEY = 'royal_news_card';

/** Is an issue from the last week (so B shows New)? */
const isNew = (sentOn: string, today = schoolToday()) =>
  (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${sentOn}T12:00:00Z`).getTime()) / 86_400_000 < 7;

export function RoyalNewsCard({ visible }: { visible: boolean }) {
  const [variant, setVariant] = useState<string | null>(null);
  const [latest, setLatest] = useState<NewsletterSummary | null>(null);
  useEffect(() => {
    let on = true;
    myVariant(KEY).then((v) => on && setVariant(v)).catch(() => {});
    listNewsletters().then((l) => on && setLatest(l[0] ?? null)).catch(() => {});
    return () => { on = false; };
  }, []);
  useEffect(() => { if (visible && variant && latest) logExperiment(KEY, 'seen', latest.id); }, [visible, variant, latest]);

  const b = variant === 'b' && !!latest;
  const open = () => {
    if (variant && latest) logExperiment(KEY, 'opened', latest.id);
    if (b) router.push(`/royal-news/${latest!.id}`);
    else if (SCHOOL.newsUrl) Linking.openURL(SCHOOL.newsUrl);
    else router.navigate('/royal-news');
  };
  return <NewsCardView latest={b ? latest : null} onPress={open} />;
}

/** The card itself: version B when given the latest issue, else version A. */
export function NewsCardView({ latest, onPress }: { latest: NewsletterSummary | null; onPress: () => void }) {
  if (latest) {
    const fresh = isNew(latest.sentOn);
    return (
      <Card onPress={onPress} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="mail-unread-outline" size={18} color={C.primary} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted }}>{SCHOOL.newsName.toUpperCase()}</Text>
          {fresh && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff' }}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }} numberOfLines={2}>{latest.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, color: C.muted }}>{issueDate(latest.sentOn)}</Text>
          <Text style={{ color: C.primary, fontWeight: '800' }}>Read it ›</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="mail-open-outline" size={22} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{SCHOOL.newsName}</Text>
        <P muted>The school newsletter, sent to families by email. Read this week's and past issues.</P>
      </View>
      <Ionicons name={SCHOOL.newsUrl ? 'open-outline' : 'chevron-forward'} size={18} color={C.muted} />
    </Card>
  );
}
