/**
 * Latest news headlines, one at a time. Slides to the next every 5 seconds
 * (paused while someone is swiping, off when Reduce Motion is on); swipe to move
 * yourself. The dots show which headline is up; tap a headline to read it. When the
 * screen changes size (an iPad turned, an iPhone Duo folded or unfolded), the same
 * headline stays lined up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, FlatList, ImageBackground, Pressable, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import home from '@school/content/site/home.json';
import { getNews } from '../api/mockApi';
import { SCHOOL } from '../school';
import { C } from '../ui';
import type { Article, Section } from './types';

const COUNT = 5;

/**
 * For a school whose website posts no news: the home page's highlights, each photo with the
 * short heading right after it ("An Encouraging Community"), opening the home page.
 */
function highlights(): Article[] {
  const out: Article[] = [];
  for (const sec of (home as unknown as { sections: Section[] }).sections) {
    sec.blocks.forEach((b, i) => {
      const next = sec.blocks[i + 1];
      if (b.type === 'image' && next?.type === 'heading' && next.text.length < 60 && out.length < COUNT) {
        out.push({ id: `h${out.length}`, slug: '/', title: next.text, publishedAt: '', author: '', category: `Why ${SCHOOL.name}`,
          tags: [], featured: false, heroImage: b.src, summary: '', sourceUrl: '', body: [] });
      }
    });
  }
  return out;
}
const EVERY_MS = 5000;
const HEIGHT = 170;

export function NewsCarousel() {
  const [items, setItems] = useState<Article[]>([]);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(0);
  const list = useRef<FlatList<Article>>(null);
  const page = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    getNews().then((n) => setItems(n.articles.length ? n.articles.slice(0, COUNT) : highlights()));
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion.current = v; }).catch(() => {});
  }, []);

  // A copy of the first headline at the end lets the last one slide on to the first.
  const slides = items.length > 1 ? [...items, items[0]] : items;

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  const start = useCallback(() => {
    stop();
    if (items.length < 2 || !width || reduceMotion.current) return;
    timer.current = setInterval(() => {
      list.current?.scrollToOffset({ offset: (page.current + 1) * width, animated: true });
    }, EVERY_MS);
  }, [items.length, width]);
  useFocusEffect(useCallback(() => { start(); return stop; }, [start]));
  // A new width moves every headline, so line the current one up again.
  useEffect(() => {
    if (width) list.current?.scrollToOffset({ offset: page.current * width, animated: false });
  }, [width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const x = e.nativeEvent.contentOffset.x;
    if (items.length > 1 && x >= items.length * width - 1) {
      // Reached the copy of the first headline: jump back to the real one.
      list.current?.scrollToOffset({ offset: 0, animated: false });
      page.current = 0;
      setShown(0);
      return;
    }
    page.current = Math.round(x / width);
    setShown(page.current % Math.max(items.length, 1));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: C.primary }}>
      {width > 0 && (
        <FlatList ref={list} data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          keyExtractor={(a, i) => `${a.id}-${i}`} onScroll={onScroll} scrollEventThrottle={16}
          onScrollBeginDrag={stop} onMomentumScrollEnd={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item: a }) => (
            <Pressable onPress={() => router.push(a.slug.startsWith('/') ? (a.slug as Href) : `/news/${a.slug}`)} accessibilityRole="link" accessibilityLabel={a.title}
              style={{ width, height: HEIGHT }}>
              <ImageBackground source={a.heroImage ? { uri: a.heroImage } : undefined} resizeMode="cover"
                style={{ flex: 1, justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: SCHOOL.theme.newsOverlay, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 4 }}>
                  <Text style={{ color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                    {a.category.toUpperCase()}{a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </Text>
                  <Text numberOfLines={2} style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{a.title}</Text>
                </View>
              </ImageBackground>
            </Pressable>
          )} />
      )}
      {items.length > 1 && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
          {items.map((a, i) => (
            <View key={a.id} style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: i === shown ? '#fff' : 'rgba(255, 255, 255, 0.4)',
              transform: [{ scale: i === shown ? 1.25 : 1 }],
            }} />
          ))}
        </View>
      )}
    </View>
  );
}
