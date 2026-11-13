/**
 * Cover photos for Volunteer cards. `CoverPhotoField`: whoever posts an opportunity or starts an event picks one (and its
 * leaders change or remove it later), previewed in the banner's 2:1 shape. `PhotoBackdrop`: the photo filling a banner,
 * shaded darker toward the bottom so the white words on it stay readable.
 */
import { useId } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { pickCoverPhoto } from '../photos';
import { GOLD, NAVY } from '../sports/ui';
import { C, Loading, P, s } from '../ui';

export type PickedPhoto = { base64: string; uri: string };

/** The photo across the whole banner, under its date tile and words. */
export function PhotoBackdrop({ uri }: { uri: string }) {
  const shade = `shade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={NAVY} stopOpacity={0.1} />
            <Stop offset="0.45" stopColor={NAVY} stopOpacity={0.25} />
            <Stop offset="1" stopColor={NAVY} stopOpacity={0.85} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${shade})`} />
      </Svg>
    </View>
  );
}

/**
 * Pick, change or remove the cover photo. `value` is the photo showing now (a link, or a just-picked photo's data link);
 * a pick hands back the JPEG to upload.
 */
export function CoverPhotoField({ value, onPick, onRemove, busy, title = 'Cover photo (optional)' }: {
  value: string | null; onPick: (photo: PickedPhoto) => void; onRemove: () => void; busy?: boolean; title?: string;
}) {
  const pick = (camera: boolean) => pickCoverPhoto(camera)
    .then((p) => { if (p) onPick(p); })
    .catch((e) => Alert.alert("Couldn't use that photo", e?.message ?? String(e)));
  const link = (label: string, onPress: () => void, color: string = C.primary) => (
    <Text key={label} onPress={busy ? undefined : onPress} accessibilityRole="button" style={{ color, fontWeight: '700', opacity: busy ? 0.5 : 1 }}>{label}</Text>
  );
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{title}</Text>
      {value ? (
        <View style={{ aspectRatio: 2, maxHeight: 260, borderRadius: 14, overflow: 'hidden', backgroundColor: NAVY,
          borderBottomWidth: 3, borderBottomColor: GOLD }}>
          <Image source={{ uri: value }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="The cover photo" />
          {busy && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0006', justifyContent: 'center' }]}><Loading /></View>}
        </View>
      ) : (
        // Without one the card shows a drawing; tapping here picks one.
        <Pressable onPress={busy ? undefined : () => pick(false)} accessibilityRole="button" accessibilityLabel="Add a cover photo"
          style={({ pressed }) => [s.row, { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line,
            backgroundColor: C.bg }, pressed && { opacity: 0.7 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="image-plus" size={24} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>Add a cover photo</Text>
            <P muted>Without one, the card shows a drawing that matches the title.</P>
          </View>
          {busy && <Loading />}
        </Pressable>
      )}
      {(!!value || Platform.OS !== 'web') && (
        <View style={[s.row, { flexWrap: 'wrap', gap: 18 }]}>
          {Platform.OS !== 'web' && link('Take photo', () => pick(true))}
          {!!value && link('Change photo', () => pick(false))}
          {!!value && link('Remove', onRemove, C.danger)}
        </View>
      )}
      {!!value && <P muted>It fills the top of its card and its page. The middle of the photo is used, so keep what matters there.</P>}
    </View>
  );
}
