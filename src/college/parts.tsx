/**
 * Pieces of College & Career (app/college): a test, scholarship or event card, a checklist step, and a transcript
 * request, with the words for each kind, method and status, and the dates' order. The order and words have no app
 * imports beyond types, so tests run them (src/college/lists.ts).
 */
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CollegeDate, CollegeStep, TranscriptRequest } from '../api/connect';
import { GOLD, NAVY } from '../sports/ui';
import { C, Chip, P, s } from '../ui';
import { KIND_LABEL, METHOD_LABEL, STATUS_LABEL, registerLine } from './lists';

const GREEN = '#15803D';
const RED = '#B42318';
const ICON = { test: 'create-outline', scholarship: 'cash-outline', event: 'calendar-outline' } as const;
export const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function DateCard({ d, today, onPress }: { d: CollegeDate; today: string; onPress?: () => void }) {
  const reg = registerLine(d, today);
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 }, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={ICON[d.kind]} size={20} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: NAVY }}>{d.title}</Text>
          <Text style={{ color: C.muted, fontWeight: '600' }}>{KIND_LABEL[d.kind]} · {d.kind === 'scholarship' ? `Due ${longDay(d.day)}` : longDay(d.day)}</Text>
        </View>
      </View>
      {reg && <Text style={{ fontWeight: '800', color: reg.urgent ? RED : C.ink }}>{reg.text}</Text>}
      {!!d.details && <P>{d.details}</P>}
      {!!d.link && <Text style={{ color: C.primary, fontWeight: '700' }} accessibilityRole="link" onPress={() => Linking.openURL(d.link!)}>Learn more ↗</Text>}
    </Pressable>
  );
}

export function StepRow({ step, onToggle, onPress }: { step: CollegeStep; onToggle?: () => void; onPress?: () => void }) {
  const done = !!step.doneAt;
  return (
    <Pressable onPress={onPress ?? onToggle} disabled={!onPress && !onToggle} accessibilityRole={onToggle ? 'checkbox' : onPress ? 'button' : undefined}
      accessibilityState={onToggle ? { checked: done } : undefined}
      style={({ pressed }) => [{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8 }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={done ? GREEN : onToggle ? NAVY : C.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '800', color: C.ink, textDecorationLine: done ? 'line-through' : 'none' }}>{step.title}</Text>
        {!!step.details && <Text style={{ color: C.muted }}>{step.details}</Text>}
      </View>
    </Pressable>
  );
}

export function RequestCard({ r, children }: { r: TranscriptRequest; children?: React.ReactNode }) {
  const tint = r.status === 'sent' ? GREEN : r.status === 'cancelled' ? C.muted : GOLD;
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6, borderLeftWidth: 5, borderLeftColor: tint,
      opacity: r.status === 'cancelled' ? 0.6 : 1 }}>
      <View style={[s.row, { gap: 8 }]}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: NAVY }}>{r.student ? `${r.student} → ${r.sendTo}` : r.sendTo}</Text>
        <Chip label={STATUS_LABEL[r.status]} color={r.status === 'sent' ? GREEN : r.status === 'cancelled' ? C.muted : '#92400E'} />
      </View>
      <Text style={{ color: C.muted }}>
        {[r.grade ? `${r.grade}th grade` : null, METHOD_LABEL[r.method], r.address || null, r.neededBy ? `needed by ${longDay(r.neededBy)}` : null].filter(Boolean).join(' · ')}
      </Text>
      {!!r.note && <P>{r.note}</P>}
      {r.status === 'sent' && <Text style={{ color: GREEN, fontWeight: '700' }}>Sent{r.handledAt ? ` ${longDay(r.handledAt.slice(0, 10))}` : ''}{r.counselorNote ? `: ${r.counselorNote}` : ''}</Text>}
      {children}
    </View>
  );
}
