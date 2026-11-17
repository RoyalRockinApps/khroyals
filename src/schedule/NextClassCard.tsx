/**
 * Now / Next class on a student's Planner (src/api/schedule.ts → my_next_classes): the class going on now with when it
 * ends, and the next one with when it starts ("in 25 min", or its day), skipping days without school. Nothing shows
 * until the school has set the class times. Tapping it opens the week in the Student app.
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { myNextClasses, type NextClass } from '../api/connect';
import { clock } from '../absences/labels';
import { schoolToday } from '../calendar/past';
import { GOLD, NAVY } from '../sports/ui';
import { C } from '../ui';
import { startsIn } from './week';

const nowHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const dayWord = (d: string, today: string) => {
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return d === tomorrow ? 'Tomorrow' : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
};

export function NextClassCard() {
  const [list, setList] = useState<NextClass[] | null>(null);
  useFocusEffect(useCallback(() => { myNextClasses().then(setList).catch(() => setList([])); }, []));
  if (!list || list.length === 0) return null;
  const today = schoolToday();
  const now = list.find((c) => c.now);
  const next = list.find((c) => !c.now);
  const when = (c: NextClass) => (c.day === today ? startsIn(c.startTime, nowHM()) ?? clock(c.startTime) : `${dayWord(c.day, today)}, ${clock(c.startTime)}`);
  return (
    <Pressable onPress={() => router.push('/student')} accessibilityRole="button"
      accessibilityLabel={[now && `Now: ${now.className} until ${clock(now.endTime)}`, next && `Next: ${next.className}, ${when(next)}`].filter(Boolean).join('. ')}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }, pressed && { opacity: 0.85 }]}>
      {now && <Row label="NOW" c={now} sub={`until ${clock(now.endTime)}`} strong />}
      {next && <Row label="NEXT" c={next} sub={when(next)} />}
    </Pressable>
  );
}

function Row({ label, c, sub, strong }: { label: string; c: NextClass; sub: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 52, paddingVertical: 4, borderRadius: 8, alignItems: 'center', backgroundColor: strong ? NAVY : `${NAVY}14` }}>
        <Text style={{ color: strong ? GOLD : NAVY, fontWeight: '900', fontSize: 11, letterSpacing: 1 }}>{label}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16 }}>{c.className}</Text>
        <Text style={{ color: C.muted }} numberOfLines={1}>{[c.room, c.teacher].filter(Boolean).join(' · ')}</Text>
      </View>
      <Text style={{ color: strong ? NAVY : C.muted, fontWeight: '700' }}>{sub}</Text>
    </View>
  );
}
