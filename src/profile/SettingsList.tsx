/**
 * The Profile tab's menu, like a phone's Settings: groups of rows under a small heading, each row an icon in a colored
 * tile, a title, what's set now underneath, and a chevron to its screen. `useMe` loads the signed-in person for the
 * profile's own screens (app/profile/*).
 */
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { session, type Person } from '../api/connect';
import { C } from '../ui';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** A group of rows with its heading. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {!!title && <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: C.muted, marginLeft: 6 }}>{title.toUpperCase()}</Text>}
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/** One row: its icon on a colored tile, title and what's set now; the first in a group has no line above it. */
export function Row({ icon, tint, title, sub, onPress, first, danger }: {
  icon: Icon; tint: string; title: string; sub?: string; onPress: () => void; first?: boolean; danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
        pressed && { backgroundColor: C.bg }]}>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={19} color="#fff" />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: danger ? C.danger : C.ink }}>{title}</Text>
        {!!sub && <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{sub}</Text>}
      </View>
      {!danger && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
      {/* The hairline between rows starts past the icon, the way phone settings do. */}
      {!first && <View style={{ position: 'absolute', top: 0, left: 62, right: 0, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}

/** The signed-in person (undefined while loading, null when signed out), fresh each time the screen shows. */
export function useMe(): [Person | null | undefined, () => void] {
  const [me, setMe] = useState<Person | null | undefined>(undefined);
  const load = useCallback(() => { session().then(setMe).catch(() => setMe(null)); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return [me, load];
}
