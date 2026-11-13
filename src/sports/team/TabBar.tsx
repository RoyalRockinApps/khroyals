/**
 * An activity's page is split into tabs under its banner: Home, Schedule, Board, Roster, Photos and Chat. Everyone sees
 * Home and Schedule; the team (its students and parents, and its leaders) also sees the Board and the Roster, approved
 * accounts the Photos, and the team's parents and leaders the Chat. The bar sticks to the top as the page scrolls.
 */
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../ui';
import { GOLD, NAVY } from '../ui';
import type { TabKey } from './tabs';

export { isTab, type TabKey } from './tabs';

type Icon = ComponentProps<typeof Ionicons>['name'];
const TABS: Record<TabKey, { label: string; icon: Icon; on: Icon }> = {
  home: { label: 'Home', icon: 'home-outline', on: 'home' },
  schedule: { label: 'Schedule', icon: 'calendar-outline', on: 'calendar' },
  board: { label: 'Board', icon: 'megaphone-outline', on: 'megaphone' },
  roster: { label: 'Roster', icon: 'people-outline', on: 'people' },
  photos: { label: 'Photos', icon: 'images-outline', on: 'images' },
  chat: { label: 'Chat', icon: 'chatbubbles-outline', on: 'chatbubbles' },
};

/** The tabs this person sees, in order; `dot` marks one with something new (the chat). */
export function TabBar({ tabs, value, onChange, dot }: { tabs: TabKey[]; value: TabKey; onChange: (t: TabKey) => void; dot?: TabKey | null }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: C.bg, marginHorizontal: -16, paddingHorizontal: 8,
      borderBottomWidth: 1, borderColor: C.line }}>
      {tabs.map((key) => {
        const t = TABS[key];
        const on = key === value;
        return (
          <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={dot === key ? `${t.label}, new messages` : t.label}
            style={({ pressed }) => [{ flex: 1, alignItems: 'center', gap: 3, paddingTop: 10, paddingBottom: 8 }, pressed && { opacity: 0.7 }]}>
            <View>
              <Ionicons name={on ? t.on : t.icon} size={21} color={on ? NAVY : C.muted} />
              {dot === key && <View style={{ position: 'absolute', top: -2, right: -5, width: 10, height: 10, borderRadius: 5,
                backgroundColor: C.danger, borderWidth: 2, borderColor: C.bg }} />}
            </View>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: on ? '800' : '600', color: on ? NAVY : C.muted }}>{t.label}</Text>
            <View style={{ position: 'absolute', bottom: -1, left: 6, right: 6, height: 3, borderRadius: 2, backgroundColor: on ? GOLD : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}
