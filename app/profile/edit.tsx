/** Profile → Name & photo: the profile photo everyone at school sees (take, choose or remove it) and your name. */
import { useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { removeMyAvatar, session, updateMyName, uploadMyAvatar, type Person } from '../../src/api/connect';
import { pickSquarePhoto } from '../../src/photos';
import { useMe } from '../../src/profile/SettingsList';
import { SCHOOL } from '../../src/school';
import { Avatar, Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

export default function EditProfile() {
  const [me, reload] = useMe();
  const header = <Stack.Screen options={{ title: 'Name & photo' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me) return <View style={[s.screen, s.pad]}>{header}<Card><P>Sign in to set up your profile.</P></Card></View>;
  return <>{header}<Form me={me} reload={reload} /></>;
}

/** The photo and the name fields, starting from what's saved. */
function Form({ me, reload }: { me: Person; reload: () => void }) {
  const [first, setFirst] = useState(me.firstName);
  const [last, setLast] = useState(me.lastName);
  const [busy, setBusy] = useState<'photo' | 'name' | null>(null);

  const step = async (what: 'photo' | 'name', fn: () => Promise<unknown>) => {
    setBusy(what);
    try { await fn(); reload(); } catch (e: any) { Alert.alert('Something went wrong', e.message); } finally { setBusy(null); }
  };
  const pickPhoto = (camera: boolean) => step('photo', async () => {
    const base64 = await pickSquarePhoto(camera);
    if (base64) await uploadMyAvatar(base64);
  });
  const saveName = () => step('name', async () => {
    await updateMyName(first, last);
    await session({ refresh: true });
    Alert.alert('Saved', 'Your name is updated.');
  });
  const unchanged = first.trim() === me.firstName && last.trim() === me.lastName;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
        <Avatar person={me} size={120} />
        <View style={[s.row, { flexWrap: 'wrap', justifyContent: 'center', gap: 18 }]}>
          {busy === 'photo' ? <Loading /> : (
            <>
              {Platform.OS !== 'web' && <Text style={link} onPress={() => pickPhoto(true)} accessibilityRole="button">Take photo</Text>}
              <Text style={link} onPress={() => pickPhoto(false)} accessibilityRole="button">{me.avatar ? 'Change photo' : 'Add a photo'}</Text>
              {!!me.avatar && (
                <Text style={[link, { color: C.danger }]} accessibilityRole="button"
                  onPress={() => step('photo', removeMyAvatar)}>Remove</Text>
              )}
            </>
          )}
        </View>
        <P muted>Everyone at school who uses {SCHOOL.connectName} can see your photo.</P>
      </Card>
      <Card>
        <H>Name</H>
        <View style={s.row}>
          <Field label="First name" autoComplete="given-name" textContentType="givenName" value={first} onChangeText={setFirst} style={{ flex: 1, minWidth: 0 }} />
          <Field label="Last name" autoComplete="family-name" textContentType="familyName" value={last} onChangeText={setLast} style={{ flex: 1, minWidth: 0 }} />
        </View>
        <Button label={busy === 'name' ? 'Saving…' : 'Save name'} onPress={saveName} disabled={!!busy || !first.trim() || !last.trim() || unchanged} />
      </Card>
    </ScrollView>
  );
}

const link = { color: C.primary, fontWeight: '700', fontSize: 16 } as const;
