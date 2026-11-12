/**
 * The Royal News button on the Planner (above Coming Up): the newsletter's masthead, in its brush script on ruled paper
 * like an issue's first page (src/news/paper.tsx). It's also the first A/B test (royal_news_card,
 * src/experiments/registry.ts). Version A, which everyone sees when the test isn't running, opens the list of issues.
 * Version B adds the latest issue's date (and New in its first week) under the masthead and opens that issue.
 * `visible` says the button has scrolled into view on the Planner: that's when it counts as seen; a tap counts as
 * opened (reading to the end is counted on the issue screen). Each counts once per issue.
 */
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { issueDate, listNewsletters, logExperiment, myVariant, type NewsletterSummary } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { SCHOOL } from '../school';
import { NEWS, RULE, RuledLines, SERIF, useMastheadFont } from './paper';

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
  return <NewsButton latest={b ? latest : null} onPress={open} />;
}

/** The button: the masthead on ruled paper, with the latest issue's date under it when given one (version B). */
export function NewsButton({ latest, onPress }: { latest: NewsletterSummary | null; onPress: () => void }) {
  const script = useMastheadFont();
  const [height, setHeight] = useState(0);
  const fresh = !!latest && isNew(latest.sentOn);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={latest ? `${SCHOOL.newsName}, ${issueDate(latest.sentOn)}${fresh ? ', new' : ''}` : `${SCHOOL.newsName}, the school newsletter`}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={({ pressed }) => ({
        backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', minHeight: RULE * 4 + 4, justifyContent: 'center',
        paddingHorizontal: 16, paddingVertical: 10, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
      })}>
      <RuledLines height={height} />
      <Text style={[{ fontSize: 50, lineHeight: 66, textAlign: 'center', color: NEWS.accent }, script]}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{SCHOOL.newsName}</Text>
      {latest && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: -4 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 15, color: NEWS.accent }}>{issueDate(latest.sentOn)}</Text>
          {fresh && (
            <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: NEWS.accent }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>NEW</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
