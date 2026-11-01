/**
 * The school's car line traffic flow: which line to follow (from the children's grades,
 * src/carline/route.ts) beside a small map; tapping opens the map full screen, pinch to
 * zoom on iPhone, with the school's rules under it. Staff see it without "your line".
 */
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, P, s } from '../ui';
import { TRAFFIC_MAP } from '@school/carlineMap';
import { LINES, TRAFFIC_HINT, TRAFFIC_RULES, familyLines } from './route';

/** Nothing for a school without a traffic flow map (schools/<id>/carlineMap.ts). */
export function TrafficFlow({ grades }: { grades?: (number | null | undefined)[] }) {
  const [open, setOpen] = useState(false);
  if (!TRAFFIC_MAP) return null;
  const map = TRAFFIC_MAP;
  const lines = familyLines(grades ?? []);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Traffic flow map. Open full screen"
        style={({ pressed }) => [s.card, s.row, { gap: 14, alignItems: 'flex-start' }, pressed && { opacity: 0.85 }]}>
        <Image source={map.image} style={{ width: 92, height: 92, borderRadius: 12, borderWidth: 1, borderColor: C.line }} accessible={false} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>Traffic flow</Text>
          {lines.length === 0 ? <P muted>{TRAFFIC_HINT}</P>
            : lines.map((l) => (
              <View key={l} style={[s.row, { gap: 8, alignItems: 'flex-start' }]}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: LINES[l].color, marginTop: 3 }} />
                <Text style={{ flex: 1, color: C.ink }}>
                  <Text style={{ fontWeight: '800', color: LINES[l].color }}>{LINES[l].line}</Text> for {LINES[l].name}, entrance {LINES[l].entrance}
                </Text>
              </View>
            ))}
          {lines.length > 1 && <P muted>Finish one line, then go around again for the other.</P>}
          <Text style={{ color: C.primary, fontWeight: '700' }}>See the map ›</Text>
        </View>
      </Pressable>
      <MapViewer map={map} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MapViewer({ map, open, onClose }: { map: NonNullable<typeof TRAFFIC_MAP>; open: boolean; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const w = Math.min(width, 900);
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={[s.row, { paddingHorizontal: 16, paddingVertical: 10 }]}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.ink }}>Traffic flow</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <Ionicons name="close-circle" size={32} color={C.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom, gap: 12, alignItems: 'center' }}>
          <View style={{ width: w, height: w / map.aspect, backgroundColor: '#fff' }}>
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} bouncesZoom centerContent
              showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
              <Image source={map.image} style={{ width: w, height: w / map.aspect }} resizeMode="contain" accessibilityLabel={map.alt} />
            </ScrollView>
          </View>
          <Text style={{ color: C.muted, fontSize: 13 }}>Pinch to zoom in.</Text>
          <View style={[s.card, { width: w - 32, gap: 8 }]}>
            {TRAFFIC_RULES.map((r) => (
              <View key={r} style={[s.row, { gap: 10, alignItems: 'flex-start' }]}>
                <Text style={{ color: C.accent, fontWeight: '900' }}>•</Text>
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: C.ink }}>{r}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
