/**
 * The look of an app's home in Staff view (Announcements, Classes): a navy band on top with the counts that matter and
 * the main thing to do as a gold button, small capital headings over each part, and tools as icon tiles.
 */
import { Children, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOLD_LIGHT, NAVY } from './sports/ui';
import { C } from './ui';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** The navy band at the top. */
export function Band({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: NAVY, borderRadius: 18, padding: 14, gap: 12 }, style]}>{children}</View>;
}

/** A count in the band: the number big, what it counts under it. Red-gold when it's waiting on you. */
export function Stat({ n, label, alert, dot }: { n: number; label: string; alert?: boolean; dot?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10 }}
      accessible accessibilityLabel={`${n} ${label}`}>
      <Text style={{ color: alert && n > 0 ? GOLD_LIGHT : '#fff', fontSize: 22, fontWeight: '900' }}>{n}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {!!dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
        <Text numberOfLines={2} style={{ flexShrink: 1, color: 'rgba(255, 255, 255, 0.8)', fontSize: 12, fontWeight: '600', lineHeight: 15 }}>{label}</Text>
      </View>
    </View>
  );
}

/** Two or more views of the same thing, side by side in the band (a class's Roll and Going home). */
export function BandTabs<K extends string>({ tabs, value, onChange }: { tabs: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} accessibilityRole="tablist">
      {tabs.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: on ? '#fff' : 'transparent' }}>
            <Text style={{ fontWeight: '800', color: on ? NAVY : 'rgba(255, 255, 255, 0.85)' }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A person's initials in a circle tinted with a color (where they stand: present, late, absent). */
export function Initials({ name, color, size = 38 }: { name: string; color: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const letters = `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1F`,
      borderWidth: 2, borderColor: color }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '900', color }}>{letters}</Text>
    </View>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>;
}

/** The band's main button: gold, full width. */
export function GoldButton({ icon, label, onPress, accessibilityLabel }: { icon: IconName; label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD_LIGHT,
        borderRadius: 12, paddingVertical: 13, paddingHorizontal: 12 }, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={20} color={NAVY} />
      <Text numberOfLines={1} style={{ color: NAVY, fontWeight: '900', fontSize: 16, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

/** A small capital heading over a part of the screen. */
export function Heading({ text, right }: { text: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <Text accessibilityRole="header" style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.6 }}>{text.toUpperCase()}</Text>
      {right}
    </View>
  );
}

/** A rounded square with an icon in it, tinted (a card's picture). */
export function IconTile({ icon, color = NAVY, size = 46 }: { icon: IconName; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}16` }}>
      <Ionicons name={icon} size={size * 0.48} color={color} />
    </View>
  );
}

/** Tools two to a row (an odd one out keeps its size, with a space beside it). */
export function ToolGrid({ children }: { children: ReactNode }) {
  const odd = Children.toArray(children).length % 2 === 1;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {children}
      {odd && <View style={{ flexBasis: '47%', flexGrow: 1 }} />}
    </View>
  );
}

/** A tool in a ToolGrid: its icon, name and a short line, with a red count when something's new. */
export function ToolTile({ icon, title, sub, onPress, badge, color = NAVY }: {
  icon: IconName; title: string; sub: string; onPress: () => void; badge?: number; color?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={badge ? `${title}, ${badge} new. ${sub}` : `${title}. ${sub}`}
      style={({ pressed }) => [{ flexBasis: '47%', flexGrow: 1, minHeight: 112, backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
        borderColor: C.line, padding: 12, gap: 8 }, pressed && { opacity: 0.8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <IconTile icon={icon} color={color} size={40} />
        {!!badge && (
          <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.danger }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{title}</Text>
        <Text numberOfLines={2} style={{ fontSize: 12, color: C.muted, lineHeight: 16 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** A small rounded button on a card (a class's Assignments, Bulletin). */
export function PillButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
        backgroundColor: `${NAVY}0D`, borderWidth: 1, borderColor: `${NAVY}22` }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={15} color={NAVY} />
      <Text numberOfLines={1} style={{ color: NAVY, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
