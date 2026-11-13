/**
 * Profile → Emergency alerts (teachers, staff and substitutes): whether critical alerts can ring loud on this phone,
 * and sharing where you are with your answer (src/alerts/EmergencyAlertsCard.tsx, AlertLocationCard.tsx).
 */
import { Platform, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { AlertLocationCard } from '../../src/alerts/AlertLocationCard';
import { EmergencyAlertsCard } from '../../src/alerts/EmergencyAlertsCard';
import { isSchoolStaff } from '../../src/api/connect';
import { useMe } from '../../src/profile/SettingsList';
import { Card, Loading, P, s } from '../../src/ui';

export default function AlertSettings() {
  const [me] = useMe();
  const header = <Stack.Screen options={{ title: 'Emergency alerts' }} />;
  if (me === undefined) return <>{header}<Loading /></>;
  if (!me || !(isSchoolStaff(me) || me.schoolRole === 'substitute')) {
    return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Emergency alerts are for teachers, staff and substitutes.</P></Card></View>;
  }
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {header}
      <P muted>Critical alerts (an active threat, severe weather, a dangerous situation) ring even when your phone is on silent, once these are set up.</P>
      {Platform.OS === 'web' && <Card><P muted>{"Set up loud alerts on your phone, in the app's Profile tab."}</P></Card>}
      <EmergencyAlertsCard />
      <AlertLocationCard />
    </ScrollView>
  );
}
