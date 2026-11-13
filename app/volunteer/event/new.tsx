/**
 * A Volunteer Leader starts an event (Harvest Fest) to group opportunities under, or
 * (?id=) changes one they started, with a cover photo of their own if they like (else the
 * card shows a drawing). Opportunities are added from the event's page.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { errorText, listVolunteerEvents, setVolunteerPhoto, volunteerEventSave, type VolunteerEvent } from '../../../src/api/connect';
import { CoverPhotoField, type PickedPhoto } from '../../../src/volunteer/CoverPhoto';
import { PostGate } from '../../../src/volunteer/canPost';
import { DateField } from '../../../src/forms/DateTimeField';
import { EventAlbumSwitch, makeAlbumFor } from '../../../src/gallery/EventAlbumSwitch';
import { isDate } from '../../../src/forms/dates';
import { todayIso } from '../../../src/volunteer/format';
import { VolunteerGate } from '../../../src/volunteer/VolunteerGate';
import { Button, Card, Field, Loading, P, s } from '../../../src/ui';

export default function EventForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <VolunteerGate title={id ? 'Change event' : 'New event'}>
      {(me) => <PostGate me={me} why="Only Volunteer Leaders and coaches can start events.">{id ? <Edit id={id} /> : <Form />}</PostGate>}
    </VolunteerGate>
  );
}

/** Loads the event, then the form filled in with it. */
function Edit({ id }: { id: string }) {
  const [event, setEvent] = useState<VolunteerEvent | null | undefined>();
  useEffect(() => { listVolunteerEvents().then((list) => setEvent(list.find((e) => e.id === id) ?? null)).catch(() => setEvent(null)); }, [id]);
  if (event === undefined) return <Loading />;
  if (!event) return <View style={[s.screen, s.pad]}><Card><P muted>{"This event isn't available."}</P></Card></View>;
  return <Form event={event} />;
}

function Form({ event }: { event?: VolunteerEvent }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [date, setDate] = useState(event?.startsOn ?? todayIso());
  const [endDate, setEndDate] = useState(event?.endsOn ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [album, setAlbum] = useState(false);
  // The cover photo showing (its link, or a new pick to upload); changed once picked or removed.
  const [photo, setPhoto] = useState<{ uri: string; base64?: string } | null>(event?.image ? { uri: event.image } : null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = !title.trim() ? 'Give the event a name, like "Harvest Fest".'
      : !isDate(date) ? 'Choose the day of the event.'
      : !event && date < todayIso() ? "The date can't be in the past."
      : endDate && (!isDate(endDate) || endDate < date) ? 'The end date must be on or after the start.' : null;
    if (problem) return Alert.alert('Almost there', problem);
    setBusy(true);
    try {
      const id = await volunteerEventSave({
        id: event?.id, title: title.trim(), description: description.trim(), startsOn: date,
        endsOn: endDate && endDate !== date ? endDate : null, location: location.trim() || null,
      });
      // The event is saved either way; a photo that didn't make it can be tried again from Change event details.
      if (photoChanged) {
        await setVolunteerPhoto({ eventId: id }, photo?.base64 ?? null)
          .catch((e) => Alert.alert('Saved without the photo', `${errorText(e)} Try again from Change event details.`));
      }
      if (event) return router.back();
      if (album) await makeAlbumFor({ kind: 'volunteer', id });
      router.replace(`/volunteer/event/${id}`);
    } catch (e) {
      Alert.alert("Couldn't save", errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {!event && (
        <P muted>{'An event is one card in the Volunteer app with its opportunities inside, like Harvest Fest with bringing bottled water '
          + "and setting up the day of. Add them from the event once it's made."}</P>
      )}
      <Card>
        <Field label="Event name" placeholder="e.g. Harvest Fest" value={title} onChangeText={setTitle} maxLength={100} />
        <Field label="Details (optional)" style={{ minHeight: 110, textAlignVertical: 'top' }} multiline maxLength={2000}
          placeholder={'What the event is…\n\nGood to know:\nFamilies are welcome'} value={description} onChangeText={setDescription}
          hint={'Each part gets its own card. Leave a blank line between parts, and start one with a short heading and a colon, like "Good to know:".'} />
      </Card>
      <Card>
        <View style={s.row}>
          <DateField label="Date" value={date} min={event ? undefined : todayIso()} style={{ flex: 1 }}
            onChange={(d) => { setDate(d); if (endDate && endDate < d) setEndDate(''); }} />
          <DateField label="End date (optional)" optional value={endDate} onChange={setEndDate} min={date} initial={date} placeholder="Same day" style={{ flex: 1 }} />
        </View>
        <Field label="Where (optional)" placeholder="e.g. Front lawn" value={location} onChangeText={setLocation} maxLength={120} />
      </Card>
      <Card>
        <CoverPhotoField value={photo?.uri ?? null} busy={busy}
          onPick={(p: PickedPhoto) => { setPhoto(p); setPhotoChanged(true); }}
          onRemove={() => { setPhoto(null); setPhotoChanged(true); }} />
      </Card>
      {!event && <EventAlbumSwitch value={album} onChange={setAlbum} />}
      <Button label={busy ? 'Saving…' : event ? 'Save changes' : 'Create event'} disabled={busy} onPress={save} />
    </ScrollView>
  );
}
