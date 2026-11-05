import { isDate } from '../../src/forms/dates';
/**
 * Add or edit a schedule item (coaches/directors and activity managers): games and practices
 * for sports, rehearsals, auditions and performances for theater and music, meetings and
 * competitions for clubs. Everyone involved is told when it's added, moved or cancelled. Opened
 * from the Activities home (no `sport`), it first asks which of the activities you run it's for.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  canManageSport, cancelSportEvent, deleteSportEvent, listSports, me, myAccess, saveSportEvent, sportSchedule,
  type Sport, type SportEvent, type SportEventKind, type SportSeason,
} from '../../src/api/connect';
import { SportRow } from '../../src/sports/ui';
import { categoryInfo, hasHomeAway, KIND_LABELS, titleHint, type Category } from '../../src/sports/categories';
import { activeSeasons, parseTime, schoolToday, timeLabel } from '../../src/sports/seasons';
import { Button, C, Card, Field, Loading, P, s } from '../../src/ui';
import { DateField, TimeField, toTimeString } from '../../src/forms/DateTimeField';

/** A date and a typed time on the phone's clock → ISO. */
const toIso = (date: string, time: string) => {
  const t = parseTime(time);
  if (!isDate(date) || !t) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, t.h, t.m).toISOString();
};
const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const localTime = (iso: string) => toTimeString(new Date(iso));

export default function EditSportEvent() {
  const { sport } = useLocalSearchParams<{ sport?: string }>();
  return sport ? <EventForm sport={sport} /> : <PickActivity />;
}

/** Which activity it's for: the ones this person coaches or directs (all of them for activity managers). */
function PickActivity() {
  const [mine, setMine] = useState<Sport[] | null>(null);
  useEffect(() => {
    Promise.all([listSports(), myAccess().catch(() => null)])
      .then(([{ sports }, access]) => setMine(sports.filter((sp) => canManageSport(sp, access, me()))))
      .catch(() => setMine([]));
  }, []);
  const header = <Stack.Screen options={{ title: 'Add an event' }} />;
  if (!mine) return <>{header}<Loading /></>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      <P muted>Which activity is it for?</P>
      {mine.length === 0 && <Card><P muted>Only an activity's coaches and directors add to its schedule.</P></Card>}
      {mine.map((sp) => <SportRow key={sp.id} sport={sp} line={categoryInfo(sp.category).label} onPress={() => router.setParams({ sport: sp.id })} />)}
    </ScrollView>
  );
}

