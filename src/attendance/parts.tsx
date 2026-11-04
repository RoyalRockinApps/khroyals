/** Pieces of the Classes app (app/attendance): a class's card with its roll at a glance and its tools, and stepping between school days. */
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ClassRollSummary } from '../api/connect';
import { schoolToday } from '../calendar/past';
import { dayLabel } from '../checkin/labels';
import { C, s } from '../ui';
import { MARKS, rollLine, stepDay } from './labels';

const AMBER = '#B45309';

/**
 * A class: its name (and teacher, for the office), a bar of present / late / absent, and the roll in
 * words; tap it to take roll. `children` go along the bottom (the class's other tools, in Classes).
 */
export function ClassCard({ c, teacher, onPress, children }: { c: ClassRollSummary; teacher?: boolean; onPress: () => void; children?: ReactNode }) {
  const notTaken = c.students > 0 && c.unmarked === c.students;
  return (
    <View style={{ borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: notTaken ? AMBER + '66' : C.line, overflow: 'hidden' }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${c.name}. ${rollLine(c)}`}
        style={({ pressed }) => [{ padding: 14, gap: 8 }, pressed && { opacity: 0.85 }]}>
        <View style={[s.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{c.name}</Text>
            {teacher && <Text style={{ fontSize: 13, color: C.muted }}>{c.teacher ?? 'No teacher yet'} · {c.students} students</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </View>
        {c.students > 0 && (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden', flexDirection: 'row' }}>
            {MARKS.map((m) => <View key={m.key} style={{ flex: c[m.key], backgroundColor: m.color }} />)}
            <View style={{ flex: c.unmarked }} />
          </View>
        )}
        <Text style={{ color: notTaken ? AMBER : C.muted, fontWeight: notTaken ? '700' : '500' }}>{rollLine(c)}</Text>
      </Pressable>
      {children && <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line }}>{children}</View>}
    </View>
  );
}

/** One of a class card's tools along its bottom edge (Take roll, Assignments), sharing the width. */
export function ClassTool({ icon, label, onPress, first }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11,
        borderLeftWidth: first ? 0 : 1, borderLeftColor: C.line }, pressed && { backgroundColor: C.bg }]}>
      <Ionicons name={icon} size={17} color={C.primary} />
      <Text style={{ color: C.primary, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** ‹ Thu, Oct 29 › — school days only, never past today, with a way back to today. */
export function DayStepper({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const today = schoolToday();
  const arrow = (by: -1 | 1) => {
    const next = stepDay(day, by, today), off = next === day;
    return (
      <Pressable onPress={() => onChange(next)} disabled={off} accessibilityRole="button" hitSlop={8}
        accessibilityLabel={by < 0 ? 'Earlier school day' : 'Next school day'}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
          borderWidth: 1, borderColor: C.line, opacity: off ? 0.35 : 1 }}>
        <Ionicons name={by < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color={C.primary} />
      </Pressable>
    );
  };
  return (
    <View style={[s.row, { gap: 10, justifyContent: 'space-between' }]}>
      {arrow(-1)}
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{dayLabel(day, today)}</Text>
        {day !== today && <Text onPress={() => onChange(today)} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>Back to today</Text>}
      </View>
      {arrow(1)}
    </View>
  );
}
