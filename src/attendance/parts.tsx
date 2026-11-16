/** Pieces of the Classes app (app/attendance): a class's card with its roll at a glance and its tools, and stepping between school days. */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ClassRollSummary } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { dayLabel } from '../checkin/labels';
import { IconTile, PillButton, type IconName } from '../hub';
import { NAVY } from '../sports/ui';
import { C, s } from '../ui';
import { MARKS, rollLine, stepDay } from './labels';

const AMBER = '#B45309';
const GREEN = '#15803D';

/**
 * A class: a picture of where its roll stands (to take, under way, taken), its name (and teacher, for the office), a bar
 * of present / late / absent, and the roll in words; tap it to take roll. `children` sit along the bottom as small
 * buttons (the class's other tools, in Classes).
 */
export function ClassCard({ c, teacher, onPress, children }: { c: ClassRollSummary; teacher?: boolean; onPress: () => void; children?: ReactNode }) {
  const notTaken = c.students > 0 && c.unmarked === c.students;
  const taken = c.students > 0 && c.unmarked === 0;
  const [icon, color]: [IconName, string] = c.students === 0 ? ['people-outline', '#94A3B8'] : notTaken ? ['clipboard-outline', AMBER]
    : taken ? ['checkmark-done', GREEN] : ['time-outline', NAVY];
  return (
    <View style={{ borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: notTaken ? AMBER + '66' : C.line, padding: 14, gap: 10 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${c.name}. ${rollLine(c)}`}
        style={({ pressed }) => [{ flexDirection: 'row', gap: 12 }, pressed && { opacity: 0.8 }]}>
        <IconTile icon={icon} color={color} />
        <View style={{ flex: 1, gap: 5 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{c.name}</Text>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </View>
          <Text style={{ fontSize: 13, color: C.muted }}>
            {[teacher && (c.teacher ?? 'No teacher yet'), `${c.students} ${c.students === 1 ? 'student' : 'students'}`].filter(Boolean).join(' · ')}
          </Text>
          {c.students > 0 && (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden', flexDirection: 'row', gap: c.unmarked < c.students ? 2 : 0 }}>
              {MARKS.map((m) => c[m.key] > 0 && <View key={m.key} style={{ flex: c[m.key], backgroundColor: m.color }} />)}
              {c.unmarked > 0 && <View style={{ flex: c.unmarked }} />}
            </View>
          )}
          <Text style={{ fontSize: 13, color: notTaken ? AMBER : taken ? GREEN : C.muted, fontWeight: notTaken || taken ? '700' : '500' }}>
            {taken ? `✓ ${rollLine(c)}` : rollLine(c)}
          </Text>
        </View>
      </Pressable>
      {children && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 58 }}>{children}</View>}
    </View>
  );
}

/** One of a class card's tools along its bottom (Assignments, Bulletin). */
export function ClassTool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <PillButton icon={icon} label={label} onPress={onPress} />;
}

/** ‹ Thu, Oct 29 › — school days only, never past today, with a way back to today. `dark`: on the navy band. */
export function DayStepper({ day, onChange, dark }: { day: string; onChange: (day: string) => void; dark?: boolean }) {
  const today = schoolToday();
  const arrow = (by: -1 | 1) => {
    const next = stepDay(day, by, today), off = next === day;
    return (
      <Pressable onPress={() => onChange(next)} disabled={off} accessibilityRole="button" hitSlop={8}
        accessibilityLabel={by < 0 ? 'Earlier school day' : 'Next school day'}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: dark ? 'rgba(255, 255, 255, 0.12)' : '#fff', borderWidth: dark ? 0 : 1, borderColor: C.line, opacity: off ? 0.35 : 1 }}>
        <Ionicons name={by < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color={dark ? '#fff' : C.primary} />
      </Pressable>
    );
  };
  return (
    <View style={[s.row, { gap: 10, justifyContent: 'space-between' }]}>
      {arrow(-1)}
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: dark ? '#fff' : C.ink }}>{dayLabel(day, today)}</Text>
        {day !== today && (
          <Text onPress={() => onChange(today)} accessibilityRole="button" style={{ color: dark ? '#FFD54A' : C.primary, fontWeight: '700' }}>Back to today</Text>
        )}
      </View>
      {arrow(1)}
    </View>
  );
}
