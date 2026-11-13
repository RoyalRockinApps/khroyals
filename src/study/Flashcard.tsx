/**
 * A flash card that turns over when tapped: the front (the term or question) on white, the back (the answer) on a
 * light gold. It turns edge-on, changes side, and turns back, so it works the same on every platform.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../ui';
import { GOLD, NAVY } from '../sports/ui';

const native = Platform.OS !== 'web';

/** `flipped` shows the back. `onFlip` asks for the other side. Give each card its own `key`, so a new one starts unturned. */
export function Flashcard({ front, back, flipped, onFlip, label }: { front: string; back: string; flipped: boolean; onFlip: () => void; label?: string }) {
  const turn = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(flipped);
  const was = useRef(flipped);

  useEffect(() => {
    if (was.current === flipped) return;
    was.current = flipped;
    Animated.timing(turn, { toValue: 1, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() => {
      setShown(flipped);
      Animated.timing(turn, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    });
  }, [flipped, turn]);

  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const text = shown ? back : front;
  const long = text.length > 140;
  return (
    <Pressable onPress={onFlip} accessibilityRole="button" accessibilityLabel={`${shown ? 'Answer' : label ?? 'Card'}: ${text}`}
      accessibilityHint={shown ? 'Shows the front' : 'Shows the answer'}>
      <Animated.View style={{
        minHeight: 260, borderRadius: 22, padding: 22, borderWidth: shown ? 0 : 1, borderColor: C.line,
        backgroundColor: shown ? '#FFF7DB' : C.card, transform: [{ perspective: 900 }, { rotateY }],
        shadowColor: '#0B1A3A', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 1.2, color: shown ? '#92400E' : C.muted }}>{shown ? 'ANSWER' : (label ?? 'TERM').toUpperCase()}</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="sync" size={16} color={shown ? GOLD : C.muted} />
        </View>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 18 }}>
          <Text selectable={false} style={{ textAlign: 'center', color: shown ? '#422006' : NAVY, fontWeight: shown ? '600' : '800',
            fontSize: long ? 18 : shown ? 22 : 28, lineHeight: long ? 26 : shown ? 30 : 36 }}>{text}</Text>
        </ScrollView>
        <Text style={{ textAlign: 'center', fontSize: 12, color: shown ? '#92400E' : C.muted }}>{shown ? 'Tap to see the front' : 'Tap to turn it over'}</Text>
      </Animated.View>
    </Pressable>
  );
}
