/**
 * Lunch Visits: the open lunch times as blocks on a week calendar, a column per school day and time running down
 * (src/lunch/calendar.ts lays it out). Arrows page through the weeks the school takes bookings for. A block shows its
 * start and the visitor spots left; tapping an open one books it. Your visits are green, full ones grey, and days already
 * gone are greyed out.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LunchSlot } from '../api/connect';
import { clock } from '../absences/labels';
import { C } from '../ui';
import { axisLabel, dayLanes, gridLines, lunchWeeks, minutes, timeRange, weekName, weekSpan } from './calendar';

const GUTTER = 42;     // the time axis
const PAD = 9;         // room above the first and below the last line for their labels
const GREEN = '#15803D';

const dayName = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00`).toLocaleDateString('en-US', o);

export function LunchCalendar({ slots, today, span = 21, onBook }: {
  slots: LunchSlot[]; today: string; span?: number; onBook: (slot: LunchSlot) => void;
}) {
  const weeks = useMemo(() => lunchWeeks(slots, today, span), [slots, today, span]);
  const range = useMemo(() => timeRange(slots), [slots]);
  // Open on the first week with a lunch time still to come (this one, unless it's over or closed). The screen gives each
  // child's calendar its own key, so picking another child starts again there; reloading after a booking stays put.
  const [at, setAt] = useState(() => Math.max(0, weeks.findIndex((w) => w.slots.size > 0)));
  const [width, setWidth] = useState(0);

  if (!range || !weeks.length) return null;
  const week = weeks[Math.min(at, weeks.length - 1)];
  const shortest = Math.min(...slots.map((x) => minutes(x.endTime) - minutes(x.startTime)));
  const ppm = Math.min(3, Math.max(1.4, 72 / Math.max(15, shortest)));   // a block is at least ~72 points tall
  const height = (range.to - range.from) * ppm + PAD * 2;
  const y = (t: number) => PAD + (t - range.from) * ppm;
  const colW = width ? (width - GUTTER) / week.days.length : 0;

  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingVertical: 10, paddingHorizontal: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Arrow icon="chevron-back" label="Earlier week" disabled={at === 0} onPress={() => setAt(at - 1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{weekName(week.monday, today)}</Text>
          <Text style={{ fontSize: 13, color: C.muted }}>{weekSpan(week.days)}</Text>
        </View>
        <Arrow icon="chevron-forward" label="Later week" disabled={at >= weeks.length - 1} onPress={() => setAt(at + 1)} />
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', paddingLeft: GUTTER }}>
          {week.days.map((d) => {
            const past = d < today;
            const now = d === today;
            return (
              <View key={d} style={{ flex: 1, alignItems: 'center', gap: 2, opacity: past ? 0.45 : 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.4 }}>{dayName(d, { weekday: 'short' }).toUpperCase()}</Text>
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: now ? C.primary : 'transparent' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: now ? '#fff' : C.ink }}>{Number(d.slice(8))}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {width > 0 && (
          <View style={{ height, marginTop: 4 }}>
            {gridLines(range).map((t) => (
              <View key={t} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: y(t), flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ width: GUTTER - 6, marginTop: -14, fontSize: 10, color: C.muted, textAlign: 'right' }}>{axisLabel(t)}</Text>
                <View style={{ flex: 1, marginLeft: 6, height: 1, backgroundColor: C.line }} />
              </View>
            ))}
            {week.days.map((d, i) => (
              <View key={d} pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER + i * colW, width: colW,
                borderLeftWidth: 1, borderLeftColor: C.line, backgroundColor: d < today ? '#8A94A61A' : 'transparent' }} />
            ))}
            {week.days.flatMap((d, i) => dayLanes(week.slots.get(d) ?? []).map(({ slot, lane, lanes }) => (
              <Block key={`${d}-${slot.windowId}`} slot={slot} narrow={lanes > 1}
                top={y(minutes(slot.startTime)) + 1} height={(minutes(slot.endTime) - minutes(slot.startTime)) * ppm - 2}
                left={GUTTER + i * colW + (lane * colW) / lanes + 2} width={colW / lanes - 4} onBook={onBook} />
            )))}
            {week.slots.size === 0 && (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, color: C.muted, fontWeight: '700' }}>
                  No lunch times open this week
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 4 }}>
        <Key color={C.primary} label="Open: tap to book" />
        <Key color={GREEN} label="You’re coming" />
        <Key color="#A3ADBD" label="Full" />
      </View>
    </View>
  );
}

function Block({ slot, top, left, width, height, narrow, onBook }: {
  slot: LunchSlot; top: number; left: number; width: number; height: number; narrow: boolean; onBook: (slot: LunchSlot) => void;
}) {
  const mine = !!slot.myVisit;
  const full = !mine && slot.spotsLeft === 0;
  const [bg, edge, ink] = mine ? ['#DCFCE7', GREEN, '#166534'] : full ? ['#EEF1F6', '#A3ADBD', C.muted] : [`${C.primary}17`, C.primary, C.primary];
  // A block shares its column with another lunch at the same time, or the column is a phone's: the start and the spots
  // left (just the number when it's thinner still); the lunch's name only where it fits.
  const thin = width < 34;
  const status = thin ? (mine ? '✓' : full ? '–' : String(slot.spotsLeft)) : mine ? (width >= 64 ? '✓ Going' : 'Going') : full ? 'Full' : `${slot.spotsLeft} left`;
  const when = `${dayName(slot.day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${slot.name}, ${clock(slot.startTime)} to ${clock(slot.endTime)}`;
  return (
    <Pressable onPress={() => onBook(slot)} disabled={mine || full} accessibilityRole="button"
      accessibilityLabel={`${when}. ${mine ? 'You’re coming.' : full ? 'Full.' : `${slot.spotsLeft} visitor ${slot.spotsLeft === 1 ? 'spot' : 'spots'} left. Book.`}`}
      style={({ pressed }) => [{ position: 'absolute', top, left, width, height, borderRadius: 8, overflow: 'hidden', backgroundColor: bg,
        borderLeftWidth: 3, borderLeftColor: edge, paddingHorizontal: thin ? 2 : 5, paddingVertical: 4,
        justifyContent: thin ? 'center' : 'space-between', alignItems: thin ? 'center' : 'stretch' }, pressed && { opacity: 0.7 }]}>
      <View>
        {!thin && <Text numberOfLines={1} style={{ fontSize: narrow ? 11 : 12, fontWeight: '800', color: ink }}>{clock(slot.startTime).replace(/ [AP]M$/, '')}</Text>}
        {!narrow && width >= 72 && height >= 64 && <Text numberOfLines={height >= 90 ? 2 : 1} style={{ fontSize: 10, color: C.muted, lineHeight: 13 }}>{slot.name}</Text>}
      </View>
      <Text numberOfLines={1} style={{ fontSize: thin ? 13 : narrow ? 10 : 11, fontWeight: thin ? '900' : '700', color: ink }}>{status}</Text>
    </Pressable>
  );
}

function Arrow({ icon, label, disabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
        backgroundColor: disabled ? 'transparent' : `${C.primary}12`, opacity: disabled ? 0.3 : 1 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={20} color={C.primary} />
    </Pressable>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: C.muted }}>{label}</Text>
    </View>
  );
}
