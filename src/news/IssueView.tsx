/**
 * One newsletter issue, laid out like the school's Smore newsletter (app/royal-news/[id].tsx shows it): one white ruled
 * sheet on the newsletter's page color (theme.newsletter), with the school's colors in circles behind it; the issue's
 * title as a brush-script masthead and the date in a serif, both in the newsletter's accent; section headings in its
 * accent in italics; and each item's title in bold over centered text, with bold words and underlined links. Pictures
 * at their own shape. Reaching the end counts for the Planner card's A/B test.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { isWritten, issueDate, logExperiment, type NewsBlock, type NewsletterIssue, type Span } from '../api/connect';
import { ReadingScroll } from '../Reading';
import { SCHOOL } from '../school';

const NEWS = SCHOOL.theme.newsletter;
/** The sheet's ruled lines, this far apart. */
const RULE = 26;
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
const CONDENSED = Platform.select({
  ios: 'AvenirNextCondensed-MediumItalic', android: 'sans-serif-condensed',
  default: '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif',
});
const INK = '#3A3A3A';
const LINK = '#1F5DB4';

export function IssueView({ issue, canEdit, header }: { issue: NewsletterIssue; canEdit: boolean; header?: ReactNode }) {
  const [script] = useFonts({ KaushanScript_400Regular });
  return (
    <ReadingScroll doneLabel={`Back to ${SCHOOL.newsName}`} doneHref="/royal-news" background={NEWS.page}
      contentStyle={{ paddingHorizontal: 14, paddingTop: 0 }} onEnd={() => { logExperiment('royal_news_card', 'finished', issue.id); }}>
      {header}
      {/* Full width, so the circles stop at the screen's edges instead of making the page scroll sideways. */}
      <View style={styles.stage}>
        {/* The school's colors behind the sheet, as on the newsletter's page. */}
        <View pointerEvents="none" style={[styles.circle, { width: 130, height: 130, left: -92, top: 64, backgroundColor: NEWS.accent }]} />
        <View pointerEvents="none" style={[styles.circle, { width: 150, height: 150, right: 48, top: -6, backgroundColor: SCHOOL.theme.dark }]} />
        <View pointerEvents="none" style={[styles.circle, { width: 120, height: 120, right: -84, top: 548, backgroundColor: NEWS.accent }]} />

        <Sheet>
          <Text accessibilityRole="header" style={[styles.masthead, { color: NEWS.accent },
            script ? { fontFamily: 'KaushanScript_400Regular' } : { fontStyle: 'italic', fontWeight: '800' }]}>{issue.title}</Text>
          <Text style={[styles.date, { color: NEWS.accent }]}>{issueDate(issue.sentOn)}</Text>
          {issue.blocks.map((b, i) => <Block key={i} b={b} />)}
          {!isWritten(issue) && (
            <Text style={styles.footLink} accessibilityRole="link" onPress={() => Linking.openURL(issue.sourceUrl)}>Open the original newsletter ›</Text>
          )}
          {isWritten(issue) && canEdit && (
            <Text style={styles.footLink} accessibilityRole="button"
              onPress={() => router.push({ pathname: '/royal-news/write', params: { id: issue.id } })}>Change this issue</Text>
          )}
        </Sheet>
      </View>
    </ReadingScroll>
  );
}

/** A white sheet of ruled paper, its lines running behind the words. */
function Sheet({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState(0);
  const lines = Math.max(0, Math.floor(height / RULE));
  return (
    <View style={styles.sheet} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <View pointerEvents="none" style={styles.rules}>
        {Array.from({ length: lines }, (_, i) => <View key={i} style={[styles.rule, { top: (i + 1) * RULE }]} />)}
      </View>
      {children}
    </View>
  );
}

function Block({ b }: { b: NewsBlock }) {
  if (b.kind === 'heading') {
    return <Text style={[styles.heading, { color: NEWS.accent }]} accessibilityRole="header">{b.text}</Text>;
  }
  if (b.kind === 'image') return <Picture src={b.src} />;
  return (
    <View style={{ gap: 14, marginTop: 18 }}>
      {!!b.title && <Text style={styles.itemTitle}>{b.title}</Text>}
      {b.paragraphs.map((p, i) => <Paragraph key={i} spans={p} />)}
    </View>
  );
}

function Paragraph({ spans }: { spans: Span[] }) {
  return (
    <Text style={styles.body}>
      {spans.map((sp, i) => (
        <Text key={i} style={[sp.bold && { fontWeight: '800', color: '#2B2B2B' }, sp.href && { color: LINK, textDecorationLine: 'underline' }]}
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
    <Pressable onPress={() => Linking.openURL(src)} accessibilityRole="imagebutton" accessibilityLabel="Newsletter picture, open full size"
      style={{ marginTop: 18 }}>
      <Image source={{ uri: src }} style={{ width: '100%', aspectRatio: ratio, borderRadius: 2 }} resizeMode="contain" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { marginHorizontal: -14, paddingHorizontal: 14, paddingTop: 28, paddingBottom: 6, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999 },
  sheet: { backgroundColor: '#fff', borderRadius: 3, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 34, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  rules: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#E6E8EB' },
  masthead: { fontSize: 50, lineHeight: 64, textAlign: 'center' },
  date: { fontFamily: SERIF, fontSize: 15, textAlign: 'center', marginTop: 4 },
  heading: { fontFamily: CONDENSED, fontStyle: 'italic', fontSize: 32, lineHeight: 40, textAlign: 'center', marginTop: 30 },
  itemTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', color: INK, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, color: '#454545', textAlign: 'center' },
  footLink: { color: LINK, fontWeight: '700', textAlign: 'center', marginTop: 24 },
});
