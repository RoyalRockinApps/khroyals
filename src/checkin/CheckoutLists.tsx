/**
 * Check-out lists for field trips, class events and Activities events (the lower part of the
 * Classes app): the lists the teacher, coach or director runs, and starting one for an Activities
 * event they coach or direct (its registered students) or for a field trip or class event (students
 * from their sections, so only for someone who leads one: `canStart`). Each child goes only to
 * someone on their pickup list. The last week's lists are behind "Show past lists", like every dated
 * list. The daily Extended care list isn't here: it has its own screen. Staff with none of these
 * don't see the section at all.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkoutEventOptions, checkoutListForEvent, errorText, myCheckoutLists, type CheckoutListSummary } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { clock } from '../carline/format';
import { PAST_STYLE, PastToggle, usePastToggle } from '../calendar/PastToggle';
import { Heading, IconTile, PillButton } from '../hub';
import { NAVY } from '../sports/ui';
import { C, Loading, s } from '../ui';
import { dayLabel, progressLine } from './labels';

const GREEN = '#15803D';

export function CheckoutLists({ canStart }: { canStart: boolean }) {
  const [lists, setLists] = useState<CheckoutListSummary[] | null>(null);
  const [events, setEvents] = useState<{ id: string; title: string; startsAt: string; listId: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const past = usePastToggle();

  useFocusEffect(useCallback(() => {
    Promise.all([myCheckoutLists().catch(() => []), checkoutEventOptions().catch(() => [])]).then(([l, e]) => { setLists(l); setEvents(e); });
  }, []));

  const openEvent = async (eventId: string) => {
    setBusy(true);
    try { router.push(`/checkout/${await checkoutListForEvent(eventId)}`); } catch (e) { Alert.alert('Event check-out', errorText(e)); } finally { setBusy(false); }
  };

  if (!lists) return <Loading />;
  const today = schoolToday();
  const coming = lists.filter((l) => l.day >= today), earlier = lists.filter((l) => l.day < today).reverse();
  const card = (l: CheckoutListSummary, old = false) => {
    const all = l.students > 0 && l.released >= l.students;
    return (
      <Pressable key={l.id} onPress={() => router.push(`/checkout/${l.id}`)} accessibilityRole="button"
        style={({ pressed }) => [{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
          old && PAST_STYLE, pressed && { opacity: 0.85 }]}>
        <IconTile icon={all ? 'checkmark-done' : 'bus-outline'} color={all ? GREEN : NAVY} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={[s.row, { justifyContent: 'space-between', gap: 8 }]}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: C.ink, flexShrink: 1 }}>{l.title}</Text>
            <Text style={{ color: C.muted, fontWeight: '600', fontSize: 13 }}>{dayLabel(l.day)}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
            <View style={{ width: `${l.students ? Math.round((100 * l.released) / l.students) : 0}%`, height: 6, borderRadius: 3, backgroundColor: all ? GREEN : NAVY }} />
          </View>
          <Text style={{ fontSize: 13, color: all ? GREEN : C.muted, fontWeight: all ? '700' : '400' }}>{progressLine(l.released, l.students)}</Text>
        </View>
      </Pressable>
    );
  };
  const toStart = events.filter((e) => !e.listId);
  if (!lists.length && !toStart.length && !canStart) return null;

  return (
    <>
      <Heading text="Field trip & event check-out" />
      <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}>Check each student out to someone on their pickup list; their parents are told.</Text>
      {coming.map((l) => card(l))}
      {toStart.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
          <IconTile icon="trophy-outline" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{e.title}</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>{dayLabel(schoolToday(new Date(e.startsAt)))} · {clock(e.startsAt)} · its registered students</Text>
          </View>
          <PillButton icon="play" label="Start" onPress={() => { if (!busy) openEvent(e.id); }} />
        </View>
      ))}
      {canStart && (
        <Pressable onPress={() => router.push('/checkout/new')} accessibilityRole="button" accessibilityLabel="New check-out list for a field trip or class event"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 16,
            borderWidth: 1.5, borderStyle: 'dashed', borderColor: `${NAVY}55` }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="add" size={20} color={NAVY} />
          <Text style={{ color: NAVY, fontWeight: '800' }}>Field trip or class event</Text>
        </Pressable>
      )}
      <PastToggle count={earlier.length} shown={past.shown} onToggle={past.toggle} noun="lists" />
      {past.shown && earlier.map((l) => card(l, true))}
    </>
  );
}
