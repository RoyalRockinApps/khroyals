/**
 * Volunteer time slots on screen (src/volunteer/slots.ts). `TimeSlots`: an opportunity's page lists its slots (day and
 * time, how full, whether you said yes); tapping one opens it, and its leaders add another. `SlotFields`: one slot's day,
 * times and spots, for adding one here or more while posting (app/volunteer/new.tsx). `slotProblem` checks them.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Opportunity, Person, Signup } from '../api/connect';
import { PAST_STYLE } from '../calendar/PastToggle';
import { DateField, TimeField } from '../forms/DateTimeField';
import { isDate, isTime, parseDate, toDateString } from '../forms/dates';
import { Button, C, Chip, Field, P, s } from '../ui';
import { spotsLeft } from './details';
import { countLabel, isPast, todayIso, whenLabel } from './format';
import { GREEN, Section } from './parts';

/** A time slot being written: day, optional end day and times, and spots (empty: no limit). */
export type SlotDraft = { date: string; endDate: string; start: string; end: string; spots: string };

export const draftFrom = (o?: { startsOn: string; startTime: string | null; endTime: string | null; spots: number | null }): SlotDraft => ({
  date: o?.startsOn ?? todayIso(), endDate: '', start: o?.startTime ?? '', end: o?.endTime ?? '', spots: o?.spots ? String(o.spots) : '',
});

/** The next slot to suggest after this one: the same times and spots, the day after. */
export function nextSlot(d: SlotDraft): SlotDraft {
  const day = parseDate(d.endDate || d.date);
  if (day) day.setDate(day.getDate() + 1);
  return { ...d, date: day ? toDateString(day) : d.date, endDate: '' };
}

/** What's wrong with a slot, if anything. */
export function slotProblem(d: SlotDraft): string | null {
  const n = d.spots.trim() ? Number.parseInt(d.spots, 10) : null;
  return !isDate(d.date) ? 'Choose a date.'
    : d.date < todayIso() ? "A time slot can't be in the past."
    : d.endDate && (!isDate(d.endDate) || d.endDate < d.date) ? 'The end date must be on or after the start.'
    : (d.start && !isTime(d.start)) || (d.end && !isTime(d.end)) ? 'Choose the times again.'
    : d.start && d.end && !d.endDate && d.end <= d.start ? 'The end time must be after the start time.'
    : n !== null && !(n >= 1 && n <= 500) ? 'Spots must be a number, or leave it empty for no limit.' : null;
}

/** A checked slot as the API takes it. */
export const slotOf = (d: SlotDraft) => ({
  startsOn: d.date, endsOn: d.endDate && d.endDate !== d.date ? d.endDate : null, startTime: d.start || null, endTime: d.end || null,
  spots: d.spots.trim() ? Number.parseInt(d.spots, 10) : null,
});

/** One slot's day, end day, times and spots. */
export function SlotFields({ value, onChange }: { value: SlotDraft; onChange: (d: SlotDraft) => void }) {
  const set = (patch: Partial<SlotDraft>) => onChange({ ...value, ...patch });
  return (
    <View style={{ gap: 10 }}>
      <View style={s.row}>
        <DateField label="Date" value={value.date} min={todayIso()} style={{ flex: 1 }}
          onChange={(date) => set({ date, endDate: value.endDate && value.endDate < date ? '' : value.endDate })} />
        <DateField label="End date (optional)" optional value={value.endDate} onChange={(endDate) => set({ endDate })} min={value.date}
          initial={value.date} placeholder="Same day" style={{ flex: 1 }} />
      </View>
      <View style={s.row}>
        <TimeField label="Start time (optional)" optional value={value.start} onChange={(start) => set({ start })} initial="15:00" style={{ flex: 1 }} />
        <TimeField label="End time (optional)" optional value={value.end} onChange={(end) => set({ end })} initial={value.start || '16:00'} style={{ flex: 1 }} />
      </View>
      <Field label="Volunteers needed (optional)" placeholder="No limit if empty" keyboardType="number-pad" value={value.spots}
        onChangeText={(spots) => set({ spots })} />
    </View>
  );
}

