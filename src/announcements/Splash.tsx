/**
 * A splash page: the whole screen, shown once when people open the app (src/announcements/SplashGate.tsx), in the
 * Announcements app's preview, and when an announcement is opened from its notification. An uploaded graphic fills the
 * screen on dark; a template puts an optional photo, the headline and the words on its background (confetti drawn on
 * the light one). ✕ or Continue closes it; its button (when it has one) opens its screen.
 */
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Announcement } from '../api/types';
import { FONT_STYLE } from '../ui';
import { templateOf } from './kinds';

type Props = {
  a: Pick<Announcement, 'splashImageUrl' | 'splashTemplate' | 'splashPhotoUrl' | 'splashHeadline' | 'splashText' | 'splashButton' | 'link' | 'title'>
    & { splashImage?: string | null };
  onClose: () => void;
  onTap?: () => void;
  /** In the composer: says it's a preview. */
  preview?: boolean;
};

const CONFETTI = ['#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#457B9D', '#8E44AD', '#E3B23C'];

function Confetti({ width, height }: { width: number; height: number }) {
  const bits = useMemo(() => {
    let x = 7;
    const r = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    return Array.from({ length: 70 }, (_, i) => ({ x: r() * width, y: r() * height, s: 4 + r() * 7, c: CONFETTI[i % CONFETTI.length], round: r() > 0.5, rot: r() * 90 }));
  }, [width, height]);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {bits.map((b, i) => b.round
        ? <Circle key={i} cx={b.x} cy={b.y} r={b.s / 2} fill={b.c} opacity={0.75} />
        : <Rect key={i} x={b.x} y={b.y} width={b.s} height={b.s * 0.5} fill={b.c} opacity={0.75} transform={`rotate(${b.rot} ${b.x} ${b.y})`} />)}
    </Svg>
  );
}

export function SplashView({ a, onClose, onTap, preview }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const graphic = !!(a.splashImageUrl || a.splashImage);
  const t = templateOf(a.splashTemplate);
  const ink = graphic ? '#FFFFFF' : t.ink;
  const button = a.splashButton && a.link && onTap ? (
    <Pressable onPress={onTap} accessibilityRole="button"
      style={({ pressed }) => [{ alignSelf: 'stretch', paddingVertical: 15, borderRadius: 16, alignItems: 'center',
        backgroundColor: graphic ? '#E3B23C' : t.accent }, pressed && { opacity: 0.85 }]}>
      <Text style={{ fontWeight: '900', fontSize: 17, color: graphic ? '#0E2457' : t.buttonInk }}>{a.splashButton}</Text>
    </Pressable>
  ) : null;
  const close = (
    <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"
      style={{ position: 'absolute', top: insets.top + 10, right: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: graphic || t.ink === '#FFFFFF' ? '#FFFFFF33' : '#0E245722', zIndex: 2 }}>
      <Ionicons name="close" size={24} color={ink} />
    </Pressable>
  );
  const keepGoing = (
    <Text onPress={onClose} accessibilityRole="button" style={{ color: ink, fontWeight: '800', fontSize: 16, textAlign: 'center', paddingVertical: 10, opacity: 0.9 }}>
      Continue to the app
    </Text>
  );

  if (graphic) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B1220' }} accessibilityViewIsModal>
        {close}
        <Image source={{ uri: a.splashImageUrl || a.splashImage! }} resizeMode="contain" accessibilityLabel={a.title}
          style={{ flex: 1, marginTop: insets.top + 60, marginBottom: 8 }} />
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 6 }}>
          {preview && <Text style={{ color: '#FFFFFFAA', textAlign: 'center', fontWeight: '700' }}>PREVIEW</Text>}
          {button}
          {keepGoing}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.background }} accessibilityViewIsModal>
      {a.splashTemplate === 'confetti' && <Confetti width={width} height={height} />}
      {close}
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, paddingTop: insets.top + 70, paddingBottom: insets.bottom + 20, gap: 18 }}>
        {preview && <Text style={{ color: ink, opacity: 0.6, textAlign: 'center', fontWeight: '800', letterSpacing: 1 }}>PREVIEW</Text>}
        {!!a.splashPhotoUrl && (
          <Image source={{ uri: a.splashPhotoUrl }} resizeMode="cover" accessibilityIgnoresInvertColors
            style={{ alignSelf: 'center', width: Math.min(width - 56, 420), aspectRatio: 4 / 3, borderRadius: 22, borderWidth: 4, borderColor: '#FFFFFF' }} />
        )}
        <View style={{ height: 4, width: 56, borderRadius: 2, backgroundColor: t.accent, alignSelf: 'center' }} />
        <Text style={{ ...FONT_STYLE.heading, fontSize: 34, lineHeight: 40, color: ink, textAlign: 'center' }}>{a.splashHeadline || a.title}</Text>
        {!!a.splashText && <Text style={{ fontSize: 18, lineHeight: 26, color: ink, textAlign: 'center', opacity: 0.92 }}>{a.splashText}</Text>}
        <View style={{ gap: 6, marginTop: 10 }}>
          {button}
          {keepGoing}
        </View>
      </ScrollView>
    </View>
  );
}