function EventForm({ sport }: { sport: string }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [seasons, setSeasons] = useState<SportSeason[] | null>(null);
  const [category, setCategory] = useState<Category>('sports');
  const [existing, setExisting] = useState<SportEvent | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [kind, setKind] = useState<SportEventKind>('game');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(schoolToday());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [home, setHome] = useState<boolean | null>(true);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSports().then(async ({ sports, seasons: all }) => {
      const cat = categoryInfo(sports.find((x) => x.id === sport)?.category);
      setCategory(cat.key);
      if (!id) setKind((k) => (cat.kinds.includes(k) ? k : cat.kinds[0]));
      const active = activeSeasons(all, sport, schoolToday());
      setSeasons(active);
      setSeason((cur) => cur ?? active[0]?.id ?? null);
      if (id) {
        const e = (await sportSchedule(all.filter((x) => x.sportId === sport).map((x) => x.id), { past: true })).find((x) => x.id === id);
        if (e) {
          setExisting(e); setSeason(e.seasonId); setKind(e.kind); setTitle(e.title); setDate(localDate(e.startsAt));
          setStart(localTime(e.startsAt)); setEnd(e.endsAt ? localTime(e.endsAt) : ''); setLocation(e.location ?? ''); setAddress(e.address ?? '');
          setHome(e.home); setNotes(e.notes);
        }
      }
    });
  }, [sport, id]);
  if (!seasons) return <Loading />;
  if (!seasons.length) return (
    <View style={[s.screen, s.pad]}>
      <Stack.Screen options={{ title: 'Add an event' }} />
      <Card style={{ gap: 10 }}>
        <P>Events go in a season, and this activity has none coming up. Add its season first (when it runs and when sign-ups open).</P>
        <Button label="+ New season" onPress={() => router.replace({ pathname: '/activities/season', params: { sport } })} />
      </Card>
    </View>
  );

  const startsAt = toIso(date, start);
  const endsAt = end.trim() ? toIso(date, end) : null;
  const valid = !!season && !!title.trim() && !!startsAt && (!end.trim() || (!!endsAt && endsAt >= startsAt));
  const withHome = hasHomeAway(kind);
  const save = () => {
    setBusy(true);
    saveSportEvent({
      id: id ?? null, seasonId: season!, kind, title, startsAt: startsAt!, endsAt,
      location: location.trim() || null, address: address.trim() || null, home: withHome ? home : null, notes,
    }).then(() => router.back()).catch((e) => Alert.alert('Activities', e.message)).finally(() => setBusy(false));
  };
  const ask = (q: string, ok: string, go: () => void) => {
    if (Platform.OS === 'web') { if (globalThis.confirm?.(q)) go(); return; }
    Alert.alert(q, 'Everyone following or signed up is told.', [{ text: 'Back', style: 'cancel' }, { text: ok, style: 'destructive', onPress: go }]);
  };
  const pill = (label: string, on: boolean, onPress: () => void) => (
    <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: on ? C.primary : C.line,
        backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '600' }}>{label}</Text>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: id ? 'Edit event' : 'Add an event' }} />
      <Card style={{ gap: 12 }}>
        {seasons.length > 1 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Season</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>{seasons.map((x) => pill(x.name, season === x.id, () => setSeason(x.id)))}</View>
          </View>
        )}
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {categoryInfo(category).kinds.map((k) => pill(KIND_LABELS[k], kind === k, () => setKind(k)))}
        </View>
        <Field label="Title" placeholder={titleHint(kind)}
          value={title} onChangeText={setTitle} maxLength={120} />
        <DateField label="Date" value={date} onChange={setDate} />
        <View style={[s.row, { alignItems: 'flex-start' }]}>
          <TimeField label="Starts" value={start} onChange={setStart} initial="16:30" style={{ flex: 1 }} />
          <TimeField label="Ends (optional)" optional value={end} onChange={setEnd} initial={start || '18:00'} style={{ flex: 1 }} />
        </View>
        <Field label="Where" placeholder={category === 'theater' || category === 'music' ? 'Dream Theatre' : 'Gym'} value={location} onChangeText={setLocation} />
        <Field label="Address (optional)" placeholder="429 Taylor Road, Huntsville, AL 35763" hint="For away games and other venues; Directions opens Maps."
          value={address} onChangeText={setAddress} maxLength={200} />
        {withHome && <View style={[s.row]}>{pill('Home', home === true, () => setHome(true))}{pill('Away', home === false, () => setHome(false))}</View>}
        <Field label="Notes (optional)" placeholder={category === 'sports' ? 'Bus leaves at 3:15, wear white…' : 'What to bring, who should come…'}
          value={notes} onChangeText={setNotes} multiline />
      </Card>
      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !valid} onPress={save} />
      {!startsAt && start.trim() !== '' && <P muted>Times like 4:30 PM or 16:30.</P>}
      {existing && (
        <Button label={existing.cancelled ? 'Put it back on' : 'Cancel this'} kind="ghost"
          onPress={() => ask(existing.cancelled ? 'Put it back on the schedule?' : `Cancel ${existing.title}?`, existing.cancelled ? 'Put back' : 'Cancel it',
            () => cancelSportEvent(existing.id, !existing.cancelled).then(() => router.back()).catch((e) => Alert.alert('Activities', e.message)))} />
      )}
      {existing && (
        <Button label="Delete" kind="ghost" onPress={() => ask(`Delete ${existing.title}?`, 'Delete',
          () => deleteSportEvent(existing.id).then(() => router.back()).catch((e) => Alert.alert('Activities', e.message)))} />
      )}
    </ScrollView>
  );
}
