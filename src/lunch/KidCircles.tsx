/**
 * Lunch Visits: the children you can visit, each a circle with their face (initials without a photo) and their first
 * name under it. With more than one, tapping a circle picks whose lunch times show; the picked one has a ring.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { LunchKid } from '../api/connect';
import { Avatar, C } from '../ui';

const SIZE = 64;

export function KidCircles({ kids, value, onChange }: { kids: LunchKid[]; value: string | null; onChange: (id: string) => void }) {
  const pick = kids.length > 1;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2 }}
      accessibilityRole={pick ? 'radiogroup' : undefined}>
      {kids.map((k) => {
        const on = k.id === value;
        return (
          <Pressable key={k.id} disabled={!pick} onPress={() => onChange(k.id)} accessibilityRole={pick ? 'radio' : undefined}
            accessibilityState={pick ? { selected: on } : undefined} accessibilityLabel={`${k.firstName} ${k.lastName}`}
            style={({ pressed }) => [{ alignItems: 'center', width: SIZE + 18, gap: 5, opacity: pick && !on ? 0.6 : 1 }, pressed && { opacity: 0.8 }]}>
            <View style={{ padding: 3, borderRadius: SIZE, borderWidth: 3, borderColor: on ? C.primary : 'transparent' }}>
              <Avatar person={k} size={SIZE} />
            </View>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: on ? '800' : '600', color: on ? C.ink : C.muted }}>{k.firstName}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
