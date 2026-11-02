/**
 * "Add to calendar" for one event: Google, Outlook (personal or work/school), Yahoo, and, for a
 * school or activity event, Apple Calendar (its calendar file). A one-time copy: a subscription
 * (SubscribeCard) is the way to have changes follow.
 */
import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { eventFile } from '../api/connect';
import { C, P, s } from '../ui';
import { googleEventUrl, outlookEventUrl, yahooEventUrl, type CalEvent } from './addTo';

/** `uid`: 'school-<id>' or 'activity-<id>' for a public event (adds Apple Calendar). */
export function AddToCalendar({ event, uid, compact }: { event: CalEvent; uid?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const file = uid ? eventFile(uid) : null;
  const options: [string, string | null][] = [
    ['Google Calendar', googleEventUrl(event)],
    [Platform.OS === 'ios' ? 'iPhone Calendar' : 'Apple Calendar', file],
    ['Outlook.com', outlookEventUrl(event)],
    ['Outlook (work or school)', outlookEventUrl(event, true)],
    ['Yahoo Calendar', yahooEventUrl(event)],
  ];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Add ${event.title} to your calendar`} hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="calendar-outline" size={16} color={C.primary} />
        {!compact && <Text style={{ color: C.primary, fontWeight: '700' }}>Add to calendar</Text>}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={[s.sheet, s.card, { gap: 4 }]}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }} numberOfLines={2}>Add “{event.title}”</Text>
            {options.filter(([, url]) => url).map(([label, url]) => (
              <Pressable key={label} onPress={() => { setOpen(false); Linking.openURL(url!); }} accessibilityRole="link"
                style={({ pressed }) => ({ paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ color: C.primary, fontWeight: '700', fontSize: 16 }}>{label}</Text>
              </Pressable>
            ))}
            <P muted>A copy of this event. To have changes follow, subscribe to your calendar instead.</P>
            <Text onPress={() => setOpen(false)} style={{ alignSelf: 'flex-end', color: C.muted, fontWeight: '700', padding: 6 }}>Close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
