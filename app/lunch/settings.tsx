/**
 * Lunch visit settings (lunch.manage: directors, administrators, office): the lunch times families
 * may visit (name, weekdays, time, grades, how many visitors a day), days closed to visits, and the
 * rules everyone reads before booking. Removing a lunch time or closing a day cancels its visits,
 * and the visitors are told.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import {
  closeLunchDay, deleteLunchWindow, errorText, lunchClosedDays, lunchRules, lunchWindows, saveLunchWindow, setLunchRules, type LunchWindow,
} from '../../src/api/connect';
import { clock } from '../../src/absences/labels';
import { schoolToday } from '../../src/calendar/past';
import { gradeLabel } from '../../src/comms/grades';
import { Pills } from '../../src/feedback/ui';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { Button, C, Card, Field, H, Loading, P, ask, s } from '../../src/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const GRADES = Array.from({ length: 16 }, (_, i) => i - 3).map((g) => ({ key: String(g), label: gradeLabel(g) }));
const EMPTY = { id: null as string | null, name: '', weekdays: [1, 2, 3, 4, 5], startTime: '11:30', endTime: '12:00', gradeFrom: 0, gradeTo: 12, capacity: 6, active: true };

export default function LunchSettings() {
  const [windows, setWindows] = useState<LunchWindow[] | null>(null);
  const [closed, setClosed] = useState<{ day: string; reason: string }[]>([]);
  const [rules, setRules] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [closeDay, setCloseDay] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => Alert.alert('Lunch visits', errorText(e));
  const load = useCallback(() => {
    Promise.all([lunchWindows(), lunchClosedDays(), lunchRules()])
      .then(([w, c, r]) => { setWindows(w); setClosed(c.filter((d) => d.day >= schoolToday())); setRules(r); })
      .catch((e) => { fail(e); setWindows([]); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Lunch visit settings' }} />;
  if (!windows) return <>{header}<Loading /></>;
  const set = (p: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...p }));
  const save = () => {
    setBusy(true);
    saveLunchWindow(form).then(() => { setForm(EMPTY); setEditing(false); load(); }).catch(fail).finally(() => setBusy(false));
  };
  const remove = (w: LunchWindow) => ask('Remove this lunch time?', `${w.name}. Visits already booked in it are cancelled, and the visitors told.`, 'Remove',
    () => deleteLunchWindow(w.id).then(load).catch(fail));
  const valid = form.name.trim() && form.weekdays.length && form.endTime > form.startTime && form.gradeTo >= form.gradeFrom && form.capacity > 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <H>Lunch times open to visits</H>
      {windows.length === 0 && <Card><P muted>None yet. Add one so families can book.</P></Card>}
      {windows.map((w) => (
        <Card key={w.id} style={{ gap: 4, opacity: w.active ? 1 : 0.5 }} onPress={() => { setForm({ ...w }); setEditing(true); }}>
          <Text style={{ fontWeight: '800', color: C.ink }}>{w.name}{w.active ? '' : ' (paused)'}</Text>
          <P muted>{w.weekdays.map((d) => DAYS[d - 1]).join(', ')} · {clock(w.startTime)}–{clock(w.endTime)} · {gradeLabel(w.gradeFrom)}–{gradeLabel(w.gradeTo)} · {w.capacity} visitors a day</P>
          <Text style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button" onPress={() => remove(w)}>Remove</Text>
        </Card>
      ))}
      {!editing ? <Button kind="ghost" label="+ Add a lunch time" onPress={() => { setForm(EMPTY); setEditing(true); }} /> : (
        <Card style={{ gap: 8 }}>
          <H>{form.id ? 'Change lunch time' : 'New lunch time'}</H>
          <Field label="Name" placeholder="K–2nd lunch" value={form.name} onChangeText={(name) => set({ name })} maxLength={60} />
          <Text style={{ fontWeight: '700', color: C.ink }}>Days</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
            {DAYS.map((d, i) => {
              const on = form.weekdays.includes(i + 1);
              return (
                <Text key={d} onPress={() => set({ weekdays: on ? form.weekdays.filter((x) => x !== i + 1) : [...form.weekdays, i + 1].sort() })}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                    backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600' }}>{d}</Text>
              );
            })}
          </View>
          <View style={s.row}>
            <TimeField label="Starts" value={form.startTime} onChange={(startTime) => set({ startTime })} style={{ flex: 1 }} />
            <TimeField label="Ends" value={form.endTime} onChange={(endTime) => set({ endTime })} style={{ flex: 1 }} />
          </View>
          <Text style={{ fontWeight: '700', color: C.ink }}>From grade</Text>
          <Pills options={GRADES} value={String(form.gradeFrom)} onChange={(g) => set({ gradeFrom: Number(g), gradeTo: Math.max(Number(g), form.gradeTo) })} />
          <Text style={{ fontWeight: '700', color: C.ink }}>Through grade</Text>
          <Pills options={GRADES.filter((g) => Number(g.key) >= form.gradeFrom)} value={String(form.gradeTo)} onChange={(g) => set({ gradeTo: Number(g) })} />
          <Field label="Visitors a day (guests count)" keyboardType="number-pad" value={String(form.capacity || '')}
            onChangeText={(t) => set({ capacity: Number(t.replace(/\D/g, '')) || 0 })} />
          {!!form.id && <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => set({ active: !form.active })}>{form.active ? 'Pause it (no new bookings)' : 'Open it again'}</Text>}
          <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || !valid} />
          <Text style={{ color: C.muted, fontWeight: '700' }} onPress={() => { setForm(EMPTY); setEditing(false); }}>Cancel</Text>
        </Card>
      )}

      <H>Days closed to visits</H>
      <P muted>No-school days on the school calendar are closed already. Closing a day cancels its visits, and the visitors are told.</P>
      {closed.map((d) => (
        <Card key={d.day} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{new Date(`${d.day}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            {!!d.reason && <P muted>{d.reason}</P>}
          </View>
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => closeLunchDay(d.day, false).then(load).catch(fail)}>Open</Text>
        </Card>
      ))}
      <Card style={{ gap: 8 }}>
        <View style={s.row}>
          <DateField label="Close a day" optional value={closeDay} min={schoolToday()} onChange={setCloseDay} placeholder="Pick a day" style={{ flex: 1 }} />
        </View>
        <Field label="Why (families see it)" placeholder="Field day" value={reason} onChangeText={setReason} maxLength={120} />
        <Button kind="ghost" label="Close it to visits" disabled={!closeDay}
          onPress={() => ask('Close this day?', 'Visits booked that day are cancelled, and the visitors told.', 'Close it',
            () => closeLunchDay(closeDay, true, reason).then(() => { setCloseDay(''); setReason(''); load(); }).catch(fail))} />
      </Card>

      <H>Lunch visit rules</H>
      <Card style={{ gap: 8 }}>
        <Field label="Everyone reads these before booking" value={rules} onChangeText={setRules} multiline maxLength={2000} style={{ minHeight: 120, textAlignVertical: 'top' }} />
        <Button kind="ghost" label="Save the rules" onPress={() => setLunchRules(rules).then(() => Alert.alert('Saved', 'The new rules show to everyone booking.')).catch(fail)} />
      </Card>
    </ScrollView>
  );
}
