/**
 * The verse for today on a student's Planner (the school writes them in Announcements → Daily verse): the verse and its
 * reference on the school's dark color, and the thought for the day behind "Today's thought". Nothing shows on a day
 * without one (daily_verse_today also falls back to the last week's latest, for weekends).
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dailyVerseToday, type DailyVerse } from '../api/connect';
import { GOLD, NAVY } from '../sports/ui';

export function VerseCard() {
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [open, setOpen] = useState(false);
  useFocusEffect(useCallback(() => { dailyVerseToday().then(setVerse).catch(() => {}); }, []));
  if (!verse) return null;
  return (
    <View style={{ backgroundColor: NAVY, borderRadius: 20, padding: 18, gap: 10 }} accessibilityRole="summary"
      accessibilityLabel={`Verse for today, ${verse.reference}: ${verse.verse}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="book" size={16} color={GOLD} />
        <Text style={{ color: GOLD, fontWeight: '900', fontSize: 12, letterSpacing: 1.2 }}>VERSE FOR TODAY</Text>
      </View>
      <Text style={{ color: '#fff', fontSize: 18, lineHeight: 26, fontStyle: 'italic' }}>“{verse.verse}”</Text>
      <Text style={{ color: GOLD, fontWeight: '800', fontSize: 15 }}>{verse.reference}</Text>
      {!!verse.thought && (
        <>
          <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, pressed && { opacity: 0.7 }]}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Today's thought</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#fff" />
          </Pressable>
          {open && <Text style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 15, lineHeight: 22 }}>{verse.thought}</Text>}
        </>
      )}
    </View>
  );
}
