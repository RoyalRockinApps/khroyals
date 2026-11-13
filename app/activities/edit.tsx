/**
 * Add or edit an activity (activity managers; the activity page's gear): category, name, emoji and a short description,
 * and, once it exists, its coaches or directors (faculty and staff).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { deleteSport, getUser, listSports, listUsers, saveSport, setSportCoach, type Person } from '../../src/api/connect';
import { CATEGORIES, categoryInfo, leaders, type Category } from '../../src/sports/categories';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

const EMOJI: Record<Category, string> = {
  sports: '🏐 🏀 ⚽ 🏈 ⚾ 🎾 🏃 ⛳', theater: '🎭 🎬 🎟️', music: '🎵 🎤 🎹 🎻 🥁 🎺', art: '🎨 🖌️ 📷 🏺', clubs: '🤖 ♟️ 🔬 📚 🌱',
};

export default function EditActivity() {
  const { id, category: start } = useLocalSearchParams<{ id?: string; category?: Category }>();
  const [loaded, setLoaded] = useState(!id);
  const [category, setCategory] = useState<Category>(categoryInfo(start).key);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(categoryInfo(start).emoji);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    listSports().then(({ sports }) => {
      const sp = sports.find((x) => x.id === id);
      if (sp) { setName(sp.name); setIcon(sp.icon); setDescription(sp.description); setCategory(sp.category); }
      setLoaded(true);
    });
  }, [id]);
  if (!loaded) return <Loading />;

  const pick = (c: Category) => {
    // A new activity's emoji follows the category until one is chosen.
    if (!id && CATEGORIES.some((x) => x.emoji === icon)) setIcon(categoryInfo(c).emoji);
    setCategory(c);
  };
  const save = () => {
    setBusy(true);
    saveSport({ id: id ?? null, name, icon, description, category })
      .then((row) => (id ? router.back() : router.replace(`/activities/${row.id}`)))
      .catch((e) => Alert.alert('Activities', e.message)).finally(() => setBusy(false));
  };
  const remove = () => {
    const go = () => deleteSport(id!).then(() => router.replace('/activities')).catch((e) => Alert.alert('Activities', e.message));
    if (Platform.OS === 'web') { if (globalThis.confirm?.(`Delete ${name}?`)) go(); return; }
    Alert.alert(`Delete ${name}?`, 'Its seasons, schedule, sign-ups and followers go too. This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: id ? 'Edit activity' : 'New activity' }} />
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Category</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
            {CATEGORIES.map((c) => {
              const on = c.key === category;
              return (
                <Text key={c.key} onPress={() => pick(c.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
                    borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '700' }}>
                  {c.emoji} {c.label}
                </Text>
              );
            })}
          </View>
        </View>
        <Field label="Name" placeholder={category === 'theater' ? 'Spring Musical' : category === 'music' ? 'Choir' : category === 'clubs' ? 'Robotics' : 'Volleyball'}
          value={name} onChangeText={setName} maxLength={60} />
        <Field label="Emoji" hint={`Shown beside the name, like ${EMOJI[category]}`} value={icon} onChangeText={setIcon} maxLength={4} style={{ width: 90 }} />
        <Field label="Description" placeholder="Who it's for and what to expect" value={description} onChangeText={setDescription} multiline style={{ minHeight: 80 }} />
      </Card>
      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy || !name.trim()} onPress={save} />
      {!!id && <Leaders sportId={id} category={category} />}
      {id ? <Button label="Delete activity" kind="ghost" onPress={remove} />
        : <P muted>Then add a season, its schedule and its {leaders(category, 2).toLowerCase()} from the activity's page.</P>}
    </ScrollView>
  );
}

/** Who leads the activity: its coaches or directors, added from faculty and staff and removed here. */
function Leaders({ sportId, category }: { sportId: string; category: Category }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [staff, setStaff] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => {
    listSports().then(({ sports }) => setIds(sports.find((x) => x.id === sportId)?.coachIds ?? [])).catch(() => setIds([]));
  }, [sportId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listUsers().then((ps) => setStaff(ps.filter((p) => ['admin', 'teacher', 'staff'].includes(p.schoolRole)))).catch(() => {}); }, []);
  if (!ids) return <Loading />;
  const set = (uid: string, on: boolean) => { setQ(''); setSportCoach(sportId, uid, on).then(load).catch((e) => Alert.alert('Activities', e.message)); };
  const label = (uid: string) => { const p = getUser(uid); return p ? `${p.firstName} ${p.lastName}` : 'Someone'; };
  const many = leaders(category, 2);
  const matches = q.trim().length < 2 ? [] : staff.filter((p) => !ids.includes(p.id)
    && `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5);
  return (
    <Card style={{ gap: 8, marginTop: 8 }}>
      <H>{many}</H>
      {ids.length === 0 && <P muted>No {many.toLowerCase()} yet. Sign-ups go to the activity managers until there are.</P>}
      {ids.map((uid) => (
        <View key={uid} style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: C.ink, fontWeight: '600' }}>{label(uid)}</Text>
          <Text style={{ color: C.danger, fontWeight: '700' }} onPress={() => set(uid, false)} accessibilityRole="button">Remove</Text>
        </View>
      ))}
      <TextInput style={s.input} placeholder={`Add a ${categoryInfo(category).leader.toLowerCase()}: search faculty and staff`} value={q} onChangeText={setQ}
        accessibilityLabel="Search faculty and staff" />
      {matches.map((p) => (
        <Text key={p.id} style={{ color: C.primary, fontWeight: '700', paddingVertical: 4 }} onPress={() => set(p.id, true)} accessibilityRole="button">
          + {p.firstName} {p.lastName}
        </Text>
      ))}
    </Card>
  );
}
