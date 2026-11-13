/**
 * Profile → Notifications: which notifications reach this person's phone (everything still shows under the bell):
 * school announcements, group posts, replies, Marketplace and Volunteering as they apply to them, quiet hours, a level
 * per group, and checking that this phone gets them.
 */
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { myGroupPrefs, mySettings, setNotificationPref, updateMySettings, type GroupPref, type MySettings } from '../../src/api/connect';
import { enablePush } from '../../src/comms/push';
import { TimeField } from '../../src/forms/DateTimeField';
import { useMe } from '../../src/profile/SettingsList';
import { SCHOOL } from '../../src/school';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const LEVELS: [GroupPref['pref'], string][] = [['all', 'Everything'], ['mentions', 'Important only'], ['none', 'Off']];
const fail = (e: any) => Alert.alert('Something went wrong', e.message);

const Toggle = ({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) => (
  <View style={[s.row, { justifyContent: 'space-between', paddingVertical: 4 }]}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontWeight: '600', color: C.ink, fontSize: 16 }}>{label}</Text>
      {!!hint && <P muted>{hint}</P>}
    </View>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: C.primary }} accessibilityLabel={label} />
  </View>
);

export default function NotificationSettings() {
  const [me] = useMe();
  const [settings, setSettings] = useState<MySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quiet, setQuiet] = useState({ on: false, start: '21:00', end: '07:00' });
  const [groups, setGroups] = useState<GroupPref[]>([]);
  const [device, setDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.allSettled([mySettings(), myGroupPrefs()]).then(([st, gp]) => {
      if (st.status === 'fulfilled') {
        setSettings(st.value);
        setQuiet({ on: !!st.value.quietStart, start: st.value.quietStart ?? '21:00', end: st.value.quietEnd ?? '07:00' });
      } else {
        setError(st.reason?.message ?? 'Notification settings are unavailable right now.');
      }
      if (gp.status === 'fulfilled') setGroups(gp.value);
    });
  }, []);

  const header = <Stack.Screen options={{ title: 'Notifications' }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>{`Notification settings couldn't load: ${error}`}</P></Card></View>;
  if (!settings || me === undefined) return <>{header}<Loading /></>;

  // Family accounts and substitutes have no groups, replies or Marketplace; students no Marketplace or Volunteer.
  const role = me?.schoolRole;
  const family = role === 'family';
  const sub = role === 'substitute';
  const adult = role !== 'student' && !family && !sub;
  const save = (next: MySettings) => {
    setBusy(true);
    updateMySettings(next).then(setSettings).catch(fail).finally(() => setBusy(false));
  };
  const saveQuiet = (q = quiet) => {
    if (q.on && (!TIME.test(q.start) || !TIME.test(q.end))) return Alert.alert('Quiet hours', 'Choose when quiet hours start and end.');
    const pad = (t: string) => t.padStart(5, '0');
    save({ ...settings, quietStart: q.on ? pad(q.start) : null, quietEnd: q.on ? pad(q.end) : null });
  };
  const setGroupPref = (g: GroupPref, pref: GroupPref['pref']) => {
    setNotificationPref(g.groupId, pref).then(() => setGroups((list) => list.map((x) => (x.groupId === g.groupId ? { ...x, pref } : x)))).catch(fail);
  };
  const checkDevice = () => enablePush().then((r) => {
    setDevice(r.state === 'on' ? 'Notifications are on for this phone.' : r.detail ?? 'Notifications are off for this phone.');
    if (r.state === 'denied') {
      Alert.alert('Notifications are off', `Turn on notifications for ${SCHOOL.appName} in your phone's settings.`, [
        { text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
    }
  }).catch(fail);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      <P muted>Choose what reaches your phone. Everything still shows under the bell in the app.</P>
      <Card style={{ gap: 10, opacity: busy ? 0.7 : 1 }}>
        <Toggle label="School announcements" hint="News from the school office. Urgent ones (closures, safety) always come through."
          value={settings.pushSchool} onChange={(v) => save({ ...settings, pushSchool: v })} />
        {!family && !sub && <Toggle label="Group posts" hint="Fine-tune each group below." value={settings.pushGroups}
          onChange={(v) => save({ ...settings, pushGroups: v })} />}
        {!family && !sub && <Toggle label="Replies" hint="Replies on posts you follow (your own, and ones you reply to)." value={settings.pushReplies}
          onChange={(v) => save({ ...settings, pushReplies: v })} />}
        {adult && <Toggle label="Marketplace" hint="Dibs, offers and sales on your items." value={settings.pushMarketplace}
          onChange={(v) => save({ ...settings, pushMarketplace: v })} />}
        {(adult || family) && <Toggle label="Volunteering" hint="Sign-ups and changes to opportunities." value={settings.pushVolunteer}
          onChange={(v) => save({ ...settings, pushVolunteer: v })} />}
      </Card>

      <Card style={{ gap: 10 }}>
        <Toggle label="Quiet hours" hint="No notifications overnight (urgent school announcements still come through)." value={quiet.on}
          onChange={(on) => { const q = { ...quiet, on }; setQuiet(q); saveQuiet(q); }} />
        {quiet.on && (
          <>
            <View style={s.row}>
              <TimeField label="From" value={quiet.start} onChange={(start) => setQuiet({ ...quiet, start })} style={{ flex: 1, minWidth: 0 }} />
              <TimeField label="Until" value={quiet.end} onChange={(end) => setQuiet({ ...quiet, end })} style={{ flex: 1, minWidth: 0 }} />
            </View>
            <Button kind="ghost" label="Save quiet hours" disabled={busy} onPress={() => saveQuiet()} />
          </>
        )}
      </Card>

      {groups.length > 0 && (
        <Card style={{ gap: 4 }}>
          <H>Your groups</H>
          <P muted>{'"Important only" still sends announcements and urgent posts.'}</P>
          {groups.map((g) => (
            <View key={g.groupId} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, opacity: settings.pushGroups ? 1 : 0.5 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>{g.icon} {g.name}</Text>
              <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
                {LEVELS.map(([k, l]) => (
                  <Text key={k} onPress={() => setGroupPref(g, k)} accessibilityRole="button" accessibilityState={{ selected: g.pref === k }}
                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                      backgroundColor: g.pref === k ? C.primary : '#fff', color: g.pref === k ? '#fff' : C.ink, fontSize: 13 }}>{l}</Text>
                ))}
              </View>
            </View>
          ))}
        </Card>
      )}

      {Platform.OS !== 'web' && (
        <Card>
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={checkDevice} accessibilityRole="button">Check notifications on this phone</Text>
          {!!device && <P muted>{device}</P>}
        </Card>
      )}
    </ScrollView>
  );
}
