/**
 * Missing work and classes below the line (the grade_alert_below setting), from the student's record: in full at the
 * top of the Student app (a parent's child's, `studentId`), and in short on a student's Planner (`compact`: the counts
 * and the first few, tapping into the Student app). Nothing shows when all is well, or before the school's system
 * sends records.
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { studentAlerts, type StudentAlerts } from '../api/connect';
import { C } from '../ui';

const RED = '#B42318';
const AMBER_DARK = '#92400E';
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function AlertsCard({ studentId, compact }: { studentId?: string | null; compact?: boolean }) {
  const [a, setA] = useState<StudentAlerts | null>(null);
  useFocusEffect(useCallback(() => { studentAlerts(studentId).then(setA).catch(() => setA(null)); }, [studentId]));
  if (!a || (!a.missing.length && !a.low.length)) return null;
  const missing = compact ? a.missing.slice(0, 3) : a.missing;
  const headline = [a.missing.length && `${a.missing.length} missing`, a.low.length && `${a.low.length} ${a.low.length === 1 ? 'class' : 'classes'} below ${Math.round(a.below)}%`]
    .filter(Boolean).join(' · ');
  const body = (
    <View style={{ backgroundColor: '#FEF3F2', borderRadius: 18, borderWidth: 1, borderColor: '#FECDCA', padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="alert-circle" size={20} color={RED} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '900', color: RED }}>Needs attention</Text>
          <Text style={{ color: RED, fontWeight: '600', fontSize: 13 }}>{headline}</Text>
        </View>
        {compact && <Ionicons name="chevron-forward" size={18} color={RED} />}
      </View>
      {missing.map((m) => (
        <View key={`${m.course}:${m.title}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Ionicons name="document-text-outline" size={18} color={RED} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>{m.title}</Text>
            <Text style={{ color: C.muted }}>{m.course} · missing, due {shortDay(m.dueOn)}</Text>
          </View>
        </View>
      ))}
      {compact && a.missing.length > missing.length && <Text style={{ color: C.muted }}>and {a.missing.length - missing.length} more</Text>}
      {a.low.map((l) => (
        <View key={l.course} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="trending-down" size={18} color={AMBER_DARK} />
          <Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{l.course}</Text>
          <Text style={{ fontWeight: '900', color: AMBER_DARK }}>{Math.round(l.average)}%{l.letter ? ` · ${l.letter}` : ''}</Text>
        </View>
      ))}
      {!compact && <Text style={{ color: C.muted, fontSize: 13 }}>From the school's grade book. Talk with the teacher about catching up.</Text>}
    </View>
  );
  if (!compact) return body;
  return (
    <Pressable onPress={() => router.push('/student')} accessibilityRole="button" accessibilityLabel={`Needs attention: ${headline}. Open the Student app`}
      style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}
