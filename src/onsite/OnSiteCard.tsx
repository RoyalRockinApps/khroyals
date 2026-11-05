/**
 * On-Site Attendance at a glance (the Admin portal's top card, and the top of the On-Site screen): how many people are
 * at school now, as one thin bar of staff, faculty, visitors and students with each group's count beside its color;
 * then where the students are. After dismissal it says first whether every student has been sent home or is accounted
 * for (at an activity or in extended care); the student groups are pills that open the On-Site screen on that group.
 */
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OnSiteBucket, OnSiteToday } from '../api/connect';
import { C, Card, s } from '../ui';
import { STUDENT_GROUPS, onSiteParts } from './labels';

const AMBER = '#B45309';
const GREEN = '#15803D';

/** "3:00 PM" from "15:00". */
const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

export function OnSiteCard({ t, onOpen }: { t: OnSiteToday; onOpen?: (group: OnSiteBucket | 'people' | 'visitors') => void }) {
  const parts = onSiteParts(t);
  const total = parts.reduce((n, p) => n + p.here, 0);
  const shown = parts.filter((p) => p.here > 0);
  const st = t.students;
  const groups = STUDENT_GROUPS.filter((g) => (t.afterDismissal ? g.key !== 'class' : !['notHome', 'activities', 'extendedCare'].includes(g.key)));
  const waiting = st.notHome;

  return (
    <Card style={{ gap: 12 }}>
      <View style={[s.row, { alignItems: 'baseline', gap: 8 }]}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: C.ink }}>{total.toLocaleString()}</Text>
        <Text style={{ flex: 1, fontSize: 15, color: C.muted, fontWeight: '600' }}>on site now</Text>
        <Text style={{ fontSize: 13, color: C.muted }}>{t.afterDismissal ? 'Dismissed' : 'Dismissal'} {hm(t.dismissal)}</Text>
      </View>
      {total > 0 && (
        <View accessible accessibilityLabel={`On site now: ${parts.map((p) => `${p.label} ${p.here}`).join(', ')}`}
          style={{ flexDirection: 'row', height: 8, gap: 2 }}>
          {shown.map((p) => <View key={p.key} style={{ flex: p.here, backgroundColor: p.color, borderRadius: 4 }} />)}
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, columnGap: 16 }}>
        {parts.map((p) => (
          <Pressable key={p.key} disabled={!onOpen}
            onPress={() => onOpen?.(p.key === 'visitors' ? 'visitors' : p.key === 'students' ? (t.afterDismissal && waiting ? 'notHome' : 'class') : 'people')}
            accessibilityRole="button" accessibilityLabel={`${p.label}: ${p.here}${p.of != null ? ` of ${p.of}` : ''} here`}
            style={({ pressed }) => [s.row, { gap: 8, paddingVertical: 4, flexGrow: 1, flexBasis: 200 }, pressed && { opacity: 0.6 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
            <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }}>{p.label}</Text>
            <Text style={{ color: C.ink, fontWeight: '800' }}>
              {p.here.toLocaleString()}{p.of != null && <Text style={{ color: C.muted, fontWeight: '500' }}> of {p.of.toLocaleString()}</Text>}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: C.line }} />
      {t.afterDismissal && (
        <Pressable disabled={!onOpen} onPress={() => onOpen?.(waiting ? 'notHome' : 'home')} accessibilityRole="button"
          style={({ pressed }) => [s.row, { gap: 8 }, pressed && { opacity: 0.6 }]}>
          <Ionicons name={waiting ? 'alert-circle' : 'checkmark-circle'} size={20} color={waiting ? AMBER : GREEN} />
          <Text style={{ flex: 1, fontWeight: '700', color: waiting ? AMBER : GREEN }}>
            {waiting ? `${waiting.toLocaleString()} ${waiting === 1 ? 'student' : 'students'} not sent home yet`
              : 'Every student is sent home or accounted for'}
          </Text>
          {!!onOpen && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {groups.filter((g) => g.key !== 'notHome').map((g) => (
          <Pressable key={g.key} disabled={!onOpen} onPress={() => onOpen?.(g.key)} accessibilityRole="button"
            accessibilityLabel={`${g.label}: ${st[g.key]}`}
            style={({ pressed }) => [{ flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
              borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' }, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: C.muted, fontWeight: '600' }}>{g.label}</Text>
            <Text style={{ color: C.ink, fontWeight: '800' }}>{st[g.key].toLocaleString()}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
