/**
 * My schedule in the Student app: a student's week of classes (a parent's child's, `studentId`), one weekday at a time
 * (it opens on today, or Monday at the weekend): each class's time, name, teacher and room. Nothing shows until the
 * school has set the class times (Classes → a class → Class times).
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { classSchedule, type ClassMeeting } from '../api/connect';
import { clock } from '../absences/labels';
import { schoolToday } from '../calendar/past';
import { GOLD, NAVY } from '../sports/ui';
import { C, P, s } from '../ui';
import { WEEKDAYS, classesOn, openingWeekday } from './week';

export function ScheduleCard({ studentId }: { studentId: string | null }) {
  const [list, setList] = useState<ClassMeeting[] | null>(null);
  const [day, setDay] = useState(() => openingWeekday(schoolToday()));
  useFocusEffect(useCallback(() => {
    if (!studentId) return;
    classSchedule(studentId).then(setList).catch(() => setList([]));
  }, [studentId]));
  if (!list || list.length === 0) return null;
  const today = openingWeekday(schoolToday());
  const classes = classesOn(list, day);
  return (
    <View style={[s.card, { padding: 16, gap: 12 }]}>
      <View style={s.row}>
        <Ionicons name="time-outline" size={20} color={C.primary} />
        <Text style={[s.h, { flex: 1 }]}>Schedule</Text>
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6 }}>
        {WEEKDAYS.map((d, i) => {
          const on = day === i + 1;
          return (
            <Pressable key={d} onPress={() => setDay(i + 1)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: on ? NAVY : C.bg,
                borderWidth: i + 1 === today && !on ? 1.5 : 0, borderColor: GOLD }}>
              <Text style={{ fontWeight: '800', color: on ? '#fff' : C.ink }}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      {classes.length === 0 && <P muted>No classes that day.</P>}
      {classes.map((c) => (
        <View key={`${c.id}:${day}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 70 }}>
            <Text style={{ fontWeight: '800', color: NAVY }}>{clock(c.startTime)}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{clock(c.endTime)}</Text>
          </View>
          <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: GOLD, paddingLeft: 10 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>{c.className}</Text>
            <Text style={{ color: C.muted }}>{[c.teacher, c.room].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
