/**
 * A Volunteer Leader posts an opportunity: asking for people's time, or for items (how many
 * of what, brought by a date), on its own or as part of an event (?event= from the event's page).
 * One asking for time goes to everyone, or only to the people they invite (a draft nobody else
 * sees): posting that opens its page with the people picker. A cover photo of their own is optional
 * (src/volunteer/CoverPhoto.tsx); without one the card shows a drawing that matches its title.
 * Help needed at several times gets more time slots, each with its own spots (src/volunteer/TimeSlots.tsx).
 */
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, listVolunteerEvents, setVolunteerPhoto, volunteerAddSlot, volunteerPost, type VolunteerEvent } from '../../src/api/connect';
import { isDate, isTime } from '../../src/forms/dates';
import { isPast, todayIso } from '../../src/volunteer/format';
import { CoverPhotoField, type PickedPhoto } from '../../src/volunteer/CoverPhoto';
import { EventChips } from '../../src/volunteer/parts';
import { SlotFields, nextSlot, slotOf, slotProblem, type SlotDraft } from '../../src/volunteer/TimeSlots';
import { PostGate } from '../../src/volunteer/canPost';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, Field, P, s } from '../../src/ui';
import { DateField, TimeField } from '../../src/forms/DateTimeField';


export default function NewOpportunity() {
  return (
    <VolunteerGate title="New opportunity">
      {(me) => <PostGate me={me} why="Only Volunteer Leaders and coaches can post opportunities."><Form /></PostGate>}
    </VolunteerGate>
  );
}

