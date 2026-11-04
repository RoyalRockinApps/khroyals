/**
 * One place for an app's settings: a gear in the header, shown only to people who can change something
 * there. With one thing to manage it opens it; with more it lists them in a sheet ("Manage Calendar":
 * Dress-up days…). Buttons that make something (+ Add event, + Opportunity) stay on the screen; settings
 * and the tools for running the app go here. Every app's header uses this, so people learn one place.
 */
import { useState, type ComponentProps } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C, s } from './ui';

export type ManageItem = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** A line about it, in the sheet. */
  sub?: string;
  href?: Href;
  onPress?: () => void;
};

const go = (item: ManageItem) => (item.onPress ? item.onPress() : item.href ? router.push(item.href) : undefined);

/** The header's gear (white, for the blue header). Nothing when there's nothing to manage. `inRow`: beside other header buttons. */
export function ManageButton({ app, items, inRow }: { app: string; items: ManageItem[]; inRow?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const one = items.length === 1 ? items[0] : null;
  return (
    <>
      <Pressable onPress={() => (one ? go(one) : setOpen(true))} hitSlop={10} accessibilityRole="button"
        accessibilityLabel={one ? one.label : `Manage ${app}`} style={({ pressed }) => [{ marginRight: inRow ? 0 : 8 }, pressed && { opacity: 0.6 }]}>
        <Ionicons name="settings-outline" size={22} color="#fff" />
      </Pressable>
      {!one && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={() => setOpen(false)} accessibilityLabel="Close">
            <Pressable style={[s.sheet, { backgroundColor: C.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 36, gap: 4 }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted, marginBottom: 6 }}>MANAGE {app.toUpperCase()}</Text>
              {items.map((item) => (
                <Pressable key={item.label} onPress={() => { setOpen(false); go(item); }} accessibilityRole="button" accessibilityLabel={item.label}
                  style={({ pressed }) => [s.row, { gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 }, pressed && { backgroundColor: C.bg }]}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${C.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={item.icon} size={20} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{item.label}</Text>
                    {!!item.sub && <Text style={{ color: C.muted }}>{item.sub}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.muted} />
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
