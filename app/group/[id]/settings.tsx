/**
 * A group's settings (its owners, and groups.manage): who can do what, and at the bottom,
 * archive the group (gone for everyone else, restorable) or, once archived, delete it for good.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { archiveGroup, deleteGroup, errorText, getGroup, updateGroupSettings } from '../../../src/api/connect';
import { SettingsForm } from '../../../src/comms/SettingsForm';
import type { Group, GroupSettings } from '../../../src/comms/types';
import { Button, C, Card, Field, H, Loading, P, ask, s } from '../../../src/ui';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [v, setV] = useState<GroupSettings | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => getGroup(id).then((d) => { setGroup(d.group); setV(d.group.settings); });
  useEffect(() => { load(); }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps
  if (!v || !group) return <Loading />;

  const fail = (e: unknown) => Alert.alert('Not allowed', errorText(e));
  const save = () => updateGroupSettings(id, v).then(() => router.back()).catch(fail);
  const archive = (on: boolean) => {
    const go = () => { setBusy(true); archiveGroup(id, on).then(load).catch(fail).finally(() => setBusy(false)); };
    if (on) ask('Archive this group?', `${group.name} disappears for everyone but its owners, and takes no new posts. You can restore it any time.`, 'Archive', go);
    else go();
  };
  const remove = () => ask('Delete this group for good?', `${group.name}, its posts, comments, events and members go, and can't be brought back.`, 'Delete', () => {
    setBusy(true);
    deleteGroup(id, name).then(() => router.replace('/connect')).catch(fail).finally(() => setBusy(false));
  });
  const archived = !!group.archivedAt;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Group settings' }} />
      {!archived && (<>
        <SettingsForm value={v} onChange={setV} />
        <Button label="Save" onPress={save} />
      </>)}

      <Card style={{ gap: 8, marginTop: 12 }}>
        <H>{archived ? 'Archived' : 'Archive or delete'}</H>
        {archived ? (<>
          <P>Archived {new Date(group.archivedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
            Only its owners see it; it takes no new posts.</P>
          <Button label="Restore the group" onPress={() => archive(false)} disabled={busy} />
          <Text style={{ fontWeight: '700', color: C.danger, marginTop: 8 }}>Delete for good</Text>
          <P muted>Its posts, comments, events and members go with it, and can’t be brought back.</P>
          <Field label={`Type the group's name (${group.name}) to delete it`} value={name} onChangeText={setName} autoCapitalize="none" />
          <Button kind="ghost" label="Delete the group" onPress={remove}
            disabled={busy || name.trim().toLowerCase() !== group.name.trim().toLowerCase()} />
        </>) : (<>
          <P muted>Archiving takes the group away from everyone but its owners and stops new posts; nothing is lost, and you can
            restore it. Once archived, it can be deleted for good.</P>
          <Button kind="ghost" label="Archive the group" onPress={() => archive(true)} disabled={busy} />
        </>)}
      </Card>
    </ScrollView>
  );
}
