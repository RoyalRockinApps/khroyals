/** One Royal News issue: its sections, items (with bold text and links) and pictures. Reaching the end counts for the Planner card's A/B test. */
import { useEffect, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { getNewsletter, isWritten, issueDate, live, logExperiment, myAccess, type NewsBlock, type Span } from '../../src/api/connect';
import { ReadingScroll } from '../../src/Reading';
import { C, Card, Loading, P, s, useLoad } from '../../src/ui';
import { SCHOOL } from '../../src/school';

export default function Issue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useLoad(async () => ({ issue: await getNewsletter(id) }), [id]);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => { if (live) myAccess().then((a) => setCanEdit(!!a?.permissions.includes('push.send'))).catch(() => {}); }, []);
  const header = <Stack.Screen options={{ title: SCHOOL.newsName }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<P>{SCHOOL.newsName} didn't load: {error}</P></View>;
  if (!data) return <>{header}<Loading /></>;
  const { issue } = data;
  if (!issue) return <View style={[s.screen, s.pad]}>{header}<P>That issue isn't here anymore.</P></View>;

  return (
    <ReadingScroll doneLabel={`Back to ${SCHOOL.newsName}`} doneHref="/royal-news" contentStyle={{ gap: 12 }}
      onEnd={() => { logExperiment('royal_news_card', 'finished', issue.id); }}>
      {header}
      <View style={{ alignItems: 'center', gap: 2, paddingVertical: 6 }}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: C.primary }} accessibilityRole="header">{issue.title}</Text>
        <Text style={{ color: C.muted, fontWeight: '600' }}>{issueDate(issue.sentOn)}</Text>
      </View>
      {issue.blocks.map((b, i) => <Block key={i} b={b} />)}
      {!isWritten(issue) && (
        <Text style={{ color: C.primary, fontWeight: '700', textAlign: 'center', marginTop: 8 }} accessibilityRole="link"
          onPress={() => Linking.openURL(issue.sourceUrl)}>Open the original newsletter ›</Text>
      )}
      {isWritten(issue) && canEdit && (
        <Text style={{ color: C.primary, fontWeight: '700', textAlign: 'center', marginTop: 8 }} accessibilityRole="button"
          onPress={() => router.push({ pathname: '/royal-news/write', params: { id: issue.id } })}>Change this issue</Text>
      )}
    </ReadingScroll>
  );
}

function Block({ b }: { b: NewsBlock }) {
  if (b.kind === 'heading') {
    return <Text style={{ fontSize: 22, fontWeight: '900', color: C.accent, textAlign: 'center', marginTop: 8 }} accessibilityRole="header">{b.text}</Text>;
  }
  if (b.kind === 'image') return <Picture src={b.src} />;
  return (
    <Card style={{ gap: 8 }}>
      {!!b.title && <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, textAlign: 'center' }}>{b.title}</Text>}
      {b.paragraphs.map((p, i) => <Paragraph key={i} spans={p} />)}
    </Card>
  );
}

function Paragraph({ spans }: { spans: Span[] }) {
  return (
    <Text style={{ color: C.ink, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
      {spans.map((sp, i) => (
        <Text key={i} style={[sp.bold && { fontWeight: '800' }, sp.href && { color: C.primary, textDecorationLine: 'underline' }]}
          onPress={sp.href ? () => Linking.openURL(sp.href!) : undefined} accessibilityRole={sp.href ? 'link' : undefined}>
          {sp.text}
        </Text>
      ))}
    </Text>
  );
}

/** A picture at its own shape (tap to open it full size). */
function Picture({ src }: { src: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  // The picture's real shape (the web doesn't report it when it loads).
  useEffect(() => { Image.getSize(src, (w, h) => { if (w && h) setRatio(w / h); }, () => {}); }, [src]);
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }} onPress={() => Linking.openURL(src)}>
      <Image source={{ uri: src }} style={{ width: '100%', aspectRatio: ratio }} resizeMode="contain" accessibilityLabel="Newsletter picture"
        />
    </Card>
  );
}
