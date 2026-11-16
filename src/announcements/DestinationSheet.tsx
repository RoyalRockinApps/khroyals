/**
 * "Tapping it opens" in the Announcements composer: a sheet from the bottom with the announcement itself and the
 * screens it can open (src/announcements/kinds.ts → DESTINATIONS) as a grid of icons, like the Main Page's tiles.
 */
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NAVY } from '../sports/ui';
import { C, s } from '../ui';
import { DESTINATIONS } from './kinds';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

export function DestinationSheet({ visible, value, label, onPick, onClose }: {
  visible: boolean; value: string | null; label: (path: string) => string; onPick: (path: string | null) => void; onClose: () => void;
}) {
  const choices: { path: string | null; label: string; icon: string }[] = [
    { path: null, label: 'The announcement', icon: 'document-text' },
    ...DESTINATIONS.map((d) => ({ path: d.path, label: label(d.path), icon: d.icon })),
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[s.sheet, { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, maxHeight: '80%' }]}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 10 }} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink, paddingHorizontal: 18 }}>Tapping it opens</Text>
          <Text style={{ color: C.muted, paddingHorizontal: 18, marginTop: 2 }}>The screen people land on from the notification or the splash page’s button.</Text>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 12, paddingBottom: 36, gap: 8 }}>
            {choices.map((c) => {
              const on = c.path === value;
              return (
                <Pressable key={c.path ?? 'self'} onPress={() => { onPick(c.path); onClose(); }} accessibilityRole="radio"
                  accessibilityState={{ selected: on }} accessibilityLabel={c.label}
                  style={({ pressed }) => [{ width: '31.5%', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14,
                    borderWidth: on ? 2 : 1, borderColor: on ? NAVY : C.line, backgroundColor: on ? `${NAVY}0D` : C.card }, pressed && { opacity: 0.7 }]}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? NAVY : `${NAVY}12` }}>
                    <Ionicons name={c.icon as Icon} size={21} color={on ? '#fff' : NAVY} />
                  </View>
                  <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: C.ink, textAlign: 'center' }}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
