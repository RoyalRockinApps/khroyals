/**
 * Long reading screens (Royal News issues, news articles, website pages): a scroll view with a
 * floating "Top" button once you've scrolled down, and a "Done reading" button at the end that
 * goes back (or to `doneHref` when the screen was opened straight from a link), so nobody has to
 * scroll all the way up, or close the app, to leave. `onEnd` runs once when the reader gets to the end (scrolls to it, or
 * taps Done), for A/B tests' "read to the end".
 */
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, s } from './ui';

export function ReadingScroll({ children, doneLabel = 'Done reading', doneHref = '/', contentStyle, onEnd, background }: {
  children: ReactNode; doneLabel?: string; doneHref?: Href; contentStyle?: StyleProp<ViewStyle>; onEnd?: () => void;
  /** The page's color, when it isn't the usual. */
  background?: string;
}) {
  const ref = useRef<ScrollView>(null);
  const [down, setDown] = useState(false);
  const ended = useRef(false);
  const end = () => { if (!ended.current) { ended.current = true; onEnd?.(); } };
  const done = () => { end(); if (router.canGoBack()) router.back(); else router.replace(doneHref); };
  return (
    <View style={{ flex: 1 }}>
      {/* Room under the Done button for the floating Top button. */}
      <ScrollView ref={ref} style={[s.screen, background ? { backgroundColor: background } : null]}
        contentContainerStyle={[s.pad, contentStyle, { paddingBottom: 80 }]} scrollEventThrottle={100}
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          setDown(contentOffset.y > 500);
          if (contentOffset.y > 0 && contentOffset.y + layoutMeasurement.height >= contentSize.height - 120) end();
        }}>
        {children}
        <Pressable onPress={done} accessibilityRole="button"
          style={({ pressed }) => [s.row, { justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 14, borderRadius: 12,
            backgroundColor: C.primary }, pressed && { opacity: 0.8 }]}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{doneLabel}</Text>
        </Pressable>
      </ScrollView>
      {down && (
        <Pressable onPress={() => ref.current?.scrollTo({ y: 0, animated: true })} accessibilityRole="button" accessibilityLabel="Back to top"
          style={({ pressed }) => [{ position: 'absolute', right: 16, bottom: 20, flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: C.primary,
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }, pressed && { opacity: 0.8 }]}>
          <Ionicons name="arrow-up" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>Top</Text>
        </Pressable>
      )}
    </View>
  );
}
