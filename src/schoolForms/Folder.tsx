import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { MyForm } from '../api/connect';
import { C } from '../ui';
import { dueText } from './parts';

/** The folder opens before the assigned papers can be selected. */
export function Folder({ forms }: { forms: MyForm[] }) {
  return <FolderContents key={forms.map((form) => form.id).join('|')} forms={forms} />;
}

function FolderContents({ forms }: { forms: MyForm[] }) {
  const [opening] = useState(() => new Animated.Value(0));
  const list = useRef<FlatList<MyForm>>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active) return;
      Animated.timing(opening, { toValue: 1, duration: reduce ? 0 : 850, useNativeDriver: true })
        .start(({ finished }) => { if (active && finished) setReady(true); });
    });
    return () => { active = false; opening.stopAnimation(); };
  }, [opening]);
  const move = (next: number) => list.current?.scrollToOffset({ offset: next * width, animated: true });
  return (
    <View style={styles.container}>
      <View style={styles.tab}><Text style={styles.tabText}>MY FOLDER</Text></View>
      <View style={styles.folder} onLayout={(event) => { setWidth(event.nativeEvent.layout.width); setIndex(0); list.current?.scrollToOffset({ offset: 0, animated: false }); }}>
        <Animated.View pointerEvents={ready ? 'auto' : 'none'} accessibilityElementsHidden={!ready}
          importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}
          style={{ opacity: opening.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] }) }}>
          {width > 0 && <FlatList ref={list} horizontal pagingEnabled data={forms} keyExtractor={(form) => form.id}
            showsHorizontalScrollIndicator={false} extraData={width}
            scrollEventThrottle={16}
            onScroll={(event) => setIndex(Math.max(0, Math.min(forms.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}
            ListEmptyComponent={<View style={[styles.paper, { width: width - 32 }]}><Ionicons name="checkmark-circle-outline" size={40} color={C.primary} /><Text style={styles.title}>Your folder is clear</Text><Text>New forms from the school will appear here.</Text></View>}
            renderItem={({ item, index: page }) => (
              <View style={{ width, padding: 16 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}, document ${page + 1} of ${forms.length}`}
                  onPress={() => router.push(`/forms/${item.id}`)} style={({ pressed }) => [styles.paper, pressed && { opacity: 0.8 }]}>
                  <View style={styles.paperTop}><Ionicons name="document-text-outline" size={26} color={C.primary} /><Text style={styles.counter}>{page + 1} / {forms.length}</Text></View>
                  <Text style={styles.title} numberOfLines={3}>{item.title}</Text>
                  <Text style={styles.meta}>{[item.sentTo, dueText(item)].filter(Boolean).join(' · ')}</Text>
                  <View style={styles.rule} />
                  <Text style={styles.details} numberOfLines={4}>{item.details}</Text>
                  <Text style={styles.children} numberOfLines={2}>{item.children.map((child) => child.name).join(', ')}</Text>
                  <Text style={styles.open}>Tap to open and sign ↗</Text>
                </Pressable>
              </View>
            )} />}
        </Animated.View>
        {!ready && <Animated.View pointerEvents="none" style={[styles.cover, {
          opacity: opening.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
          transform: [{ perspective: 900 }, { translateY: 150 },
            { rotateX: opening.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-100deg'] }) }, { translateY: -150 }],
        }]}><Ionicons name="folder-open-outline" size={64} color="#795821" /><Text style={styles.coverTitle}>Your school documents</Text></Animated.View>}
      </View>
      {ready && forms.length > 0 && <View style={styles.navigation}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous document" disabled={index <= 0} onPress={() => move(index - 1)} style={{ opacity: index <= 0 ? 0.3 : 1, padding: 12 }}><Ionicons name="chevron-back" size={24} color={C.primary} /></Pressable>
        <Text style={styles.meta}>Swipe papers · {index + 1} of {forms.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next document" disabled={index >= forms.length - 1} onPress={() => move(index + 1)} style={{ opacity: index >= forms.length - 1 ? 0.3 : 1, padding: 12 }}><Ionicons name="chevron-forward" size={24} color={C.primary} /></Pressable>
      </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 16 },
  tab: { backgroundColor: '#DBAF60', borderTopLeftRadius: 14, borderTopRightRadius: 24, padding: 12, width: 155 },
  tabText: { color: '#573B14', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  folder: { backgroundColor: '#E8C580', borderRadius: 16, borderTopLeftRadius: 0, minHeight: 370, paddingVertical: 8 },
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#EDCA86', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C49A50' },
  coverTitle: { color: '#795821', fontSize: 19, fontWeight: '700', marginTop: 16 },
  paper: { backgroundColor: '#FFFEFA', minHeight: 322, borderRadius: 3, padding: 22, gap: 12, shadowColor: '#563D17', shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  paperTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { color: C.muted, fontSize: 12 },
  title: { fontSize: 23, fontWeight: '800', color: C.ink },
  meta: { color: C.muted, fontSize: 13 },
  rule: { height: 1, backgroundColor: '#DDD8CB' },
  details: { color: C.ink, lineHeight: 22 },
  children: { color: C.primary, fontWeight: '600' },
  open: { color: C.primary, fontWeight: '700', marginTop: 'auto' },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