/**
 * The page's Time slots: every slot of this opportunity, soonest first, the open one marked; its leaders add one more
 * (starting from this slot's times and spots). `onAdd` resolves true once it's added.
 */
export function TimeSlots({ current, slots, signups, me, canAdd, busy, onAdd, onProblem }: {
  current: Opportunity; slots: Opportunity[]; signups: Signup[]; me: Person; canAdd: boolean; busy: boolean;
  onAdd: (slot: ReturnType<typeof slotOf>) => Promise<boolean>; onProblem: (text: string) => void;
}) {
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const add = async () => {
    if (!draft) return;
    const problem = slotProblem(draft);
    if (problem) return onProblem(problem);
    if (await onAdd(slotOf(draft))) setDraft(null);
  };
  return (
    <Section icon="time-outline" title={slots.length > 1 ? `Time slots (${slots.length})` : 'Time slots'} tint={C.accent}>
      {slots.length > 1
        ? <P muted>Each time has its own spots. Tap one to see it and say yes.</P>
        : <P muted>Need help at more than one time? Add another day or time; each has its own spots and sign-ups.</P>}
      {slots.length > 1 && (
        <View style={{ gap: 6 }}>
          {slots.map((o) => {
            const here = o.id === current.id;
            const said = signups.filter((x) => x.opportunityId === o.id);
            const mine = said.some((x) => x.userId === me.id);
            const left = o.status === 'open' && !isPast(o) ? spotsLeft(said.length, o.spots) : null;
            return (
              <Pressable key={o.id} disabled={here} onPress={() => router.setParams({ id: o.id })} accessibilityRole="button"
                accessibilityState={{ selected: here }} accessibilityLabel={`${whenLabel(o)}, ${countLabel(said.length, o.spots)} said yes${mine ? ', you said yes' : ''}`}
                style={({ pressed }) => [s.row, { gap: 10, padding: 12, borderRadius: 12, borderWidth: here ? 2 : 1,
                  borderColor: here ? C.accent : C.line, backgroundColor: here ? `${C.accent}0F` : '#fff' },
                  (isPast(o) || o.status === 'deleted') && PAST_STYLE, pressed && { opacity: 0.8 }]}>
                <Ionicons name={mine ? 'checkmark-circle' : here ? 'radio-button-on' : 'radio-button-off'} size={20}
                  color={mine ? GREEN : here ? C.accent : C.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '800', color: C.ink, textDecorationLine: o.status === 'deleted' ? 'line-through' : 'none' }}>{whenLabel(o)}</Text>
                  <Text style={{ color: C.muted }}>
                    {countLabel(said.length, o.spots)} {o.spots ? 'spots filled' : said.length === 1 ? 'volunteer' : 'volunteers'}
                  </Text>
                </View>
                {o.status === 'deleted' ? <Chip label="Cancelled" color={C.danger} />
                  : mine ? <Chip label="You said yes" color={GREEN} />
                  : left ? <Text style={{ color: left === 'Full' ? C.muted : GREEN, fontWeight: '800' }}>{left}</Text> : null}
                {!here && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
              </Pressable>
            );
          })}
        </View>
      )}
      {canAdd && (draft ? (
        <View style={{ gap: 10, paddingTop: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>Add a time slot</Text>
          <SlotFields value={draft} onChange={setDraft} />
          <View style={s.row}>
            <View style={{ flex: 1 }}><Button kind="ghost" label="Cancel" onPress={() => setDraft(null)} /></View>
            <View style={{ flex: 1 }}><Button label={busy ? 'Adding…' : 'Add time slot'} disabled={busy} onPress={add} /></View>
          </View>
        </View>
      ) : (
        <Button kind="ghost" label="+ Add a time slot" onPress={() => {
          // The day after the last slot, at the same times.
          const last = [...slots].reverse().find((x) => x.status === 'open') ?? current;
          const next = nextSlot({ ...draftFrom(last), endDate: last.endsOn ?? '' });
          setDraft(next.date < todayIso() ? { ...next, date: todayIso() } : next);
        }} />
      ))}
    </Section>
  );
}
