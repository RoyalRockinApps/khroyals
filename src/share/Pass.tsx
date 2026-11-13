/**
 * The Share tab's pass: in the school's colors, its name in the newsletter masthead's script, the QR code with the
 * shield in the middle, what scanning it does and the address, like a ticket. A slow shine crosses it now and then
 * (not with Reduce Motion on, and never in a saved image).
 */
import { forwardRef, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useMastheadFont } from '../news/paper';
import { SCHOOL } from '../school';
import { GOLD } from '../sports/ui';
import { C } from '../ui';
import { QrCode } from './QrCode';
import { shortUrl, type ShareTarget } from './targets';

const NAVY = SCHOOL.theme.dark;
const PAD = 20;

export const Pass = forwardRef<View, { target: ShareTarget; width: number; shine: boolean }>(function Pass({ target, width, shine }, ref) {
  const script = useMastheadFont();
  const code = width - PAD * 2 - 24;
  return (
    <View ref={ref} collapsable={false} style={[st.pass, { width }]}>
      <View style={[st.circle, { left: -70, top: -60 }]} />
      <View style={[st.circle, { right: -90, bottom: 60, width: 220, height: 220, borderRadius: 110 }]} />
      {shine && <Shine width={width} />}

      <Text style={[script, { color: GOLD, fontSize: Math.min(34, width / 10), textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
        {SCHOOL.name}
      </Text>
      <Text style={st.tagline}>{SCHOOL.tagline.toUpperCase()}</Text>

      <View style={st.codeBox}>
        <QrCode value={target.url} size={code} color={NAVY} logo={require('@school/assets/icon.png')} label={`QR code: ${target.headline}`} />
      </View>

      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={st.headline}>{target.headline}</Text>
        <Text style={st.url} numberOfLines={1} onPress={() => Linking.openURL(target.url)} accessibilityRole="link">{shortUrl(target.url)}</Text>
      </View>

      {/* A ticket's tear line, notched at both edges. */}
      <View style={st.tear}>
        <View style={[st.notch, { left: -PAD - 12 }]} />
        <View style={st.dashes} />
        <View style={[st.notch, { right: -PAD - 12 }]} />
      </View>
      <Text style={st.footer} numberOfLines={2}>{SCHOOL.fullName}</Text>
    </View>
  );
});

/** A soft band of light sweeping across the pass every few seconds. */
function Shine({ width }: { width: number }) {
  const [x] = useState(() => new Animated.Value(-160));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let on = true;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!on || reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.delay(1200),
        Animated.timing(x, { toValue: width + 60, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(x, { toValue: -160, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(3000),
      ]));
      loop.start();
    });
    return () => { on = false; loop?.stop(); };
  }, [x, width]);
  return (
    <Animated.View pointerEvents="none" accessible={false}
      style={{ position: 'absolute', top: -60, bottom: -60, width: 110, transform: [{ translateX: x }, { rotate: '16deg' }] }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="passShine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#fff" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#passShine)" />
      </Svg>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  pass: {
    alignSelf: 'center', alignItems: 'center', gap: 14, padding: PAD, paddingTop: 22, borderRadius: 26, overflow: 'hidden',
    backgroundColor: NAVY, borderWidth: 2, borderColor: GOLD,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  circle: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  tagline: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '800', letterSpacing: 3, marginTop: -8 },
  codeBox: { padding: 12, borderRadius: 20, backgroundColor: '#fff' },
  headline: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  url: { color: GOLD, fontSize: 15, fontWeight: '700' },
  tear: { alignSelf: 'stretch', height: 24, justifyContent: 'center' },
  dashes: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)' },
  notch: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: C.bg },
  footer: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', textAlign: 'center', letterSpacing: 0.5, marginTop: -6 },
});
