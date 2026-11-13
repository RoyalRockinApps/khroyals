/**
 * The Profile tab (My profile): who you are at the top (photo, name, role; tap to change), then a short menu like a
 * phone's Settings (src/profile/SettingsList.tsx), each row saying what's set now and opening its own screen:
 * You (Name & photo, My children, My vehicles), Notifications (what reaches your phone; Emergency alerts for staff),
 * School (About the school's website pages, Send feedback), then Sign out, Delete my account and the app's version.
 * Demo builds (no server) show the demo person; saving needs the server.
 */
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import {
  ROLE_LABELS, isSchoolStaff, live, mySettings, myVehicles, signOut, type MySettings, type Vehicle,
} from '../../src/api/connect';
import { forgetCarPass } from '../../src/carline/carPass';
import { disableAutoCheckIn } from '../../src/carline/autoCheckIn';
import { vehicleLabel } from '../../src/carline/vehicles';
import { DeleteAccount } from '../../src/comms/DeleteAccount';
import { disablePush } from '../../src/comms/push';
import { timeLabel } from '../../src/forms/dates';
import { Group, Row, useMe } from '../../src/profile/SettingsList';
import { SCHOOL } from '../../src/school';
import { Avatar, Button, C, Card, Loading, P, s } from '../../src/ui';

// The iPhone app is always version 1.0, so its build number tells builds apart.
const ios = Constants.expoConfig?.ios;
const VERSION = Platform.OS === 'ios' && ios?.version ? `${ios.version}${ios.buildNumber ? ` (${ios.buildNumber})` : ''}` : Constants.expoConfig?.version;

export default function Profile() {
  const [me] = useMe();
  const [settings, setSettings] = useState<MySettings | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  // What each row says is set now, fresh whenever the tab comes back into view.
  useFocusEffect(useCallback(() => {
    mySettings().then(setSettings).catch(() => {});
    myVehicles().then(setVehicles).catch(() => {});
  }, []));

  if (me === undefined) return <Loading />;
  if (!me) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.pad}>
        <Card><P>Log in on the Connect tab to set up your profile.</P><Button label="Go to Connect" onPress={() => router.replace('/connect')} /></Card>
        <Group><Row first icon="school" tint={C.primary} title={`About ${SCHOOL.name}`} sub="Website pages, contact details" onPress={() => router.push('/about')} /></Group>
      </ScrollView>
    );
  }

  // Family accounts and substitutes have no children to manage; Family accounts and staff pick children up.
  const family = me.schoolRole === 'family';
  const sub = me.schoolRole === 'substitute';
  const adult = me.schoolRole !== 'student' && !family && !sub;
  const drives = !me.pending && (adult || family);
  const alerts = isSchoolStaff(me) || sub;
  const quiet = settings?.quietStart && settings.quietEnd ? `Quiet hours ${timeLabel(settings.quietStart)} – ${timeLabel(settings.quietEnd)}` : null;
  const role = `${ROLE_LABELS[me.schoolRole] ?? me.schoolRole}${me.grade != null ? ` · grade ${me.grade}` : ''}`;
  const leave = () => disablePush().then(disableAutoCheckIn).then(forgetCarPass).then(signOut).then(() => router.replace('/connect'));

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 18 }]}>
      <Pressable onPress={() => router.push('/profile/edit')} accessibilityRole="button" accessibilityLabel={`${me.firstName} ${me.lastName}, ${role}. Change name or photo`}
        style={({ pressed }) => [{ alignItems: 'center', gap: 6, paddingTop: 8 }, pressed && { opacity: 0.8 }]}>
        <View>
          <Avatar person={me} size={104} />
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary,
            borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: C.ink, marginTop: 4 }}>{me.firstName} {me.lastName}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.primary }}>{role}</Text>
        {!!me.email && <Text style={{ color: C.muted }}>{me.email}</Text>}
      </Pressable>

      <Group title="You">
        <Row first icon="person" tint="#2563EB" title="Name & photo" sub="What everyone at school sees" onPress={() => router.push('/profile/edit')} />
        {adult && <Row icon="people" tint="#7C3AED" title="My children" sub="Photos, birthdays, allergies" onPress={() => router.push('/children')} />}
        {drives && (
          <Row icon="car" tint="#0F766E" title="My vehicles"
            sub={vehicles?.length ? `${vehicleLabel(vehicles[0])}${vehicles.length > 1 ? ` and ${vehicles.length - 1} more` : ''}` : 'What you drive to pickup'}
            onPress={() => router.push('/profile/vehicles')} />
        )}
      </Group>

      <Group title="Notifications">
        <Row first icon="notifications" tint="#DC2626" title="Notifications" sub={quiet ?? 'What reaches your phone'}
          onPress={() => router.push('/profile/notifications')} />
        {alerts && <Row icon="warning" tint="#B45309" title="Emergency alerts" sub="Loud alerts, your location" onPress={() => router.push('/profile/alerts')} />}
      </Group>

      <Group title={SCHOOL.name}>
        <Row first icon="school" tint={C.primary} title={`About ${SCHOOL.name}`} sub="Website and contact details" onPress={() => router.push('/about')} />
        {!me.pending && <Row icon="chatbubble-ellipses" tint="#059669" title="Send feedback" sub="A problem or an idea" onPress={() => router.push('/feedback')} />}
      </Group>

      <Group>
        <Row first icon="log-out" tint="#64748B" title="Sign out" onPress={leave} danger />
      </Group>
      {live && <DeleteAccount person={me} onDone={() => router.replace('/connect')} />}
      {!!VERSION && <Text style={{ textAlign: 'center', color: C.muted, fontSize: 12 }}>{SCHOOL.appName} {VERSION}</Text>}
    </ScrollView>
  );
}
