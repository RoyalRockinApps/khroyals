/**
 * What people will see, drawn small for the Announcements app: the notification as it shows on a phone's lock screen
 * (the composer's "What they'll see"), and a splash page as a little phone (the composer, its template choices and the
 * history's cards). Tapping a thumbnail opens the full-screen preview where the caller wants one.
 */
import { useMemo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SCHOOL } from '../school';
import { templateOf, type SplashMedia } from './kinds';

const CONFETTI = ['#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#457B9D', '#8E44AD', '#E3B23C'];

/** A push notification on a lock screen: the app's icon and name, "now", the title and the message. */
export function NotificationPreview({ title, body }: { title: string; body: string }) {
  return (
    <View accessibilityLabel={`Notification preview: ${title || 'no title yet'}. ${body}`}
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', borderRadius: 18, padding: 11, flexDirection: 'row', gap: 10 }}>
      <Image source={require('@school/assets/icon.png')} style={{ width: 36, height: 36, borderRadius: 9 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: '#5B6577' }}>{SCHOOL.appName.toUpperCase()}</Text>
          <Text style={{ fontSize: 11, color: '#5B6577' }}>now</Text>
        </View>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: title ? '#0B1220' : '#9AA3B2' }}>{title || 'Your title'}</Text>
        <Text numberOfLines={3} style={{ fontSize: 14, lineHeight: 19, color: body ? '#1F2937' : '#9AA3B2' }}>{body || 'Your message'}</Text>
      </View>
    </View>
  );
}

/** `media`: what an uploaded graphic (imageUrl) is; a video shows as a dark phone with a play sign, a GIF animates. */
export type ThumbInput = { template: string | null; headline: string; imageUrl?: string; photoUrl?: string; media?: SplashMedia };

/** A splash page as a little phone (9 by 16): the uploaded graphic, or the template with its photo and headline. */
export function SplashThumb({ s, width, selected, onPress, label }: {
  s: ThumbInput; width: number; selected?: boolean; onPress?: () => void; label?: string;
}) {
  const height = Math.round((width * 16) / 9);
  const t = templateOf(s.template);
  const dots = useMemo(() => {
    let x = 11;
    const r = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    return Array.from({ length: 14 }, (_, i) => ({ left: r() * (width - 4), top: r() * (height - 4), c: CONFETTI[i % CONFETTI.length] }));
  }, [width, height]);
  const body = s.imageUrl && s.media === 'video' ? (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: width * 0.06, backgroundColor: '#1F2A44' }}>
      <View style={{ width: width * 0.42, height: width * 0.42, borderRadius: width, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF2E' }}>
        <Ionicons name="play" size={width * 0.22} color="#fff" style={{ marginLeft: width * 0.03 }} />
      </View>
      {width >= 60 && <Text style={{ color: '#fff', fontSize: Math.max(8, width * 0.1), fontWeight: '800', letterSpacing: 0.5 }}>VIDEO</Text>}
    </View>
  ) : s.imageUrl ? (
    <View style={{ flex: 1 }}>
      <Image source={{ uri: s.imageUrl }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      {s.media === 'gif' && (
        <View style={{ position: 'absolute', left: 3, bottom: 3, paddingHorizontal: 3, borderRadius: 3, backgroundColor: '#000A' }}>
          <Text style={{ color: '#fff', fontSize: Math.max(7, width * 0.09), fontWeight: '900' }}>GIF</Text>
        </View>
      )}
    </View>
  ) : (
    <View style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center', padding: width * 0.1, gap: width * 0.06 }}>
      {s.template === 'confetti' && dots.map((d, i) => (
        <View key={i} style={{ position: 'absolute', left: d.left, top: d.top, width: 4, height: 4, borderRadius: 2, backgroundColor: d.c, opacity: 0.8 }} />
      ))}
      {!!s.photoUrl && <Image source={{ uri: s.photoUrl }} style={{ width: '86%', aspectRatio: 4 / 3, borderRadius: width * 0.08, borderWidth: 1.5, borderColor: '#fff' }} />}
      <View style={{ width: width * 0.24, height: Math.max(2, width * 0.04), borderRadius: 2, backgroundColor: t.accent }} />
      <Text numberOfLines={3} style={{ fontSize: Math.max(8, width * 0.13), lineHeight: Math.max(10, width * 0.16), fontWeight: '900', color: t.ink, textAlign: 'center' }}>
        {s.headline || 'Headline'}
      </Text>
    </View>
  );
  const frame = (
    <View style={{ width, height, borderRadius: width * 0.16, overflow: 'hidden', backgroundColor: '#0B1220',
      borderWidth: selected ? 3 : 1.5, borderColor: selected ? '#FFD54A' : 'rgba(11, 18, 32, 0.25)' }}>
      {body}
    </View>
  );
  if (!onPress) return frame;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? 'Preview the splash page'} accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}>
      {frame}
    </Pressable>
  );
}
