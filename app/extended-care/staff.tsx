/**
 * Extended care staff (Extended care → the header gear), for the office (people.family or checkin.manage, behind the
 * authenticator check): every teacher and staff member, with a switch for whether they run extended care. Extended care
 * staff get Extended care in Classes and run its daily check-out list.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { ROLE_LABELS, errorText, extendedCareStaff, setExtendedCareStaff, type ExtendedCareStaff } from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import { C, Card, Loading, P, s } from '../../src/ui';

export default function ExtendedCareStaffScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Extended care staff' }} />
      <MfaGate>{(access) => ['people.family', 'checkin.manage'].some((x) => access.permissions.includes(x))
        ? <StaffList />
        : <View style={[s.screen, s.pad]}><P>Choosing extended care staff is for the front office.</P></View>}
      </MfaGate>
    </>
  );
}

function StaffList() {
  const [people, setPeople] = useState<ExtendedCareStaff[] | null>(null);
  const load = useCallback(() => { extendedCareStaff().then(setPeople).catch((e) => { setPeople([]); Alert.alert('Extended care staff', errorText(e)); }); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!people) return <Loading />;

  const flip = async (p: ExtendedCareStaff) => {
    setPeople(people.map((x) => (x.id === p.id ? { ...x, on: !p.on } : x)));
    try { await setExtendedCareStaff(p.id, !p.on); } catch (e) { Alert.alert('Extended care staff', errorText(e)); load(); }
  };
  const on = people.filter((p) => p.on).length;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <P muted>{on ? `${on} ${on === 1 ? 'person runs' : 'people run'} extended care.` : 'Nobody runs extended care yet.'} They check students out of extended care to someone on each child’s pickup list.</P>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {people.map((p, i) => (
          <View key={p.id} style={[s.row, { gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{p.name}</Text>
              <Text style={{ color: C.muted }}>{ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role}</Text>
            </View>
            <Switch value={p.on} onValueChange={() => flip(p)} accessibilityLabel={`${p.name} runs extended care`} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