function Form() {
  const { event } = useLocalSearchParams<{ event?: string }>();
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(event ?? null);
  const [kind, setKind] = useState<'help' | 'items'>('help');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [spots, setSpots] = useState('');
  const [inviteOnly, setInviteOnly] = useState(false);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [more, setMore] = useState<SlotDraft[]>([]);   // time slots after the first
  const [busy, setBusy] = useState(false);

  // The events still to come. Choosing one (or coming from its page) starts with its day and place.
  const fillFrom = (e: VolunteerEvent | undefined) => {
    if (!e) return;
    setDate((d) => (d === todayIso() && e.startsOn > d ? e.startsOn : d));
    if (e.location) setLocation((l) => l || e.location!);
  };
  useEffect(() => {
    listVolunteerEvents().then((list) => {
      setEvents(list.filter((e) => !isPast(e)));
      fillFrom(list.find((e) => e.id === event));
    }).catch(() => {});
  }, [event]);
  const chooseEvent = (id: string | null) => {
    setEventId(id);
    fillFrom(events.find((x) => x.id === id));
  };

  const items = kind === 'items';
  const post = async () => {
    const n = spots.trim() ? Number.parseInt(spots, 10) : null;
    const q = Number.parseInt(quantity, 10);
    const problem = !title.trim() ? 'Add a title.'
      : items && !item.trim() ? 'Say what you need, like "boxes of tissues".'
      : items && !(q >= 1 && q <= 10000) ? 'Say how many you need.'
      : !isDate(date) ? 'Choose a date.'
      : date < todayIso() ? "The date can't be in the past."
      : endDate && (!isDate(endDate) || endDate < date) ? 'The end date must be on or after the start.'
      : (start && !isTime(start)) || (end && !isTime(end)) ? 'Choose the times again.'
      : start && end && !endDate && end <= start ? 'The end time must be after the start time.'
      : n !== null && !(n >= 1) ? 'Spots must be a number, or leave it empty for no limit.'
      : items ? null
      : more.map((d, i) => { const p = slotProblem(d); return p && `Time slot ${i + 2}: ${p}`; }).find(Boolean) ?? null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      const o = await volunteerPost(items
        ? { title: title.trim(), description: description.trim(), startsOn: date, endsOn: null, startTime: null, endTime: null,
            location: location.trim() || null, spots: null, items: { item: item.trim(), quantity: q }, eventId }
        : { title: title.trim(), description: description.trim(), startsOn: date, endsOn: endDate || null,
            startTime: start || null, endTime: end || null, location: location.trim() || null, spots: n, eventId, inviteOnly });
      // It's posted either way; time slots or a photo that didn't make it can be added from its page.
      if (!items) {
        const failed: string[] = [];
        for (const d of more) await volunteerAddSlot(o.id, slotOf(d)).catch((e) => { failed.push(errorText(e)); });
        if (failed.length) Alert.alert('Posted without some time slots', `${failed.length} couldn't be added: ${failed[0]} Add them from its page.`);
      }
      if (photo) {
        await setVolunteerPhoto({ opportunityId: o.id }, photo.base64)
          .catch((e) => Alert.alert('Posted without the photo', `${errorText(e)} Add it again from its page.`));
      }
      router.replace(o.inviteOnly ? { pathname: '/volunteer/[id]', params: { id: o.id, invite: '1' } } : `/volunteer/${o.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't post", e.message);
    } finally {
      setBusy(false);
    }
  };

  const option = (value: 'help' | 'items', icon: React.ComponentProps<typeof Ionicons>['name'], label: string) => (
    <Pressable onPress={() => setKind(value)} accessibilityRole="button" accessibilityState={{ selected: kind === value }}
      style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999,
        backgroundColor: kind === value ? C.primary : 'transparent' }}>
      <Ionicons name={icon} size={16} color={kind === value ? '#fff' : C.muted} />
      <Text style={{ fontWeight: '800', color: kind === value ? '#fff' : C.muted }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
          {option('help', 'people', 'Volunteers')}
          {option('items', 'gift', 'Items')}
        </View>
        <P muted>{items ? 'Ask families to bring things, like tissues or snacks. They pledge how many, and everyone sees how much is still needed.'
          : "Ask for people's time. They Say Yes! until the spots fill."}</P>
      </View>
      {events.length > 0 && (
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Part of an event (optional)</Text>
          <EventChips events={events} value={eventId} onChange={chooseEvent} />
        </Card>
      )}
      <Card>
        <Field label={items ? "What's the request?" : "What's the opportunity?"} placeholder={items ? 'e.g. Tissues for every homeroom' : 'e.g. Book fair helpers'}
          value={title} onChangeText={setTitle} maxLength={100} />
        {items && (
          <View style={s.row}>
            <Field label="What do you need?" placeholder="e.g. boxes of tissues" value={item} onChangeText={setItem} maxLength={80} style={{ flex: 2 }} />
            <Field label="How many?" placeholder="e.g. 24" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} style={{ flex: 1 }} />
          </View>
        )}
        <Field label="Details" style={{ minHeight: 110, textAlignVertical: 'top' }} multiline maxLength={2000}
          placeholder={items ? 'What it\'s for…\n\nGood to know:\nAny brand is fine' : 'What volunteers will do…\n\nWhat to bring:\nA water bottle'}
          value={description} onChangeText={setDescription}
          hint={'Each part gets its own card. Leave a blank line between parts, and start one with a short heading and a colon, like "What to bring:".'} />
      </Card>
      <Card>
        {!items && more.length > 0 && <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>Time slot 1</Text>}
        {items ? (
          <DateField label="Bring by" value={date} min={todayIso()} onChange={setDate} />
        ) : (
          <>
            <View style={s.row}>
              <DateField label="Date" value={date} min={todayIso()} onChange={(d) => { setDate(d); if (endDate && endDate < d) setEndDate(''); }} style={{ flex: 1 }} />
              <DateField label="End date (optional)" optional value={endDate} onChange={setEndDate} min={date} initial={date} placeholder="Same day" style={{ flex: 1 }} />
            </View>
            <View style={s.row}>
              <TimeField label="Start time (optional)" optional value={start} onChange={setStart} initial="15:00" style={{ flex: 1 }} />
              <TimeField label="End time (optional)" optional value={end} onChange={setEnd} initial={start || '16:00'} style={{ flex: 1 }} />
            </View>
          </>
        )}
        <Field label={items ? 'Drop off at (optional)' : more.length ? 'Where, for every time slot (optional)' : 'Where (optional)'} placeholder={items ? 'e.g. Front office' : 'e.g. Library'}
          value={location} onChangeText={setLocation} maxLength={120} />
        {!items && <Field label="Volunteers needed (optional)" placeholder="No limit if empty" keyboardType="number-pad" value={spots} onChangeText={setSpots} />}
      </Card>
      {!items && more.map((d, i) => (
        <Card key={i}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>Time slot {i + 2}</Text>
            <Text style={{ color: C.danger, fontWeight: '700' }} accessibilityRole="button" accessibilityLabel={`Remove time slot ${i + 2}`}
              onPress={() => setMore(more.filter((_, j) => j !== i))}>Remove</Text>
          </View>
          <SlotFields value={d} onChange={(next) => setMore(more.map((x, j) => (j === i ? next : x)))} />
        </Card>
      ))}
      {!items && (
        <View style={{ gap: 4 }}>
          <Button kind="ghost" label="+ Add another time slot" onPress={() => {
            // The day after the last slot, at the same times and spots.
            setMore([...more, nextSlot(more[more.length - 1] ?? { date, endDate, start, end, spots })]);
          }} />
          {more.length === 0 && <P muted>Need help at more than one time? Each time slot has its own spots and sign-ups.</P>}
        </View>
      )}
      {!items && (
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Who can say yes</Text>
          <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
            {([[false, 'people-outline', 'Everyone'], [true, 'mail-outline', 'Only people I invite']] as const).map(([value, icon, label]) => (
              <Pressable key={label} onPress={() => setInviteOnly(value)} accessibilityRole="button" accessibilityState={{ selected: inviteOnly === value }}
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999,
                  backgroundColor: inviteOnly === value ? C.primary : 'transparent' }}>
                <Ionicons name={icon} size={16} color={inviteOnly === value ? '#fff' : C.muted} />
                <Text style={{ fontWeight: '800', color: inviteOnly === value ? '#fff' : C.muted }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <P muted>{inviteOnly
            ? 'Nobody else sees it. Next, choose who to invite: each answers Say Yes! or Deny, and you’re told either way.'
            : 'Everyone who volunteers sees it. You can still invite people in particular from its page.'}</P>
        </Card>
      )}
      <Card>
        <CoverPhotoField value={photo?.uri ?? null} onPick={setPhoto} onRemove={() => setPhoto(null)} busy={busy} />
      </Card>
      <Button label={busy ? 'Posting…' : items ? 'Post request' : inviteOnly ? 'Save and choose who to invite' : 'Post opportunity'} disabled={busy} onPress={post} />
    </ScrollView>
  );
}
