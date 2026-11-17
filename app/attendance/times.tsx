/**
 * Class times (`?section=&name=`; a class's roll → the gear): when and where a class meets, for My schedule in the Student
 * app and Now / Next class on students' Planner. A class can meet at different times on different days (Mon, Wed & Fri
 * 9:45–10:35, Tue & Thu 9:45–11:05). Its lead teacher and the office set them; the database checks.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { classTimes, deleteClassTime, errorText, saveClassTime, type ClassMeeting } from '../../src/api/connect';
import { clock } from '../../src/absences/labels';
import { TimeField } from '../../src/forms/DateTimeField';
import { WEEKDAYS, daysLabel } from '../../src/schedule/week';
import { GOLD, NAVY } from '../../src/sports/ui';
import { Button, C, Card, Field, H, Loading, P, ask, s } from '../../src/ui';

type Form = { id: string | null; weekdays: number[]; startTime: string; endTime: string; room: string };
const EMPTY: Form = { id: null, weekdays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '08:50', room: '' };
const oops = (e: unknown) => Alert.alert('Class times', errorText(e));

export default function ClassTimes() {
  const { section, name } = useLocalSearchParams<{ section: string; name?: string }>();
  const [list, setList] = useState<ClassMeeting[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => classTimes(section).then(setList).catch((e) => { oops(e); setList([]); }), [section]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: name ? `${name}: times` : 'Class times' }} />;
  if (!list) return <>{header}<Loading /></>;
  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));
  const save = () => {
    if (!form) return;
    setBusy(true);
    saveClassTime({ ...form, sectionId: section }).then(() => { setForm(null); load(); }).catch(oops).finally(() => setBusy(false));
  };
  const remove = (m: ClassMeeting) => ask('Remove this class time?', `${daysLabel(m.weekdays)}, ${clock(m.startTime)}–${clock(m.endTime)}`, 'Remove',
    () => deleteClassTime(m.id).then(load).catch(oops));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <P muted>When and where this class meets. Its students see them in their schedule, with the class now and next on their Planner.</P>
      {list.length === 0 && !form && <Card><P muted>No times set yet.</P></Card>}
      {list.map((m) => (
        <Pressable key={m.id} onPress={() => setForm({ id: m.id, weekdays: m.weekdays, startTime: m.startTime, endTime: m.endTime, room: m.room })}
          accessibilityRole="button" accessibilityLabel={`${daysLabel(m.weekdays)}, ${clock(m.startTime)} to ${clock(m.endTime)}${m.room ? `, ${m.room}` : ''}. Change`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
            borderColor: C.line, padding: 12, borderLeftWidth: 4, borderLeftColor: GOLD }, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: NAVY }}>{daysLabel(m.weekdays)}</Text>
            <Text style={{ color: C.ink }}>{clock(m.startTime)}–{clock(m.endTime)}{m.room ? ` · ${m.room}` : ''}</Text>
          </View>
          <Pressable onPress={() => remove(m)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove this class time">
            <Ionicons name="trash-outline" size={18} color={C.muted} />
          </Pressable>
        </Pressable>
      ))}
      {!form ? <Button label={list.length ? '+ Add another time' : '+ Add a class time'} onPress={() => setForm(EMPTY)} /> : (
        <Card style={{ gap: 10, borderColor: NAVY, borderWidth: 2 }}>
          <H>{form.id ? 'Change class time' : 'New class time'}</H>
          <Text style={{ fontWeight: '700', color: C.ink }}>Days</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {WEEKDAYS.map((d, i) => {
              const on = form.weekdays.includes(i + 1);
              return (
                <Pressable key={d} onPress={() => set({ weekdays: on ? form.weekdays.filter((x) => x !== i + 1) : [...form.weekdays, i + 1].sort() })}
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: on ? NAVY : C.bg, borderWidth: 1, borderColor: on ? NAVY : C.line }}>
                  <Text style={{ fontWeight: '800', color: on ? '#fff' : C.ink }}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={s.row}>
            <TimeField label="Starts" value={form.startTime} onChange={(startTime) => set({ startTime })} style={{ flex: 1 }} />
            <TimeField label="Ends" value={form.endTime} onChange={(endTime) => set({ endTime })} style={{ flex: 1 }} />
          </View>
          <Field label="Room" placeholder="Room 204" value={form.room} onChangeText={(room) => set({ room })} maxLength={40} />
          <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !form.weekdays.length || form.endTime <= form.startTime} onPress={save} />
          <Button label="Cancel" kind="ghost" onPress={() => setForm(null)} />
        </Card>
      )}
    </ScrollView>
  );
}
